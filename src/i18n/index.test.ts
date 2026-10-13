import { describe, expect, it } from 'vitest';
import { t, tr, translateLabel, useLanguage } from './index';

describe('English tutorial interface', () => {
    it('uses English for the active language and toolbar', () => {
        expect(useLanguage()).toBe('en');
        expect(tr('+ Nó')).toBe('+ Node');
        expect(tr('Apagar')).toBe('Delete');
        expect(tr('Desfazer')).toBe('Undo');
        expect(tr('Repor vista')).toBe('Reset view');
    });

    it('translates registered option labels', () => {
        expect(translateLabel('Permitir subdivisão')).toBe('Allow subdivision');
    });

    it('preserves parameter substitution in translated messages', () => {
        const message = tr('Só pode haver um {value0}.', { value0: 'Material Output' });
        expect(message).toContain('Material Output');
        expect(message).not.toContain('{value0}');
        expect(message).not.toContain('Só pode');
        expect(t('nodeInput', { name: 'Base Color', type: 'COLOR' })).toBe('Input Base Color, type COLOR');
    });

    it('provides an English WebGL fallback', () => {
        expect(t('helpPreviewFallback')).toContain('requires WebGL 2');
    });

    it('leaves existing English labels unchanged', () => {
        expect(translateLabel('Principled BSDF')).toBe('Principled BSDF');
        expect(tr('Already English')).toBe('Already English');
    });
});
