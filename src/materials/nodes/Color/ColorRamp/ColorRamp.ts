/**
 * Color Ramp — de um número para uma cor.
 *
 * É o nó que dá sentido a todos os procedimentais: um ruído produz um número
 * entre 0 e 1, e é a rampa que decide que 0.2 é madeira clara e 0.8 é madeira
 * escura. Sem ela, um ruído só sabe pintar cinzentos.
 *
 * Quatro paragens, cada uma com posição e cor como entradas normais — ver a
 * nota em `ColorRampShader` para a razão e o preço dessa escolha.
 */
import type { InputDefinition, NodeDefinition } from '../../core/types';
import { RAMP_STOPS, emitColorRamp } from './ColorRampShader';

export const NODE_COLOR_RAMP = 'colorRamp';

/** Preto a branco, espalhado por igual: a rampa mais útil por omissão. */
function stops(): InputDefinition[] {
    const list: InputDefinition[] = [];

    for (let i = 0; i < RAMP_STOPS; i += 1) {
        const at = i / (RAMP_STOPS - 1);

        list.push({
            id: `pos${i + 1}`,
            label: `Pos ${i + 1}`,
            type: 'FLOAT',
            defaultValue: at,
            min: 0,
            max: 1,
            step: 0.01,
        });

        list.push({
            id: `color${i + 1}`,
            label: `Color ${i + 1}`,
            type: 'COLOR',
            defaultValue: { r: at, g: at, b: at },
        });
    }

    return list;
}

export const colorRamp: NodeDefinition = {
    type: NODE_COLOR_RAMP,
    label: 'Color Ramp',
    category: 'color',
    gpu: true,
    inputs: [
        { id: 'fac', label: 'Fac', type: 'FLOAT', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
        ...stops(),
    ],
    outputs: [
        { id: 'color', label: 'Color', type: 'COLOR' },
        { id: 'fac', label: 'Fac', type: 'FLOAT' },
    ],
    options: [{
        key: 'interpolation',
        label: 'Interpolation',
        options: [
            { value: 'LINEAR', label: 'Linear' },
            { value: 'CONSTANT', label: 'Constant' },
        ],
    }],
    emit: emitColorRamp,
};
