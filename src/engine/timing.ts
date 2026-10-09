/**
 * Modelo de chegada (totalização) das seções: minutos após 17:00 (INICIO_APURACAO).
 *
 * Em duas etapas (cópula por postos), para que a curva nacional bata com a calibração-alvo sem perder a
 * estrutura geográfica:
 *
 *  1. Escore de atraso (ordem relativa): ln T* = ln(mediana × fatores) + σz·Zzona + σ·Z, com
 *     - mediana por região conforme `ordemRegional` (realista: S 34, SE 38, CO 42, NE 50, N 62, EX 75 min);
 *     - fatores: capital 0,95 · município pequeno (< 8 mil aptos) 0,85 · interior do Norte 1,35;
 *     - deslocamento compartilhado por zona eleitoral (σz ≈ 12%) → "rajadas" realistas;
 *     - σ ≈ 0,55 (lognormal por seção).
 *  2. O posto (rank) de cada seção regular é mapeado na curva-alvo do ritmo normal (interpolação monotônica
 *     em log-tempo): 1% às 17:05 · 50% às 17:57 · 90% às 18:50 · 99% às 19:45.
 *     Uma lognormal pura (mistura por região) não consegue ao mesmo tempo ~1% às 17:05 e ~99% às 19:45 —
 *     a cauda esquerda real é longa (urnas pequenas transmitem em minutos) e a direita, curta.
 *
 * Depois: 0,3% de seções retardatárias (2,5× mais prováveis no interior do Norte e no exterior), uniformes
 * entre +2 h e +5 h (por isso 100% às ~22:00); `ritmo` multiplica tudo (rápido 0,75 · normal 1 · lento 1,4);
 * `ufAtraso` soma minutos por UF. A ordem regional muda QUEM chega primeiro; o ritmo muda a velocidade.
 */
import type { OrdemRegional, Regiao, Ritmo, ScenarioConfig } from '../shared/types';
import { clamp, dexp, dlog, radixArgsort } from './mathx';
import { Canal, canalKey, nrm, uni } from './rng';
import type { Structure } from './structure';

export const MEDIANAS: Record<Exclude<OrdemRegional, 'aleatoria'>, Record<Regiao, number>> = {
  realista: { S: 34, SE: 38, CO: 42, NE: 50, N: 62, EX: 75 },
  'norte-primeiro': { N: 34, NE: 38, CO: 44, SE: 52, S: 58, EX: 75 },
  'sul-primeiro': { S: 30, SE: 35, CO: 44, N: 60, NE: 66, EX: 75 },
};
/** Faixa (min) das medianas sorteadas por UF na ordem 'aleatoria'. */
export const MEDIANA_ALEATORIA: [number, number] = [32, 64];

export const RITMO_FATOR: Record<Ritmo, number> = { rapido: 0.75, normal: 1, lento: 1.4 };

export const TIMING = {
  sigma: 0.55,
  sigmaZona: 0.12,
  fatorCapital: 0.95,
  fatorPequeno: 0.85,
  limitePequeno: 8000,
  fatorInteriorNorte: 1.35,
  pRetardataria: 0.003,
  pesoRetardatariaRemota: 2.5,
  retardatariaMin: 120,
  retardatariaMax: 300,
};

/**
 * Curva-alvo das seções REGULARES no ritmo normal: [fração acumulada, minutos após 17:00].
 * Com as retardatárias (~0,3%), a curva total fica: ~1% 17:05 · ~50% 17:57 · ~90% 18:50 · ~99% 19:45 · 100% ~22:00.
 */
export const CURVA_ALVO: [number, number][] = [
  [0, 0.25],
  [0.01, 5],
  [0.1, 15.5],
  [0.25, 30],
  [0.5, 57],
  [0.75, 82],
  [0.9, 110],
  [0.95, 127],
  [0.9925, 165],
  [0.999, 188],
  [1, 205],
];

/** Interpolação monotônica (Fritsch–Carlson) de ln(minutos) em função da fração q. */
function preparaCurva(knots: [number, number][]) {
  const n = knots.length;
  const x = knots.map((k) => k[0]);
  const y = knots.map((k) => dlog(k[1]));
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (q: number): number => {
    if (q <= x[0]) return dexp(y[0]);
    if (q >= x[n - 1]) return dexp(y[n - 1]);
    let i = 0;
    while (q > x[i + 1]) i++;
    const h = x[i + 1] - x[i];
    const t = (q - x[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const v =
      (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
    return dexp(v);
  };
}
const curva = preparaCurva(CURVA_ALVO);

/** Minutos após 17:00 para a fração q das seções regulares (ritmo normal). */
export const minutosCurva = (q: number) => curva(q);

/** Mediana base (min) de cada UF para a ordem dada. */
export function medianasUf(st: Structure, ordem: OrdemRegional, seedK: number): Float64Array {
  const out = new Float64Array(st.nUf);
  const ck = canalKey(seedK, Canal.UfAleatoria);
  for (let u = 0; u < st.nUf; u++) {
    const reg = st.ufRegiao[u];
    if (ordem === 'aleatoria') {
      if (reg === 'EX') out[u] = MEDIANAS.realista.EX;
      else {
        const [a, b] = MEDIANA_ALEATORIA;
        out[u] = a + (b - a) * uni(ck, st.ufHash[u]);
      }
    } else out[u] = (MEDIANAS[ordem] ?? MEDIANAS.realista)[reg];
  }
  return out;
}

/**
 * Chegada (ms após 17:00) de cada seção. Depende só da estrutura, da semente e de
 * ritmo/ordemRegional/ufAtraso — não depende dos votos.
 */
export function calculaChegadas(st: Structure, cen: ScenarioConfig, seedK: number): Int32Array {
  const T = TIMING;
  const N = st.nSec;
  const out = new Int32Array(N);
  const med = medianasUf(st, cen.ordemRegional, seedK);
  const ritmo = RITMO_FATOR[cen.ritmo] ?? 1;
  const atraso = new Float64Array(st.nUf);
  for (let u = 0; u < st.nUf; u++) atraso[u] = clamp(Number(cen.ufAtraso?.[st.ufs[u]] ?? 0) || 0, 0, 600);

  const ckZona = canalKey(seedK, Canal.Zona);
  const ckCheg = canalKey(seedK, Canal.Chegada);
  const ckRet = canalKey(seedK, Canal.Retardataria);
  const ckRetT = canalKey(seedK, Canal.RetardatariaT);

  // ln(mediana × fatores) por município
  const munLog = new Float64Array(st.nMun);
  const munRemoto = new Uint8Array(st.nMun);
  for (let m = 0; m < st.nMun; m++) {
    const u = st.munUf[m];
    const md = st.mun[m];
    const reg = st.ufRegiao[u];
    let f = 1;
    if (md.capital) f *= T.fatorCapital;
    if (md.eleitorado < T.limitePequeno) f *= T.fatorPequeno;
    if (reg === 'N' && !md.capital) {
      f *= T.fatorInteriorNorte;
      munRemoto[m] = 1;
    }
    if (reg === 'EX') munRemoto[m] = 1;
    munLog[m] = dlog(med[u] * f);
  }

  // 1) escores (seções regulares) e retardatárias
  const score = new Float64Array(N);
  const retard = new Uint8Array(N);
  let nReg = 0;
  let smin = Infinity;
  let smax = -Infinity;
  let lastZh = -1;
  let lastZ = 0;
  for (let i = 0; i < N; i++) {
    const m = st.secMun[i];
    const h = st.secHash[i];
    const pRet = T.pRetardataria * (munRemoto[m] ? T.pesoRetardatariaRemota : 1);
    if (uni(ckRet, h) < pRet) {
      retard[i] = 1;
      continue;
    }
    const zh = st.secZonaHash[i];
    if (zh !== lastZh) {
      lastZh = zh;
      lastZ = T.sigmaZona * nrm(ckZona, zh);
    }
    const s = munLog[m] + lastZ + T.sigma * nrm(ckCheg, h);
    score[i] = s;
    if (s < smin) smin = s;
    if (s > smax) smax = s;
    nReg++;
  }

  // 2) posto → curva-alvo. Escores quantizados em 32 bits + radix argsort estável (empate → menor índice).
  const escala = smax > smin ? 4294967295 / (smax - smin) : 0;
  const q = new Uint32Array(nReg);
  const idx = new Int32Array(nReg);
  for (let i = 0, j = 0; i < N; i++) {
    if (retard[i]) continue;
    q[j] = Math.floor((score[i] - smin) * escala);
    idx[j++] = i;
  }
  const ord = radixArgsort(q, nReg);
  for (let r = 0; r < nReg; r++) {
    const i = idx[ord[r]];
    out[i] = Math.round((ritmo * curva((r + 0.5) / nReg) + atraso[st.secUf[i]]) * 60000);
  }
  for (let i = 0; i < N; i++) {
    if (!retard[i]) continue;
    const min = ritmo * (T.retardatariaMin + (T.retardatariaMax - T.retardatariaMin) * uni(ckRetT, st.secHash[i]));
    out[i] = Math.round((min + atraso[st.secUf[i]]) * 60000);
  }
  return out;
}
