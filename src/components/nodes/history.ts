/**
 * Desfazer e refazer, por material.
 *
 * Uma pilha de fotografias do grafo. Não é a solução mais elegante — um sistema
 * de comandos invertíveis gastaria menos memória — mas é a que não pode
 * divergir: cada entrada **é** um grafo que já esteve no ecrã, e não uma
 * receita para o reconstruir que possa estar errada num caso que ninguém
 * testou. Com o tecto abaixo, cinquenta grafos de umas dezenas de nós são
 * alguns milhares de objetos, e nenhum deles vive além da sessão.
 *
 * ## Estado do editor, e não do projeto
 *
 * Isto não é gravado. Faz parte da mesma família da vista da tela e do nó
 * seleccionado: existe enquanto a pessoa está a trabalhar e morre quando ela
 * sai. Gravar o histórico no projeto seria pôr no documento uma cópia de todos
 * os estados por que o material passou — e o documento é o material, não a sua
 * biografia.
 *
 * ## Uma pilha por material
 *
 * Desfazer estando no vidro não pode mexer na carroçaria. Cada material tem a
 * sua pilha, guardada pelo nome do material — o mesmo identificador que a
 * biblioteca usa.
 */
import type { MaterialGraph } from '../../materials/nodes';

/** Quantos passos atrás se pode ir. */
export const LIMIT = 50;

export interface History {
    past: MaterialGraph[];
    future: MaterialGraph[];
}

export function emptyHistory(): History {
    return { past: [], future: [] };
}

/**
 * Guarda o estado **anterior** a uma mudança.
 *
 * O anterior, e não o novo: desfazer é voltar ao que estava antes desta
 * operação, e é esse o grafo que tem de estar guardado. Guardar o novo dava uma
 * pilha em que o primeiro desfazer não fazia nada.
 *
 * Uma mudança nova deita fora o futuro. Depois de desfazer três passos e mexer
 * noutra coisa, aqueles três deixaram de ser alcançáveis — mantê-los daria um
 * refazer que salta para um material que nunca existiu.
 */
export function record(history: History, before: MaterialGraph): History {
    return {
        past: [...history.past, before].slice(-LIMIT),
        future: [],
    };
}

export function canUndo(history: History): boolean {
    return history.past.length > 0;
}

export function canRedo(history: History): boolean {
    return history.future.length > 0;
}

export interface Step {
    history: History;
    graph: MaterialGraph;
}

/** Um passo atrás. O grafo actual passa para o futuro, para o refazer o ter. */
export function undo(history: History, current: MaterialGraph): Step | null {
    const anterior = history.past.at(-1);
    if (!anterior) return null;

    return {
        history: {
            past: history.past.slice(0, -1),
            future: [...history.future, current].slice(-LIMIT),
        },
        graph: anterior,
    };
}

/** Um passo à frente, pelo caminho simétrico. */
export function redo(history: History, current: MaterialGraph): Step | null {
    const seguinte = history.future.at(-1);
    if (!seguinte) return null;

    return {
        history: {
            past: [...history.past, current].slice(-LIMIT),
            future: history.future.slice(0, -1),
        },
        graph: seguinte,
    };
}
