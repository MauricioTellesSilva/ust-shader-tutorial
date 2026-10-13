import { describe, expect, it } from 'vitest';
import { graphJson, MAX_GRAPH_BYTES, parseGraphJson } from './graphFiles';
import { createSolutionGraph } from './tutorials/checker';
import { serializeGraph } from './materials/nodes';

describe('arquivos de grafo', () => {
    it('exporta e importa preservando o material', () => {
        const graph = createSolutionGraph();
        expect(serializeGraph(parseGraphJson(graphJson(graph)))).toEqual(serializeGraph(graph));
    });

    it('recusa JSON inválido ou sem estrutura de grafo', () => {
        expect(() => parseGraphJson('{')).toThrow('valid JSON');
        expect(() => parseGraphJson('{}')).toThrow();
    });

    it('recusa tipos desconhecidos em vez de apagar nós silenciosamente', () => {
        const raw = serializeGraph(createSolutionGraph());
        raw.nodes[0].type = 'unknown-node';
        expect(() => parseGraphJson(JSON.stringify(raw))).toThrow();
    });

    it('recusa entradas e ligações adulteradas', () => {
        const raw = serializeGraph(createSolutionGraph());
        raw.connections[0].targetSocketId = 'invalid-socket';
        expect(() => parseGraphJson(JSON.stringify(raw))).toThrow();
        const inputs = serializeGraph(createSolutionGraph());
        inputs.nodes[0].inputs.roughness = 'not-a-number';
        expect(() => parseGraphJson(JSON.stringify(inputs))).toThrow();
    });

    it('aplica o limite de 1 MB antes da leitura do JSON', () => {
        expect(() => parseGraphJson(' '.repeat(MAX_GRAPH_BYTES + 1))).toThrow('1 MB');
    });
});
