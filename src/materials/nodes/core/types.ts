/**
 * O modelo de dados do grafo de materiais.
 *
 * O grafo é **dados**, e nunca código. Nada aqui guarda caminhos de ficheiro,
 * URLs, código de shader ou JavaScript: uma textura é referida pelo
 * identificador que o projeto já lhe deu, e é o sistema de assets existente que
 * decide se ele pode ser lido — pelo site ou pelo HostLocal. Um grafo vindo de
 * fora não pode, por construção, apontar para lado nenhum que o projeto já não
 * autorizasse.
 *
 * As camadas, e a separação entre elas é o que faz isto durar:
 *
 *     Editor (React) → Grafo (estes tipos) → Núcleo → GLSL/material → Three.js
 *
 * O editor mexe no grafo e mais nada; o núcleo lê o grafo e produz ou uma
 * descrição de material ou um programa de shader; só depois alguém traduz isso
 * para Three.js. Um componente React que criasse materiais directamente prendia
 * as camadas umas às outras e tornava impossível avaliar um grafo sem montar a
 * interface.
 */

/**
 * O que corre por uma ligação.
 *
 * Os tipos existem para recusar ligações que não fazem sentido antes de elas
 * entrarem no grafo — um grafo inválido guardado é um projeto que abre partido.
 */
export type SocketType = 'FLOAT' | 'COLOR' | 'NORMAL' | 'BSDF' | 'DISPLACEMENT';

/** Um valor de cor, em componentes 0–1. Serializável, ao contrário de THREE.Color. */
export interface ColorValue { r: number; g: number; b: number }

/**
 * O valor por omissão de uma entrada, usado quando ela não tem ligação.
 *
 * `null` para as entradas que só fazem sentido ligadas: um BSDF não tem valor
 * por omissão, e uma normal desligada quer dizer "a geometria como está", que
 * não é um número.
 */
export type SocketValue = number | ColorValue | string | null;

/** Uma entrada declarada por um tipo de nó. */
export interface InputDefinition {
    id: string;
    label: string;
    type: SocketType;
    defaultValue: SocketValue;
    /** Limites para as entradas numéricas, usados pelo editor e pela validação. */
    min?: number;
    max?: number;
    step?: number;
}

export interface OutputDefinition {
    id: string;
    label: string;
    type: SocketType;
}

/**
 * Uma propriedade do nó que não é uma entrada ligável.
 *
 * A textura escolhida num nó de imagem é o caso: é uma referência a um asset do
 * projeto, não um valor que outro nó possa produzir. O modo de mistura de um
 * Mix Color é outro: é uma escolha de entre uma lista fechada, e não um número.
 * Distinguir as duas coisas é o que impede o avaliador de tentar resolver uma
 * ligação para algo que nunca poderia estar ligado.
 */
export type PropertyValue = string | number | boolean | null;

/**
 * Uma propriedade de escolha fechada.
 *
 * A lista é a definição da propriedade, e é contra ela que o valor guardado é
 * verificado antes de chegar seja ao avaliador seja ao gerador de shader. Um
 * projeto adulterado que ponha `blend: "'; discard; //"` num Mix Color escolhe,
 * na prática, o primeiro modo da lista — nunca um pedaço de GLSL.
 */
export interface OptionDefinition {
    key: string;
    label: string;
    options: { value: string; label: string }[];
    /** A runtime geometry choice does not change GLSL. */
    runtime?: boolean;
    enabledWhen?: { key: string; value: string };
}

/**
 * Como o núcleo agrupa os tipos de nó — e como as pastas estão organizadas.
 *
 * Uma categoria por pasta: `Color/`, `Texture/`, `Shader/`, `Input/`. O menu de
 * criação do editor gera-se a partir daqui, e por isso um nó novo aparece
 * arrumado sem que ninguém mexa no editor.
 */
export type NodeCategory = 'output' | 'shader' | 'input' | 'vector' | 'color' | 'texture' | 'math';

/**
 * A classe de um nó — o que decide a cor do seu cabeçalho.
 *
 * Mais grossa do que a categoria de propósito. A categoria arruma o menu de
 * criação e as pastas, e para isso convém ser fina: uma textura procedimental
 * não se procura no mesmo sítio que um vector. A classe responde a outra
 * pergunta — "que género de coisa é este nó?" — e para essa quatro respostas
 * chegam. Um relance sobre um grafo não precisa de distinguir seis famílias de
 * cor; precisa de ver onde acabam os shaders e onde começam as cores.
 *
 * São dois eixos e não uma duplicação, e é por isso que a definição do nó
 * declara **um** — a categoria — e a classe sai desta tabela. Um nó que
 * declarasse os dois podia declará-los em desacordo, e nesse dia não haveria
 * maneira de saber qual dos dois estava certo.
 */
export type NodeClass = 'normal' | 'value' | 'color' | 'shader';

/**
 * De categoria para classe. A única tabela que faz esta tradução.
 *
 * A saída de material conta como shader: ela é o fim de uma cadeia de shaders, e
 * dá-lhe jeito ter a cor da cadeia a que pertence.
 *
 * As texturas contam como cor. O que uma Noise, uma Voronoi ou uma imagem
 * produzem é aquilo que as cadeias de cor consomem, e no ecrã elas aparecem
 * quase sempre encostadas a uma Color Ramp ou a um Mix Color — a mesma cor de
 * cabeçalho lê-se como "isto é a parte que trata do aspecto", que é o que uma
 * classificação por cor tem de fazer. Um relance não precisa de distinguir quem
 * produz cor de quem lhe mexe.
 *
 * Sobra o "normal" para o que não é nenhuma das outras três — nesta versão, o
 * Normal Map, que trata de relevo e não de cor.
 */
export const NODE_CLASS_OF: Record<NodeCategory, NodeClass> = {
    shader: 'shader',
    output: 'shader',
    color: 'color',
    input: 'value',
    math: 'value',
    texture: 'color',
    vector: 'normal',
};

/**
 * A classe de um nó.
 *
 * Uma linha, e é toda a inteligência que existe sobre o assunto. Não há — nem
 * pode haver — um `if (node.type === 'rgbColor')` em lado nenhum: um nó novo
 * registado como `category: 'color'` fica cor de laranja sem que ninguém toque
 * na interface.
 */
export function nodeClass(definition: NodeDefinition): NodeClass {
    return NODE_CLASS_OF[definition.category] ?? 'normal';
}

/**
 * Os canais do material que o grafo pode alimentar.
 *
 * São os mesmos nomes que as entradas do Principled e que os efeitos usam, e
 * isso não é coincidência: é o que deixa a interface desactivar o deslizador de
 * um canal que passou a ser calculado, sem ninguém ter de manter uma tabela de
 * correspondências entre três sítios.
 *
 * A normal não está aqui de propósito. Ela continua a ser aplicada como um mapa
 * de normais do Three.js — com a tangente, o `normalScale` e tudo o que o
 * renderizador já sabe fazer — e reescrever isso no shader gerado era trocar
 * uma coisa que funciona por uma que teria de ser refeita.
 */
export const MATERIAL_CHANNELS = ['baseColor', 'roughness', 'metallic', 'emission', 'alpha'] as const;

export type ChannelId = (typeof MATERIAL_CHANNELS)[number];

/** O tipo GLSL de cada canal. A cor é uma `vec3`; o resto são números. */
export const CHANNEL_TYPES: Record<ChannelId, 'float' | 'vec3'> = {
    baseColor: 'vec3',
    roughness: 'float',
    metallic: 'float',
    emission: 'float',
    alpha: 'float',
};

/**
 * O que um tipo de nó é, e o que ele sabe fazer.
 *
 * Registar um destes é tudo o que um nó novo precisa — nem o editor nem o
 * avaliador nem o gerador de shader têm listas de tipos escritas à mão.
 *
 * `evaluate` e `emit` são as duas metades do trabalho, e um nó pode ter uma,
 * outra, ou as duas:
 *
 * - `evaluate` corre no CPU e devolve valores. É o que dá o material quando não
 *   há nada de procedimental no caminho, o que alimenta a interface, e o que
 *   corre nos testes — sem WebGL, sem canvas, sem placa gráfica.
 * - `emit` devolve GLSL. É o que faz o cálculo por píxel acontecer na placa
 *   gráfica, em vez de se gerar uma textura no CPU a cada mexida num
 *   deslizador.
 *
 * Um nó sem `emit` não pode entrar numa cadeia que vá para a placa gráfica; um
 * nó sem `evaluate` avalia-se, no CPU, pelo valor que a sua definição declara.
 * Ver `compile.ts`.
 */
export interface NodeDefinition {
    type: string;
    label: string;
    category: NodeCategory;
    inputs: InputDefinition[];
    outputs: OutputDefinition[];
    /** Enforce numeric bounds without changing legacy node input semantics. */
    clampInputs?: boolean;
    properties?: Record<string, PropertyValue>;
    /** As propriedades de escolha fechada, para o editor as desenhar. */
    options?: OptionDefinition[];
    /** Um por grafo — o Material Output não se repete. */
    unique?: boolean;

    /**
     * Este nó só existe na placa gráfica.
     *
     * É a marca que decide o caminho: um canal cuja cadeia contenha um destes
     * é compilado para GLSL e calculado por fragmento; um canal cuja cadeia não
     * contenha nenhum segue o caminho de sempre — texturas nos canais do
     * material, números nas propriedades — exactamente como antes de isto
     * existir. É assim que os projetos que já usam nós continuam a ver o mesmo.
     *
     * Um ruído procedimental é um destes: o seu valor **é** diferente em cada
     * píxel, e reduzi-lo a um número no CPU seria inventar uma resposta. Uma
     * imagem do projeto não é: ela já sabe ser uma textura do Three.js.
     */
    gpu?: boolean;

    /** Avaliação no CPU. Pura: lê o que chega, devolve o que produz. */
    evaluate?: (ctx: EvalContext) => Record<string, Resolved>;

    /** Geração de GLSL. Devolve uma expressão por saída. */
    emit?: (ctx: EmitContext) => Record<string, string>;

    /**
     * Só os nós de shader: a expressão GLSL de um canal do material.
     *
     * Existe para que o compilador não tenha de saber o que um Principled é.
     * Ele pede um canal ao nó que está ligado à saída, e é o nó que decide o que
     * isso quer dizer — ir buscar a entrada com esse nome, no caso do
     * Principled; misturar dois shaders, no caso do Mix Shader.
     */
    emitSurface?: (ctx: EmitContext, channel: ChannelId) => string;
    /** View-space normal, compiled separately after Three.js normal setup. */
    emitNormal?: (ctx: EmitContext) => string;
}

/** Um nó no grafo de um projeto. */
export interface GraphNode {
    /** Estável e único. Nunca um índice: apagar um nó renumeraria os outros. */
    id: string;
    type: string;
    position: { x: number; y: number };
    /** Valores das entradas sem ligação, por id de socket. */
    inputs: Record<string, SocketValue>;
    properties: Record<string, PropertyValue>;
}

export interface GraphConnection {
    id: string;
    sourceNode: string;
    sourceSocket: string;
    targetNode: string;
    targetSocket: string;
}

/**
 * A versão do formato.
 *
 * Existe para que uma mudança de esquema possa migrar grafos antigos em vez de
 * os recusar. Assumir que o formato nunca muda é como se garante que um dia
 * deixa de se conseguir abrir o que já foi gravado.
 */
export const GRAPH_VERSION = 1;

export interface MaterialGraph {
    graphVersion: number;
    nodes: GraphNode[];
    connections: GraphConnection[];
}

export function emptyGraph(): MaterialGraph {
    return { graphVersion: GRAPH_VERSION, nodes: [], connections: [] };
}

// ── Avaliação no CPU ─────────────────────────────────────────────────────────

/** O que uma saída produziu: um número, uma cor, uma textura, ou uma superfície. */
export interface Resolved {
    isSRGB?: boolean;
    number?: number;
    color?: ColorValue;
    /** Id de um asset do projeto, quando o valor vem de uma imagem. */
    texture?: string | null;
    /** Só o Normal Map produz isto. */
    normal?: { texture: string | null; strength: number };
    /** Só os nós de shader produzem isto. */
    surface?: SurfaceValue;
}

/**
 * O que um nó vê quando é avaliado.
 *
 * Um nó nunca fala com o grafo: pede ao contexto o que lhe chega a uma entrada,
 * e o contexto sabe se isso vem de uma ligação ou do valor guardado. É o que
 * permite avaliar um nó isolado num teste, e o que impede um nó de andar a
 * procurar ligações por sua conta.
 */
export interface EvalContext {
    node: GraphNode;
    /** O que chega a uma entrada, ou `null` quando ela não está ligada. */
    incoming: (socket: string) => Resolved | null;
    /** O número que entra: o da ligação, ou o guardado. */
    float: (socket: string) => number;
    /** A cor que entra: a da ligação, ou a guardada. */
    rgb: (socket: string) => ColorValue;
    /** Uma propriedade de escolha fechada, validada contra a lista. */
    option: (key: string) => string;
    /** Uma propriedade de texto — um id de asset, e nada mais. */
    text: (key: string) => string | null;
}

// ── Geração de GLSL ──────────────────────────────────────────────────────────

export type GlslType = 'float' | 'vec2' | 'vec3' | 'vec4';

/**
 * O que um nó vê quando gera GLSL.
 *
 * Tal como na avaliação, o nó não conhece o grafo: pede uma expressão para uma
 * entrada e recebe ou o nome da variável que o nó anterior deixou, ou o nome de
 * um uniform com o valor guardado. É essa segunda hipótese que faz um
 * deslizador mexer sem recompilar nada.
 *
 * Nada do que um nó escreve aqui vem do utilizador. Os identificadores são
 * gerados pelo compilador a partir da ordem topológica, as escolhas passam por
 * `option`, e os números são uniforms. Não há caminho por onde texto de um
 * projeto chegue ao GLSL.
 */
export interface EmitContext {
    node: GraphNode;
    /** A expressão GLSL de uma entrada — variável de trás ou uniform. */
    input: (socket: string) => string;
    /** Escreve `tipo nome = expressão;` no corpo e devolve o nome. */
    temp: (type: GlslType, expr: string) => string;
    /** Declara uma função auxiliar uma vez por programa. */
    helper: (name: string, code: string) => void;
    /** Uma propriedade de escolha fechada, validada contra a lista. */
    option: (key: string) => string;
    /** Um `sampler2D` para a imagem deste nó, ou `null` quando não há imagem. */
    sampler: () => string | null;
    /** Image sampling shared by fragment, vertex, shadow and overlay stages. */
    sample?: () => string | null;
    /**
     * O canal pedido, vindo do nó de shader ligado a esta entrada.
     *
     * É o que o Mix Shader usa para chegar aos dois lados sem os conhecer.
     * Devolve `null` quando não há nada ligado — e nesse caso o nó decide o que
     * fazer, em vez de o compilador decidir por ele.
     */
    surface: (socket: string, channel: ChannelId) => string | null;
    /** A varying com as coordenadas de textura. */
    readonly uv: string;
    /** A varying com a posição em espaço do objeto. */
    readonly position: string;
    /** Unperturbed view-space normal; optional for standalone node inspection. */
    readonly normal?: string;
    surfaceNormal?: (socket: string) => string | null;
    normalUv?: (socket: string) => string;
    /** Zero while any required image upstream of this input is unavailable. */
    ready?: (socket: string, requireConnection?: boolean) => string;
}

// ── A descrição de material ──────────────────────────────────────────────────

/**
 * O que um nó de shader descreve.
 *
 * Deliberadamente sem nada do Three.js: é uma descrição, e quem a traduz é o
 * `applyMaterialDefinition`. Assim o avaliador corre num teste sem WebGL, sem
 * canvas e sem placa gráfica.
 */
export interface SurfaceValue {
    baseColorSRGB?: boolean;
    roughnessSRGB?: boolean;
    metallicSRGB?: boolean;
    baseColor: ColorValue;
    /** Id do asset a usar como mapa de cor base, quando há um ligado. */
    baseColorTexture: string | null;
    roughness: number;
    roughnessTexture: string | null;
    metallic: number;
    metallicTexture: string | null;
    normalTexture: string | null;
    normalStrength: number;
    emissiveStrength: number;
    opacity: number;
}

export interface MaterialDefinition extends SurfaceValue {
    /** Que entradas do grafo estão a ser controladas por uma ligação. */
    driven: Record<string, boolean>;
}

export function defaultSurface(): SurfaceValue {
    return {
        baseColor: { r: 0.8, g: 0.8, b: 0.8 },
        baseColorTexture: null,
        roughness: 0.5,
        roughnessTexture: null,
        metallic: 0,
        metallicTexture: null,
        normalTexture: null,
        normalStrength: 1,
        emissiveStrength: 0,
        opacity: 1,
    };
}

export function defaultMaterialDefinition(): MaterialDefinition {
    return { ...defaultSurface(), driven: {} };
}
