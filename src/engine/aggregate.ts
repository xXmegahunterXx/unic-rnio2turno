/**
 * Agregação por instante: as seções totalizadas são o prefixo `ordem[0..k)`. Uma passada O(k) preenche
 * arrays por município e por par município×zona (UF, região e Brasil são somas dos municípios).
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
  pair: Float64Array;
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
    let pair: Float64Array;
    let from: number;
    if (base) {
      mun = base.mun.slice();
      pair = base.pair.slice();
      from = base.k;
    } else {
      mun = new Float64Array(st.nMun * S);
      pair = new Float64Array(st.nPair * S);
      for (let m = 0; m < st.nMun; m++) mun[m * S + F.LAST] = -1;
      for (let p = 0; p < st.nPair; p++) pair[p * S + F.LAST] = -1;
      from = 0;
    }
    const { ordem, aptos, comp, pv0, pv1, pb, pn, gv0, gv1, gb, gn, chegada } = this.model;
    const secMun = st.secMun;
    const secPair = st.secPair;
    for (let j = from; j < k; j++) {
      const i = ordem[j];
      const a = aptos[i];
      const c = comp[i];
      const x0 = pv0[i];
      const x1 = pv1[i];
      const xb = pb[i];
      const xn = pn[i];
      const y0 = gv0[i];
      const y1 = gv1[i];
      const yb = gb[i];
      const yn = gn[i];
      const ch = chegada[i];
      let o = secMun[i] * S;
      mun[o] += 1;
      mun[o + 1] += a;
      mun[o + 2] += c;
      mun[o + 3] += x0;
      mun[o + 4] += x1;
      mun[o + 5] += xb;
      mun[o + 6] += xn;
      mun[o + 7] += y0;
      mun[o + 8] += y1;
      mun[o + 9] += yb;
      mun[o + 10] += yn;
      mun[o + 11] = ch;
      o = secPair[i] * S;
      pair[o] += 1;
      pair[o + 1] += a;
      pair[o + 2] += c;
      pair[o + 3] += x0;
      pair[o + 4] += x1;
      pair[o + 5] += xb;
      pair[o + 6] += xn;
      pair[o + 7] += y0;
      pair[o + 8] += y1;
      pair[o + 9] += yb;
      pair[o + 10] += yn;
      pair[o + 11] = ch;
    }
    const agg: Agg = { k, mun, pair, ms: now() - t0 };
    this.cache.set(k, agg);
    while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value as number);
    return agg;
  }
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
