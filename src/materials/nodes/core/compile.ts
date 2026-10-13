/**
 * Do grafo para um programa de shader.
 *
 * Esta é a camada que responde à pergunta "onde é que a conta é feita". A
 * resposta, para tudo o que varia por píxel — ruído, xadrez, rampas de cor,
 * brilho e contraste — é: na placa gráfica, uma vez por fragmento, dentro do
 * material que o Three.js já ia compilar. **Nunca** gerando uma textura no CPU
 * píxel a píxel e enviando-a para a placa a cada mexida num deslizador.
 *
 *     Grafo → validação → ordem topológica → representação intermédia
 *           → GLSL gerado → THREE.Material → WebGL
 *
 * O CPU fica com o que é do CPU: validar, ordenar, decidir o que depende de
 * quê, serializar, gerir parâmetros. É trabalho que se faz uma vez por mudança,
 * e não uma vez por píxel.
 *
 * ## Que canais vão para a placa gráfica
 *
 * Só os que precisam. Um canal cuja cadeia contenha um nó marcado `gpu` é
 * compilado; um canal alimentado apenas por uma imagem do projeto continua a
 * ser uma textura num canal do material, exactamente como sempre foi. É essa
 * regra que faz os projetos que já existem continuarem a ver o mesmo, e é por
 * isso que ela está numa marca da definição do nó em vez de numa lista de tipos
 * aqui dentro.
 *
 * Para descobrir isso, cada canal é emitido duas vezes: uma em seco, só para
 * ver por onde passa, e outra a sério, só se valeu a pena. Emitir é construir
 * uma cadeia de caracteres a partir de funções puras — corrê-lo duas vezes é
 * barato, e corre uma vez por mudança de estrutura, não por frame.
 *
 * ## O que nunca entra no GLSL
 *
 * Nada que venha do projeto. Os nomes das variáveis e dos uniforms saem do
 * índice do nó no grafo; as escolhas passam por `nodeOption`, que as verifica
 * contra a lista da definição; os números e as cores são uniforms, e um uniform
 * é um valor, não texto. Não há um nó de shader livre, e não há maneira de um
 * grafo — mesmo adulterado — pôr uma linha de GLSL sua neste programa.
 */
import { getNodeDefinition, nodeOption } from './registry';
import { NODE_BUMP } from '../Vector/Bump/Bump';
import {
    CHANNEL_TYPES,
    MATERIAL_CHANNELS,
    type ChannelId,
    type ColorValue,
    type EmitContext,
    type GlslType,
    type GraphNode,
    type MaterialGraph,
} from './types';

/** Um uniform que segue um valor guardado numa entrada do grafo. */
export interface UniformBinding {
    name: string;
    type: 'float' | 'vec3';
    nodeId: string;
    socket: string;
    nodeIndex: number;
}

/** Um `sampler2D` que segue uma imagem do projeto. */
export interface SamplerBinding {
    name: string;
    nodeId: string;
    assetId: string;
    nodeIndex: number;
}

export interface CompiledStage {
    prelude: string;
    body: string;
    expression: string;
}

export interface CompiledProgram {
    /**
     * A identidade da estrutura.
     *
     * Duas mudanças diferentes de deslizador dão a mesma chave — e é isso que
     * permite não recompilar. Uma ligação nova dá outra, e aí recompila-se.
     */
    key: string;
    /** Declarações: varyings, uniforms e funções auxiliares. */
    prelude: string;
    /** As linhas que calculam os canais, para dentro do `main`. */
    body: string;
    /** A expressão de cada canal que o grafo passou a mandar. */
    channels: Partial<Record<ChannelId, string>>;
    uniforms: UniformBinding[];
    samplers: SamplerBinding[];
    normal?: CompiledStage;
    displacement?: CompiledStage;
}

/** Um identificador GLSL seguro a partir de um nome nosso. */
function safe(name: string): string {
    return name.replace(/[^A-Za-z0-9_]/g, '_');
}

const GLSL_OF: Record<'FLOAT' | 'COLOR' | 'NORMAL' | 'BSDF' | 'DISPLACEMENT', GlslType | null> = {
    FLOAT: 'float',
    COLOR: 'vec3',
    NORMAL: 'vec3',
    BSDF: null,
    DISPLACEMENT: 'float',
};

function samplerDeclarations(name: string): string {
    return `uniform sampler2D ${name};
uniform sampler2D ${name}Lookup;
uniform mat3 ${name}Transform;
uniform vec4 ${name}Atlas;
uniform float ${name}Width;
uniform float ${name}Compact;
uniform float ${name}Ready;`;
}

// The same compact UDIM addressing as CompactUdimAtlas, with uniforms so that
// loading an atlas or replacing a texture does not change either shader stage.
function samplerSource(name: string): string {
    return `
vec4 ${name}Tile( vec2 sourceUv ) {
    vec2 tile = floor( sourceUv );
    float index = tile.x + tile.y * 10.0;
    float width = max( ${name}Width, 1.0 );
    float valid = step( 0.0, tile.x ) * ( 1.0 - step( 10.0, tile.x ) ) * step( 0.0, tile.y )
        * step( 0.0, index ) * ( 1.0 - step( width, index ) );
    vec4 record = texture2D( ${name}Lookup, vec2( ( clamp( index, 0.0, width - 1.0 ) + 0.5 ) / width, 0.5 ) );
    return vec4( record.rg, valid * step( 0.5, record.b ), 1.0 );
}
float ${name}Available( vec2 sourceUv ) {
    if ( ${name}Ready < 0.5 ) return 0.0;
    return ${name}Compact > 0.5 ? ${name}Tile( sourceUv ).b : 1.0;
}
vec4 ${name}Sample( vec2 sourceUv ) {
    vec2 sampleUv = ( ${name}Transform * vec3( sourceUv, 1.0 ) ).xy;
    float present = ${name}Ready;
    if ( ${name}Compact > 0.5 ) {
        vec4 tile = ${name}Tile( sourceUv );
        float stride = ${name}Atlas.z + ${name}Atlas.w * 2.0;
        sampleUv = ( tile.rg * 255.0 * stride + vec2( ${name}Atlas.w + 0.5 )
            + fract( sourceUv ) * max( ${name}Atlas.z - 1.0, 0.0 ) ) / max( ${name}Atlas.xy, vec2( 1.0 ) );
        present *= tile.b;
    }
    return mix( vec4( 1.0 ), texture2D( ${name}, sampleUv ), present );
}`;
}

/**
 * A construção de um programa.
 *
 * Corre em dois modos. Em seco (`dry`) percorre o grafo sem escrever nada, só
 * para saber por onde passou; a sério, escreve. O percurso é o mesmo nos dois,
 * porque é o mesmo código dos nós a correr — não há uma segunda travessia
 * escrita à mão que possa discordar da primeira.
 */
class Builder {
    readonly visited = new Set<string>();
    readonly uniforms = new Map<string, UniformBinding>();
    readonly samplers = new Map<string, SamplerBinding>();

    private readonly lines: string[] = [];
    readonly helpers = new Map<string, string>();
    private readonly outputs = new Map<string, Record<string, string>>();
    private readonly stack = new Set<string>();
    private counter = 0;

    private readonly graph: MaterialGraph;
    private readonly dry: boolean;
    private readonly stage: 'surface' | 'normal' | 'displacement';

    constructor(graph: MaterialGraph, dry: boolean, stage: 'surface' | 'normal' | 'displacement' = 'surface') {
        this.graph = graph;
        this.dry = dry;
        this.stage = stage;
    }

    private index(nodeId: string): number {
        const at = this.graph.nodes.findIndex((n) => n.id === nodeId);
        return at < 0 ? 0 : at;
    }

    private incoming(nodeId: string, socket: string) {
        return this.graph.connections.find(
            (c) => c.targetNode === nodeId && c.targetSocket === socket,
        );
    }

    /**
     * O que um nó produz, por saída.
     *
     * Uma vez por nó e por programa: um valor usado em três sítios é calculado
     * uma vez e lido três, que é a diferença entre um shader e três shaders
     * colados.
     */
    private emitNode(node: GraphNode): Record<string, string> {
        const cached = this.outputs.get(node.id);
        if (cached) return cached;

        // Um ciclo que tenha escapado à validação — um grafo gravado por outra
        // versão, ou mexido à mão — pára aqui em vez de esgotar a pilha.
        if (this.stack.has(node.id)) return {};

        const definition = getNodeDefinition(node.type);
        if (!definition?.emit) return {};

        this.stack.add(node.id);
        this.visited.add(node.id);

        const produced = definition.emit(this.context(node));

        this.stack.delete(node.id);
        this.outputs.set(node.id, produced);
        return produced;
    }

    /** O canal pedido a um nó de shader. */
    emitSurface(node: GraphNode, channel: ChannelId): string | null {
        const definition = getNodeDefinition(node.type);
        if (!definition?.emitSurface) return null;

        this.visited.add(node.id);
        return definition.emitSurface(this.context(node), channel);
    }

    emitNormal(node: GraphNode): string | null {
        const definition = getNodeDefinition(node.type);
        if (!definition?.emitNormal || this.stack.has(node.id)) return null;
        this.stack.add(node.id);
        this.visited.add(node.id);
        const result = definition.emitNormal(this.context(node));
        this.stack.delete(node.id);
        return result;
    }

    emitOutput(node: GraphNode, socket: string): string | null {
        return this.emitNode(node)[socket] ?? null;
    }

    private imageInputs(node: GraphNode, socket: string): GraphNode[] {
        const link = this.incoming(node.id, socket);
        if (!link) return [];
        const seen = new Set<string>();
        const images: GraphNode[] = [];
        const visit = (id: string) => {
            if (seen.has(id)) return;
            seen.add(id);
            const source = this.graph.nodes.find(n => n.id === id);
            if (!source) return;
            if ('assetId' in (getNodeDefinition(source.type)?.properties ?? {})) {
                images.push(source);
            }
            for (const c of this.graph.connections) if (c.targetNode === id) visit(c.sourceNode);
        };
        visit(link.sourceNode);
        return images;
    }

    private readiness(node: GraphNode, socket: string, requireConnection = false): string {
        if (requireConnection && !this.incoming(node.id, socket)) return '0.0';
        return this.imageInputs(node, socket).map(source => {
            const sampler = this.sampler(source);
            return sampler ? `${sampler}Available( ${this.stage === 'displacement' ? 'uv' : 'vNdUv'} )` : '0.0';
        }).join(' * ') || '1.0';
    }

    private normalUv(node: GraphNode, socket: string): string {
        const images = this.imageInputs(node, socket);
        const sampler = images.length === 1 ? this.sampler(images[0]) : null;
        // Compact atlas sampling is local to each tile. Its tangent frame uses
        // source UVs, matching Three's native compact-normal-map path.
        return sampler ? `mix( ( ${sampler}Transform * vec3( vNdUv, 1.0 ) ).xy, vNdUv, step( 0.5, ${sampler}Compact ) )` : 'vNdUv';
    }

    private context(node: GraphNode): EmitContext {
        return {
            node,
            uv: this.stage === 'displacement' ? 'uv' : 'vNdUv',
            position: this.stage === 'displacement' ? 'position' : 'vNdPos',
            normal: 'ndBaseNormal',

            input: (socket) => this.input(node, socket),
            temp: (type, expr) => this.temp(type, expr),
            helper: (name, code) => this.helper(name, code),
            option: (key) => this.stage === 'normal' && key === 'colorSpace' && nodeOption(node, key) === 'auto'
                ? 'linear' : nodeOption(node, key),
            sampler: () => this.sampler(node),
            sample: () => {
                const name = this.sampler(node);
                return name ? `${name}Sample( ${this.stage === 'displacement' ? 'uv' : 'vNdUv'} )` : null;
            },
            ready: (socket, requireConnection) => this.readiness(node, socket, requireConnection),
            normalUv: socket => this.normalUv(node, socket),
            surfaceNormal: socket => {
                const link = this.incoming(node.id, socket);
                const source = link && this.graph.nodes.find(n => n.id === link.sourceNode);
                return source ? this.emitNormal(source) : null;
            },

            surface: (socket, channel) => {
                const link = this.incoming(node.id, socket);
                if (!link) return null;

                const source = this.graph.nodes.find((n) => n.id === link.sourceNode);
                if (!source || this.stack.has(source.id)) return null;

                this.stack.add(source.id);
                const expr = this.emitSurface(source, channel);
                this.stack.delete(source.id);

                return expr;
            },
        };
    }

    /** A expressão de uma entrada: a variável de trás, ou um uniform. */
    private input(node: GraphNode, socket: string): string {
        const link = this.incoming(node.id, socket);

        if (link) {
            const source = this.graph.nodes.find((n) => n.id === link.sourceNode);
            if (source) {
                const expr = this.emitNode(source)[link.sourceSocket];
                // Sem expressão quer dizer que o nó de trás não sabe gerar
                // GLSL. Nesse caso vale o valor guardado — o grafo continua a
                // dar um material, em vez de dar um erro de compilação.
                if (expr) return expr;
            }
        }

        return this.uniform(node, socket);
    }

    /**
     * Um uniform com o valor guardado numa entrada.
     *
     * É aqui que se ganha a regra de não recompilar: mexer num número muda o
     * valor deste uniform e mais nada. O programa é o mesmo, a estrutura é a
     * mesma, e a placa gráfica desenha o frame seguinte com o número novo.
     */
    private uniform(node: GraphNode, socket: string): string {
        const definition = getNodeDefinition(node.type);
        const input = definition?.inputs.find((i) => i.id === socket);
        if (input?.type === 'NORMAL') return 'ndBaseNormal';
        const type = input ? GLSL_OF[input.type] : 'float';
        if (type !== 'float' && type !== 'vec3') return 'float(0.0)';

        const name = `ndU${this.index(node.id)}_${safe(socket)}`;
        if (!this.dry) this.uniforms.set(name, { name, type, nodeId: node.id, socket, nodeIndex: this.index(node.id) });

        return name;
    }

    private sampler(node: GraphNode): string | null {
        const assetId = node.properties.assetId;
        if (typeof assetId !== 'string' || assetId.length === 0) return null;

        const name = `ndS${this.index(node.id)}`;
        if (!this.dry) {
            this.samplers.set(name, { name, nodeId: node.id, assetId, nodeIndex: this.index(node.id) });
            this.helper(`${name}Sample`, samplerSource(name));
        }

        return name;
    }

    temp(type: GlslType, expr: string): string {
        const name = `${this.stage === 'surface' ? 'nd' : this.stage === 'normal' ? 'ndN' : 'ndD'}T${this.counter}`;
        this.counter += 1;
        if (!this.dry) this.lines.push(`\t${type} ${name} = ${expr};`);
        return name;
    }

    /** Uma função auxiliar entra uma vez, mesmo que dez nós a peçam. */
    private helper(name: string, code: string): void {
        if (!this.helpers.has(name)) this.helpers.set(name, code);
    }

    prelude(includeVaryings = true): string {
        const declarations = [
            ...(includeVaryings ? ['varying vec3 vNdPos;', 'varying vec2 vNdUv;'] : []),
            ...[...this.uniforms.values()].map((u) => `uniform ${u.type} ${u.name};`),
            ...[...this.samplers.values()].map((s) => samplerDeclarations(s.name)),
        ];

        return [...declarations, ...this.helpers.values()].join('\n');
    }

    bodyText(): string {
        return this.lines.join('\n');
    }
}

/**
 * O nó de shader ligado à saída de material, se houver um.
 *
 * Um grafo sem Material Output, ou com a superfície por ligar, não descreve
 * material nenhum — e é diferente de descrever um material vazio.
 */
function surfaceNode(graph: MaterialGraph): GraphNode | null {
    const output = graph.nodes.find((n) => getNodeDefinition(n.type)?.unique);
    if (!output) return null;

    const link = graph.connections.find(
        (c) => c.targetNode === output.id && c.targetSocket === 'surface',
    );
    if (!link) return null;

    return graph.nodes.find((n) => n.id === link.sourceNode) ?? null;
}

/** Passou por algum nó que só existe na placa gráfica? */
function touchesGpu(visited: Set<string>, graph: MaterialGraph): boolean {
    for (const id of visited) {
        const node = graph.nodes.find((n) => n.id === id);
        if (node && getNodeDefinition(node.type)?.gpu) return true;
    }
    return false;
}

/**
 * A identidade da estrutura de um grafo.
 *
 * Entra tudo o que muda o texto do GLSL: os tipos dos nós, as escolhas
 * fechadas, quem está ligado a quem, e se um nó de imagem tem imagem. **Não**
 * entram os números nem as cores — esses são uniforms, e é justamente por não
 * estarem aqui que mexer num deslizador não recompila nada.
 *
 * Os nós são referidos pelo índice e não pelo id: dois grafos com a mesma forma
 * e ids diferentes partilham o programa compilado.
 */
export function structuralKey(graph: MaterialGraph): string {
    const at = new Map(graph.nodes.map((n, i) => [n.id, i]));

    const nodes = graph.nodes.map((node, i) => {
        const definition = getNodeDefinition(node.type);
        const options = (definition?.options ?? [])
            .filter(o => !o.runtime)
            .map((o) => `${o.key}=${nodeOption(node, o.key)}`)
            .join(',');
        const image = typeof node.properties.assetId === 'string' && node.properties.assetId
            ? '+img'
            : '';

        return `${i}:${node.type}${options ? `[${options}]` : ''}${image}`;
    });

    const links = graph.connections
        .map((c) => `${at.get(c.sourceNode) ?? -1}.${c.sourceSocket}>${at.get(c.targetNode) ?? -1}.${c.targetSocket}`)
        .sort();

    return `v${graph.graphVersion}|${nodes.join(';')}|${links.join(';')}`;
}

/**
 * Compila o grafo, ou devolve `null` quando não há nada para compilar.
 *
 * `null` é o caso normal e não um erro: um grafo com uma imagem ligada à cor
 * base não precisa de shader gerado nenhum, porque o Three.js já sabe pôr uma
 * textura num material. Gerar um programa para isso seria trocar um caminho
 * testado por outro, sem ganhar nada.
 */
export function compileGraph(graph: MaterialGraph): CompiledProgram | null {
    const shader = surfaceNode(graph);

    // ── Em seco: por onde passa cada canal ───────────────────────────────
    const gpuChannels: ChannelId[] = [];

    for (const channel of shader ? MATERIAL_CHANNELS : []) {
        const probe = new Builder(graph, true);
        const expr = probe.emitSurface(shader!, channel);
        if (expr && touchesGpu(probe.visited, graph)) gpuChannels.push(channel);
    }

    const normalProbe = new Builder(graph, true, 'normal');
    if (shader) normalProbe.emitNormal(shader);
    const hasBump = graph.nodes.some(n => n.type === NODE_BUMP && normalProbe.visited.has(n.id));
    const output = graph.nodes.find(n => getNodeDefinition(n.type)?.unique);
    const displacementLink = output && graph.connections.find(c => c.targetNode === output.id && c.targetSocket === 'displacement');
    const displacementNode = displacementLink && graph.nodes.find(n => n.id === displacementLink.sourceNode);
    if (gpuChannels.length === 0 && !hasBump && !displacementNode) return null;

    // ── A sério: só os canais que valem a pena ───────────────────────────
    const builder = new Builder(graph, false);
    const channels: Partial<Record<ChannelId, string>> = {};

    for (const channel of gpuChannels) {
        const expr = builder.emitSurface(shader!, channel);
        if (!expr) continue;

        // Guardado numa variável do tipo do canal: a expressão pode ser longa
        // e é usada uma vez, mas o tipo escrito à frente é o que apanha uma
        // discordância entre o que o nó devolveu e o que o canal quer.
        channels[channel] = builder.temp(CHANNEL_TYPES[channel], expr);
    }

    const normalBuilder = new Builder(graph, false, 'normal');
    const normalExpression = hasBump && shader ? normalBuilder.emitNormal(shader) : null;
    const vertexBuilder = new Builder(graph, false, 'displacement');
    const displacementExpression = displacementNode && displacementLink
        ? vertexBuilder.emitOutput(displacementNode, displacementLink.sourceSocket) : null;
    const stages = [builder, normalBuilder, vertexBuilder];
    const uniforms = new Map(stages.flatMap(b => [...b.uniforms]));
    const samplers = new Map(stages.flatMap(b => [...b.samplers]));
    const fragmentHelpers = new Map([...builder.helpers, ...normalBuilder.helpers]);
    const fragmentUniforms = new Map([...builder.uniforms, ...normalBuilder.uniforms]);
    const fragmentSamplers = new Map([...builder.samplers, ...normalBuilder.samplers]);
    const prelude = [
        'varying vec3 vNdPos;', 'varying vec2 vNdUv;',
        ...(normalExpression ? ['varying float vNdLocalScale;'] : []),
        ...[...fragmentUniforms.values()].map(u => `uniform ${u.type} ${u.name};`),
        ...[...fragmentSamplers.values()].map(s => samplerDeclarations(s.name)),
        ...fragmentHelpers.values(),
    ].join('\n');

    return {
        key: structuralKey(graph),
        prelude,
        body: builder.bodyText(),
        channels,
        uniforms: [...uniforms.values()],
        samplers: [...samplers.values()],
        ...(normalExpression ? { normal: { prelude: '', body: normalBuilder.bodyText(), expression: normalExpression } } : {}),
        ...(displacementExpression ? { displacement: { prelude: vertexBuilder.prelude(false), body: vertexBuilder.bodyText(), expression: displacementExpression } } : {}),
    };
}

/**
 * Os canais que o grafo calcula na placa gráfica.
 *
 * A interface precisa disto pela mesma razão que precisa do `driven`: um
 * deslizador que já não manda em nada tem de o dizer, em vez de se mexer sem
 * efeito.
 */
export function gpuChannels(graph: MaterialGraph): ChannelId[] {
    const compiled = compileFromCache(graph);
    return compiled ? (Object.keys(compiled.channels) as ChannelId[]) : [];
}

// ── A cache ──────────────────────────────────────────────────────────────────

/**
 * Os programas já gerados, pela chave da estrutura.
 *
 * Vive fora do React: é uma cache de texto derivado do grafo, e recriá-la a
 * cada render era voltar a percorrer o grafo por nada. Tem tecto porque uma
 * sessão longa a experimentar ligações gera muitas chaves, e uma cache sem
 * limite é uma fuga de memória com outro nome.
 */
const cache = new Map<string, CompiledProgram | null>();
const CACHE_LIMIT = 64;

export function compileFromCache(graph: MaterialGraph): CompiledProgram | null {
    const key = structuralKey(graph);

    if (cache.has(key)) {
        const program = cache.get(key);
        if (!program) return null;
        // Cached text can be shared; bindings must follow this graph's ids and
        // assets, including replacing one image with another of the same shape.
        return {
            ...program,
            uniforms: program.uniforms.map(u => ({ ...u, nodeId: graph.nodes[u.nodeIndex]?.id ?? u.nodeId })),
            samplers: program.samplers.map(s => ({ ...s, nodeId: graph.nodes[s.nodeIndex]?.id ?? s.nodeId,
                assetId: String(graph.nodes[s.nodeIndex]?.properties.assetId ?? '') })),
        };
    }

    const compiled = compileGraph(graph);

    if (cache.size >= CACHE_LIMIT) {
        // A mais antiga sai. Sem prioridades: o que se quer é um tecto, e a
        // ordem de inserção de um `Map` já o dá sem contabilidade nenhuma.
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
    }

    cache.set(key, compiled);
    return compiled;
}

export function clearProgramCache(): void {
    cache.clear();
}

/** O valor de um uniform, lido do grafo. */
export function uniformValue(
    graph: MaterialGraph,
    binding: UniformBinding,
): number | ColorValue {
    const node = graph.nodes[binding.nodeIndex] ?? graph.nodes.find((n) => n.id === binding.nodeId);
    const definition = node && getNodeDefinition(node.type);
    const input = definition?.inputs.find(i => i.id === binding.socket);
    const stored = node?.inputs[binding.socket] ?? input?.defaultValue;

    if (binding.type === 'vec3') {
        return stored && typeof stored === 'object' && 'r' in stored
            ? stored
            : { r: 1, g: 1, b: 1 };
    }

    const value = typeof stored === 'number' && Number.isFinite(stored) ? stored : 0;
    return definition?.clampInputs ? Math.min(input?.max ?? Infinity, Math.max(input?.min ?? -Infinity, value)) : value;
}
