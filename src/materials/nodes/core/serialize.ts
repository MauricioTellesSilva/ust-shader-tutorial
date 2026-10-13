import { tr as uiText } from '../../../i18n';
/**
 * O grafo como ele fica gravado, e como volta de lá.
 *
 * A forma persistida é deliberadamente independente do editor. Nada do que está
 * aqui sabe o que é um nó seleccionado, um socket sob o rato, uma ligação a ser
 * arrastada ou o nível de zoom — essas coisas são estado da interface, vivem no
 * componente, e morrem com ele. O que se grava é o material: que nós existem,
 * onde estão, com que valores, e o que está ligado a quê.
 *
 *     editor → grafo em memória → serializar → projeto (base de dados)
 *     projeto → migrar → validar → grafo em memória → editor
 *
 * As duas metades são funções puras. Um grafo pode ser gravado e lido num teste
 * sem React, sem WebGL e sem servidor, que é o que permite afirmar que o que se
 * escreveu é o que se lê.
 *
 * ## O que uma textura é aqui
 *
 * Um `assetId` do projeto, e mais nada. Nunca um caminho de ficheiro, nunca um
 * URL, nunca um `blob:` — um blob morre com a página, e uma referência que
 * morre com a página não é uma referência. Quem resolve o id é o sistema de
 * assets do projeto, com a autorização que ele já tem, pelo site ou pelo
 * HostLocal.
 */
import { migrateGraph, type GraphMigration } from './migrate';
import { getNodeDefinition, nodeOption } from './registry';
import {
    emptyGraph,
    nodeClass,
    GRAPH_VERSION,
    type ColorValue,
    type GraphNode,
    type MaterialGraph,
    type NodeClass,
    type PropertyValue,
    type SocketValue,
} from './types';
import { checkConnection } from './validate';

/** Um nó como fica gravado. */
export interface SerializedNode {
    id: string;
    type: string;
    /**
     * A classe, escrita por conveniência de quem lê.
     *
     * É derivada da categoria e **não** é lida de volta para o grafo: quem
     * manda é sempre o registo. Existe para o diagnóstico — quando um tipo
     * desaparece, isto ainda diz que género de nó ali estava, e é a diferença
     * entre "um nó desconhecido" e "um nó de cor desconhecido".
     */
    class: NodeClass;
    position: { x: number; y: number };
    inputs: Record<string, SocketValue>;
    properties: Record<string, PropertyValue>;
}

export interface SerializedConnection {
    id: string;
    sourceNodeId: string;
    sourceSocketId: string;
    targetNodeId: string;
    targetSocketId: string;
}

export interface SerializedGraph {
    graphVersion: number;
    nodes: SerializedNode[];
    connections: SerializedConnection[];
}

// ── Escrever ─────────────────────────────────────────────────────────────────

/**
 * O grafo em memória, pronto a gravar.
 *
 * Escreve campo a campo em vez de despejar o objeto. Um `JSON.stringify` do
 * grafo gravaria também o que lá aparecesse por acidente — e o dia em que
 * alguém pusesse estado de interface dentro de um nó seria o dia em que ele
 * passaria a ser gravado no projeto sem ninguém decidir isso.
 */
export function serializeGraph(graph: MaterialGraph): SerializedGraph {
    return {
        graphVersion: GRAPH_VERSION,

        nodes: graph.nodes.map((node): SerializedNode => {
            const definition = getNodeDefinition(node.type);

            return {
                id: node.id,
                type: node.type,
                class: definition ? nodeClass(definition) : 'normal',
                position: { x: node.position.x, y: node.position.y },
                inputs: { ...node.inputs },
                properties: { ...node.properties },
            };
        }),

        connections: graph.connections.map((c): SerializedConnection => ({
            id: c.id,
            sourceNodeId: c.sourceNode,
            sourceSocketId: c.sourceSocket,
            targetNodeId: c.targetNode,
            targetSocketId: c.targetSocket,
        })),
    };
}

// ── Ler ──────────────────────────────────────────────────────────────────────

export interface GraphIssue {
    code:
    | 'NOT_A_GRAPH'
    | 'FUTURE_VERSION'
    | 'MIGRATION'
    | 'BAD_NODE'
    | 'UNKNOWN_TYPE'
    | 'DUPLICATE_ID'
    | 'BAD_POSITION'
    | 'BAD_INPUT'
    | 'BAD_PROPERTY'
    | 'BAD_CONNECTION';
    detail: string;
}

export interface LoadedGraph {
    graph: MaterialGraph;
    issues: GraphIssue[];
    /**
     * O que chegou era mesmo um grafo.
     *
     * `false` quer dizer que não se leu nada — e nesse caso o chamador **não**
     * pode gravar por cima do que está guardado. Um grafo vazio a substituir um
     * grafo bom, por causa de uma leitura falhada, é a perda que este campo
     * existe para impedir.
     */
    ok: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Uma cadeia de caracteres, ou nada.
 *
 * `String(x)` transformava um objeto em "[object Object]" e um número em texto —
 * duas maneiras de inventar um id que nunca existiu. O que não é texto não é um
 * identificador, e a ligação que o usasse é recusada mais à frente.
 */
function texto(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asColor(value: unknown): ColorValue | null {
    if (!isRecord(value)) return null;
    const r = finite(value.r); const g = finite(value.g); const b = finite(value.b);
    return r === null || g === null || b === null ? null : { r, g, b };
}

/**
 * Um valor de entrada, preso ao tipo que o socket declara.
 *
 * Um número onde devia estar uma cor não é um aviso a dar mais tarde: é um
 * material que se comporta de maneira inexplicável. Vale o valor por omissão da
 * definição, que é sempre uma resposta segura, e fica nota do que aconteceu.
 */
function readInput(
    node: string,
    socket: string,
    declared: SocketValue,
    type: string,
    raw: unknown,
    issues: GraphIssue[],
): SocketValue {
    if (raw === undefined) return declared;

    if (type === 'FLOAT') {
        const value = finite(raw);
        if (value !== null) return value;
    } else if (type === 'COLOR') {
        const value = asColor(raw);
        if (value !== null) return value;
    } else if (raw === null) {
        // BSDF e NORMAL não têm valor: `null` é a resposta certa para eles.
        return null;
    }

    issues.push({
        code: 'BAD_INPUT',
        detail: uiText("{value0}.{value1}: valor inválido para {value2}, reposto no valor por omissão.", { value0: String(node), value1: String(socket), value2: String(type) }),
    });
    return declared;
}

/** Lê um nó, ou devolve `null` quando ele não é aproveitável. */
function readNode(raw: unknown, seen: Set<string>, issues: GraphIssue[]): GraphNode | null {
    if (!isRecord(raw)) {
        issues.push({ code: 'BAD_NODE', detail: uiText("Um nó gravado não é um objeto.") });
        return null;
    }

    const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null;
    const type = typeof raw.type === 'string' ? raw.type : null;

    if (!id || !type) {
        issues.push({ code: 'BAD_NODE', detail: uiText("Um nó gravado não tem id ou tipo.") });
        return null;
    }

    if (seen.has(id)) {
        // Dois nós com o mesmo id fazem as ligações apontar para o nó errado, e
        // o erro aparece muito longe da causa.
        issues.push({ code: 'DUPLICATE_ID', detail: uiText("Nó repetido: {value0}.", { value0: String(id) }) });
        return null;
    }

    const definition = getNodeDefinition(type);
    if (!definition) {
        const classe = typeof raw.class === 'string' ? ` (classe ${raw.class})` : '';
        issues.push({
            code: 'UNKNOWN_TYPE',
            detail: uiText("O tipo de nó \"{value0}\"{value1} não existe nesta versão; o nó {value2} não foi carregado.", { value0: String(type), value1: String(classe), value2: String(id) }),
        });
        return null;
    }

    // ── Posição ──────────────────────────────────────────────────────────
    const position = isRecord(raw.position) ? raw.position : {};
    let x = finite(position.x);
    let y = finite(position.y);

    if (x === null || y === null) {
        issues.push({ code: 'BAD_POSITION', detail: uiText("Posição inválida no nó {value0}; posto na origem.", { value0: String(id) }) });
        x = x ?? 0;
        y = y ?? 0;
    }

    // ── Entradas ─────────────────────────────────────────────────────────
    //
    // Percorre-se a **definição** e não o que está gravado: uma entrada que
    // desapareceu do tipo não entra, e uma que apareceu depois nasce com o seu
    // valor por omissão em vez de ficar por preencher.
    const storedInputs = isRecord(raw.inputs) ? raw.inputs : {};
    const inputs: Record<string, SocketValue> = {};

    for (const input of definition.inputs) {
        inputs[input.id] = readInput(
            id, input.id, input.defaultValue, input.type, storedInputs[input.id], issues,
        );
        if (definition.clampInputs && typeof inputs[input.id] === 'number') {
            inputs[input.id] = Math.min(input.max ?? Infinity, Math.max(input.min ?? -Infinity, inputs[input.id] as number));
        }
    }

    // ── Propriedades ─────────────────────────────────────────────────────
    const storedProps = isRecord(raw.properties) ? raw.properties : {};
    const properties: Record<string, PropertyValue> = { ...definition.properties };

    for (const key of Object.keys(definition.properties ?? {})) {
        const value = storedProps[key];
        if (value === undefined) continue;

        if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            properties[key] = value;
        } else {
            issues.push({ code: 'BAD_PROPERTY', detail: uiText("{value0}.{value1}: propriedade inválida, ignorada.", { value0: String(id), value1: String(key) }) });
        }
    }

    // As escolhas fechadas passam pelo validador do registo: uma que já não
    // exista na lista vale a primeira, em vez de chegar ao gerador de shader.
    for (const option of definition.options ?? []) {
        const antes = storedProps[option.key];
        properties[option.key] = nodeOption(
            { type, properties: storedProps as Record<string, PropertyValue> },
            option.key,
        );

        if (typeof antes === 'string' && antes !== properties[option.key]) {
            issues.push({
                code: 'BAD_PROPERTY',
                detail: uiText("{value0}.{value1}: \"{value2}\" não é uma escolha válida; ficou \"{value3}\".", { value0: String(id), value1: String(option.key), value2: String(antes), value3: String(properties[option.key]) }),
            });
        }
    }

    seen.add(id);
    return { id, type, position: { x, y }, inputs, properties };
}

/**
 * De dados gravados para um grafo utilizável.
 *
 * Migra, valida, e devolve o que sobrou com a lista do que não sobreviveu.
 * Nunca lança: um projeto com um material estragado tem de abrir na mesma — o
 * material corrige-se, um projeto que não abre não.
 */
export function deserializeGraph(
    raw: unknown,
    chain?: Record<number, GraphMigration>,
): LoadedGraph {
    const issues: GraphIssue[] = [];

    if (!isRecord(raw) || !Array.isArray(raw.nodes)) {
        issues.push({ code: 'NOT_A_GRAPH', detail: uiText("Os dados guardados não são um grafo de material.") });
        return { graph: emptyGraph(), issues, ok: false };
    }

    // ── Versão ───────────────────────────────────────────────────────────
    const migration = migrateGraph(raw, chain);
    for (const note of migration.notes) issues.push({ code: 'MIGRATION', detail: note });

    if (migration.to > GRAPH_VERSION) {
        // Um grafo de uma versão futura lê-se pelo melhor esforço: os nós que
        // esta versão conhece entram, o resto fica em nota. Recusá-lo por
        // inteiro era garantir que abrir o projeto na versão antiga o deixava
        // sem material nenhum.
        issues.push({
            code: 'FUTURE_VERSION',
            detail: uiText("Alguns nós podem não aparecer até a aplicação ser actualizada."),
        });
    }

    const migrated = migration.raw;
    const rawNodes = Array.isArray(migrated.nodes) ? migrated.nodes : [];
    const rawConnections = Array.isArray(migrated.connections) ? migrated.connections : [];

    // ── Nós ──────────────────────────────────────────────────────────────
    const seen = new Set<string>();
    const nodes: GraphNode[] = [];

    for (const item of rawNodes) {
        const node = readNode(item, seen, issues);
        if (node) nodes.push(node);
    }

    // ── Ligações ─────────────────────────────────────────────────────────
    //
    // Cada uma passa pelo mesmo `checkConnection` que o editor usa quando
    // alguém a faz à mão. Uma ligação gravada não tem mais direitos do que uma
    // ligação feita agora — e é assim que uma incompatibilidade de tipos que
    // tenha entrado por outro caminho não sobrevive à leitura.
    let graph: MaterialGraph = { graphVersion: GRAPH_VERSION, nodes, connections: [] };

    for (const item of rawConnections) {
        if (!isRecord(item)) {
            issues.push({ code: 'BAD_CONNECTION', detail: uiText("Uma ligação gravada não é um objeto.") });
            continue;
        }

        // Os dois nomes por que uma ligação já foi gravada. O `sourceNodeId` é
        // o que o cliente escreve hoje; o `sourceNode` é o que está nos
        // projetos gravados antes da mudança, e continua a ler-se.
        const request = {
            sourceNode: texto(item.sourceNodeId ?? item.sourceNode),
            sourceSocket: texto(item.sourceSocketId ?? item.sourceSocket),
            targetNode: texto(item.targetNodeId ?? item.targetNode),
            targetSocket: texto(item.targetSocketId ?? item.targetSocket),
        };

        const check = checkConnection(graph, request);
        if (!check.ok) {
            issues.push({
                code: 'BAD_CONNECTION',
                detail: `${request.sourceNode}.${request.sourceSocket} → ${request.targetNode}.${request.targetSocket}: ${check.message ?? 'recusada'}`,
            });
            continue;
        }

        const id = typeof item.id === 'string' && item.id.length > 0
            ? item.id
            : `conn_${graph.connections.length}`;

        graph = {
            ...graph,
            connections: [
                // Uma entrada aceita uma ligação e só uma, tal como no editor.
                ...graph.connections.filter(
                    (c) => !(c.targetNode === request.targetNode && c.targetSocket === request.targetSocket),
                ),
                { id, ...request },
            ],
        };
    }

    return { graph, issues, ok: true };
}
