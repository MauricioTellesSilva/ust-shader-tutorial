/**
 * Do grafo para uma descrição de material, no CPU.
 *
 * Esta camada não conhece o Three.js nem o React: entra um grafo, sai um
 * `MaterialDefinition`. É o que permite testá-la sem WebGL, sem canvas e sem
 * montar interface nenhuma — e é o que impede o editor de criar materiais por
 * conta própria.
 *
 * ## Onde ela acaba e a placa gráfica começa
 *
 * Aqui fica o que se calcula uma vez por mudança: que nó alimenta que entrada,
 * que textura vai para que canal, que número vale um parâmetro. O que varia por
 * píxel — um ruído, uma rampa de cor, um contraste — **não** é calculado aqui:
 * é compilado para GLSL em `compile.ts` e corre na placa gráfica. Reduzir um
 * ruído procedimental a um número no CPU seria inventar uma resposta; gerar uma
 * textura no CPU a cada mexida num deslizador seria pior.
 *
 * ## Como se lê o grafo
 *
 * Ao contrário, a partir do Material Output: pergunta-se o que está ligado à
 * superfície, depois o que está ligado às entradas desse nó, e assim por
 * diante. Um grafo com nós soltos avalia-se na mesma — o que não chega ao
 * Material Output não conta, exactamente como no Blender.
 *
 * ## Nenhum tipo de nó aparece aqui
 *
 * Nem um. O avaliador pede à definição registada que se avalie a si própria, e
 * a definição vive na pasta do nó. Não há — nem pode haver — um
 * `if (node.type === 'principled' && socket === 'roughness')`: acrescentar um
 * nó não toca neste ficheiro.
 *
 * ## Ligado e não ligado
 *
 * A distinção é a peça central. Uma entrada sem ligação usa o seu valor; uma
 * entrada com ligação usa o que vem de trás e **ignora** o valor guardado. É
 * também o que a interface precisa de saber para desligar o deslizador de um
 * parâmetro que passou a ser controlado por um nó — daí o mapa `driven`.
 */
import { gpuChannels } from './compile';
import { getNodeDefinition, nodeOption } from './registry';
import {
    defaultMaterialDefinition,
    type ColorValue,
    type EvalContext,
    type GraphNode,
    type MaterialDefinition,
    type MaterialGraph,
    type Resolved,
    type SocketValue,
} from './types';

function asNumber(value: SocketValue, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asColor(value: SocketValue, fallback: ColorValue): ColorValue {
    if (value && typeof value === 'object' && 'r' in value) return value;
    return fallback;
}

class Evaluator {
    /** Um nó avaliado uma vez por passagem: um valor usado em três sítios lê-se uma vez. */
    private readonly cache = new Map<string, Record<string, Resolved>>();

    private readonly graph: MaterialGraph;

    constructor(graph: MaterialGraph) {
        this.graph = graph;
    }

    /** A ligação que alimenta esta entrada, se houver. */
    private incoming(nodeId: string, socket: string) {
        return this.graph.connections.find(
            (c) => c.targetNode === nodeId && c.targetSocket === socket,
        );
    }

    /** O que chega a uma entrada, ou `null` quando ela não está ligada. */
    private arriving(node: GraphNode, socket: string): Resolved | null {
        const link = this.incoming(node.id, socket);
        if (!link) return null;

        const source = this.graph.nodes.find((n) => n.id === link.sourceNode);
        if (!source) return null;

        return this.evaluate(source)[link.sourceSocket] ?? null;
    }

    private evaluate(node: GraphNode): Record<string, Resolved> {
        const cached = this.cache.get(node.id);
        if (cached) return cached;

        // Escrito antes de descer, para que um ciclo que tenha escapado à
        // validação pare aqui em vez de esgotar a pilha.
        this.cache.set(node.id, {});

        const definition = getNodeDefinition(node.type);
        const outputs = definition?.evaluate?.(this.context(node)) ?? {};

        this.cache.set(node.id, outputs);
        return outputs;
    }

    private context(node: GraphNode): EvalContext {
        const definition = getNodeDefinition(node.type);

        const fallback = (socket: string): SocketValue =>
            definition?.inputs.find((i) => i.id === socket)?.defaultValue ?? null;

        return {
            node,
            incoming: (socket) => this.arriving(node, socket),

            float: (socket) => {
                const link = this.arriving(node, socket);
                if (link && typeof link.number === 'number') return link.number;
                return asNumber(node.inputs[socket], asNumber(fallback(socket), 0));
            },

            rgb: (socket) => {
                const link = this.arriving(node, socket);
                if (link?.color) return link.color;
                return asColor(node.inputs[socket], asColor(fallback(socket), { r: 1, g: 1, b: 1 }));
            },

            option: (key) => nodeOption(node, key),

            text: (key) => {
                const value = node.properties[key];
                return typeof value === 'string' && value.length > 0 ? value : null;
            },
        };
    }

    /** O nó de shader ligado à saída de material, se houver um. */
    private shaderNode(): GraphNode | null {
        const output = this.graph.nodes.find((n) => getNodeDefinition(n.type)?.unique);
        if (!output) return null;

        const link = this.incoming(output.id, 'surface');
        if (!link) return null;

        return this.graph.nodes.find((n) => n.id === link.sourceNode) ?? null;
    }

    surface(): MaterialDefinition {
        const definition = defaultMaterialDefinition();

        const shader = this.shaderNode();
        if (!shader) return definition;

        const produced = this.evaluate(shader);

        // A superfície sai por uma saída de tipo BSDF, seja ela qual for: um
        // Principled tem uma, um Mix Shader tem outra, e o avaliador não
        // precisa de saber os nomes.
        const surface = Object.values(produced).find((r) => r.surface)?.surface;
        if (surface) Object.assign(definition, surface);

        // ── Quem manda em quê ────────────────────────────────────────────
        //
        // Uma entrada com ligação é uma entrada cujo valor deixou de ser o
        // guardado. A interface lê isto para desactivar o deslizador
        // correspondente: duas fontes de verdade para o mesmo número é o que se
        // está a evitar.
        const driven: Record<string, boolean> = {};
        for (const input of getNodeDefinition(shader.type)?.inputs ?? []) {
            driven[input.id] = this.incoming(shader.id, input.id) !== undefined;
        }

        // E os canais que passaram a ser calculados na placa gráfica, que
        // também deixaram de responder ao deslizador — mesmo quando quem os
        // alimenta não é uma entrada do nó de shader, como no Mix Shader.
        for (const channel of gpuChannels(this.graph)) driven[channel] = true;

        definition.driven = driven;
        return definition;
    }
}

/** Avalia o grafo e devolve o material que ele descreve. */
export function evaluateGraph(graph: MaterialGraph): MaterialDefinition {
    return new Evaluator(graph).surface();
}

/**
 * Que entradas do nó de shader estão a ser controladas por uma ligação.
 *
 * A interface precisa disto para desligar o deslizador de um parâmetro que
 * passou a vir de um nó — duas fontes para o mesmo valor é o que se está a
 * evitar.
 */
export function drivenInputs(graph: MaterialGraph): Record<string, boolean> {
    return evaluateGraph(graph).driven;
}
