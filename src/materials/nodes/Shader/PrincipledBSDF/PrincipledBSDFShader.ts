/**
 * O Principled na placa gráfica.
 *
 * Não há shader nenhum a gerar aqui: o Principled é o sítio onde o grafo
 * termina, e o que ele faz é dizer, para cada canal do material, qual das suas
 * entradas o alimenta. Quem escreve GLSL são os nós que estão atrás dele.
 *
 * O compilador chama isto e não sabe o que um Principled é — ver `emitSurface`
 * em `NodeDefinition`. É por essa porta que um shader diferente, com outras
 * entradas, pode entrar sem que o compilador mude.
 */
import type { ChannelId, EmitContext } from '../../core/types';

/**
 * O canal e a entrada têm o mesmo nome, e a tabela existe à mesma.
 *
 * Escrever `ctx.input(channel)` funcionava hoje e passava a estar errado no dia
 * em que um canal deixasse de ter uma entrada com o mesmo nome — e falharia em
 * silêncio, com o canal a ler um uniform que ninguém alimenta.
 */
const SOCKET_OF: Record<ChannelId, string> = {
    baseColor: 'baseColor',
    roughness: 'roughness',
    metallic: 'metallic',
    emission: 'emission',
    alpha: 'alpha',
};

export function emitPrincipled(ctx: EmitContext, channel: ChannelId): string {
    return ctx.input(SOCKET_OF[channel]);
}
