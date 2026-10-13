import type * as THREE from 'three';

export type ShadingMode = 'standard' | 'advanced';
export type WorkflowMode = 'standard' | 'orm';
export type BoneStyle = 'weight' | 'stick' | 'bone';
export type DebugViewMode = 'final' | 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'alphaMap';
export type TextureSlot = 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'alphaMap' | 'emissiveMap';
export type TextureQuality = 'original' | '2048' | '1024' | '512' | '256';

/**
 * Resolução de cada tile de um conjunto UDIM.
 * 'auto' reparte o limite do atlas («Max Resolução») pelos tiles; um valor
 * fixo prende a resolução por tile e deixa o atlas crescer.
 */
export type UdimTileQuality = 'auto' | '2048' | '1024' | '512' | '256';

export interface MaterialsMap {
    [name: string]: THREE.MeshStandardMaterial;
}

export interface CompressionStatus {
    [slot: string]: string | null;
}

export interface CompressionStatusCache {
    [materialName: string]: CompressionStatus;
}

export interface CachedTextureFiles {
    [slot: string]: File[];
}

export interface MaterialTexturesCache {
    [materialName: string]: CachedTextureFiles;
}

export interface ToastNotification {
    id: number;
    /**
     * `success` é a confirmação de algo que a pessoa mandou fazer — "Projeto
     * criado.", "Alojamento ligado." — e não um problema. Vive na mesma fila
     * dos outros de propósito: um segundo sistema de avisos daria dois sítios
     * no ecrã a dizer coisas ao mesmo tempo, cada um com as suas regras.
     */
    kind: 'error' | 'warning' | 'success';
    message: string;
}

export interface ModelInfo {
    fileName: string;
    meshCount: number;
    polyCount: number;
    hasLOD: boolean;
    hasSkeleton: boolean;
}
