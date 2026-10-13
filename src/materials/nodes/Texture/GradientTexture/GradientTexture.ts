/**
 * Gradient Texture — uma transição ao longo do espaço.
 *
 * Sozinho serve para pouco; ligado a uma Color Ramp é o que dá desde a
 * ferrugem que sobe pela peça até ao desgaste que aparece só nas bordas. É o
 * exemplo mais claro de por que o valor tem de ser calculado por fragmento: o
 * que ele descreve é precisamente uma variação ao longo da superfície.
 */
import type { NodeDefinition } from '../../core/types';
import { emitGradientTexture } from './GradientTextureShader';

export const NODE_GRADIENT_TEXTURE = 'gradientTexture';

export const gradientTexture: NodeDefinition = {
    type: NODE_GRADIENT_TEXTURE,
    label: 'Gradient Texture',
    category: 'texture',
    gpu: true,
    inputs: [
        { id: 'scale', label: 'Scale', type: 'FLOAT', defaultValue: 1, min: 0, max: 20, step: 0.01 },
    ],
    outputs: [
        { id: 'fac', label: 'Fac', type: 'FLOAT' },
        { id: 'color', label: 'Color', type: 'COLOR' },
    ],
    options: [{
        key: 'gradientType',
        label: 'Type',
        options: [
            { value: 'LINEAR', label: 'Linear' },
            { value: 'QUADRATIC', label: 'Quadratic' },
            { value: 'RADIAL', label: 'Radial' },
            { value: 'SPHERICAL', label: 'Spherical' },
        ],
    }],
    emit: emitGradientTexture,
};
