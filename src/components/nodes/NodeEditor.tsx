import { tr as uiText, useLanguage as useUiLanguage } from '../../i18n';
/**
 * O editor de nós.
 *
 * Um editor de nós comporta-se como um editor de nós — grelha, arrastar, zoom,
 * ligações a passar por cima, teclas — e não como um formulário. Ao mesmo
 * tempo, as cores, os tipos de letra e os controlos são os do resto da
 * aplicação: é uma secção do Visualizador, não um programa à parte enfiado
 * dentro dele.
 *
 * ## Sem dependência nova
 *
 * O projeto já traz React, e o que isto precisa é de SVG para as linhas e de
 * uma transformação CSS para o zoom. Uma biblioteca de grafos traria consigo o
 * seu próprio modelo de dados, e o modelo de dados é justamente a parte que
 * tem de ser nossa para poder ser gravada e migrada.
 *
 * ## O que o editor faz e o que não faz
 *
 * Mexe no grafo e mais nada. Não cria materiais, não fala com o Three.js e não
 * sabe o que uma ligação significa — para ele, uma ligação é uma linha entre
 * dois sockets cujos tipos a validação aceitou. Quem transforma isso num
 * material é o avaliador.
 *
 * Também não decide o que cada tecla faz (`shortcuts.ts`), nem como se duplica
 * um grupo de nós (`commands.ts`), nem o que é desfazer (`history.ts`). Este
 * ficheiro é o sítio onde essas três coisas se encontram com o rato.
 *
 * ## Onde nasce um nó
 *
 * No cursor. Sempre, e por um caminho só — `criar()`. O menu de contexto, o
 * `Shift+A`, o botão da barra e o colar passam todos por lá, com a posição do
 * cursor em coordenadas do grafo. Ter cada caminho a escolher a sua posição era
 * o que fazia o mesmo gesto dar resultados diferentes consoante por onde se
 * tivesse pedido.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NodePracticeContext } from './NodePracticeContext';

import {
    allNodeDefinitions,
    checkConnection,
    connect,
    createNode,
    disconnect,
    getNodeDefinition,
    nextConnectionId,
    type MaterialGraph,
    type NodeCategory,
    type SocketType,
} from '../../materials/nodes';
import {
    copyNodes,
    corner,
    cutNodes,
    deleteNodes,
    duplicateNodes,
    moveNodes,
    pasteClip,
    selectAll,
    selectionCorner,
    type Clip,
} from './commands';
import { canRedo, canUndo, emptyHistory, record, redo, undo, type History } from './history';
import { SHORTCUT_HELP, mutates, type CommandId } from './shortcuts';
import { useNodeShortcuts } from './useNodeShortcuts';
import { NODE_WIDTH, SOCKET_COLORS, socketPosition } from './layout';
import NodeBox from './NodeBox';
import { graphDiagnostics } from './graphDiagnostics';


/**
 * A ordem por que as categorias aparecem no menu.
 *
 * Escrita e não descoberta: `allNodeDefinitions()` devolve a ordem de registo,
 * e o que se quer aqui é a ordem por que uma pessoa procura — primeiro o que
 * produz um padrão, depois o que lhe mexe na cor, e o shader no fim.
 */
const CATEGORIES: { id: NodeCategory; label: string }[] = [
    { id: 'texture', label: 'Texture' },
    { id: 'color', label: 'Color' },
    { id: 'input', label: 'Input' },
    { id: 'math', label: 'Math' },
    { id: 'vector', label: 'Vector' },
    { id: 'shader', label: 'Shader' },
    { id: 'output', label: 'Output' },
];

interface Ponto { x: number; y: number }

/** Nós a seguir o rato: o arrastar de sempre, e o duplicado do `Shift+D`. */
interface Movendo {
    ids: string[];
    /** Onde o rato estava quando isto começou, em coordenadas do grafo. */
    from: Ponto;
    /**
     * O grafo a partir do qual as posições se calculam.
     *
     * Somar deltas ao grafo actual a cada movimento acumulava o erro do
     * arredondamento, e o nó ia-se afastando do cursor ao longo de um arrasto
     * comprido. Contando sempre a partir daqui, a posição passa a ser uma
     * função da posição do rato e mais nada.
     */
    base: MaterialGraph;
    /**
     * O grafo que o `Escape` repõe.
     *
     * Distinto do `base`, e a distinção é o que faz cancelar um duplicado
     * apagar as cópias: aqui está o grafo de **antes** de elas existirem, e no
     * `base` está o grafo com elas, que é o que se precisa para as mexer. Num
     * arrastar os dois são o mesmo.
     */
    cancelTo: MaterialGraph;
    /** Um duplicado confirma-se com um clique; um arrastar acaba ao largar. */
    confirmaAoClicar: boolean;
}

interface Linking {
    sourceNode: string;
    sourceSocket: string;
    type: SocketType;
    x: number;
    y: number;
}

/** O menu de criação: onde se desenha, e onde o nó vai nascer. */
interface Menu {
    /** Dentro da tela, para o CSS. */
    local: Ponto;
    /** No grafo, para o nó. As duas não são a mesma coisa quando há zoom. */
    graph: Ponto;
}

/** Junta os passos de uma roda do rato numa gravação só da vista. */
const ATRASO_DA_VISTA_MS = 500;

/**
 * A área de transferência do editor, fora do componente.
 *
 * Ao nível do módulo para sobreviver ao que não devia apagá-la: mudar de
 * material, fechar e reabrir o editor, o React voltar a montar o componente.
 * Copiar três nós na carroçaria e colá-los no vidro é um gesto normal, e uma
 * área de transferência que morresse ao trocar de separador tornava-o
 * impossível sem que nada explicasse porquê.
 */


/** Uma curva, e não uma recta: é o que deixa ler duas ligações que se cruzam. */
function curve(a: Ponto, b: Ponto) {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export default function NodeEditor() {
    useUiLanguage();
    const practice = useContext(NodePracticeContext);
    if (!practice) throw new Error('The editor requires NodePracticeContext.Provider.');
    const { graph, assets, setGraph, selection, setSelection, showError } = practice;
    const diagnostics = graphDiagnostics(graph, assets);
    const canEditMaterials = true;
    const activeMaterial = 'tutorial';
    const setMaterialView = practice.setView;
    const practiceClipboard = useRef<Clip | null>(null);

    const raiz = useRef<HTMLDivElement>(null);
    const surface = useRef<HTMLDivElement>(null);

    /**
     * A vista é local durante o gesto e guardada quando ele acaba.
     *
     * Arrastar a tela produz uma posição por movimento do rato. Escrever cada
     * uma no store punha o material a ser reavaliado a cada píxel de
     * deslocação — e o zoom não muda material nenhum. Local enquanto se mexe,
     * guardada no fim: é a mesma ideia do atraso da gravação, um nível acima.
     */
    const [view, setView] = useState(() => practice.view);
    const [movendo, setMovendo] = useState<Movendo | null>(null);
    const [panning, setPanning] = useState<{ x: number; y: number } | null>(null);
    const [linking, setLinking] = useState<Linking | null>(null);
    const [menu, setMenu] = useState<Menu | null>(null);

    const vistaAtual = useRef(view);
    vistaAtual.current = view;

    const temporizadorDaVista = useRef<number | null>(null);

    /**
     * Onde o cursor esteve pela última vez, em coordenadas do **grafo**.
     *
     * É daqui que sai a posição de tudo o que se cria. Guardado enquanto o rato
     * anda, e não lido no momento da criação, porque no momento da criação o
     * rato já não está lá: escolher um nó num menu leva o cursor até ao item do
     * menu, e um `Ctrl+V` não tem cursor nenhum. O que a pessoa quis dizer foi
     * onde ela estava quando pediu.
     */
    const cursor = useRef<Ponto>({ x: 120, y: 80 });

    /** Uma pilha de desfazer por material — ver `history.ts`. */
    const historias = useRef(new Map<string, History>());
    const [historia, setHistoria] = useState<History>(emptyHistory);

    /** Para não guardar um passo por cada tecla escrita no mesmo campo. */
    const ultimoRegisto = useRef<{ tag: string; at: number } | null>(null);

    /** Guarda a vista no material a que ela pertence. */
    const guardarVista = useCallback(() => {
        if (temporizadorDaVista.current !== null) window.clearTimeout(temporizadorDaVista.current);
        setMaterialView(vistaAtual.current);
    }, [setMaterialView]);

    /**
     * Trocar de material traz a tela desse material, e a pilha desse material.
     *
     * Sem a primeira metade, mudar de Body para Glass mostrava o grafo do vidro
     * pela vista da carroçaria — muitas vezes com os nós fora do ecrã, o que se
     * parece com um grafo vazio. Sem a segunda, desfazer no vidro repunha um
     * grafo da carroçaria.
     */
    useEffect(() => {
        setView(practice.view);
        setHistoria(historias.current.get(activeMaterial ?? '') ?? emptyHistory());
        setMovendo(null);
        setLinking(null);
        setMenu(null);
    }, [activeMaterial]);

    // Sair do editor não pode perder onde a tela estava.
    useEffect(() => () => {
        if (temporizadorDaVista.current !== null) window.clearTimeout(temporizadorDaVista.current);
    }, []);

    /** Do ecrã para o grafo: desfaz a deslocação e o zoom. */
    const toGraph = useCallback((clientX: number, clientY: number): Ponto => {
        const box = surface.current?.getBoundingClientRect();
        if (!box) return { x: 0, y: 0 };
        return {
            x: (clientX - box.left - view.x) / view.zoom,
            y: (clientY - box.top - view.y) / view.zoom,
        };
    }, [view]);

    /** Do ecrã para dentro da tela, que é o sistema em que o menu se desenha. */
    const toLocal = useCallback((clientX: number, clientY: number): Ponto => {
        const box = surface.current?.getBoundingClientRect();
        if (!box) return { x: 0, y: 0 };
        return { x: clientX - box.left, y: clientY - box.top };
    }, []);

    // ── Escrever no grafo ────────────────────────────────────────────────

    /**
     * A única porta por onde uma mudança entra no grafo.
     *
     * Guarda o estado anterior no histórico e só depois escreve. Passar ao lado
     * disto é a maneira de uma operação ficar sem desfazer, e nenhum comando o
     * faz — os que precisam de não guardar (arrastar, seguir o cursor) usam o
     * `mexer` abaixo, que é explícito sobre isso.
     *
     * O `tag` junta as mudanças seguidas do mesmo controlo num passo só: escrever
     * "0.75" num campo são quatro mudanças, e quatro desfazeres para voltar ao
     * que lá estava seria um desfazer inútil.
     */
    const aplicar = useCallback((next: MaterialGraph, tag?: string) => {
        const agora = Date.now();
        const repetido = !!tag
            && ultimoRegisto.current?.tag === tag
            && agora - ultimoRegisto.current.at < 800;

        if (!repetido) {
            setHistoria((h) => {
                const proxima = record(h, graph);
                historias.current.set(activeMaterial ?? '', proxima);
                return proxima;
            });
        }

        ultimoRegisto.current = tag ? { tag, at: agora } : null;
        setGraph(next);
    }, [graph, setGraph, activeMaterial]);

    /** Escreve sem guardar um passo. Para os estados por que se passa. */
    const mexer = useCallback((next: MaterialGraph) => setGraph(next), [setGraph]);

    /** Guarda um passo sem escrever. Para quando a escrita vem a seguir, aos pedaços. */
    const marcar = useCallback((antes: MaterialGraph) => {
        setHistoria((h) => {
            const proxima = record(h, antes);
            historias.current.set(activeMaterial ?? '', proxima);
            return proxima;
        });
        ultimoRegisto.current = null;
    }, [activeMaterial]);

    // ── Criar nós ────────────────────────────────────────────────────────

    /**
     * Cria um nó de um tipo, no ponto dado — e por omissão no cursor.
     *
     * O caminho único de criação. Tudo o que cria um nó chama isto: o menu de
     * contexto, o `Shift+A`, o botão da barra. Nenhum componente de nó decide
     * onde nasce.
     */
    const criar = useCallback((type: string, at?: Ponto) => {
        const definition = getNodeDefinition(type);
        if (!definition) return;

        if (definition.unique && graph.nodes.some((n) => n.type === type)) {
            showError(uiText("Só pode haver um {value0}.", { value0: String(definition.label) }));
            setMenu(null);
            return;
        }

        const node = createNode(type, at ?? cursor.current);
        if (!node) return;

        aplicar({ ...graph, nodes: [...graph.nodes, node] });
        setSelection([node.id]);
        setMenu(null);
    }, [graph, aplicar, setSelection, showError]);

    /** Abre o menu no cursor: o de contexto, o `Shift+A` e o botão da barra. */
    const abrirMenu = useCallback((clientX?: number, clientY?: number) => {
        const box = surface.current?.getBoundingClientRect();

        if (clientX === undefined || clientY === undefined || !box) {
            // Sem rato — veio de uma tecla ou de um botão. O menu desenha-se
            // onde o cursor está no grafo, convertido de volta para a tela.
            setMenu({
                local: {
                    x: cursor.current.x * view.zoom + view.x,
                    y: cursor.current.y * view.zoom + view.y,
                },
                graph: { ...cursor.current },
            });
            return;
        }

        setMenu({ local: toLocal(clientX, clientY), graph: toGraph(clientX, clientY) });
    }, [toLocal, toGraph, view]);

    // ── Rato ─────────────────────────────────────────────────────────────

    const onPointerDown = (event: React.PointerEvent) => {
        if (event.button !== 0) return;

        // Um duplicado a seguir o cursor confirma-se com um clique, onde quer
        // que ele seja. É o gesto do Blender, e é o que faz "carrega para
        // largar" ser óbvio sem nada escrito.
        if (movendo?.confirmaAoClicar) {
            // O passo de desfazer guarda-se aqui, na confirmação, e não quando
            // as cópias apareceram: um duplicado cancelado não deixa passo
            // nenhum para trás, que é o que faz o `Ctrl+Z` seguinte desfazer a
            // operação **anterior** em vez de parecer não fazer nada.
            marcar(movendo.cancelTo);
            setMovendo(null);
            return;
        }

        // A camada transformada também cobre o vazio da tela: o botão
        // esquerdo deve deslocar a vista nas duas áreas de fundo.
        if (event.target === surface.current
            || (event.target instanceof Element && event.target.classList.contains('ne-mundo'))) {
            event.preventDefault();
            setPanning({ x: event.clientX - view.x, y: event.clientY - view.y });
            setSelection([]);
            setMenu(null);
        }
    };

    const onPointerMove = (event: React.PointerEvent) => {
        const ponto = toGraph(event.clientX, event.clientY);
        cursor.current = ponto;

        if (panning) {
            setView((v) => ({ ...v, x: event.clientX - panning.x, y: event.clientY - panning.y }));
            return;
        }

        if (movendo) {
            mexer(moveNodes(movendo.base, movendo.ids, {
                x: ponto.x - movendo.from.x,
                y: ponto.y - movendo.from.y,
            }));
            return;
        }

        if (linking) setLinking({ ...linking, x: ponto.x, y: ponto.y });
    };

    const onPointerUp = () => {
        // O gesto acabou: é aqui que a vista passa de local a guardada.
        if (panning) guardarVista();

        setPanning(null);

        // Um duplicado continua a seguir o cursor depois de se largar a tecla;
        // é o clique que o pousa. Um arrastar acaba aqui.
        if (movendo && !movendo.confirmaAoClicar) {
            // Um arrasto inteiro é **um** passo, e só há passo se alguma coisa
            // se mexeu: carregar num nó e largar sem o mover não é uma edição.
            // A comparação é por referência porque só um movimento escreve um
            // grafo novo.
            if (graph !== movendo.base) marcar(movendo.cancelTo);
            setMovendo(null);
        }
        // Uma ligação largada no vazio desaparece, e não fica meia feita.
        setLinking(null);
    };

    useEffect(() => {
        const tela = surface.current;
        if (!tela) return;

        const onWheel = (event: WheelEvent) => {
            // Um listener não passivo pode cancelar a rolagem e o zoom da
            // página. A roda pertence ao editor enquanto o ponteiro está nele.
            event.preventDefault();
            event.stopPropagation();
            if (event.deltaY === 0) return;

            const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
            const box = tela.getBoundingClientRect();
            const px = event.clientX - box.left;
            const py = event.clientY - box.top;

            // O zoom continua centrado no ponteiro, inclusive quando vários
            // eventos da roda chegam antes da próxima renderização.
            setView((v) => {
                const zoom = Math.min(2.5, Math.max(0.25, v.zoom * factor));
                return {
                    zoom,
                    x: px - (px - v.x) * (zoom / v.zoom),
                    y: py - (py - v.y) * (zoom / v.zoom),
                };
            });

            // A roda não tem fim: guarda-se quando ela pára.
            if (temporizadorDaVista.current !== null) window.clearTimeout(temporizadorDaVista.current);
            temporizadorDaVista.current = window.setTimeout(guardarVista, ATRASO_DA_VISTA_MS);
        };

        tela.addEventListener('wheel', onWheel, { passive: false });
        return () => tela.removeEventListener('wheel', onWheel);
    }, [guardarVista]);

    // ── Ligações ─────────────────────────────────────────────────────────

    const startLink = (nodeId: string, socketId: string, type: SocketType, event: React.PointerEvent) => {
        event.stopPropagation();
        const point = toGraph(event.clientX, event.clientY);
        setLinking({ sourceNode: nodeId, sourceSocket: socketId, type, x: point.x, y: point.y });
    };

    const startKeyboardLink = (nodeId: string, socketId: string, type: SocketType) => {
        const node = graph.nodes.find(item => item.id === nodeId);
        const point = node && socketPosition(node, socketId, 'output');
        if (point) setLinking({ sourceNode: nodeId, sourceSocket: socketId, type, x: point.x, y: point.y });
    };

    const finishLink = (targetNode: string, targetSocket: string, event: React.SyntheticEvent) => {
        event.stopPropagation();
        if (!linking) return;

        const request = {
            sourceNode: linking.sourceNode,
            sourceSocket: linking.sourceSocket,
            targetNode,
            targetSocket,
        };

        const check = checkConnection(graph, request);
        if (!check.ok) {
            // A recusa diz porquê. Uma ligação que simplesmente não aparece
            // parece um editor avariado.
            showError(check.message ?? uiText("Ligação inválida."));
            setLinking(null);
            return;
        }

        aplicar(connect(graph, request, nextConnectionId()));
        setLinking(null);
    };

    // ── Enquadrar ────────────────────────────────────────────────────────

    /** Põe a selecção — ou o grafo inteiro — no meio da tela. */
    const enquadrar = useCallback(() => {
        const box = surface.current?.getBoundingClientRect();
        if (!box) return;

        const alvo = selection.length > 0
            ? graph.nodes.filter((n) => selection.includes(n.id))
            : graph.nodes;
        if (alvo.length === 0) return;

        const min = corner(alvo);
        const max = {
            x: Math.max(...alvo.map((n) => n.position.x)) + NODE_WIDTH,
            y: Math.max(...alvo.map((n) => n.position.y)) + 160,
        };

        const zoom = Math.min(2.5, Math.max(0.25, Math.min(
            (box.width - 80) / Math.max(1, max.x - min.x),
            (box.height - 80) / Math.max(1, max.y - min.y),
        )));

        setView({
            zoom,
            x: box.width / 2 - ((min.x + max.x) / 2) * zoom,
            y: box.height / 2 - ((min.y + max.y) / 2) * zoom,
        });

        if (temporizadorDaVista.current !== null) window.clearTimeout(temporizadorDaVista.current);
        temporizadorDaVista.current = window.setTimeout(guardarVista, ATRASO_DA_VISTA_MS);
    }, [graph, selection, guardarVista]);

    // ── Cancelar ─────────────────────────────────────────────────────────

    /** O `Escape`: desfaz o que estiver a meio, do mais recente para o mais antigo. */
    const cancelar = useCallback((): boolean => {
        if (movendo) {
            mexer(movendo.cancelTo);
            // Um duplicado cancelado deixa de existir, e por isso a selecção
            // dele também.
            if (movendo.confirmaAoClicar) setSelection([]);
            setMovendo(null);
            return true;
        }

        if (linking) { setLinking(null); return true; }
        if (menu) { setMenu(null); return true; }
        if (selection.length > 0) { setSelection([]); return true; }

        return false;
    }, [movendo, linking, menu, selection, mexer, setSelection]);

    // ── Comandos ─────────────────────────────────────────────────────────

    const executar = useCallback((comando: CommandId): boolean => {
        if (comando === 'cancel') return cancelar();
        if (comando === 'frame') { enquadrar(); return true; }
        if (comando === 'selectAll') { setSelection(selectAll(graph)); return true; }
        if (comando === 'addMenu') { abrirMenu(); return true; }

        if (comando === 'copy') {
            const clip = copyNodes(graph, selection);
            if (clip) practiceClipboard.current = clip;
            // Sem nada seleccionado o `Ctrl+C` não é do editor: deixa-o passar,
            // que é o que faz copiar texto continuar a funcionar por perto.
            return !!clip;
        }

        // Daqui para baixo, tudo escreve — e quem só pode ver não escreve.
        if (mutates(comando) && !canEditMaterials) return false;

        switch (comando) {
            case 'undo': {
                const passo = undo(historia, graph);
                if (!passo) return false;
                setHistoria(passo.history);
                historias.current.set(activeMaterial ?? '', passo.history);
                mexer(passo.graph);
                setSelection([]);
                return true;
            }

            case 'redo': {
                const passo = redo(historia, graph);
                if (!passo) return false;
                setHistoria(passo.history);
                historias.current.set(activeMaterial ?? '', passo.history);
                mexer(passo.graph);
                setSelection([]);
                return true;
            }

            case 'paste': {
                const resultado = pasteClip(graph, practiceClipboard.current, cursor.current);
                if (!resultado) return false;
                aplicar(resultado.graph);
                setSelection(resultado.selection);
                return true;
            }

            case 'cut': {
                const resultado = cutNodes(graph, selection);
                if (!resultado) return false;
                practiceClipboard.current = resultado.clip;
                aplicar(resultado.graph);
                setSelection([]);
                if (resultado.protegidos > 0) {
                    showError(uiText("O Material Output não pode ser cortado."));
                }
                return true;
            }

            case 'delete': {
                if (selection.length === 0) return false;
                const resultado = deleteNodes(graph, selection);

                // Nada saiu quer dizer que o que estava seleccionado era o nó
                // que não se apaga. Sem o dizer, a tecla parecia não funcionar.
                if (resultado.graph.nodes.length === graph.nodes.length) {
                    if (resultado.protegidos > 0) showError(uiText("O Material Output não pode ser apagado."));
                    return true;
                }

                aplicar(resultado.graph);
                setSelection([]);
                return true;
            }

            case 'duplicate': {
                // As cópias nascem **por cima** dos originais e a partir daí
                // seguem o cursor, que é o gesto do Blender. Nascerem já
                // deslocadas dava um salto antes do primeiro movimento do rato,
                // e um salto lê-se como um erro.
                const resultado = duplicateNodes(
                    graph, selection, selectionCorner(graph, selection) ?? undefined,
                );
                if (!resultado) return false;

                // Escrito sem guardar passo: o passo guarda-se na confirmação,
                // porque um duplicado cancelado nunca chegou a acontecer.
                mexer(resultado.graph);
                setSelection(resultado.selection);

                setMovendo({
                    ids: resultado.selection,
                    from: cursor.current,
                    base: resultado.graph,
                    cancelTo: graph,
                    confirmaAoClicar: true,
                });
                return true;
            }

            default:
                return false;
        }
    }, [
        graph, selection, historia, activeMaterial, canEditMaterials,
        cancelar, enquadrar, abrirMenu, aplicar, mexer, setSelection, showError,
    ]);

    useNodeShortcuts(raiz, executar);

    // ── Desenho ──────────────────────────────────────────────────────────

    const linhas = useMemo(() => graph.connections.map((c) => {
        const source = graph.nodes.find((n) => n.id === c.sourceNode);
        const target = graph.nodes.find((n) => n.id === c.targetNode);
        if (!source || !target) return null;

        const a = socketPosition(source, c.sourceSocket, 'output');
        const b = socketPosition(target, c.targetSocket, 'input');
        if (!a || !b) return null;

        const type = getNodeDefinition(source.type)?.outputs
            .find((o) => o.id === c.sourceSocket)?.type ?? 'FLOAT';

        return { id: c.id, a, b, color: SOCKET_COLORS[type] };
    }).filter(Boolean) as { id: string; a: Ponto; b: Ponto; color: string }[],
    [graph]);

    const ajuda = SHORTCUT_HELP.map((a) => `${a.keys} — ${a.what}`).join('\n');

    return (
        <div className="ne-wrap" ref={raiz}>
            <div className="ne-barra">
                <button type="button" onClick={() => abrirMenu()}>{uiText("+ Nó")}</button>
                <button
                    type="button"
                    disabled={selection.length === 0}
                    onClick={() => executar('delete')}
                >
                    {uiText("Apagar")}</button>
                <button
                    type="button"
                    disabled={!canUndo(historia)}
                    title="Ctrl+Z"
                    onClick={() => executar('undo')}
                >
                    {uiText("Desfazer")}</button>
                <button
                    type="button"
                    disabled={!canRedo(historia)}
                    title="Ctrl+Shift+Z"
                    onClick={() => executar('redo')}
                >
                    {uiText("Refazer")}</button>

                {/*
                  * As teclas ficam à vista num sítio onde não ocupam espaço.
                  * A lista vem da mesma tabela que as executa, por isso não há
                  * aqui nada que possa ficar a mentir sobre o que o editor faz.
                  */}
                <span className="ne-atalhos" title={ajuda} aria-label={`Shortcuts: ${ajuda}`}>?</span>

                <span className="ne-zoom">{Math.round(view.zoom * 100)}%</span>
                <button type="button" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>{uiText("Repor vista")}</button>
            </div>

            {diagnostics.length > 0 && <p className="ne-diagnostics" role="status">{diagnostics.join(' ')}</p>}
            <div
                ref={surface}
                title={diagnostics.join(' ')}
                className="ne-tela"
                tabIndex={0}
                role="application"
                aria-label={uiText("Editor de nós de material")}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onContextMenu={(e) => {
                    e.preventDefault();
                    // Com um duplicado a seguir o cursor, o botão direito
                    // cancela-o em vez de abrir o menu — é o que ele faz no
                    // Blender, e abrir um menu a meio de uma colocação seria
                    // responder a outra pergunta.
                    if (movendo?.confirmaAoClicar) { cancelar(); return; }
                    abrirMenu(e.clientX, e.clientY);
                }}
                style={{
                    // A grelha desloca-se e cresce com a vista: é ela que diz
                    // que a tela se moveu, quando não há nós no ecrã.
                    backgroundPosition: `${view.x}px ${view.y}px`,
                    backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
                }}
            >
                <div
                    className="ne-mundo"
                    style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
                >
                    <svg className="ne-ligacoes" aria-hidden="true">
                        {linhas.map((l) => (
                            <path
                                key={l.id}
                                d={curve(l.a, l.b)}
                                stroke={l.color}
                                className="ne-ligacao"
                                onClick={() => canEditMaterials && aplicar(disconnect(graph, l.id))}
                            />
                        ))}

                        {linking && (
                            <path
                                d={curve(
                                    socketPosition(
                                        graph.nodes.find((n) => n.id === linking.sourceNode)!,
                                        linking.sourceSocket,
                                        'output',
                                    ) ?? { x: linking.x, y: linking.y },
                                    { x: linking.x, y: linking.y },
                                )}
                                stroke={SOCKET_COLORS[linking.type]}
                                className="ne-ligacao ne-ligacao-nova"
                            />
                        )}
                    </svg>

                    {graph.nodes.map((node) => (
                        <NodeBox
                            key={node.id}
                            node={node}
                            graph={graph}
                            selected={selection.includes(node.id)}
                            onSelect={(aditiva) => {
                                // Shift ou Ctrl junta à selecção; um clique
                                // simples substitui-a. É a convenção de todas
                                // as listas, e não vale a pena inventar outra.
                                if (!aditiva) { setSelection([node.id]); return; }
                                setSelection(selection.includes(node.id)
                                    ? selection.filter((id) => id !== node.id)
                                    : [...selection, node.id]);
                            }}
                            onStartDrag={(event) => {
                                const ponto = toGraph(event.clientX, event.clientY);
                                const aditiva = event.shiftKey || event.ctrlKey || event.metaKey;

                                // Arrastar um nó de fora da selecção passa a
                                // arrastar só esse; arrastar um de dentro leva
                                // o grupo inteiro. Com Shift, junta-o ao grupo.
                                let ids = selection;

                                if (aditiva) {
                                    ids = selection.includes(node.id)
                                        ? selection.filter((id) => id !== node.id)
                                        : [...selection, node.id];
                                    setSelection(ids);
                                } else if (!selection.includes(node.id)) {
                                    ids = [node.id];
                                    setSelection(ids);
                                }

                                if (ids.length === 0) return;

                                setMovendo({
                                    ids,
                                    from: ponto,
                                    base: graph,
                                    cancelTo: graph,
                                    confirmaAoClicar: false,
                                });
                            }}
                            onChange={(next: MaterialGraph) => aplicar(next, node.id)}
                            onStartLink={startLink}
                            onStartKeyboardLink={startKeyboardLink}
                            onFinishLink={finishLink}
                            linking={!!linking}
                        />
                    ))}
                </div>

                {menu && (
                    <div className="ne-menu" style={{ left: menu.local.x, top: menu.local.y }}>
                        {/*
                          * Agrupado por categoria, que é a mesma por que as
                          * pastas do código estão organizadas. Com cinco nós
                          * uma lista corrida chegava; com dezoito, procurar o
                          * Color Ramp no meio das texturas é trabalho que o
                          * menu devia estar a poupar.
                          */}
                        {CATEGORIES.map(({ id, label }) => {
                            const list = allNodeDefinitions().filter((d) => d.category === id);
                            if (list.length === 0) return null;

                            return (
                                <div key={id} className="ne-menu-grupo">
                                    <span className="ne-menu-titulo">{label}</span>
                                    {list.map((d) => (
                                        <button
                                            key={d.type}
                                            type="button"
                                            onClick={() => criar(d.type, menu.graph)}
                                        >
                                            {d.label}
                                        </button>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
