/**
 * O sistema de materiais por nós.
 *
 * Importar este módulo é o que põe os tipos de nó no registo. É o único sítio
 * onde as categorias se encontram, e a única responsabilidade dele é essa:
 *
 *     Editor de nós (React)
 *              ↓
 *          Grafo (dados)
 *              ↓
 *        core/ (registo, validação, avaliação, compilação)
 *      ┌───────┼────────┬────────┐
 *      ↓       ↓        ↓        ↓
 *   Color/  Texture/  Shader/  Input/
 *      └───────┴────────┴────────┘
 *              ↓
 *   GLSL gerado + THREE.Material
 *              ↓
 *          WebGL / GPU
 *
 * O editor não escreve GLSL. O núcleo não conhece tipos de nó. Um nó não
 * conhece o grafo. Cada uma destas três frases é uma coisa que se pode mudar
 * sem mexer nas outras duas, e é para isso que a separação existe.
 */
import { colorNodes } from './Color';
import { registerNodes } from './core/registry';
import { emptyGraph, type MaterialGraph } from './core/types';
import { inputNodes } from './Input';
import { mathNodes } from './Math';
import { NODE_MATERIAL_OUTPUT, NODE_PRINCIPLED, shaderNodes } from './Shader';
import { textureNodes } from './Texture';
import { vectorNodes } from './Vector';
import { createNode, nextConnectionId } from './core/registry';

// A ordem é a do menu de criação: o que se usa mais, primeiro.
registerNodes(shaderNodes);
registerNodes(textureNodes);
registerNodes(colorNodes);
registerNodes(inputNodes);
registerNodes(mathNodes);
registerNodes(vectorNodes);

export * from './core/types';
export * from './core/registry';
export * from './core/validate';
export * from './core/evaluate';
export * from './core/effects';
export * from './core/compile';
export * from './core/migrate';
export * from './core/serialize';
export * from './core/inspect';
export * from './core/library';
export * from './core/apply';
export * from './core/program';
export * from './Vector';

export { colorNodes } from './Color';
export { textureNodes } from './Texture';
export { shaderNodes, NODE_MATERIAL_OUTPUT, NODE_MIX_SHADER, NODE_PRINCIPLED } from './Shader';
export { inputNodes, NODE_VALUE } from './Input';
export * from './Math';
export {
    NODE_CHECKER_TEXTURE,
    NODE_GRADIENT_TEXTURE,
    NODE_MAGIC_TEXTURE,
    NODE_NOISE_TEXTURE,
    NODE_NORMAL_MAP,
    NODE_TEXTURE,
    NODE_VORONOI_TEXTURE,
    NODE_WAVE_TEXTURE,
} from './Texture';
export {
    NODE_BRIGHTNESS_CONTRAST,
    NODE_COLOR_RAMP,
    NODE_GAMMA,
    NODE_HUE_SATURATION_VALUE,
    NODE_INVERT_COLOR,
    NODE_MIX_COLOR,
    NODE_RGB_COLOR,
} from './Color';

/**
 * O grafo com que um projeto de nós começa.
 *
 * Um Principled ligado ao Material Output, que é o material mais simples que
 * existe. Abrir o editor e encontrá-lo vazio obrigaria toda a gente a montar as
 * mesmas duas peças antes de poder fazer seja o que for.
 *
 * Vive aqui, e não no registo, porque precisa de saber que tipos de nó existem
 * — e o registo é justamente a parte que não pode saber isso.
 */
export function starterGraph(): MaterialGraph {
    const principled = createNode(NODE_PRINCIPLED, { x: 80, y: 120 });
    const output = createNode(NODE_MATERIAL_OUTPUT, { x: 460, y: 200 });
    if (!principled || !output) return emptyGraph();

    return {
        ...emptyGraph(),
        nodes: [principled, output],
        connections: [{
            id: nextConnectionId(),
            sourceNode: principled.id,
            sourceSocket: 'bsdf',
            targetNode: output.id,
            targetSocket: 'surface',
        }],
    };
}
