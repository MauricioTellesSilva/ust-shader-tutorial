// Wireframe — geração de geometria "quad" (smart edges) + skinning na GPU para as linhas.
//
// O modo quad, quando aplicado a uma malha com esqueleto, não recalcula a posição de
// cada vértice da linha na CPU a cada frame. A linha carrega apenas a geometria em
// bind-pose (posição original) + skinIndex/skinWeight, e o skinning é feito 100% na
// GPU através de um vertex shader — exatamente como o Three.js já faz nativamente
// para SkinnedMesh.
import * as THREE from 'three';

// Gera segmentos de linha que representam as arestas "reais" de quads dentro de uma
// malha já triangulada, escondendo a diagonal interna de cada quad. Assume que
// exportadores de FBX/OBJ/GLTF emitem os 2 triângulos resultantes da triangulação de
// um quad de forma consecutiva no buffer de índices: percorre os triângulos em pares
// (i, i+1, i+2) e (i+3, i+4, i+5); se compartilharem exatamente 2 vértices (por
// posição), trata-os como um quad e desenha só as 4 arestas externas (ignorando a
// diagonal partilhada). Caso não compartilhem, trata cada um como um triângulo real.
export function generateQuadWireframeGeometry(geometry: THREE.BufferGeometry, preserveSeams = false): THREE.BufferGeometry {
    const position = geometry.attributes.position;
    if (!position) return new THREE.BufferGeometry();
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const edgeSet = new Set<string>();
    const sourceIndices: number[] = [];
    const lineGroups: THREE.BufferGeometry['groups'] = [];
    let materialIndex = 0;
    const materialAt = (offset: number) => geometry.groups.find(g => offset >= g.start && offset < g.start + g.count)?.materialIndex ?? 0;

    function coordsEqual(idx1: number, idx2: number) {
        if (preserveSeams) return idx1 === idx2;
        const x1 = position.getX(idx1), y1 = position.getY(idx1), z1 = position.getZ(idx1);
        const x2 = position.getX(idx2), y2 = position.getY(idx2), z2 = position.getZ(idx2);
        return Math.abs(x1 - x2) < 0.0001 && Math.abs(y1 - y2) < 0.0001 && Math.abs(z1 - z2) < 0.0001;
    }

    function pushVertex(idx: number) {
        sourceIndices.push(idx);
    }

    function addEdgeGeometry(idx1: number, idx2: number) {
        const x1 = Math.round(position.getX(idx1) * 10000); const y1 = Math.round(position.getY(idx1) * 10000); const z1 = Math.round(position.getZ(idx1) * 10000);
        const x2 = Math.round(position.getX(idx2) * 10000); const y2 = Math.round(position.getY(idx2) * 10000); const z2 = Math.round(position.getZ(idx2) * 10000);
        const k1 = `${x1},${y1},${z1}`; const k2 = `${x2},${y2},${z2}`;
        const edge = preserveSeams ? `${Math.min(idx1, idx2)}_${Math.max(idx1, idx2)}` : k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
        const key = `${materialIndex}:${edge}`;
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            const group = lineGroups.at(-1);
            if (group?.materialIndex === materialIndex) group.count += 2;
            else lineGroups.push({ start: sourceIndices.length, count: 2, materialIndex });
            pushVertex(idx1);
            pushVertex(idx2);
        }
    }

    const end = Math.min(count, geometry.drawRange.start + geometry.drawRange.count);
    let i = Math.max(0, Math.ceil(geometry.drawRange.start / 3) * 3);
    while (i + 2 < end) {
        materialIndex = materialAt(i);
        if (i + 5 < end && materialAt(i + 3) === materialIndex) {
            const a0 = index ? index.getX(i) : i; const a1 = index ? index.getX(i + 1) : i + 1; const a2 = index ? index.getX(i + 2) : i + 2;
            const b0 = index ? index.getX(i + 3) : i + 3; const b1 = index ? index.getX(i + 4) : i + 4; const b2 = index ? index.getX(i + 5) : i + 5;
            const setA = [a0, a1, a2]; const setB = [b0, b1, b2];
            const sharedA: number[] = []; const sharedB: number[] = [];
            for (const valA of setA) {
                for (const valB of setB) {
                    if (coordsEqual(valA, valB)) {
                        sharedA.push(valA); sharedB.push(valB); break;
                    }
                }
            }

            if (sharedA.length === 2) {
                if (!(sharedA.includes(a0) && sharedA.includes(a1))) addEdgeGeometry(a0, a1);
                if (!(sharedA.includes(a1) && sharedA.includes(a2))) addEdgeGeometry(a1, a2);
                if (!(sharedA.includes(a2) && sharedA.includes(a0))) addEdgeGeometry(a2, a0);
                if (!(sharedB.includes(b0) && sharedB.includes(b1))) addEdgeGeometry(b0, b1);
                if (!(sharedB.includes(b1) && sharedB.includes(b2))) addEdgeGeometry(b1, b2);
                if (!(sharedB.includes(b2) && sharedB.includes(b0))) addEdgeGeometry(b2, b0);
                i += 6;
            } else {
                addEdgeGeometry(a0, a1); addEdgeGeometry(a1, a2); addEdgeGeometry(a2, a0);
                i += 3;
            }
        } else {
            const a0 = index ? index.getX(i) : i; const a1 = index ? index.getX(i + 1) : i + 1; const a2 = index ? index.getX(i + 2) : i + 2;
            addEdgeGeometry(a0, a1); addEdgeGeometry(a1, a2); addEdgeGeometry(a2, a0);
            i += 3;
        }
    }

    const lineGeo = new THREE.BufferGeometry();

    // Keep height sampling and morph deformation identical to the source mesh.
    const copy = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
        const array = new Float32Array(sourceIndices.length * attr.itemSize);
        for (let at = 0; at < sourceIndices.length; at++) for (let k = 0; k < attr.itemSize; k++) {
            array[at * attr.itemSize + k] = attr.getComponent(sourceIndices[at], k);
        }
        const copied = new THREE.BufferAttribute(array, attr.itemSize);
        copied.name = attr.name;
        return copied;
    };
    for (const [key, attr] of Object.entries(geometry.attributes)) lineGeo.setAttribute(key, copy(attr));
    lineGeo.morphAttributes = Object.fromEntries(Object.entries(geometry.morphAttributes).map(([key, list]) => [key, list.map(copy)]));
    lineGeo.morphTargetsRelative = geometry.morphTargetsRelative;
    if (geometry.groups.length) lineGeo.groups = lineGroups;

    return lineGeo;
}

export function updateWireframeVisibility(model: THREE.Object3D | null, isWireframe: boolean, isQuadMode: boolean) {
    if (!model) return;
    model.traverse((child) => {
        if (child.name === 'wireTris') child.visible = isWireframe && !isQuadMode;
        if (child.name === 'wireQuads') child.visible = isWireframe && isQuadMode;
    });
}

/**
 * O contorno do wireframe é desenhado exactamente sobre a superfície que cobre — os
 * mesmos vértices, a mesma matriz, o mesmo skinning — e mesmo assim perdia mais de um
 * quarto dos seus píxeis.
 *
 * A profundidade de um píxel de linha e a do triângulo por baixo não saem do mesmo
 * caminho: GL_LINES interpola ao longo do segmento, GL_TRIANGLES interpola sobre a
 * face. Num píxel de frente para a câmara os dois valores caem a uma fracção de
 * unidade de profundidade um do outro, para um lado ou para o outro conforme o
 * arredondamento, e o LessEqualDepth fica com a linha só quando ela calhou no valor da
 * superfície ou abaixo dele. É cara ou coroa — daí desaparecer perto de metade da
 * grelha.
 *
 * Que se trata de um empate, e não de a linha estar mesmo atrás da superfície,
 * mede-se varrendo o viés pelos dois lados (Liz_1712.fbx animada, modo quad, píxeis de
 * linha na superfície própria de cada malha): −1e-7 perde 1,5% e +1e-7 ganha 1,5%;
 * −1e-6 perde 10,2% e +1e-6 ganha 9,1%. E os píxeis perdidos são os de frente para a
 * câmara, não os de raspão: com −1e-5 os de |n·v| ≥ 0,75 caem de 43 581 para 5 628
 * (−87%) e os de |n·v| < 0,15 só descem de 5 465 para 5 206 (−5%). Os de raspão têm
 * margem de profundidade a sério; os de frente estavam no fio da navalha.
 *
 * O remédio habitual é o polygon offset, que aqui não serve: o three só liga
 * POLYGON_OFFSET_FILL, e os dois contornos rasterizam como GL_LINES.
 *
 * O valor saiu da medição. Contando, por viés, os píxeis de linha na superfície
 * própria de cada malha e os que caem sobre OUTRA malha — a linha de uma parte
 * escondida a atravessar a que está à frente —, no enquadramento que o carregador
 * monta:
 *
 *     viés    linhas     fuga    linhas ganhas por píxel de fuga
 *     3e-6    +17,9%    +6,7%        9
 *     5e-6    +23,1%    +7,0%      142
 *     7e-6    +26,3%    +7,0%     2895
 *     1e-5    +29,6%   +11,1%        7
 *     2e-5    +34,2%   +22,2%        2
 *     1e-4    +46,4%   +242%          0,4
 *
 * O penhasco é logo a seguir a 7e-6, e o modo tris concorda (+25,1% de linhas por
 * +2,4% de fuga). Na malha que mais sofre, a corpo_low, 1e-4 traz mais 451 píxeis de
 * linha do que 7e-6 e multiplica a fuga dela por 27, de 477 para 12 745.
 *
 * Subtrair `viés * gl_Position.w` a `gl_Position.z` é um deslocamento constante em
 * NDC, por isso não depende das unidades do ficheiro — e o carregador normaliza tudo
 * para CAMERA.targetModelSize, logo assenta igual em qualquer modelo. Não é
 * independente da distância da câmara, e é isso que trava o valor: um passo fixo em
 * NDC é um passo no mundo proporcional a d², e com a câmara a 21,7 unidades 7e-6 custa
 * +45% de fuga enquanto 1e-5 já custa +123%.
 */
export const WIREFRAME_DEPTH_BIAS = 7e-6;

/**
 * Põe o contorno um fio à frente da superfície, o suficiente para ganhar o empate de
 * profundidade. Compõe-se com um `onBeforeCompile` que o material já tenha, e leva a
 * chave de cache do programa com ele: o three procura o programa compilado por essa
 * chave *antes* de chamar o `onBeforeCompile` (WebGLRenderer.js), por isso sem a chave
 * dois materiais com injecções diferentes podiam acabar a partilhar o mesmo programa.
 */
export function applyWireframeDepthBias<T extends THREE.Material>(material: T): T {
    const anterior = material.onBeforeCompile.bind(material);
    const chaveAnterior = material.customProgramCacheKey();

    material.onBeforeCompile = (shader, renderer) => {
        anterior(shader, renderer);
        // O <fog_vertex> é a última linha do main e já vem depois do <project_vertex>,
        // que é quem põe o gl_Position.
        shader.vertexShader = shader.vertexShader.replace(
            '#include <fog_vertex>',
            `#include <fog_vertex>
            gl_Position.z -= ${WIREFRAME_DEPTH_BIAS.toExponential()} * gl_Position.w;`,
        );
    };
    material.customProgramCacheKey = () => `${chaveAnterior}|wireframeDepthBias:${WIREFRAME_DEPTH_BIAS}`;

    return material;
}

// Cache de materiais de linha com skinning por cor, para não recompilar um shader novo
// a cada wireQuads criado com a mesma cor.
const skinnedLineMaterialCache = new Map<string, THREE.LineBasicMaterial>();

// Cria (ou reaproveita do cache) um LineBasicMaterial capaz de aplicar skinning na GPU
// via onBeforeCompile, injetando os chunks nativos de skinning do Three.js.
export function createSkinnedLineMaterial(color: THREE.ColorRepresentation = 0xffffff, opacity = 1) {
    const key = `${new THREE.Color(color).getHexString()}_${opacity}`;
    const cached = skinnedLineMaterialCache.get(key);
    if (cached) return cached;

    const mat = new THREE.LineBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthTest: true,
    });
    (mat as unknown as { skinning: boolean }).skinning = true;

    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            #include <skinning_pars_vertex>`
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            #include <skinbase_vertex>
            #include <skinning_vertex>`
        );
    };

    // O mesmo papel de contorno, o mesmo empate de profundidade a resolver.
    applyWireframeDepthBias(mat);

    skinnedLineMaterialCache.set(key, mat);
    return mat;
}

export function clearSkinnedLineMaterialCache() {
    skinnedLineMaterialCache.forEach((mat) => mat.dispose());
    skinnedLineMaterialCache.clear();
}

// "Transforma" um LineSegments comum em algo que a WebGLRenderer trata como skinned na
// hora de decidir as defines do shader (USE_SKINNING, BONE_TEXTURE etc.) e de alimentar
// os uniforms bindMatrix/bindMatrixInverse/boneTexture.
//
// É também isto que faz a pose chegar à linha a cada frame: o renderer chama
// `skeleton.update()` para cada objecto skinned que desenha, uma vez por esqueleto por
// frame (WebGLObjects.update), já depois de o mixer andar e de as matrizes do mundo
// estarem actualizadas. Houve aqui uma função chamada a cada frame
// (`updateAnimatedWireframes`) que percorria o modelo inteiro para fazer esse mesmo
// `skeleton.update()` antes do desenho — com as matrizes do frame anterior, que o
// renderer reescrevia logo a seguir. Não mudava um pixel (confirmado comparando o
// framebuffer com e sem ela) e, numa FBX de 13 malhas, custava ~0,7 ms a cada quatro
// frames.
export function bindWireframeSkinning(wireQuads: THREE.LineSegments, sourceSkinnedMesh: THREE.SkinnedMesh) {
    if (!wireQuads || !sourceSkinnedMesh?.isSkinnedMesh) return;
    if (!wireQuads.geometry.attributes.skinIndex) return;

    const skinned = wireQuads as unknown as {
        isSkinnedMesh: boolean;
        skeleton: THREE.Skeleton;
        bindMatrix: THREE.Matrix4;
        bindMatrixInverse: THREE.Matrix4;
    };
    skinned.isSkinnedMesh = true;
    skinned.skeleton = sourceSkinnedMesh.skeleton;
    skinned.bindMatrix = sourceSkinnedMesh.bindMatrix;
    skinned.bindMatrixInverse = sourceSkinnedMesh.bindMatrixInverse;

    // A bounding sphere/box da geometria foi calculada com os vértices em bind-pose.
    // Como o deslocamento acontece só na GPU, essa bounding volume nunca é atualizada,
    // então o frustum culling automático teria de ser desligado manualmente (um
    // THREE.SkinnedMesh de verdade já faz isso por padrão).
    wireQuads.frustumCulled = false;

    const material = wireQuads.material as THREE.LineBasicMaterial | undefined;
    if (!material || !material.onBeforeCompile) {
        const baseColor = material?.color ? material.color.getHex() : 0xffffff;
        wireQuads.material = createSkinnedLineMaterial(baseColor);
    }

    wireQuads.userData.sourceSkinnedMesh = sourceSkinnedMesh;
}
