/**
 * O ruído, no fragmento.
 *
 * Quatro oitavas somadas sobre a posição do objeto, com uma distorção opcional
 * que empurra o ponto antes de o amostrar — é o que tira ao ruído o ar de ter
 * sido feito numa grelha.
 *
 * Tudo o que se pode mexer é um uniform: a escala, o detalhe, a rugosidade das
 * oitavas e a distorção. Arrastar qualquer um deles muda um número que a placa
 * gráfica já está a ler, e o programa não é tocado.
 */
import type { EmitContext } from '../../core/types';
import { ND_FBM, ND_HASH3, ND_NOISE } from '../shared/Procedural';

export function emitNoiseTexture(ctx: EmitContext): Record<string, string> {
    ctx.helper('ndHash3', ND_HASH3);
    ctx.helper('ndNoise', ND_NOISE);
    ctx.helper('ndFbm', ND_FBM);

    const scale = ctx.input('scale');
    const detail = ctx.input('detail');
    const rough = ctx.input('roughness');
    const distortion = ctx.input('distortion');

    const p = ctx.temp('vec3', `${ctx.position} * ${scale}`);

    // A distorção move o ponto com ruído antes de o ler: sem ela o padrão fica
    // com as direcções todas alinhadas e vê-se de onde veio.
    const q = ctx.temp('vec3', `${p} + ${distortion} * vec3( ndNoise( ${p} + vec3( 13.5 ) ), ndNoise( ${p} + vec3( 7.2 ) ), ndNoise( ${p} + vec3( 21.1 ) ) )`);

    // De −1..1 para 0..1: é o intervalo em que um factor é útil, e o que
    // qualquer coisa a jusante — uma rampa, um contraste — espera receber.
    const fac = ctx.temp('float', `ndFbm( ${q}, ${detail}, ${rough} ) * 0.5 + 0.5`);

    const color = ctx.temp(
        'vec3',
        `vec3( ${fac}, ndFbm( ${q} + vec3( 31.4 ), ${detail}, ${rough} ) * 0.5 + 0.5, ndFbm( ${q} + vec3( 58.2 ), ${detail}, ${rough} ) * 0.5 + 0.5 )`,
    );

    return { fac, color };
}
