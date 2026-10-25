/**
 * Vinheta da projeção (núcleo puro, testado): decide QUANDO a vinheta em tela cheia aparece. Quem desenha e toca é
 * `VinhetaProjecao.tsx`.
 *
 * Aparece quando a Projeção do Sintonia surge, quando muda `LIMIAR_VINHETA_PP` ou mais em qualquer finalista (no máximo
 * uma a cada `INTERVALO_VINHETA_MS`; a mais nova espera) e quando o TSE define o resultado (sem espera). Projeção que
 * some (definido, encerrada, chave desligada) só limpa a memória, em silêncio.
 */

/** Mudança mínima da projeção (p.p.) para uma nova vinheta. */
export const LIMIAR_VINHETA_PP = 0.3;
/** Intervalo mínimo entre duas vinhetas de projeção. */
export const INTERVALO_VINHETA_MS = 120_000;
/** Duração da vinheta: letreiro e, depois, os números (fecha sozinha no fim). */
export const DURACAO_LETREIRO_MS = 1900;
export const DURACAO_VINHETA_MS = 11_000;

export type TipoVinheta = 'projecao-nova' | 'projecao-mudou' | 'definido';

/** Projeção na ordem da urna: % de cada finalista e a faixa. */
export interface ProjecaoVinheta {
  pct: readonly [number, number];
  min: readonly [number, number];
  max: readonly [number, number];
}

export interface QuadroVinheta {
  projecao: ProjecaoVinheta | null;
  /** índice do eleito (TSE) ou null */
  eleito: number | null;
}

export interface MemoriaVinheta {
  /** última projeção MOSTRADA (% na ordem da urna) */
  projecao: readonly [number, number] | null;
  definido: boolean;
}

export const MEMORIA_VINHETA_VAZIA: MemoriaVinheta = { projecao: null, definido: false };

export interface Vinheta {
  tipo: TipoVinheta;
  /** a projeção mostrada antes (só em 'projecao-mudou') */
  anterior: readonly [number, number] | null;
}

export function proximaVinheta(mem: MemoriaVinheta, q: QuadroVinheta): { vinheta: Vinheta | null; memoria: MemoriaVinheta } {
  if (q.eleito !== null && !mem.definido) {
    return { vinheta: { tipo: 'definido', anterior: null }, memoria: { projecao: q.projecao?.pct ?? mem.projecao, definido: true } };
  }
  if (q.eleito !== null) return { vinheta: null, memoria: mem };
  if (q.projecao && !mem.projecao) {
    return { vinheta: { tipo: 'projecao-nova', anterior: null }, memoria: { ...mem, projecao: q.projecao.pct } };
  }
  if (q.projecao && mem.projecao) {
    const d = Math.max(Math.abs(q.projecao.pct[0] - mem.projecao[0]), Math.abs(q.projecao.pct[1] - mem.projecao[1]));
    if (d >= LIMIAR_VINHETA_PP - 1e-9) {
      return { vinheta: { tipo: 'projecao-mudou', anterior: mem.projecao }, memoria: { ...mem, projecao: q.projecao.pct } };
    }
    return { vinheta: null, memoria: mem };
  }
  return { vinheta: null, memoria: q.projecao ? mem : { ...mem, projecao: null } };
}

/** Lê a memória salva na sessão (aba): navegar e voltar não repete a mesma vinheta. Inválida → vazia. */
export function lerMemoriaVinheta(raw: string | null): MemoriaVinheta {
  if (!raw) return MEMORIA_VINHETA_VAZIA;
  try {
    const v = JSON.parse(raw) as Partial<MemoriaVinheta>;
    const p = v.projecao;
    const ok = Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && Number.isFinite(x));
    return { projecao: ok ? [p[0], p[1]] : null, definido: v.definido === true };
  } catch {
    return MEMORIA_VINHETA_VAZIA;
  }
}
