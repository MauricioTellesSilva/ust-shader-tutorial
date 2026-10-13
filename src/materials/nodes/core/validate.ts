import { tr as uiText } from '../../../i18n';
/**
 * O que pode ligar a quê.
 *
 * Uma ligação recusada é um aborrecimento; uma ligação aceite que não devia ter
 * sido é um projeto que abre partido, possivelmente muito depois de ter sido
 * gravado. Por isso a validação corre antes de a ligação entrar no grafo, e não
 * quando alguém tenta desenhá-la.
 */
import { getNodeDefinition } from './registry';
import type { MaterialGraph, SocketType } from './types';

export interface ConnectionRequest {
    sourceNode: string;
    sourceSocket: string;
    targetNode: string;
    targetSocket: string;
}

export type ConnectionRejection =
    | 'NODE_NOT_FOUND'
    | 'SOCKET_NOT_FOUND'
    | 'TYPE_MISMATCH'
    | 'SELF_CONNECTION'
    | 'CYCLE';

export interface ConnectionCheck {
    ok: boolean;
    reason?: ConnectionRejection;
    message?: string;
}

/**
 * Conversões que existem porque foram escritas, e não por acidente.
 *
 * A regra é a igualdade; as excepções estão todas aqui, à vista. Deixar um
 * COLOR entrar num FLOAT "porque dá" é como se acaba com uma imagem de cor a
 * ser lida como rugosidade sem ninguém ter decidido isso — que é precisamente
 * a razão de o nó de textura ter uma saída FLOAT própria.
 */
const CONVERSIONS: Partial<Record<SocketType, SocketType[]>> = {
    // Nenhuma, nesta versão. A tabela existe para a próxima ter onde entrar.
};

export function typesCompatible(from: SocketType, to: SocketType): boolean {
    if (from === to) return true;
    return (CONVERSIONS[from] ?? []).includes(to);
}

/** Segue as ligações para trás à procura de `target`. */
function reaches(graph: MaterialGraph, from: string, target: string, seen = new Set<string>()): boolean {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);

    return graph.connections
        .filter((c) => c.targetNode === from)
        .some((c) => reaches(graph, c.sourceNode, target, seen));
}

export function checkConnection(graph: MaterialGraph, request: ConnectionRequest): ConnectionCheck {
    if (request.sourceNode === request.targetNode) {
        return { ok: false, reason: 'SELF_CONNECTION', get message() { return uiText("Um nó não se liga a si próprio."); } };
    }

    const source = graph.nodes.find((n) => n.id === request.sourceNode);
    const target = graph.nodes.find((n) => n.id === request.targetNode);
    if (!source || !target) {
        return { ok: false, reason: 'NODE_NOT_FOUND', get message() { return uiText("O nó não existe no grafo."); } };
    }

    const sourceDef = getNodeDefinition(source.type);
    const targetDef = getNodeDefinition(target.type);
    if (!sourceDef || !targetDef) {
        return { ok: false, reason: 'NODE_NOT_FOUND', get message() { return uiText("Tipo de nó desconhecido."); } };
    }

    const output = sourceDef.outputs.find((o) => o.id === request.sourceSocket);
    const input = targetDef.inputs.find((i) => i.id === request.targetSocket);
    if (!output || !input) {
        return { ok: false, reason: 'SOCKET_NOT_FOUND', get message() { return uiText("A entrada ou a saída não existe."); } };
    }

    if (!typesCompatible(output.type, input.type)) {
        return {
            ok: false,
            reason: 'TYPE_MISMATCH',
            message: uiText("{value0} não liga a {value1}.", { value0: String(output.type), value1: String(input.type) }),
        };
    }

    // Um ciclo faz a avaliação andar à roda para sempre. Recusa-se a ligação
    // que o fecharia, e não o grafo depois de ele já estar lá.
    if (reaches(graph, request.sourceNode, request.targetNode)) {
        return { ok: false, reason: 'CYCLE', message: 'That would create a cycle in the graph.' };
    }

    return { ok: true };
}

/**
 * Acrescenta a ligação, tirando a que já ocupava a entrada.
 *
 * Uma entrada aceita uma ligação e só uma — é o comportamento do Blender, e o
 * único que faz sentido: duas coisas a alimentar a mesma rugosidade não têm
 * resposta. A nova ganha, porque quem acabou de a fazer estava a dizer o que
 * quer agora.
 */
export function connect(graph: MaterialGraph, request: ConnectionRequest, id: string): MaterialGraph {
    const check = checkConnection(graph, request);
    if (!check.ok) return graph;

    return {
        ...graph,
        connections: [
            ...graph.connections.filter(
                (c) => !(c.targetNode === request.targetNode && c.targetSocket === request.targetSocket),
            ),
            { id, ...request },
        ],
    };
}

export function disconnect(graph: MaterialGraph, connectionId: string): MaterialGraph {
    return { ...graph, connections: graph.connections.filter((c) => c.id !== connectionId) };
}

/** Apaga o nó e tudo o que lhe estava ligado — de um lado e do outro. */
export function removeNode(graph: MaterialGraph, nodeId: string): MaterialGraph {
    return {
        ...graph,
        nodes: graph.nodes.filter((n) => n.id !== nodeId),
        connections: graph.connections.filter(
            (c) => c.sourceNode !== nodeId && c.targetNode !== nodeId,
        ),
    };
}

/**
 * Limpa um grafo vindo de fora.
 *
 * Um grafo gravado por uma versão anterior — ou adulterado — pode ter nós de
 * tipos que já não existem e ligações para sockets que desapareceram. Em vez de
 * recusar o projeto inteiro, deita-se fora o que não se reconhece: um material
 * incompleto ainda se abre e corrige-se, um projeto que não abre não.
 */
export function sanitizeGraph(graph: MaterialGraph): MaterialGraph {
    const nodes = graph.nodes.filter((n) => getNodeDefinition(n.type));
    const ids = new Set(nodes.map((n) => n.id));

    const connections = graph.connections.filter((c) => {
        if (!ids.has(c.sourceNode) || !ids.has(c.targetNode)) return false;

        const source = nodes.find((n) => n.id === c.sourceNode)!;
        const target = nodes.find((n) => n.id === c.targetNode)!;
        const sourceDef = getNodeDefinition(source.type)!;
        const targetDef = getNodeDefinition(target.type)!;

        const output = sourceDef.outputs.find((o) => o.id === c.sourceSocket);
        const input = targetDef.inputs.find((i) => i.id === c.targetSocket);

        return !!output && !!input && typesCompatible(output.type, input.type);
    });

    return { ...graph, nodes, connections };
}
