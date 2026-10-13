import { t, translateLabel, tr as uiText, useLanguage as useUiLanguage } from '../../i18n';
/**
 * Uma caixa de nó: cabeçalho, entradas, saídas e os controlos de cada entrada.
 *
 * Desenha-se a partir da **definição registada** e não do tipo: esta caixa não
 * sabe o que um Principled é. Por isso um nó novo aparece aqui sem uma linha de
 * código — é o que faz o registo valer a pena.
 *
 * As entradas sem ligação mostram o seu controlo; as ligadas mostram o nome e
 * mais nada, porque o valor passou a vir de outro sítio e um campo editável
 * que não é lido é um convite a um engano.
 */
import { useState } from 'react';

import {
    getNodeDefinition,
    NODE_BUMP,
    NODE_DISPLACEMENT,
    nodeOption,
    type ColorValue,
    type GraphNode,
    type MaterialGraph,
    type SocketType,
    type SocketValue,
} from '../../materials/nodes';
import { headerColor, NODE_HEADER, NODE_WIDTH, SOCKET_COLORS, SOCKET_SPACING } from './layout';
import TexturePicker from './TexturePicker';

/** Um canal 0–1 para os dois dígitos hexadecimais que o `input[type=color]` quer. */
function canal(v: number): string {
    return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
}

function toHex(color: ColorValue): string {
    return `#${canal(color.r)}${canal(color.g)}${canal(color.b)}`;
}

/**
 * Um campo numérico que deixa escrever sem deixar entrar lixo no grafo.
 *
 * Duas coisas ao mesmo tempo, e é a tensão entre elas que justifica ter estado
 * próprio.
 *
 * A primeira: **só números chegam ao grafo**. Apagar o conteúdo de um
 * `input[type=number]` dá `''`, e `parseFloat('')` dá `NaN`. Um `NaN` num socket
 * não fica por ali — o material passa a ser avaliado com ele, e no JSON da
 * gravação torna-se `null`, que na releitura seguinte não é um número válido e é
 * reposto no valor por omissão. O campo esvaziado apagava o valor **e** não
 * dizia nada; era preciso reabrir o projeto para dar por isso.
 *
 * A segunda: **o campo mostra o que se escreveu**. A correcção óbvia — ignorar o
 * que não é número e deixar o grafo como estava — tornava o campo impossível de
 * limpar: apagá-lo escrevia o valor antigo de volta no ecrã, e a pessoa acabava
 * com "57" onde queria "7". Enquanto se escreve, quem manda no que se vê é o
 * texto; ao sair, volta a mandar o grafo, que é onde está o valor a sério.
 */
function CampoNumero({ value, min, max, step, clamp = false, onCommit }: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    clamp?: boolean;
    onCommit: (n: number) => void;
}) {
    /** `null` quer dizer "mostra o que está no grafo". */
    const [texto, setTexto] = useState<string | null>(null);

    return (
        <input
            className="ne-num"
            type="number"
            value={texto ?? String(value)}
            min={min}
            max={max}
            step={step ?? 0.01}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => {
                setTexto(e.target.value);
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) onCommit(clamp ? Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)) : n);
            }}
            // Sair devolve o mando ao grafo: um campo deixado a meio — vazio, ou
            // com um "-" à espera do resto — volta a mostrar o valor que o
            // material tem de facto.
            onBlur={() => setTexto(null)}
        />
    );
}

function fromHex(hex: string): ColorValue {
    return {
        r: parseInt(hex.slice(1, 3), 16) / 255,
        g: parseInt(hex.slice(3, 5), 16) / 255,
        b: parseInt(hex.slice(5, 7), 16) / 255,
    };
}

export default function NodeBox({
    node, graph, selected, linking,
    onSelect, onStartDrag, onChange, onStartLink, onStartKeyboardLink, onFinishLink,
}: {
    node: GraphNode;
    graph: MaterialGraph;
    selected: boolean;
    linking: boolean;
    /** `true` quando o clique trazia Shift ou Ctrl: junta em vez de substituir. */
    onSelect: (additive: boolean) => void;
    onStartDrag: (event: React.PointerEvent) => void;
    onChange: (graph: MaterialGraph) => void;
    onStartLink: (nodeId: string, socketId: string, type: SocketType, event: React.PointerEvent) => void;
    onStartKeyboardLink?: (nodeId: string, socketId: string, type: SocketType) => void;
    onFinishLink: (nodeId: string, socketId: string, event: React.SyntheticEvent) => void;
}) {
    useUiLanguage();
    const definition = getNodeDefinition(node.type);
    const materialId = null;
    if (!definition) return null;

    const ligada = (socketId: string) => graph.connections
        .some((c) => c.targetNode === node.id && c.targetSocket === socketId);

    const setInput = (socketId: string, value: SocketValue) => onChange({
        ...graph,
        nodes: graph.nodes.map((n) => (n.id === node.id
            ? { ...n, inputs: { ...n.inputs, [socketId]: value } }
            : n)),
    });

    /**
     * Escreve propriedades — no plural, e isso importa.
     *
     * Escolher uma textura muda duas: o `assetId`, que é a referência, e o
     * `assetName`, que é o que se lê na caixa. Com uma função de uma
     * propriedade de cada vez eram duas chamadas seguidas, e ambas partiam do
     * mesmo `graph` — o React ainda não tinha voltado a desenhar entre uma e
     * outra. A segunda escrevia por cima da primeira, e o `assetId` desaparecia
     * sem deixar rasto: a caixa mostrava o nome do ficheiro e o material ficava
     * sem a imagem, que é a versão mais confusa possível deste defeito.
     */
    const setProperties = (values: Record<string, string | null>) => onChange({
        ...graph,
        nodes: graph.nodes.map((n) => (n.id === node.id
            ? { ...n, properties: { ...n.properties, ...values } }
            : n)),
    });

    return (
        <div
            className={`ne-no${selected ? ' ne-no-sel' : ''}`}
            style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH }}
            onPointerDown={(e) => { e.stopPropagation(); onSelect(e.shiftKey || e.ctrlKey || e.metaKey); }}
        >
            {/*
              * Só o cabeçalho arrasta. Arrastar a caixa inteira punha um
              * deslizador a mover o nó em vez de mudar o valor — o gesto é o
              * mesmo, e a única maneira de os separar é dar-lhes zonas
              * diferentes.
              */}
            <div
                className="ne-cabecalho"
                style={{ height: NODE_HEADER, background: headerColor(definition) }}
                onPointerDown={(e) => { e.stopPropagation(); onStartDrag(e); }}
            >
                {definition.label}
            </div>

            {definition.inputs.map((input) => {
                const conectada = ligada(input.id);

                return (
                    <div key={input.id} className="ne-linha" style={{ height: SOCKET_SPACING }}>
                        <button
                            type="button"
                            className="ne-socket ne-socket-in"
                            style={{ background: SOCKET_COLORS[input.type] }}
                            title={`${input.label} · ${input.type}`}
                            aria-label={t('nodeInput', { name: input.label, type: input.type })}
                            onPointerUp={(e) => onFinishLink(node.id, input.id, e)}
                            onClick={(e) => { if (e.detail === 0) onFinishLink(node.id, input.id, e); }}
                            onPointerDown={(e) => e.stopPropagation()}
                        />

                        <span className="ne-rotulo">{input.label}</span>

                        {/*
                          * Com ligação não há controlo: o valor vem de trás, e
                          * um campo que se pode mexer e que não é lido é a
                          * definição de uma promessa falsa.
                          */}
                        {!conectada && input.type === 'FLOAT' && (
                            <CampoNumero
                                // Uma chave por nó e por socket: um nó duplicado
                                // ou colado não pode herdar o texto a meio que
                                // outro campo tinha por escrever.
                                key={`${node.id}:${input.id}`}
                                value={typeof node.inputs[input.id] === 'number'
                                    ? node.inputs[input.id] as number
                                    : 0}
                                min={input.min}
                                max={input.max}
                                step={input.step}
                                clamp={definition.clampInputs}
                                onCommit={(n) => setInput(input.id, n)}
                            />
                        )}

                        {!conectada && input.type === 'COLOR' && (
                            <input
                                className="ne-cor"
                                type="color"
                                value={toHex(node.inputs[input.id] as ColorValue ?? { r: 1, g: 1, b: 1 })}
                                onPointerDown={(e) => e.stopPropagation()}
                                onChange={(e) => setInput(input.id, fromHex(e.target.value))}
                            />
                        )}

                        {conectada && <span className="ne-ligado">{uiText("ligado")}</span>}
                    </div>
                );
            })}

            {/*
              * A textura é uma propriedade e não uma entrada: é uma referência
              * a um asset do projeto, e nenhum nó a pode produzir. Distinguir
              * as duas coisas é o que impede o avaliador de tentar resolver
              * uma ligação para algo que nunca esteve ligado.
              */}
            {'assetId' in (definition.properties ?? {}) && (
                <div className="ne-propriedade ne-image-property" onPointerDown={(e) => e.stopPropagation()}>
                    <TexturePicker
                        nodeId={node.id}
                        materialId={materialId}
                        assetId={typeof node.properties.assetId === 'string' ? node.properties.assetId : null}
                        onPick={(id, name) => setProperties({ assetId: id, assetName: name })}
                    />
                </div>
            )}

            {/*
              * As escolhas fechadas — o modo de um Mix Color, a forma de uma
              * Wave — também são propriedades, e desenham-se a partir da lista
              * que a definição declara. A caixa não conhece nenhum modo pelo
              * nome, e por isso um modo novo aparece aqui sem uma linha de
              * código.
              *
              * Ao contrário de um número, mudar isto muda a estrutura do
              * material e o shader é gerado de novo. É uma vez por escolha, e
              * não por frame.
              */}
            {(definition.options ?? []).map((option) => (
                <div key={option.key} className={`ne-propriedade${option.runtime ? ' ne-runtime-option' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
                    {option.runtime && <span className="ne-option-label">{translateLabel(option.label)}</span>}
                    <select
                        className="ne-select"
                        aria-label={translateLabel(option.label)}
                        title={translateLabel(option.label)}
                        disabled={!!option.enabledWhen && nodeOption(node, option.enabledWhen.key) !== option.enabledWhen.value}
                        value={nodeOption(node, option.key)}
                        onChange={(e) => setProperties({ [option.key]: e.target.value })}
                    >
                        {option.options.map((choice) => (
                            <option key={choice.value} value={choice.value}>{translateLabel(choice.label)}</option>
                        ))}
                    </select>
                </div>
            ))}

            {definition.outputs.map((output) => (
                <div key={output.id} className="ne-linha ne-linha-out" style={{ height: SOCKET_SPACING }}>
                    <span className="ne-rotulo ne-rotulo-out">{output.label}</span>
                    <button
                        type="button"
                        className="ne-socket ne-socket-out"
                        style={{ background: SOCKET_COLORS[output.type] }}
                        title={`${output.label} · ${output.type}`}
                        aria-label={uiText("Saída {value0}, tipo {value1}", { value0: String(output.label), value1: String(output.type) })}
                        onPointerDown={(e) => { e.stopPropagation(); onStartLink(node.id, output.id, output.type, e); }}
                        onClick={(e) => { if (e.detail === 0) onStartKeyboardLink?.(node.id, output.id, output.type); }}
                    />
                </div>
            ))}

            {(node.type === NODE_BUMP || node.type === NODE_DISPLACEMENT) && <div className="ne-relief-help">
                <p>{uiText('Altura: ligue Image Texture.Value e escolha Non-Color; para procedurais, use a saída numérica.')}</p>
                <p>{node.type === NODE_BUMP
                    ? uiText('Ligue Bump.Normal a Principled BSDF.Normal. Normal Map e outros Bumps podem entrar em Bump.Normal. Distance usa unidades locais da malha.')
                    : uiText('Ligue Displacement ao Material Output.Displacement. Scale usa unidades locais da malha; a subdivisão preserva a forma original.')}</p>
                {node.type === NODE_DISPLACEMENT && nodeOption(node, 'geometry') === 'subdivide' && <p role="status">
                    {nodeOption(node, 'animated') === 'allow'
                        ? uiText('Subdividir modelos animados aumenta processamento e memória. Salvar esta configuração não aumenta o arquivo original: a geometria gerada é temporária.')
                        : uiText('Modelos com esqueleto ou morph targets mantêm a malha. Ative Permitir subdivisão para incluir modelos animados.')}
                </p>}
            </div>}

            {linking && <div className="ne-alvo" aria-hidden="true" />}
        </div>
    );
}
