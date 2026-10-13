/**
 * Gamma — a curva que aproxima ou afasta uma cor do preto sem lhe mexer nas
 * pontas.
 *
 * Diferente do brilho: o preto continua preto e o branco continua branco, e o
 * que muda é o que está pelo meio. É a ferramenta certa quando uma máscara está
 * a cobrir demasiado ou de menos, sem se querer perder os extremos.
 */
import type { NodeDefinition } from '../../core/types';
import { emitGamma } from './GammaShader';

export const NODE_GAMMA = 'gamma';

export const gamma: NodeDefinition = {
    type: NODE_GAMMA,
    label: 'Gamma',
    category: 'color',
    gpu: true,
    inputs: [
        { id: 'color', label: 'Color', type: 'COLOR', defaultValue: { r: 0.8, g: 0.8, b: 0.8 } },
        { id: 'gamma', label: 'Gamma', type: 'FLOAT', defaultValue: 1, min: 0.01, max: 5, step: 0.01 },
    ],
    outputs: [{ id: 'color', label: 'Color', type: 'COLOR' }],
    emit: emitGamma,
};
