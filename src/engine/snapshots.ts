/**
 * Montagem dos snapshots (contratos de src/shared/types.ts) a partir do agregado de um instante.
 *
 * As funções `montaSummary`, `montaRestante` e `estadoMosaico` são puras e reaproveitáveis (ex.: adaptador
 * do TSE), para que as regras de status/líder/eleito/"para virar" sejam idênticas em todas as fontes.
 */
import { INICIO_APURACAO, MARGEM_BUCKETS } from '../shared/constants';
import type {
  FeedEvent,
  LocalResumo,
  MunicipioResumo,
  MunicipiosNacionalSnapshot,
  MunicipioSnapshot,
  NationalSnapshot,
  PrimeiroTurnoLocal,
  Regiao,
  Restante,
  SecaoDetalhe,
  SecaoResumo,
  SeriePoint,
  Summary,
  UF,
  UfSnapshot,
  ZonaMosaico,
  ZonaResumo,
  ZonaSnapshot,
} from '../shared/types';
import type { ResultadoPrimeiroTurno } from '../shared/dataset';
import { F, acumula, camposPar, somaMunicipios, type Agg } from './aggregate';
import { pctPar, pctSecoes } from './events';
import type { Model } from './model';
import { triple32 } from './rng';
import type { SerieBuf } from './series';
import { temSecaoReal, type ColunasT1, type RaceInfo, type Structure } from './structure';

// ---------------------------------------------------------------------------------------------
// Regras comuns
// ---------------------------------------------------------------------------------------------

export interface TallyInput {
  secoes: number;
  secoesTotalizadas: number;
  eleitorado: number;
  eleitoradoTotalizado: number;
  comparecimento: number;
  votos: number[];
  brancos: number;
  nulos: number;
  ultimaAtualizacao: number | null;
}

/**
 * Summary a partir das contagens.
 *  - status: 'aguardando' (0 seções) · 'apurando' · 'encerrada' (todas as seções);
 *  - lider: maior votação entre os `finalistas` primeiros candidatos (null sem votos ou empate exato);
 *  - eleito: diferença entre 1º e 2º > eleitorado não totalizado, ou apuração encerrada. Em corridas de
 *    1º turno (`turno1`), sempre null (as disputas foram ao 2º turno).
 */
export function montaSummary(t: TallyInput, opts: { turno1?: boolean; finalistas?: number } = {}): Summary {
  const fin = Math.min(opts.finalistas ?? t.votos.length, t.votos.length);
  let lider: number | null = null;
  let best = -1;
  let second = -1;
  for (let i = 0; i < fin; i++) {
    const v = t.votos[i];
    if (v > best) {
      second = best;
      best = v;
      lider = i;
    } else if (v > second) second = v;
  }
  if (best <= 0 || best === second) lider = null;
  const status: Summary['status'] =
    t.secoesTotalizadas <= 0 ? 'aguardando' : t.secoesTotalizadas >= t.secoes ? 'encerrada' : 'apurando';
  let eleito: number | null = null;
  if (!opts.turno1 && lider !== null) {
    const restante = t.eleitorado - t.eleitoradoTotalizado;
    if (status === 'encerrada' || best - Math.max(second, 0) > restante) eleito = lider;
  }
  return {
    secoes: t.secoes,
    secoesTotalizadas: t.secoesTotalizadas,
    eleitorado: t.eleitorado,
    eleitoradoTotalizado: t.eleitoradoTotalizado,
    comparecimento: t.comparecimento,
    abstencao: t.eleitoradoTotalizado - t.comparecimento,
    votos: t.votos,
    brancos: t.brancos,
    nulos: t.nulos,
    status,
    lider,
    eleito,
    ultimaAtualizacao: t.ultimaAtualizacao,
  };
}

/** O que falta apurar (só matemática): ver `Restante` em src/shared/types.ts. */
export function montaRestante(s: Summary): Restante {
  const eleitorado = Math.max(0, s.eleitorado - s.eleitoradoTotalizado);
  const validos = s.votos[0] + s.votos[1];
  const validosEstimados =
    s.eleitoradoTotalizado > 0 ? Math.round((eleitorado * validos) / s.eleitoradoTotalizado) : 0;
  let necessarioParaVirar: number | null = null;
  if (s.eleito === null && validosEstimados > 0 && s.secoesTotalizadas > 0) {
    const deficit = Math.abs(s.votos[0] - s.votos[1]);
    const x = (deficit / validosEstimados + 1) / 2;
    necessarioParaVirar = Math.round(Math.min(1, Math.max(0, x)) * 10000) / 100;
  }
  return { eleitorado, validosEstimados, necessarioParaVirar };
}

const C0 = 48; // '0'
const CA = 97; // 'a'
const CE = 101; // 'e'
const CX = 120; // 'x'
const CZ = 122; // 'z'

/** Caractere do mosaico para uma seção totalizada (ver ZonaMosaico). */
export function estadoMosaico(v0: number, v1: number): number {
  const t = v0 + v1;
  if (t <= 0) return CZ;
  if (v0 === v1) return CX;
  const pp = (100 * Math.abs(v0 - v1)) / t;
  const b = pp < MARGEM_BUCKETS[0] ? 0 : pp < MARGEM_BUCKETS[1] ? 1 : pp < MARGEM_BUCKETS[2] ? 2 : 3;
  return (v0 > v1 ? CA : CE) + b;
}

function codesToString(codes: Uint8Array): string {
  let s = '';
  const CH = 8192;
  for (let i = 0; i < codes.length; i += CH) s += String.fromCharCode.apply(null, Array.from(codes.subarray(i, i + CH)));
  return s;
}

/** Código fictício e determinístico do "boletim" de uma seção simulada: "0123 4567 8901 2345". */
export function codigoIdentificacao(secHash: number): string {
  const a = triple32((secHash ^ 0x51ed270b) >>> 0);
  const b = triple32((secHash ^ 0x2545f491) >>> 0);
  const d = (String(a % 100000000).padStart(8, '0') + String(b % 100000000).padStart(8, '0')).match(/.{4}/g)!;
  return d.join(' ');
}

/** Fatia de eventos com t ≤ tq, mais recentes primeiro, no máximo `max`. */
export function eventosAte(lista: FeedEvent[], tq: number, max = 60): FeedEvent[] {
  let lo = 0;
  let hi = lista.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lista[mid].t <= tq) lo = mid + 1;
    else hi = mid;
  }
  const out: FeedEvent[] = [];
  for (let i = lo - 1; i >= 0 && out.length < max; i--) out.push(lista[i]);
  return out;
}

/** Série até tq + ponto "ao vivo" (estado atual) se houver novidade desde o último ponto. */
export function serieAte(buf: SerieBuf, tq: number, atual: Summary): SeriePoint[] {
  let lo = 0;
  let hi = buf.t.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (buf.t[mid] <= tq) lo = mid + 1;
    else hi = mid;
  }
  const out: SeriePoint[] = new Array(lo);
  for (let i = 0; i < lo; i++) out[i] = { t: buf.t[i], pst: buf.pst[i], pv: [buf.pv0[i], buf.pv1[i]] };
  const lastK = lo > 0 ? buf.k[lo - 1] : 0;
  if (atual.secoesTotalizadas > lastK && atual.ultimaAtualizacao !== null) {
    const [a, b] = pctPar(atual.votos[0], atual.votos[1]);
    out.push({
      t: atual.ultimaAtualizacao,
      pst: pctSecoes(atual.secoesTotalizadas, atual.secoes),
      pv: [a, b],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 2º turno (modelo simulado)
// ---------------------------------------------------------------------------------------------

export interface Ctx {
  model: Model;
  agg: Agg;
  /** instante dos dados (bucket de 1 s) — fatia série e eventos */
  tq: number;
  /** relógio informado no snapshot */
  simNow: number;
  geradoEm: number;
}

const INI = INICIO_APURACAO;

function summaryCampos(a: Float64Array, o: number, secoes: number, eleitorado: number, gov: boolean): Summary {
  const last = a[o + F.LAST];
  return montaSummary({
    secoes,
    secoesTotalizadas: a[o + F.SEC],
    eleitorado,
    eleitoradoTotalizado: a[o + F.APT],
    comparecimento: a[o + F.COMP],
    votos: gov ? [a[o + F.G0], a[o + F.G1]] : [a[o + F.V0], a[o + F.V1]],
    brancos: gov ? a[o + F.GB] : a[o + F.B],
    nulos: gov ? a[o + F.GN] : a[o + F.N],
    ultimaAtualizacao: last >= 0 ? INI + last : null,
  });
}

const munSummary = (st: Structure, agg: Agg, m: number, gov: boolean) =>
  summaryCampos(agg.mun, m * F.STRIDE, st.munSecEnd[m] - st.munSecStart[m], st.munEleitorado[m], gov);

function ufCampos(st: Structure, agg: Agg, u: number): Float64Array {
  return somaMunicipios(agg.mun, st.ufMunStart[u], st.ufMunEnd[u]);
}

const ufSummaryFrom = (st: Structure, campos: Float64Array, u: number, gov: boolean) =>
  summaryCampos(campos, 0, st.ufSecEnd[u] - st.ufSecStart[u], st.ufEleitorado[u], gov);

export function municipioResumo(st: Structure, m: number, s: Summary): MunicipioResumo {
  const md = st.mun[m];
  return { cod: md.cod, ibge: md.ibge, nome: md.nome, capital: md.capital, ...s };
}

export function nacional2t(ctx: Ctx, r: RaceInfo): NationalSnapshot {
  const { model, agg, tq } = ctx;
  const st = model.st;
  const gov = r.kind === 'gov';
  const tl = model.timeline;
  if (gov) {
    const u = r.ufIdx;
    const resumo = ufSummaryFrom(st, ufCampos(st, agg, u), u, true);
    return {
      race: r.id,
      geradoEm: ctx.geradoEm,
      simNow: ctx.simNow,
      resumo,
      ufs: { [st.ufs[u]]: resumo },
      regioes: {},
      serie: serieAte(tl.gov[r.govSlot], tq, resumo),
      eventos: eventosAte(tl.evGov[r.govSlot], tq),
      restante: montaRestante(resumo),
    };
  }
  const total = new Float64Array(F.STRIDE);
  total[F.LAST] = -1;
  const regCampos = new Map<Regiao, { c: Float64Array; secoes: number; eleitorado: number }>();
  const ufs: Partial<Record<UF, Summary>> = {};
  for (let u = 0; u < st.nUf; u++) {
    const c = ufCampos(st, agg, u);
    ufs[st.ufs[u]] = ufSummaryFrom(st, c, u, false);
    acumula(total, c);
    const reg = st.ufRegiao[u];
    let rc = regCampos.get(reg);
    if (!rc) {
      const z = new Float64Array(F.STRIDE);
      z[F.LAST] = -1;
      rc = { c: z, secoes: 0, eleitorado: 0 };
      regCampos.set(reg, rc);
    }
    acumula(rc.c, c);
    rc.secoes += st.ufSecEnd[u] - st.ufSecStart[u];
    rc.eleitorado += st.ufEleitorado[u];
  }
  const regioes: Partial<Record<Regiao, Summary>> = {};
  for (const [reg, rc] of regCampos) regioes[reg] = summaryCampos(rc.c, 0, rc.secoes, rc.eleitorado, false);
  let eleitorado = 0;
  for (let u = 0; u < st.nUf; u++) eleitorado += st.ufEleitorado[u];
  const resumo = summaryCampos(total, 0, st.nSec, eleitorado, false);
  return {
    race: r.id,
    geradoEm: ctx.geradoEm,
    simNow: ctx.simNow,
    resumo,
    ufs,
    regioes,
    serie: serieAte(tl.presBr, tq, resumo),
    eventos: eventosAte(tl.evNacional, tq),
    restante: montaRestante(resumo),
  };
}

export function uf2t(ctx: Ctx, r: RaceInfo, u: number): UfSnapshot {
  const { model, agg, tq } = ctx;
  const st = model.st;
  const gov = r.kind === 'gov';
  const resumo = ufSummaryFrom(st, ufCampos(st, agg, u), u, gov);
  const municipios: MunicipioResumo[] = [];
  for (let m = st.ufMunStart[u]; m < st.ufMunEnd[u]; m++) {
    municipios.push(municipioResumo(st, m, munSummary(st, agg, m, gov)));
  }
  const tl = model.timeline;
  return {
    race: r.id,
    uf: st.ufs[u],
    geradoEm: ctx.geradoEm,
    simNow: ctx.simNow,
    resumo,
    municipios,
    serie: serieAte(gov ? tl.gov[r.govSlot] : tl.presUf[u], tq, resumo),
    eventos: eventosAte(gov ? tl.evGov[r.govSlot] : tl.evUf[u], tq),
    restante: montaRestante(resumo),
  };
}

function primeiroTurnoLocal(t: ResultadoPrimeiroTurno | undefined, r: RaceInfo): PrimeiroTurnoLocal | null {
  if (!t) return null;
  let v0 = 0;
  let v1 = 0;
  let validos = 0;
  for (const k in t.votos) {
    const v = t.votos[k];
    validos += v;
    if (k === r.num0) v0 += v;
    else if (k === r.num1) v1 += v;
  }
  return {
    votos: [v0, v1, validos - v0 - v1],
    brancos: t.brancos,
    nulos: t.nulos,
    comparecimento: t.comparecimento,
    eleitorado: t.eleitorado,
  };
}

export function municipio2t(ctx: Ctx, r: RaceInfo, m: number): MunicipioSnapshot {
  const { model, agg, tq } = ctx;
  const st = model.st;
  const gov = r.kind === 'gov';
  const md = st.mun[m];
  const zonas: ZonaResumo[] = [];
  const mosaico: ZonaMosaico[] = [];
  const k = agg.k;
  const { rank } = model;
  const a0 = gov ? model.gv0 : model.pv0;
  const a1 = gov ? model.gv1 : model.pv1;
  for (let p = st.munPairStart[m]; p < st.munPairEnd[m]; p++) {
    const s0 = st.pairSecStart[p];
    const s1 = st.pairSecEnd[p];
    zonas.push({
      zona: st.pairZona[p],
      ...summaryCampos(camposPar(model, p, k), 0, s1 - s0, model.pairEleitorado[p], gov),
    });
    const codes = new Uint8Array(s1 - s0);
    for (let i = s0; i < s1; i++) codes[i - s0] = rank[i] < k ? estadoMosaico(a0[i], a1[i]) : C0;
    mosaico.push({ zona: st.pairZona[p], faixas: st.pairFaixas[p], estado: codesToString(codes) });
  }
  return {
    race: r.id,
    uf: st.ufs[st.munUf[m]],
    cod: md.cod,
    ibge: md.ibge,
    nome: md.nome,
    capital: md.capital,
    geradoEm: ctx.geradoEm,
    simNow: ctx.simNow,
    resumo: munSummary(st, agg, m, gov),
    zonas,
    mosaico,
    primeiroTurno: primeiroTurnoLocal(gov ? md.t1gov : md.t1, r),
  };
}

function secaoResumo(model: Model, i: number, k: number, gov: boolean): SecaoResumo {
  const tot = model.rank[i] < k;
  return {
    secao: model.st.secNum[i],
    totalizada: tot,
    totalizadaEm: tot ? INI + model.chegada[i] : null,
    aptos: model.aptos[i],
    comparecimento: tot ? model.comp[i] : 0,
    votos: tot ? (gov ? [model.gv0[i], model.gv1[i]] : [model.pv0[i], model.pv1[i]]) : [0, 0],
    brancos: tot ? (gov ? model.gb[i] : model.pb[i]) : 0,
    nulos: tot ? (gov ? model.gn[i] : model.pn[i]) : 0,
  };
}

/** Local de votação de cada seção (índice global da seção → local), quando os locais da UF estão carregados. */
export type LocalDe = (i: number) => LocalResumo | undefined;

export function zona2t(ctx: Ctx, r: RaceInfo, p: number, localDe?: LocalDe): ZonaSnapshot {
  const { model, agg } = ctx;
  const st = model.st;
  const gov = r.kind === 'gov';
  const m = st.pairMun[p];
  const s0 = st.pairSecStart[p];
  const s1 = st.pairSecEnd[p];
  const secoes: SecaoResumo[] = new Array(s1 - s0);
  for (let i = s0; i < s1; i++) {
    const sr = secaoResumo(model, i, agg.k, gov);
    const loc = localDe?.(i);
    if (loc) sr.local = loc;
    secoes[i - s0] = sr;
  }
  return {
    race: r.id,
    uf: st.ufs[st.munUf[m]],
    cod: st.mun[m].cod,
    nomeMunicipio: st.mun[m].nome,
    zona: st.pairZona[p],
    geradoEm: ctx.geradoEm,
    simNow: ctx.simNow,
    resumo: summaryCampos(camposPar(model, p, agg.k), 0, s1 - s0, model.pairEleitorado[p], gov),
    secoes,
  };
}

export function secao2t(ctx: Ctx, r: RaceInfo, i: number, localDe?: LocalDe): SecaoDetalhe {
  const { model, agg } = ctx;
  const st = model.st;
  const gov = r.kind === 'gov';
  const s = secaoResumo(model, i, agg.k, gov);
  const loc = localDe?.(i);
  if (loc) s.local = loc;
  const m = st.secMun[i];
  return {
    ...s,
    race: r.id,
    uf: st.ufs[st.secUf[i]],
    cod: st.mun[m].cod,
    nomeMunicipio: st.mun[m].nome,
    zona: st.pairZona[st.secPair[i]],
    abstencao: s.totalizada ? s.aptos - s.comparecimento : 0,
    codigoIdentificacao: codigoIdentificacao(st.secHash[i]),
    simulado: true,
  };
}

// ---------------------------------------------------------------------------------------------
// 1º turno (dados oficiais do dataset, 100% totalizados)
// ---------------------------------------------------------------------------------------------

/** Campos por município das corridas de 1º turno. */
const T = { SEC: 0, ELEIT: 1, COMP: 2, V0: 3, V1: 4, VO: 5, B: 6, N: 7, STRIDE: 8 } as const;

export interface T1Data {
  r: RaceInfo;
  mun: Float64Array;
}

export function buildT1(st: Structure, r: RaceInfo): T1Data {
  const S = T.STRIDE;
  const mun = new Float64Array(st.nMun * S);
  const [m0, m1] = r.kind === 'pres' ? [0, st.nMun] : [st.ufMunStart[r.ufIdx], st.ufMunEnd[r.ufIdx]];
  for (let m = m0; m < m1; m++) {
    const t = r.kind === 'pres' ? st.mun[m].t1 : st.mun[m].t1gov;
    const o = m * S;
    mun[o + T.SEC] = st.munSecEnd[m] - st.munSecStart[m];
    if (!t) continue;
    const pt = primeiroTurnoLocal(t, r)!;
    mun[o + T.ELEIT] = t.eleitorado;
    mun[o + T.COMP] = t.comparecimento;
    mun[o + T.V0] = pt.votos[0];
    mun[o + T.V1] = pt.votos[1];
    mun[o + T.VO] = pt.votos[2];
    mun[o + T.B] = t.brancos;
    mun[o + T.N] = t.nulos;
  }
  return { r, mun };
}

function t1Summary(a: Float64Array, o: number): Summary {
  return montaSummary(
    {
      secoes: a[o + T.SEC],
      secoesTotalizadas: a[o + T.SEC],
      eleitorado: a[o + T.ELEIT],
      eleitoradoTotalizado: a[o + T.ELEIT],
      comparecimento: a[o + T.COMP],
      votos: [a[o + T.V0], a[o + T.V1], a[o + T.VO]],
      brancos: a[o + T.B],
      nulos: a[o + T.N],
      ultimaAtualizacao: null,
    },
    { turno1: true, finalistas: 2 },
  );
}

function t1Soma(d: T1Data, m0: number, m1: number, out = new Float64Array(T.STRIDE)): Float64Array {
  for (let m = m0; m < m1; m++) for (let f = 0; f < T.STRIDE; f++) out[f] += d.mun[m * T.STRIDE + f];
  return out;
}

const RESTANTE_ZERO: Restante = { eleitorado: 0, validosEstimados: 0, necessarioParaVirar: null };

export function nacional1t(st: Structure, d: T1Data, simNow: number, geradoEm: number): NationalSnapshot {
  const r = d.r;
  if (r.kind === 'gov') {
    const u = r.ufIdx;
    const resumo = t1Summary(t1Soma(d, st.ufMunStart[u], st.ufMunEnd[u]), 0);
    return {
      race: r.id,
      geradoEm,
      simNow,
      resumo,
      ufs: { [st.ufs[u]]: resumo },
      regioes: {},
      serie: [],
      eventos: [],
      restante: { ...RESTANTE_ZERO },
    };
  }
  const total = new Float64Array(T.STRIDE);
  const reg = new Map<Regiao, Float64Array>();
  const ufs: Partial<Record<UF, Summary>> = {};
  for (let u = 0; u < st.nUf; u++) {
    const c = t1Soma(d, st.ufMunStart[u], st.ufMunEnd[u]);
    ufs[st.ufs[u]] = t1Summary(c, 0);
    for (let f = 0; f < T.STRIDE; f++) total[f] += c[f];
    const rg = st.ufRegiao[u];
    const rc = reg.get(rg) ?? new Float64Array(T.STRIDE);
    for (let f = 0; f < T.STRIDE; f++) rc[f] += c[f];
    reg.set(rg, rc);
  }
  const regioes: Partial<Record<Regiao, Summary>> = {};
  for (const [rg, c] of reg) regioes[rg] = t1Summary(c, 0);
  return {
    race: r.id,
    geradoEm,
    simNow,
    resumo: t1Summary(total, 0),
    ufs,
    regioes,
    serie: [],
    eventos: [],
    restante: { ...RESTANTE_ZERO },
  };
}

export function uf1t(st: Structure, d: T1Data, u: number, simNow: number, geradoEm: number): UfSnapshot {
  const municipios: MunicipioResumo[] = [];
  for (let m = st.ufMunStart[u]; m < st.ufMunEnd[u]; m++) municipios.push(municipioResumo(st, m, t1Summary(d.mun, m * T.STRIDE)));
  return {
    race: d.r.id,
    uf: st.ufs[u],
    geradoEm,
    simNow,
    resumo: t1Summary(t1Soma(d, st.ufMunStart[u], st.ufMunEnd[u]), 0),
    municipios,
    serie: [],
    eventos: [],
    restante: { ...RESTANTE_ZERO },
  };
}

/** Colunas reais do 1º turno da corrida (Presidente ou Governador), se a UF tiver o arquivo de seções. */
function colunasReais(st: Structure, r: RaceInfo, u: number): ColunasT1 | null {
  if (!temSecaoReal(st, r, u)) return null;
  return r.kind === 'gov' ? st.real!.gov : st.real!.pres;
}

/** As seções reais do município somam exatamente o resultado oficial (ver SecaoReal.munConfere). */
export function municipioConfere(st: Structure, r: RaceInfo, m: number): boolean {
  if (!colunasReais(st, r, st.munUf[m])) return false;
  return (r.kind === 'gov' ? st.real!.munConfereGov : st.real!.munConfere)[m] === 1;
}

/** Soma das seções reais [i0, i1) no layout T (1º turno). */
function t1SomaSecoes(st: Structure, c: ColunasT1, i0: number, i1: number): Float64Array {
  const out = new Float64Array(T.STRIDE);
  const ap = c.aptos;
  for (let i = i0; i < i1; i++) {
    out[T.ELEIT] += ap[i];
    out[T.COMP] += c.comp[i];
    out[T.V0] += c.a[i];
    out[T.V1] += c.b[i];
    out[T.VO] += c.outros[i];
    out[T.B] += c.brancos[i];
    out[T.N] += c.nulos[i];
  }
  out[T.SEC] = i1 - i0;
  return out;
}

/** Caractere do mosaico do 1º turno: finalista à frente e margem entre os dois em % de TODOS os válidos. */
function estadoMosaicoT1(v0: number, v1: number, validos: number): number {
  if (validos <= 0) return CZ;
  if (v0 === v1) return CX;
  const pp = (100 * Math.abs(v0 - v1)) / validos;
  const b = pp < MARGEM_BUCKETS[0] ? 0 : pp < MARGEM_BUCKETS[1] ? 1 : pp < MARGEM_BUCKETS[2] ? 2 : 3;
  return (v0 > v1 ? CA : CE) + b;
}

/**
 * Município no 1º turno.
 *  - Com o 1º turno REAL por seção (e as seções somando o total oficial do município): `zonas` reais (uma
 *    linha por zona) e `mosaico` seção a seção, colorido pelo resultado REAL de cada seção;
 *  - sem ele: `zonas` tem UMA linha com `zona: 0` (= todas as zonas) e o total do município, e o `mosaico`
 *    lista as zonas reais com todas as seções coloridas pelo resultado do MUNICÍPIO.
 * Em ambos: `primeiroTurno` = null (o próprio resumo já é o 1º turno).
 */
export function municipio1t(st: Structure, d: T1Data, m: number, simNow: number, geradoEm: number): MunicipioSnapshot {
  const md = st.mun[m];
  const o = m * T.STRIDE;
  const resumo = t1Summary(d.mun, o);
  const base = {
    race: d.r.id,
    uf: st.ufs[st.munUf[m]],
    cod: md.cod,
    ibge: md.ibge,
    nome: md.nome,
    capital: md.capital,
    geradoEm,
    simNow,
    resumo,
    primeiroTurno: null,
  };
  const col = municipioConfere(st, d.r, m) ? colunasReais(st, d.r, st.munUf[m]) : null;
  if (col) {
    const zonas: ZonaResumo[] = [];
    const mosaico: ZonaMosaico[] = [];
    for (let p = st.munPairStart[m]; p < st.munPairEnd[m]; p++) {
      const s0 = st.pairSecStart[p];
      const s1 = st.pairSecEnd[p];
      zonas.push({ zona: st.pairZona[p], ...t1Summary(t1SomaSecoes(st, col, s0, s1), 0) });
      const codes = new Uint8Array(s1 - s0);
      for (let i = s0; i < s1; i++) codes[i - s0] = estadoMosaicoT1(col.a[i], col.b[i], col.a[i] + col.b[i] + col.outros[i]);
      mosaico.push({ zona: st.pairZona[p], faixas: st.pairFaixas[p], estado: codesToString(codes) });
    }
    return { ...base, zonas, mosaico };
  }
  const v0 = d.mun[o + T.V0];
  const v1 = d.mun[o + T.V1];
  const c = String.fromCharCode(estadoMosaicoT1(v0, v1, v0 + v1 + d.mun[o + T.VO]));
  const mosaico: ZonaMosaico[] = [];
  for (let p = st.munPairStart[m]; p < st.munPairEnd[m]; p++) {
    mosaico.push({ zona: st.pairZona[p], faixas: st.pairFaixas[p], estado: c.repeat(st.pairSecEnd[p] - st.pairSecStart[p]) });
  }
  return { ...base, zonas: [{ zona: 0, ...resumo }], mosaico };
}

/** A corrida de 1º turno tem resultados reais por seção nesta UF (zona/seção do 1º turno disponíveis). */
export const t1TemSecao = (st: Structure, r: RaceInfo, u: number) => colunasReais(st, r, u) !== null;

function secaoResumoT1(st: Structure, c: ColunasT1, i: number): SecaoResumo {
  return {
    secao: st.secNum[i],
    totalizada: true,
    totalizadaEm: null,
    aptos: c.aptos[i],
    comparecimento: c.comp[i],
    votos: [c.a[i], c.b[i], c.outros[i]],
    brancos: c.brancos[i],
    nulos: c.nulos[i],
  };
}

/** Zona no 1º turno com os números REAIS de cada seção (requer `t1TemSecao`). */
export function zona1t(st: Structure, r: RaceInfo, p: number, simNow: number, geradoEm: number, localDe?: LocalDe): ZonaSnapshot {
  const m = st.pairMun[p];
  const c = colunasReais(st, r, st.munUf[m])!;
  const s0 = st.pairSecStart[p];
  const s1 = st.pairSecEnd[p];
  const secoes: SecaoResumo[] = new Array(s1 - s0);
  for (let i = s0; i < s1; i++) {
    const sr = secaoResumoT1(st, c, i);
    const loc = localDe?.(i);
    if (loc) sr.local = loc;
    secoes[i - s0] = sr;
  }
  return {
    race: r.id,
    uf: st.ufs[st.munUf[m]],
    cod: st.mun[m].cod,
    nomeMunicipio: st.mun[m].nome,
    zona: st.pairZona[p],
    geradoEm,
    simNow,
    resumo: t1Summary(t1SomaSecoes(st, c, s0, s1), 0),
    secoes,
  };
}

/**
 * Boletim de uma seção no 1º turno com os números REAIS (dados abertos do TSE). `simulado: false` e, como o
 * código de identificação da urna não vem nos dados abertos, `codigoIdentificacao` = '' (não inventamos).
 */
export function secao1t(st: Structure, r: RaceInfo, i: number, localDe?: LocalDe): SecaoDetalhe {
  const m = st.secMun[i];
  const c = colunasReais(st, r, st.munUf[m])!;
  const s = secaoResumoT1(st, c, i);
  const loc = localDe?.(i);
  if (loc) s.local = loc;
  return {
    ...s,
    race: r.id,
    uf: st.ufs[st.secUf[i]],
    cod: st.mun[m].cod,
    nomeMunicipio: st.mun[m].nome,
    zona: st.pairZona[st.secPair[i]],
    abstencao: s.aptos - s.comparecimento,
    codigoIdentificacao: '',
    simulado: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Mapa nacional por município (MunicipiosNacionalSnapshot)
// ---------------------------------------------------------------------------------------------

/** Linha do mapa nacional: −1 sem votos válidos · 0/1 à frente · 2 empate. Inteiros conforme o contrato. */
function linhaMapa(
  out: MunicipiosNacionalSnapshot,
  j: number,
  v0: number,
  v1: number,
  validos: number,
  secTot: number,
  secoes: number,
  comp: number,
  eleitTot: number,
): void {
  const lider = validos <= 0 ? -1 : v0 > v1 ? 0 : v1 > v0 ? 1 : 2;
  out.lider[j] = lider;
  out.margem[j] = validos > 0 ? Math.round((1000 * Math.abs(v0 - v1)) / validos) : 0;
  // truncado: 100,0% só com todas as seções
  out.apurado[j] = secoes > 0 ? Math.floor((1000 * secTot) / secoes) : 0;
  out.comparecimento[j] = eleitTot > 0 ? Math.round((1000 * comp) / eleitTot) : 0;
  out.pct0[j] = validos > 0 ? Math.round((10000 * v0) / validos) : 0;
  if (lider === 0 || lider === 1) out.municipiosLiderados[lider]++;
}

function mapaVazio(race: string, n: number, simNow: number, geradoEm: number): MunicipiosNacionalSnapshot {
  return {
    race,
    geradoEm,
    simNow,
    lider: new Array<number>(n).fill(-1),
    margem: new Array<number>(n).fill(0),
    apurado: new Array<number>(n).fill(0),
    comparecimento: new Array<number>(n).fill(0),
    pct0: new Array<number>(n).fill(0),
    municipiosLiderados: [0, 0],
  };
}

/**
 * 2º turno: arrays alinhados com `ordem` (índice do município na estrutura por posição; −1 = sem
 * correspondência). Fora do escopo da corrida (governador de outra UF): sem votos (−1, zeros).
 */
export function municipiosBr2t(ctx: Ctx, r: RaceInfo, ordem: Int32Array): MunicipiosNacionalSnapshot {
  const { model, agg } = ctx;
  const st = model.st;
  const gov = r.kind === 'gov';
  const out = mapaVazio(r.id, ordem.length, ctx.simNow, ctx.geradoEm);
  const S = F.STRIDE;
  const a = agg.mun;
  for (let j = 0; j < ordem.length; j++) {
    const m = ordem[j];
    if (m < 0 || (gov && st.munUf[m] !== r.ufIdx)) continue;
    const o = m * S;
    const v0 = gov ? a[o + F.G0] : a[o + F.V0];
    const v1 = gov ? a[o + F.G1] : a[o + F.V1];
    linhaMapa(out, j, v0, v1, v0 + v1, a[o + F.SEC], st.munSecEnd[m] - st.munSecStart[m], a[o + F.COMP], a[o + F.APT]);
  }
  return out;
}

/** 1º turno (dataset oficial, 100% totalizado): margem e % do candidato 0 sobre TODOS os válidos. */
export function municipiosBr1t(st: Structure, d: T1Data, ordem: Int32Array, simNow: number, geradoEm: number): MunicipiosNacionalSnapshot {
  const r = d.r;
  const out = mapaVazio(r.id, ordem.length, simNow, geradoEm);
  const S = T.STRIDE;
  for (let j = 0; j < ordem.length; j++) {
    const m = ordem[j];
    if (m < 0 || (r.kind === 'gov' && st.munUf[m] !== r.ufIdx)) continue;
    const o = m * S;
    const v0 = d.mun[o + T.V0];
    const v1 = d.mun[o + T.V1];
    const sec = d.mun[o + T.SEC];
    linhaMapa(out, j, v0, v1, v0 + v1 + d.mun[o + T.VO], sec, sec, d.mun[o + T.COMP], d.mun[o + T.ELEIT]);
  }
  return out;
}
