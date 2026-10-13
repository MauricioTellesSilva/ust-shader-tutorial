/**
 * Da descrição de material para o material do Three.js.
 *
 * É a única camada do sistema de nós que toca no Three.js, e mesmo assim não
 * cria nada de novo: escreve no `MeshStandardMaterial` que o `ModelLoader` já
 * fez, o mesmo que o fluxo original usa. Um material próprio para os nós daria
 * duas classes a manter e duas maneiras de o mesmo modelo se ver.
 *
 * As texturas passam pelo `applyTextureToSlot` de sempre, que é quem sabe do
 * espaço de cor, do UDIM, do `flipY` e do registo no LOD. Reescrever isso para
 * os nós era garantir que os dois caminhos acabavam diferentes.
 *
 * ## Quando corre
 *
 * Quando o grafo muda, quando um efeito muda, quando uma textura muda e ao
 * abrir o projeto. Nunca por frame: reconstruir um material a cada frame é como
 * se transforma um deslizador numa apresentação de diapositivos.
 */
import * as THREE from 'three';

import { applyTextureToSlot } from '../../MaterialManager';
import { unregisterSlotLOD } from '../../../features/TextureLOD';
import { compileFromCache } from './compile';
import { MATERIAL_EFFECTS, type MaterialEffects } from './effects';
import { evaluateGraph } from './evaluate';
import { generatedNormalTexture, installProgram, type TextureResolver } from './program';
import { detachCompactUdimAtlas } from '../../CompactUdimAtlas';
import type { MaterialDefinition, MaterialGraph } from './types';
import { reliefHeightImages } from '../geometry/reliefSettings';
import { tr as uiText } from '../../../i18n';

export type { TextureResolver };

/**
 * Aplica a descrição a um material.
 *
 * Os efeitos entram por cima, mas só onde o grafo não manda: um parâmetro com
 * uma ligação vem do grafo e o deslizador é ignorado. É a mesma regra que a
 * interface mostra ao desactivar o controlo, escrita uma vez e usada nos dois
 * sítios.
 */
export function applyMaterialDefinition(
    material: THREE.MeshStandardMaterial,
    definition: MaterialDefinition,
    effects: MaterialEffects,
    resolveTexture: TextureResolver,
    generatedNormal = false,
): void {
    const driven = definition.driven ?? {};

    /** O valor a usar: o do grafo quando ligado, o do efeito quando não. */
    const valor = (socket: string | undefined, doGrafo: number, idDoEfeito: string): number => {
        if (socket && driven[socket]) return doGrafo;
        const efeito = effects[idDoEfeito];
        return typeof efeito === 'number' ? efeito : doGrafo;
    };

    const efeito = (id: string) => MATERIAL_EFFECTS.find((e) => e.id === id);

    // ── Cor base ────────────────────────────────────────────────────────
    material.color.setRGB(
        definition.baseColor.r,
        definition.baseColor.g,
        definition.baseColor.b,
    );

    // ── Números ─────────────────────────────────────────────────────────
    material.roughness = valor(efeito('roughness')?.socket, definition.roughness, 'roughness');
    material.metalness = valor(efeito('metallic')?.socket, definition.metallic, 'metallic');

    const emissao = valor(efeito('emissiveStrength')?.socket, definition.emissiveStrength, 'emissiveStrength');
    material.emissive.setRGB(emissao, emissao, emissao);
    material.emissiveIntensity = emissao > 0 ? 1 : 0;

    const opacidade = valor(efeito('opacity')?.socket, definition.opacity, 'opacity');
    material.opacity = opacidade;
    // `transparent` só quando é preciso: um material transparente é ordenado de
    // outra maneira e perde o teste de profundidade contra si próprio.
    material.transparent = opacidade < 1;

    material.envMapIntensity = typeof effects.envIntensity === 'number' ? effects.envIntensity : 1;

    // ── Texturas ────────────────────────────────────────────────────────
    aplicarTextura(material, 'map', definition.baseColorTexture, definition.baseColorSRGB ?? true, resolveTexture);
    aplicarTextura(material, 'roughnessMap', definition.roughnessTexture, definition.roughnessSRGB ?? false, resolveTexture);
    aplicarTextura(material, 'metalnessMap', definition.metallicTexture, definition.metallicSRGB ?? false, resolveTexture);
    if (generatedNormal) {
        unregisterSlotLOD(material, 'normalMap');
        if (material.normalMap !== generatedNormalTexture) {
            detachCompactUdimAtlas(material, 'normalMap');
            material.normalMap = generatedNormalTexture;
            material.normalMapType = THREE.TangentSpaceNormalMap;
            material.needsUpdate = true;
        }
    } else aplicarTextura(material, 'normalMap', definition.normalTexture, false, resolveTexture);

    // A força da normal vem do nó quando ele existe; do deslizador quando não.
    const forca = driven.normal
        ? definition.normalStrength
        : (typeof effects.normalStrength === 'number' ? effects.normalStrength : 1);
    material.normalScale.set(forca, forca);

    // Sem `needsUpdate` aqui, e é de propósito. Números e cores são uniforms
    // que o Three.js envia no frame seguinte sem lhe tocar no programa; marcar
    // o material como sujo a cada mexida num deslizador punha-o a passar pelo
    // caminho de reconstrução de programa por nada. Quem marca é o
    // `aplicarTextura`, que é quem muda o que o programa precisa de saber — uma
    // textura a entrar ou a sair muda os `#define` com que ele foi compilado.
}

/**
 * Põe — ou tira — uma textura de um canal.
 *
 * Tirar é tão importante como pôr: desligar um nó de textura tem de limpar o
 * canal, ou a imagem fica no material sem nada no grafo a explicá-la.
 */
function aplicarTextura(
    material: THREE.MeshStandardMaterial,
    slot: 'map' | 'roughnessMap' | 'metalnessMap' | 'normalMap',
    assetId: string | null,
    isSRGB: boolean,
    resolve: TextureResolver,
): void {
    if (!assetId) {
        unregisterSlotLOD(material, slot);
        detachCompactUdimAtlas(material, slot);
        const actual = material as unknown as Record<string, THREE.Texture | null>;
        if (actual[slot]) {
            actual[slot] = null;
            material.needsUpdate = true;
        }
        return;
    }

    const texture = resolve(assetId, isSRGB);
    if (!texture) return;

    // Já é esta: não se volta a aplicar. Reatribuir obriga o Three.js a
    // recompilar o programa por nada.
    const actual = material as unknown as Record<string, THREE.Texture | null>;
    if (actual[slot] === texture) return;

    // As dimensões UDIM são as que o material já tinha — quem as descobre é o
    // carregador de texturas, e este caminho não as reinventa.
    const dims = texture.userData.ndUdimDims ?? material.userData.udimDims ?? { u: 1, v: 1 };
    applyTextureToSlot(texture, slot, isSRGB, material, dims.u, dims.v);
}

/**
 * O caminho completo, do grafo ao material.
 *
 * Faz as três coisas pela ordem em que elas dependem umas das outras: avalia o
 * grafo no CPU, escreve o que daí sai no material, e instala — ou actualiza, ou
 * tira — o programa de shader dos canais que o grafo calcula por fragmento.
 *
 * ## Porque é que os dois caminhos convivem
 *
 * Porque fazem coisas diferentes. Uma imagem do projeto ligada à cor base é uma
 * textura num canal do material, e o Three.js já sabe tudo sobre isso — o
 * espaço de cor, o UDIM, o `flipY`, o LOD. Um ruído ligado à cor base não é uma
 * textura nenhuma: é uma conta por píxel, e a placa gráfica é que a faz. Obrigar
 * os dois ao mesmo caminho custava ou perder o que o `applyTextureToSlot` sabe,
 * ou gerar uma imagem no CPU a cada mexida num deslizador.
 *
 * Devolve `true` quando o material foi recompilado, que é o que os testes
 * precisam de ver para provar que mexer num número **não** recompila.
 */
export function applyGraph(
    material: THREE.MeshStandardMaterial,
    graph: MaterialGraph,
    effects: MaterialEffects,
    resolveTexture: TextureResolver,
): boolean {
    const program = compileFromCache(graph);
    const definition = evaluateGraph(graph);
    if (program?.normal) {
        // The normal stage handles each map in its chain exactly once.
        definition.normalTexture = null;
        definition.driven.normal = true;
    }
    applyMaterialDefinition(material, definition, effects, resolveTexture, !!program?.normal);

    material.userData.ndReliefGraph = graph;
    material.userData.ndReliefDiagnostics = reliefHeightImages(graph).some(n =>
        typeof n.properties.assetId !== 'string' || !resolveTexture(n.properties.assetId, false)?.image)
        ? [uiText('Uma imagem de altura está ausente ou carregando. O relevo dessa cadeia ficará desativado até ela estar disponível.')] : [];
    const recompiled = installProgram(material, program, graph, resolveTexture);

    // Um alfa calculado por fragmento pode ser qualquer coisa entre 0 e 1, e o
    // material tem de estar preparado para isso antes de o primeiro fragmento
    // aparecer — o valor guardado, que continua a ser 1, não o diria.
    if (program?.channels.alpha) material.transparent = true;

    return recompiled;
}
