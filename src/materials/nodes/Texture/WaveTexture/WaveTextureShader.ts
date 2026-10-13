/**
 * As ondas, no fragmento.
 *
 * Bandas ou anéis, com ruído somado à fase. A madeira é isto: anéis com
 * distorção; e as camadas de um sedimento são o mesmo com bandas. Duas escolhas
 * fechadas — a forma e o perfil — decidem-se na compilação, e por isso o
 * fragmento não gasta um ramo por píxel a perguntar qual é.
 */
import type { EmitContext } from '../../core/types';
import { ND_FBM, ND_HASH3, ND_NOISE } from '../shared/Procedural';

export function emitWaveTexture(ctx: EmitContext): Record<string, string> {
    ctx.helper('ndHash3', ND_HASH3);
    ctx.helper('ndNoise', ND_NOISE);
    ctx.helper('ndFbm', ND_FBM);

    const scale = ctx.input('scale');
    const distortion = ctx.input('distortion');
    const detail = ctx.input('detail');

    const p = ctx.temp('vec3', `${ctx.position} * ${scale}`);

    const base = ctx.option('waveType') === 'RINGS'
        ? `length( ${p}.xy ) * 6.283185`
        : `( ${p}.x + ${p}.y + ${p}.z ) * 3.141593`;

    // A distorção entra na fase e não na amplitude: é o que torce as bandas em
    // vez de as apagar, que é o que faz madeira em vez de nevoeiro.
    const phase = ctx.temp('float', `${base} + ${distortion} * ndFbm( ${p}, ${detail}, 0.5 ) * 6.283185`);

    const profile = ctx.option('profile') === 'SAW'
        ? `fract( ${phase} / 6.283185 )`
        : `sin( ${phase} ) * 0.5 + 0.5`;

    const fac = ctx.temp('float', `clamp( ${profile}, 0.0, 1.0 )`);

    return { fac, color: ctx.temp('vec3', `vec3( ${fac} )`) };
}
