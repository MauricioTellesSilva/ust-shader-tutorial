/**
 * A curva de gama, no fragmento.
 *
 * `max` antes da potência porque `pow` de um número negativo não está definida
 * e o que sai disso é um píxel preto ou branco no meio de uma superfície — o
 * género de defeito que aparece só em algumas placas gráficas e que ninguém
 * consegue reproduzir.
 */
import type { EmitContext } from '../../core/types';

export function emitGamma(ctx: EmitContext): Record<string, string> {
    const color = ctx.input('color');
    const gamma = ctx.input('gamma');

    return {
        color: ctx.temp('vec3', `pow( max( ${color}, vec3( 0.0 ) ), vec3( max( ${gamma}, 0.0001 ) ) )`),
    };
}
