/**
 * Mix Shader — dois materiais, e um número a dizer quanto de cada.
 *
 * Na placa gráfica isto é o que parece: cada canal é a mistura do canal dos dois
 * lados, calculada por fragmento. É por isso que o nó está marcado `gpu` — uma
 * mistura de duas superfícies com texturas não tem resposta única no CPU, e
 * fingir que tinha era dar um material que não é o que o grafo descreve.
 *
 * Ele avalia-se na mesma no CPU, porque a interface e os testes precisam de uma
 * descrição: os números interpolam-se, e as texturas ficam com as do lado que o
 * factor favorece. É uma aproximação, e está aqui escrita como tal — o que se
 * vê no ecrã é a versão da placa gráfica.
 */
import {
    defaultSurface,
    type EvalContext,
    type NodeDefinition,
    type Resolved,
    type SurfaceValue,
} from '../../core/types';
import { emitMixNormal, emitMixShader } from './MixShaderShader';

export const NODE_MIX_SHADER = 'mixShader';

/** Os números da superfície, os únicos que se interpolam. */
const NUMBERS = ['roughness', 'metallic', 'normalStrength', 'emissiveStrength', 'opacity'] as const;

/** As referências a imagens, que não se interpolam — escolhem-se. */
const TEXTURES = ['baseColorTexture', 'roughnessTexture', 'metallicTexture', 'normalTexture'] as const;

function evaluate(ctx: EvalContext): Record<string, Resolved> {
    const fac = Math.min(1, Math.max(0, ctx.float('fac')));

    const a = ctx.incoming('shader1')?.surface ?? defaultSurface();
    const b = ctx.incoming('shader2')?.surface ?? defaultSurface();

    const surface: SurfaceValue = defaultSurface();

    surface.baseColor = {
        r: a.baseColor.r + (b.baseColor.r - a.baseColor.r) * fac,
        g: a.baseColor.g + (b.baseColor.g - a.baseColor.g) * fac,
        b: a.baseColor.b + (b.baseColor.b - a.baseColor.b) * fac,
    };

    for (const key of NUMBERS) surface[key] = a[key] + (b[key] - a[key]) * fac;

    // O lado que o factor favorece dá as imagens. Meia textura não existe, e
    // misturar duas é trabalho da placa gráfica — que é onde ele é feito.
    const dominant = fac >= 0.5 ? b : a;
    surface.baseColorSRGB = dominant.baseColorSRGB;
    surface.roughnessSRGB = dominant.roughnessSRGB;
    surface.metallicSRGB = dominant.metallicSRGB;
    for (const key of TEXTURES) surface[key] = dominant[key] ?? a[key] ?? b[key];

    return { bsdf: { surface } };
}

export const mixShader: NodeDefinition = {
    type: NODE_MIX_SHADER,
    label: 'Mix Shader',
    category: 'shader',
    gpu: true,
    inputs: [
        { id: 'fac', label: 'Fac', type: 'FLOAT', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
        { id: 'shader1', label: 'Shader', type: 'BSDF', defaultValue: null },
        { id: 'shader2', label: 'Shader', type: 'BSDF', defaultValue: null },
    ],
    outputs: [{ id: 'bsdf', label: 'Shader', type: 'BSDF' }],
    evaluate,
    emitSurface: emitMixShader,
    emitNormal: emitMixNormal,
};
