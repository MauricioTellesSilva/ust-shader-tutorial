/**
 * O padrão de células, no fragmento.
 *
 * Uma célula por ponto do espaço, e para cada píxel a mais próxima: dá pedra,
 * dá couro, dá vidro partido, e dá as manchas de qualquer coisa orgânica. As
 * duas saídas dizem coisas diferentes — a distância desenha as juntas entre
 * células, a cor pinta cada célula de sua cor.
 */
import type { EmitContext } from '../../core/types';
import { ND_HASH3, ND_VORONOI } from '../shared/Procedural';

export function emitVoronoiTexture(ctx: EmitContext): Record<string, string> {
    ctx.helper('ndHash3', ND_HASH3);
    ctx.helper('ndVoronoi', ND_VORONOI);

    const scale = ctx.input('scale');
    const randomness = ctx.input('randomness');

    const cell = ctx.temp('vec4', `ndVoronoi( ${ctx.position} * ${scale}, ${randomness} )`);

    return {
        // A distância vem em unidades de célula e passa de 1 nas esquinas;
        // presa a 0..1 para servir de factor sem saltos onde ela estoura.
        distance: ctx.temp('float', `clamp( ${cell}.x, 0.0, 1.0 )`),
        color: ctx.temp('vec3', `${cell}.yzw`),
    };
}
