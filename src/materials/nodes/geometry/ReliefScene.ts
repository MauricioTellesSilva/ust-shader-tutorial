import * as THREE from 'three';
import { tr as uiText } from '../../../i18n';
import { applyWireframeDepthBias, bindWireframeSkinning, generateQuadWireframeGeometry } from '../../../features/Wireframe';
import { installDisplacementPass } from '../core/program';
import type { MaterialGraph } from '../core/types';
import { displacementSettings } from './reliefSettings';
import { estimateSubdivision, subdivisionLimit, type SubdivisionLimit } from './subdivision';
import { geometrySize, SubdivisionWorkerClient } from './workerClient';

type Overlay = THREE.Mesh | THREE.LineSegments;
interface OverlaySnapshot {
    object: Overlay;
    geometry: THREE.BufferGeometry;
    material: THREE.Material | THREE.Material[];
    morphInfluences?: number[];
    morphDictionary?: Record<string, number>;
}
interface MeshState {
    mesh: THREE.Mesh;
    original: THREE.BufferGeometry;
    generated: THREE.BufferGeometry;
    level: number;
    pendingLevel: number | null;
    baseBox: THREE.Box3;
    baseSphere: THREE.Sphere;
    overlays: OverlaySnapshot[];
    overlayGeometries: THREE.BufferGeometry[];
    overlayMaterials: THREE.Material[];
    depth: THREE.MeshDepthMaterial;
    distance: THREE.MeshDistanceMaterial;
    originalDepth: THREE.Mesh['customDepthMaterial'];
    originalDistance: THREE.Mesh['customDistanceMaterial'];
    beforeShadow: THREE.Mesh['onBeforeShadow'];
    culled: boolean;
    skinBox: THREE.Box3 | null;
    skinSphere: THREE.Sphere | null;
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
    const material = (mesh.userData.origMaterial as THREE.Material | THREE.Material[] | undefined) ?? mesh.material;
    return Array.isArray(material) ? material : [material];
}

function settingsOf(mesh: THREE.Mesh) {
    const animated = (mesh as THREE.SkinnedMesh).isSkinnedMesh || Object.values(mesh.geometry.morphAttributes).some(list => list.length > 0);
    const used = new Set(mesh.geometry.groups.map(g => g.materialIndex ?? 0));
    const materials = materialsOf(mesh);
    const settings = materials.flatMap((material, index) => {
        if (materials.length > 1 && !used.has(index)) return [];
        const graph = material.userData.ndReliefGraph as MaterialGraph | undefined;
        const setting = graph && displacementSettings(graph, animated);
        return setting ? [setting] : [];
    });
    return settings.length ? { level: Math.max(...settings.map(s => s.level)), padding: Math.max(...settings.map(s => s.padding)) } : null;
}

/** New attribute descriptors share CPU arrays and own their GPU buffers/bounds. */
function geometryView(source: THREE.BufferGeometry): THREE.BufferGeometry {
    const view = new THREE.BufferGeometry();
    const interleaved = new Map<THREE.InterleavedBuffer, THREE.InterleavedBuffer>();
    const copy = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
        let result: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
        if (attr instanceof THREE.InterleavedBufferAttribute) {
            let data = interleaved.get(attr.data);
            if (!data) {
                data = new THREE.InterleavedBuffer(attr.data.array, attr.data.stride);
                data.setUsage(attr.data.usage);
                interleaved.set(attr.data, data);
            }
            result = new THREE.InterleavedBufferAttribute(data, attr.itemSize, attr.offset, attr.normalized);
        } else {
            result = new THREE.BufferAttribute(attr.array, attr.itemSize, attr.normalized);
            result.setUsage(attr.usage);
            result.gpuType = attr.gpuType;
        }
        result.name = attr.name;
        return result;
    };
    for (const [key, attr] of Object.entries(source.attributes)) view.setAttribute(key, copy(attr));
    view.morphAttributes = Object.fromEntries(Object.entries(source.morphAttributes).map(([key, list]) => [key, list.map(copy)]));
    view.morphTargetsRelative = source.morphTargetsRelative;
    if (source.index) view.setIndex(copy(source.index) as THREE.BufferAttribute);
    view.groups = source.groups.map(g => ({ ...g }));
    view.setDrawRange(source.drawRange.start, source.drawRange.count);
    if (!view.attributes.normal) view.computeVertexNormals();
    view.computeBoundingBox();
    view.computeBoundingSphere();
    return view;
}

function limitMessage(reason: SubdivisionLimit): string {
    if (reason === 'mesh') return uiText('Subdivisão não aplicada: limite de 250 mil triângulos por malha.');
    if (reason === 'total') return uiText('Subdivisão não aplicada: limite de 1 milhão de triângulos no conjunto gerado.');
    return uiText('Subdivisão não aplicada: limite de 256 MiB de buffers gerados.');
}

export interface ReliefSceneOptions {
    notify?: (message: string) => void;
    changed?: () => void;
    worker?: SubdivisionWorkerClient;
}

/** Owns temporary geometries, shadow passes and overlays for a single viewer. */
export class ReliefScene {
    private options: ReliefSceneOptions;
    private states = new Map<THREE.Mesh, MeshState>();
    private worker: SubdivisionWorkerClient;
    private generation = 0;
    private signature = '';
    private notices = new Set<string>();

    constructor(options: ReliefSceneOptions = {}) {
        this.options = options;
        this.worker = options.worker ?? new SubdivisionWorkerClient();
    }

    update(root: THREE.Object3D | null, enabled = true): void {
        if (!root || !enabled) { this.dispose(); return; }
        const desired: { mesh: THREE.Mesh; level: number; padding: number }[] = [];
        root.traverse(object => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh || mesh.userData.isWireframeMarker) return;
            const setting = settingsOf(mesh);
            if (setting) desired.push({ mesh, ...setting });
        });
        const wanted = new Set(desired.map(d => d.mesh));
        for (const [mesh, state] of this.states) if (!wanted.has(mesh)) {
            this.restore(state);
            this.states.delete(mesh);
        }
        const used = { triangles: 0, bytes: 0 };
        for (const request of desired) if (request.level > 0) {
            const geometry = this.states.get(request.mesh)?.original ?? request.mesh.geometry;
            const estimate = estimateSubdivision(geometrySize(geometry), request.level);
            const reason = subdivisionLimit(estimate, used);
            if (reason) {
                const notice = `${request.mesh.uuid}:${request.level}:${reason}`;
                if (!this.notices.has(notice)) { this.notices.add(notice); this.options.notify?.(limitMessage(reason)); }
                request.level = 0;
            } else { used.triangles += estimate.triangles; used.bytes += estimate.bytes; }
        }
        const signature = desired.map(d => `${d.mesh.uuid}:${this.states.get(d.mesh)?.original.uuid ?? d.mesh.geometry.uuid}:${d.level}`).join('|');
        const changed = signature !== this.signature;
        if (changed) {
            this.worker.cancel();
            this.generation++;
            this.signature = signature;
        }
        const generation = this.generation;
        const jobs: { state: MeshState; level: number }[] = [];
        for (const request of desired) {
            let state = this.states.get(request.mesh);
            if (!state) {
                state = this.create(request.mesh);
                this.states.set(request.mesh, state);
            }
            if (changed) state.pendingLevel = null;
            if (state.level !== request.level && state.pendingLevel !== request.level) {
                this.setGeometry(state, geometryView(state.original), 0);
                if (request.level > 0) { state.pendingLevel = request.level; jobs.push({ state, level: request.level }); }
            }
            this.refresh(state, request.padding);
        }
        // Sequential jobs bound peak memory. Each LOD/mesh is independent;
        // shared source geometries are never mutated or detached.
        void (async () => {
            for (const { state, level } of jobs) {
                if (generation !== this.generation) return;
                try {
                    const geometry = await this.worker.run(state.original, level);
                    if (generation !== this.generation || !this.states.has(state.mesh)) { geometry.dispose(); return; }
                    this.setGeometry(state, geometry, level);
                    state.pendingLevel = null;
                    this.refresh(state, settingsOf(state.mesh)?.padding ?? 0);
                    this.options.changed?.();
                } catch {
                    if (generation !== this.generation) return;
                    state.pendingLevel = level;
                    const notice = `${state.mesh.uuid}:worker`;
                    if (!this.notices.has(notice)) { this.notices.add(notice); this.options.notify?.(uiText('Não foi possível subdividir esta malha. A geometria existente foi mantida.')); }
                }
            }
        })();
        this.options.changed?.();
    }

    private create(mesh: THREE.Mesh): MeshState {
        const skin = mesh as THREE.SkinnedMesh;
        const original = mesh.geometry;
        const generated = geometryView(original);
        const state: MeshState = { mesh, original, generated, level: 0, pendingLevel: null,
            baseBox: generated.boundingBox!.clone(), baseSphere: generated.boundingSphere!.clone(),
            overlays: mesh.children.filter(c => c.userData.isWireframeMarker && ((c as THREE.Mesh).isMesh || (c as THREE.Line).isLine))
                .map(c => { const overlay = c as Overlay; return { object: overlay, geometry: overlay.geometry, material: overlay.material,
                    morphInfluences: (overlay as THREE.Mesh).morphTargetInfluences, morphDictionary: (overlay as THREE.Mesh).morphTargetDictionary }; }),
            overlayGeometries: [], overlayMaterials: [], depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
            distance: new THREE.MeshDistanceMaterial(), originalDepth: mesh.customDepthMaterial, originalDistance: mesh.customDistanceMaterial,
            beforeShadow: Reflect.get(mesh, 'onBeforeShadow') as THREE.Mesh['onBeforeShadow'], culled: mesh.frustumCulled,
            skinBox: skin.isSkinnedMesh ? skin.boundingBox?.clone() ?? null : null, skinSphere: skin.isSkinnedMesh ? skin.boundingSphere?.clone() ?? null : null };
        mesh.geometry = generated;
        mesh.customDepthMaterial = state.depth;
        mesh.customDistanceMaterial = state.distance;
        mesh.onBeforeShadow = function (...args) {
            state.beforeShadow.call(this, ...args);
            const group = args[6] as unknown as { materialIndex?: number } | null;
            const material = materialsOf(mesh)[group?.materialIndex ?? 0] ?? null;
            installDisplacementPass(args[5], material);
        };
        if (skin.isSkinnedMesh) mesh.frustumCulled = false;
        this.rebuildOverlays(state);
        return state;
    }

    private setGeometry(state: MeshState, geometry: THREE.BufferGeometry, level: number) {
        state.generated.dispose();
        state.generated = geometry;
        state.level = level;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        state.baseBox.copy(geometry.boundingBox!);
        state.baseSphere.copy(geometry.boundingSphere!);
        state.mesh.geometry = geometry;
        const skin = state.mesh as THREE.SkinnedMesh;
        if (skin.isSkinnedMesh) {
            const bounds = skin as unknown as { boundingBox: THREE.Box3 | null; boundingSphere: THREE.Sphere | null };
            bounds.boundingBox = null; bounds.boundingSphere = null;
        }
        this.rebuildOverlays(state);
    }

    private rebuildOverlays(state: MeshState) {
        for (const material of state.overlayMaterials) material.dispose();
        for (const geometry of state.overlayGeometries) geometry.dispose();
        state.overlayMaterials = [];
        state.overlayGeometries = [];
        const sources = materialsOf(state.mesh);
        for (const snapshot of state.overlays) {
            const overlay = snapshot.object;
            const quad = overlay.name === 'wireQuads';
            overlay.geometry = quad ? generateQuadWireframeGeometry(state.generated, true) : state.generated;
            if (quad) state.overlayGeometries.push(overlay.geometry);
            const base = Array.isArray(snapshot.material) ? snapshot.material[0] : snapshot.material;
            const materials = sources.map(() => {
                const material = quad ? new THREE.LineBasicMaterial().copy(base as THREE.LineBasicMaterial) : new THREE.MeshBasicMaterial().copy(base as THREE.MeshBasicMaterial);
                applyWireframeDepthBias(material);
                state.overlayMaterials.push(material);
                return material;
            });
            overlay.material = sources.length > 1 ? materials : materials[0];
            (overlay as THREE.Mesh).morphTargetInfluences = state.mesh.morphTargetInfluences;
            (overlay as THREE.Mesh).morphTargetDictionary = state.mesh.morphTargetDictionary;
            if (quad && (state.mesh as THREE.SkinnedMesh).isSkinnedMesh) bindWireframeSkinning(overlay as THREE.LineSegments, state.mesh as THREE.SkinnedMesh);
        }
    }

    private refresh(state: MeshState, padding: number) {
        state.mesh.userData.ndDisplacementPadding = padding;
        state.generated.boundingBox!.copy(state.baseBox).expandByScalar(padding);
        state.generated.boundingSphere!.copy(state.baseSphere);
        state.generated.boundingSphere!.radius += padding;
        const sources = materialsOf(state.mesh);
        // Shadow callbacks select the correct source for every material group.
        installDisplacementPass(state.depth, sources[0] ?? null);
        installDisplacementPass(state.distance, sources[0] ?? null);
        let at = 0;
        for (let overlay = 0; overlay < state.overlays.length; overlay++) for (const source of sources) installDisplacementPass(state.overlayMaterials[at++], source);
    }

    private restore(state: MeshState) {
        state.mesh.geometry = state.original;
        state.mesh.customDepthMaterial = state.originalDepth;
        state.mesh.customDistanceMaterial = state.originalDistance;
        state.mesh.onBeforeShadow = state.beforeShadow;
        state.mesh.frustumCulled = state.culled;
        delete state.mesh.userData.ndDisplacementPadding;
        const skin = state.mesh as THREE.SkinnedMesh;
        if (skin.isSkinnedMesh) {
            const bounds = skin as unknown as { boundingBox: THREE.Box3 | null; boundingSphere: THREE.Sphere | null };
            bounds.boundingBox = state.skinBox; bounds.boundingSphere = state.skinSphere;
        }
        for (const snapshot of state.overlays) {
            snapshot.object.geometry = snapshot.geometry;
            snapshot.object.material = snapshot.material;
            (snapshot.object as THREE.Mesh).morphTargetInfluences = snapshot.morphInfluences;
            (snapshot.object as THREE.Mesh).morphTargetDictionary = snapshot.morphDictionary;
        }
        state.generated.dispose();
        for (const geometry of state.overlayGeometries) geometry.dispose();
        for (const material of state.overlayMaterials) material.dispose();
        state.depth.dispose();
        state.distance.dispose();
    }

    dispose(): void {
        this.generation++;
        this.worker.cancel();
        for (const state of this.states.values()) this.restore(state);
        this.states.clear();
        this.signature = '';
        this.notices.clear();
    }

    release(object: THREE.Object3D): void {
        const removed = new Set<THREE.Object3D>();
        object.traverse(child => removed.add(child));
        if (![...this.states.keys()].some(mesh => removed.has(mesh))) return;
        this.generation++;
        this.worker.cancel();
        this.signature = '';
        for (const [mesh, state] of this.states) {
            state.pendingLevel = null;
            if (removed.has(mesh)) { this.restore(state); this.states.delete(mesh); }
        }
    }

    get empty(): boolean { return this.states.size === 0; }
}

const scenes = new WeakMap<THREE.Object3D, ReliefScene>();
const activeScenes = new Set<ReliefScene>();

export function syncReliefScene(root: THREE.Object3D | null, enabled = true, options: ReliefSceneOptions = {}): void {
    if (!root) return;
    let scene = scenes.get(root);
    if (!scene && enabled) { scene = new ReliefScene(options); scenes.set(root, scene); }
    if (!scene) return;
    scene.update(root, enabled);
    if (scene.empty) activeScenes.delete(scene);
    else activeScenes.add(scene);
}

/** Called before normal scene disposal, restoring originals for the disposer. */
export function disposeReliefForObject(object: THREE.Object3D): void {
    for (const scene of activeScenes) {
        scene.release(object);
        if (scene.empty) activeScenes.delete(scene);
    }
    const own = scenes.get(object);
    if (own) { own.dispose(); activeScenes.delete(own); scenes.delete(object); }
}
