import * as THREE from 'three';
import { subdivisionTransfers, type SubdivisionAttribute, type SubdivisionData, type SubdivisionSize } from './subdivision';

export function geometrySize(geometry: THREE.BufferGeometry): SubdivisionSize {
    const attributes = [...Object.values(geometry.attributes), ...Object.values(geometry.morphAttributes).flat()];
    return { vertices: geometry.attributes.position?.count ?? 0,
        triangles: (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3,
        components: attributes.reduce((sum, a) => sum + a.itemSize, 0) + (geometry.attributes.normal ? 0 : 3) };
}

export function serializeGeometry(geometry: THREE.BufferGeometry): SubdivisionData {
    const serialize = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): SubdivisionAttribute => {
        const array = new Float32Array(attr.count * attr.itemSize);
        for (let i = 0; i < attr.count; i++) for (let k = 0; k < attr.itemSize; k++) array[i * attr.itemSize + k] = attr.getComponent(i, k);
        return { array, itemSize: attr.itemSize, name: attr.name };
    };
    const count = geometry.index?.count ?? geometry.attributes.position.count;
    const index = new Uint32Array(count);
    for (let i = 0; i < count; i++) index[i] = geometry.index ? geometry.index.getX(i) : i;
    return { attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([key, attr]) => [key, serialize(attr)])),
        morphAttributes: Object.fromEntries(Object.entries(geometry.morphAttributes).map(([key, list]) => [key, list.map(serialize)])),
        morphTargetsRelative: geometry.morphTargetsRelative, index,
        groups: geometry.groups.map(g => ({ ...g })), drawRange: { ...geometry.drawRange } };
}

export function deserializeGeometry(data: SubdivisionData): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const attribute = (a: SubdivisionAttribute) => {
        const attr = new THREE.BufferAttribute(a.array, a.itemSize);
        attr.name = a.name ?? '';
        return attr;
    };
    for (const [key, attr] of Object.entries(data.attributes)) geometry.setAttribute(key, attribute(attr));
    geometry.morphAttributes = Object.fromEntries(Object.entries(data.morphAttributes).map(([key, list]) => [key, list.map(attribute)]));
    geometry.morphTargetsRelative = data.morphTargetsRelative;
    geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
    geometry.groups = data.groups.map(g => ({ ...g }));
    geometry.setDrawRange(data.drawRange.start, data.drawRange.count);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    return geometry;
}

/** A worker per scene/configuration batch; terminate also cancels running CPU work. */
export class SubdivisionWorkerClient {
    private worker: Worker | null = null;
    private sequence = 0;
    private pending = new Map<number, { resolve: (geometry: THREE.BufferGeometry) => void; reject: (error: Error) => void }>();

    run(geometry: THREE.BufferGeometry, level: number): Promise<THREE.BufferGeometry> {
        if (typeof Worker === 'undefined') return Promise.reject(new Error('Worker unavailable'));
        if (!this.worker) {
            this.worker = new Worker(new URL('../../../workers/subdivisionWorker.ts', import.meta.url), { type: 'module' });
            this.worker.onmessage = (event: MessageEvent<{ id: number; geometry?: SubdivisionData; error?: string }>) => {
                const pending = this.pending.get(event.data.id);
                if (!pending) return;
                this.pending.delete(event.data.id);
                if (event.data.geometry) pending.resolve(deserializeGeometry(event.data.geometry));
                else pending.reject(new Error(event.data.error ?? 'Subdivision failed'));
            };
            this.worker.onerror = () => this.cancel(new Error('Subdivision worker failed'));
        }
        // Only called after scene-wide preflight, before allocating these copies.
        const data = serializeGeometry(geometry);
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            try { this.worker!.postMessage({ id, geometry: data, level }, subdivisionTransfers(data)); }
            catch (error) { this.pending.delete(id); reject(error instanceof Error ? error : new Error(String(error))); }
        });
    }

    cancel(error = new Error('Subdivision cancelled')): void {
        this.worker?.terminate();
        this.worker = null;
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
    }
}
