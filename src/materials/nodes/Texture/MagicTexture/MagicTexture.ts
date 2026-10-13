/**
 * Magic Texture — veios de cor, sem nada que os descreva melhor.
 *
 * Não representa material nenhum em particular, e é isso que o torna útil:
 * serve de fonte de variação a jusante, para uma Color Ramp ou um Mix Color o
 * transformarem no que for preciso.
 */
import type { NodeDefinition } from '../../core/types';
import { emitMagicTexture } from './MagicTextureShader';

export const NODE_MAGIC_TEXTURE = 'magicTexture';

export const magicTexture: NodeDefinition = {
    type: NODE_MAGIC_TEXTURE,
    label: 'Magic Texture',
    category: 'texture',
    gpu: true,
    inputs: [
        { id: 'scale', label: 'Scale', type: 'FLOAT', defaultValue: 5, min: 0, max: 50, step: 0.1 },
        { id: 'distortion', label: 'Distortion', type: 'FLOAT', defaultValue: 1, min: 0, max: 10, step: 0.01 },
    ],
    outputs: [
        { id: 'color', label: 'Color', type: 'COLOR' },
        { id: 'fac', label: 'Fac', type: 'FLOAT' },
    ],
    options: [{
        key: 'depth',
        label: 'Depth',
        options: [
            { value: '2', label: '2' },
            { value: '1', label: '1' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5', label: '5' },
        ],
    }],
    emit: emitMagicTexture,
};
