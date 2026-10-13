import { tr as uiText } from '../../i18n';
import { checkConnection, NODE_MATERIAL_OUTPUT, NODE_TEXTURE, type MaterialGraph } from '../../materials/nodes';
import { reliefHeightImages } from '../../materials/nodes/geometry/reliefSettings';

export function graphDiagnostics(graph: MaterialGraph, assets: readonly { id: string }[], loaded?: (id: string) => boolean): string[] {
    const warnings: string[] = [];
    const output = graph.nodes.find(n => n.type === NODE_MATERIAL_OUTPUT);
    if (!output) warnings.push(uiText('Falta o Material Output.'));
    else if (!graph.connections.some(c => c.targetNode === output.id && c.targetSocket === 'surface')) warnings.push(uiText('Ligue um shader ao Material Output.'));
    for (const connection of graph.connections) {
        const result = checkConnection({ ...graph, connections: graph.connections.filter(c => c.id !== connection.id) }, connection);
        const message = result.message ?? uiText("Ligação inválida.");
        if (!result.ok && !warnings.includes(message)) warnings.push(message);
    }
    if (graph.nodes.some(n => n.type === NODE_TEXTURE && typeof n.properties.assetId === 'string'
        && !assets.some(a => a.id === n.properties.assetId))) warnings.push(uiText("Uma Image Texture refere uma textura indisponível."));
    if (reliefHeightImages(graph).some(n => typeof n.properties.assetId !== 'string'
        || !assets.some(a => a.id === n.properties.assetId) || (loaded && !loaded(n.properties.assetId as string)))) {
        warnings.push(uiText('Uma imagem de altura está ausente ou carregando. O relevo dessa cadeia ficará desativado até ela estar disponível.'));
    }
    return warnings;
}
