/**
 * A mistura de dois shaders, canal a canal, por fragmento.
 *
 * Pede o mesmo canal aos dois lados e interpola. Não sabe o que está de cada
 * lado — pode ser um Principled, pode ser outro Mix Shader — porque pergunta
 * pelo contexto, e o contexto trata de descer. É a mesma razão por que o
 * compilador não sabe o que um Mix Shader é.
 *
 * Um lado por ligar vale o material por omissão, e não preto: um Mix Shader com
 * uma ponta solta ainda descreve alguma coisa, e um material que fica preto
 * quando falta uma ligação parece um erro de cálculo em vez de uma ligação a
 * faltar.
 */
import { defaultSurface, type ChannelId, type EmitContext } from '../../core/types';

/** O que um lado por ligar vale, em GLSL. */
function fallback(channel: ChannelId): string {
    const surface = defaultSurface();

    switch (channel) {
        case 'baseColor':
            return `vec3( ${surface.baseColor.r.toFixed(6)}, ${surface.baseColor.g.toFixed(6)}, ${surface.baseColor.b.toFixed(6)} )`;
        case 'roughness':
            return surface.roughness.toFixed(6);
        case 'metallic':
            return surface.metallic.toFixed(6);
        case 'emission':
            return surface.emissiveStrength.toFixed(6);
        case 'alpha':
        default:
            return surface.opacity.toFixed(6);
    }
}

export function emitMixShader(ctx: EmitContext, channel: ChannelId): string {
    const a = ctx.surface('shader1', channel) ?? fallback(channel);
    const b = ctx.surface('shader2', channel) ?? fallback(channel);
    const fac = ctx.input('fac');

    return `mix( ${a}, ${b}, clamp( ${fac}, 0.0, 1.0 ) )`;
}

export function emitMixNormal(ctx: EmitContext): string {
    const a = ctx.surfaceNormal?.('shader1') ?? ctx.normal ?? 'ndBaseNormal';
    const b = ctx.surfaceNormal?.('shader2') ?? ctx.normal ?? 'ndBaseNormal';
    ctx.helper('ndMixNormal', `
vec3 ndMixNormal( vec3 a, vec3 b, float fac ) {
    vec3 n = mix( a, b, clamp( fac, 0.0, 1.0 ) );
    return dot( n, n ) > 1e-12 ? normalize( n ) : a;
}`);
    return `ndMixNormal( ${a}, ${b}, ${ctx.input('fac')} )`;
}
