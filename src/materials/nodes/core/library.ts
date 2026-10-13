import { tr as uiText } from '../../../i18n';
/**
 * Um grafo por material, e não um grafo por projeto.
 *
 * Um modelo tem carroçaria, vidro, metal e borracha, e cada um deles é um
 * material com o seu aspecto. Um grafo único para o projeto inteiro obrigava
 * todos a partilhar a mesma rugosidade e a mesma cor — o que é o mesmo que
 * dizer que o modelo só tem um material.
 *
 *     projeto
 *       └── biblioteca de materiais
 *             ├── "Body"  → grafo, efeitos, vista do editor
 *             ├── "Glass" → grafo, efeitos, vista do editor
 *             └── "Metal" → grafo, efeitos, vista do editor
 *
 * ## A identidade de um material
 *
 * É o **nome** que o modelo lhe deu, que é o que o resto da aplicação já usa
 * para o identificar — ver `materialsMap` e `activeMaterialName`. Inventar aqui
 * um identificador nosso obrigava a mantê-lo colado ao nome à mão, e no dia em
 * que os dois discordassem o grafo era aplicado ao material errado.
 *
 * Nunca um índice: apagar um material renumerava os outros e cada grafo passava
 * a pertencer ao material seguinte.
 *
 * ## Ligações entre materiais
 *
 * Não existem, por construção. Cada grafo é um objeto com os seus nós, e uma
 * ligação só pode nomear nós que estejam nele — o `deserializeGraph` recusa
 * qualquer ponta que não encontre. Não é uma regra que alguém tenha de lembrar-
 * se de verificar: é uma consequência de os grafos serem separados.
 */
import {
    deserializeGraph,
    serializeGraph,
    type GraphIssue,
    type SerializedGraph,
} from './serialize';
import { defaultEffects, normalizeEffects, type MaterialEffects } from './effects';
import { emptyGraph, type MaterialGraph } from './types';

/**
 * A vista do editor, por material.
 *
 * Estado de interface, e mesmo assim guardado: voltar a um material e encontrar
 * a tela onde se a deixou é a diferença entre continuar um trabalho e ter de o
 * procurar outra vez. Não faz parte do material — não muda o que se vê no
 * modelo — e por isso vive à parte do grafo, aqui ao lado.
 */
export interface EditorView {
    x: number;
    y: number;
    zoom: number;
}

export function defaultView(): EditorView {
    return { x: 0, y: 0, zoom: 1 };
}

/** Tudo o que um material tem no fluxo de nós. */
export interface MaterialEntry {
    /** O nome do material no modelo. Estável, e a chave de tudo isto. */
    id: string;
    name: string;
    graph: MaterialGraph;
    effects: MaterialEffects;
    view: EditorView;
}

/** A biblioteca inteira, por id de material. */
export type MaterialLibrary = Record<string, MaterialEntry>;

/**
 * A versão do documento que guarda a biblioteca.
 *
 * Distinta da versão de um grafo: são duas coisas que podem mudar em alturas
 * diferentes. A 1 era um grafo só, sem materiais; a 2 é esta.
 */
export const LIBRARY_VERSION = 2;

export interface SerializedLibrary {
    libraryVersion: number;
    activeMaterial: string | null;
    materials: {
        id: string;
        name: string;
        nodeGraph: SerializedGraph;
        effects: MaterialEffects;
        view: EditorView;
    }[];
}

/**
 * O id reservado do grafo que veio de um projeto de versão 1.
 *
 * Um projeto gravado antes de os materiais existirem tem um grafo e nenhum nome
 * a que o prender — os materiais só se sabem quando o modelo acaba de carregar,
 * muito depois de o projeto chegar. Fica à espera com este nome e é entregue ao
 * primeiro material do modelo assim que ele aparecer. Ver `ensureMaterials`.
 */
export const LEGACY_MATERIAL = '__material_unico__';

export function emptyLibrary(): MaterialLibrary {
    return {};
}

export function newEntry(id: string, graph: MaterialGraph): MaterialEntry {
    return { id, name: id, graph, effects: defaultEffects(), view: defaultView() };
}

// ── Escrever ─────────────────────────────────────────────────────────────────

export function serializeLibrary(
    library: MaterialLibrary,
    activeMaterial: string | null,
): SerializedLibrary {
    return {
        libraryVersion: LIBRARY_VERSION,
        activeMaterial,
        materials: Object.values(library).map((entry) => ({
            id: entry.id,
            name: entry.name,
            nodeGraph: serializeGraph(entry.graph),
            effects: { ...entry.effects },
            view: { ...entry.view },
        })),
    };
}

// ── Ler ──────────────────────────────────────────────────────────────────────

export interface LoadedLibrary {
    library: MaterialLibrary;
    activeMaterial: string | null;
    issues: GraphIssue[];
    /**
     * O que chegou era mesmo uma biblioteca — ou um grafo antigo, que também
     * conta. `false` quer dizer que não se leu nada, e nesse caso não se pode
     * gravar por cima do que está guardado.
     */
    ok: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readView(raw: unknown): EditorView {
    if (!isRecord(raw)) return defaultView();

    return {
        x: finite(raw.x, 0),
        y: finite(raw.y, 0),
        // O zoom preso aos limites do editor: um valor absurdo gravado deixava
        // a tela impossível de encontrar, e sem maneira óbvia de voltar.
        zoom: Math.min(2.5, Math.max(0.25, finite(raw.zoom, 1))),
    };
}

/**
 * De dados gravados para a biblioteca.
 *
 * Aceita as duas formas: o documento com materiais, e o grafo único dos
 * projetos gravados antes de eles existirem. A segunda entra como um material à
 * espera de nome — ver `LEGACY_MATERIAL`.
 */
export function deserializeLibrary(raw: unknown): LoadedLibrary {
    const issues: GraphIssue[] = [];

    if (!isRecord(raw)) {
        issues.push({ code: 'NOT_A_GRAPH', detail: uiText("Os dados guardados não são um material.") });
        return { library: emptyLibrary(), activeMaterial: null, issues, ok: false };
    }

    // ── Um grafo só: a forma anterior ────────────────────────────────────
    if (!Array.isArray(raw.materials)) {
        const lido = deserializeGraph(raw);
        if (!lido.ok) {
            return { library: emptyLibrary(), activeMaterial: null, issues: lido.issues, ok: false };
        }

        return {
            library: {
                [LEGACY_MATERIAL]: {
                    id: LEGACY_MATERIAL,
                    name: LEGACY_MATERIAL,
                    graph: lido.graph,
                    effects: defaultEffects(),
                    view: defaultView(),
                },
            },
            activeMaterial: LEGACY_MATERIAL,
            issues: lido.issues,
            ok: true,
        };
    }

    // ── A biblioteca ─────────────────────────────────────────────────────
    const library: MaterialLibrary = {};

    for (const item of raw.materials) {
        if (!isRecord(item)) {
            issues.push({ code: 'BAD_NODE', detail: uiText("Um material gravado não é um objeto.") });
            continue;
        }

        const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : null;
        if (!id) {
            issues.push({ code: 'BAD_NODE', detail: uiText("Um material gravado não tem identificador.") });
            continue;
        }

        if (library[id]) {
            issues.push({ code: 'DUPLICATE_ID', detail: `Material repetido: ${id}.` });
            continue;
        }

        // Cada grafo passa pela leitura completa — versão, tipos, sockets,
        // compatibilidade. Um material com o grafo estragado não leva os outros
        // atrás: fica com o que se aproveitar, e o resto do modelo abre.
        const lido = deserializeGraph(item.nodeGraph);
        for (const issue of lido.issues) {
            issues.push({ ...issue, detail: `${id}: ${issue.detail}` });
        }

        library[id] = {
            id,
            name: typeof item.name === 'string' && item.name ? item.name : id,
            graph: lido.ok ? lido.graph : emptyGraph(),
            effects: normalizeEffects(item.effects),
            view: readView(item.view),
        };
    }

    const activo = typeof raw.activeMaterial === 'string' && library[raw.activeMaterial]
        ? raw.activeMaterial
        : Object.keys(library)[0] ?? null;

    return { library, activeMaterial: activo, issues, ok: true };
}

// ── Os materiais do modelo ───────────────────────────────────────────────────

/**
 * Garante um grafo para cada material do modelo, sem tocar nos que já existem.
 *
 * Corre quando o modelo acaba de carregar, que é o momento em que os nomes dos
 * materiais passam a ser conhecidos — o projeto chega muito antes disso. É
 * idempotente de propósito: abrir o mesmo projeto dez vezes tem de dar a mesma
 * biblioteca, e não dez grafos por material.
 *
 * O grafo que veio de um projeto da versão anterior é entregue aqui ao primeiro
 * material do modelo, que é o mais próximo que se consegue estar da intenção
 * original: nessa versão o grafo valia para o modelo inteiro.
 */
export function ensureMaterials(
    library: MaterialLibrary,
    names: string[],
    starter: () => MaterialGraph,
): MaterialLibrary {
    if (names.length === 0) return library;

    // Nada a fazer devolve o **mesmo** objeto, e não uma cópia igual. Quem ouve
    // a biblioteca compara referências: uma cópia a cada passagem punha o
    // material a ser reavaliado e a gravação automática a ver uma mudança onde
    // não houve nenhuma.
    const falta = names.some((name) => !library[name]);
    if (!falta && !library[LEGACY_MATERIAL]) return library;

    const next: MaterialLibrary = { ...library };

    // Uma variável e não uma leitura repetida: o grafo antigo é entregue **uma**
    // vez, ao primeiro material que precise de um. Sem a limpar aqui, todos os
    // materiais do modelo recebiam cópias do mesmo grafo — o vidro nasceria com
    // o material da carroçaria, e ninguém saberia de onde tinha vindo.
    let legado: MaterialEntry | undefined = next[LEGACY_MATERIAL];

    for (const name of names) {
        if (next[name]) continue;

        if (legado) {
            // O grafo único passa a ser o do primeiro material, com os efeitos
            // e a vista que trazia.
            next[name] = { ...legado, id: name, name };
            delete next[LEGACY_MATERIAL];
            legado = undefined;
            continue;
        }

        next[name] = newEntry(name, starter());
    }

    return next;
}

/**
 * O material activo, ou o primeiro que houver.
 *
 * A regra é uma só e vive aqui: o que se queria ganha se ainda existir, e senão
 * vale o primeiro. Serve para a biblioteca e serve para os materiais que o
 * modelo trouxe — o `useModelLoader` chama-a com o `materialsMap` — e é por
 * isso que ela aceita qualquer mapa por nome. Duas cópias desta decisão eram
 * duas oportunidades de a escolha guardada ser deitada fora numa delas, que foi
 * exactamente o que aconteceu: o carregador do modelo escolhia sempre o
 * primeiro, e reabrir um projeto punha a pessoa noutro material.
 *
 * Um nome que já não exista — porque se trocou de modelo — não pode ficar
 * seleccionado: o editor mostraria um grafo que não se vê em lado nenhum.
 */
export function resolveActive(byName: Record<string, unknown>, wanted: string | null): string | null {
    if (wanted && byName[wanted]) return wanted;
    return Object.keys(byName)[0] ?? null;
}
