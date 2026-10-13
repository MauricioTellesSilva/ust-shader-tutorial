/**
 * O registo dos tipos de nó.
 *
 * Aqui está a infra-estrutura e mais nada: guardar definições, encontrá-las,
 * criar nós a partir delas. **Nenhum tipo de nó é declarado neste ficheiro** —
 * as implementações vivem nas pastas por categoria (`Color/`, `Texture/`,
 * `Shader/`, `Input/`) e entram por `registerNode`. Um registo que também
 * contivesse as implementações voltaria a ser o ficheiro enorme que se está a
 * evitar, e um nó novo continuaria a obrigar a mexer no meio dele.
 *
 * Um nó novo entra pelo registo e mais nada muda: nem o editor, nem a
 * serialização, nem a validação de ligações. Todos eles perguntam ao registo o
 * que um tipo tem, em vez de trazerem a resposta escrita. É a diferença entre
 * acrescentar um nó e reescrever o editor.
 *
 * Por isso não há aqui — nem em lado nenhum — condições do género
 * `if (node.type === 'principled' && socket === 'roughness')`. Uma entrada é uma
 * entrada: tem um tipo, um valor por omissão e, talvez, uma ligação.
 */
import type { GraphNode, NodeDefinition } from './types';

const definitions = new Map<string, NodeDefinition>();

export function registerNode(definition: NodeDefinition) {
    definitions.set(definition.type, definition);
}

/** Regista uma pasta inteira de uma vez. Ver `Color/index.ts` e as irmãs. */
export function registerNodes(list: NodeDefinition[]) {
    for (const definition of list) registerNode(definition);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
    return definitions.get(type);
}

export function allNodeDefinitions(): NodeDefinition[] {
    return [...definitions.values()];
}

/**
 * O valor de uma propriedade de escolha fechada, verificado contra a lista.
 *
 * Uma escolha que não esteja na lista — porque o grafo foi gravado por outra
 * versão, ou porque alguém lhe mexeu — vale a primeira da lista. É a única
 * porta por onde uma propriedade chega ao gerador de GLSL, e é por isso que ela
 * é estreita: o que sai daqui está sempre dentro do que a definição declarou.
 */
export function nodeOption(node: Pick<GraphNode, 'type' | 'properties'>, key: string): string {
    const definition = definitions.get(node.type);
    const option = definition?.options?.find((o) => o.key === key);
    if (!option || option.options.length === 0) return '';

    const stored = node.properties[key];
    if (typeof stored === 'string' && option.options.some((o) => o.value === stored)) return stored;

    return option.options[0].value;
}

// ── Criar nós ────────────────────────────────────────────────────────────────

let sequence = 0;

/**
 * Um identificador estável, único dentro do grafo.
 *
 * O contador reinicia a cada sessão, e por isso leva o instante: dois nós
 * criados em sessões diferentes não podem colidir quando o mesmo grafo é
 * editado em duas máquinas.
 */
export function nextNodeId(): string {
    sequence += 1;
    return `node_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export function nextConnectionId(): string {
    sequence += 1;
    return `conn_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

/** Um nó novo do tipo pedido, com os valores por omissão da definição. */
export function createNode(type: string, position: { x: number; y: number }): GraphNode | null {
    const definition = definitions.get(type);
    if (!definition) return null;

    const inputs: GraphNode['inputs'] = {};
    for (const input of definition.inputs) inputs[input.id] = input.defaultValue;

    const properties: GraphNode['properties'] = { ...definition.properties };
    // Uma escolha fechada nasce na primeira da lista, e não em `undefined`: um
    // nó acabado de criar tem de descrever alguma coisa.
    for (const option of definition.options ?? []) {
        if (properties[option.key] === undefined) {
            properties[option.key] = option.options[0]?.value ?? null;
        }
    }

    return { id: nextNodeId(), type, position, inputs, properties };
}
