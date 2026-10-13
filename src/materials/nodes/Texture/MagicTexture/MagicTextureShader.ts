/**
 * O padrão "magic", no fragmento.
 *
 * Senos e cossenos realimentados: cada volta usa o resultado da anterior, e o
 * padrão que sai é aquele de veios coloridos que não se consegue descrever de
 * outra maneira. A profundidade é uma escolha fechada — e não um número — porque
 * é o limite de um ciclo, e um ciclo com limite variável não compila em todo o
 * lado. Escolher no menu recompila; é uma vez, e não por frame.
 */
import type { EmitContext } from '../../core/types';

const ND_MAGIC = `
vec3 ndMagic( vec3 p, float distortion, int depth ) {
	vec3 v = p;

	for ( int i = 0; i < 5; i ++ ) {
		if ( i >= depth ) break;

		// Cada volta troca os eixos: sem isso, as três componentes convergiam
		// para o mesmo padrão e o resultado saía cinzento.
		v = vec3(
			sin( ( v.x + v.y + v.z ) * distortion ),
			cos( ( - v.x + v.y - v.z ) * distortion ),
			- cos( ( v.x - v.y + v.z ) * distortion )
		) * 0.5 + v.yzx * 0.5;
	}

	return v * 0.5 + 0.5;
}`;

/** As profundidades que a escolha oferece, e o inteiro literal de cada uma. */
const DEPTHS: Record<string, string> = { '1': '1', '2': '2', '3': '3', '4': '4', '5': '5' };

export function emitMagicTexture(ctx: EmitContext): Record<string, string> {
    ctx.helper('ndMagic', ND_MAGIC);

    const scale = ctx.input('scale');
    const distortion = ctx.input('distortion');
    const depth = DEPTHS[ctx.option('depth')] ?? '2';

    const color = ctx.temp(
        'vec3',
        `clamp( ndMagic( ${ctx.position} * ${scale}, ${distortion}, ${depth} ), 0.0, 1.0 )`,
    );

    return {
        color,
        fac: ctx.temp('float', `dot( ${color}, vec3( 0.3333 ) )`),
    };
}
