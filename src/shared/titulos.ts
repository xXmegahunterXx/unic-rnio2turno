/**
 * Títulos das páginas de apuração por FASE (I07, busca) — fonte única para o servidor (meta tags, src/server/meta-tags.ts)
 * e para o app (título da aba, que o robô de busca lê depois de rodar o JavaScript: os dois precisam dizer o mesmo).
 *
 *  - antes da apuração: "Eleição 2026 em Campinas (SP): 1º turno e apuração do 2º turno";
 *  - durante: "Apuração ao vivo em Campinas (SP) · 2º turno 2026";
 *  - depois: "Resultado do 2º turno 2026 em Campinas (SP)";
 *  - 1º turno pedido na URL (`?race=pres-t1`): "1º turno 2026 em Campinas (SP): resultado oficial".
 *
 * Sem nome de candidato (nomes e números só na descrição). Puro (testado em titulos.test.ts).
 */
import { APP_NAME } from './constants';
import type { Fase, UF } from './types';

/** Momento de uma página de apuração: a corrida de 1º turno pedida é sempre o resultado oficial; senão, a fase pública. */
export type MomentoTitulo = 't1' | Fase;

/** Momento a partir da corrida PEDIDA (não a exibida: antes da apuração a página mostra o 1º turno sozinha). */
export function momentoTitulo(pedidaEhT1: boolean, fase: Fase | undefined): MomentoTitulo {
  return pedidaEhT1 ? 't1' : (fase ?? 'pre');
}

/** "em Campinas (SP)" · "no Rio de Janeiro (RJ)" · "em Abidjã (Exterior)". */
export function ondeMunicipio(nome: string, uf: UF): string {
  return `${nome === 'Rio de Janeiro' ? 'no' : 'em'} ${nome} (${uf === 'ZZ' ? 'Exterior' : uf})`;
}

/**
 * Título de uma página de apuração (UF ou município) com o lugar já com a preposição ("em Campinas (SP)", "no Amazonas",
 * "no exterior"). `cargo` só quando não é Presidente (o padrão das páginas).
 */
export function tituloApuracao(onde: string, momento: MomentoTitulo, cargo?: string): string {
  const base =
    momento === 't1'
      ? `1º turno 2026 ${onde}: resultado oficial`
      : momento === 'pre'
        ? `Eleição 2026 ${onde}: 1º turno e apuração do 2º turno`
        : momento === 'apurando'
          ? `Apuração ao vivo ${onde} · 2º turno 2026`
          : `Resultado do 2º turno 2026 ${onde}`;
  return `${base}${cargo && cargo !== 'Presidente' ? ` · ${cargo}` : ''} · ${APP_NAME}`;
}

/** Título da apuração nacional (/apuracao); `corrida` = "Presidente" (o título da disputa, sem "· 1º turno"). */
export function tituloNacional(corrida: string, momento: MomentoTitulo): string {
  const c = corrida.replace(/ · 1º turno$/, '');
  const base =
    momento === 't1'
      ? `Resultado do 1º turno 2026 · ${c}`
      : momento === 'pre'
        ? `Eleição 2026 para ${c}: 1º turno e apuração do 2º turno`
        : momento === 'apurando'
          ? `Apuração ao vivo · ${c} · 2º turno 2026`
          : `Resultado do 2º turno 2026 · ${c}`;
  return `${base} · ${APP_NAME}`;
}
