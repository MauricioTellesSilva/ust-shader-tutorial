/**
 * Hue / Saturation / Value — mexer numa cor sem a refazer.
 *
 * O matiz vem centrado em 0.5, que é a convenção do Blender e a única que faz
 * o deslizador nascer no meio em "sem alteração". Um matiz a começar em 0 com
 * 0 a querer dizer "não mexas" obrigava a lê-lo ao contrário de todos os
 * outros.
 */
import type { NodeDefinition } from '../../core/types';
import { emitHueSaturationValue } from './HueSaturationValueShader';

export const NODE_HUE_SATURATION_VALUE = 'hueSaturationValue';

export const hueSaturationValue: NodeDefinition = {
    type: NODE_HUE_SATURATION_VALUE,
    label: 'Hue / Saturation / Value',
    category: 'color',
    gpu: true,
    inputs: [
        { id: 'hue', label: 'Hue', type: 'FLOAT', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
        { id: 'saturation', label: 'Saturation', type: 'FLOAT', defaultValue: 1, min: 0, max: 2, step: 0.01 },
        { id: 'value', label: 'Value', type: 'FLOAT', defaultValue: 1, min: 0, max: 2, step: 0.01 },
        { id: 'fac', label: 'Fac', type: 'FLOAT', defaultValue: 1, min: 0, max: 1, step: 0.01 },
        { id: 'color', label: 'Color', type: 'COLOR', defaultValue: { r: 0.8, g: 0.8, b: 0.8 } },
    ],
    outputs: [{ id: 'color', label: 'Color', type: 'COLOR' }],
    emit: emitHueSaturationValue,
};
