/**
 * Dados de seção SINTÉTICOS (só para testes): gera SecaoUfDataset no formato de public/data/secao/{uf}.json
 * coerentes com o dataset — cada coluna soma EXATAMENTE o resultado oficial do município (eleitorado,
 * comparecimento, finalistas, demais, brancos e nulos) e, em cada seção, a+b+outros+brancos+nulos = comp ≤ aptos.
 * A preferência varia de seção para seção (viés lognormal determinístico), para que se possa verificar que o
 * modelo do 2º turno segue a preferência REAL de cada seção.
 */
import type { MunicipioDataset, ResultadoPrimeiroTurno, SecaoUfDataset } from '../../shared/dataset';
import type { UF } from '../../shared/types';
import { encodeU16 } from '../../shared/u16';
import type { LoadedDataset } from '../api';
import { forEachFaixa, votosFinalistas } from '../structure';
import { dexp } from '../mathx';
import { hashStr, nrm } from '../rng';

/** Distribui `total` proporcionalmente a `w`, sem passar de `cap[i]` (maior resto, preenchimento iterativo). */
function reparte(total: number, w: number[], cap: number[]): number[] {
  const n = w.length;
  const out = new Array<number>(n).fill(0);
  let resto = total;
  for (let rodada = 0; resto > 0 && rodada < 50; rodada++) {
    let ws = 0;
    for (let i = 0; i < n; i++) if (out[i] < cap[i]) ws += w[i] > 0 ? w[i] : 1e-9;
    if (ws <= 0) break;
    const frac: [number, number][] = [];
    let dist = 0;
    for (let i = 0; i < n; i++) {
      if (out[i] >= cap[i]) continue;
      const ideal = (resto * (w[i] > 0 ? w[i] : 1e-9)) / ws;
      const a = Math.min(cap[i] - out[i], Math.floor(ideal));
      out[i] += a;
      dist += a;
      frac.push([ideal - Math.floor(ideal), i]);
    }
    resto -= dist;
    frac.sort((x, y) => y[0] - x[0] || x[1] - y[1]);
    for (const [, i] of frac) {
      if (resto <= 0) break;
      if (out[i] < cap[i]) {
        out[i]++;
        resto--;
      }
    }
  }
  if (resto !== 0) throw new Error(`reparte: sobrou ${resto}`);
  return out;
}

interface Cols {
  comp: number[];
  a: number[];
  b: number[];
  outros: number[];
  brancos: number[];
  nulos: number[];
}

/** Colunas de um cargo num município: categorias repartidas seção a seção (as colunas somam o oficial). */
function colunasMunicipio(t: ResultadoPrimeiroTurno, num0: string, num1: string, comp: number[], seed: number, sigma: number): Cols {
  const [v0, v1, vo] = votosFinalistas(t, num0, num1);
  const tot = [v0, v1, vo, t.brancos, t.nulos];
  const S = comp.length;
  const res: number[][] = [[], [], [], [], []];
  const rem = tot.slice();
  for (let i = 0; i < S; i++) {
    const c = comp[i];
    let x: number[];
    if (i === S - 1) x = rem.slice();
    else {
      const z = nrm(seed, hashStr(`p${i}`));
      const bias = [dexp(sigma * z), dexp(-sigma * z), 1, 1, 1];
      x = reparte(c, rem.map((r, k) => r * bias[k]), rem.slice());
    }
    for (let k = 0; k < 5; k++) {
      res[k].push(x[k]);
      rem[k] -= x[k];
    }
  }
  return { comp, a: res[0], b: res[1], outros: res[2], brancos: res[3], nulos: res[4] };
}

function secoesDoMunicipio(md: MunicipioDataset): number {
  let n = 0;
  for (const z of md.zonas) forEachFaixa(z.s, () => n++);
  return n;
}

/** SecaoUfDataset sintético de uma UF (Presidente e, se a corrida existir, Governador). */
export function secaoSintetica(ds: LoadedDataset, uf: UF): SecaoUfDataset {
  const d = ds.ufs[uf]!;
  const pres = ds.meta.races.find((r) => r.id === 'pres')!;
  const gov = ds.meta.races.find((r) => r.id === `gov-${uf.toLowerCase()}`);
  const fin = (r: typeof pres) => r.candidatos.filter((c) => !c.agregado).map((c) => String(c.numero));
  const [p0, p1] = fin(pres);
  const aptos: number[] = [];
  const P: Cols = { comp: [], a: [], b: [], outros: [], brancos: [], nulos: [] };
  const G: Cols = { comp: [], a: [], b: [], outros: [], brancos: [], nulos: [] };
  for (const md of d.municipios) {
    const S = secoesDoMunicipio(md);
    if (S === 0) continue;
    const sk = hashStr(`sint:${uf}:${md.cod}`);
    // aptos: eleitorado do município com ruído (cada seção ≤ 65535)
    const w = Array.from({ length: S }, (_, i) => dexp(0.3 * nrm(sk, hashStr(`a${i}`))));
    const ap = reparte(md.eleitorado, w, new Array(S).fill(65535));
    // comparecimento: total oficial, proporcional aos aptos com ruído, nunca acima dos aptos
    const wc = ap.map((x, i) => x * dexp(0.08 * nrm(sk, hashStr(`c${i}`))));
    const comp = reparte(md.t1.comparecimento, wc, ap);
    const cp = colunasMunicipio(md.t1, p0, p1, comp, sk, 0.5);
    aptos.push(...ap);
    for (const k of ['comp', 'a', 'b', 'outros', 'brancos', 'nulos'] as const) P[k].push(...cp[k]);
    if (gov && md.t1gov) {
      const [g0, g1] = fin(gov);
      // mesmo comparecimento por seção quando o total do governador é igual ao do presidente
      const compG = md.t1gov.comparecimento === md.t1.comparecimento ? comp : reparte(md.t1gov.comparecimento, wc, ap);
      const cg = colunasMunicipio(md.t1gov, g0, g1, compG, (sk ^ 0x5bd1e995) >>> 0, 0.5);
      for (const k of ['comp', 'a', 'b', 'outros', 'brancos', 'nulos'] as const) G[k].push(...cg[k]);
    }
  }
  const enc = (c: Cols) => ({
    comp: encodeU16(c.comp),
    a: encodeU16(c.a),
    b: encodeU16(c.b),
    outros: encodeU16(c.outros),
    brancos: encodeU16(c.brancos),
    nulos: encodeU16(c.nulos),
  });
  const out: SecaoUfDataset = { uf, n: aptos.length, aptos: encodeU16(aptos), pres: enc(P), local: encodeU16(new Array(aptos.length).fill(0xffff)) };
  if (gov) out.gov = enc(G);
  return out;
}

/** Cópia rasa do dataset com seções sintéticas nas UFs pedidas (e sem nenhum arquivo real de seção). */
export function comSecaoSintetica(ds: LoadedDataset, ufs: UF[]): LoadedDataset {
  const secao: LoadedDataset['secao'] = {};
  for (const uf of ufs) secao[uf] = secaoSintetica(ds, uf);
  return { ...ds, secao };
}

/** Cópia rasa do dataset sem os arquivos de seção (modelo por município: comportamento da fase 1). */
export function semSecao(ds: LoadedDataset): LoadedDataset {
  const { secao: _s, ...resto } = ds;
  return resto;
}
