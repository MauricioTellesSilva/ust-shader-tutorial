/**
 * Invert Color — o negativo de uma cor ou de uma máscara.
 *
 * Usa-se mais em máscaras do que em cores: uma Voronoi dá as juntas escuras e
 * as células claras, e é uma inversão que troca qual das duas coisas fica com o
 * desgaste.
 */
import type { NodeDefinition } from '../../core/types';
import { emitInvertColor } from './InvertColorShader';

export const NODE_INVERT_COLOR = 'invertColor';

export const invertColor: NodeDefinition = {
    type: NODE_INVERT_COLOR,
    label: 'Invert Color',
    category: 'color',
    gpu: true,
    inputs: [
        { id: 'fac', label: 'Fac', type: 'FLOAT', defaultValue: 1, min: 0, max: 1, step: 0.01 },
        { id: 'color', label: 'Color', type: 'COLOR', defaultValue: { r: 0.8, g: 0.8, b: 0.8 } },
    ],
    outputs: [{ id: 'color', label: 'Color', type: 'COLOR' }],
    emit: emitInvertColor,
};
