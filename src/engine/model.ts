/**
 * Construção do modelo (determinística) — ARCHITECTURE.md §5.1 e §10.2.1.
 *
 * Para cada seção (arrays tipados, Struct of Arrays):
 *   aptos → comparecimento → brancos/nulos → votos dos 2 candidatos (Presidente e, nas 7 UFs, Governador)
 *   → chegada (ms após 17:00).
 * Depois: ordem de chegada (argsort), calibragem e linha do tempo (série + eventos).
 *
 * Duas bases por UF:
 *  - COM o 1º turno real por seção (public/data/secao/{uf}.json): aptos reais; comparecimento, brancos e nulos
 *    a partir das taxas REAIS da própria seção (× fatores do cenário, com ruído pequeno); preferência a partir
 *    dos votos REAIS da seção (finalistas + transferência dos "outros" da própria seção). As taxas e a
 *    preferência da seção são levemente encolhidas em direção ao município (`MODELO.pseudoVotos`), o que só
 *    pesa em seções minúsculas. O `ruidoSecao` do cenário é um ruído EXTRA sobre o real (padrão 0,08).
 *  - SEM o arquivo (fallback, fase 1): eleitorado do município distribuído com ruído lognormal, taxas do
 *    município, preferência do município + ruído por seção (`ruidoSecao` somado em quadratura a um ruído
 *    estrutural, `MODELO.ruidoSemSecaoReal`, que faz o papel da variação real entre seções).
 *
 * Calibragem: a geografia é aplicada em logit em torno da média da corrida (`intensidadeRegional`) e um
 * deslocamento δ (Newton com salvaguarda de bisseção) é calculado sobre as PRÓPRIAS seções (já com o ruído por
 * seção e os válidos sorteados). O ruído binomial agregado é então devolvido ao valor esperado (±1 voto em
 * seções espalhadas), de modo que, sem `ufVies`, o total da corrida bate com o alvo com erro < 1 voto.
 */
import type { ScenarioConfig } from '../shared/types';
import { clamp, dexp, logit, radixArgsort, sigmoid } from './mathx';
import { Canal, canalKey, hashStr, nrm, seedKey, triple32, uni } from './rng';
import { cenarioKey } from './scenario';
import { votosFinalistas, type ColunasT1, type RaceInfo, type Structure } from './structure';
import { calculaChegadas } from './timing';
import { buildTimeline, type Timeline } from './series';

export const MODELO = {
  sigmaAptos: 0.15,
  sigmaComparecimento: 0.02,
  /** Com a seção real: a taxa real já varia de seção para seção, o ruído extra é menor. */
  sigmaComparecimentoReal: 0.01,
  sigmaBrancosNulos: 0.25,
  inclinacaoTransferencia: 0.35,
  pMin: 0.005,
  /** Ruído (logit) somado em quadratura ao `ruidoSecao` nas UFs SEM seção real (substitui a variação real). */
  ruidoSemSecaoReal: 0.24,
  /** Encolhimento das taxas/preferência da seção real em direção ao município (pseudo-eleitores/votos). */
  pseudoVotos: 10,
};

export interface Calibragem {
  race: string;
  alvo: number;
  /** Deslocamento em logit aplicado a todas as seções da corrida. */
  delta: number;
  /** % de válidos do candidato 0 com 100% totalizado (sem viés: deve bater com o alvo). */
  resultado: number;
  iteracoes: number;
}

export interface Model {
  id: number;
  key: string;
  cenario: ScenarioConfig;
  st: Structure;
  seedK: number;
  aptos: Int32Array;
  comp: Int32Array;
  pv0: Int32Array;
  pv1: Int32Array;
  pb: Int32Array;
  pn: Int32Array;
  gv0: Int32Array;
  gv1: Int32Array;
  gb: Int32Array;
  gn: Int32Array;
  /** ms após INICIO_APURACAO. */
  chegada: Int32Array;
  /** índices das seções em ordem de chegada (desempate pelo índice). */
  ordem: Int32Array;
  /** chegada[ordem[j]] (crescente) — para busca binária do prefixo totalizado. */
  chegadaOrd: Int32Array;
  /** posição da seção em `ordem` (seção i totalizada ⇔ rank[i] < k). */
  rank: Int32Array;
  pairEleitorado: Float64Array;
  calib: { pres: Calibragem | null; gov: Calibragem[] };
  /** Nº de UFs modeladas a partir do 1º turno real por seção (0 = só o fallback por município). */
  ufsSecaoReal: number;
  timeline: Timeline;
  builtAt: number;
  buildMs: number;
  /** tempos por etapa (ms) */
  etapas: Record<string, number>;
}

let nextModelId = 1;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Aptos por seção, somando exatamente o eleitorado de cada município (maior resto):
 *  - UF com seção real: os aptos REAIS (cópia exata quando já somam o eleitorado do município — o normal;
 *    senão, reescalados proporcionalmente);
 *  - fallback: o eleitorado do município distribuído com ruído lognormal.
 */
function distribuiAptos(st: Structure, ck: number): Int32Array {
  const aptos = new Int32Array(st.nSec);
  const real = st.real;
  let maxS = 0;
  for (let m = 0; m < st.nMun; m++) maxS = Math.max(maxS, st.munSecEnd[m] - st.munSecStart[m]);
  const w = new Float64Array(maxS);
  const keys = new Float64Array(maxS);
  const SHIFT = 1048576; // 2^20 seções por município (folga)
  for (let m = 0; m < st.nMun; m++) {
    const s0 = st.munSecStart[m];
    const S = st.munSecEnd[m] - s0;
    if (S === 0) continue;
    const E = st.munEleitorado[m];
    let wsum = 0;
    if (real && real.ufPres[st.munUf[m]]) {
      for (let j = 0; j < S; j++) {
        w[j] = real.aptos[s0 + j];
        wsum += w[j];
      }
      if (wsum === E) {
        for (let j = 0; j < S; j++) aptos[s0 + j] = w[j];
        continue;
      }
    }
    if (wsum <= 0) {
      wsum = 0;
      for (let j = 0; j < S; j++) {
        const v = dexp(MODELO.sigmaAptos * nrm(ck, st.secHash[s0 + j]));
        w[j] = v;
        wsum += v;
      }
    }
    let soma = 0;
    for (let j = 0; j < S; j++) {
      const ideal = (E * w[j]) / wsum;
      const a = Math.floor(ideal);
      aptos[s0 + j] = a;
      soma += a;
      // chave: maior resto primeiro, desempate pelo índice (ordem crescente da chave)
      keys[j] = Math.floor((1 - (ideal - a)) * 4294967296) * SHIFT + j;
    }
    let R = E - soma;
    if (R > 0) {
      const sub = keys.subarray(0, S);
      sub.sort();
      for (let r = 0; r < R && r < S; r++) aptos[s0 + (sub[r] % SHIFT)] += 1;
    }
  }
  return aptos;
}

interface PrefMun {
  /** logit base por município (com intensidade regional) */
  L: Float64Array;
  /** preferência do candidato 0 por município (1º turno + transferência), antes da intensidade */
  p: Float64Array;
  /** logit da preferência média da corrida (ponderada pelos válidos do 1º turno) */
  mu: number;
}

/** Fração dos "outros" (demais candidatos do 1º turno) que vai para o candidato 0, dada a disputa local p1. */
const transferencia = (cen: ScenarioConfig, p1: number) =>
  clamp(cen.transferenciaOutros + MODELO.inclinacaoTransferencia * (p1 - 0.5), 0.05, 0.95);

/** Preferência do candidato 0 por município (logit), a partir do 1º turno. */
function preferenciaMunicipal(st: Structure, r: RaceInfo, cen: ScenarioConfig): PrefMun {
  const L = new Float64Array(st.nMun);
  const p = new Float64Array(st.nMun);
  const val = new Float64Array(st.nMun);
  const [m0, m1] = r.kind === 'pres' ? [0, st.nMun] : [st.ufMunStart[r.ufIdx], st.ufMunEnd[r.ufIdx]];
  let sw = 0;
  let swp = 0;
  for (let m = m0; m < m1; m++) {
    const t = r.kind === 'pres' ? st.mun[m].t1 : (st.mun[m].t1gov ?? st.mun[m].t1);
    const [v0, v1, outros] = votosFinalistas(t, r.num0, r.num1);
    const validos = v0 + v1 + outros;
    const p1 = v0 + v1 > 0 ? v0 / (v0 + v1) : 0.5;
    const pm = validos > 0 ? (v0 + transferencia(cen, p1) * outros) / validos : 0.5;
    p[m] = clamp(pm, MODELO.pMin, 1 - MODELO.pMin);
    val[m] = validos;
    sw += validos;
    swp += validos * pm;
  }
  const mu = logit(sw > 0 ? swp / sw : 0.5);
  for (let m = m0; m < m1; m++) {
    L[m] = val[m] > 0 ? mu + cen.intensidadeRegional * (logit(p[m]) - mu) : mu;
  }
  return { L, p, mu };
}

/**
 * Resolve δ: Σ w_i σ(b_i + δ) = alvo · Σ w_i (Newton com bisseção de salvaguarda).
 * `base` = logit por seção sem δ; `w` = válidos por seção (mesmos índices).
 */
function calibraDelta(base: Float64Array, w: Int32Array, alvo: number): { delta: number; it: number } {
  const n = base.length;
  let W = 0;
  for (let i = 0; i < n; i++) W += w[i];
  if (W <= 0) return { delta: 0, it: 0 };
  const A = alvo * W;
  let lo = -30;
  let hi = 30;
  let d = 0;
  let it = 0;
  for (; it < 60; it++) {
    let f = -A;
    let fp = 0;
    for (let i = 0; i < n; i++) {
      const wi = w[i];
      if (wi === 0) continue;
      const s = sigmoid(base[i] + d);
      f += wi * s;
      fp += wi * s * (1 - s);
    }
    if (Math.abs(f) <= W * 1e-12) break;
    if (f > 0) hi = d;
    else lo = d;
    let nd = fp > 0 ? d - f / fp : (lo + hi) / 2;
    if (!(nd > lo && nd < hi)) nd = (lo + hi) / 2;
    if (Math.abs(nd - d) < 1e-13) {
      d = nd;
      break;
    }
    d = nd;
  }
  return { delta: d, it: it + 1 };
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Desvio em logit equivalente a `pp` pontos percentuais a partir de 50%. */
export function viesLogit(pp: number): number {
  return logit(0.5 + clamp(pp, -49, 49) / 100);
}

/**
 * Brancos, nulos e votos de uma corrida de 2º turno nas seções [i0, i1).
 * Escreve em b/n/v0/v1 (arrays do modelo) e retorna a calibragem.
 */
function votosCorrida(
  st: Structure,
  r: RaceInfo,
  cen: ScenarioConfig,
  seedK: number,
  comp: Int32Array,
  out: { b: Int32Array; n: Int32Array; v0: Int32Array; v1: Int32Array },
  alvo: number,
  vies: Float64Array | null,
): Calibragem {
  const gov = r.kind === 'gov';
  const ckB = canalKey(seedK, gov ? Canal.GovBrancos : Canal.Brancos);
  const ckN = canalKey(seedK, gov ? Canal.GovNulos : Canal.Nulos);
  const ckP = canalKey(seedK, gov ? Canal.GovPreferencia : Canal.Preferencia);
  const ckBin = canalKey(seedK, gov ? Canal.GovBinomial : Canal.Binomial);
  const [i0, i1] = gov ? [st.ufSecStart[r.ufIdx], st.ufSecEnd[r.ufIdx]] : [0, st.nSec];
  const { b, n, v0, v1 } = out;
  const sBN = MODELO.sigmaBrancosNulos;
  const corrBN = (sBN * sBN) / 2; // lognormal com média 1
  const K = MODELO.pseudoVotos;
  const real = st.real;
  const ufReal = real ? (gov ? real.ufGov : real.ufPres) : null;
  const col: ColunasT1 | null = real ? (gov ? real.gov : real.pres) : null;

  // taxas de brancos/nulos por município (1º turno, sem os fatores do cenário)
  const rb = new Float64Array(st.nMun);
  const rn = new Float64Array(st.nMun);
  const [m0, m1] = gov ? [st.ufMunStart[r.ufIdx], st.ufMunEnd[r.ufIdx]] : [0, st.nMun];
  for (let m = m0; m < m1; m++) {
    const t = gov ? (st.mun[m].t1gov ?? st.mun[m].t1) : st.mun[m].t1;
    rb[m] = t.comparecimento > 0 ? t.brancos / t.comparecimento : 0;
    rn[m] = t.comparecimento > 0 ? t.nulos / t.comparecimento : 0;
  }
  const fb = cen.brancosFator;
  const fn = cen.nulosFator;

  const validos = new Int32Array(i1 - i0); // índice local: i − i0
  for (let i = i0; i < i1; i++) {
    const m = st.secMun[i];
    const c = comp[i];
    const h = st.secHash[i];
    let bb: number;
    let nn: number;
    if (ufReal && col && ufReal[st.secUf[i]]) {
      // taxas REAIS da seção (encolhidas para o município) × fatores; contagem ~ binomial (aprox. normal)
      const cr = col.comp[i];
      const tb = clamp(((col.brancos[i] + K * rb[m]) / (cr + K)) * fb, 0, 0.95);
      const tn = clamp(((col.nulos[i] + K * rn[m]) / (cr + K)) * fn, 0, 0.95);
      bb = Math.round(c * tb + Math.sqrt(c * tb * (1 - tb)) * nrm(ckB, h));
      nn = Math.round(c * tn + Math.sqrt(c * tn * (1 - tn)) * nrm(ckN, h));
      if (bb < 0) bb = 0;
      if (nn < 0) nn = 0;
    } else {
      const tb = clamp(rb[m] * fb * dexp(sBN * nrm(ckB, h) - corrBN), 0, 0.95);
      const tn = clamp(rn[m] * fn * dexp(sBN * nrm(ckN, h) - corrBN), 0, 0.95);
      bb = Math.round(c * tb);
      nn = Math.round(c * tn);
    }
    if (bb > c) bb = c;
    if (bb + nn > c) nn = c - bb;
    b[i] = bb;
    n[i] = nn;
    validos[i - i0] = c - bb - nn;
  }

  // preferência → logit base por seção
  const pref = preferenciaMunicipal(st, r, cen);
  const base = new Float64Array(i1 - i0);
  const ruido = cen.ruidoSecao;
  const ruidoFallback = Math.sqrt(ruido * ruido + MODELO.ruidoSemSecaoReal * MODELO.ruidoSemSecaoReal);
  const mu = pref.mu;
  const intens = cen.intensidadeRegional;
  for (let i = i0; i < i1; i++) {
    const m = st.secMun[i];
    const z = nrm(ckP, st.secHash[i]);
    if (ufReal && col && ufReal[st.secUf[i]]) {
      // preferência REAL da seção: finalistas + transferência dos "outros" da própria seção
      const a = col.a[i];
      const bv = col.b[i];
      const o = col.outros[i];
      const val = a + bv + o;
      const pm = pref.p[m];
      let p = pm;
      if (val > 0) {
        const p1 = a + bv > 0 ? a / (a + bv) : 0.5;
        p = (a + transferencia(cen, p1) * o + K * pm) / (val + K);
      }
      p = clamp(p, MODELO.pMin, 1 - MODELO.pMin);
      base[i - i0] = mu + intens * (logit(p) - mu) + ruido * z;
    } else base[i - i0] = pref.L[m] + ruidoFallback * z;
  }

  const { delta, it } = calibraDelta(base, validos, alvo / 100);

  let s0 = 0;
  let sv = 0;
  let esperado = 0;
  for (let i = i0; i < i1; i++) {
    const vv = validos[i - i0];
    let L = base[i - i0] + delta;
    if (vies) L += vies[st.secUf[i]];
    const p = sigmoid(L);
    const mean = vv * p;
    const sd = Math.sqrt(mean * (1 - p));
    let a = Math.round(mean + sd * nrm(ckBin, st.secHash[i]));
    if (a < 0) a = 0;
    else if (a > vv) a = vv;
    v0[i] = a;
    v1[i] = vv - a;
    s0 += a;
    sv += vv;
    esperado += mean;
  }
  // O ruído binomial agregado (desvio-padrão ≈ 0,04 p.p. numa UF de 1,6 mi de válidos) é devolvido ao valor
  // esperado: ±1 voto em seções percorridas com passo coprimo (determinístico, efeito local desprezível).
  // Assim o total da corrida bate com o alvo (sem viés) com erro < 1 voto.
  let alvoVotos = Math.round(esperado);
  // Desempate neutro: com o alvo a menos de 1 voto do empate (ex.: alvo 50,00%), quem vence seria decidido
  // pelo arredondamento (x,5 sempre para cima) e pelo sinal do resíduo da calibragem — medido: com 50,00% para
  // Presidente, o candidato 0 vencia por 1 voto em 11 de 16 sementes e empatava nas outras 5 (nunca o 1).
  // Aqui o lado é sorteado pela semente (canal próprio, por corrida): 50/50 entre sementes, determinístico, e
  // sem empate exato (que deixaria a apuração encerrada sem vencedor): diferença mínima de 1 voto (2 se os
  // válidos forem pares).
  if (sv > 0 && Math.abs(2 * esperado - sv) < 2) {
    const paraO0 = uni(canalKey(seedK, Canal.Desempate), hashStr(r.id)) < 0.5;
    alvoVotos = paraO0 ? Math.floor(sv / 2) + 1 : Math.ceil(sv / 2) - 1;
  }
  let D = alvoVotos - s0;
  const ns = i1 - i0;
  if (D !== 0 && ns > 0) {
    let passo = Math.max(1, Math.floor(ns * 0.6180339887));
    while (gcd(passo, ns) !== 1) passo++;
    let j = triple32((seedK ^ 0x2f6b9a1d) >>> 0) % ns;
    for (let tent = 0; D !== 0 && tent < 4 * ns; tent++) {
      const i = i0 + j;
      if (D > 0 && v1[i] > 0) {
        v0[i]++;
        v1[i]--;
        D--;
        s0++;
      } else if (D < 0 && v0[i] > 0) {
        v0[i]--;
        v1[i]++;
        D++;
        s0--;
      }
      j += passo;
      if (j >= ns) j -= ns;
    }
  }
  return { race: r.id, alvo, delta, resultado: sv > 0 ? (100 * s0) / sv : 0, iteracoes: it };
}

/** Constrói o modelo completo para um cenário (já normalizado). */
export function buildModel(st: Structure, cen: ScenarioConfig, clock: () => number = Date.now): Model {
  const t0 = now();
  const etapas: Record<string, number> = {};
  let tt = t0;
  const marca = (nome: string) => {
    const t = now();
    etapas[nome] = Math.round((t - tt) * 10) / 10;
    tt = t;
  };

  const seedK = seedKey(cen.seed);
  const N = st.nSec;

  // 1. aptos
  const aptos = distribuiAptos(st, canalKey(seedK, Canal.Aptos));
  const pairEleitorado = new Float64Array(st.nPair);
  for (let i = 0; i < N; i++) pairEleitorado[st.secPair[i]] += aptos[i];
  marca('aptos');

  // 2. comparecimento (taxa real da seção, quando houver; senão a do município) + delta do cenário + ruído
  const comp = new Int32Array(N);
  {
    const ck = canalKey(seedK, Canal.Comparecimento);
    const delta = cen.comparecimentoDelta / 100;
    const K = MODELO.pseudoVotos;
    const real = st.real;
    const rm = new Float64Array(st.nMun);
    for (let m = 0; m < st.nMun; m++) {
      const t = st.mun[m].t1;
      rm[m] = t.eleitorado > 0 ? t.comparecimento / t.eleitorado : 0.8;
    }
    for (let i = 0; i < N; i++) {
      const m = st.secMun[i];
      let r = rm[m];
      let sigma = MODELO.sigmaComparecimento;
      if (real && real.ufPres[st.secUf[i]]) {
        r = clamp((real.pres.comp[i] + K * rm[m]) / (real.aptos[i] + K), 0, 1);
        sigma = MODELO.sigmaComparecimentoReal;
      }
      const lo = Math.min(0.35, r * 0.7);
      const hi = Math.min(1, Math.max(0.98, r));
      const taxa = clamp(r + delta + sigma * nrm(ck, st.secHash[i]), lo, hi);
      comp[i] = Math.round(aptos[i] * taxa);
    }
  }
  marca('comparecimento');

  // 3–5. votos (Presidente e Governadores)
  const pv0 = new Int32Array(N);
  const pv1 = new Int32Array(N);
  const pb = new Int32Array(N);
  const pn = new Int32Array(N);
  const gv0 = new Int32Array(N);
  const gv1 = new Int32Array(N);
  const gb = new Int32Array(N);
  const gn = new Int32Array(N);
  const pres = st.races.find((r) => r.kind === 'pres' && r.turno === 2) ?? null;
  let vies: Float64Array | null = null;
  const viesEntries = Object.entries(cen.ufVies ?? {}).filter(([, v]) => v);
  if (viesEntries.length) {
    vies = new Float64Array(st.nUf);
    for (const [uf, v] of viesEntries) {
      const u = st.ufIndex.get(uf);
      if (u !== undefined) vies[u] = viesLogit(Number(v));
    }
  }
  const calibPres = pres
    ? votosCorrida(st, pres, cen, seedK, comp, { b: pb, n: pn, v0: pv0, v1: pv1 }, cen.alvoPres, vies)
    : null;
  marca('votosPresidente');
  const calibGov: Calibragem[] = [];
  for (const g of st.govRaces) {
    calibGov.push(
      votosCorrida(st, g, cen, seedK, comp, { b: gb, n: gn, v0: gv0, v1: gv1 }, cen.alvoGov[g.id] ?? 50, null),
    );
  }
  marca('votosGovernador');

  // 6. chegada
  const chegada = calculaChegadas(st, cen, seedK);
  marca('chegada');

  // ordem de chegada (radix argsort estável: empate → menor índice primeiro)
  const ordem = radixArgsort(chegada, N);
  const chegadaOrd = new Int32Array(N);
  const rank = new Int32Array(N);
  for (let j = 0; j < N; j++) {
    const i = ordem[j];
    chegadaOrd[j] = chegada[i];
    rank[i] = j;
  }
  marca('ordenacao');

  const model: Model = {
    id: nextModelId++,
    key: cenarioKey(cen),
    cenario: cen,
    st,
    seedK,
    aptos,
    comp,
    pv0,
    pv1,
    pb,
    pn,
    gv0,
    gv1,
    gb,
    gn,
    chegada,
    ordem,
    chegadaOrd,
    rank,
    pairEleitorado,
    calib: { pres: calibPres, gov: calibGov },
    ufsSecaoReal: st.real ? st.real.nUfs : 0,
    timeline: null as unknown as Timeline,
    builtAt: clock(),
    buildMs: 0,
    etapas,
  };
  model.timeline = buildTimeline(model);
  marca('linhaDoTempo');
  model.buildMs = Math.round((now() - t0) * 10) / 10;
  return model;
}
