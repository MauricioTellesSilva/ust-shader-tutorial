import * as THREE from 'three';

export type DemoAssetId = 'demo-color' | 'demo-normal' | 'demo-roughness' | 'demo-metallic' | 'demo-height';
const palette = (id: DemoAssetId) => {
    if (id === 'demo-normal') return ['#6080f8', '#a080f8'];
    if (id === 'demo-roughness') return ['#444444', '#dddddd'];
    if (id === 'demo-metallic' || id === 'demo-height') return ['#000000', '#ffffff'];
    return ['#2c6159', '#c98754'];
};
export function demoTextureSvg(id: DemoAssetId) {
    if (id === 'demo-height') return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="height"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></radialGradient><pattern id="bumps" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#000000"/><circle cx="8" cy="8" r="8" fill="url(#height)"/></pattern></defs><rect width="64" height="64" fill="url(#bumps)"/></svg>`;
    const [a, b] = palette(id);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="${a}"/><path d="M32 0h32v32H32zM0 32h32v32H0z" fill="${b}"/></svg>`;
}
export function demoTexturePreview(id: DemoAssetId) { return 'data:image/svg+xml,' + encodeURIComponent(demoTextureSvg(id)); }
export function createDemoTexture(id: DemoAssetId) {
    const colors = palette(id).map(value => value.slice(1).match(/../g)!.map(part => parseInt(part, 16)));
    const pixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        if (id === 'demo-height') {
            const height = Math.round(255 * Math.max(0, 1 - Math.hypot(x % 16 + 0.5 - 8, y % 16 + 0.5 - 8) / 8));
            pixels.set([height, height, height, 255], (y * 64 + x) * 4);
        } else {
            const color = colors[(Math.floor(x / 32) + Math.floor(y / 32)) % 2];
            pixels.set([...color, 255], (y * 64 + x) * 4);
        }
    }
    const texture = new THREE.DataTexture(pixels, 64, 64);
    texture.magFilter = id === 'demo-height' ? THREE.LinearFilter : THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
}
