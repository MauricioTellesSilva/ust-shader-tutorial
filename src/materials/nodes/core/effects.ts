import { tr as uiText } from '../../../i18n';
/**
 * Os efeitos de material, e o que cada um vale.
 *
 * As definições vivem aqui e a interface gera-se a partir delas: um efeito novo
 * é uma entrada nesta lista, e não mais um deslizador escrito à mão num
 * componente. Ver `MaterialEffectsSection`, que não conhece nenhum efeito pelo
 * nome.
 *
 * ## Só o que o renderizador sabe fazer
 *
 * Cada efeito aqui corresponde a uma propriedade que o `MeshStandardMaterial`
 * do Three.js aplica de facto — é a mesma classe que o fluxo original usa. Um
 * deslizador bonito ligado a nada é pior do que a ausência dele: promete uma
 * coisa e não a cumpre, e ninguém percebe porquê.
 *
 * Por isso **não** há aqui transmissão, clearcoat nem IOR: são do
 * `MeshPhysicalMaterial`, e trocar a classe do material mexeria no fluxo
 * original, que tem de continuar exactamente como está. A lista está pronta
 * para eles no dia em que o material físico entrar.
 *
 * ## Quem manda quando há um nó ligado
 *
 * O grafo. Um efeito cujo parâmetro esteja a ser alimentado por uma ligação
 * mostra-se desactivado e o valor do deslizador é ignorado — ver `driven` no
 * avaliador. Duas fontes de verdade para o mesmo número é precisamente o que
 * não se quer.
 */

export interface MaterialEffectDefinition {
    id: string;
    name: string;
    /** A entrada do Principled que este efeito ocupa, quando ocupa alguma. */
    socket?: string;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    description: string;
}

export const MATERIAL_EFFECTS: MaterialEffectDefinition[] = [
    {
        id: 'roughness',
        name: 'Roughness',
        socket: 'roughness',
        min: 0, max: 1, step: 0.01, defaultValue: 0.5,
        get description() { return uiText("Quão difusa é a reflexão. 0 é espelho, 1 é mate."); },
    },
    {
        id: 'metallic',
        name: 'Metallic',
        socket: 'metallic',
        min: 0, max: 1, step: 0.01, defaultValue: 0,
        get description() { return uiText("Metal ou dieléctrico. Os valores pelo meio raramente são físicos."); },
    },
    {
        id: 'normalStrength',
        name: 'Normal strength',
        min: 0, max: 4, step: 0.01, defaultValue: 1,
        get description() { return uiText("Quanto o mapa de normais desvia a superfície."); },
    },
    {
        id: 'emissiveStrength',
        name: 'Emission',
        socket: 'emission',
        min: 0, max: 5, step: 0.01, defaultValue: 0,
        get description() { return uiText("Luz emitida pela própria superfície."); },
    },
    {
        id: 'opacity',
        name: 'Opacity',
        socket: 'alpha',
        min: 0, max: 1, step: 0.01, defaultValue: 1,
        description: 'Abaixo de 1 o material passa a transparente.',
    },
    {
        id: 'envIntensity',
        name: 'Reflection',
        min: 0, max: 3, step: 0.01, defaultValue: 1,
        get description() { return uiText("Quanto o ambiente se reflecte na superfície."); },
    },
];

export type MaterialEffects = Record<string, number>;

export function defaultEffects(): MaterialEffects {
    return Object.fromEntries(MATERIAL_EFFECTS.map((e) => [e.id, e.defaultValue]));
}

/**
 * Prende um valor ao que a definição permite.
 *
 * Corre na leitura e na escrita. Um projeto gravado por uma versão com limites
 * diferentes — ou um ficheiro mexido à mão — não pode pôr um `roughness` a 40 e
 * deixar o material impossível de perceber.
 */
export function clampEffect(id: string, value: unknown): number {
    const definition = MATERIAL_EFFECTS.find((e) => e.id === id);
    if (!definition) return 0;
    if (typeof value !== 'number' || !Number.isFinite(value)) return definition.defaultValue;

    return Math.min(definition.max, Math.max(definition.min, value));
}

/** Os efeitos de um projeto, com o que falta preenchido e o resto validado. */
export function normalizeEffects(raw: unknown): MaterialEffects {
    const out = defaultEffects();
    if (!raw || typeof raw !== 'object') return out;

    for (const definition of MATERIAL_EFFECTS) {
        const value = (raw as Record<string, unknown>)[definition.id];
        if (value !== undefined) out[definition.id] = clampEffect(definition.id, value);
    }

    return out;
}
