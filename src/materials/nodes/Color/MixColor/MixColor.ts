/**
 * Mix Color — duas cores e um factor, com um modo a dizer como.
 *
 * É o nó que mais aparece numa cadeia real: uma máscara procedimental no
 * factor, duas cores nas entradas, e está feita a ferrugem, a sujidade ou o
 * desgaste. Os oito modos são os que se usam de facto; a lista não é a do
 * Blender inteira porque um modo que ninguém escolhe é um ramo a mais no
 * gerador.
 */
import type { NodeDefinition } from '../../core/types';
import { emitMixColor } from './MixColorShader';

export const NODE_MIX_COLOR = 'mixColor';

export const mixColor: NodeDefinition = {
    type: NODE_MIX_COLOR,
    label: 'Mix Color',
    category: 'color',
    gpu: true,
    inputs: [
        { id: 'fac', label: 'Fac', type: 'FLOAT', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
        { id: 'color1', label: 'Color 1', type: 'COLOR', defaultValue: { r: 0.8, g: 0.8, b: 0.8 } },
        { id: 'color2', label: 'Color 2', type: 'COLOR', defaultValue: { r: 0.2, g: 0.2, b: 0.2 } },
    ],
    outputs: [{ id: 'color', label: 'Color', type: 'COLOR' }],
    options: [{
        key: 'blend',
        label: 'Blend',
        options: [
            { value: 'MIX', label: 'Mix' },
            { value: 'MULTIPLY', label: 'Multiply' },
            { value: 'ADD', label: 'Add' },
            { value: 'SUBTRACT', label: 'Subtract' },
            { value: 'SCREEN', label: 'Screen' },
            { value: 'DIFFERENCE', label: 'Difference' },
            { value: 'DARKEN', label: 'Darken' },
            { value: 'LIGHTEN', label: 'Lighten' },
        ],
    }],
    emit: emitMixColor,
};
