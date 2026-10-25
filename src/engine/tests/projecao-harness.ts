/**
 * Noites simuladas para a calibração da "Projeção do Sintonia" (src/engine/projecao-calibracao.test.ts): para cada
 * cenário, nas frações FRACOES das seções de cada abrangência, a mesma entrada que o servidor monta (municípios do 2º
 * turno no instante + 1º turno do dataset) e o resultado FINAL da própria simulação. Só Node (testes).
 */
import { UFS_GOV_2T } from '../../shared/constants';
import {
  calcularProjecao,
  coberturaCacheBaixa,
  projecaoLiberada,
  type ContagemProjecao,
  type EntradaProjecao,
  type MunicipioProjecao,
  type ParamsProjecao,
  PARAMS_PROJECAO,
} from '../../shared/projecao';
import type { OrdemRegional } from '../../shared/types';
import { Aggregator, F } from '../aggregate';
import { buildModel, type Model } from '../model';
import { presetList } from '../presets';
import { cenarioPadrao, mesclaCenario } from '../scenario';
import { buildStructure, votosFinalistas } from '../structure';
import { dataset } from './helpers';

const ds = await dataset();
const st = buildStructure(ds);

export const FRACOES = [0.1, 0.2, 0.3, 0.5, 0.7, 0.9] as const;

/** Cenários: preset + semente + ordem regional (a do preset quando ausente). */
export const CENARIOS: { preset: string; seed: number; ordem?: OrdemRegional }[] = [
  { preset: 'padrao', seed: 20261025 },
  { preset: 'equilibrio-a', seed: 11 },
  { preset: 'equilibrio-b', seed: 12, ordem: 'aleatoria' },
  { preset: 'folgada-a', seed: 13 },
  { preset: 'folgada-b', seed: 14, ordem: 'aleatoria' },
  { preset: 'empate-a', seed: 15 },
  { preset: 'virada-a', seed: 16 }, // sul-primeiro
  { preset: 'virada-b', seed: 17 }, // norte-primeiro
  { preset: 'noite-lenta', seed: 18 },
  { preset: 'padrao', seed: 19, ordem: 'aleatoria' },
  { preset: 'padrao', seed: 20, ordem: 'norte-primeiro' },
  { preset: 'uniforme', seed: 21, ordem: 'sul-primeiro' },
];

export type Tipo = 'pres-BR' | 'pres-UF' | 'gov';
interface Escopo {
  tipo: Tipo;
  nome: string;
  m0: number;
  m1: number;
  /** campos do agregado com os votos dos dois finalistas */
  f0: number;
  f1: number;
  /** índice da UF (−1 = Brasil) */
  u: number;
  t1: (m: number) => MunicipioProjecao['t1'];
}

const pres = st.raceMap.get('pres')!;
const t1Pres = (m: number): MunicipioProjecao['t1'] => {
  const [a, b, o] = votosFinalistas(st.mun[m].t1, pres.num0, pres.num1);
  return a + b + o > 0 ? { finalistas: [a, b], validos: a + b + o } : null;
};
const ESCOPOS: Escopo[] = [
  { tipo: 'pres-BR', nome: 'BR', m0: 0, m1: st.nMun, f0: F.V0, f1: F.V1, u: -1, t1: t1Pres },
  ...st.ufs.map((uf, u) => ({ tipo: 'pres-UF' as const, nome: uf, m0: st.ufMunStart[u], m1: st.ufMunEnd[u], f0: F.V0, f1: F.V1, u, t1: t1Pres })),
  ...UFS_GOV_2T.map((uf) => {
    const r = st.raceMap.get(`gov-${uf.toLowerCase()}`)!;
    const u = st.ufIndex.get(uf)!;
    return {
      tipo: 'gov' as const,
      nome: r.id,
      m0: st.ufMunStart[u],
      m1: st.ufMunEnd[u],
      f0: F.G0,
      f1: F.G1,
      u,
      t1: (m: number): MunicipioProjecao['t1'] => {
        const t = st.mun[m].t1gov;
        if (!t) return null;
        const [a, b, o] = votosFinalistas(t, r.num0, r.num1);
        return a + b + o > 0 ? { finalistas: [a, b], validos: a + b + o } : null;
      },
    };
  }),
];

/** Um ponto da noite numa abrangência: a entrada da projeção e o resultado final (% do candidato 0). */
export interface Ponto {
  tipo: Tipo;
  nome: string;
  abrangencia: string;
  alvo: number;
  cen: string;
  municipios: MunicipioProjecao[];
  /** Os mesmos municípios num instante ANTERIOR (cache defasado; ver `OpcoesPontos.antes`). */
  antes?: MunicipioProjecao[];
  verdade: number;
}

/** Variações da noite simulada para medir a fonte TSE (src/engine/projecao-calibracao.test.ts, PROJECAO_MEDIR=1). */
export interface OpcoesPontos {
  /** Frações das seções de cada abrangência (padrão FRACOES). */
  fracoes?: readonly number[];
  /** 'exterior-primeiro': as seções do exterior chegam antes de todas as outras (a ordem relativa fica). */
  ordem?: 'exterior-primeiro';
  /**
   * Instante do cache defasado, em posições de `ordem` (seções do Brasil), a partir do instante k do ponto: ex.
   * `(k) => k - 0.03 * nSec` (cache 3% atrás) ou `() => 0.002 * nSec` (lote grande: o cache parou em 0,2%).
   */
  antes?: (k: number, nSec: number) => number;
}

export interface Caso {
  tipo: Tipo;
  nome: string;
  alvo: number;
  f: number;
  err: number;
  meia: number;
  dp: number;
  cen: string;
}

/** k (prefixo de `ordem`) em que a abrangência atinge a fração `alvo` das seções (+0,5 p.p. de folga). */
function ksDoEscopo(model: Model, e: Escopo, fracoes: readonly number[] = FRACOES): number[] {
  const tot = e.u < 0 ? st.nSec : st.ufSecEnd[e.u] - st.ufSecStart[e.u];
  const metas = fracoes.map((a) => Math.min(tot, Math.ceil((a + 0.005) * tot)));
  if (e.u < 0) return metas;
  const out: number[] = [];
  let c = 0;
  let i = 0;
  for (let j = 0; j < st.nSec && i < metas.length; j++) {
    if (st.secUf[model.ordem[j]] !== e.u) continue;
    c++;
    while (i < metas.length && c >= metas[i]) {
      out.push(j + 1);
      i++;
    }
  }
  return out;
}

function entradas(model: Model, mun: Float64Array, e: Escopo, elei: Float64Array): MunicipioProjecao[] {
  const out: MunicipioProjecao[] = [];
  const S = F.STRIDE;
  for (let m = e.m0; m < e.m1; m++) {
    const o = m * S;
    out.push({
      uf: st.ufs[st.munUf[m]],
      t2: {
        votos: [mun[o + e.f0], mun[o + e.f1]],
        secoes: st.munSecEnd[m] - st.munSecStart[m],
        secoesTotalizadas: mun[o + F.SEC],
        eleitorado: elei[m],
        eleitoradoTotalizado: mun[o + F.APT],
      },
      t1: e.t1(m),
    });
  }
  void model;
  return out;
}

/** Todos os pontos de um cenário. */
export function pontosDoCenario(c: (typeof CENARIOS)[number], o: OpcoesPontos = {}): Ponto[] {
  const fracoes = o.fracoes ?? FRACOES;
  const p = presetList(st, c.seed).find((x) => x.id === c.preset)!;
  const cen = mesclaCenario(cenarioPadrao(st, c.seed), { ...p.cenario, seed: c.seed, ...(c.ordem ? { ordemRegional: c.ordem } : {}) }, st);
  let model = buildModel(st, cen);
  if (o.ordem === 'exterior-primeiro') {
    const zz = st.ufIndex.get('ZZ');
    const ordem = new Int32Array(st.nSec);
    let n = 0;
    for (const i of model.ordem) if (st.secUf[i] === zz) ordem[n++] = i;
    for (const i of model.ordem) if (st.secUf[i] !== zz) ordem[n++] = i;
    model = { ...model, ordem };
  }
  const elei = new Float64Array(st.nMun);
  for (let m = 0; m < st.nMun; m++) for (let i = st.munSecStart[m]; i < st.munSecEnd[m]; i++) elei[m] += model.aptos[i];
  const agg = new Aggregator(model, 4);
  const fim = agg.get(st.nSec).mun;
  const verdade = ESCOPOS.map((e) => {
    let a = 0;
    let b = 0;
    for (let m = e.m0; m < e.m1; m++) {
      a += fim[m * F.STRIDE + e.f0];
      b += fim[m * F.STRIDE + e.f1];
    }
    return (100 * a) / (a + b);
  });
  const pedidos: { k: number; e: number; alvo: number }[] = [];
  ESCOPOS.forEach((e, ie) => ksDoEscopo(model, e, fracoes).forEach((k, i) => pedidos.push({ k, e: ie, alvo: fracoes[i] })));
  pedidos.sort((x, y) => x.k - y.k);
  return pedidos.map((pd) => {
    const e = ESCOPOS[pd.e];
    const kAntes = o.antes ? Math.max(0, Math.min(pd.k, Math.round(o.antes(pd.k, st.nSec)))) : -1;
    return {
      tipo: e.tipo,
      nome: e.nome,
      abrangencia: e.u < 0 ? 'BR' : st.ufs[e.u],
      alvo: pd.alvo,
      cen: `${c.preset}/${c.seed}/${cen.ordemRegional}${o.ordem ? `/${o.ordem}` : ''}`,
      municipios: entradas(model, agg.get(pd.k).mun, e, elei),
      ...(kAntes >= 0 ? { antes: entradas(model, agg.get(kAntes).mun, e, elei) } : {}),
      verdade: verdade[pd.e],
    };
  });
}

/** Como a fonte TSE é imitada em `avalia`. */
export interface OpcoesTse {
  /** Fração (0–1) dos municípios começados que está no cache (sorteio fixo por posição). */
  cache: number;
  /** Cache defasado: os municípios lidos trazem os números de `Ponto.antes` (só os que já tinham seções lá). */
  defasado?: boolean;
  /** Acompanhamento da UF (`-ab.json`: seções e eleitorado totalizados de cada município, sem votos) disponível. */
  ab?: boolean;
}

/**
 * Projeta um ponto (null se a projeção não estaria liberada). `cacheTse` imita a fonte TSE — número (0–1) ou
 * `OpcoesTse`: município sem seções nunca está no cache e, dos começados, só essa fração (sorteio fixo por posição) vem
 * "lida" (com `defasado`, com os números de `Ponto.antes`); os demais entram como desconhecidos e o total oficial da UF
 * ancora. Com `ab`, cada município leva o acompanhamento da UF (seções e eleitorado totalizados AGORA, sem votos).
 */
export function avalia(pt: Ponto, prm: Readonly<ParamsProjecao> = PARAMS_PROJECAO, cacheTse?: number | OpcoesTse): Caso | null {
  const r = avaliaBruto(pt, prm, cacheTse);
  return r.liberada && !r.travaCache ? r.caso : null;
}

/** Como `avalia`, sem esconder: o caso (se houver cálculo) e o que as regras de exibição fariam com ele. */
export function avaliaBruto(
  pt: Ponto,
  prm: Readonly<ParamsProjecao> = PARAMS_PROJECAO,
  cacheTse?: number | OpcoesTse,
): { caso: Caso | null; liberada: boolean; travaCache: boolean; calc: ReturnType<typeof calcularProjecao> } {
  let entrada: EntradaProjecao = { municipios: pt.municipios };
  const tse: OpcoesTse | undefined = typeof cacheTse === 'number' ? { cache: cacheTse } : cacheTse;
  if (tse) {
    const totaisUf: Record<string, ContagemProjecao> = {};
    for (const m of pt.municipios) {
      if (!m.t2) continue;
      const t = (totaisUf[m.uf] ??= { votos: [0, 0], secoes: 0, secoesTotalizadas: 0, eleitorado: 0, eleitoradoTotalizado: 0 });
      t.votos[0] += m.t2.votos[0];
      t.votos[1] += m.t2.votos[1];
      t.secoes += m.t2.secoes;
      t.secoesTotalizadas += m.t2.secoesTotalizadas;
      t.eleitorado += m.t2.eleitorado;
      t.eleitoradoTotalizado += m.t2.eleitoradoTotalizado;
    }
    const sorteio = (i: number) => ((i * 2654435761) >>> 0) / 2 ** 32 < tse.cache;
    const lido = (m: MunicipioProjecao, i: number): MunicipioProjecao['t2'] => {
      // como no servidor: município sem nenhuma seção nunca é baixado (o acompanhamento da UF já diz que está zerado)
      const fonte = tse.defasado && pt.antes ? pt.antes[i].t2 : m.t2;
      return fonte && fonte.secoesTotalizadas > 0 && sorteio(i) ? fonte : null;
    };
    entrada = {
      municipios: pt.municipios.map((m, i) => ({
        ...m,
        t2: lido(m, i),
        ...(tse.ab && m.t2
          ? { ab: { secoes: m.t2.secoes, secoesTotalizadas: m.t2.secoesTotalizadas, eleitorado: m.t2.eleitorado, eleitoradoTotalizado: m.t2.eleitoradoTotalizado } }
          : {}),
      })),
      totaisUf,
    };
  }
  const calc = calcularProjecao(entrada, prm);
  // as mesmas regras do servidor (montarProjecao): limiares e, na fonte TSE, a trava de cobertura do cache (UF/governador)
  const caso: Caso | null = calc
    ? { tipo: pt.tipo, nome: pt.nome, alvo: pt.alvo, f: calc.fracaoApurada, err: calc.pct[0] - pt.verdade, meia: calc.meia, dp: calc.dp, cen: pt.cen }
    : null;
  return { caso, liberada: !!calc && projecaoLiberada(pt.abrangencia, calc), travaCache: !!calc && coberturaCacheBaixa(pt.abrangencia, calc), calc };
}
