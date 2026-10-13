import { getNodeDefinition, nodeOption } from '../core/registry';
import type { GraphNode, MaterialGraph } from '../core/types';
import { NODE_BUMP } from '../Vector/Bump/Bump';
import { NODE_DISPLACEMENT } from '../Vector/Displacement/Displacement';

export function displacementNode(graph: MaterialGraph): GraphNode | undefined {
    const output = graph.nodes.find(n => getNodeDefinition(n.type)?.unique);
    const link = output && graph.connections.find(c => c.targetNode === output.id && c.targetSocket === 'displacement');
    return link ? graph.nodes.find(n => n.id === link.sourceNode && n.type === NODE_DISPLACEMENT && link.sourceSocket === 'displacement') : undefined;
}

export function displacementSettings(graph: MaterialGraph, animated = false) {
    const node = displacementNode(graph);
    if (!node) return null;
    const connected = (socket: string) => graph.connections.some(c => c.targetNode === node.id && c.targetSocket === socket);
    const value = (socket: string, fallback: number, min: number, max: number) => {
        const raw = node.inputs[socket];
        return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
    };
    const scale = connected('scale') ? 10 : Math.abs(value('scale', 0.1, -10, 10));
    const midlevel = value('midlevel', 0.5, 0, 1);
    const level = nodeOption(node, 'geometry') === 'subdivide' && (!animated || nodeOption(node, 'animated') === 'allow')
        ? Number(nodeOption(node, 'level')) : 0;
    return { level, padding: scale * (connected('midlevel') ? 1 : Math.max(midlevel, 1 - midlevel)) };
}

/** Image nodes used by a height chain, including empty Image Texture nodes. */
export function reliefHeightImages(graph: MaterialGraph): GraphNode[] {
    const output = graph.nodes.find(n => getNodeDefinition(n.type)?.unique);
    const reachable = new Set<string>();
    const visit = (id: string, seen: Set<string>) => {
        if (seen.has(id)) return;
        seen.add(id);
        for (const c of graph.connections) if (c.targetNode === id) visit(c.sourceNode, seen);
    };
    if (output) visit(output.id, reachable);
    const heights = new Set<string>();
    for (const node of graph.nodes) if (reachable.has(node.id) && (node.type === NODE_BUMP || node.type === NODE_DISPLACEMENT)) {
        const link = graph.connections.find(c => c.targetNode === node.id && c.targetSocket === 'height');
        if (link) visit(link.sourceNode, heights);
    }
    return graph.nodes.filter(n => heights.has(n.id) && 'assetId' in (getNodeDefinition(n.type)?.properties ?? {}));
}
