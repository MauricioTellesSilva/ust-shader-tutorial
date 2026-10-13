/**
 * A inversão, no fragmento.
 *
 * Com um factor, e não só ligada ou desligada: metade de uma inversão é o
 * caminho para o cinzento, e isso é usável como passo intermédio de uma cadeia.
 */
import type { EmitContext } from '../../core/types';

export function emitInvertColor(ctx: EmitContext): Record<string, string> {
    const color = ctx.input('color');
    const fac = ctx.input('fac');

    return {
        color: ctx.temp('vec3', `mix( ${color}, vec3( 1.0 ) - ${color}, clamp( ${fac}, 0.0, 1.0 ) )`),
    };
}
