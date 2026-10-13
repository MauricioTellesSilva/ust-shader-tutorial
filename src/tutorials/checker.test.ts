import { describe, expect, it } from 'vitest';
import { connect, createNode, nextConnectionId, NODE_CHECKER_TEXTURE, NODE_PRINCIPLED, NODE_VALUE } from '../materials/nodes';
import { checkerProgress, checkerTutorial, createInitialGraph, createSolutionGraph } from './checker';

describe('tutorial xadrez', () => {
    it('começa sem etapas concluídas e com dois nós desconectados', () => {
        const graph = createInitialGraph();
        expect(graph.nodes).toHaveLength(2);
        expect(graph.connections).toHaveLength(0);
        expect(checkerProgress(graph)).toEqual([false, false, false, false, false, false]);
    });

    it('a solução satisfaz exatamente todas as etapas', () => {
        const graph = createSolutionGraph();
        expect(checkerTutorial.evaluate(graph)).toHaveLength(checkerTutorial.steps.length);
        expect(checkerProgress(graph)).toEqual([true, true, true, true, true, true]);
    });

    it('as etapas refletem as alterações em vez de ficarem concluídas para sempre', () => {
        const graph = createSolutionGraph();
        const changed = { ...graph, nodes: graph.nodes.map(node => node.type === NODE_CHECKER_TEXTURE
            ? { ...node, inputs: { ...node.inputs, scale: 2 } } : node) };
        expect(checkerProgress(changed)[2]).toBe(false);
    });

    it('não considera um Checker desconectado como cadeia de cor concluída', () => {
        const graph = createInitialGraph();
        const pattern = createNode(NODE_CHECKER_TEXTURE, { x: 0, y: 0 })!;
        pattern.inputs.scale = 8;
        const progress = checkerProgress({ ...graph, nodes: [...graph.nodes, pattern] });
        expect(progress[0]).toBe(true);
        expect(progress[1]).toBe(false);
        expect(progress[2]).toBe(false);
    });

    it('inspeciona o shader conectado à saída, não outro shader da cena', () => {
        const graph = createSolutionGraph();
        const alternate = createNode(NODE_PRINCIPLED, { x: 20, y: 30 })!;
        const surface = graph.connections.find(connection => connection.targetSocket === 'surface')!;
        const changed = { ...graph, nodes: [...graph.nodes, alternate], connections: graph.connections.map(connection =>
            connection.id === surface.id ? { ...connection, sourceNode: alternate.id } : connection) };
        expect(checkerProgress(changed)[1]).toBe(false);
        expect(checkerProgress(changed)[3]).toBe(false);
    });

    it('não valida um campo local que foi substituído por uma conexão', () => {
        let graph = createSolutionGraph();
        const value = createNode(NODE_VALUE, { x: 10, y: 10 })!;
        graph = { ...graph, nodes: [...graph.nodes, value] };
        const shader = graph.nodes.find(node => node.type === NODE_PRINCIPLED)!;
        graph = connect(graph, { sourceNode: value.id, sourceSocket: 'value', targetNode: shader.id, targetSocket: 'roughness' }, nextConnectionId());
        expect(checkerProgress(graph)[3]).toBe(false);
        const pattern = graph.nodes.find(node => node.type === NODE_CHECKER_TEXTURE)!;
        graph = connect(graph, { sourceNode: value.id, sourceSocket: 'value', targetNode: pattern.id, targetSocket: 'scale' }, nextConnectionId());
        expect(checkerProgress(graph)[2]).toBe(false);
    });

    it('usa IDs novos a cada reinício e oferece uma solução compacta válida', () => {
        expect(createInitialGraph().nodes[0].id).not.toBe(createInitialGraph().nodes[0].id);
        expect(checkerProgress(createSolutionGraph(true)).every(Boolean)).toBe(true);
    });
});
