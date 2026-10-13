import type { NodeDefinition } from '../../core/types';

export const NODE_DISPLACEMENT = 'displacement';

export const displacement: NodeDefinition = {
    type: NODE_DISPLACEMENT,
    label: 'Displacement',
    category: 'vector',
    gpu: true,
    clampInputs: true,
    inputs: [
        { id: 'height', label: 'Height', type: 'FLOAT', defaultValue: 0.5, step: 0.01 },
        { id: 'midlevel', label: 'Midlevel', type: 'FLOAT', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
        { id: 'scale', label: 'Scale', type: 'FLOAT', defaultValue: 0.1, min: -10, max: 10, step: 0.01 },
    ],
    outputs: [{ id: 'displacement', label: 'Displacement', type: 'DISPLACEMENT' }],
    options: [
        { key: 'geometry', label: 'Geometria', runtime: true, options: [
            { value: 'existing', label: 'Malha existente' }, { value: 'subdivide', label: 'Subdividir' },
        ] },
        { key: 'level', label: 'Nível', runtime: true, enabledWhen: { key: 'geometry', value: 'subdivide' }, options: [
            { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' },
        ] },
        { key: 'animated', label: 'Modelos animados', runtime: true, enabledWhen: { key: 'geometry', value: 'subdivide' }, options: [
            { value: 'keep', label: 'Manter malha' }, { value: 'allow', label: 'Permitir subdivisão' },
        ] },
    ],
    emit: ctx => ({ displacement: ctx.temp('float',
        `( clamp( ${ctx.input('height')}, 0.0, 1.0 ) - clamp( ${ctx.input('midlevel')}, 0.0, 1.0 ) ) * clamp( ${ctx.input('scale')}, -10.0, 10.0 ) * ${ctx.ready?.('height') ?? '1.0'}`,
    ) }),
};
