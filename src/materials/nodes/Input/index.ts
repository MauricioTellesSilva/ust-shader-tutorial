/**
 * Os nós de entrada.
 *
 * Valores que não vêm de nenhum cálculo: um número escrito, uma cor escolhida.
 * A cor constante vive em `Color/RGBColor` por ser um nó de cor antes de ser um
 * nó de entrada — a pasta segue o que o nó **é**, e não onde ele costuma estar
 * no grafo.
 */
import type { NodeDefinition } from '../core/types';
import { value } from './Value/Value';

export { NODE_VALUE } from './Value/Value';

export const inputNodes: NodeDefinition[] = [value];
