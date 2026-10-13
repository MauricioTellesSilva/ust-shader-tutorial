/**
 * Principled BSDF — a superfície que quase todos os materiais são.
 *
 * Não calcula iluminação nenhuma: descreve os parâmetros com que o
 * `MeshStandardMaterial` do Three.js já sabe iluminar. Escrever aqui um modelo
 * de reflexão nosso era substituir uma coisa afinada durante anos por outra que
 * teria de o ser outra vez.
 *
 * As entradas têm os nomes dos canais do material de propósito — ver
 * `MATERIAL_CHANNELS`. É essa coincidência que deixa a interface saber que o
 * deslizador da rugosidade corresponde a esta entrada, sem uma tabela de
 * correspondências a ter de ser mantida em três sítios.
 */
import {
    defaultSurface,
    type EvalContext,
    type NodeDefinition,
    type Resolved,
    type SurfaceValue,
} from '../../core/types';
import { emitPrincipled } from './PrincipledBSDFShader';

export const NODE_PRINCIPLED = 'principledBsdf';

/**
 * As entradas numéricas, e onde cada uma cai na descrição do material.
 *
 * Uma lista, e não cinco ramos de código: é o que faz a entrada seguinte ser
 * uma linha aqui em vez de mais um caso a tratar. `textureKey` só existe para
 * as que aceitam uma imagem — a emissão e o alfa não têm canal de textura no
 * material padrão, e prometer um seria prometer o que não se cumpre.
 */
const NUMERIC: {
    socket: string;
    key: 'roughness' | 'metallic' | 'emissiveStrength' | 'opacity';
    textureKey?: 'roughnessTexture' | 'metallicTexture';
}[] = [
    { socket: 'roughness', key: 'roughness', textureKey: 'roughnessTexture' },
    { socket: 'metallic', key: 'metallic', textureKey: 'metallicTexture' },
    { socket: 'emission', key: 'emissiveStrength' },
    { socket: 'alpha', key: 'opacity' },
];

function evaluate(ctx: EvalContext): Record<string, Resolved> {
    const surface: SurfaceValue = defaultSurface();

    // ── Cor base ─────────────────────────────────────────────────────────
    const base = ctx.incoming('baseColor');
    surface.baseColor = base?.color ?? ctx.rgb('baseColor');
    surface.baseColorTexture = base?.texture ?? null;
    surface.baseColorSRGB = base?.isSRGB;

    // ── Números ──────────────────────────────────────────────────────────
    for (const entry of NUMERIC) {
        surface[entry.key] = ctx.float(entry.socket);

        const arriving = ctx.incoming(entry.socket);
        if (entry.socket === 'roughness') surface.roughnessSRGB = arriving?.isSRGB;
        if (entry.socket === 'metallic') surface.metallicSRGB = arriving?.isSRGB;
        if (entry.textureKey && arriving?.texture) surface[entry.textureKey] = arriving.texture;
    }

    // ── Normal ───────────────────────────────────────────────────────────
    //
    // Só através de um Normal Map. Uma imagem RGB ligada aqui seria tratada
    // como cor e o resultado é uma superfície com relevo errado — daí o tipo
    // NORMAL existir e só sair daquele nó.
    const normal = ctx.incoming('normal');
    if (normal?.normal) {
        surface.normalTexture = normal.normal.texture;
        surface.normalStrength = normal.normal.strength;
    }

    return { bsdf: { surface } };
}

export const principledBsdf: NodeDefinition = {
    type: NODE_PRINCIPLED,
    label: 'Principled BSDF',
    category: 'shader',
    inputs: [
        { id: 'baseColor', label: 'Base Color', type: 'COLOR', defaultValue: { r: 0.8, g: 0.8, b: 0.8 } },
        { id: 'metallic', label: 'Metallic', type: 'FLOAT', defaultValue: 0, min: 0, max: 1, step: 0.01 },
        { id: 'roughness', label: 'Roughness', type: 'FLOAT', defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
        { id: 'emission', label: 'Emission', type: 'FLOAT', defaultValue: 0, min: 0, max: 5, step: 0.01 },
        { id: 'alpha', label: 'Alpha', type: 'FLOAT', defaultValue: 1, min: 0, max: 1, step: 0.01 },
        // A normal desligada quer dizer "a geometria como está" — não é um
        // valor, e por isso não tem nenhum.
        { id: 'normal', label: 'Normal', type: 'NORMAL', defaultValue: null },
    ],
    outputs: [{ id: 'bsdf', label: 'BSDF', type: 'BSDF' }],
    evaluate,
    emitSurface: emitPrincipled,
    emitNormal: ctx => ctx.input('normal'),
};
