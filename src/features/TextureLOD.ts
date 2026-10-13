import { tr as uiText } from '../i18n';
// Texture LOD — reduz a resolução da textura por distância da câmera, e
// descarrega-a completamente (liberta VRAM) quando o material não está
// visível no frustum da câmera.
// Otimizações: cache material→meshes (evita travessia completa a cada
// update), distâncias ao quadrado (evita sqrt), reuso de objetos.
import * as THREE from 'three';
import { TEXTURE_LOD } from '../constants';
import { conflictingTextureLodSlots, materialPropertiesForTextureSlot } from '../materials/MaterialInputs';
import {
    attachCompactUdimAtlas,
    detachCompactUdimAtlas,
    getCompactUdimAtlasMetadata,
    type CompactUdimAtlasMetadata,
    type CompactUdimTextureSlot,
} from '../materials/CompactUdimAtlas';

type Tier = 'full' | 'half' | 'quarter' | 'unloaded';

interface LODEntry {
    material: THREE.MeshStandardMaterial;
    slotProp: string;
    targetProps: string[];
    sourceTexture: THREE.Texture;
    currentTexture: THREE.Texture | null;
    canvas: HTMLCanvasElement | null;
    width: number;
    height: number;
    currentTier: Tier | null;
    params: {
        colorSpace: string;
        wrapS: THREE.Wrapping;
        wrapT: THREE.Wrapping;
        repeat: THREE.Vector2;
        offset: THREE.Vector2;
        flipY: boolean;
        anisotropy: number;
        minFilter: THREE.MinificationTextureFilter;
        magFilter: THREE.MagnificationTextureFilter;
        generateMipmaps: boolean;
    };
    atlasMetadata?: Record<'full' | 'half' | 'quarter', CompactUdimAtlasMetadata>;
}

interface MeshCacheEntry {
    meshes: THREE.Mesh[];
    minDistSq: number;
    visible: boolean;
}

const registry = new Map<string, LODEntry>();
interface ProgressiveStreamEntry {
    availableResolutions: number[];
    currentResolution: number;
    desiredResolution: number;
    loading: boolean;
    failedResolution: number | null;
    failures: number;
    retryAfter: number;
    request: (targetResolution: number) => Promise<number>;
}

const progressiveStreams = new Map<string, ProgressiveStreamEntry>();
const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();
const sphereScratch = new THREE.Sphere();

const materialMeshCache = new Map<string, MeshCacheEntry>();
let lastModelUuid: string | null = null;
// Only the active reduced tier owns a canvas; full reuses the decoded source.
// The budget is shared by all materials/viewers, including temporary switches.
const MAX_LOD_CANVAS_BYTES = 128 * 1024 * 1024;
const MAX_STREAM_FAILURES = 3;
let lodCanvasBytes = 0;

function imageToCanvas(img: TexImageSource, w: number, h: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    try {
        const context = canvas.getContext('2d');
        if (!context) throw new Error(uiText("Canvas LOD indisponível."));
        context.drawImage(img as CanvasImageSource, 0, 0, w, h);
        return canvas;
    } catch (error) {
        canvas.width = canvas.height = 0;
        throw error;
    }
}

function scaledAtlasMetadata(
    metadata: CompactUdimAtlasMetadata,
    divisor: 1 | 2 | 4,
): CompactUdimAtlasMetadata {
    if (divisor === 1) return metadata;
    const tileResolution = Math.max(1, Math.floor(metadata.tileResolution / divisor));
    const gutter = metadata.gutter === 0 ? 0 : Math.max(1, Math.floor(metadata.gutter / divisor));
    const stride = tileResolution + gutter * 2;
    return {
        ...metadata,
        version: `${String(metadata.version)}@lod-${divisor}`,
        atlasWidth: metadata.columns * stride,
        atlasHeight: metadata.rows * stride,
        tileResolution,
        gutter,
    };
}

export function registerTextureForLOD(material: THREE.MeshStandardMaterial, slotProp: string, texture: THREE.Texture): boolean {
    const isCompressed = (texture as unknown as { isCompressedTexture?: boolean }).isCompressedTexture;
    const img = texture.image as { width?: number; height?: number } | undefined;
    if (isCompressed || !img || !Number.isFinite(img.width) || !Number.isFinite(img.height)
        || !img.width || !img.height || img.width < 1 || img.height < 1) return false;

    const key = `${material.uuid}:${slotProp}`;
    unregisterEntry(key);

    const targetProps = materialPropertiesForTextureSlot(slotProp).map(String);
    if (targetProps.length === 0) return false;
    const sourceAtlasMetadata = getCompactUdimAtlasMetadata(texture);
    const atlasMetadata = sourceAtlasMetadata ? {
        full: scaledAtlasMetadata(sourceAtlasMetadata, 1),
        half: scaledAtlasMetadata(sourceAtlasMetadata, 2),
        quarter: scaledAtlasMetadata(sourceAtlasMetadata, 4),
    } : undefined;

    registry.set(key, {
        material,
        slotProp,
        targetProps,
        sourceTexture: texture,
        currentTexture: texture,
        canvas: null,
        width: img.width,
        height: img.height!,
        currentTier: 'full',
        params: {
            colorSpace: texture.colorSpace,
            wrapS: texture.wrapS,
            wrapT: texture.wrapT,
            repeat: texture.repeat.clone(),
            offset: texture.offset.clone(),
            flipY: texture.flipY,
            anisotropy: texture.anisotropy,
            minFilter: texture.minFilter,
            magFilter: texture.magFilter,
            generateMipmaps: texture.generateMipmaps,
        },
        atlasMetadata,
    });

    return true;
}

export function unregisterMaterialLOD(material: THREE.Material) {
    invalidateLODCache();
    registry.forEach((entry, key) => {
        if (entry.material === material) unregisterEntry(key);
    });
    for (const key of progressiveStreams.keys()) {
        if (key.startsWith(`${material.uuid}:`)) progressiveStreams.delete(key);
    }
}

export function unregisterSlotLOD(material: THREE.Material, slotProp: string) {
    for (const conflictingSlot of conflictingTextureLodSlots(slotProp)) {
        unregisterEntry(`${material.uuid}:${conflictingSlot}`);
    }
}

export function clearAllTextureLOD() {
    invalidateLODCache();
    frameCounter = 0;
    registry.forEach((_, key) => unregisterEntry(key));
    progressiveStreams.clear();
}

/**
 * Connects persisted/network tiers to the existing distance LOD decision.
 * TextureLOD remains the only quality manager: it asks for higher stored bytes
 * only when its current full/half/quarter state needs them.
 */
export function registerProgressiveTextureStream(
    material: THREE.MeshStandardMaterial,
    slotProp: string,
    availableResolutions: readonly number[],
    currentResolution: number,
    request: (targetResolution: number) => Promise<number>,
) {
    const tiers = [...new Set(availableResolutions)]
        .filter((value) => Number.isFinite(value) && value > 0)
        .toSorted((left, right) => left - right);
    if (tiers.length < 2) return;
    progressiveStreams.set(`${material.uuid}:${slotProp}`, {
        availableResolutions: tiers,
        currentResolution,
        desiredResolution: currentResolution,
        loading: false,
        failedResolution: null,
        failures: 0,
        retryAfter: 0,
        request,
    });
}

function storedTargetForLod(stream: ProgressiveStreamEntry, tier: Tier): number {
    const highest = stream.availableResolutions[stream.availableResolutions.length - 1];
    const cap = tier === 'full' ? highest : tier === 'half' ? highest / 2 : highest / 4;
    const candidates = stream.availableResolutions.filter((resolution) => resolution <= cap);
    return candidates[candidates.length - 1] ?? stream.availableResolutions[0];
}

function requestStoredTarget(key: string, tier: Tier) {
    if (tier === 'unloaded') return;
    const stream = progressiveStreams.get(key);
    if (!stream) return;
    stream.desiredResolution = storedTargetForLod(stream, tier);
    if (stream.loading || stream.currentResolution >= stream.desiredResolution) return;
    if (stream.failedResolution === stream.desiredResolution
        && (stream.failures >= MAX_STREAM_FAILURES || performance.now() < stream.retryAfter)) return;

    stream.loading = true;
    const target = stream.desiredResolution;
    const failed = () => {
        if (progressiveStreams.get(key) !== stream) return;
        stream.failures = stream.failedResolution === target ? stream.failures + 1 : 1;
        stream.failedResolution = target;
        stream.retryAfter = performance.now() + 1_000 * 2 ** (stream.failures - 1);
    };
    void Promise.resolve().then(() => stream.request(target))
        .then((loaded) => {
            if (progressiveStreams.get(key) !== stream) return;
            if (!Number.isFinite(loaded) || loaded <= stream.currentResolution) {
                failed();
                return;
            }
            stream.currentResolution = loaded;
            stream.failedResolution = null;
            stream.failures = 0;
            stream.retryAfter = 0;
            return undefined;
        })
        .catch((error) => {
            failed();
            if (import.meta.env.DEV) console.warn('[TextureLOD] Falha ao obter tier persistido:', error);
        })
        .finally(() => {
            stream.loading = false;
            // Retry only from a later scene frame, with backoff and a limit.
            // Recursive promise retries can starve rendering after one failure.
        });
}

function releaseCanvas(entry: LODEntry) {
    if (!entry.canvas) return;
    lodCanvasBytes -= entry.canvas.width * entry.canvas.height * 4;
    entry.canvas.width = entry.canvas.height = 0;
    entry.canvas = null;
}

function unregisterEntry(key: string) {
    const entry = registry.get(key);
    if (!entry) return;
    if (entry.atlasMetadata) {
        detachCompactUdimAtlas(
            entry.material,
            entry.targetProps as CompactUdimTextureSlot[],
        );
    }
    for (const texture of new Set([entry.sourceTexture, entry.currentTexture])) texture?.dispose();
    releaseCanvas(entry);
    registry.delete(key);
}

function applyTier(key: string, tier: Tier) {
    const entry = registry.get(key);
    if (!entry || entry.currentTier === tier) return;
    let texture: THREE.Texture | null = null;
    let canvas: HTMLCanvasElement | null = null;
    if (tier === 'full') {
        texture = entry.sourceTexture;
        // dispose() frees the GPU allocation when going far/off-screen. The
        // retained source can be uploaded again without another full canvas.
        texture.needsUpdate = true;
    } else if (tier !== 'unloaded') {
        const divisor = tier === 'half' ? 2 : 4;
        const width = entry.atlasMetadata?.[tier].atlasWidth ?? Math.max(1, Math.floor(entry.width / divisor));
        const height = entry.atlasMetadata?.[tier].atlasHeight ?? Math.max(1, Math.floor(entry.height / divisor));
        if (lodCanvasBytes + width * height * 4 > MAX_LOD_CANVAS_BYTES) return;
        try {
            canvas = imageToCanvas(entry.sourceTexture.image as TexImageSource, width, height);
        } catch {
            // Keep the visible tier if the device cannot allocate a replacement.
            return;
        }
        texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = entry.params.colorSpace;
        texture.wrapS = entry.params.wrapS;
        texture.wrapT = entry.params.wrapT;
        texture.repeat.copy(entry.params.repeat);
        texture.offset.copy(entry.params.offset);
        texture.flipY = entry.params.flipY;
        texture.anisotropy = entry.params.anisotropy;
        texture.minFilter = entry.params.minFilter;
        texture.magFilter = entry.params.magFilter;
        texture.generateMipmaps = entry.params.generateMipmaps;
    }

    const metadata = tier === 'unloaded' ? undefined : entry.atlasMetadata?.[tier];
    if (texture && metadata) {
        attachCompactUdimAtlas(
            entry.material,
            entry.targetProps as CompactUdimTextureSlot[],
            texture,
            metadata,
        );
    } else {
        if (entry.atlasMetadata) {
            detachCompactUdimAtlas(entry.material, entry.targetProps as CompactUdimTextureSlot[]);
        }
        entry.targetProps.forEach((p) => { (entry.material as unknown as Record<string, unknown>)[p] = texture; });
    }
    if (entry.currentTexture !== texture) entry.currentTexture?.dispose();
    releaseCanvas(entry);
    entry.currentTexture = texture;
    entry.currentTier = tier;
    entry.canvas = canvas;
    if (canvas) lodCanvasBytes += canvas.width * canvas.height * 4;
    entry.material.needsUpdate = true;
}

/** Decoded source bytes are estimates; canvas bytes are the live LOD allocations. */
export function getTextureLODMemoryStats() {
    let sourceBytes = 0;
    registry.forEach((entry) => { sourceBytes += entry.width * entry.height * 4; });
    return { sourceBytes, canvasBytes: lodCanvasBytes, maxCanvasBytes: MAX_LOD_CANVAS_BYTES };
}

export function invalidateLODCache() {
    materialMeshCache.clear();
    lastModelUuid = null;
}

function buildMaterialMeshCache(model: THREE.Object3D | null) {
    materialMeshCache.clear();
    if (!model) return;

    model.traverse((child) => {
        const mesh = child as THREE.Mesh & { userData: { origMaterial?: THREE.Material | THREE.Material[]; isWireframeMarker?: boolean } };
        if (!mesh.isMesh || mesh.userData.isWireframeMarker || !mesh.geometry) return;

        const origMaterial = mesh.userData.origMaterial || mesh.material;
        const mats = Array.isArray(origMaterial) ? origMaterial : [origMaterial];

        mats.forEach((mat) => {
            if (!mat) return;
            const entry = materialMeshCache.get(mat.uuid);
            if (!entry) {
                materialMeshCache.set(mat.uuid, { meshes: [mesh], minDistSq: Infinity, visible: false });
            } else {
                entry.meshes.push(mesh);
            }
        });
    });
}

let frameCounter = 0;

export function updateTextureLOD(model: THREE.Object3D | null, camera: THREE.Camera | null) {
    if (registry.size === 0 || !model || !camera) return;

    const currentModelUuid = model.uuid;
    if (currentModelUuid !== lastModelUuid) {
        buildMaterialMeshCache(model);
        lastModelUuid = currentModelUuid;
    }

    frameCounter++;
    if (frameCounter % TEXTURE_LOD.updateIntervalFrames !== 0) return;

    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const cameraPos = camera.position;

    materialMeshCache.forEach((entry) => {
        entry.minDistSq = Infinity;
        entry.visible = false;
    });

    const registeredMaterials = new Set<string>();
    registry.forEach((entry) => registeredMaterials.add(entry.material.uuid));

    materialMeshCache.forEach((entry, matUuid) => {
        if (!registeredMaterials.has(matUuid)) return;

        for (const child of entry.meshes) {
            if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere();
            if (!child.geometry.boundingSphere) continue;

            sphereScratch.copy(child.geometry.boundingSphere).applyMatrix4(child.matrixWorld);

            const dx = sphereScratch.center.x - cameraPos.x;
            const dy = sphereScratch.center.y - cameraPos.y;
            const dz = sphereScratch.center.z - cameraPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < entry.minDistSq) entry.minDistSq = distSq;
            if (frustum.intersectsSphere(sphereScratch)) entry.visible = true;
        }
    });

    const nearSq = (TEXTURE_LOD.nearDistance + 2.0) ** 2;
    const nearSqInner = (TEXTURE_LOD.nearDistance - 2.0) ** 2;
    const farSq = (TEXTURE_LOD.farDistance + 2.0) ** 2;
    const farSqInner = (TEXTURE_LOD.farDistance - 2.0) ** 2;

    registry.forEach((entry, key) => {
        const cacheEntry = materialMeshCache.get(entry.material.uuid);
        // Cada visor atualiza apenas os seus materiais. Os materiais de outro
        // visor não constam deste cache e devem manter a textura carregada.
        if (!cacheEntry) return;
        if (!cacheEntry.visible) {
            applyTier(key, 'unloaded');
            return;
        }

        const distSq = cacheEntry.minDistSq;
        const currentTier = entry.currentTier;
        let desiredTier: Tier = currentTier ?? 'full';

        if (currentTier === 'full') {
            if (distSq > nearSq) desiredTier = 'half';
        } else if (currentTier === 'half') {
            if (distSq < nearSqInner) desiredTier = 'full';
            else if (distSq > farSq) desiredTier = 'quarter';
        } else if (currentTier === 'quarter') {
            if (distSq < farSqInner) desiredTier = 'half';
        } else if (currentTier === 'unloaded') {
            if (distSq > farSq) desiredTier = 'quarter';
            else if (distSq > nearSq) desiredTier = 'half';
            else desiredTier = 'full';
        }
        applyTier(key, desiredTier);
        // A refused canvas allocation must not turn distant quality demand
        // into a full-resolution network upgrade just because full stayed bound.
        requestStoredTarget(key, desiredTier);
    });
}

export interface TextureLODSummary {
    full: number;
    half: number;
    quarter: number;
    unloaded: number;
    total: number;
}

export function getTextureLODSummary(): TextureLODSummary {
    const summary: TextureLODSummary = { full: 0, half: 0, quarter: 0, unloaded: 0, total: registry.size };
    registry.forEach((entry) => {
        if (entry.currentTier) summary[entry.currentTier]++;
    });
    return summary;
}
