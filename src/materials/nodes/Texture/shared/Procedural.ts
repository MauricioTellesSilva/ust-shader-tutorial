/**
 * As primitivas GLSL que os padrões procedimentais partilham.
 *
 * Ruído e dispersão aparecem em quatro nós diferentes; escrever quatro versões
 * era ter quatro sítios onde o mesmo padrão pode ficar ligeiramente diferente, e
 * garantir que um dia ficam. Cada função entra no programa uma vez, mesmo que
 * dez nós a peçam — ver `helper` no contexto de emissão.
 *
 * Isto **não** é o "ficheiro de shader de todos os nós". Cada nó tem o seu, ao
 * lado da sua definição; o que está aqui é só o que mais do que um usa de facto.
 */

/** Três números pseudo-aleatórios em −1..1 a partir de um ponto do espaço. */
export const ND_HASH3 = `
vec3 ndHash3( vec3 p ) {
	p = vec3(
		dot( p, vec3( 127.1, 311.7, 74.7 ) ),
		dot( p, vec3( 269.5, 183.3, 246.1 ) ),
		dot( p, vec3( 113.5, 271.9, 124.6 ) )
	);
	return fract( sin( p ) * 43758.5453123 ) * 2.0 - 1.0;
}`;

/**
 * Ruído por gradientes, em −1..1.
 *
 * Por gradientes e não por valores: o ruído por valores deixa ver a grelha em
 * que foi feito, e uma grelha visível num material é a diferença entre "pedra"
 * e "azulejo".
 */
export const ND_NOISE = `
float ndNoise( vec3 p ) {
	vec3 i = floor( p );
	vec3 f = fract( p );
	vec3 u = f * f * ( 3.0 - 2.0 * f );

	return mix(
		mix(
			mix( dot( ndHash3( i + vec3( 0.0, 0.0, 0.0 ) ), f - vec3( 0.0, 0.0, 0.0 ) ),
			     dot( ndHash3( i + vec3( 1.0, 0.0, 0.0 ) ), f - vec3( 1.0, 0.0, 0.0 ) ), u.x ),
			mix( dot( ndHash3( i + vec3( 0.0, 1.0, 0.0 ) ), f - vec3( 0.0, 1.0, 0.0 ) ),
			     dot( ndHash3( i + vec3( 1.0, 1.0, 0.0 ) ), f - vec3( 1.0, 1.0, 0.0 ) ), u.x ), u.y ),
		mix(
			mix( dot( ndHash3( i + vec3( 0.0, 0.0, 1.0 ) ), f - vec3( 0.0, 0.0, 1.0 ) ),
			     dot( ndHash3( i + vec3( 1.0, 0.0, 1.0 ) ), f - vec3( 1.0, 0.0, 1.0 ) ), u.x ),
			mix( dot( ndHash3( i + vec3( 0.0, 1.0, 1.0 ) ), f - vec3( 0.0, 1.0, 1.0 ) ),
			     dot( ndHash3( i + vec3( 1.0, 1.0, 1.0 ) ), f - vec3( 1.0, 1.0, 1.0 ) ), u.x ), u.y ),
		u.z );
}`;

/**
 * Várias oitavas de ruído somadas, em −1..1.
 *
 * O número de voltas é fixo — quatro — porque um ciclo GLSL com limite variável
 * não compila em todo o lado, e porque quatro chegam para o que se vê. O
 * parâmetro `detail` não muda o limite: pesa as oitavas, e por isso pode ser um
 * uniform e mexer sem recompilar nada.
 */
export const ND_FBM = `
float ndFbm( vec3 p, float detail, float rough ) {
	float sum = 0.0;
	float norm = 0.0;
	float amp = 1.0;
	float freq = 1.0;

	for ( int i = 0; i < 4; i ++ ) {
		float w = clamp( detail - float( i ), 0.0, 1.0 );
		if ( w <= 0.0 ) break;

		sum += ndNoise( p * freq ) * amp * w;
		norm += amp * w;

		amp *= rough;
		freq *= 2.0;
	}

	return norm > 0.0 ? sum / norm : 0.0;
}`;

/**
 * A célula mais próxima: distância em `.x`, cor da célula em `.yzw`.
 *
 * Vinte e sete vizinhos, que é o que é preciso em três dimensões para nunca
 * falhar a célula mais próxima nas esquinas. Menos seria mais rápido e teria
 * costuras.
 */
export const ND_VORONOI = `
vec4 ndVoronoi( vec3 p, float randomness ) {
	vec3 cell = floor( p );
	vec3 f = fract( p );

	float best = 1e9;
	vec3 bestColor = vec3( 0.0 );
	float jitter = clamp( randomness, 0.0, 1.0 );

	for ( int x = -1; x <= 1; x ++ ) {
		for ( int y = -1; y <= 1; y ++ ) {
			for ( int z = -1; z <= 1; z ++ ) {
				vec3 g = vec3( float( x ), float( y ), float( z ) );
				vec3 h = ndHash3( cell + g ) * 0.5 + 0.5;
				float d = length( g + h * jitter + ( 1.0 - jitter ) * 0.5 - f );

				if ( d < best ) {
					best = d;
					bestColor = h;
				}
			}
		}
	}

	return vec4( best, bestColor );
}`;
