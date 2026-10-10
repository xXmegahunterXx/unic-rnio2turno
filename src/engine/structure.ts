/**
 * Estrutura do país (independente do cenário): UFs → municípios → zonas → seções, em arrays tipados
 * (Struct of Arrays). Construída uma vez a partir do dataset e reaproveitada a cada reconstrução do modelo.
 *
 * Ordem canônica: UFs na ordem de `meta.ufs`; municípios, zonas e seções na ordem do dataset. Seções de um
 * município (e de cada par município×zona) são contíguas.
 */
import type { MunicipioDataset, ResultadoPrimeiroTurno, SecaoUfDataset, UfMeta } from '../shared/dataset';
import type { Race, RaceId, Regiao, UF } from '../shared/types';
import { decodeU16 } from '../shared/u16';
import type { LoadedDataset } from './api';
import { hashStr, triple32 } from './rng';

/** Colunas do 1º turno real de um cargo, por seção (índice global da seção; 0 onde a UF não tem dados). */
export interface ColunasT1 {
  /**
   * Eleitores aptos para o cargo. Presidente: a coluna `aptos` da seção. Governador: `gov.aptos` quando o
   * arquivo a traz (eleitores em trânsito de outra UF votam só para Presidente), senão a mesma `aptos`.
   */
  aptos: Uint16Array;
  comp: Uint16Array;
  a: Uint16Array;
  b: Uint16Array;
  outros: Uint16Array;
  brancos: Uint16Array;
  nulos: Uint16Array;
}

/**
 * 1º turno REAL por seção (public/data/secao/{uf}.json, dados abertos do TSE), decodificado em arrays
 * alinhados com a ordem canônica das seções da estrutura. Só as UFs com arquivo válido entram (`ufPres`).
 */
export interface SecaoReal {
  /** 1 se a UF tem o 1º turno real por seção (Presidente). */
  ufPres: Uint8Array;
  /** 1 se a UF tem o 1º turno real por seção de Governador (só UFs com 2º turno de governador). */
  ufGov: Uint8Array;
  aptos: Uint16Array;
  pres: ColunasT1;
  gov: ColunasT1;
  /** índice do local de votação em LocaisUfDataset.locais (0xFFFF = desconhecido) */
  local: Uint16Array;
  /**
   * 1 se a soma das seções do município bate exatamente com o resultado oficial do município (Presidente:
   * eleitorado, comparecimento, finalistas, demais, brancos e nulos) — as telas do 1º turno usam as seções
   * reais só nos municípios que conferem (assim zonas/seções sempre somam o total oficial).
   */
  munConfere: Uint8Array;
  /**
   * Idem para Governador (o eleitorado só é conferido quando o arquivo traz `gov.aptos`; sem ela, o eleitorado
   * oficial do Governador pode ser um pouco menor que a soma dos aptos: trânsito de outra UF).
   */
  munConfereGov: Uint8Array;
  /** UFs com dados (Presidente) */
  nUfs: number;
  /** Mensagens de validação (UF ignorada, municípios que não conferem). */
  avisos: string[];
}

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

  /** 1º turno real por seção (null se nenhuma UF tem o arquivo de seções). */
  real: SecaoReal | null;
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
    real: null,
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
  st.real = secaoReal(st, ds);
  return st;
}

/** Valores de um ResultadoPrimeiroTurno para os finalistas `num0`/`num1`: [v0, v1, outros]. */
export function votosFinalistas(t: ResultadoPrimeiroTurno, num0: string, num1: string): [number, number, number] {
  let v0 = 0;
  let v1 = 0;
  let validos = 0;
  for (const k in t.votos) {
    const v = t.votos[k];
    validos += v;
    if (k === num0) v0 += v;
    else if (k === num1) v1 += v;
  }
  return [v0, v1, validos - v0 - v1];
}

const novasColunas = (n: number): ColunasT1 => ({
  aptos: new Uint16Array(n),
  comp: new Uint16Array(n),
  a: new Uint16Array(n),
  b: new Uint16Array(n),
  outros: new Uint16Array(n),
  brancos: new Uint16Array(n),
  nulos: new Uint16Array(n),
});

/** Colunas de um cargo no arquivo; `aptos` só no Governador (opcional: aptos do cargo, sem trânsito de outra UF). */
type CargoArquivo = SecaoUfDataset['pres'] & { aptos?: string };
const CAMPOS_CARGO = ['comp', 'a', 'b', 'outros', 'brancos', 'nulos'] as const;

/** Decodifica as colunas de um cargo; null se alguma estiver ausente ou com tamanho ≠ n. `aptos` = do cargo ou `base`. */
function decodificaCargo(c: CargoArquivo | undefined, n: number, base: Uint16Array): { col: ColunasT1; aptosProprio: boolean } | null {
  if (!c || typeof c !== 'object') return null;
  const out = { aptos: base } as ColunasT1;
  for (const k of CAMPOS_CARGO) {
    if (typeof c[k] !== 'string') return null;
    const v = decodeU16(c[k]);
    if (v.length !== n) return null;
    out[k] = v;
  }
  let aptosProprio = false;
  if (typeof c.aptos === 'string') {
    const v = decodeU16(c.aptos);
    if (v.length === n) {
      out.aptos = v;
      aptosProprio = true;
    }
  }
  return { col: out, aptosProprio };
}

/** Monta `SecaoReal` a partir de `ds.secao` (arquivos opcionais). null se nenhuma UF tiver dados válidos. */
function secaoReal(st: Structure, ds: LoadedDataset): SecaoReal | null {
  if (!ds.secao) return null;
  const N = st.nSec;
  const avisos: string[] = [];
  let real: SecaoReal | null = null;
  const pres = st.races.find((r) => r.kind === 'pres' && r.turno === 2) ?? null;
  for (let u = 0; u < st.nUf; u++) {
    const uf = st.ufs[u];
    const d = ds.secao[uf];
    if (!d) continue;
    const n = st.ufSecEnd[u] - st.ufSecStart[u];
    if (!d || d.n !== n || typeof d.aptos !== 'string') {
      avisos.push(`secao/${uf.toLowerCase()}.json ignorado: n = ${d?.n} ≠ ${n} seções da UF`);
      continue;
    }
    let aptos: Uint16Array;
    let local: Uint16Array | null = null;
    try {
      aptos = decodeU16(d.aptos);
      if (typeof d.local === 'string') local = decodeU16(d.local);
    } catch {
      avisos.push(`secao/${uf.toLowerCase()}.json ignorado: coluna inválida`);
      continue;
    }
    const cp = aptos.length === n ? decodificaCargo(d.pres, n, aptos) : null;
    if (!cp) {
      avisos.push(`secao/${uf.toLowerCase()}.json ignorado: colunas de Presidente ausentes ou com tamanho ≠ ${n}`);
      continue;
    }
    real ??= {
      ufPres: new Uint8Array(st.nUf),
      ufGov: new Uint8Array(st.nUf),
      aptos: new Uint16Array(N),
      pres: novasColunas(N),
      gov: novasColunas(N),
      local: new Uint16Array(N).fill(0xffff),
      munConfere: new Uint8Array(st.nMun),
      munConfereGov: new Uint8Array(st.nMun),
      nUfs: 0,
      avisos,
    };
    // Presidente: `aptos` do cargo = a própria coluna de aptos da seção (mesmo array)
    real.pres.aptos = real.aptos;
    const s0 = st.ufSecStart[u];
    real.ufPres[u] = 1;
    real.nUfs++;
    real.aptos.set(aptos, s0);
    for (const k of CAMPOS_CARGO) real.pres[k].set(cp.col[k], s0);
    if (local && local.length === n) real.local.set(local, s0);
    const gs = st.ufGovSlot[u];
    let govComEleitorado = false;
    if (gs >= 0) {
      const cg = decodificaCargo(d.gov as CargoArquivo | undefined, n, aptos);
      if (cg) {
        real.ufGov[u] = 1;
        govComEleitorado = cg.aptosProprio;
        real.gov.aptos.set(cg.col.aptos, s0);
        for (const k of CAMPOS_CARGO) real.gov[k].set(cg.col[k], s0);
      } else avisos.push(`secao/${uf.toLowerCase()}.json: sem colunas válidas de Governador (usa o município)`);
    }
    // conferência com o resultado oficial de cada município
    const gr = gs >= 0 ? st.govRaces[gs] : null;
    let naoConfere = 0;
    let naoConfereGov = 0;
    for (let m = st.ufMunStart[u]; m < st.ufMunEnd[u]; m++) {
      const md = st.mun[m];
      const [i0, i1] = [st.munSecStart[m], st.munSecEnd[m]];
      if (pres && confere(real.pres, i0, i1, md.t1, pres.num0, pres.num1, true)) real.munConfere[m] = 1;
      else naoConfere++;
      if (gr && real.ufGov[u]) {
        if (md.t1gov && confere(real.gov, i0, i1, md.t1gov, gr.num0, gr.num1, govComEleitorado)) real.munConfereGov[m] = 1;
        else naoConfereGov++;
      }
    }
    if (naoConfere) avisos.push(`${uf}: ${naoConfere} município(s) com seções que não somam o total oficial (Presidente)`);
    if (naoConfereGov) avisos.push(`${uf}: ${naoConfereGov} município(s) com seções que não somam o total oficial (Governador)`);
  }
  if (real) real.avisos = avisos;
  else if (avisos.length) return { ...vazioReal(st), avisos };
  return real;
}

/** SecaoReal sem nenhuma UF (só para carregar os avisos de validação). */
function vazioReal(st: Structure): SecaoReal {
  return {
    ufPres: new Uint8Array(st.nUf),
    ufGov: new Uint8Array(st.nUf),
    aptos: new Uint16Array(0),
    pres: novasColunas(0),
    gov: novasColunas(0),
    local: new Uint16Array(0),
    munConfere: new Uint8Array(st.nMun),
    munConfereGov: new Uint8Array(st.nMun),
    nUfs: 0,
    avisos: [],
  };
}

function confere(
  c: ColunasT1,
  i0: number,
  i1: number,
  t: ResultadoPrimeiroTurno,
  n0: string,
  n1: string,
  comEleitorado: boolean,
): boolean {
  let ap = 0;
  let comp = 0;
  let a = 0;
  let b = 0;
  let o = 0;
  let br = 0;
  let nu = 0;
  for (let i = i0; i < i1; i++) {
    ap += c.aptos[i];
    comp += c.comp[i];
    a += c.a[i];
    b += c.b[i];
    o += c.outros[i];
    br += c.brancos[i];
    nu += c.nulos[i];
  }
  const [v0, v1, vo] = votosFinalistas(t, n0, n1);
  return (
    (!comEleitorado || ap === t.eleitorado) &&
    comp === t.comparecimento &&
    a === v0 &&
    b === v1 &&
    o === vo &&
    br === t.brancos &&
    nu === t.nulos
  );
}

/** A UF tem 1º turno real por seção para a corrida (Presidente → colunas pres; Governador → gov). */
export function temSecaoReal(st: Structure, r: RaceInfo, u: number): boolean {
  const real = st.real;
  if (!real) return false;
  return r.kind === 'gov' ? real.ufGov[u] === 1 : real.ufPres[u] === 1;
}

/** Seções (contagem) de um município / par / UF. */
export const munSecoes = (st: Structure, m: number) => st.munSecEnd[m] - st.munSecStart[m];
export const pairSecoes = (st: Structure, p: number) => st.pairSecEnd[p] - st.pairSecStart[p];
export const ufSecoes = (st: Structure, u: number) => st.ufSecEnd[u] - st.ufSecStart[u];

/** Escopo de seções de uma corrida: Presidente = país inteiro; Governador = a UF. */
export function raceSecRange(st: Structure, r: RaceInfo): [number, number] {
  return r.kind === 'pres' ? [0, st.nSec] : [st.ufSecStart[r.ufIdx], st.ufSecEnd[r.ufIdx]];
}
