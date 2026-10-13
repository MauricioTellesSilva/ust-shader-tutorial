import { tr as uiText } from '../../../i18n';
/**
 * Grafos gravados por versões anteriores.
 *
 * Um projeto guardado hoje tem de abrir daqui a dois anos, com um formato que
 * entretanto mudou. A alternativa a isto é recusar o grafo antigo — e recusar
 * um grafo é perder um material que alguém montou.
 *
 *     grafo gravado → detectar versão → migrar → validar → editor
 *
 * As migrações são uma cadeia de passos de uma versão para a seguinte, e não
 * uma função que sabe converter qualquer versão em qualquer outra. Um passo por
 * mudança de formato: quem escrever a versão 3 escreve `2 → 3` e não precisa de
 * saber o que a 1 era, porque o passo `1 → 2` já correu.
 *
 * ## Nada é deitado fora em silêncio
 *
 * Um passo que não saiba tratar de alguma coisa deixa nota disso. As notas
 * sobem até quem chamou, que decide o que fazer com elas — mostrar um aviso,
 * escrever na consola em desenvolvimento — em vez de o problema desaparecer
 * dentro desta camada.
 */
import { GRAPH_VERSION } from './types';

/** Um passo de uma versão para a seguinte. Recebe e devolve dados em bruto. */
export type GraphMigration = (raw: Record<string, unknown>, note: (text: string) => void)
=> Record<string, unknown>;

/**
 * Os passos, pela versão de onde partem.
 *
 * Vazio nesta versão, e é isso que se espera: o formato ainda só teve uma. A
 * tabela existe para que a segunda tenha onde entrar sem que ninguém tenha de
 * inventar o mecanismo com o problema já em cima.
 *
 * Para acrescentar um passo — digamos, quando o `graphVersion` passar a 2:
 *
 *     export const MIGRATIONS: Record<number, GraphMigration> = {
 *         1: (raw, note) => { ...; return raw; },
 *     };
 */
export const MIGRATIONS: Record<number, GraphMigration> = {};

export interface MigrationResult {
    raw: Record<string, unknown>;
    /** A versão que o grafo declarava. */
    from: number;
    /** A versão em que ficou. Igual a `GRAPH_VERSION` quando correu tudo. */
    to: number;
    notes: string[];
}

/**
 * A versão que um grafo em bruto declara.
 *
 * Aceita `graphVersion` — o nome que os projetos gravados usam — e também
 * `version`, porque é o nome óbvio e mais vale lê-lo do que rejeitar um
 * ficheiro por causa dele. Grava-se sempre `graphVersion`: mudar o nome do
 * campo partiria tudo o que já está guardado, e o ganho seria nenhum.
 */
export function readVersion(raw: Record<string, unknown>): number {
    for (const key of ['graphVersion', 'version']) {
        const value = raw[key];
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
    }

    // Sem versão declarada vale a primeira: os grafos gravados antes de o campo
    // existir são todos dessa, e trata-los como "desconhecidos" era recusar os
    // mais antigos por não dizerem o que na altura era único.
    return 1;
}

/**
 * Leva um grafo em bruto até à versão actual.
 *
 * A cadeia entra por parâmetro para se poder testar sem mexer na tabela real —
 * um teste que registasse passos verdadeiros ficaria a testar o que ele próprio
 * escreveu, e a tabela real ficaria suja.
 */
export function migrateGraph(
    raw: Record<string, unknown>,
    chain: Record<number, GraphMigration> = MIGRATIONS,
    target: number = GRAPH_VERSION,
): MigrationResult {
    const notes: string[] = [];
    const note = (text: string) => notes.push(text);

    const from = readVersion(raw);
    let current = from;
    let data = raw;

    if (current > target) {
        // Um grafo do futuro: gravado por uma versão da aplicação mais recente
        // do que esta. Não se inventa uma conversão para trás — devolve-se como
        // está, com nota, e é a validação que decide o que dele se aproveita.
        notes.push(uiText("O material foi gravado por uma versão mais recente ({value0}).", { value0: String(current) }));
        return { raw: data, from, to: current, notes };
    }

    while (current < target) {
        const step = chain[current];

        if (!step) {
            notes.push(uiText("Não há passo de migração da versão {value0} para a {value1}.", { value0: String(current), value1: String(current + 1) }));
            return { raw: data, from, to: current, notes };
        }

        data = step(data, note);
        current += 1;
    }

    return { raw: { ...data, graphVersion: target }, from, to: current, notes };
}
