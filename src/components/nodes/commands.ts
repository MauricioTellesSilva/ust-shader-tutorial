/**
 * As operações do editor sobre um grafo — duplicar, copiar, colar, cortar,
 * apagar, seleccionar tudo.
 *
 * Funções puras: recebem um grafo e uma selecção, devolvem um grafo e uma
 * selecção. Não sabem o que é o React, nem o store, nem o rato, nem uma tecla.
 * Isso é de propósito, e é o que permite afirmar num teste que colar um grupo
 * preserva as ligações internas sem montar um editor.
 *
 *     tecla → atalho (shortcuts.ts) → **comando (isto)** → grafo → store
 *
 * ## Só o grafo activo
 *
 * Nenhuma destas funções conhece a biblioteca de materiais. Recebem **um**
 * grafo, que é sempre o do material seleccionado, e por isso não há por onde
 * uma operação alcançar o grafo de outro material. Não é uma regra a lembrar:
 * é uma consequência da assinatura.
 *
 * ## Identificadores novos, sempre
 *
 * Duplicar e colar geram identificadores novos para tudo o que criam. Reutilizar
 * os antigos daria dois nós com o mesmo id no mesmo grafo — e a partir daí as
 * ligações apontam para o primeiro que aparecer, o que é quase sempre o errado,
 * e o defeito só se vê quando o projeto voltar a abrir.
 */
import {
    getNodeDefinition,
    nextConnectionId,
    nextNodeId,
    type GraphConnection,
    type GraphNode,
    type MaterialGraph,
} from '../../materials/nodes';

/** Quanto uma cópia se afasta do original, quando não há cursor a mandar. */
export const OFFSET = 28;

/**
 * O que fica na área de transferência do editor.
 *
 * Do editor, e não do sistema. É a área de transferência interna que o pedido
 * descreve, e há uma boa razão além da simplicidade: a do sistema é assíncrona,
 * pede autorização em alguns browsers, e é partilhada com tudo o resto — copiar
 * três nós não devia deitar fora o que a pessoa tinha copiado do editor de
 * texto ao lado.
 *
 * As posições ficam **relativas** ao canto do grupo. É isso que faz colar
 * funcionar em qualquer sítio da tela: o que se guardou foi a forma do grupo, e
 * não onde ele estava.
 */
export interface Clip {
    nodes: GraphNode[];
    connections: GraphConnection[];
}

export interface Result {
    graph: MaterialGraph;
    /** O que fica seleccionado depois da operação. */
    selection: string[];
}

/** Um nó não se apaga nem se repete quando o seu tipo é único no grafo. */
function protegido(node: GraphNode): boolean {
    return !!getNodeDefinition(node.type)?.unique;
}

function byId(graph: MaterialGraph, ids: Iterable<string>): GraphNode[] {
    const querido = new Set(ids);
    return graph.nodes.filter((n) => querido.has(n.id));
}

/**
 * O canto do que seria duplicado, para duplicar **sem salto**.
 *
 * Serve o `Shift+D` interactivo: a cópia nasce exactamente por cima do
 * original e a partir daí segue o cursor. Nascer já deslocada dava um salto
 * antes do primeiro movimento do rato, e o salto lê-se como um erro.
 */
export function selectionCorner(graph: MaterialGraph, ids: string[]): { x: number; y: number } | null {
    const nodes = byId(graph, ids).filter((n) => !protegido(n));
    return nodes.length > 0 ? corner(nodes) : null;
}

/** O canto superior esquerdo do grupo. A âncora de tudo o que se cola. */
export function corner(nodes: GraphNode[]): { x: number; y: number } {
    if (nodes.length === 0) return { x: 0, y: 0 };

    return {
        x: Math.min(...nodes.map((n) => n.position.x)),
        y: Math.min(...nodes.map((n) => n.position.y)),
    };
}

/**
 * As ligações **inteiramente** dentro de um conjunto de nós.
 *
 * As duas pontas, e não uma. Uma ligação com uma ponta de fora não é uma
 * ligação do grupo: copiada, teria de apontar ou para o nó original — e então o
 * grupo colado ficaria preso ao sítio de onde veio — ou para o nada. Nenhuma
 * das duas é o que alguém quis dizer ao carregar em copiar.
 */
function internas(graph: MaterialGraph, ids: Set<string>): GraphConnection[] {
    return graph.connections.filter((c) => ids.has(c.sourceNode) && ids.has(c.targetNode));
}

/**
 * Uma cópia de um grupo de nós, com identificadores novos e as posições postas
 * a contar do canto do grupo.
 *
 * O coração do duplicar e do colar, que são a mesma operação com âncoras
 * diferentes.
 */
function clonar(nodes: GraphNode[], connections: GraphConnection[], at: { x: number; y: number }) {
    const base = corner(nodes);
    const novoId = new Map<string, string>();

    const novos = nodes.map((node): GraphNode => {
        const id = nextNodeId();
        novoId.set(node.id, id);

        return {
            id,
            type: node.type,
            // Relativo ao canto e depois posto no destino: é isto que preserva
            // o espaçamento interno do grupo, que é a única coisa que uma
            // pessoa reconhece quando vê o resultado.
            position: {
                x: at.x + (node.position.x - base.x),
                y: at.y + (node.position.y - base.y),
            },
            // Cópias e não referências: mexer no duplicado não pode mexer no
            // original, e os dois partilhariam o mesmo objeto de entradas.
            inputs: { ...node.inputs },
            // As propriedades vão inteiras, e é assim que a textura escolhida
            // acompanha o nó — o `assetId` é uma referência a um asset do
            // projeto, e o duplicado aponta para o mesmo ficheiro.
            properties: { ...node.properties },
        };
    });

    const novasLigacoes = connections
        .filter((c) => novoId.has(c.sourceNode) && novoId.has(c.targetNode))
        .map((c): GraphConnection => ({
            id: nextConnectionId(),
            sourceNode: novoId.get(c.sourceNode)!,
            sourceSocket: c.sourceSocket,
            targetNode: novoId.get(c.targetNode)!,
            targetSocket: c.targetSocket,
        }));

    return { nodes: novos, connections: novasLigacoes };
}

// ── Seleccionar ──────────────────────────────────────────────────────────────

/** Todos os nós **deste** grafo, que é o do material seleccionado e mais nenhum. */
export function selectAll(graph: MaterialGraph): string[] {
    return graph.nodes.map((n) => n.id);
}

// ── Copiar ───────────────────────────────────────────────────────────────────

/**
 * O que se guarda ao copiar.
 *
 * Sem os nós únicos: um Material Output copiado só podia ser colado num grafo
 * que ainda não tivesse nenhum, e todos têm. Deixá-lo entrar era guardar uma
 * peça que a colagem teria sempre de recusar.
 */
export function copyNodes(graph: MaterialGraph, ids: string[]): Clip | null {
    const nodes = byId(graph, ids).filter((n) => !protegido(n));
    if (nodes.length === 0) return null;

    const conjunto = new Set(nodes.map((n) => n.id));

    return {
        nodes: nodes.map((n) => ({ ...n, inputs: { ...n.inputs }, properties: { ...n.properties } })),
        connections: internas(graph, conjunto),
    };
}

// ── Colar ────────────────────────────────────────────────────────────────────

/**
 * Cola o grupo com o canto no ponto dado — que é sempre o cursor.
 *
 * O canto e não o centro. Um nó criado pelo menu nasce com o seu canto superior
 * esquerdo no cursor, porque é assim que a caixa é desenhada, e um grupo colado
 * a partir do centro apareceria meio acima e meio à esquerda do sítio onde se
 * carregou. Duas regras diferentes para o mesmo gesto seriam duas coisas para
 * aprender.
 */
export function pasteClip(
    graph: MaterialGraph,
    clip: Clip | null,
    at: { x: number; y: number },
): Result | null {
    if (!clip || clip.nodes.length === 0) return null;

    const { nodes, connections } = clonar(clip.nodes, clip.connections, at);

    return {
        graph: {
            ...graph,
            nodes: [...graph.nodes, ...nodes],
            connections: [...graph.connections, ...connections],
        },
        selection: nodes.map((n) => n.id),
    };
}

// ── Duplicar ─────────────────────────────────────────────────────────────────

/**
 * Duplica a selecção, deslocada, e devolve as cópias seleccionadas.
 *
 * As ligações **para fora** não são copiadas — só as que ficam inteiramente
 * dentro do grupo. Ligar automaticamente o duplicado ao que o original tinha à
 * frente decidia por quem duplicou: em metade dos casos quer-se uma variante ao
 * lado, e nessa metade as ligações automáticas teriam de ser desfeitas uma a
 * uma.
 */
export function duplicateNodes(
    graph: MaterialGraph,
    ids: string[],
    at?: { x: number; y: number },
): Result | null {
    const nodes = byId(graph, ids).filter((n) => !protegido(n));
    if (nodes.length === 0) return null;

    const conjunto = new Set(nodes.map((n) => n.id));
    const base = corner(nodes);
    const destino = at ?? { x: base.x + OFFSET, y: base.y + OFFSET };

    const clone = clonar(nodes, internas(graph, conjunto), destino);

    return {
        graph: {
            ...graph,
            nodes: [...graph.nodes, ...clone.nodes],
            connections: [...graph.connections, ...clone.connections],
        },
        selection: clone.nodes.map((n) => n.id),
    };
}

// ── Apagar ───────────────────────────────────────────────────────────────────

export interface Removal extends Result {
    /** Quantos ficaram por apagar por serem únicos. Para o aviso. */
    protegidos: number;
}

/**
 * Tira os nós e, com eles, as ligações que lhes tocavam.
 *
 * As ligações têm de sair com os nós: uma que ficasse a apontar para um nó que
 * já não existe não se veria no ecrã e seria recusada na leitura seguinte — o
 * material voltaria diferente do que estava, sem nada a explicar porquê.
 */
export function deleteNodes(graph: MaterialGraph, ids: string[]): Removal {
    const pedidos = byId(graph, ids);
    const apagar = new Set(pedidos.filter((n) => !protegido(n)).map((n) => n.id));

    return {
        graph: {
            ...graph,
            nodes: graph.nodes.filter((n) => !apagar.has(n.id)),
            connections: graph.connections.filter(
                (c) => !apagar.has(c.sourceNode) && !apagar.has(c.targetNode),
            ),
        },
        selection: [],
        protegidos: pedidos.length - apagar.size,
    };
}

// ── Cortar ───────────────────────────────────────────────────────────────────

export interface Cut extends Removal {
    clip: Clip | null;
}

/** Copiar e apagar, pela ordem que importa: se não houver o que copiar, não se apaga. */
export function cutNodes(graph: MaterialGraph, ids: string[]): Cut | null {
    const clip = copyNodes(graph, ids);
    if (!clip) return null;

    return { ...deleteNodes(graph, clip.nodes.map((n) => n.id)), clip };
}

// ── Mover ────────────────────────────────────────────────────────────────────

/** Desloca um conjunto de nós. Serve o arrastar e o duplicado que segue o cursor. */
export function moveNodes(
    graph: MaterialGraph,
    ids: string[],
    delta: { x: number; y: number },
): MaterialGraph {
    const mover = new Set(ids);

    return {
        ...graph,
        nodes: graph.nodes.map((n) => (mover.has(n.id)
            ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } }
            : n)),
    };
}
