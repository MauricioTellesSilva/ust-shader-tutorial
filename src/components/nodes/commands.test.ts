/**
 * Duplicar, copiar, colar, cortar e apagar — sem editor por perto.
 *
 * As afirmações que estes testes protegem são três, e todas já falharam algures
 * em alguma aplicação: que uma cópia é mesmo uma cópia (identificadores novos, e
 * mexer nela não mexe no original), que um grupo colado mantém a forma que
 * tinha, e que nada disto alcança nós que não estavam seleccionados.
 *
 * São funções puras, e por isso o teste é uma conversa directa: dá-se um grafo,
 * pede-se uma operação, olha-se para o grafo que sai.
 */
import { describe, it, expect } from 'vitest';

import {
    connect,
    createNode,
    emptyGraph,
    nextConnectionId,
    NODE_COLOR_RAMP,
    NODE_MATERIAL_OUTPUT,
    NODE_NOISE_TEXTURE,
    NODE_PRINCIPLED,
    NODE_TEXTURE,
    NODE_VALUE,
    type MaterialGraph,
} from '../../materials/nodes';
import {
    copyNodes,
    corner,
    cutNodes,
    deleteNodes,
    duplicateNodes,
    moveNodes,
    pasteClip,
    selectAll,
} from './commands';

function ligar(g: MaterialGraph, a: string, ao: string, b: string, bi: string) {
    return connect(g, { sourceNode: a, sourceSocket: ao, targetNode: b, targetSocket: bi },
        nextConnectionId());
}

/**
 * A cadeia do exemplo do pedido: Noise → Color Ramp → Principled → Output.
 *
 * É o grafo mais pequeno que ainda tem alguma coisa a dizer: uma cadeia com
 * ligações internas, um nó único no fim, e um nó que não faz parte da cadeia
 * para se poder afirmar que ele fica de fora.
 */
function cena() {
    const noise = createNode(NODE_NOISE_TEXTURE, { x: 0, y: 0 })!;
    const ramp = createNode(NODE_COLOR_RAMP, { x: 200, y: 40 })!;
    const principled = createNode(NODE_PRINCIPLED, { x: 400, y: 80 })!;
    const output = createNode(NODE_MATERIAL_OUTPUT, { x: 600, y: 120 })!;
    const solto = createNode(NODE_VALUE, { x: 0, y: 400 })!;

    let graph: MaterialGraph = {
        ...emptyGraph(),
        nodes: [noise, ramp, principled, output, solto],
    };

    graph = ligar(graph, noise.id, 'fac', ramp.id, 'fac');
    graph = ligar(graph, ramp.id, 'color', principled.id, 'baseColor');
    graph = ligar(graph, principled.id, 'bsdf', output.id, 'surface');

    return { graph, noise, ramp, principled, output, solto };
}

describe('duplicar', () => {
    it('a cópia é do mesmo tipo, com os mesmos valores e um id novo', () => {
        const { graph, noise } = cena();

        // Um valor mexido à mão, para se ver que ele acompanha.
        const comValor: MaterialGraph = {
            ...graph,
            nodes: graph.nodes.map((n) => (n.id === noise.id
                ? { ...n, inputs: { ...n.inputs, scale: 7.5 } }
                : n)),
        };

        const r = duplicateNodes(comValor, [noise.id])!;
        const copia = r.graph.nodes.find((n) => n.id === r.selection[0])!;

        expect(copia.type).toBe(noise.type);
        expect(copia.inputs.scale).toBe(7.5);
        expect(copia.id).not.toBe(noise.id);
        expect(r.graph.nodes).toHaveLength(comValor.nodes.length + 1);
    });

    it('a referência da textura acompanha a cópia', () => {
        // Um nó de imagem aponta para um asset do projeto. Duplicá-lo sem a
        // referência dava uma caixa vazia com o nome certo — que é a maneira
        // mais confusa de perder uma textura.
        const tex = createNode(NODE_TEXTURE, { x: 0, y: 0 })!;
        const graph: MaterialGraph = {
            ...emptyGraph(),
            nodes: [{ ...tex, properties: { assetId: '31', assetName: 'ferrugem.png' } }],
        };

        const r = duplicateNodes(graph, [tex.id])!;
        const copia = r.graph.nodes.find((n) => n.id === r.selection[0])!;

        expect(copia.properties.assetId).toBe('31');
        expect(copia.properties.assetName).toBe('ferrugem.png');
    });

    it('mexer na cópia não mexe no original', () => {
        const { graph, noise } = cena();
        const r = duplicateNodes(graph, [noise.id])!;

        const copia = r.graph.nodes.find((n) => n.id === r.selection[0])!;
        copia.inputs.scale = 99;

        expect(r.graph.nodes.find((n) => n.id === noise.id)!.inputs.scale).not.toBe(99);
    });

    it('a cópia fica seleccionada, e o original deixa de estar', () => {
        const { graph, noise } = cena();
        const r = duplicateNodes(graph, [noise.id])!;

        expect(r.selection).toHaveLength(1);
        expect(r.selection).not.toContain(noise.id);
    });

    it('as ligações internas do grupo vêm juntas, e as de fora não', () => {
        const { graph, noise, ramp, principled } = cena();

        // Noise → Ramp copiados; a ligação Ramp → Principled fica de fora
        // porque uma das pontas não veio.
        const r = duplicateNodes(graph, [noise.id, ramp.id])!;
        const novos = new Set(r.selection);

        const dentro = r.graph.connections.filter(
            (c) => novos.has(c.sourceNode) && novos.has(c.targetNode),
        );
        expect(dentro).toHaveLength(1);

        // E nenhuma ligação nova toca em nós que já lá estavam. Uma cópia presa
        // ao original pelo que vem a seguir não é uma cópia.
        const atravessadas = r.graph.connections.filter(
            (c) => (novos.has(c.sourceNode) !== novos.has(c.targetNode)),
        );
        expect(atravessadas).toHaveLength(0);
        expect(r.graph.connections.some((c) => c.targetNode === principled.id
            && novos.has(c.sourceNode))).toBe(false);
    });

    it('o Material Output não se duplica', () => {
        // Um grafo com dois só podia ter um a valer, e escolher qual era um
        // problema que ninguém pediu.
        const { graph, output } = cena();
        expect(duplicateNodes(graph, [output.id])).toBeNull();
    });

    it('sem selecção não faz nada', () => {
        expect(duplicateNodes(cena().graph, [])).toBeNull();
    });
});

describe('copiar e colar', () => {
    it('o grupo colado aparece no cursor e mantém a forma', () => {
        const { graph, noise, ramp } = cena();
        const clip = copyNodes(graph, [noise.id, ramp.id])!;

        const r = pasteClip(graph, clip, { x: 1000, y: 500 })!;
        const colados = r.graph.nodes.filter((n) => r.selection.includes(n.id));

        // O canto do grupo é o cursor.
        expect(corner(colados)).toEqual({ x: 1000, y: 500 });

        // E as distâncias internas são as mesmas: o que se copiou foi a forma
        // do grupo, e não onde ele estava.
        const antes = corner([noise, ramp]);
        for (const original of [noise, ramp]) {
            const copia = colados.find((n) => n.type === original.type)!;
            expect(copia.position.x - 1000).toBe(original.position.x - antes.x);
            expect(copia.position.y - 500).toBe(original.position.y - antes.y);
        }
    });

    it('[A]→[B]→[C] cola como [A2]→[B2]→[C2]', () => {
        const { graph, noise, ramp, principled } = cena();
        const clip = copyNodes(graph, [noise.id, ramp.id, principled.id])!;

        const r = pasteClip(graph, clip, { x: 0, y: 800 })!;
        const novos = new Set(r.selection);

        const cadeia = r.graph.connections.filter(
            (c) => novos.has(c.sourceNode) && novos.has(c.targetNode),
        );
        expect(cadeia).toHaveLength(2);

        // Nenhuma ligação nova aponta para os originais.
        for (const c of cadeia) {
            expect([noise.id, ramp.id, principled.id]).not.toContain(c.sourceNode);
            expect([noise.id, ramp.id, principled.id]).not.toContain(c.targetNode);
        }
    });

    it('colar duas vezes dá dois grupos com identificadores diferentes', () => {
        const { graph, noise } = cena();
        const clip = copyNodes(graph, [noise.id])!;

        const um = pasteClip(graph, clip, { x: 10, y: 10 })!;
        const dois = pasteClip(um.graph, clip, { x: 20, y: 20 })!;

        expect(dois.selection[0]).not.toBe(um.selection[0]);
        expect(new Set(dois.graph.nodes.map((n) => n.id)).size).toBe(dois.graph.nodes.length);
    });

    it('copiar não guarda o Material Output', () => {
        const { graph, output, noise } = cena();
        const clip = copyNodes(graph, [noise.id, output.id])!;

        expect(clip.nodes).toHaveLength(1);
        expect(clip.nodes[0].type).toBe(noise.type);
    });

    it('sem nada na área de transferência, colar não faz nada', () => {
        expect(pasteClip(cena().graph, null, { x: 0, y: 0 })).toBeNull();
    });
});

describe('cortar', () => {
    it('tira os nós do grafo e guarda-os para colar', () => {
        const { graph, noise, ramp } = cena();
        const r = cutNodes(graph, [noise.id, ramp.id])!;

        expect(r.graph.nodes.find((n) => n.id === noise.id)).toBeUndefined();
        expect(r.clip!.nodes).toHaveLength(2);

        // E o que foi cortado volta inteiro, com a ligação que tinha por dentro.
        const voltou = pasteClip(r.graph, r.clip, { x: 0, y: 0 })!;
        const novos = new Set(voltou.selection);
        expect(voltou.graph.connections.filter(
            (c) => novos.has(c.sourceNode) && novos.has(c.targetNode),
        )).toHaveLength(1);
    });

    it('as ligações que tocavam nos nós cortados saem com eles', () => {
        // Uma ligação para um nó que já não existe não se vê no ecrã e é
        // recusada na leitura seguinte: o material voltaria diferente do que
        // estava, sem nada a explicar porquê.
        const { graph, ramp } = cena();
        const r = cutNodes(graph, [ramp.id])!;

        expect(r.graph.connections.some(
            (c) => c.sourceNode === ramp.id || c.targetNode === ramp.id,
        )).toBe(false);
    });
});

describe('apagar', () => {
    it('tira os nós e as ligações deles', () => {
        const { graph, noise } = cena();
        const r = deleteNodes(graph, [noise.id]);

        expect(r.graph.nodes.find((n) => n.id === noise.id)).toBeUndefined();
        expect(r.graph.connections.some((c) => c.sourceNode === noise.id)).toBe(false);
        expect(r.selection).toEqual([]);
    });

    it('o Material Output fica, e diz-se que ficou', () => {
        const { graph, output } = cena();
        const r = deleteNodes(graph, [output.id]);

        expect(r.graph.nodes.find((n) => n.id === output.id)).toBeDefined();
        expect(r.protegidos).toBe(1);
    });

    it('apagar um grupo com o Output tira os outros e deixa-o', () => {
        const { graph, noise, output } = cena();
        const r = deleteNodes(graph, [noise.id, output.id]);

        expect(r.graph.nodes.find((n) => n.id === noise.id)).toBeUndefined();
        expect(r.graph.nodes.find((n) => n.id === output.id)).toBeDefined();
        expect(r.protegidos).toBe(1);
    });
});

describe('seleccionar tudo', () => {
    it('dá os nós deste grafo e só deste', () => {
        // O grafo que entra é sempre o do material activo — não há por onde
        // esta função alcançar outro. É uma consequência da assinatura, e este
        // teste é a maneira de a afirmar.
        const a = cena().graph;
        const b = { ...emptyGraph(), nodes: [createNode(NODE_VALUE, { x: 0, y: 0 })!] };

        const ids = selectAll(a);
        expect(ids).toHaveLength(a.nodes.length);
        expect(ids).not.toContain(b.nodes[0].id);
    });
});

describe('mover', () => {
    it('desloca só os nós pedidos', () => {
        const { graph, noise, ramp } = cena();
        const movido = moveNodes(graph, [noise.id], { x: 50, y: -20 });

        expect(movido.nodes.find((n) => n.id === noise.id)!.position).toEqual({ x: 50, y: -20 });
        expect(movido.nodes.find((n) => n.id === ramp.id)!.position).toEqual(ramp.position);
    });
});
