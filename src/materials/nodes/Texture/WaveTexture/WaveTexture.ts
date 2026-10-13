/**
 * Wave Texture — bandas ou anéis, com ruído somado.
 *
 * É o nó com que se faz madeira: anéis, distorção a meio, e uma Color Ramp a
 * dar as duas cores. Sem a distorção são anéis perfeitos, que não existem em
 * lado nenhum.
 */
import type { NodeDefinition } from '../../core/types';
import { emitWaveTexture } from './WaveTextureShader';

export const NODE_WAVE_TEXTURE = 'waveTexture';

export const waveTexture: NodeDefinition = {
    type: NODE_WAVE_TEXTURE,
    label: 'Wave Texture',
    category: 'texture',
    gpu: true,
    inputs: [
        { id: 'scale', label: 'Scale', type: 'FLOAT', defaultValue: 5, min: 0, max: 50, step: 0.1 },
        { id: 'distortion', label: 'Distortion', type: 'FLOAT', defaultValue: 0, min: 0, max: 10, step: 0.01 },
        { id: 'detail', label: 'Detail', type: 'FLOAT', defaultValue: 2, min: 0, max: 4, step: 0.01 },
    ],
    outputs: [
        { id: 'fac', label: 'Fac', type: 'FLOAT' },
        { id: 'color', label: 'Color', type: 'COLOR' },
    ],
    options: [
        {
            key: 'waveType',
            label: 'Wave',
            options: [
                { value: 'BANDS', label: 'Bands' },
                { value: 'RINGS', label: 'Rings' },
            ],
        },
        {
            key: 'profile',
            label: 'Profile',
            options: [
                { value: 'SINE', label: 'Sine' },
                { value: 'SAW', label: 'Saw' },
            ],
        },
    ],
    emit: emitWaveTexture,
};
