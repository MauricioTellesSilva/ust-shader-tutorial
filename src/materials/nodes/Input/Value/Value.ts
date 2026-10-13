/**
 * Value — um número, para ser usado em mais do que um sítio.
 *
 * Parece não fazer nada, e é essa a utilidade: a mesma rugosidade em três
 * entradas passa a ser um número em vez de três, e mudá-la é mudar um. Sem ele,
 * "o mesmo valor" seria uma coincidência que se desfaz na primeira edição.
 *
 * Não está marcado `gpu`: um número é um número dos dois lados. Quando entra
 * numa cadeia que vai para a placa gráfica vira um uniform, e por isso mexer
 * nele não recompila nada.
 */
import type { EmitContext, EvalContext, NodeDefinition, Resolved } from '../../core/types';

export const NODE_VALUE = 'value';

function evaluate(ctx: EvalContext): Record<string, Resolved> {
    return { value: { number: ctx.float('value') } };
}

function emit(ctx: EmitContext): Record<string, string> {
    return { value: ctx.input('value') };
}

export const value: NodeDefinition = {
    type: NODE_VALUE,
    label: 'Value',
    category: 'input',
    inputs: [{ id: 'value', label: 'Value', type: 'FLOAT', defaultValue: 0.5, min: 0, max: 1, step: 0.01 }],
    outputs: [{ id: 'value', label: 'Value', type: 'FLOAT' }],
    evaluate,
    emit,
};
