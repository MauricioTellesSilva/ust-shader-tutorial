/**
 * O xadrez, no fragmento.
 *
 * Em três dimensões e não em duas: a soma das três células dá um damier que
 * atravessa o volume, e por isso o padrão continua certo nas faces laterais de
 * um modelo em vez de esticar onde as coordenadas de textura esticam.
 */
import type { EmitContext } from '../../core/types';

const ND_CHECKER = `
float ndChecker( vec3 p ) {
	vec3 c = floor( p );
	// O 0.5 no meio é o que evita depender do sinal de mod() para números
	// negativos, que difere entre implementações.
	return mod( c.x + c.y + c.z, 2.0 ) < 0.5 ? 0.0 : 1.0;
}`;

export function emitCheckerTexture(ctx: EmitContext): Record<string, string> {
    ctx.helper('ndChecker', ND_CHECKER);

    const scale = ctx.input('scale');
    const fac = ctx.temp('float', `ndChecker( ${ctx.position} * ${scale} )`);
    const color = ctx.temp('vec3', `mix( ${ctx.input('color1')}, ${ctx.input('color2')}, ${fac} )`);

    return { fac, color };
}
