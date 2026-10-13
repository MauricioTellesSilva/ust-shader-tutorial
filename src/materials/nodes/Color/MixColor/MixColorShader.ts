/**
 * A mistura de duas cores, no fragmento.
 *
 * O modo é uma escolha fechada e decide-se **na compilação**: o GLSL gerado
 * contém uma conta, e não um `switch` sobre um uniform. Um ramo por fragmento
 * para escolher entre oito contas seria pagar em cada píxel uma decisão que já
 * estava tomada quando o utilizador escolheu no menu.
 *
 * O modo vem de `ctx.option`, que o verifica contra a lista da definição. Um
 * grafo adulterado que ponha texto seu nessa propriedade escolhe, na prática, o
 * primeiro modo da lista — não há caminho por onde esse texto chegue ao GLSL.
 */
import type { EmitContext } from '../../core/types';

/** A conta de cada modo, com `a` e `b` já substituídos pelo chamador. */
function blend(mode: string, a: string, b: string): string {
    switch (mode) {
        case 'MULTIPLY': return `${a} * ${b}`;
        case 'ADD': return `${a} + ${b}`;
        case 'SUBTRACT': return `${a} - ${b}`;
        case 'SCREEN': return `vec3( 1.0 ) - ( vec3( 1.0 ) - ${a} ) * ( vec3( 1.0 ) - ${b} )`;
        case 'DIFFERENCE': return `abs( ${a} - ${b} )`;
        case 'DARKEN': return `min( ${a}, ${b} )`;
        case 'LIGHTEN': return `max( ${a}, ${b} )`;
        case 'MIX':
        default: return b;
    }
}

export function emitMixColor(ctx: EmitContext): Record<string, string> {
    const a = ctx.input('color1');
    const b = ctx.input('color2');
    const fac = ctx.input('fac');

    // O factor pesa sempre entre "a cor 1 como está" e o resultado do modo. É o
    // que faz um factor a zero devolver a cor 1 intacta, em qualquer modo — sem
    // isso, cada modo precisaria da sua própria regra para o zero.
    const mixed = ctx.temp('vec3', blend(ctx.option('blend'), a, b));

    return { color: ctx.temp('vec3', `mix( ${a}, ${mixed}, clamp( ${fac}, 0.0, 1.0 ) )`) };
}
