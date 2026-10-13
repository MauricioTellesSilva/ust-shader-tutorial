import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { applyGraph, type MaterialGraph } from '../materials/nodes';
import { clearMaterialTextures } from '../materials/MaterialManager';
import { disposeReliefForObject, syncReliefScene } from '../materials/nodes/geometry/ReliefScene';
import { createDemoTexture, type DemoAssetId } from './help/demoTextures';
import PracticePreview from './help/PracticePreview';
import { demoAssets } from '../tutorials/assets';

function MaterialSphere({ graph }: { graph: MaterialGraph }) {
    const mesh = useRef<THREE.Mesh>(null);
    const { invalidate } = useThree();
    const geometry = useMemo(() => new THREE.SphereGeometry(1.2, 64, 48), []);
    const material = useMemo(() => new THREE.MeshStandardMaterial(), []);
    const textures = useMemo(() => new Map<string, THREE.Texture>(), []);

    useEffect(() => {
        applyGraph(material, graph, {}, (id, isSRGB) => {
            if (!demoAssets.some(asset => asset.id === id)) return undefined;
            const key = id + ':' + String(isSRGB);
            if (!textures.has(key)) {
                const texture = createDemoTexture(id as DemoAssetId);
                texture.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
                textures.set(key, texture);
            }
            return textures.get(key);
        });
        syncReliefScene(mesh.current, true, { changed: invalidate });
        invalidate();
    }, [graph, material, textures, invalidate]);

    useEffect(() => {
        const object = mesh.current;
        return () => {
            if (object) disposeReliefForObject(object);
            const bound = new Set([material.map, material.normalMap, material.roughnessMap, material.metalnessMap,
                material.aoMap, material.alphaMap, material.emissiveMap]);
            clearMaterialTextures(material);
            textures.forEach(texture => { if (!bound.has(texture)) texture.dispose(); });
            textures.clear();
            material.dispose();
            geometry.dispose();
        };
    }, [material, geometry, textures]);

    return <mesh ref={mesh} geometry={geometry} material={material} dispose={null} />;
}

export default function MaterialPreview({ graph }: { graph: MaterialGraph }) {
    return <PracticePreview><MaterialSphere graph={graph} /><OrbitControls enablePan={false} /></PracticePreview>;
}
