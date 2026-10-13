/**
 * A tabela de teclas, lida directamente.
 *
 * Um teste por atalho, e não um teste que carrega em teclas num editor montado.
 * A pergunta aqui é "que comando é esta combinação?", e essa pergunta tem
 * resposta sem React, sem DOM e sem grafo — o que torna barato afirmar também o
 * que **não** é um atalho, que é a metade que costuma faltar.
 */
import { describe, it, expect } from 'vitest';

import { isEditingContext, matchShortcut, mutates, type KeyLike } from './shortcuts';

/** Uma tecla, com os modificadores todos desligados por omissão. */
function tecla(key: string, mods: Partial<KeyLike> = {}): KeyLike {
    return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods };
}

describe('os atalhos', () => {
    it('Shift+D duplica', () => {
        expect(matchShortcut(tecla('D', { shiftKey: true }))).toBe('duplicate');
        // A tecla chega em maiúscula quando o Shift está carregado — comparar
        // com 'd' sem normalizar era não apanhar nunca este atalho.
        expect(matchShortcut(tecla('d', { shiftKey: true }))).toBe('duplicate');
    });

    it('Ctrl+C, Ctrl+V, Ctrl+X e Ctrl+A', () => {
        expect(matchShortcut(tecla('c', { ctrlKey: true }))).toBe('copy');
        expect(matchShortcut(tecla('v', { ctrlKey: true }))).toBe('paste');
        expect(matchShortcut(tecla('x', { ctrlKey: true }))).toBe('cut');
        expect(matchShortcut(tecla('a', { ctrlKey: true }))).toBe('selectAll');
    });

    it('o Cmd do macOS faz o mesmo que o Ctrl', () => {
        expect(matchShortcut(tecla('c', { metaKey: true }))).toBe('copy');
        expect(matchShortcut(tecla('v', { metaKey: true }))).toBe('paste');
        expect(matchShortcut(tecla('z', { metaKey: true }))).toBe('undo');
        expect(matchShortcut(tecla('z', { metaKey: true, shiftKey: true }))).toBe('redo');
    });

    it('desfazer e refazer', () => {
        expect(matchShortcut(tecla('z', { ctrlKey: true }))).toBe('undo');
        expect(matchShortcut(tecla('z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
        expect(matchShortcut(tecla('y', { ctrlKey: true }))).toBe('redo');
    });

    it('apagar, cancelar, enquadrar e o menu de nós', () => {
        expect(matchShortcut(tecla('Delete'))).toBe('delete');
        expect(matchShortcut(tecla('Backspace'))).toBe('delete');
        expect(matchShortcut(tecla('Escape'))).toBe('cancel');
        expect(matchShortcut(tecla('f'))).toBe('frame');
        expect(matchShortcut(tecla('.'))).toBe('frame');
        expect(matchShortcut(tecla('A', { shiftKey: true }))).toBe('addMenu');
    });

    it('Ctrl+D também duplica, mas Shift+D continua a ser o principal', () => {
        // O Ctrl+D é o de marcar a página no browser; existir aqui é uma
        // conveniência, e por isso é lido **depois** do Shift+D.
        expect(matchShortcut(tecla('d', { ctrlKey: true }))).toBe('duplicate');
        expect(matchShortcut(tecla('d', { ctrlKey: true, shiftKey: true }))).toBe('duplicate');
    });

    it('o que não é atalho nenhum', () => {
        for (const k of ['b', 'Enter', 'ArrowLeft', 'Tab', '1']) {
            expect(matchShortcut(tecla(k)), k).toBeNull();
        }

        // Com Alt não é nosso: são as combinações do sistema e do browser.
        expect(matchShortcut(tecla('c', { ctrlKey: true, altKey: true }))).toBeNull();
        expect(matchShortcut(tecla('f', { altKey: true }))).toBeNull();
    });

    it('os que escrevem estão marcados como tal', () => {
        // É por esta lista que o editor recusa tudo de uma vez a quem só pode
        // ver. Copiar e seleccionar não escrevem, e continuam a funcionar.
        for (const c of ['duplicate', 'paste', 'cut', 'delete', 'undo', 'redo'] as const) {
            expect(mutates(c), c).toBe(true);
        }
        for (const c of ['copy', 'selectAll', 'frame', 'cancel', 'addMenu'] as const) {
            expect(mutates(c), c).toBe(false);
        }
    });
});

describe('quando se está a escrever, as teclas são do campo', () => {
    it('reconhece os campos de texto e de número', () => {
        for (const tag of ['input', 'textarea', 'select']) {
            expect(isEditingContext(document.createElement(tag)), tag).toBe(true);
        }
    });

    it('reconhece um bloco editável, mesmo por dentro', () => {
        const bloco = document.createElement('div');
        bloco.setAttribute('contenteditable', 'true');
        const dentro = document.createElement('span');
        bloco.appendChild(dentro);
        document.body.appendChild(bloco);

        expect(isEditingContext(bloco)).toBe(true);
        expect(isEditingContext(dentro)).toBe(true);

        bloco.remove();
    });

    it('a tela do editor não é um campo', () => {
        const tela = document.createElement('div');
        expect(isEditingContext(tela)).toBe(false);
        expect(isEditingContext(null)).toBe(false);
    });
});
