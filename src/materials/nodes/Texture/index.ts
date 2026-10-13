/**
 * Os nós de textura.
 *
 * Padrões calculados e imagens do projeto — tudo o que produz um valor
 * diferente em cada ponto da superfície. Os procedimentais estão marcados `gpu`
 * e por isso são compilados para GLSL; a imagem do projeto e o mapa de normais
 * não estão, porque o Three.js já sabe pô-los num canal do material.
 */
import type { NodeDefinition } from '../core/types';
import { checkerTexture } from './CheckerTexture/CheckerTexture';
import { gradientTexture } from './GradientTexture/GradientTexture';
import { imageTexture } from './ImageTexture/ImageTexture';
import { magicTexture } from './MagicTexture/MagicTexture';
import { noiseTexture } from './NoiseTexture/NoiseTexture';
import { normalMap } from './NormalMap/NormalMap';
import { voronoiTexture } from './VoronoiTexture/VoronoiTexture';
import { waveTexture } from './WaveTexture/WaveTexture';

export { NODE_CHECKER_TEXTURE } from './CheckerTexture/CheckerTexture';
export { NODE_GRADIENT_TEXTURE } from './GradientTexture/GradientTexture';
export { NODE_TEXTURE } from './ImageTexture/ImageTexture';
export { NODE_MAGIC_TEXTURE } from './MagicTexture/MagicTexture';
export { NODE_NOISE_TEXTURE } from './NoiseTexture/NoiseTexture';
export { NODE_NORMAL_MAP } from './NormalMap/NormalMap';
export { NODE_VORONOI_TEXTURE } from './VoronoiTexture/VoronoiTexture';
export { NODE_WAVE_TEXTURE } from './WaveTexture/WaveTexture';

export const textureNodes: NodeDefinition[] = [
    imageTexture,
    noiseTexture,
    checkerTexture,
    gradientTexture,
    magicTexture,
    voronoiTexture,
    waveTexture,
    normalMap,
];
