/**
 * Estrutura do país (independente do cenário): UFs → municípios → zonas → seções, em arrays tipados
 * (Struct of Arrays). Construída uma vez a partir do dataset e reaproveitada a cada reconstrução do modelo.
 *
 * Ordem canônica: UFs na ordem de `meta.ufs`; municípios, zonas e seções na ordem do dataset. Seções de um
 * município (e de cada par município×zona) são contíguas.
 */
import type { MunicipioDataset, UfMeta } from '../shared/dataset';
import type { Race, RaceId, Regiao, UF } from '../shared/types';
import type { LoadedDataset } from './api';
import { hashStr, triple32 } from './rng';

export interface RaceInfo {
  id: RaceId;
  race: Race;
  turno: 1 | 2;
  kind: 'pres' | 'gov';
  /** Governador: UF da disputa. Presidente: null. */
  uf: UF | null;
  ufIdx: number;
  /** Números dos dois finalistas (chaves de `votos` no 1º turno), na ordem de `race.candidatos`. */
  num0: string;
  num1: string;
  /** Índice da corrida de governador (0..nGov-1), igual no 1º e no 2º turno; −1 para Presidente. */
  govSlot: number;
  /** Corrida correspondente do outro turno ('pres' ↔ 'pres-t1'). */
  par: RaceId | null;
}

export interface Structure {
  ds: LoadedDataset;
  races: RaceInfo[];
  raceMap: Map<string, RaceInfo>;
  /** Corridas de governador do 2º turno, por govSlot. */
  govRaces: RaceInfo[];

  nUf: number;
  ufs: UF[];
  ufIndex: Map<string, number>;
  ufMeta: UfMeta[];
  ufRegiao: Regiao[];
  ufMunStart: Int32Array;
  ufMunEnd: Int32Array;
  ufSecStart: Int32Array;
  ufSecEnd: Int32Array;
  ufEleitorado: Float64Array;
  /** govSlot da UF (−1 se a UF não tem 2º turno de governador). */
  ufGovSlot: Int8Array;
  ufHash: Uint32Array;

  nMun: number;
  mun: MunicipioDataset[];
  munUf: Uint8Array;
  munSecStart: Int32Array;
  munSecEnd: Int32Array;
  munPairStart: Int32Array;
  munPairEnd: Int32Array;
  munEleitorado: Float64Array;
  /** `${UF}|${cod}` → índice do município. */
  munKey: Map<string, number>;
  munHash: Uint32Array;

  nPair: number;
  pairMun: Int32Array;
  pairZona: Int32Array;
  pairFaixas: string[];
  pairSecStart: Int32Array;
  pairSecEnd: Int32Array;

  nSec: number;
  secMun: Int32Array;
  secPair: Int32Array;
  secNum: Int32Array;
  secUf: Uint8Array;
  /** Hash estável da identidade da seção (uf, município, zona, número): base de todo o ruído. */
  secHash: Uint32Array;
  /** Hash da zona eleitoral (uf, zona) — zonas podem cobrir vários municípios. */
  secZonaHash: Uint32Array;
}

/** Decodifica "1-120,135" chamando `cb` para cada número (sem alocar arrays). */
export function forEachFaixa(faixas: string, cb: (n: number) => void): void {
  let i = 0;
  const L = faixas.length;
  while (i < L) {
    let a = 0;
    while (i < L) {
      const c = faixas.charCodeAt(i);
      if (c < 48 || c > 57) break;
      a = a * 10 + (c - 48);
      i++;
    }
    let b = a;
    if (i < L && faixas.charCodeAt(i) === 45 /* - */) {
      i++;
      b = 0;
      while (i < L) {
        const c = faixas.charCodeAt(i);
        if (c < 48 || c > 57) break;
        b = b * 10 + (c - 48);
        i++;
      }
    }
    for (let n = a; n <= b; n++) cb(n);
    if (i < L && faixas.charCodeAt(i) === 44 /* , */) i++;
    else if (i < L) throw new Error(`Faixa de seções inválida: "${faixas}"`);
  }
}

function contaFaixa(faixas: string): number {
  let n = 0;
  forEachFaixa(faixas, () => n++);
  return n;
}

function raceInfos(races: Race[], ufIndex: Map<string, number>): RaceInfo[] {
  const govIds = races.filter((r) => r.cargo === 'Governador' && r.turno === 2).map((r) => r.id);
  return races.map((r) => {
    const kind = r.cargo === 'Presidente' ? 'pres' : 'gov';
    const uf = kind === 'gov' ? (r.abrangencia as UF) : null;
    const base = r.turno === 2 ? r.id : r.id.replace(/-t1$/, '');
    const par = r.turno === 2 ? `${r.id}-t1` : base;
    const finalistas = r.candidatos.filter((c) => !c.agregado);
    if (finalistas.length !== 2) throw new Error(`Corrida ${r.id}: esperava 2 finalistas, há ${finalistas.length}`);
    return {
      id: r.id,
      race: r,
      turno: r.turno,
      kind,
      uf,
      ufIdx: uf ? (ufIndex.get(uf) ?? -1) : -1,
      num0: String(finalistas[0].numero),
      num1: String(finalistas[1].numero),
      govSlot: kind === 'gov' ? govIds.indexOf(base) : -1,
      par: races.some((x) => x.id === par) ? par : null,
    } satisfies RaceInfo;
  });
}

export function buildStructure(ds: LoadedDataset): Structure {
  const meta = ds.meta;
  const ufMeta = meta.ufs;
  const ufs = ufMeta.map((u) => u.uf);
  const nUf = ufs.length;
  const ufIndex = new Map<string, number>(ufs.map((u, i) => [u, i]));

  const races = raceInfos(meta.races, ufIndex);
  const raceMap = new Map(races.map((r) => [r.id, r]));
  const govRaces = races.filter((r) => r.kind === 'gov' && r.turno === 2).sort((a, b) => a.govSlot - b.govSlot);
  for (const r of races) if (r.kind === 'gov' && r.ufIdx < 0) throw new Error(`Corrida ${r.id}: UF desconhecida`);

  // 1ª passada: contagens
  let nMun = 0;
  let nPair = 0;
  let nSec = 0;
  for (const u of ufs) {
    const d = ds.ufs[u];
    if (!d) throw new Error(`Dataset sem a UF ${u}`);
    nMun += d.municipios.length;
    for (const m of d.municipios) {
      nPair += m.zonas.length;
      for (const z of m.zonas) nSec += contaFaixa(z.s);
    }
  }

  const st: Structure = {
    ds,
    races,
    raceMap,
    govRaces,
    nUf,
    ufs,
    ufIndex,
    ufMeta,
    ufRegiao: ufMeta.map((u) => u.regiao),
    ufMunStart: new Int32Array(nUf),
    ufMunEnd: new Int32Array(nUf),
    ufSecStart: new Int32Array(nUf),
    ufSecEnd: new Int32Array(nUf),
    ufEleitorado: new Float64Array(nUf),
    ufGovSlot: new Int8Array(nUf).fill(-1),
    ufHash: new Uint32Array(nUf),
    nMun,
    mun: new Array(nMun),
    munUf: new Uint8Array(nMun),
    munSecStart: new Int32Array(nMun),
    munSecEnd: new Int32Array(nMun),
    munPairStart: new Int32Array(nMun),
    munPairEnd: new Int32Array(nMun),
    munEleitorado: new Float64Array(nMun),
    munKey: new Map(),
    munHash: new Uint32Array(nMun),
    nPair,
    pairMun: new Int32Array(nPair),
    pairZona: new Int32Array(nPair),
    pairFaixas: new Array(nPair),
    pairSecStart: new Int32Array(nPair),
    pairSecEnd: new Int32Array(nPair),
    nSec,
    secMun: new Int32Array(nSec),
    secPair: new Int32Array(nSec),
    secNum: new Int32Array(nSec),
    secUf: new Uint8Array(nSec),
    secHash: new Uint32Array(nSec),
    secZonaHash: new Uint32Array(nSec),
  };
  for (const g of govRaces) st.ufGovSlot[g.ufIdx] = g.govSlot;

  let m = 0;
  let p = 0;
  let s = 0;
  for (let u = 0; u < nUf; u++) {
    const uf = ufs[u];
    const d = ds.ufs[uf]!;
    const ufH = hashStr(`uf:${uf}`);
    st.ufHash[u] = ufH;
    st.ufMunStart[u] = m;
    st.ufSecStart[u] = s;
    for (const md of d.municipios) {
      st.mun[m] = md;
      st.munUf[m] = u;
      st.munEleitorado[m] = md.eleitorado;
      st.ufEleitorado[u] += md.eleitorado;
      const key = `${uf}|${md.cod}`;
      if (st.munKey.has(key)) throw new Error(`Município duplicado: ${key}`);
      st.munKey.set(key, m);
      const mh = hashStr(`mun:${uf}:${md.cod}`);
      st.munHash[m] = mh;
      st.munSecStart[m] = s;
      st.munPairStart[m] = p;
      for (const z of md.zonas) {
        st.pairMun[p] = m;
        st.pairZona[p] = z.z;
        st.pairFaixas[p] = z.s;
        st.pairSecStart[p] = s;
        const zh = triple32((ufH ^ triple32(z.z + 0x2000)) >>> 0);
        const ph = triple32((mh ^ triple32(z.z + 0x3000)) >>> 0);
        const pp = p;
        forEachFaixa(z.s, (num) => {
          st.secMun[s] = m;
          st.secPair[s] = pp;
          st.secNum[s] = num;
          st.secUf[s] = u;
          st.secHash[s] = triple32((ph ^ triple32(num + 0x4000)) >>> 0);
          st.secZonaHash[s] = zh;
          s++;
        });
        st.pairSecEnd[p] = s;
        p++;
      }
      st.munSecEnd[m] = s;
      st.munPairEnd[m] = p;
      m++;
    }
    st.ufMunEnd[u] = m;
    st.ufSecEnd[u] = s;
  }
  return st;
}

/** Seções (contagem) de um município / par / UF. */
export const munSecoes = (st: Structure, m: number) => st.munSecEnd[m] - st.munSecStart[m];
export const pairSecoes = (st: Structure, p: number) => st.pairSecEnd[p] - st.pairSecStart[p];
export const ufSecoes = (st: Structure, u: number) => st.ufSecEnd[u] - st.ufSecStart[u];

/** Escopo de seções de uma corrida: Presidente = país inteiro; Governador = a UF. */
export function raceSecRange(st: Structure, r: RaceInfo): [number, number] {
  return r.kind === 'pres' ? [0, st.nSec] : [st.ufSecStart[r.ufIdx], st.ufSecEnd[r.ufIdx]];
}
