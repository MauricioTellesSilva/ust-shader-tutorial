import { englishUi } from './englishUi';

export type Language = 'en';
type MessageParams = Record<string, string | number>;

const messages: Record<string, string> = {
    nodeInput: 'Input {name}, type {type}',
    practicePreview: '3D material preview',
    helpPreviewFallback: 'The 3D preview requires WebGL 2. The editor and tutorial remain available; try a browser with hardware acceleration enabled.',
};

export function useLanguage(): Language {
    return 'en';
}

export function tr(text: string, params: MessageParams = {}): string {
    return (englishUi[text] ?? text).replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
}

export function t(key: string, params: MessageParams = {}): string {
    return tr(messages[key] ?? key, params);
}

export function translateLabel(label: string): string {
    return tr(label);
}
