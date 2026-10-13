import { demoTexturePreview, type DemoAssetId } from '../components/help/demoTextures';

const names: Record<DemoAssetId, string> = {
    'demo-color': 'Demo color',
    'demo-normal': 'Demo normal',
    'demo-roughness': 'Demo roughness',
    'demo-metallic': 'Demo metallic',
    'demo-height': 'Demo height',
};

export const demoAssets = (Object.keys(names) as DemoAssetId[]).map(id => ({
    id,
    name: names[id],
    preview: demoTexturePreview(id),
}));
