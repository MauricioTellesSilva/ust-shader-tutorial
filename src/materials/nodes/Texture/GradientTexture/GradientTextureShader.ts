/**
 * O gradiente, no fragmento.
 *
 * O tipo é uma escolha fechada e por isso decide-se **na compilação**: o GLSL
 * gerado contém uma fórmula, não um `if` sobre um uniform. Um ramo por
 * fragmento para escolher entre quatro contas seria pagar em cada píxel uma
 * decisão que já estava tomada quando o utilizador escolheu no menu.
 *
 * É também por isso que mudar o tipo recompila e mudar a escala não: o tipo faz
 * parte da estrutura, a escala é um valor.
 */
import type { EmitContext } from '../../core/types';

export function emitGradientTexture(ctx: EmitContext): Record<string, string> {
    const scale = ctx.input('scale');
    const p = ctx.temp('vec3', `${ctx.position} * ${scale}`);

    let expression: string;

    switch (ctx.option('gradientType')) {
        case 'QUADRATIC':
            expression = `pow( max( ${p}.x, 0.0 ), 2.0 )`;
            break;
        case 'RADIAL':
            // Uma volta completa em 0..1, para o gradiente fechar sobre si.
            expression = `atan( ${p}.y, ${p}.x ) / 6.283185 + 0.5`;
            break;
        case 'SPHERICAL':
            expression = `max( 1.0 - length( ${p} ), 0.0 )`;
            break;
        case 'LINEAR':
        default:
            expression = `${p}.x`;
            break;
    }

    const fac = ctx.temp('float', `clamp( ${expression}, 0.0, 1.0 )`);

    return { fac, color: ctx.temp('vec3', `vec3( ${fac} )`) };
}
