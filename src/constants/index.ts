import { tr as uiText } from '../i18n';
// Constantes globais do visualizador — cores, valores fixos e parâmetros que não mudam em runtime.

/** Nome público do produto, usado pela marca nos cabeçalhos da aplicação. */
export const APP_NAME = 'Ultimate Studio Tool';

export const COLORS = {
    background: 0x1a1a1a,
    backgroundUV: 0x2a2a2a,
    bgPlaneUVEmpty: 0x111111,
    floor: 0x1a1a1a,
    keyLight: 0xfffff0,
    fillLight: 0x88bbff,
    rimLight: 0xffffff,
    uvLines: 0x2ce679,
    lodDebugMesh: 0xff0055,
    wireTriangles: 0x000000,
    wireQuads: 0x000000,
} as const;

export const LIGHT_INTENSITY = {
    ambient: 0.8,
    ambientAdvanced: 0.4,
    key: 2.5,
    fill: 1.2,
    rim: 2.0,
} as const;

export const CAMERA = {
    fov: 45,
    near: 0.1,
    far: 5000,
    initialPosition: { x: 0, y: 5, z: 15 },
    targetModelSize: 10,
} as const;

/** Espelha LAYOUT.mobileBreakpoint, que é declarado mais abaixo neste ficheiro. */
const MOBILE_BREAKPOINT_PX = 640;

export type ShadowQuality = 'high' | 'medium' | 'low';

export const SHADOW = {
    // Um único mapa de sombra (só a keyLight projecta). A 2048 ocupa cerca de
    // 16 MB de VRAM, o que num telemóvel é bastante para um efeito que quase
    // não se nota num ecrã pequeno. A resolução é a do escalão e não muda; o que
    // acompanha a câmara é a zona que o mapa cobre — ver features/AdaptiveShadow.ts.
    resolutions: { high: 2048, medium: 1024, low: 512 } as Record<ShadowQuality, number>,
    /** Escalão fixo. A null, é escolhido pelo aparelho — ver resolveShadowQuality. */
    quality: null as ShadowQuality | null,
    near: 0.1,
    far: 100,
    bias: -0.0005,
    /** O ajuste da câmara de sombra à vista — ver ShadowFitSettings em features/AdaptiveShadow.ts. */
    fit: {
        padding: 0.02,
        filterTexels: 2,
        stepsPerOctave: 4,
        shrinkSteps: 2,
        minExtentFraction: 1e-3,
        depthSteps: 1024,
    },
} as const;

/**
 * Escolhe o escalão da sombra a partir do aparelho.
 *
 * O sinal principal é o tipo de ponteiro: `pointer: coarse` distingue dedo de
 * rato e apanha telemóveis e tablets sem depender do user agent, que mente com
 * frequência. O número de núcleos serve de desempate para portáteis fracos.
 *
 * O escalão, e com ele a resolução do mapa, decide-se uma vez, no arranque. O que
 * acompanha a câmara é a zona que o mapa cobre — ver features/AdaptiveShadow.ts.
 */
export function resolveShadowQuality(): ShadowQuality {
    if (SHADOW.quality) return SHADOW.quality;
    if (typeof window === 'undefined') return 'high';

    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= MOBILE_BREAKPOINT_PX;
    if (coarsePointer || smallViewport) return 'low';

    const cores = navigator.hardwareConcurrency ?? 8;
    return cores <= 4 ? 'medium' : 'high';
}



export const TEXTURE = {
    ktx2TranscoderPath: 'https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/',
    maxCanvasDim: 8192,
    defaultTileRes: 2048,
    webpQuality: 0.92,
    // Tecto da cache WebP (loaders/TextureLoader.ts). Cada entrada prende uma
    // imagem descomprimida em memória; 50 chega para o vaivém normal entre
    // slots de material sem deixar a memória crescer sem fim.
    webpCacheMaxEntries: 50,
} as const;

export const LOD = {
    polyThreshold: 600000,
    simplifyRatio: 0.5,
    switchDistance: 15,
} as const;

export const MODEL = {
    maxFileSizeMB: 50,
} as const;

export const ANIMATION = {
    defaultFps: 30,
} as const;

export const TEXTURE_LOD = {
    nearDistance: 8,
    farDistance: 20,
    updateIntervalFrames: 15,
} as const;

export const LAYOUT = {
    mobileBreakpoint: 640,
    mobileUVHeightRatio: 0.38,
} as const;

export const UDIM_REGEX = /10(\d{2})/;

export const DEBUG_VIEW_MODES = [
    { value: 'final', get text() { return uiText("Final"); } },
    { value: 'map', text: 'Base Color' },
    { value: 'normalMap', text: 'Normal' },
    { value: 'roughnessMap', text: 'Roughness' },
    { value: 'metalnessMap', text: 'Metallic' },
    { value: 'aoMap', text: 'Ambient Occl.' },
    { value: 'alphaMap', text: 'Opacity' },
] as const;

export const UV_SELECT_OPTIONS = [
    { val: 'map', text: 'Base Color' },
    { val: 'normalMap', text: 'Normal Map' },
    { val: 'roughnessMap', text: 'Roughness' },
    { val: 'metalnessMap', text: 'Metallic' },
    { val: 'aoMap', text: 'Ambient Occl.' },
    { val: 'alphaMap', text: 'Opacity' },
] as const;

export const CHANNEL_INDEX: Record<string, number> = {
    map: 0,
    roughnessMap: 1,
    metalnessMap: 2,
    alphaMap: 3,
};

// Configurações e preferências — valores que poderiam, no futuro, ser expostos ao utilizador.
export const settings = {
    defaultTextureQuality: 'original' as const,
    defaultRoughness: 0.4,
    defaultMetalness: 0.2,
    defaultNormalStrength: 1.0,
    defaultLightRotationDeg: 45,
    defaultExposure: 1.0,
    minDampingFactor: 0.05,
};
