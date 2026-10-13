/**
 * Normal Map — uma imagem que descreve relevo, e não cor.
 *
 * Existe para que uma imagem RGB não seja tratada como uma normal por acidente:
 * o tipo NORMAL só sai daqui, e é por ele chegar ao Principled que o avaliador
 * sabe que aquela imagem é para o canal de normais e não para o de cor.
 *
 * O caminho nativo continua a servir os grafos que usam só Normal Map. Quando
 * há Bump, o mapa entra no estágio de normais uma única vez, usando a base
 * tangente do Three.js e as coordenadas da imagem.
 */
import type { EvalContext, NodeDefinition, Resolved } from '../../core/types';

export const NODE_NORMAL_MAP = 'normalMap';

const NORMAL_FRAME = `
mat3 ndNormalMapFrame( vec3 n, vec2 imageUv, mat3 originalFrame ) {
    #ifdef USE_TANGENT
        return originalFrame;
    #else
        mat3 frame = getTangentFrame( -vViewPosition, n, imageUv );
        #ifdef DOUBLE_SIDED
            float direction = gl_FrontFacing ? 1.0 : -1.0;
            frame[0] *= direction;
            frame[1] *= direction;
        #endif
        return frame;
    #endif
}`;

const NORMAL_MAP = `
vec3 ndNormalMap( vec3 n, vec3 color, float strength, float enabled, mat3 frame ) {
    vec3 mapN = color * 2.0 - 1.0;
    mapN.xy *= strength;
    if ( enabled < 0.5 ) return n;
    vec3 result = frame * mapN;
    return dot( result, result ) > 1e-12 ? normalize( result ) : n;
}`;

function evaluate(ctx: EvalContext): Record<string, Resolved> {
    const color = ctx.incoming('color');

    return {
        normal: {
            normal: {
                texture: color?.texture ?? null,
                strength: ctx.float('strength'),
            },
        },
    };
}

export const normalMap: NodeDefinition = {
    type: NODE_NORMAL_MAP,
    label: 'Normal Map',
    category: 'vector',
    inputs: [
        { id: 'color', label: 'Color', type: 'COLOR', defaultValue: { r: 1, g: 1, b: 1 } },
        { id: 'strength', label: 'Strength', type: 'FLOAT', defaultValue: 1, min: 0, max: 4, step: 0.01 },
    ],
    outputs: [{ id: 'normal', label: 'Normal', type: 'NORMAL' }],
    evaluate,
    emit: ctx => {
        ctx.helper('ndNormalMapFrame', NORMAL_FRAME);
        ctx.helper('ndNormalMap', NORMAL_MAP);
        const normal = ctx.normal ?? 'ndBaseNormal';
        const frame = `ndNormalMapFrame( ${normal}, ${ctx.normalUv?.('color') ?? ctx.uv}, tbn )`;
        return { normal: ctx.temp('vec3', `ndNormalMap( ${normal}, ${ctx.input('color')}, ${ctx.input('strength')}, ${ctx.ready?.('color', true) ?? '1.0'}, ${frame} )`) };
    },
};
