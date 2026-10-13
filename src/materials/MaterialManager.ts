// Material Manager — aplica texturas carregadas aos canais corretos do material
// (incluindo o caso especial ORM) e limpa texturas de um material.
import * as THREE from 'three';
import { registerTextureForLOD, unregisterSlotLOD, unregisterMaterialLOD } from '../features/TextureLOD';
import { ORM_MATERIAL_SLOTS } from './MaterialInputs';
import type { TextureSlot } from '../types';
import {
    attachCompactUdimAtlas,
    detachCompactUdimAtlas,
    getCompactUdimAtlasMetadata,
    type CompactUdimAtlasMetadata,
    type CompactUdimTextureSlot,
} from './CompactUdimAtlas';

function applyUdimWrap(texture: THREE.Texture, cols: number, rows: number) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1 / cols, 1 / rows);
    texture.offset.set(0, 0);
}

type SlotProp = TextureSlot | 'orm';

function disposeOnce(textures: Iterable<THREE.Texture | null>) {
    const disposed = new Set<THREE.Texture>();
    for (const texture of textures) {
        if (!texture || disposed.has(texture)) continue;
        disposed.add(texture);
        texture.dispose();
    }
}

function clearOrmBindings(material: THREE.MeshStandardMaterial) {
    const previous = ORM_MATERIAL_SLOTS.map((slot) => material[slot]);
    detachCompactUdimAtlas(material, ORM_MATERIAL_SLOTS);
    disposeOnce(previous);
    for (const slot of ORM_MATERIAL_SLOTS) material[slot] = null;
}

export function applyTextureToSlot(
    texture: THREE.Texture,
    slotProp: SlotProp,
    isSRGB: boolean,
    targetMaterial: THREE.MeshStandardMaterial,
    cols: number,
    rows: number,
    atlasMetadata?: CompactUdimAtlasMetadata,
) {
    unregisterSlotLOD(targetMaterial, slotProp);
    const compactAtlas = atlasMetadata ?? getCompactUdimAtlasMetadata(texture);

    if (slotProp === 'orm') {
        clearOrmBindings(targetMaterial);

        texture.colorSpace = THREE.NoColorSpace;
        texture.flipY = true;
        if (compactAtlas) {
            attachCompactUdimAtlas(targetMaterial, ORM_MATERIAL_SLOTS, texture, compactAtlas);
        } else {
            applyUdimWrap(texture, cols, rows);
            targetMaterial.roughnessMap = texture;
            targetMaterial.metalnessMap = texture;
            targetMaterial.aoMap = texture;
        }

        targetMaterial.roughness = 1.0;
        targetMaterial.metalness = 1.0;
        targetMaterial.aoMapIntensity = 1.0;
    } else {
        const mat = targetMaterial as unknown as Record<string, THREE.Texture | null>;
        const previous = mat[slotProp];
        detachCompactUdimAtlas(targetMaterial, slotProp as CompactUdimTextureSlot);
        if ((ORM_MATERIAL_SLOTS as readonly string[]).includes(slotProp)
            && previous
            && ORM_MATERIAL_SLOTS.some((slot) => slot !== slotProp && targetMaterial[slot] === previous)) {
            // Replacing one component of a shared ORM image ends the packed
            // binding. Keeping disposed references in its sibling slots would
            // let them sample a GPU resource that no longer exists.
            clearOrmBindings(targetMaterial);
        } else {
            previous?.dispose();
        }
        if (!compactAtlas) applyUdimWrap(texture, cols, rows);
        texture.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.flipY = true;
        if (compactAtlas) {
            attachCompactUdimAtlas(
                targetMaterial,
                slotProp as CompactUdimTextureSlot,
                texture,
                compactAtlas,
            );
        } else {
            mat[slotProp] = texture;
        }

        if (slotProp === 'map') targetMaterial.color.setHex(0xffffff);
        if (slotProp === 'roughnessMap') targetMaterial.roughness = 1.0;
        if (slotProp === 'metalnessMap') targetMaterial.metalness = 1.0;
        if (slotProp === 'emissiveMap') {
            targetMaterial.emissive.setHex(0xffffff);
            targetMaterial.emissiveIntensity = 1.0;
        }
        if (slotProp === 'alphaMap') { targetMaterial.transparent = true; targetMaterial.alphaTest = 0.5; }
    }

    if (!targetMaterial.userData.udimDims) targetMaterial.userData.udimDims = { u: 1, v: 1 };
    targetMaterial.userData.udimDims.u = Math.max(targetMaterial.userData.udimDims.u, cols);
    targetMaterial.userData.udimDims.v = Math.max(targetMaterial.userData.udimDims.v, rows);

    targetMaterial.needsUpdate = true;
    registerTextureForLOD(targetMaterial, slotProp, texture);
}

export function clearMaterialTextures(mat: THREE.MeshStandardMaterial) {
    unregisterMaterialLOD(mat);
    const m = mat as unknown as Record<string, THREE.Texture | null>;
    const previous = (['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'emissiveMap'] as const)
        .map((slot) => m[slot]);
    detachCompactUdimAtlas(mat);

    disposeOnce(previous);
    (['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'emissiveMap'] as const).forEach((slot) => {
        m[slot] = null;
    });

    mat.aoMapIntensity = 1.0;
    mat.transparent = false;
    mat.alphaTest = 0;
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 1.0;
    mat.userData.udimDims = { u: 1, v: 1 };
    mat.needsUpdate = true;
}
