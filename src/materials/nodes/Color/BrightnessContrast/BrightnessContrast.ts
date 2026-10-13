/**
 * Brightness / Contrast — a correcção que quase toda a cadeia acaba por levar.
 *
 * Marcado `gpu` como todos os nós de cor: o que ele corrige varia por píxel, e
 * calcular a correcção uma vez por material daria a mesma cor em todo o lado.
 * Num caso em que a entrada é mesmo constante isto gera um shader de duas
 * linhas — o custo de o ter é menor do que o de ter duas regras diferentes
 * conforme o que estiver ligado atrás.
 */
import type { NodeDefinition } from '../../core/types';
import { emitBrightnessContrast } from './BrightnessContrastShader';

export const NODE_BRIGHTNESS_CONTRAST = 'brightnessContrast';

export const brightnessContrast: NodeDefinition = {
    type: NODE_BRIGHTNESS_CONTRAST,
    label: 'Brightness / Contrast',
    category: 'color',
    gpu: true,
    inputs: [
        { id: 'color', label: 'Color', type: 'COLOR', defaultValue: { r: 0.8, g: 0.8, b: 0.8 } },
        { id: 'bright', label: 'Bright', type: 'FLOAT', defaultValue: 0, min: -1, max: 1, step: 0.01 },
        { id: 'contrast', label: 'Contrast', type: 'FLOAT', defaultValue: 0, min: -1, max: 5, step: 0.01 },
    ],
    outputs: [{ id: 'color', label: 'Color', type: 'COLOR' }],
    emit: emitBrightnessContrast,
};
