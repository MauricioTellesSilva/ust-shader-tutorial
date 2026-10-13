/**
 * RGB — uma cor, para ser usada em mais do que um sítio.
 *
 * O irmão do Value, com o mesmo propósito: a mesma cor em três entradas passa a
 * ser uma cor em vez de três. Não está marcado `gpu` porque uma cor constante é
 * a mesma dos dois lados — e por isso uma cadeia feita só de constantes continua
 * a não precisar de shader gerado nenhum.
 */
import type { EmitContext, EvalContext, NodeDefinition, Resolved } from '../../core/types';

export const NODE_RGB_COLOR = 'rgbColor';

function evaluate(ctx: EvalContext): Record<string, Resolved> {
    return { color: { color: ctx.rgb('color') } };
}

function emit(ctx: EmitContext): Record<string, string> {
    return { color: ctx.input('color') };
}

export const rgbColor: NodeDefinition = {
    type: NODE_RGB_COLOR,
    label: 'RGB',
    category: 'color',
    inputs: [
        { id: 'color', label: 'Color', type: 'COLOR', defaultValue: { r: 0.8, g: 0.8, b: 0.8 } },
    ],
    outputs: [{ id: 'color', label: 'Color', type: 'COLOR' }],
    evaluate,
    emit,
};
