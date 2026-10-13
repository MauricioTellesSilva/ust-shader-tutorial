import { tr as uiText } from '../../../i18n';
/**
 * O que se pergunta a um documento **antes** de o mandar para o servidor.
 *
 * Havia um buraco entre a serialização e a gravação. O `serializeLibrary` monta
 * o documento e o servidor decide se ele presta, e entre os dois não havia
 * ninguém — por isso a primeira notícia de que um material não podia ser
 * gravado era um 400 vindo da rede, com a frase que o Zod dá a uma união que
 * falha: "Invalid input". A mesma frase para um nome de material vazio, para
 * uma posição que ficou `NaN` e para um documento com a forma errada.
 *
 *     grafo → serializar → **isto** → rede → validação do servidor → base de dados
 *
 * Isto não substitui a validação do servidor, e não pode: o servidor não confia
 * no cliente e não é suposto confiar. Responde a outra pergunta — "o que é que
 * eu estou prestes a enviar, e alguém consegue explicá-lo a quem está a usar?"
 * — e responde-a antes de a rede entrar ao barulho, que é onde as respostas
 * ainda podem apontar para o material e para o nó.
 *
 * ## Só dados
 *
 * A outra metade do trabalho é garantir que o que sai é uma descrição e não uma
 * coisa viva. Um `THREE.Material`, uma `THREE.Texture`, um `Object3D`, um
 * elemento de React, uma função, um `Map` — nada disto tem representação em
 * JSON, e o que acontece quando um deles entra num campo não é um erro: é um
 * `{}` gravado em silêncio, e um material que na próxima abertura perdeu uma
 * peça sem ninguém saber qual. Isto encontra-os enquanto ainda há a quem
 * perguntar.
 */
import { LIBRARY_VERSION, type SerializedLibrary } from './library';
import type { SerializedGraph } from './serialize';

/**
 * Os limites, iguais aos do servidor.
 *
 * A cópia é deliberada e não é a fonte de verdade: quem manda é
 * `server/schemas.mjs`, porque é ele que vê os pedidos de clientes que não são
 * este. Estarem aqui serve para a recusa acontecer com o material à mão, e não
 * três camadas mais tarde, com o mesmo número escrito de outra maneira.
 */
export const LIMITS = {
    materials: 200,
    nodesPerMaterial: 500,
    connectionsPerMaterial: 1000,
    id: 80,
    materialId: 200,
    socketId: 60,
    text: 200,
    /** O tecto do corpo do pedido no servidor (JSON_BODY_LIMIT), com folga. */
    bytes: 256 * 1024,
} as const;

export interface PayloadIssue {
    /** Onde, na forma que o servidor também usa: `materials.2.nodeGraph.nodes.7.position.x`. */
    path: string;
    /** O que está mal, para quem desenvolve. */
    detail: string;
    /** A frase para quem está a usar. Uma por problema, e não uma lista. */
    message: string;
}

export interface PayloadReport {
    ok: boolean;
    issues: PayloadIssue[];
    materials: number;
    nodes: number;
    connections: number;
    bytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * O nome do que ali está, quando não devia estar nada disso.
 *
 * Serve para a mensagem dizer "um THREE.Texture" em vez de "um objeto": a
 * diferença entre saber que se serializou uma coisa viva e ficar a olhar para
 * um campo vazio.
 */
function describe(value: unknown): string | null {
    if (value === null) return null;

    const tipo = typeof value;
    if (tipo === 'function') return uiText("uma função");
    if (tipo === 'symbol') return uiText("um símbolo");
    if (tipo === 'bigint') return 'um bigint';
    if (tipo === 'undefined' || tipo !== 'object') return null;

    const objeto = value as Record<string, unknown>;
    if (objeto.isTexture) return 'uma textura do Three.js';
    if (objeto.isMaterial) return 'um material do Three.js';
    if (objeto.isObject3D) return 'um objeto da cena';
    if (objeto.isBufferGeometry) return 'uma geometria';
    if (value instanceof Map) return 'um Map';
    if (value instanceof Set) return 'um Set';
    if (typeof Node !== 'undefined' && value instanceof Node) return 'um elemento do DOM';

    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null && !Array.isArray(value)) {
        const nome = (value as { constructor?: { name?: string } }).constructor?.name;
        return nome ? `um ${nome}` : uiText("uma instância de uma classe");
    }

    return null;
}

/**
 * Percorre tudo o que vai ser gravado à procura do que não é dados.
 *
 * Recursivo e com guarda de ciclos: uma referência circular não dá erro de
 * validação nenhum — dá uma excepção no `JSON.stringify`, muito depois, sem
 * dizer onde. Aqui diz-se onde.
 */
function walk(
    value: unknown,
    path: string,
    seen: Set<object>,
    issues: PayloadIssue[],
): void {
    if (issues.length > 20) return;

    const vivo = describe(value);
    if (vivo) {
        issues.push({
            path,
            detail: uiText("{value0} contém {value1}, que não é gravável.", { value0: String(path), value1: String(vivo) }),
            get message() { return uiText("O material contém dados que não podem ser guardados. Reabra o projeto e tente outra vez."); },
        });
        return;
    }

    if (typeof value === 'number' && !Number.isFinite(value)) {
        issues.push({
            path,
            detail: uiText("{value0} é {value1}, que não sobrevive a JSON.", { value0: String(path), value1: String(String(value)) }),
            get message() { return uiText("Um valor do material ficou inválido. Corrija o campo em branco no nó e tente outra vez."); },
        });
        return;
    }

    if (typeof value === 'string' && value.length > LIMITS.text) {
        issues.push({
            path,
            detail: uiText("{value0} tem {value1} caracteres (máximo {value2}).", { value0: String(path), value1: String(value.length), value2: String(LIMITS.text) }),
            get message() { return uiText("Uma textura ou opção do material tem um nome demasiado longo para ser guardado."); },
        });
        return;
    }

    if (!value || typeof value !== 'object') return;

    if (seen.has(value)) {
        issues.push({
            path,
            detail: uiText("{value0} aponta para um objeto que já aparece acima (referência circular).", { value0: String(path) }),
            get message() { return uiText("O material ficou num estado que não pode ser guardado. Reabra o projeto e tente outra vez."); },
        });
        return;
    }

    seen.add(value);

    if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}.${i}`, seen, issues));
    } else {
        for (const [key, item] of Object.entries(value)) {
            walk(item, `${path}.${key}`, seen, issues);
        }
    }

    seen.delete(value);
}

/** Os nós e as ligações de um material, com os limites e as pontas soltas. */
function checkGraph(graph: SerializedGraph | undefined, base: string, issues: PayloadIssue[]): void {
    if (!isRecord(graph) || !Array.isArray(graph.nodes)) {
        issues.push({
            path: base,
            detail: uiText("{value0} não é um grafo.", { value0: String(base) }),
            get message() { return uiText("Um dos materiais deste projeto ficou sem grafo e não pode ser guardado."); },
        });
        return;
    }

    if (graph.nodes.length > LIMITS.nodesPerMaterial) {
        issues.push({
            path: `${base}.nodes`,
            detail: uiText("{value0} nós (máximo {value1}).", { value0: String(graph.nodes.length), value1: String(LIMITS.nodesPerMaterial) }),
            message: uiText("Este material tem {value0} nós e o limite por material é {value1}.", { value0: String(graph.nodes.length), value1: String(LIMITS.nodesPerMaterial) }),
        });
    }

    if (graph.connections.length > LIMITS.connectionsPerMaterial) {
        issues.push({
            path: `${base}.connections`,
            detail: uiText("{value0} ligações (máximo {value1}).", { value0: String(graph.connections.length), value1: String(LIMITS.connectionsPerMaterial) }),
            message: uiText("Este material tem ligações a mais para poder ser guardado ({value0}).", { value0: String(graph.connections.length) }),
        });
    }

    const ids = new Set<string>();
    graph.nodes.forEach((node, i) => {
        if (!node.id || node.id.length > LIMITS.id) {
            issues.push({
                path: `${base}.nodes.${i}.id`,
                detail: uiText("id inválido: {value0}.", { value0: String(JSON.stringify(node.id)) }),
                get message() { return uiText("Um nó deste material ficou sem identificador e não pode ser guardado."); },
            });
            return;
        }

        // Dois nós com o mesmo id fazem as ligações apontar para o nó errado
        // quando o projeto voltar a abrir, e o erro aparece muito longe daqui.
        // É o defeito clássico de duplicar sem gerar identificadores novos.
        if (ids.has(node.id)) {
            issues.push({
                path: `${base}.nodes.${i}.id`,
                detail: `id repetido: ${node.id}.`,
                get message() { return uiText("Dois nós deste material ficaram com o mesmo identificador."); },
            });
        }
        ids.add(node.id);
    });

    graph.connections.forEach((c, i) => {
        // Uma ligação para um nó que não está aqui é ou uma ligação para outro
        // material, ou uma ponta que ficou de um nó apagado. Nenhuma das duas
        // se pode gravar: à leitura seria recusada e o material voltaria
        // diferente do que está no ecrã.
        for (const [campo, alvo] of [['sourceNodeId', c.sourceNodeId], ['targetNodeId', c.targetNodeId]] as const) {
            if (!ids.has(alvo)) {
                issues.push({
                    path: `${base}.connections.${i}.${campo}`,
                    detail: uiText("a ligação aponta para {value0}, que não é um nó deste material.", { value0: String(JSON.stringify(alvo)) }),
                    get message() { return uiText("Uma ligação deste material ficou solta e não pode ser guardada."); },
                });
            }
        }
    });
}

/**
 * O documento inteiro, antes de sair daqui.
 *
 * Devolve sempre um relatório — nunca lança. Uma gravação que falha não pode
 * ser mais uma coisa a correr mal: o grafo fica em memória, o editor continua a
 * responder, e o que isto produz é a frase que diz porquê.
 */
export function inspectLibraryPayload(doc: SerializedLibrary): PayloadReport {
    const issues: PayloadIssue[] = [];

    const materiais = Array.isArray(doc?.materials) ? doc.materials : [];
    let nodes = 0;
    let connections = 0;

    if (!isRecord(doc) || !Array.isArray(doc.materials)) {
        issues.push({
            path: '(documento)',
            detail: uiText("o documento não tem a lista de materiais."),
            get message() { return uiText("Não foi possível preparar o material para gravar."); },
        });
    }

    if (doc?.libraryVersion !== LIBRARY_VERSION) {
        issues.push({
            path: 'libraryVersion',
            detail: uiText("versão {value0} em vez de {value1}.", { value0: String(String(doc?.libraryVersion)), value1: String(LIBRARY_VERSION) }),
            get message() { return uiText("O material foi montado por outra versão da aplicação. Actualize a página."); },
        });
    }

    if (materiais.length > LIMITS.materials) {
        issues.push({
            path: 'materials',
            detail: uiText("{value0} materiais (máximo {value1}).", { value0: String(materiais.length), value1: String(LIMITS.materials) }),
            message: uiText("O modelo tem {value0} materiais e só se podem guardar {value1}.", { value0: String(materiais.length), value1: String(LIMITS.materials) }),
        });
    }

    const vistos = new Set<string>();

    materiais.forEach((material, i) => {
        const base = `materials.${i}`;

        if (!material?.id) {
            issues.push({
                path: `${base}.id`,
                detail: 'material sem identificador.',
                get message() { return uiText("Um material do modelo não tem nome e por isso não pode ser guardado."); },
            });
        } else if (material.id.length > LIMITS.materialId) {
            issues.push({
                path: `${base}.id`,
                detail: uiText("nome com {value0} caracteres (máximo {value1}).", { value0: String(material.id.length), value1: String(LIMITS.materialId) }),
                message: uiText("O nome do material \"{value0}…\" é demasiado longo para ser guardado.", { value0: String(material.id.slice(0, 40)) }),
            });
        } else if (vistos.has(material.id)) {
            issues.push({
                path: `${base}.id`,
                detail: `material repetido: ${material.id}.`,
                message: uiText("Há dois materiais com o nome \"{value0}\".", { value0: String(material.id) }),
            });
        }

        if (material?.id) vistos.add(material.id);

        nodes += material?.nodeGraph?.nodes?.length ?? 0;
        connections += material?.nodeGraph?.connections?.length ?? 0;

        checkGraph(material?.nodeGraph, `${base}.nodeGraph`, issues);
    });

    // O passeio por tudo vem depois das contagens: se um campo não for
    // gravável, o que interessa é o caminho até ele, e o caminho é o mesmo que
    // o servidor usaria.
    walk(doc, '', new Set(), issues);
    for (const issue of issues) if (issue.path === '') issue.path = '(documento)';

    // O tamanho é a última pergunta, e a única que precisa de serializar. Um
    // documento com uma referência circular rebentava aqui — daí vir depois do
    // passeio, que já a teria encontrado e nomeado.
    let bytes = 0;
    if (issues.length === 0) {
        try {
            bytes = JSON.stringify(doc).length;
        } catch (e) {
            issues.push({
                path: '(documento)',
                detail: `JSON.stringify falhou: ${e instanceof Error ? e.message : String(e)}`,
                get message() { return uiText("O material contém dados que não podem ser guardados."); },
            });
        }

        if (bytes > LIMITS.bytes) {
            issues.push({
                path: '(documento)',
                detail: uiText("{value0} bytes (máximo {value1}).", { value0: String(bytes), value1: String(LIMITS.bytes) }),
                get message() { return uiText("Os materiais deste projeto são grandes de mais para serem guardados. Simplifique um dos grafos."); },
            });
        }
    }

    return {
        ok: issues.length === 0,
        issues,
        materials: materiais.length,
        nodes,
        connections,
        bytes,
    };
}
