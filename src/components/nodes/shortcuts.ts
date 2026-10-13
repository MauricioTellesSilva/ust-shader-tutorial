import { tr as uiText } from '../../i18n';
/**
 * As teclas do editor de nós, num sítio só.
 *
 * Uma tabela e duas funções puras. Nenhum componente de nó tem um `onKeyDown`,
 * e nenhum comando é decidido dentro de um `switch` enfiado no meio do desenho:
 * a tecla entra aqui, sai o nome de um comando, e quem o executa é o editor.
 *
 *     keydown → **matchShortcut** → 'duplicate' → commands.ts → grafo
 *
 * Ter isto separado é o que permite responder por escrito a "que teclas é que o
 * editor usa?" — a resposta é esta tabela — e testar cada atalho sem carregar
 * numa tecla a sério.
 *
 * ## Ctrl e Cmd
 *
 * O mesmo comando nas duas plataformas. Comparar `ctrlKey || metaKey` em vez de
 * escolher um deles à partida evita a alternativa habitual, que é detectar o
 * sistema operativo por uma string do browser e acertar quase sempre.
 *
 * ## Quando é que uma tecla **não** é um atalho
 *
 * Quando se está a escrever. `Ctrl+A` dentro de um campo numérico selecciona o
 * texto do campo, `Delete` apaga um carácter, `Ctrl+C` copia texto. Um editor
 * que roubasse estas teclas tornaria os seus próprios campos impossíveis de
 * usar — e o pior é que só se percebe depois de perder o que se estava a
 * escrever.
 */

export type CommandId =
    | 'duplicate'
    | 'copy'
    | 'paste'
    | 'cut'
    | 'delete'
    | 'selectAll'
    | 'undo'
    | 'redo'
    | 'addMenu'
    | 'frame'
    | 'cancel';

/** O que um atalho precisa de saber de um evento de teclado. */
export interface KeyLike {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
}

/**
 * Está-se a escrever?
 *
 * Pelo elemento e não por um sinalizador que alguém tenha de se lembrar de
 * ligar e desligar. Um campo novo no editor fica protegido no dia em que é
 * escrito, sem ninguém ter de vir aqui — que é a diferença entre uma regra e
 * uma lista de excepções a manter.
 */
export function isEditingContext(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;

    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;

    // `closest` e não só o próprio elemento: dentro de um bloco editável o alvo
    // costuma ser um nó de texto ou um `<span>` lá de dentro.
    return !!(target as HTMLElement).closest?.('[contenteditable=""], [contenteditable="true"]');
}

/** O modificador de comando da plataforma: Ctrl no Windows e Linux, Cmd no macOS. */
function comando(e: KeyLike): boolean {
    return e.ctrlKey || e.metaKey;
}

/**
 * De uma tecla para um comando, ou `null` quando não é nenhum.
 *
 * A ordem importa em dois sítios. `Shift+D` é lido **antes** dos comandos com
 * Ctrl para que `Ctrl+Shift+D` não seja confundido com um duplicar; e o refazer
 * é lido antes do desfazer porque `Ctrl+Shift+Z` também satisfaz a condição do
 * `Ctrl+Z`.
 */
export function matchShortcut(e: KeyLike): CommandId | null {
    const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    // ── Sem modificador de comando ───────────────────────────────────────
    if (!comando(e)) {
        // O duplicar do Blender, e a razão por que ele não usa Ctrl+D: essa é a
        // do browser para marcar a página, e num editor a tela inteira é a
        // aplicação.
        if (e.shiftKey && tecla === 'd') return 'duplicate';
        if (e.shiftKey && tecla === 'a') return 'addMenu';

        if (tecla === 'Delete' || tecla === 'Backspace') return 'delete';
        if (tecla === 'Escape') return 'cancel';

        // Enquadrar o que está seleccionado. O `.` do teclado numérico é o do
        // Blender; o `f` existe porque a maior parte dos portáteis não tem
        // teclado numérico, e um atalho que metade das pessoas não consegue
        // carregar não é um atalho.
        if (!e.shiftKey && !e.altKey && (tecla === 'f' || tecla === '.')) return 'frame';

        return null;
    }

    if (e.altKey) return null;

    // ── Com Ctrl ou Cmd ──────────────────────────────────────────────────
    switch (tecla) {
        case 'c': return 'copy';
        case 'v': return 'paste';
        case 'x': return 'cut';
        case 'a': return 'selectAll';
        case 'd': return 'duplicate';
        case 'y': return 'redo';
        case 'z': return e.shiftKey ? 'redo' : 'undo';
        default: return null;
    }
}

/**
 * Os comandos que mexem no grafo.
 *
 * Serve para o editor recusar tudo isto de uma vez a quem só tem permissão para
 * ver — sem uma lista de `if` espalhada por cada um deles, que é onde um se
 * esquece.
 */
const ESCREVEM: ReadonlySet<CommandId> = new Set<CommandId>([
    'duplicate', 'paste', 'cut', 'delete', 'undo', 'redo',
]);

export function mutates(command: CommandId): boolean {
    return ESCREVEM.has(command);
}

/** O que se mostra na barra do editor, escrito a partir da mesma tabela. */
export const SHORTCUT_HELP: { keys: string; what: string }[] = [
    { keys: 'Shift+D', what: 'duplicate' },
    { keys: 'Ctrl+C / Ctrl+V', what: 'copy and paste at cursor' },
    { keys: 'Ctrl+X', what: 'cut' },
    { keys: 'Delete', what: 'delete' },
    { keys: 'Ctrl+A', what: 'select all' },
    { keys: 'Ctrl+Z / Ctrl+Shift+Z', what: 'undo and redo' },
    { keys: 'Shift+A', get what() { return uiText("menu de nós no cursor"); } },
    { keys: 'F', get what() { return uiText("enquadrar a selecção"); } },
    { keys: 'Esc', what: 'cancel' },
];
