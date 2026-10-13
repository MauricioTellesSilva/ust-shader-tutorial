import {
    connect, createNode, emptyGraph, nextConnectionId,
    NODE_CHECKER_TEXTURE, NODE_MATERIAL_OUTPUT, NODE_PRINCIPLED,
    type MaterialGraph,
} from '../materials/nodes';
import { graphDiagnostics } from '../components/nodes/graphDiagnostics';
import { demoAssets } from './assets';
import type { TutorialDefinition } from './types';

export function createInitialGraph(compact = false): MaterialGraph {
    const shader = createNode(NODE_PRINCIPLED, { x: compact ? 30 : 285, y: 55 })!;
    const output = createNode(NODE_MATERIAL_OUTPUT, { x: compact ? 270 : 530, y: 55 })!;
    return { ...emptyGraph(), nodes: [shader, output] };
}

export function createSolutionGraph(compact = false): MaterialGraph {
    let graph = createInitialGraph(compact);
    const shader = graph.nodes[0];
    const output = graph.nodes[1];
    const pattern = createNode(NODE_CHECKER_TEXTURE, { x: 40, y: compact ? 510 : 55 })!;
    pattern.inputs = {
        ...pattern.inputs,
        scale: 8,
        color1: { r: 0.08, g: 0.35, b: 0.3 },
        color2: { r: 0.85, g: 0.48, b: 0.18 },
    };
    shader.inputs = { ...shader.inputs, roughness: 0.65 };
    graph = { ...graph, nodes: [...graph.nodes, pattern] };
    graph = connect(graph, { sourceNode: pattern.id, sourceSocket: 'color', targetNode: shader.id, targetSocket: 'baseColor' }, nextConnectionId());
    return connect(graph, { sourceNode: shader.id, sourceSocket: 'bsdf', targetNode: output.id, targetSocket: 'surface' }, nextConnectionId());
}

export function checkerProgress(graph: MaterialGraph): boolean[] {
    const output = graph.nodes.find(node => node.type === NODE_MATERIAL_OUTPUT);
    const surface = graph.connections.find(connection => connection.targetNode === output?.id && connection.targetSocket === 'surface');
    const shader = surface
        ? graph.nodes.find(node => node.id === surface.sourceNode && node.type === NODE_PRINCIPLED)
        : graph.nodes.find(node => node.type === NODE_PRINCIPLED);
    const color = graph.connections.find(connection => connection.targetNode === shader?.id && connection.targetSocket === 'baseColor' && connection.sourceSocket === 'color');
    const pattern = graph.nodes.find(node => node.id === color?.sourceNode && node.type === NODE_CHECKER_TEXTURE);
    const unlinked = (input: string) => !graph.connections.some(connection => connection.targetNode === shader?.id && connection.targetSocket === input);
    const scaleUnlinked = !graph.connections.some(connection => connection.targetNode === pattern?.id && connection.targetSocket === 'scale');
    return [
        graph.nodes.some(node => node.type === NODE_CHECKER_TEXTURE),
        !!pattern,
        !!pattern && scaleUnlinked && Math.abs(Number(pattern.inputs.scale) - 8) < 0.01,
        !!shader && unlinked('roughness') && Math.abs(Number(shader.inputs.roughness) - 0.65) < 0.01,
        !!shader && surface?.sourceSocket === 'bsdf',
        graphDiagnostics(graph, demoAssets).length === 0,
    ];
}

export const checkerTutorial: TutorialDefinition = {
    id: 'checker',
    title: 'Procedural checker material',
    objective: 'Create a pattern with Checker Texture and connect it to the sphere material, without external files.',
    completion: 'Material complete! Try different colors and scales, and watch the result on the sphere.',
    assets: demoAssets,
    createInitialGraph,
    createSolutionGraph,
    steps: [
        { id: 'create', title: 'Add Checker Texture', instruction: 'Use + Node or Shift+A, find Checker Texture, and place the node to the left of Principled BSDF.' },
        { id: 'color', title: 'Connect the color', instruction: 'Drag the Color output of Checker Texture to Base Color on Principled BSDF. Use the socket dots, not the fields.' },
        { id: 'scale', title: 'Set Scale to 8', instruction: 'On Checker Texture, change Scale to 8. You can also choose Color 1 and Color 2.' },
        { id: 'roughness', title: 'Set Roughness to 0.65', instruction: 'On Principled BSDF, change Roughness to 0.65. Leave this socket unconnected.' },
        { id: 'output', title: 'Connect the material to the output', instruction: 'Connect BSDF on Principled BSDF to the Surface socket on Material Output. The preview will display the pattern.' },
        { id: 'valid', title: 'Check the diagnostics', instruction: 'The disconnected-output warning should disappear. Fix any invalid connections or unavailable images.' },
    ],
    evaluate: checkerProgress,
};
