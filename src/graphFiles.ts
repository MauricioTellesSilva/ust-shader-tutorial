import { deserializeGraph, serializeGraph, type MaterialGraph } from './materials/nodes';

export const MAX_GRAPH_BYTES = 1024 * 1024;

export function parseGraphJson(text: string): MaterialGraph {
    if (new TextEncoder().encode(text).byteLength > MAX_GRAPH_BYTES) throw new Error('The graph must not exceed 1 MB.');
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new Error('The file does not contain valid JSON.'); }
    const loaded = deserializeGraph(raw);
    if (!loaded.ok || loaded.issues.length > 0) {
        throw new Error(loaded.issues.map(issue => issue.detail).join(' ') || 'Invalid graph.');
    }
    return loaded.graph;
}

export function graphJson(graph: MaterialGraph): string {
    return JSON.stringify(serializeGraph(graph), null, 2);
}
