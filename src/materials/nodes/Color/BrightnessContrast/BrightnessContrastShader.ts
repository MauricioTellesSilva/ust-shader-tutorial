/**
 * Brilho e contraste, no fragmento.
 *
 * O contraste roda em torno de 0.5 e não de 0: é o que faz aumentar o contraste
 * escurecer as sombras **e** clarear os altos, em vez de clarear tudo. O brilho
 * entra depois, como uma soma.
 *
 * Sem `clamp` no fim, de propósito. Um valor acima de 1 continua a ser um valor
 * acima de 1 para o nó seguinte — e cortá-lo aqui perdia informação que uma
 * mistura a jusante ainda podia usar. Quem corta é o canal do material, quando
 * a cadeia lá chega.
 */
import type { EmitContext } from '../../core/types';

export function emitBrightnessContrast(ctx: EmitContext): Record<string, string> {
    const color = ctx.input('color');
    const bright = ctx.input('bright');
    const contrast = ctx.input('contrast');

    return {
        color: ctx.temp(
            'vec3',
            `( ${color} - 0.5 ) * ( 1.0 + ${contrast} ) + 0.5 + ${bright}`,
        ),
    };
}
