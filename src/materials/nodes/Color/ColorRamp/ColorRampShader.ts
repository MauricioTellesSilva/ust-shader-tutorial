/**
 * A rampa de cor, no fragmento.
 *
 * Quatro paragens, cada uma com a sua posição e a sua cor, e um factor a
 * percorrê-las. Entre duas paragens interpola-se; a interpolação constante
 * salta de uma para a outra sem passar pelo meio, e é o que dá uma máscara
 * dura em vez de uma transição.
 *
 * ## Porquê quatro, e porquê entradas
 *
 * As paragens são entradas normais — `pos1`/`color1` até `pos4`/`color4` — e não
 * uma lista de tamanho variável. Isso tem três consequências, todas boas: uma
 * cor de paragem pode ela própria vir de outro nó; nada muda no formato de
 * gravação, que já aceita entradas e não aceitaria uma lista; e mexer numa
 * paragem é mexer num uniform, sem recompilar. O preço é o limite de quatro, e
 * está escrito aqui em vez de ser uma surpresa.
 */
import type { EmitContext } from '../../core/types';

/** Quantas paragens a rampa tem. Ver a nota acima antes de mexer. */
export const RAMP_STOPS = 4;

export function emitColorRamp(ctx: EmitContext): Record<string, string> {
    const fac = ctx.temp('float', `clamp( ${ctx.input('fac')}, 0.0, 1.0 )`);
    const constant = ctx.option('interpolation') === 'CONSTANT';

    const positions: string[] = [];
    const colors: string[] = [];

    for (let i = 1; i <= RAMP_STOPS; i += 1) {
        positions.push(ctx.input(`pos${i}`));
        colors.push(ctx.input(`color${i}`));
    }

    // Começa na primeira cor e vai sendo substituída paragem a paragem. Sem
    // ramos: cada passo é um `mix` pesado por um `smoothstep` — ou por um
    // `step`, na interpolação constante — o que mantém os fragmentos de um
    // grupo a executar as mesmas instruções.
    let expression = colors[0];

    for (let i = 1; i < RAMP_STOPS; i += 1) {
        const weight = constant
            ? `step( ${positions[i]}, ${fac} )`
            : `smoothstep( ${positions[i - 1]}, max( ${positions[i]}, ${positions[i - 1]} + 0.0001 ), ${fac} )`;

        expression = `mix( ${expression}, ${colors[i]}, ${weight} )`;
    }

    const color = ctx.temp('vec3', expression);

    return {
        color,
        // O acompanhamento em número, para quando a rampa serve de máscara e
        // não de cor. É a mesma ideia da saída de valor do nó de imagem.
        fac: ctx.temp('float', `dot( ${color}, vec3( 0.2126, 0.7152, 0.0722 ) )`),
    };
}
