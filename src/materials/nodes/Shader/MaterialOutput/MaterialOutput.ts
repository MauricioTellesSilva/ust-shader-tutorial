/**
 * Material Output — onde o grafo acaba.
 *
 * Não avalia nem gera GLSL: é um sítio, e não um cálculo. O que ele dá ao
 * sistema é uma resposta à pergunta "de todos estes nós, qual é o material?" —
 * sem ele, um grafo com dois Principled não teria maneira de dizer qual conta.
 *
 * É `unique` por isso mesmo, e o editor recusa-se a apagá-lo: um grafo sem saída
 * de material não descreve material nenhum, e recriá-la à mão seria um passo que
 * ninguém percebia ter de dar.
 */
import type { NodeDefinition } from '../../core/types';

export const NODE_MATERIAL_OUTPUT = 'materialOutput';

export const materialOutput: NodeDefinition = {
    type: NODE_MATERIAL_OUTPUT,
    label: 'Material Output',
    category: 'output',
    unique: true,
    inputs: [
        // Sem valor por omissão: um material sem superfície ligada não é um
        // material com uma superfície implícita, é um grafo por acabar.
        { id: 'surface', label: 'Surface', type: 'BSDF', defaultValue: null },
        { id: 'displacement', label: 'Displacement', type: 'DISPLACEMENT', defaultValue: null },
    ],
    outputs: [],
};
