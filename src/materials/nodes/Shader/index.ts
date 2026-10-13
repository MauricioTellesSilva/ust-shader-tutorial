/**
 * Os nós de shader.
 *
 * O que descreve uma superfície, e o sítio onde o grafo termina. A pasta é a
 * categoria: um nó de shader novo entra aqui e na lista abaixo, e mais nada
 * muda — nem o editor, nem o avaliador, nem o compilador.
 */
import type { NodeDefinition } from '../core/types';
import { materialOutput } from './MaterialOutput/MaterialOutput';
import { mixShader } from './MixShader/MixShader';
import { principledBsdf } from './PrincipledBSDF/PrincipledBSDF';

export { NODE_MATERIAL_OUTPUT } from './MaterialOutput/MaterialOutput';
export { NODE_MIX_SHADER } from './MixShader/MixShader';
export { NODE_PRINCIPLED } from './PrincipledBSDF/PrincipledBSDF';

export const shaderNodes: NodeDefinition[] = [
    principledBsdf,
    mixShader,
    materialOutput,
];
