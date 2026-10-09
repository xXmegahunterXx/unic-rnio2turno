/**
 * Agregação por instante: as seções totalizadas são o prefixo `ordem[0..k)`. Uma passada O(k) preenche
 * arrays por município (UF, região e Brasil são somas dos municípios). Zonas (par município×zona) são
 * somadas sob demanda a partir das seções do próprio município (`camposPar`), só nas telas de município/zona.
 *
 * Cache: LRU pequeno por k (o controller quantiza simNow em buckets de 1 s e converte em k). Um k novo é
 * calculado de forma INCREMENTAL a partir do maior k em cache que seja ≤ k (o relógio quase sempre anda
 * para frente), senão do zero.
 */
import type { Model } from './model';

/** Campos por município/par (stride F.STRIDE). */
export const F = {
  SEC: 0, // seções totalizadas
  APT: 1, // eleitorado das seções totalizadas
  COMP: 2,
  V0: 3,
  V1: 4,
  B: 5,
  N: 6,
  G0: 7,
  G1: 8,
  GB: 9,
  GN: 10,
  LAST: 11, // chegada (ms após 17:00) da última seção totalizada; −1 se nenhuma
  STRIDE: 12,
} as const;

export interface Agg {
  k: number;
  mun: Float64Array;
  /** ms gastos para produzir este agregado */
  ms: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Aggregator {
  private cache = new Map<number, Agg>();
  constructor(
    private readonly model: Model,
    private readonly max = 6,
  ) {}

  get(k: number): Agg {
    const hit = this.cache.get(k);
    if (hit) {
      this.cache.delete(k);
      this.cache.set(k, hit);
      return hit;
    }
    const t0 = now();
    const st = this.model.st;
    const S = F.STRIDE;
    let base: Agg | null = null;
    for (const a of this.cache.values()) if (a.k <= k && (!base || a.k > base.k)) base = a;
    let mun: Float64Array;
    let from: number;
    if (base) {
      mun = base.mun.slice();
      from = base.k;
    } else {
      mun = new Float64Array(st.nMun * S);
      for (let m = 0; m < st.nMun; m++) mun[m * S + F.LAST] = -1;
      from = 0;
    }
    const { ordem, aptos, comp, pv0, pv1, pb, pn, gv0, gv1, gb, gn, chegada } = this.model;
    const secMun = st.secMun;
    for (let j = from; j < k; j++) {
      const i = ordem[j];
      const o = secMun[i] * S;
      mun[o] += 1;
      mun[o + 1] += aptos[i];
      mun[o + 2] += comp[i];
      mun[o + 3] += pv0[i];
      mun[o + 4] += pv1[i];
      mun[o + 5] += pb[i];
      mun[o + 6] += pn[i];
      mun[o + 7] += gv0[i];
      mun[o + 8] += gv1[i];
      mun[o + 9] += gb[i];
      mun[o + 10] += gn[i];
      mun[o + 11] = chegada[i];
    }
    const agg: Agg = { k, mun, ms: now() - t0 };
    this.cache.set(k, agg);
    while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value as number);
    return agg;
  }
}

/** Campos (12) de um par município×zona no instante k, a partir das suas seções (O(seções do par)). */
export function camposPar(model: Model, p: number, k: number, out = new Float64Array(F.STRIDE)): Float64Array {
  const st = model.st;
  const { rank, aptos, comp, pv0, pv1, pb, pn, gv0, gv1, gb, gn, chegada } = model;
  out.fill(0);
  out[F.LAST] = -1;
  for (let i = st.pairSecStart[p]; i < st.pairSecEnd[p]; i++) {
    if (rank[i] >= k) continue;
    out[0] += 1;
    out[1] += aptos[i];
    out[2] += comp[i];
    out[3] += pv0[i];
    out[4] += pv1[i];
    out[5] += pb[i];
    out[6] += pn[i];
    out[7] += gv0[i];
    out[8] += gv1[i];
    out[9] += gb[i];
    out[10] += gn[i];
    if (chegada[i] > out[11]) out[11] = chegada[i];
  }
  return out;
}

/** Soma os municípios [m0, m1) num vetor de 12 campos (LAST = máximo). */
export function somaMunicipios(mun: Float64Array, m0: number, m1: number, out = new Float64Array(F.STRIDE)): Float64Array {
  const S = F.STRIDE;
  out.fill(0);
  out[F.LAST] = -1;
  for (let m = m0; m < m1; m++) {
    const o = m * S;
    for (let f = 0; f < F.LAST; f++) out[f] += mun[o + f];
    if (mun[o + F.LAST] > out[F.LAST]) out[F.LAST] = mun[o + F.LAST];
  }
  return out;
}

/** Acumula `src` (12 campos) em `dst`. */
export function acumula(dst: Float64Array, src: Float64Array): void {
  for (let f = 0; f < F.LAST; f++) dst[f] += src[f];
  if (src[F.LAST] > dst[F.LAST]) dst[F.LAST] = src[F.LAST];
}
