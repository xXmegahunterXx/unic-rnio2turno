/**
 * Linha do tempo pré-calculada (na construção do modelo, uma passada O(N) na ordem de chegada):
 *  - séries (`SeriePoint`) por escopo: Brasil/Presidente, cada UF/Presidente e cada corrida de Governador —
 *    um ponto a cada 0,25% das seções do escopo ou a cada ≥ 1 min simulado com novidade;
 *  - eventos (`FeedEvent`) — ver regras em ARCHITECTURE.md §5.2:
 *    · Presidente, feed nacional: início, marcos 1/5/10/25/50/75/90/95/99/100%, liderança e viradas
 *      nacionais (virada só com > 5%; histerese de 0,02 p.p.), viradas por UF relevantes (UF com ≥ 10%
 *      apurado, no máximo 1 evento por UF a cada 10 min simulados), "UF conclui a apuração" e
 *      "matematicamente eleito";
 *    · Presidente, feed da UF: início e eleição (nacionais) + liderança inicial na UF (≥ 5%), viradas na UF,
 *      metade das seções e conclusão;
 *    · Governador: início, marcos 10/25/50/75/90/100%, liderança/virada e vitória matemática.
 * Os snapshots só fatiam estes arrays por `simNow` (busca binária).
 */
import { INICIO_APURACAO } from '../shared/constants';
import type { FeedEvent, Race, TipoEvento, UF } from '../shared/types';
import { pctPar, pctSecoes, textos } from './events';
import type { Model } from './model';
import type { RaceInfo } from './structure';

export interface SerieBuf {
  /** epoch ms */
  t: number[];
  /** seções totalizadas no escopo nesse ponto */
  k: number[];
  pst: number[];
  pv0: number[];
  pv1: number[];
}

export interface Timeline {
  presBr: SerieBuf;
  presUf: SerieBuf[];
  gov: SerieBuf[];
  /** Feed nacional de Presidente (ordem cronológica). */
  evNacional: FeedEvent[];
  /** Feed de Presidente por UF (índice da UF). */
  evUf: FeedEvent[][];
  /** Feed de cada corrida de Governador (govSlot). */
  evGov: FeedEvent[][];
}

export const SERIE_PASSO_PCT = 0.25;
export const SERIE_PASSO_MS = 60_000;
export const MARCOS_BR = [1, 5, 10, 25, 50, 75, 90, 95, 99, 100];
export const MARCOS_GOV = [10, 25, 50, 75, 90, 100];
const HISTERESE_BR_PP = 0.02;
const HISTERESE_GOV_PP = 0.05;
const HISTERESE_UF_PP = 0.1;
const UF_MIN_PCT_LIDER = 5;
const UF_MIN_PCT_NACIONAL = 10;
const UF_INTERVALO_MS = 10 * 60_000;
const GOV_INTERVALO_MS = 5 * 60_000;

/** Acompanha um escopo (contagens correntes + série). */
class Escopo {
  k = 0;
  v0 = 0;
  v1 = 0;
  apt = 0;
  lastK = 0;
  lastT = 0;
  readonly passo: number;
  readonly buf: SerieBuf = { t: [], k: [], pst: [], pv0: [], pv1: [] };
  // estado de liderança anunciada
  anunciado: number | null = null;
  temAnuncio = false;
  ultimoEvT = -Infinity;
  eleito = false;
  proxMarco = 0;
  constructor(
    readonly secoes: number,
    readonly eleitorado: number,
  ) {
    this.passo = Math.max(1, Math.ceil((secoes * SERIE_PASSO_PCT) / 100));
  }
  get pct() {
    return this.secoes > 0 ? (100 * this.k) / this.secoes : 0;
  }
  /** Registra ponto se a regra de amostragem pedir. Retorna true se registrou. */
  ponto(t: number): boolean {
    const k = this.k;
    if (k === this.lastK) return false;
    const ok =
      k === this.secoes || k - this.lastK >= this.passo || (this.lastK > 0 && t - this.lastT >= SERIE_PASSO_MS);
    if (!ok) return false;
    const [a, b] = pctPar(this.v0, this.v1);
    const buf = this.buf;
    buf.t.push(t);
    buf.k.push(k);
    buf.pst.push(pctSecoes(k, this.secoes));
    buf.pv0.push(a);
    buf.pv1.push(b);
    this.lastK = k;
    this.lastT = t;
    return true;
  }
  lider(): number | null {
    return this.v0 > this.v1 ? 0 : this.v1 > this.v0 ? 1 : null;
  }
  margemPP(): number {
    const t = this.v0 + this.v1;
    return t > 0 ? (100 * Math.abs(this.v0 - this.v1)) / t : 0;
  }
}

export function buildTimeline(model: Model): Timeline {
  const st = model.st;
  const N = st.nSec;
  const INI = INICIO_APURACAO;
  const { ordem, chegada, aptos, pv0, pv1, gv0, gv1 } = model;

  const presInfo = st.races.find((r) => r.kind === 'pres' && r.turno === 2) as RaceInfo | undefined;
  const presRace = presInfo?.race as Race;
  const presId = presInfo?.id ?? 'pres';

  const br = new Escopo(N, st.munEleitorado.reduce((a, b) => a + b, 0));
  const ufs = st.ufs.map((_, u) => new Escopo(st.ufSecEnd[u] - st.ufSecStart[u], st.ufEleitorado[u]));
  const govs = st.govRaces.map((g) => new Escopo(st.ufSecEnd[g.ufIdx] - st.ufSecStart[g.ufIdx], st.ufEleitorado[g.ufIdx]));
  const ufMetadeK = ufs.map((e) => Math.ceil(e.secoes / 2));
  const marcoKBr = MARCOS_BR.map((m) => Math.max(1, Math.ceil((m * N) / 100)));
  const marcoKGov = govs.map((e) => MARCOS_GOV.map((m) => Math.max(1, Math.ceil((m * e.secoes) / 100))));

  const evNacional: FeedEvent[] = [];
  const evUf: FeedEvent[][] = st.ufs.map(() => []);
  const evGov: FeedEvent[][] = st.govRaces.map(() => []);
  const seq = new Map<string, number>();
  const mk = (
    race: string,
    t: number,
    tipo: TipoEvento,
    abrangencia: 'BR' | UF,
    txt: { titulo: string; detalhe?: string },
    candidato?: number,
  ): FeedEvent => {
    const n = (seq.get(race) ?? 0) + 1;
    seq.set(race, n);
    const ev: FeedEvent = { id: `${race}:${n}`, t, tipo, abrangencia, race, titulo: txt.titulo };
    if (txt.detalhe) ev.detalhe = txt.detalhe;
    if (candidato !== undefined) ev.candidato = candidato;
    return ev;
  };

  // início
  if (presInfo) {
    const ev = mk(presId, INI, 'inicio', 'BR', textos.inicio(presRace));
    evNacional.push(ev);
    for (const l of evUf) l.push(ev);
  }
  st.govRaces.forEach((g, gi) => evGov[gi].push(mk(g.id, INI, 'inicio', g.uf as UF, textos.inicio(g.race))));

  const ufNome = st.ufMeta.map((u) => u.nome);

  for (let j = 0; j < N; j++) {
    const i = ordem[j];
    const t = INI + chegada[i];
    const u = st.secUf[i];
    const gs = st.ufGovSlot[u];
    const a = aptos[i];
    const uf = st.ufs[u];

    br.k++;
    br.v0 += pv0[i];
    br.v1 += pv1[i];
    br.apt += a;
    const e = ufs[u];
    e.k++;
    e.v0 += pv0[i];
    e.v1 += pv1[i];
    e.apt += a;
    const g = gs >= 0 ? govs[gs] : null;
    if (g) {
      g.k++;
      g.v0 += gv0[i];
      g.v1 += gv1[i];
      g.apt += a;
    }
    if (!presInfo) continue;

    // --- UF (Presidente) ---
    if (e.k === e.secoes) {
      const ev = mk(presId, t, 'uf-encerrada', uf, textos.ufEncerrada(presRace, uf, ufNome[u], e.v0, e.v1), e.lider() ?? undefined);
      evNacional.push(ev);
      evUf[u].push(ev);
    } else if (e.k === ufMetadeK[u]) {
      evUf[u].push(mk(presId, t, 'marco', uf, textos.ufMetade(presRace, uf, ufNome[u], e.v0, e.v1)));
    }
    if (e.ponto(t)) {
      const lider = e.lider();
      if (!e.temAnuncio) {
        if (e.pct >= UF_MIN_PCT_LIDER && lider !== null) {
          evUf[u].push(
            mk(presId, t, 'lideranca', uf, textos.ufSaiNaFrente(presRace, uf, ufNome[u], lider, e.pct, e.v0, e.v1), lider),
          );
          e.temAnuncio = true;
          e.anunciado = lider;
          e.ultimoEvT = t;
        }
      } else if (
        lider !== null &&
        lider !== e.anunciado &&
        e.margemPP() >= HISTERESE_UF_PP &&
        t - e.ultimoEvT >= UF_INTERVALO_MS
      ) {
        const ev = mk(presId, t, 'virada', uf, textos.ufPassaAFrente(presRace, uf, ufNome[u], lider, e.pct, e.v0, e.v1), lider);
        evUf[u].push(ev);
        if (e.pct >= UF_MIN_PCT_NACIONAL) evNacional.push(ev);
        e.anunciado = lider;
        e.ultimoEvT = t;
      }
    }

    // --- Brasil (Presidente) ---
    while (br.proxMarco < marcoKBr.length && br.k >= marcoKBr[br.proxMarco]) {
      evNacional.push(mk(presId, t, 'marco', 'BR', textos.marco(presRace, MARCOS_BR[br.proxMarco], br.v0, br.v1)));
      br.proxMarco++;
    }
    if (br.ponto(t)) liderancaGeral(br, presInfo, t, HISTERESE_BR_PP, 0, evNacional, mk, 1);
    if (!br.eleito) eleitoCheck(br, presInfo, t, mk, (ev) => {
      evNacional.push(ev);
      for (const l of evUf) l.push(ev);
    });

    // --- Governador ---
    if (g && gs >= 0) {
      const gr = st.govRaces[gs];
      const lista = evGov[gs];
      const mks = marcoKGov[gs];
      while (g.proxMarco < mks.length && g.k >= mks[g.proxMarco]) {
        lista.push(mk(gr.id, t, 'marco', gr.uf as UF, textos.marco(gr.race, MARCOS_GOV[g.proxMarco], g.v0, g.v1)));
        g.proxMarco++;
      }
      if (g.ponto(t)) liderancaGeral(g, gr, t, HISTERESE_GOV_PP, GOV_INTERVALO_MS, lista, mk, 1);
      if (!g.eleito) eleitoCheck(g, gr, t, mk, (ev) => lista.push(ev));
    }
  }

  return {
    presBr: br.buf,
    presUf: ufs.map((e) => e.buf),
    gov: govs.map((e) => e.buf),
    evNacional,
    evUf,
    evGov,
  };
}

type Mk = (
  race: string,
  t: number,
  tipo: TipoEvento,
  abrangencia: 'BR' | UF,
  txt: { titulo: string; detalhe?: string },
  candidato?: number,
) => FeedEvent;

/** Liderança inicial (a partir de `pctMin`%) e viradas (com histerese) num escopo de corrida inteira. */
function liderancaGeral(
  e: Escopo,
  r: RaceInfo,
  t: number,
  histerese: number,
  intervalo: number,
  lista: FeedEvent[],
  mk: Mk,
  pctMin: number,
) {
  const abr: 'BR' | UF = r.kind === 'pres' ? 'BR' : (r.uf as UF);
  const lider = e.lider();
  if (lider === null) return;
  if (!e.temAnuncio) {
    if (e.pct >= pctMin) {
      lista.push(mk(r.id, t, 'lideranca', abr, textos.saiNaFrente(r.race, lider, e.pct, e.v0, e.v1), lider));
      e.temAnuncio = true;
      e.anunciado = lider;
      e.ultimoEvT = t;
    }
    return;
  }
  if (lider !== e.anunciado && e.margemPP() >= histerese && t - e.ultimoEvT >= intervalo) {
    const tipo: TipoEvento = e.pct > 5 ? 'virada' : 'lideranca';
    lista.push(mk(r.id, t, tipo, abr, textos.passaAFrente(r.race, lider, e.pct, e.v0, e.v1), lider));
    e.anunciado = lider;
    e.ultimoEvT = t;
  }
}

/** "Matematicamente eleito": diferença > eleitorado ainda não totalizado (mesma regra de Summary.eleito). */
function eleitoCheck(e: Escopo, r: RaceInfo, t: number, mk: Mk, push: (ev: FeedEvent) => void) {
  if (e.v0 === e.v1) return;
  const diff = Math.abs(e.v0 - e.v1);
  const restante = e.eleitorado - e.apt;
  if (diff <= restante && e.k < e.secoes) return;
  const lider = e.v0 > e.v1 ? 0 : 1;
  const abr: 'BR' | UF = r.kind === 'pres' ? 'BR' : (r.uf as UF);
  const txt = e.k >= e.secoes ? textos.vence(r.race, lider, e.v0, e.v1) : textos.eleito(r.race, lider, e.pct, diff, restante);
  push(mk(r.id, t, 'eleito', abr, txt, lider));
  e.eleito = true;
}
