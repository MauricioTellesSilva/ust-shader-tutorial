/**
 * Noise Texture — o padrão de que quase toda a superfície irregular precisa.
 *
 * Marcado `gpu` porque o seu valor **é** diferente em cada píxel. Não tem
 * avaliação no CPU, e isso é uma afirmação e não uma falta: reduzir um ruído a
 * um número seria inventar uma resposta que o nó não tem. Quando ele está no
 * caminho de um canal, esse canal é compilado para GLSL e calculado por
 * fragmento; sem ele no caminho, o canal segue a via de sempre.
 */
import type { NodeDefinition } from '../../core/types';
import { emitNoiseTexture } from './NoiseTextureShader';

export const NODE_NOISE_TEXTURE = 'noiseTexture';

export const noiseTexture: NodeDefinition = {
    type: NODE_NOISE_TEXTURE,
    label: 'Noise Texture',
    category: 'texture',
    gpu: true,
    inputs: [
        { id: 'scale', label: 'Scale', type: 'FLOAT', defaultValue: 5, min: 0, max: 50, step: 0.1 },
        // O detalhe pára nas quatro oitavas que o `ndFbm` tem. Um limite
        // maior era um deslizador que deixava de fazer efeito a meio.
        { id: 'detail', label: 'Detail', type: 'FLOAT', defaultValue: 2, min: 0, max: 4, step: 0.01 },
        { id: 'roughness', label: 'Roughness', type: 'FLOAT', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
        { id: 'distortion', label: 'Distortion', type: 'FLOAT', defaultValue: 0, min: 0, max: 5, step: 0.01 },
    ],
    outputs: [
        { id: 'fac', label: 'Fac', type: 'FLOAT' },
        { id: 'color', label: 'Color', type: 'COLOR' },
    ],
    emit: emitNoiseTexture,
};
