import * as THREE from 'three';

/**
 * Contract shared by the atlas producer and the runtime sampler.
 *
 * `tiles[udim].x/y` are zero-based cell coordinates measured from the atlas'
 * bottom-left corner (the same origin used by texture UVs). An image encoder,
 * whose pixel origin is normally top-left, must therefore write row `y` at
 * `atlasHeight - (y + 1) * cellStride`.
 */
export interface CompactUdimTilePlacement {
    x: number;
    y: number;
}

export interface CompactUdimAtlasMetadata {
    version: string | number;
    atlasWidth: number;
    atlasHeight: number;
    columns: number;
    rows: number;
    tileResolution: number;
    gutter: number;
    tiles: Readonly<Record<string, Readonly<CompactUdimTilePlacement>>>;
}

export type CompactUdimTextureSlot =
    | 'map'
    | 'normalMap'
    | 'roughnessMap'
    | 'metalnessMap'
    | 'aoMap'
    | 'alphaMap'
    | 'emissiveMap';

export type CompactUdimMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

export interface CompactUdimLookup {
    texture: THREE.DataTexture;
    firstUdim: number;
    width: number;
}

export interface CompactUdimUvResult {
    udim: number;
    tile: CompactUdimTilePlacement;
    localUv: THREE.Vector2;
    atlasUv: THREE.Vector2;
}

export const COMPACT_UDIM_ATLAS_METADATA_KEY = 'compactUdimAtlas';
export const COMPACT_UDIM_FIRST_TILE = 1001;
export const COMPACT_UDIM_LAST_TILE = 1999;
export const COMPACT_UDIM_ROW_LENGTH = 10;

export const COMPACT_UDIM_TEXTURE_SLOTS: readonly CompactUdimTextureSlot[] = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'alphaMap',
    'emissiveMap',
];

interface SlotDefinition {
    chunkMarker: string;
    varying: string;
    textureUniform: string;
    samplePattern: RegExp;
    fallback: string;
    suffix: string;
}

const SLOT_DEFINITIONS: Record<CompactUdimTextureSlot, SlotDefinition> = {
    map: {
        chunkMarker: 'map_fragment',
        varying: 'vMapUv',
        textureUniform: 'map',
        samplePattern: /texture2D\(\s*map\s*,\s*vMapUv\s*\)/g,
        fallback: 'vec4( 1.0 )',
        suffix: 'Map',
    },
    normalMap: {
        chunkMarker: 'normal_fragment_maps',
        varying: 'vNormalMapUv',
        textureUniform: 'normalMap',
        samplePattern: /texture2D\(\s*normalMap\s*,\s*vNormalMapUv\s*\)/g,
        fallback: 'vec4( 0.5, 0.5, 1.0, 1.0 )',
        suffix: 'NormalMap',
    },
    roughnessMap: {
        chunkMarker: 'roughnessmap_fragment',
        varying: 'vRoughnessMapUv',
        textureUniform: 'roughnessMap',
        samplePattern: /texture2D\(\s*roughnessMap\s*,\s*vRoughnessMapUv\s*\)/g,
        fallback: 'vec4( 1.0 )',
        suffix: 'RoughnessMap',
    },
    metalnessMap: {
        chunkMarker: 'metalnessmap_fragment',
        varying: 'vMetalnessMapUv',
        textureUniform: 'metalnessMap',
        samplePattern: /texture2D\(\s*metalnessMap\s*,\s*vMetalnessMapUv\s*\)/g,
        fallback: 'vec4( 1.0 )',
        suffix: 'MetalnessMap',
    },
    aoMap: {
        chunkMarker: 'aomap_fragment',
        varying: 'vAoMapUv',
        textureUniform: 'aoMap',
        samplePattern: /texture2D\(\s*aoMap\s*,\s*vAoMapUv\s*\)/g,
        fallback: 'vec4( 1.0 )',
        suffix: 'AoMap',
    },
    alphaMap: {
        chunkMarker: 'alphamap_fragment',
        varying: 'vAlphaMapUv',
        textureUniform: 'alphaMap',
        samplePattern: /texture2D\(\s*alphaMap\s*,\s*vAlphaMapUv\s*\)/g,
        fallback: 'vec4( 1.0 )',
        suffix: 'AlphaMap',
    },
    emissiveMap: {
        chunkMarker: 'emissivemap_fragment',
        varying: 'vEmissiveMapUv',
        textureUniform: 'emissiveMap',
        samplePattern: /texture2D\(\s*emissiveMap\s*,\s*vEmissiveMapUv\s*\)/g,
        fallback: 'vec4( 1.0 )',
        suffix: 'EmissiveMap',
    },
};

interface AtlasUniforms {
    lookup: { value: THREE.DataTexture | null };
    lookupWidth: { value: number };
    atlasInfo: { value: THREE.Vector4 };
}

interface AtlasBinding {
    atlas: THREE.Texture;
    metadata: CompactUdimAtlasMetadata;
    lookup: CompactUdimLookup;
    uniforms: AtlasUniforms;
}

interface ShaderLike {
    fragmentShader: string;
    uniforms: Record<string, { value: unknown }>;
}

interface MaterialPatchState {
    bindings: Map<CompactUdimTextureSlot, AtlasBinding>;
    compiledShaders: Set<ShaderLike>;
    previousOnBeforeCompile: THREE.Material['onBeforeCompile'];
    previousProgramCacheKey: THREE.Material['customProgramCacheKey'];
    wrappedOnBeforeCompile: THREE.Material['onBeforeCompile'];
    wrappedProgramCacheKey: THREE.Material['customProgramCacheKey'];
    onDispose: () => void;
}

const materialStates = new WeakMap<CompactUdimMaterial, MaterialPatchState>();
// WebGLRenderer can reuse a program without calling onBeforeCompile again.
// Keep uniform objects alive across texture/LOD detach and reattach operations,
// so cached programs see the new mapping rather than a disposed atlas binding.
const materialUniforms = new WeakMap<CompactUdimMaterial, Map<CompactUdimTextureSlot, AtlasUniforms>>();

function uniformsFor(material: CompactUdimMaterial, slot: CompactUdimTextureSlot): AtlasUniforms {
    let slots = materialUniforms.get(material);
    if (!slots) {
        slots = new Map();
        materialUniforms.set(material, slots);
    }
    let uniforms = slots.get(slot);
    if (!uniforms) {
        uniforms = {
            lookup: { value: null },
            lookupWidth: { value: 1 },
            atlasInfo: { value: new THREE.Vector4() },
        };
        slots.set(slot, uniforms);
    }
    return uniforms;
}

function positiveInteger(value: unknown, name: string): number {
    if (!Number.isInteger(value) || (value as number) <= 0) {
        throw new TypeError(`${name} must be a positive integer`);
    }
    return value as number;
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (!Number.isInteger(value) || (value as number) < 0) {
        throw new TypeError(`${name} must be a non-negative integer`);
    }
    return value as number;
}

function normalizedMetadata(metadata: CompactUdimAtlasMetadata): CompactUdimAtlasMetadata {
    if (
        !metadata
        || (typeof metadata.version !== 'string' && typeof metadata.version !== 'number')
        || (typeof metadata.version === 'string' && metadata.version.length === 0)
        || (typeof metadata.version === 'number' && !Number.isFinite(metadata.version))
    ) {
        throw new TypeError('version must be a non-empty string or a finite number');
    }

    const atlasWidth = positiveInteger(metadata.atlasWidth, 'atlasWidth');
    const atlasHeight = positiveInteger(metadata.atlasHeight, 'atlasHeight');
    const columns = positiveInteger(metadata.columns, 'columns');
    const rows = positiveInteger(metadata.rows, 'rows');
    const tileResolution = positiveInteger(metadata.tileResolution, 'tileResolution');
    const gutter = nonNegativeInteger(metadata.gutter, 'gutter');
    const stride = tileResolution + gutter * 2;

    if (atlasWidth < columns * stride || atlasHeight < rows * stride) {
        throw new RangeError('atlas dimensions cannot contain the declared grid, tile resolution and gutter');
    }
    if (!metadata.tiles || typeof metadata.tiles !== 'object') {
        throw new TypeError('tiles must be an object keyed by UDIM number');
    }

    const tiles: Record<string, CompactUdimTilePlacement> = {};
    const occupiedCells = new Set<string>();
    for (const [rawUdim, rawPlacement] of Object.entries(metadata.tiles)) {
        const udim = Number(rawUdim);
        if (
            !Number.isInteger(udim)
            || udim < COMPACT_UDIM_FIRST_TILE
            || udim > COMPACT_UDIM_LAST_TILE
        ) {
            throw new RangeError(`invalid UDIM tile: ${rawUdim}`);
        }
        if (String(udim) !== rawUdim) {
            throw new TypeError(`UDIM key must be its canonical integer representation: ${rawUdim}`);
        }

        const x = nonNegativeInteger(rawPlacement?.x, `tiles.${rawUdim}.x`);
        const y = nonNegativeInteger(rawPlacement?.y, `tiles.${rawUdim}.y`);
        if (x >= columns || y >= rows) {
            throw new RangeError(`tile ${rawUdim} is outside the declared atlas grid`);
        }
        const cellKey = `${x}:${y}`;
        if (occupiedCells.has(cellKey)) {
            throw new RangeError(`more than one UDIM tile occupies atlas cell ${cellKey}`);
        }
        occupiedCells.add(cellKey);
        tiles[rawUdim] = { x, y };
    }
    if (Object.keys(tiles).length === 0) {
        throw new RangeError('tiles must contain at least one UDIM placement');
    }

    return {
        version: metadata.version,
        atlasWidth,
        atlasHeight,
        columns,
        rows,
        tileResolution,
        gutter,
        tiles,
    };
}

/** Validates the wire format without mutating it. */
export function validateCompactUdimAtlasMetadata(metadata: CompactUdimAtlasMetadata): void {
    normalizedMetadata(metadata);
}

/** Stores a validated, detached metadata copy on a texture for persistence/debugging. */
export function attachCompactUdimAtlasMetadata<T extends THREE.Texture>(
    texture: T,
    metadata: CompactUdimAtlasMetadata,
): T {
    texture.userData[COMPACT_UDIM_ATLAS_METADATA_KEY] = normalizedMetadata(metadata);
    return texture;
}

export function getCompactUdimAtlasMetadata(texture: THREE.Texture): CompactUdimAtlasMetadata | undefined {
    return texture.userData[COMPACT_UDIM_ATLAS_METADATA_KEY] as CompactUdimAtlasMetadata | undefined;
}

/**
 * Makes the integer UDIM-to-cell table sampled by the shader. R/G contain x/y,
 * B is the presence bit. There are no mipmaps and both filters are nearest so a
 * lookup can never blend two adjacent tile records.
 */
export function createCompactUdimLookupTexture(metadata: CompactUdimAtlasMetadata): CompactUdimLookup {
    const normalized = normalizedMetadata(metadata);
    const udims = Object.keys(normalized.tiles).map(Number);
    const lastUdim = Math.max(...udims);
    const width = lastUdim - COMPACT_UDIM_FIRST_TILE + 1;
    // An 8-bit lookup works on WebGL 1 and 2 without float-texture extensions.
    // The supported UDIM range needs at most a 32×32 compact grid.
    const data = new Uint8Array(width * 4);

    for (const udim of udims) {
        const placement = normalized.tiles[String(udim)];
        const offset = (udim - COMPACT_UDIM_FIRST_TILE) * 4;
        data[offset] = placement.x;
        data[offset + 1] = placement.y;
        data[offset + 2] = 255;
    }

    const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.name = `Compact UDIM lookup v${String(normalized.version)}`;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;

    return { texture, firstUdim: COMPACT_UDIM_FIRST_TILE, width };
}

function sourceUvParts(uv: { x: number; y: number }) {
    const tileU = Math.floor(uv.x);
    const tileV = Math.floor(uv.y);
    if (tileU < 0 || tileU >= COMPACT_UDIM_ROW_LENGTH || tileV < 0) return null;
    return {
        udim: COMPACT_UDIM_FIRST_TILE + tileU + tileV * COMPACT_UDIM_ROW_LENGTH,
        localU: uv.x - tileU,
        localV: uv.y - tileV,
    };
}

/** CPU reference implementation of the exact coordinate transform used in GLSL. */
export function resolveCompactUdimUv(
    uv: { x: number; y: number },
    metadata: CompactUdimAtlasMetadata,
): CompactUdimUvResult | null {
    const normalized = normalizedMetadata(metadata);
    const source = sourceUvParts(uv);
    if (!source) return null;

    const tile = normalized.tiles[String(source.udim)];
    if (!tile) return null;

    const stride = normalized.tileResolution + normalized.gutter * 2;
    const sampleSpan = Math.max(normalized.tileResolution - 1, 0);
    const pixelX = tile.x * stride + normalized.gutter + 0.5 + source.localU * sampleSpan;
    const pixelY = tile.y * stride + normalized.gutter + 0.5 + source.localV * sampleSpan;

    return {
        udim: source.udim,
        tile: { ...tile },
        localUv: new THREE.Vector2(source.localU, source.localV),
        atlasUv: new THREE.Vector2(
            pixelX / normalized.atlasWidth,
            pixelY / normalized.atlasHeight,
        ),
    };
}

function shaderNames(slot: CompactUdimTextureSlot) {
    const suffix = SLOT_DEFINITIONS[slot].suffix;
    return {
        lookup: `compactUdimLookup${suffix}`,
        atlasInfo: `compactUdimAtlasInfo${suffix}`,
        lookupWidth: `compactUdimLookupWidth${suffix}`,
        sample: `compactUdimSample${suffix}`,
    };
}

function shaderSupportSource(slot: CompactUdimTextureSlot): string {
    const definition = SLOT_DEFINITIONS[slot];
    const names = shaderNames(slot);
    return `
uniform sampler2D ${names.lookup};
uniform vec4 ${names.atlasInfo};
uniform float ${names.lookupWidth};

vec4 ${names.sample}( vec2 sourceUv ) {
    vec2 sourceTile = floor( sourceUv );
    float validU = step( 0.0, sourceTile.x ) * ( 1.0 - step( ${COMPACT_UDIM_ROW_LENGTH.toFixed(1)}, sourceTile.x ) );
    float validV = step( 0.0, sourceTile.y );
    float udimIndex = sourceTile.x + sourceTile.y * ${COMPACT_UDIM_ROW_LENGTH.toFixed(1)};
    float validIndex = step( 0.0, udimIndex ) * ( 1.0 - step( ${names.lookupWidth}, udimIndex ) );
    float safeIndex = clamp( udimIndex, 0.0, max( ${names.lookupWidth} - 1.0, 0.0 ) );
    vec4 tileRecord = texture2D( ${names.lookup}, vec2( ( safeIndex + 0.5 ) / ${names.lookupWidth}, 0.5 ) );
    float present = validU * validV * validIndex * step( 0.5, tileRecord.b );

    float tileResolution = ${names.atlasInfo}.z;
    float gutter = ${names.atlasInfo}.w;
    float cellStride = tileResolution + gutter * 2.0;
    vec2 innerPixel = ( tileRecord.rg * 255.0 ) * cellStride
        + vec2( gutter + 0.5 )
        + fract( sourceUv ) * max( tileResolution - 1.0, 0.0 );
    vec2 atlasUv = innerPixel / ${names.atlasInfo}.xy;
    vec4 atlasSample = texture2D( ${definition.textureUniform}, atlasUv );
    return mix( ${definition.fallback}, atlasSample, present );
}
`;
}

function replaceChunkWithCompactSampler(fragmentShader: string, slot: CompactUdimTextureSlot): string {
    const definition = SLOT_DEFINITIONS[slot];
    const marker = `#include <${definition.chunkMarker}>`;
    if (!fragmentShader.includes(marker)) {
        throw new Error(`Three.js shader no longer contains ${marker}`);
    }

    const chunk = THREE.ShaderChunk[definition.chunkMarker as keyof typeof THREE.ShaderChunk];
    if (typeof chunk !== 'string' || !definition.samplePattern.test(chunk)) {
        definition.samplePattern.lastIndex = 0;
        throw new Error(`Three.js shader chunk ${definition.chunkMarker} no longer has the expected sample`);
    }
    definition.samplePattern.lastIndex = 0;
    const patchedChunk = chunk.replace(
        definition.samplePattern,
        `${shaderNames(slot).sample}( ${definition.varying} )`,
    );
    definition.samplePattern.lastIndex = 0;
    return fragmentShader.replace(marker, patchedChunk);
}

function updateShaderUniform(shader: ShaderLike, slot: CompactUdimTextureSlot, binding: AtlasBinding): void {
    const names = shaderNames(slot);
    shader.uniforms[names.lookup] = binding.uniforms.lookup;
    shader.uniforms[names.lookupWidth] = binding.uniforms.lookupWidth;
    shader.uniforms[names.atlasInfo] = binding.uniforms.atlasInfo;
}

function injectBindings(shader: ShaderLike, bindings: Map<CompactUdimTextureSlot, AtlasBinding>): void {
    const slots = [...bindings.keys()].toSorted();
    const mainMarker = 'void main() {';
    if (!shader.fragmentShader.includes(mainMarker)) {
        throw new Error('Three.js shader no longer contains a fragment main function');
    }

    const support = slots.map(shaderSupportSource).join('\n');
    shader.fragmentShader = shader.fragmentShader.replace(mainMarker, `${support}\n${mainMarker}`);
    for (const slot of slots) {
        shader.fragmentShader = replaceChunkWithCompactSampler(shader.fragmentShader, slot);
        updateShaderUniform(shader, slot, bindings.get(slot)!);
    }
}

/**
 * Applies the compact-atlas transform to an externally managed shader hook.
 *
 * The node-material runtime owns its own `onBeforeCompile`; exposing this
 * small composition point prevents either system from overwriting the other.
 * Reapplying to the same shader only refreshes uniforms, so a wrapper and an
 * explicit caller can safely coexist.
 */
export function applyCompactUdimAtlasShader(
    material: CompactUdimMaterial,
    shader: ShaderLike,
): boolean {
    const state = materialStates.get(material);
    if (!state || state.bindings.size === 0) return false;

    if (!state.compiledShaders.has(shader)) {
        injectBindings(shader, state.bindings);
        state.compiledShaders.add(shader);
    } else {
        for (const [slot, binding] of state.bindings) updateShaderUniform(shader, slot, binding);
    }
    return true;
}

/** Structural suffix for program caches owned by another shader subsystem. */
export function compactUdimProgramCacheKey(material: CompactUdimMaterial): string {
    const state = materialStates.get(material);
    if (!state || state.bindings.size === 0) return '';
    return `|compactUdimAtlas:v1:${[...state.bindings.keys()].toSorted().join(',')}`;
}

function assertSupportedMaterial(material: THREE.Material): asserts material is CompactUdimMaterial {
    if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        throw new TypeError('compact UDIM atlases require a MeshStandardMaterial or MeshPhysicalMaterial');
    }
}

function configureAtlasTexture(texture: THREE.Texture): void {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.offset.set(0, 0);
    texture.repeat.set(1, 1);
    texture.center.set(0, 0);
    texture.rotation = 0;
    texture.matrixAutoUpdate = true;
    texture.updateMatrix();
    texture.needsUpdate = true;
}

function cleanupState(material: CompactUdimMaterial, state: MaterialPatchState, restoreHooks: boolean): void {
    for (const binding of state.bindings.values()) {
        binding.uniforms.lookup.value = null;
        binding.lookup.texture.dispose();
    }
    state.bindings.clear();
    state.compiledShaders.clear();
    material.removeEventListener('dispose', state.onDispose);

    if (restoreHooks && material.onBeforeCompile === state.wrappedOnBeforeCompile) {
        material.onBeforeCompile = state.previousOnBeforeCompile;
    }
    if (restoreHooks && material.customProgramCacheKey === state.wrappedProgramCacheKey) {
        material.customProgramCacheKey = state.previousProgramCacheKey;
    }
    materialStates.delete(material);
    if (!restoreHooks) materialUniforms.delete(material);
}

function ensurePatched(material: CompactUdimMaterial): MaterialPatchState {
    const existing = materialStates.get(material);
    if (existing) return existing;

    const previousOnBeforeCompile = Reflect.get(
        material,
        'onBeforeCompile',
    ) as THREE.Material['onBeforeCompile'];
    const previousProgramCacheKey = Reflect.get(
        material,
        'customProgramCacheKey',
    ) as THREE.Material['customProgramCacheKey'];
    const state = {} as MaterialPatchState;

    state.bindings = new Map();
    state.compiledShaders = new Set();
    state.previousOnBeforeCompile = previousOnBeforeCompile;
    state.previousProgramCacheKey = previousProgramCacheKey;
    state.wrappedOnBeforeCompile = (shader, renderer) => {
        previousOnBeforeCompile.call(material, shader, renderer);
        applyCompactUdimAtlasShader(material, shader as ShaderLike);
    };
    state.wrappedProgramCacheKey = () => {
        return `${previousProgramCacheKey.call(material)}${compactUdimProgramCacheKey(material)}`;
    };
    state.onDispose = () => cleanupState(material, state, false);

    material.onBeforeCompile = state.wrappedOnBeforeCompile;
    material.customProgramCacheKey = state.wrappedProgramCacheKey;
    material.addEventListener('dispose', state.onDispose);
    materialStates.set(material, state);
    return state;
}

function setMaterialTexture(
    material: CompactUdimMaterial,
    slot: CompactUdimTextureSlot,
    texture: THREE.Texture | null,
): void {
    (material as unknown as Record<CompactUdimTextureSlot, THREE.Texture | null>)[slot] = texture;
}

/**
 * Assigns one atlas to one or more standard-material slots and installs the
 * shader patch. The atlas texture remains caller-owned; lookup textures are
 * disposed automatically with the material or by `detachCompactUdimAtlas`.
 */
export function attachCompactUdimAtlas<T extends CompactUdimMaterial>(
    material: T,
    slots: CompactUdimTextureSlot | readonly CompactUdimTextureSlot[],
    atlas: THREE.Texture,
    metadata: CompactUdimAtlasMetadata,
): T {
    assertSupportedMaterial(material);
    const normalized = normalizedMetadata(metadata);
    const selectedSlots = typeof slots === 'string' ? [slots] : [...new Set(slots)];
    if (selectedSlots.length === 0) throw new RangeError('at least one texture slot is required');

    attachCompactUdimAtlasMetadata(atlas, normalized);
    configureAtlasTexture(atlas);
    const state = ensurePatched(material);

    for (const slot of selectedSlots) {
        if (!COMPACT_UDIM_TEXTURE_SLOTS.includes(slot)) {
            throw new TypeError(`unsupported compact UDIM texture slot: ${String(slot)}`);
        }
        const previous = state.bindings.get(slot);
        const binding: AtlasBinding = {
            atlas,
            metadata: normalized,
            lookup: createCompactUdimLookupTexture(normalized),
            uniforms: uniformsFor(material, slot),
        };
        binding.uniforms.lookup.value = binding.lookup.texture;
        binding.uniforms.lookupWidth.value = binding.lookup.width;
        binding.uniforms.atlasInfo.value.set(
            normalized.atlasWidth, normalized.atlasHeight,
            normalized.tileResolution, normalized.gutter,
        );
        state.bindings.set(slot, binding);
        setMaterialTexture(material, slot, atlas);

        for (const shader of state.compiledShaders) updateShaderUniform(shader, slot, binding);
        previous?.lookup.texture.dispose();
    }

    material.needsUpdate = true;
    return material;
}

/** Removes selected bindings without disposing the caller-owned atlas image. */
export function detachCompactUdimAtlas(
    material: CompactUdimMaterial,
    slots?: CompactUdimTextureSlot | readonly CompactUdimTextureSlot[],
): void {
    const state = materialStates.get(material);
    if (!state) return;

    const selectedSlots = slots === undefined
        ? [...state.bindings.keys()]
        : typeof slots === 'string'
            ? [slots]
            : [...new Set(slots)];

    for (const slot of selectedSlots) {
        const binding = state.bindings.get(slot);
        if (!binding) continue;
        if (material[slot] === binding.atlas) setMaterialTexture(material, slot, null);
        binding.uniforms.lookup.value = null;
        binding.lookup.texture.dispose();
        state.bindings.delete(slot);
    }

    if (state.bindings.size === 0) cleanupState(material, state, true);
    material.needsUpdate = true;
}
