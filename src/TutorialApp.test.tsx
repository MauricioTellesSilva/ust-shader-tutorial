import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import TutorialApp from './TutorialApp';
import { checkerTutorial } from './tutorials/checker';

let container: HTMLDivElement;
let root: Root;

function clickButton(label: string) {
    const button = [...container.querySelectorAll('button')].find(entry => entry.textContent === label);
    if (!button) throw new Error('Botão não encontrado: ' + label);
    act(() => button.click());
}

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe('integração do editor independente', () => {
    it('monta editor e tutorial sem store, backend ou WebGL', () => {
        act(() => root.render(<TutorialApp tutorial={checkerTutorial} />));
        expect(container.querySelectorAll('.ne-no')).toHaveLength(2);
        expect(container.querySelector('progress')?.value).toBe(0);
        expect(container.textContent).toContain('WebGL 2');
        expect(container.querySelector('[role="application"]')).not.toBeNull();
    });

    it('carrega a solução, completa as etapas e reinicia a prática', () => {
        act(() => root.render(<TutorialApp tutorial={checkerTutorial} />));
        clickButton('Load completed example');
        expect(container.querySelectorAll('.ne-no')).toHaveLength(3);
        expect(container.querySelector('progress')?.value).toBe(6);
        expect(container.textContent).toContain('Material complete!');
        clickButton('Reset exercise');
        expect(container.querySelectorAll('.ne-no')).toHaveLength(2);
        expect(container.querySelector('progress')?.value).toBe(0);
        expect(container.textContent).not.toContain('Material complete!');
    });

    it('abre o menu original de criação de nós', () => {
        act(() => root.render(<TutorialApp />));
        clickButton('+ Node');
        expect(container.querySelector('.ne-menu')?.textContent).toContain('Checker Texture');
        expect(container.querySelector('progress')).toBeNull();
    });
});
