import type * as THREE from 'three';

import type { DebugViewMode, TextureSlot } from '../types';

/** The three physical MeshStandardMaterial slots occupied by one ORM image. */
export const ORM_MATERIAL_SLOTS = ['aoMap', 'roughnessMap', 'metalnessMap'] as const;

export type TextureBindingSlot = TextureSlot | 'orm';
export type PackedChannel = 0 | 1 | 2 | 3;

/**
 * One source of truth for the material properties occupied by a stored texture.
 * Persistence, usage scans and Texture LOD all need this exact relationship.
 */
export const MATERIAL_SLOT_PROPERTIES: Record<
    TextureBindingSlot,
    readonly (keyof THREE.MeshStandardMaterial)[]
> = {
    map: ['map'],
    normalMap: ['normalMap'],
    roughnessMap: ['roughnessMap'],
    metalnessMap: ['metalnessMap'],
    aoMap: ['aoMap'],
    alphaMap: ['alphaMap'],
    emissiveMap: ['emissiveMap'],
    orm: ORM_MATERIAL_SLOTS,
};

export function materialPropertiesForTextureSlot(
    slot: string,
): readonly (keyof THREE.MeshStandardMaterial)[] {
    return MATERIAL_SLOT_PROPERTIES[slot as TextureBindingSlot] ?? [];
}

/**
 * LOD registrations that can overwrite a newly assigned slot.
 *
 * A packed registration writes all three O/R/M properties, so replacing any
 * one of them must retire it. Conversely, installing a packed texture retires
 * each separate registration that could later overwrite one of its channels.
 */
export function conflictingTextureLodSlots(slot: string): readonly string[] {
    if (slot === 'orm') return ['orm', ...ORM_MATERIAL_SLOTS];
    if ((ORM_MATERIAL_SLOTS as readonly string[]).includes(slot)) return [slot, 'orm'];
    return [slot];
}

export interface MaterialInputSample {
    texture: THREE.Texture;
    /** RGBA component sampled by MeshStandardMaterial. */
    channel: PackedChannel;
}

export interface ResolvedScalarMaterialInput {
    /** First per-pixel multiplier, if this input has a texture. */
    primary: MaterialInputSample | null;
    /** Optional second multiplier. Opacity also includes base-color alpha. */
    secondary: MaterialInputSample | null;
    /** Applied after sampling: value = sampled * factor + bias. */
    factor: number;
    bias: number;
    /** Sample value used when there is no primary texture. */
    fallback: number;
}

export type ScalarTechnicalPass = Extract<
    DebugViewMode,
    'roughnessMap' | 'metalnessMap' | 'aoMap' | 'alphaMap'
>;

const sample = (texture: THREE.Texture | null, channel: PackedChannel): MaterialInputSample | null => (
    texture ? { texture, channel } : null
);

/**
 * Resolve the scalar that Three's MeshStandardMaterial actually consumes.
 *
 * This deliberately does not depend on the editor's `standard | orm` toggle.
 * Three always samples the same components, whether the source image is a
 * grayscale file or one packed ORM image:
 *
 *   AO = R, roughness = G, metallic = B, alphaMap = G.
 */
export function resolveScalarMaterialInput(
    material: THREE.MeshStandardMaterial,
    pass: ScalarTechnicalPass,
): ResolvedScalarMaterialInput {
    if (pass === 'roughnessMap') {
        return {
            primary: sample(material.roughnessMap, 1),
            secondary: null,
            factor: material.roughness,
            bias: 0,
            fallback: 1,
        };
    }

    if (pass === 'metalnessMap') {
        return {
            primary: sample(material.metalnessMap, 2),
            secondary: null,
            factor: material.metalness,
            bias: 0,
            fallback: 1,
        };
    }

    if (pass === 'aoMap') {
        const intensity = material.aoMapIntensity;
        return {
            primary: sample(material.aoMap, 0),
            secondary: null,
            factor: intensity,
            bias: 1 - intensity,
            fallback: 1,
        };
    }

    // MeshStandardMaterial starts diffuse alpha at material.opacity, multiplies
    // it by map.a and then by alphaMap.g. Technical opacity must do the same.
    const alphaMap = sample(material.alphaMap, 1);
    const colorAlpha = sample(material.map, 3);
    return {
        primary: alphaMap ?? colorAlpha,
        secondary: alphaMap && colorAlpha ? colorAlpha : null,
        factor: material.opacity,
        bias: 0,
        fallback: 1,
    };
}
