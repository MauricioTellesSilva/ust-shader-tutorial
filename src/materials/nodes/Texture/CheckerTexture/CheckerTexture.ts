/**
 * Checker Texture — duas cores em damier.
 *
 * Serve de padrão e serve de teste: é com ele que se vê, num modelo carregado,
 * se a escala e o espaço em que os padrões são calculados são os esperados. Um
 * ruído não deixa ver isso, porque um ruído errado continua a parecer ruído.
 */
import type { NodeDefinition } from '../../core/types';
import { emitCheckerTexture } from './CheckerTextureShader';

export const NODE_CHECKER_TEXTURE = 'checkerTexture';

export const checkerTexture: NodeDefinition = {
    type: NODE_CHECKER_TEXTURE,
    label: 'Checker Texture',
    category: 'texture',
    gpu: true,
    inputs: [
        { id: 'color1', label: 'Color 1', type: 'COLOR', defaultValue: { r: 0.8, g: 0.8, b: 0.8 } },
        { id: 'color2', label: 'Color 2', type: 'COLOR', defaultValue: { r: 0.2, g: 0.2, b: 0.2 } },
        { id: 'scale', label: 'Scale', type: 'FLOAT', defaultValue: 5, min: 0, max: 50, step: 0.1 },
    ],
    outputs: [
        { id: 'color', label: 'Color', type: 'COLOR' },
        { id: 'fac', label: 'Fac', type: 'FLOAT' },
    ],
    emit: emitCheckerTexture,
};
