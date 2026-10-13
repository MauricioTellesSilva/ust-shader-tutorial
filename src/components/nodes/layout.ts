/**
 * Geometria e cores partilhadas pelo editor e pelas caixas de nó.
 *
 * Num ficheiro próprio porque as duas coisas precisam delas: o editor para
 * saber onde desenhar as linhas, a caixa para saber onde pôr os sockets. Se
 * cada um tivesse as suas medidas, uma linha começaria a três píxeis do ponto
 * onde a bola está desenhada — e ninguém saberia qual dos dois estava errado.
 */
import {
    getNodeDefinition,
    nodeClass,
    type GraphNode,
    type NodeClass,
    type NodeDefinition,
    type SocketType,
} from '../../materials/nodes';

export const NODE_WIDTH = 200;
export const NODE_HEADER = 28;
export const SOCKET_SPACING = 26;

/**
 * A altura de uma linha de propriedade — o selector de imagem, um menu de
 * escolha fechada.
 *
 * Tem de bater certo com o `.ne-propriedade` do CSS. As propriedades ficam
 * entre as entradas e as saídas, e por isso empurram as saídas para baixo: uma
 * medida errada aqui põe a linha a chegar ao sítio onde a bola do socket
 * costumava estar, e não onde ela está.
 */
export const PROPERTY_ROW = 30;
export const IMAGE_PROPERTY_HEIGHT = 188;

/**
 * A cor de cada tipo, a mesma no socket e na linha que dele sai.
 *
 * É o que deixa ver de relance o que uma ligação transporta sem ter de seguir
 * a linha até às pontas — a convenção de qualquer editor de nós.
 */
export const SOCKET_COLORS: Record<SocketType, string> = {
    FLOAT: '#9d9d9d',
    COLOR: '#e6c34a',
    NORMAL: '#6a7be6',
    BSDF: '#2ce679',
    DISPLACEMENT: '#cb7be6',
};

/**
 * A cor do cabeçalho de cada classe de nó.
 *
 * Aqui, e só aqui. Mudar a identidade de uma família inteira é mudar uma linha
 * desta tabela — e é essa a razão de ela existir, em vez de cada nó trazer a sua
 * cor escrita. Um nó não sabe de que cor é; sabe a que classe pertence, e a
 * classe sai da categoria que ele declara. Ver `nodeClass`.
 *
 * Os tons são deste editor e não inventados: o verde é o do socket BSDF, o
 * cinzento é o do socket FLOAT — o mesmo `--text-muted` do resto da aplicação —,
 * o roxo é a família do socket NORMAL puxada para o violeta, e o laranja é o
 * dourado do socket COLOR levado a laranja. Vê-se um grafo e as ligações
 * concordam com os cabeçalhos, que é o que se quer de um código de cores.
 *
 * Todos escuros o suficiente para o texto claro do cabeçalho se ler por cima —
 * nos dois temas, porque um cabeçalho colorido é uma etiqueta e não uma
 * superfície do tema.
 */
export const NODE_CLASS_COLORS: Record<NodeClass, string> = {
    normal: '#7d6ae6',
    value: '#5a5a5a',
    color: '#c8792e',
    shader: '#2e8c52',
};

/** A cor do cabeçalho de um nó, resolvida pela sua classe. */
export function headerColor(definition: NodeDefinition): string {
    return NODE_CLASS_COLORS[nodeClass(definition)];
}

/** Quantas linhas de propriedade uma definição desenha. */
export function propertyRows(definition: NodeDefinition): number {
    const image = 'assetId' in (definition.properties ?? {}) ? 1 : 0;
    return image + (definition.options?.length ?? 0);
}

/** Onde um socket cai, em coordenadas do grafo. */
export function socketPosition(
    node: GraphNode,
    socketId: string,
    side: 'input' | 'output',
): { x: number; y: number } | null {
    const definition = getNodeDefinition(node.type);
    if (!definition) return null;

    const list = side === 'input' ? definition.inputs : definition.outputs;
    const index = list.findIndex((s) => s.id === socketId);
    if (index < 0) return null;

    // As saídas vêm depois das entradas **e** das propriedades na caixa, e por
    // isso deslocam-se pela altura que umas e outras ocupam.
    const above = side === 'output'
        ? definition.inputs.length * SOCKET_SPACING + propertyRows(definition) * PROPERTY_ROW
            + ('assetId' in (definition.properties ?? {}) ? IMAGE_PROPERTY_HEIGHT - PROPERTY_ROW : 0)
        : 0;

    return {
        x: node.position.x + (side === 'input' ? 0 : NODE_WIDTH),
        y: node.position.y + NODE_HEADER + above + index * SOCKET_SPACING + SOCKET_SPACING / 2,
    };
}
