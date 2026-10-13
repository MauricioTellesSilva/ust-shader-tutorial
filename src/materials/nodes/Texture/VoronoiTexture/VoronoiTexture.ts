/**
 * Voronoi Texture — o espaço dividido em células.
 *
 * `randomness` a zero dá uma grelha regular; a um, células irregulares. É o
 * deslizador que leva de "azulejo" a "pedra" sem trocar de nó, e vale a pena
 * saber que existe.
 */
import type { NodeDefinition } from '../../core/types';
import { emitVoronoiTexture } from './VoronoiTextureShader';

export const NODE_VORONOI_TEXTURE = 'voronoiTexture';

export const voronoiTexture: NodeDefinition = {
    type: NODE_VORONOI_TEXTURE,
    label: 'Voronoi Texture',
    category: 'texture',
    gpu: true,
    inputs: [
        { id: 'scale', label: 'Scale', type: 'FLOAT', defaultValue: 5, min: 0, max: 50, step: 0.1 },
        { id: 'randomness', label: 'Randomness', type: 'FLOAT', defaultValue: 1, min: 0, max: 1, step: 0.01 },
    ],
    outputs: [
        { id: 'distance', label: 'Distance', type: 'FLOAT' },
        { id: 'color', label: 'Color', type: 'COLOR' },
    ],
    emit: emitVoronoiTexture,
};
