import { tr as uiText } from '../../../../i18n';
/**
 * Image Texture — uma imagem do projeto.
 *
 * O tipo chama-se `texture` e não `imageTexture` porque é o nome com que os
 * grafos já gravados o referem. Um nome mais bonito custava abrir partidos os
 * projetos que existem, e não é por isso que se muda um nome.
 *
 * A imagem entra por `assetId`: um identificador que o projeto já deu ao
 * ficheiro. **Nunca** um caminho, nunca um URL. Quem decide se aquele asset
 * pode ser lido é o sistema de projetos, como para qualquer outro ficheiro — um
 * grafo não é uma maneira de pedir ficheiros que o projeto não autorizaria.
 *
 * Não está marcado `gpu`: uma imagem sozinha continua a ir para um canal do
 * material, pelo `applyTextureToSlot` de sempre, que é quem sabe do espaço de
 * cor, do UDIM, do `flipY` e do registo no LOD. Só quando ela entra numa cadeia
 * com nós procedimentais é que passa a ser amostrada no shader gerado.
 */
import type { EmitContext, EvalContext, NodeDefinition, Resolved } from '../../core/types';
import { emitImageTexture } from './ImageTextureShader';

export const NODE_TEXTURE = 'texture';

function evaluate(ctx: EvalContext): Record<string, Resolved> {
    const assetId = ctx.text('assetId');
    const space = ctx.node.properties.colorSpace;
    const isSRGB = space === 'srgb' ? true : space === 'linear' ? false : undefined;

    // A mesma imagem sai como cor e como número. Qual delas se usa é decidido
    // por onde se liga, e não por uma conversão que ninguém escreveu.
    return {
        color: { texture: assetId, isSRGB, color: { r: 1, g: 1, b: 1 } },
        value: { texture: assetId, isSRGB, number: 1 },
    };
}

function emit(ctx: EmitContext): Record<string, string> {
    return emitImageTexture(ctx);
}

export const imageTexture: NodeDefinition = {
    type: NODE_TEXTURE,
    label: 'Image Texture',
    category: 'texture',
    inputs: [],
    outputs: [
        { id: 'color', label: 'Color', type: 'COLOR' },
        // O canal isolado, para quando a imagem serve de máscara — rugosidade,
        // metalicidade. Sai como FLOAT porque é isso que é: um número por
        // píxel. Sem isto, ligar uma textura a Roughness exigiria uma conversão
        // implícita de COLOR para FLOAT, e conversões que ninguém escreveu são
        // as que ninguém consegue explicar depois.
        { id: 'value', label: 'Value', type: 'FLOAT' },
    ],
    properties: {
        /** Id de um asset **do projeto**. Nunca um caminho nem um URL. */
        assetId: null,
        assetName: null,
        colorSpace: 'auto',
    },
    options: [{ key: 'colorSpace', label: 'Color Space', options: [
        { value: 'auto', get label() { return uiText("Color Space: por canal"); } },
        { value: 'srgb', get label() { return uiText("Color Space: sRGB"); } },
        { value: 'linear', get label() { return uiText("Color Space: Non-Color"); } },
    ] }],
    evaluate,
    emit,
};
