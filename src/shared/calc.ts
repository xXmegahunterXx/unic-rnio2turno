/** Cálculos derivados — fonte única da verdade para percentuais (regras do TSE). */
import type { Tally } from './types';
import { MARGEM_BUCKETS } from './constants';

export const validos = (t: Pick<Tally, 'votos'>) => t.votos.reduce((a, b) => a + b, 0);

/** % de votos válidos do candidato i (0–100). */
export function pctValidos(t: Pick<Tally, 'votos'>, i: number): number {
  const v = validos(t);
  return v > 0 ? (t.votos[i] / v) * 100 : 0;
}

/**
 * % de seções totalizadas (0–100), TRUNCADO em 2 casas como faz o TSE: só mostra 100,00% quando todas as
 * seções foram totalizadas (99.995% nunca vira "100,00%" com a apuração ainda aberta).
 */
export const pctTotalizadas = (t: Pick<Tally, 'secoes' | 'secoesTotalizadas'>) => {
  if (t.secoes <= 0) return 0;
  if (t.secoesTotalizadas >= t.secoes) return 100;
  return Math.floor((t.secoesTotalizadas / t.secoes) * 10000) / 100;
};

/** % de comparecimento sobre o eleitorado das seções totalizadas. */
export const pctComparecimento = (t: Pick<Tally, 'comparecimento' | 'eleitoradoTotalizado'>) =>
  t.eleitoradoTotalizado > 0 ? (t.comparecimento / t.eleitoradoTotalizado) * 100 : 0;

export const pctAbstencao = (t: Pick<Tally, 'abstencao' | 'eleitoradoTotalizado'>) =>
  t.eleitoradoTotalizado > 0 ? (t.abstencao / t.eleitoradoTotalizado) * 100 : 0;

/** Brancos e nulos: % do comparecimento (total de votos). */
export const pctBrancos = (t: Pick<Tally, 'brancos' | 'comparecimento'>) =>
  t.comparecimento > 0 ? (t.brancos / t.comparecimento) * 100 : 0;
export const pctNulos = (t: Pick<Tally, 'nulos' | 'comparecimento'>) =>
  t.comparecimento > 0 ? (t.nulos / t.comparecimento) * 100 : 0;

/** Diferença em pontos percentuais entre os dois primeiros (>= 0) e índice do líder. */
export function margem(t: Pick<Tally, 'votos'>): { lider: number | null; pp: number; votos: number } {
  if (t.votos.length < 2) return { lider: null, pp: 0, votos: 0 };
  const idx = t.votos.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const [first, second] = idx;
  if (first[0] === 0 || first[0] === second[0]) return { lider: null, pp: 0, votos: 0 };
  return { lider: first[1], pp: pctValidos(t, first[1]) - pctValidos(t, second[1]), votos: first[0] - second[0] };
}

/** Bucket de margem 0..3 (<5pp, 5–15, 15–30, ≥30). */
export function bucketMargem(pp: number): 0 | 1 | 2 | 3 {
  if (pp < MARGEM_BUCKETS[0]) return 0;
  if (pp < MARGEM_BUCKETS[1]) return 1;
  if (pp < MARGEM_BUCKETS[2]) return 2;
  return 3;
}

/** Decodifica "1-120,135,140-160" → [1..120, 135, 140..160]. */
export function decodeFaixas(faixas: string): number[] {
  const out: number[] = [];
  if (!faixas) return out;
  for (const part of faixas.split(',')) {
    const [a, b] = part.split('-').map(Number);
    if (b === undefined || Number.isNaN(b)) out.push(a);
    else for (let n = a; n <= b; n++) out.push(n);
  }
  return out;
}

/** Codifica lista ordenada de inteiros em faixas compactas. */
export function encodeFaixas(nums: number[]): string {
  const sorted = [...nums].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return parts.join(',');
}
