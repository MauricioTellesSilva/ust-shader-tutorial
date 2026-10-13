/**
 * A amostragem de uma imagem do projeto, no fragmento.
 *
 * Só corre quando a imagem está numa cadeia procedimental — uma imagem sozinha
 * continua a ir para um canal do material. Aqui a textura chega como um
 * `sampler2D` cujo valor o `program.ts` preenche com a textura já carregada; o
 * grafo não escolhe o sampler, escolhe o asset, e o asset é resolvido pelo
 * sistema de ficheiros do projeto.
 *
 * ## As duas saídas e o espaço de cor
 *
 * A saída de cor é convertida de sRGB para linear, porque é isso que uma imagem
 * de cor é e é em linear que o Three.js trabalha. A saída de valor **não** é:
 * uma máscara de rugosidade guarda números, não cores, e passá-la por uma curva
 * de gama daria uma superfície com a rugosidade errada em todo o lado. É a
 * mesma distinção que o `applyTextureToSlot` faz com o seu `isSRGB`.
 */
import type { EmitContext } from '../../core/types';

/**
 * A conversão exacta, e não `pow(c, 2.2)`.
 *
 * A curva do sRGB é linear perto do preto, e a aproximação por potência erra
 * justamente aí — nas sombras, que é onde se vê.
 */
const SRGB_TO_LINEAR = `
vec3 ndSrgbToLinear( vec3 c ) {
	return mix(
		c / 12.92,
		pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ),
		step( vec3( 0.04045 ), c )
	);
}`;

export function emitImageTexture(ctx: EmitContext): Record<string, string> {
    const sampler = ctx.sampler();

    // Um nó de imagem sem imagem escolhida é branco, e não preto: branco é o
    // elemento neutro de uma multiplicação de cor, e por isso uma cadeia por
    // acabar mostra o resto do material em vez de o apagar.
    if (!sampler) return { color: 'vec3( 1.0 )', value: '1.0' };

    ctx.helper('ndSrgbToLinear', SRGB_TO_LINEAR);

    const texel = ctx.temp('vec4', ctx.sample?.() ?? `texture2D( ${sampler}, ${ctx.uv} )`);

    return {
        color: ctx.temp('vec3', ctx.option('colorSpace') === 'linear' ? `${texel}.rgb` : `ndSrgbToLinear( ${texel}.rgb )`),
        value: ctx.temp('float', `dot( ${texel}.rgb, vec3( 0.2126, 0.7152, 0.0722 ) )`),
    };
}
