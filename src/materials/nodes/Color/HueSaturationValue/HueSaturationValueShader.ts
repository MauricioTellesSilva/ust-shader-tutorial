/**
 * Matiz, saturação e valor, no fragmento.
 *
 * A conversão vai a HSV e volta, porque é a única maneira de rodar o matiz sem
 * mexer no resto. As duas funções são as clássicas sem ramos — `step` e `mix`
 * em vez de `if` — para não dividir a execução dentro de um grupo de
 * fragmentos, que é onde uma placa gráfica perde tempo a sério.
 */
import type { EmitContext } from '../../core/types';

const ND_RGB_HSV = `
vec3 ndRgbToHsv( vec3 c ) {
	vec4 k = vec4( 0.0, - 1.0 / 3.0, 2.0 / 3.0, - 1.0 );
	vec4 p = mix( vec4( c.bg, k.wz ), vec4( c.gb, k.xy ), step( c.b, c.g ) );
	vec4 q = mix( vec4( p.xyw, c.r ), vec4( c.r, p.yzx ), step( p.x, c.r ) );

	float d = q.x - min( q.w, q.y );
	float e = 1.0e-10;

	return vec3( abs( q.z + ( q.w - q.y ) / ( 6.0 * d + e ) ), d / ( q.x + e ), q.x );
}`;

const ND_HSV_RGB = `
vec3 ndHsvToRgb( vec3 c ) {
	vec4 k = vec4( 1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0 );
	vec3 p = abs( fract( c.xxx + k.xyz ) * 6.0 - k.www );

	return c.z * mix( k.xxx, clamp( p - k.xxx, 0.0, 1.0 ), c.y );
}`;

export function emitHueSaturationValue(ctx: EmitContext): Record<string, string> {
    ctx.helper('ndRgbToHsv', ND_RGB_HSV);
    ctx.helper('ndHsvToRgb', ND_HSV_RGB);

    const color = ctx.input('color');
    const hue = ctx.input('hue');
    const saturation = ctx.input('saturation');
    const value = ctx.input('value');
    const fac = ctx.input('fac');

    const hsv = ctx.temp('vec3', `ndRgbToHsv( max( ${color}, vec3( 0.0 ) ) )`);

    // O matiz é um ângulo: 0.5 é "sem alteração" e a volta fecha em 1, daí o
    // `fract`. Somar sem ele deixava o deslizador a bater numa parede em vez de
    // dar a volta.
    const shifted = ctx.temp(
        'vec3',
        `vec3( fract( ${hsv}.x + ${hue} - 0.5 ), clamp( ${hsv}.y * ${saturation}, 0.0, 1.0 ), ${hsv}.z * ${value} )`,
    );

    const rgb = ctx.temp('vec3', `ndHsvToRgb( ${shifted} )`);

    return { color: ctx.temp('vec3', `mix( ${color}, ${rgb}, clamp( ${fac}, 0.0, 1.0 ) )`) };
}
