/** Serializable worker data. All components are decoded, including normalized attributes. */
export interface SubdivisionAttribute {
    array: Float32Array;
    itemSize: number;
    name?: string;
}
export interface SubdivisionData {
    attributes: Record<string, SubdivisionAttribute>;
    morphAttributes: Record<string, SubdivisionAttribute[]>;
    morphTargetsRelative: boolean;
    index: Uint32Array;
    groups: { start: number; count: number; materialIndex?: number }[];
    drawRange: { start: number; count: number };
}
export const SUBDIVISION_LIMITS = { meshTriangles: 250_000, totalTriangles: 1_000_000, bytes: 256 * 1024 * 1024 } as const;
export type SubdivisionLimit = 'mesh' | 'total' | 'bytes';

export interface SubdivisionSize {
    vertices: number;
    triangles: number;
    /** Components of attributes and all morph targets, per vertex. */
    components: number;
}

/** Conservative allocation bound, including worker inputs, indices and quad overlays. */
export function estimateSubdivision(size: SubdivisionSize, level: number) {
    const factor = 4 ** Math.max(0, Math.min(3, Math.floor(level)));
    const triangles = size.triangles * factor;
    const vertices = size.vertices + size.triangles * (factor - 1);
    const bytes = (vertices + size.vertices + 6 * triangles) * size.components * 4
        + Math.ceil(triangles * 3 * 4 * 4 / 3) + size.triangles * 3 * 4;
    return { triangles, vertices, bytes };
}

export function subdivisionLimit(estimate: { triangles: number; bytes: number }, used = { triangles: 0, bytes: 0 }): SubdivisionLimit | null {
    if (estimate.triangles > SUBDIVISION_LIMITS.meshTriangles) return 'mesh';
    if (estimate.triangles + used.triangles > SUBDIVISION_LIMITS.totalTriangles) return 'total';
    if (estimate.bytes + used.bytes > SUBDIVISION_LIMITS.bytes) return 'bytes';
    return null;
}

/** Split triangles at edge midpoints. Indices, rather than positions, identify an
 * edge so UV seams, hard normals and disconnected parts are never welded. */
export function subdivideTriangles(input: SubdivisionData, level: number): SubdivisionData {
    if (![1, 2, 3].includes(level)) throw new RangeError('Subdivision level must be 1, 2 or 3');
    const position = input.attributes.position;
    if (!position || input.index.length % 3 !== 0) throw new TypeError('Expected triangle geometry');
    const originalCount = position.array.length / position.itemSize;
    const descriptors = [...Object.values(input.attributes), ...Object.values(input.morphAttributes).flat()];
    if (descriptors.some(a => a.itemSize < 1 || a.array.length !== originalCount * a.itemSize)) throw new TypeError('Attribute counts differ');
    const size = { vertices: originalCount, triangles: input.index.length / 3, components: descriptors.reduce((sum, a) => sum + a.itemSize, 0) };
    const estimate = estimateSubdivision(size, level);
    if (subdivisionLimit(estimate)) throw new RangeError('Subdivision resource limit');
    if (input.index.some(index => index >= originalCount)) throw new RangeError('Invalid vertex index');
    const expand = (a: SubdivisionAttribute): SubdivisionAttribute => {
        const array = new Float32Array(estimate.vertices * a.itemSize);
        array.set(a.array);
        return { ...a, array };
    };
    const attributes = Object.fromEntries(Object.entries(input.attributes).map(([key, a]) => [key, expand(a)]));
    const morphAttributes = Object.fromEntries(Object.entries(input.morphAttributes).map(([key, list]) => [key, list.map(expand)]));
    const all = [...Object.entries(attributes), ...Object.values(morphAttributes).flat().map(a => ['', a] as const)];
    let count = originalCount;
    let index = input.index;

    for (let iteration = 0; iteration < level; iteration++) {
        const edges = new Map<number, number>();
        const midpoint = (a: number, b: number): number => {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            const key = lo * estimate.vertices + hi;
            const cached = edges.get(key);
            if (cached !== undefined) return cached;
            const at = count++;
            edges.set(key, at);
            for (const [name, attr] of all) {
                if (name === 'skinIndex' || name === 'skinWeight') continue;
                const { array, itemSize } = attr;
                for (let k = 0; k < itemSize; k++) array[at * itemSize + k] = (array[a * itemSize + k] + array[b * itemSize + k]) / 2;
                if ((name === 'normal' || name === 'tangent') && itemSize >= 3) {
                    const offset = at * itemSize;
                    const length = Math.hypot(array[offset], array[offset + 1], array[offset + 2]);
                    if (length > 0) for (let k = 0; k < 3; k++) array[offset + k] /= length;
                    if (name === 'tangent' && itemSize === 4) array[offset + 3] = array[a * itemSize + 3];
                }
            }
            const joints = attributes.skinIndex, weights = attributes.skinWeight;
            if (joints && weights) {
                const influences = new Map<number, number>();
                for (const vertex of [a, b]) for (let k = 0; k < 4; k++) {
                    const joint = joints.array[vertex * joints.itemSize + k];
                    const weight = weights.array[vertex * weights.itemSize + k] * 0.5;
                    if (weight > 0) influences.set(joint, (influences.get(joint) ?? 0) + weight);
                }
                const top = [...influences].toSorted((left, right) => right[1] - left[1] || left[0] - right[0]).slice(0, 4);
                const total = top.reduce((sum, entry) => sum + entry[1], 0);
                for (let k = 0; k < 4; k++) {
                    joints.array[at * joints.itemSize + k] = top[k]?.[0] ?? 0;
                    weights.array[at * weights.itemSize + k] = total > 0 ? (top[k]?.[1] ?? 0) / total : (k === 0 ? 1 : 0);
                }
            }
            return at;
        };
        const next = new Uint32Array(index.length * 4);
        for (let i = 0; i < index.length; i += 3) {
            const a = index[i], b = index[i + 1], c = index[i + 2];
            const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
            next.set([a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca], i * 4);
        }
        index = next;
    }
    const trim = (a: SubdivisionAttribute) => ({ ...a, array: a.array.subarray(0, count * a.itemSize) });
    const factor = 4 ** level;
    return {
        attributes: Object.fromEntries(Object.entries(attributes).map(([key, attr]) => [key, trim(attr)])),
        morphAttributes: Object.fromEntries(Object.entries(morphAttributes).map(([key, list]) => [key, list.map(trim)])),
        morphTargetsRelative: input.morphTargetsRelative,
        index,
        groups: input.groups.map(group => ({ ...group, start: group.start * factor, count: group.count * factor })),
        drawRange: { start: input.drawRange.start * factor, count: input.drawRange.count * factor },
    };
}

export function subdivisionTransfers(data: SubdivisionData): ArrayBuffer[] {
    return [...new Set([data.index.buffer, ...Object.values(data.attributes).map(a => a.array.buffer),
        ...Object.values(data.morphAttributes).flat().map(a => a.array.buffer)])] as ArrayBuffer[];
}
