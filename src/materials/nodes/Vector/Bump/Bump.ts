import type { NodeDefinition } from '../../core/types';

export const NODE_BUMP = 'bump';

// Surface-gradient bump mapping. Derivatives run unconditionally, including
// when disabled, so adjacent fragments remain well defined at branch edges.
const BUMP = `
vec3 ndBump( vec3 n, float height, float strength, float distance, float enabled ) {
    vec3 dx = dFdx( -vViewPosition );
    vec3 dy = dFdy( -vViewPosition );
    vec2 dh = vec2( dFdx( height ), dFdy( height ) );
    vec3 r1 = cross( dy, n );
    vec3 r2 = cross( n, dx );
    float det = dot( dx, r1 ) * ( gl_FrontFacing ? 1.0 : -1.0 );
    vec3 grad = ( dh.x * r1 + dh.y * r2 ) * distance * clamp( strength, 0.0, 4.0 ) * vNdLocalScale;
    if ( enabled < 0.5 || abs( det ) < 1e-12 || dot( grad, grad ) < 1e-24 ) return n;
    vec3 result = abs( det ) * n - sign( det ) * grad;
    return dot( result, result ) > 1e-24 ? normalize( result ) : n;
}`;

export const bump: NodeDefinition = {
    type: NODE_BUMP,
    label: 'Bump',
    category: 'vector',
    gpu: true,
    clampInputs: true,
    inputs: [
        { id: 'height', label: 'Height', type: 'FLOAT', defaultValue: 0, step: 0.01 },
        { id: 'strength', label: 'Strength', type: 'FLOAT', defaultValue: 1, min: 0, max: 4, step: 0.01 },
        { id: 'distance', label: 'Distance', type: 'FLOAT', defaultValue: 0.1, min: 0, max: 10, step: 0.01 },
        { id: 'normal', label: 'Normal', type: 'NORMAL', defaultValue: null },
    ],
    outputs: [{ id: 'normal', label: 'Normal', type: 'NORMAL' }],
    options: [{ key: 'invert', label: 'Invert', options: [
        { value: 'off', label: 'Invert desligado' }, { value: 'on', label: 'Invert ligado' },
    ] }],
    emit: ctx => {
        ctx.helper('ndBump', BUMP);
        const n = ctx.input('normal');
        const height = ctx.input('height');
        const sign = ctx.option('invert') === 'on' ? '-1.0' : '1.0';
        return { normal: ctx.temp('vec3', `ndBump( ${n}, ${height}, ${ctx.input('strength')}, clamp( ${ctx.input('distance')}, 0.0, 10.0 ) * ${sign}, ${ctx.ready?.('height') ?? '1.0'} )`) };
    },
};
