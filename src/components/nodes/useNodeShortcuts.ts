/**
 * Liga o teclado ao editor de nós — uma vez, e num sítio.
 *
 * A tabela de teclas está em `shortcuts.ts` e os comandos em `commands.ts`.
 * Isto é a terceira peça: quem ouve o teclado, e sobretudo **quando** decide
 * que uma tecla lhe pertence.
 *
 * ## Porque é que o ouvinte está no documento
 *
 * A alternativa era um `onKeyDown` na tela, e ela obrigava a tela a ter o foco.
 * Mas o foco anda: carregar num nó põe-o na caixa do nó, escrever num campo
 * põe-o no campo, e carregar num botão da barra põe-o no botão. Com o ouvinte
 * na tela, metade dos atalhos deixava de responder consoante onde se tivesse
 * carregado por último — e a pessoa não tem como saber que o editor "perdeu o
 * foco" quando ele continua todo à vista.
 *
 * No documento, a pergunta passa a ser outra e melhor: **este teclado é para o
 * editor?** Sim quando a tecla veio de dentro dele, e sim quando o rato está
 * por cima dele e não há nada com foco lá fora. Não em todos os outros casos —
 * e é essa recusa que impede o editor de roubar o `Ctrl+A` de um formulário do
 * outro lado da janela.
 *
 * ## E quando se está a escrever
 *
 * Nunca. `Ctrl+A` dentro de um campo numérico selecciona o texto do campo,
 * `Delete` apaga um carácter, `Ctrl+C` copia texto. Ver `isEditingContext`.
 */
import { useEffect, useRef, type RefObject } from 'react';

import { isEditingContext, matchShortcut, type CommandId } from './shortcuts';

/**
 * @param root  A raiz do editor. Uma tecla vinda de dentro é para aqui.
 * @param run   Executa o comando. Devolve `true` quando o tratou — e só nesse
 *              caso o comportamento do browser é travado. Um `Ctrl+C` que o
 *              editor não usou tem de continuar a copiar.
 */
export function useNodeShortcuts(
    root: RefObject<HTMLElement | null>,
    run: (command: CommandId, event: KeyboardEvent) => boolean,
): void {
    // O executor muda a cada render, porque fecha sobre o grafo. O ouvinte não
    // pode ser posto e tirado a cada render — daí a referência.
    const executar = useRef(run);
    executar.current = run;

    const sobre = useRef(false);

    useEffect(() => {
        const elemento = root.current;
        if (!elemento) return undefined;

        const entrou = () => { sobre.current = true; };
        const saiu = () => { sobre.current = false; };

        elemento.addEventListener('pointerenter', entrou);
        elemento.addEventListener('pointerleave', saiu);

        const teclou = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;
            if (isEditingContext(event.target)) return;

            const dentro = event.target instanceof Node && elemento.contains(event.target);

            // Por cima do editor conta como dentro, mas só enquanto não houver
            // nada com foco fora dele. Sem esta segunda metade, ter o rato
            // parado sobre o editor tirava as teclas a um campo do painel.
            const activo = document.activeElement;
            const soltoLaFora = !activo || activo === document.body;

            if (!dentro && !(sobre.current && soltoLaFora)) return;

            const comando = matchShortcut(event);
            if (!comando) return;

            if (executar.current(comando, event)) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        document.addEventListener('keydown', teclou);

        return () => {
            elemento.removeEventListener('pointerenter', entrou);
            elemento.removeEventListener('pointerleave', saiu);
            document.removeEventListener('keydown', teclou);
        };
    }, [root]);
}
