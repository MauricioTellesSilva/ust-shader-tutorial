/**
 * Desfazer e refazer.
 *
 * O que interessa afirmar é a simetria — desfazer e refazer levam ao mesmo
 * sítio de onde se veio — e a regra que a maior parte das implementações erra:
 * uma mudança nova deita fora o futuro. Sem ela, refazer depois de desfazer e
 * mexer noutra coisa salta para um estado que nunca existiu.
 */
import { describe, it, expect } from 'vitest';

import { createNode, emptyGraph, NODE_VALUE, type MaterialGraph } from '../../materials/nodes';
import { canRedo, canUndo, emptyHistory, LIMIT, record, redo, undo } from './history';

/** Um grafo com N nós, para se distinguirem uns dos outros. */
function grafo(n: number): MaterialGraph {
    return {
        ...emptyGraph(),
        nodes: Array.from({ length: n }, () => createNode(NODE_VALUE, { x: n, y: n })!),
    };
}

describe('a pilha', () => {
    it('sem passos não há nada a desfazer', () => {
        const h = emptyHistory();
        expect(canUndo(h)).toBe(false);
        expect(undo(h, grafo(1))).toBeNull();
    });

    it('desfazer volta ao que estava antes', () => {
        const antes = grafo(1);
        const depois = grafo(2);

        const h = record(emptyHistory(), antes);
        const passo = undo(h, depois)!;

        expect(passo.graph).toBe(antes);
        expect(canRedo(passo.history)).toBe(true);
    });

    it('refazer volta a trazer o que se desfez', () => {
        const antes = grafo(1);
        const depois = grafo(2);

        const h = record(emptyHistory(), antes);
        const atras = undo(h, depois)!;
        const frente = redo(atras.history, atras.graph)!;

        expect(frente.graph).toBe(depois);
    });

    it('três passos desfazem-se pela ordem inversa', () => {
        const a = grafo(1); const b = grafo(2); const c = grafo(3); const d = grafo(4);

        let h = record(emptyHistory(), a);
        h = record(h, b);
        h = record(h, c);

        const um = undo(h, d)!;
        expect(um.graph).toBe(c);
        const dois = undo(um.history, um.graph)!;
        expect(dois.graph).toBe(b);
        const tres = undo(dois.history, dois.graph)!;
        expect(tres.graph).toBe(a);
        expect(canUndo(tres.history)).toBe(false);
    });

    it('uma mudança nova deita fora o futuro', () => {
        const a = grafo(1); const b = grafo(2); const c = grafo(3);

        const h = record(emptyHistory(), a);
        const atras = undo(h, b)!;
        expect(canRedo(atras.history)).toBe(true);

        // Mexer noutra coisa depois de desfazer: aquele futuro deixou de ser
        // alcançável, e mantê-lo dava um refazer para um estado que nunca houve.
        const depois = record(atras.history, c);
        expect(canRedo(depois)).toBe(false);
    });

    it('a pilha tem tecto', () => {
        let h = emptyHistory();
        for (let i = 0; i < LIMIT + 20; i += 1) h = record(h, grafo(1));

        expect(h.past).toHaveLength(LIMIT);
    });
});
