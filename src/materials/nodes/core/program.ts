/**
 * Do programa gerado para o material do Three.js.
 *
 * É aqui — e só aqui — que o GLSL gerado encontra o renderizador. O material
 * continua a ser o `MeshStandardMaterial` que o `ModelLoader` criou: não há uma
 * classe de material nova, não há um segundo sistema de shaders, e toda a
 * iluminação física do Three.js fica exactamente como está. O que o grafo faz é
 * escrever em cinco sítios do fragmento — a cor difusa, a rugosidade, a
 * metalicidade, a emissão e o alfa — logo a seguir aos pedaços do Three.js que
 * os calculam.
 *
 *     onBeforeCompile → chunks do Three.js + linhas geradas → WebGL
 *
 * ## Recompilar é a excepção
 *
 * O programa é reinstalado quando a **estrutura** muda: um nó novo, uma ligação
 * nova, uma escolha fechada diferente. Mexer num número não é uma mudança de
 * estrutura — é o valor de um uniform, e escreve-se directamente no objeto que
 * o programa já está a ler. Sem isto, arrastar um deslizador de escala de ruído
 * recompilava um shader por cada píxel de movimento do rato.
 *
 * A chave da estrutura vai também para o `customProgramCacheKey`, para que dois
 * materiais com o mesmo grafo partilhem o programa que o Three.js compila.
 */
import * as THREE from 'three';
import {
    applyCompactUdimAtlasShader,
    compactUdimProgramCacheKey,
    createCompactUdimLookupTexture,
    getCompactUdimAtlasMetadata,
} from '../../CompactUdimAtlas';

import type { CompiledProgram } from './compile';
import { uniformValue } from './compile';
import type { ChannelId, MaterialGraph } from './types';

/** Como o chamador entrega uma textura já carregada, pelo id do asset. */
export type TextureResolver = (assetId: string, isSRGB?: boolean) => THREE.Texture | undefined;

/** O que fica guardado no material para se poder actualizar sem recompilar. */
interface Installed {
    key: string;
    uniforms: Record<string, THREE.IUniform>;
    program: CompiledProgram;
    lookups: Map<string, { texture: THREE.Texture; lookup: THREE.DataTexture }>;
    onDispose: () => void;
}

const fallbackTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
fallbackTexture.colorSpace = THREE.NoColorSpace;
fallbackTexture.needsUpdate = true;
// Enables Three.js's tangent frame (including precomputed tangents, skinning,
// morphing and back faces). Its normal-map sampling chunk is skipped below.
export const generatedNormalTexture = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
generatedNormalTexture.colorSpace = THREE.NoColorSpace;
generatedNormalTexture.needsUpdate = true;

export function patchDisplacementVertex(program: CompiledProgram, vertexShader: string): string {
    const stage = program.displacement;
    if (!stage) return vertexShader;
    // Depth/distance and basic overlay shaders conditionally omit normals.
    let vertex = vertexShader
        .replace(/#ifdef USE_DISPLACEMENTMAP(\s+#include <beginnormal_vertex>)/, '#if 1$1')
        .replace('#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )', '#if 1');
    const offset = `\n${stage.body}\n\ttransformed += normalize( objectNormal ) * ( ${stage.expression} );\n`;
    const marker = vertex.includes('#include <displacementmap_vertex>') ? '#include <displacementmap_vertex>' : '#include <project_vertex>';
    vertex = vertex.replace(marker, marker === '#include <project_vertex>' ? `${offset}${marker}` : `${marker}${offset}`);
    return vertex.replace('void main() {', `${stage.prelude}\nvoid main() {`);
}

/**
 * O pedaço do Three.js onde o corpo gerado entra.
 *
 * O primeiro sítio do `main` onde `diffuseColor` já existe: as variáveis do
 * grafo têm de estar declaradas antes de qualquer canal as usar, e a rugosidade
 * e a metalicidade são lidas mais abaixo.
 */
const BODY_CHUNK = 'color_fragment';

/** Onde cada canal é escrito, e como. */
const PATCHES: Record<ChannelId, { chunk: string; write: (expr: string) => string }> = {
    baseColor: {
        chunk: 'color_fragment',
        write: (e) => `diffuseColor.rgb = ${e};`,
    },
    alpha: {
        chunk: 'color_fragment',
        write: (e) => `diffuseColor.a = ${e};`,
    },
    roughness: {
        chunk: 'roughnessmap_fragment',
        write: (e) => `roughnessFactor = ${e};`,
    },
    metallic: {
        chunk: 'metalnessmap_fragment',
        write: (e) => `metalnessFactor = ${e};`,
    },
    emission: {
        chunk: 'emissivemap_fragment',
        write: (e) => `totalEmissiveRadiance = vec3( ${e} );`,
    },
};

/**
 * As substituições, isoladas do material.
 *
 * Numa função à parte porque é a parte que se pode ver sem uma placa gráfica —
 * e porque é a mesma que se usa para produzir o texto final e o mandar
 * compilar a sério num browser. Duas cópias da mesma substituição eram duas
 * coisas que podiam deixar de concordar, e a que estivesse errada era a que
 * ninguém tinha corrido.
 */
export function patchShaders(
    program: CompiledProgram,
    vertexShader: string,
    fragmentShader: string,
): { vertexShader: string; fragmentShader: string } {
    const vertex = patchDisplacementVertex(program, vertexShader)
        .replace(
            'void main() {',
            `varying vec3 vNdPos;\nvarying vec2 vNdUv;\n${program.normal ? 'varying float vNdLocalScale;\n' : ''}void main() {`,
        )
        .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\n\tvNdPos = position;\n\tvNdUv = uv;${program.normal ? '\n\tvNdLocalScale = length( mat3( modelViewMatrix ) * normalize( objectNormal ) );' : ''}`,
        );

    let fragment = fragmentShader.replace(
        'void main() {',
        `${program.prelude}\nvoid main() {`,
    );

    // Uma escrita por pedaço do Three.js, e todas de uma vez.
    //
    // De uma vez porque duas substituições sobre o mesmo `#include` entram pela
    // ordem errada: a segunda encontra outra vez a linha original e enfia-se
    // **antes** do que a primeira tinha posto. Foi assim que a cor base passou
    // a ser escrita acima das variáveis que a calculam — um shader que não
    // compila, e que só um browser a sério apanha.
    const writes = new Map<string, string[]>();

    for (const [channel, expr] of Object.entries(program.channels) as [ChannelId, string][]) {
        const patch = PATCHES[channel];
        const list = writes.get(patch.chunk) ?? [];
        list.push(`\t${patch.write(expr)}`);
        writes.set(patch.chunk, list);
    }

    for (const [chunk, lines] of writes) {
        // O corpo entra no `color_fragment`: é o primeiro sítio onde
        // `diffuseColor` já existe e ainda ninguém leu a rugosidade. As
        // variáveis ficam no âmbito do `main`, e por isso os canais escritos
        // nos pedaços seguintes alcançam-nas.
        const body = chunk === BODY_CHUNK ? `${program.body}\n` : '';

        fragment = fragment.replace(
            `#include <${chunk}>`,
            `#include <${chunk}>\n${body}${lines.join('\n')}`,
        );
    }

    // Um grafo que só escreva na rugosidade não passa pelo `color_fragment`, e
    // o corpo tem de entrar na mesma — é lá que estão as variáveis.
    if (!writes.has(BODY_CHUNK)) {
        fragment = fragment.replace(
            `#include <${BODY_CHUNK}>`,
            `#include <${BODY_CHUNK}>\n${program.body}`,
        );
    }

    if (program.normal) {
        fragment = fragment.replace('#include <normal_fragment_maps>',
            `vec3 ndBaseNormal = normal;\n${program.normal.body}\nnormal = ${program.normal.expression};`);
    }

    return { vertexShader: vertex, fragmentShader: fragment };
}

function installedOn(material: THREE.Material): Installed | null {
    const stored = material.userData.ndProgram;
    return stored && typeof stored === 'object' ? (stored as Installed) : null;
}

/**
 * Põe o programa no material, ou tira-o quando já não há nenhum.
 *
 * Devolve `true` quando o material foi mesmo recompilado — o chamador usa isso
 * para saber se vale a pena mexer em mais alguma coisa, e para o poder dizer
 * nos testes.
 */
export function installProgram(
    material: THREE.MeshStandardMaterial,
    program: CompiledProgram | null,
    graph: MaterialGraph,
    resolveTexture: TextureResolver,
): boolean {
    const current = installedOn(material);

    // ── Nada a instalar ──────────────────────────────────────────────────
    if (!program) {
        if (!current) return false;

        delete material.userData.ndProgram;
        current.onDispose();
        material.removeEventListener('dispose', current.onDispose);
        material.onBeforeCompile = (shader) => {
            applyCompactUdimAtlasShader(material, shader);
        };
        material.customProgramCacheKey = () => compactUdimProgramCacheKey(material);
        material.needsUpdate = true;
        return true;
    }

    // ── Já é este: só os valores ─────────────────────────────────────────
    //
    // O caminho que corre a cada mexida num deslizador, e o que faz este
    // sistema valer a pena. Sem recompilação, sem `needsUpdate`, sem uma
    // textura gerada no CPU: um número escrito num uniform que a placa gráfica
    // já está a ler.
    if (current && current.key === program.key) {
        current.program = program;
        updateUniforms(current, program, graph, resolveTexture);
        return false;
    }

    if (current) {
        current.onDispose();
        material.removeEventListener('dispose', current.onDispose);
    }
    const uniforms: Record<string, THREE.IUniform> = {};
    for (const binding of program.uniforms) {
        uniforms[binding.name] = { value: binding.type === 'vec3' ? new THREE.Color() : 0 };
    }
    for (const sampler of program.samplers) {
        uniforms[sampler.name] = { value: fallbackTexture };
        uniforms[`${sampler.name}Lookup`] = { value: fallbackTexture };
        uniforms[`${sampler.name}Transform`] = { value: new THREE.Matrix3() };
        uniforms[`${sampler.name}Atlas`] = { value: new THREE.Vector4(1, 1, 1, 0) };
        uniforms[`${sampler.name}Width`] = { value: 1 };
        uniforms[`${sampler.name}Compact`] = { value: 0 };
        uniforms[`${sampler.name}Ready`] = { value: 0 };
    }

    const installed: Installed = { key: program.key, uniforms, program, lookups: new Map(),
        onDispose: () => { for (const item of installed.lookups.values()) item.lookup.dispose(); installed.lookups.clear(); } };
    material.addEventListener('dispose', installed.onDispose);
    updateUniforms(installed, program, graph, resolveTexture);

    material.onBeforeCompile = (shader) => {
        // Os mesmos objetos de uniform que ficam guardados no material: é essa
        // partilha que faz escrever `.value` chegar ao programa em execução.
        Object.assign(shader.uniforms, uniforms);

        const patched = patchShaders(program, shader.vertexShader, shader.fragmentShader);
        shader.vertexShader = patched.vertexShader;
        shader.fragmentShader = patched.fragmentShader;
        applyCompactUdimAtlasShader(material, shader);
    };

    material.customProgramCacheKey = () => `${program.key}${compactUdimProgramCacheKey(material)}`;
    material.userData.ndProgram = installed;
    material.needsUpdate = true;

    return true;
}

/**
 * Escreve os valores actuais nos uniforms.
 *
 * Corre sempre — na instalação e a cada mudança que não seja de estrutura. As
 * cores passam por um `THREE.Color` porque é o que o Three.js sabe enviar como
 * `vec3`, e os valores vão tal e qual como estão guardados, sem conversão de
 * espaço de cor: é o mesmo que o caminho de sempre faz com `material.color`, e
 * dois caminhos com conversões diferentes davam duas cores diferentes para o
 * mesmo grafo.
 */
function updateUniforms(
    installed: Installed,
    program: CompiledProgram,
    graph: MaterialGraph,
    resolveTexture: TextureResolver,
): void {
    const { uniforms } = installed;
    for (const binding of program.uniforms) {
        const slot = uniforms[binding.name];
        if (!slot) continue;

        const value = uniformValue(graph, binding);

        if (binding.type === 'vec3' && typeof value === 'object') {
            if (slot.value instanceof THREE.Color) slot.value.setRGB(value.r, value.g, value.b);
            else slot.value = new THREE.Color(value.r, value.g, value.b);
        } else if (typeof value === 'number') {
            slot.value = value;
        }
    }

    for (const sampler of program.samplers) {
        const slot = uniforms[sampler.name];
        if (!slot) continue;

        const texture = resolveTexture(sampler.assetId, false);
        const available = !!texture && !!texture.image;
        slot.value = available ? texture : fallbackTexture;
        uniforms[`${sampler.name}Ready`].value = available ? 1 : 0;
        if (texture?.matrixAutoUpdate) texture.updateMatrix();
        (uniforms[`${sampler.name}Transform`].value as THREE.Matrix3).copy(texture?.matrix ?? new THREE.Matrix3());
        const atlas = available && texture ? getCompactUdimAtlasMetadata(texture) : undefined;
        const old = installed.lookups.get(sampler.name);
        if (old && old.texture !== texture) {
            old.lookup.dispose();
            installed.lookups.delete(sampler.name);
        }
        uniforms[`${sampler.name}Compact`].value = atlas ? 1 : 0;
        if (atlas && texture) {
            let binding = installed.lookups.get(sampler.name);
            if (!binding) {
                binding = { texture, lookup: createCompactUdimLookupTexture(atlas).texture };
                installed.lookups.set(sampler.name, binding);
            }
            uniforms[`${sampler.name}Lookup`].value = binding.lookup;
            uniforms[`${sampler.name}Width`].value = binding.lookup.image.width;
            (uniforms[`${sampler.name}Atlas`].value as THREE.Vector4).set(atlas.atlasWidth, atlas.atlasHeight, atlas.tileResolution, atlas.gutter);
        } else {
            uniforms[`${sampler.name}Lookup`].value = fallbackTexture;
        }
    }
}

interface VertexInstalled {
    key: string;
    uniforms: Record<string, THREE.IUniform>;
    previousCompile: THREE.Material['onBeforeCompile'];
    previousKey: THREE.Material['customProgramCacheKey'];
}
const vertexPrograms = new WeakMap<THREE.Material, VertexInstalled>();

/** Shadow/overlay stages share the current numeric and image values of a surface. */
export function installDisplacementPass(target: THREE.Material, source: THREE.Material | null): void {
    const installed = source ? installedOn(source) : null;
    const program = installed?.program;
    let current = vertexPrograms.get(target);
    if (!program?.displacement || !installed) {
        if (current) {
            target.onBeforeCompile = current.previousCompile;
            target.customProgramCacheKey = current.previousKey;
            target.needsUpdate = true;
            vertexPrograms.delete(target);
        }
        return;
    }
    if (current?.key === program.key) {
        for (const [name, uniform] of Object.entries(installed.uniforms)) {
            if (current.uniforms[name]) current.uniforms[name].value = uniform.value;
        }
        return;
    }
    const previousCompile = current?.previousCompile ?? Reflect.get(target, 'onBeforeCompile') as THREE.Material['onBeforeCompile'];
    const previousKey = current?.previousKey ?? Reflect.get(target, 'customProgramCacheKey') as THREE.Material['customProgramCacheKey'];
    const uniforms = Object.fromEntries(Object.entries(installed.uniforms).map(([name, uniform]) => [name, { value: uniform.value }]));
    current = { key: program.key, uniforms, previousCompile, previousKey };
    vertexPrograms.set(target, current);
    target.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(target, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = patchDisplacementVertex(program, shader.vertexShader);
    };
    target.customProgramCacheKey = () => `${previousKey.call(target)}|ndVertex:${program.key}`;
    target.needsUpdate = true;
}

/** O programa que está instalado num material, para os testes o poderem ver. */
export function installedKey(material: THREE.Material): string | null {
    return installedOn(material)?.key ?? null;
}

/** Os uniforms instalados, pelo nome. Existe para os testes e mais nada. */
export function installedUniforms(material: THREE.Material): Record<string, THREE.IUniform> {
    return installedOn(material)?.uniforms ?? {};
}
