/**
 * "E se…? Monte seu cenário" — calculadora do 2º turno a partir do resultado OFICIAL do 1º turno para Presidente.
 *
 * NÃO é pesquisa nem previsão: aplica as hipóteses de quem usa (para onde vão os eleitores de cada candidato
 * eliminado) aos votos oficiais de cada UF e mostra o 2º turno resultante. Nada é coletado nem agregado: o cenário
 * vive no aparelho e no link (?c=…) que a própria pessoa decidir compartilhar.
 *
 * Isomórfico (sem DOM/Node): usado pela página /cenarios e pelo servidor (imagem de prévia do link).
 * Percentuais derivam de src/shared/calc.ts; textos formatados com src/shared/format.ts.
 *
 * Dados: public/data/presidente-t1.json (PresidenteT1Dataset), gerado por scripts/data/presidente-t1.ts.
 */
import type { UF } from './types';
import { UFS } from './types';
import { margem, pctAbstencao, pctBrancos, pctComparecimento, pctValidos } from './calc';
import { fmtCompact, fmtInt, fmtPP, fmtPct } from './format';

// =============================================================================================
// Dataset (public/data/presidente-t1.json)
// =============================================================================================

export interface CandidatoPresidenteT1 {
  numero: number;
  /** Nome de urna para exibição ("Lula", "Escritor Augusto Cury"). */
  nomeUrna: string;
  nome: string;
  /** Sigla do partido. */
  partido: string;
  sqcand?: string;
  /** Votos no Brasil + exterior. */
  votos: number;
  /** Foi ao 2º turno. */
  finalista: boolean;
}

export interface ResultadoUfPresidenteT1 {
  uf: UF;
  eleitorado: number;
  comparecimento: number;
  brancos: number;
  /** Nulos totais (inclui os nulos técnicos), como `tvn` do TSE. */
  nulos: number;
  /** Votos por candidato, na ordem de `PresidenteT1Dataset.candidatos`. */
  votos: number[];
}

export interface PresidenteT1Dataset {
  versao: 1;
  geradoEm: string;
  fonte: string;
  /** Todos os candidatos do 1º turno, ordenados por votos (desc). */
  candidatos: CandidatoPresidenteT1[];
  /** Números dos finalistas [a, b] — a = menor número na urna (slot turquesa), b = maior (âmbar). */
  finalistas: [number, number];
  /** 27 UFs + 'ZZ' (exterior), na ordem de UFS e depois ZZ. */
  ufs: ResultadoUfPresidenteT1[];
  /** Totais Brasil + exterior (conferidos com meta.json e com o arquivo do TSE). */
  totais: { secoes: number; eleitorado: number; comparecimento: number; brancos: number; nulos: number; validos: number };
}

export const CAMINHO_PRESIDENTE_T1 = 'data/presidente-t1.json';

// =============================================================================================
// Cenário
// =============================================================================================

/**
 * Para onde vão os eleitores de um grupo (candidato eliminado ou quem votou branco/nulo no 1º turno).
 * Três parâmetros independentes, inteiros de 0 a 100 — as quatro partes (A, B, branco/nulo, abstenção) somam
 * 100% por construção, qualquer que seja a combinação.
 */
export interface Divisao {
  /** % do grupo que escolhe um dos finalistas. */
  escolhe: number;
  /** Entre quem escolhe um finalista, % que vai para o finalista A (o resto vai para B). */
  paraA: number;
  /** Entre quem NÃO escolhe um finalista, % que vota branco/nulo (o resto não comparece). */
  brancoNulo: number;
}

export interface Cenario {
  /** Divisão dos eleitores de cada candidato eliminado, por número na urna (chave em texto: "55"). */
  eliminados: Record<string, Divisao>;
  /** Quem votou branco ou nulo no 1º turno. */
  brancosNulosT1: Divisao;
  /**
   * Variação do comparecimento em relação ao 1º turno, em pontos percentuais do eleitorado de cada UF
   * (−10 a +10, passos de 0,5). Quem entra (ou sai) se divide entre os finalistas por `paraA`, com a taxa de
   * brancos e nulos do 1º turno naquela UF.
   */
  comparecimento: { delta: number; paraA: number };
}

/** Partes (0–1) de uma divisão: somam 1. */
export interface PartesDivisao {
  a: number;
  b: number;
  bn: number;
  abs: number;
}

export const DELTA_COMPARECIMENTO_MAX = 10;
export const PASSO_DELTA = 0.5;

const clampInt = (n: unknown, min: number, max: number, padrao: number): number => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** Garante inteiros em 0–100 (valores inválidos viram o padrão). */
export function normalizarDivisao(d: Partial<Divisao> | null | undefined, padrao: Divisao): Divisao {
  return {
    escolhe: clampInt(d?.escolhe, 0, 100, padrao.escolhe),
    paraA: clampInt(d?.paraA, 0, 100, padrao.paraA),
    brancoNulo: clampInt(d?.brancoNulo, 0, 100, padrao.brancoNulo),
  };
}

/** Delta de comparecimento válido: −10 a +10, múltiplo de 0,5. */
export function normalizarDelta(delta: unknown): number {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return 0;
  const q = Math.round(delta / PASSO_DELTA) * PASSO_DELTA;
  const r = Math.min(DELTA_COMPARECIMENTO_MAX, Math.max(-DELTA_COMPARECIMENTO_MAX, q));
  return Object.is(r, -0) ? 0 : r;
}

export function partesDivisao(d: Divisao): PartesDivisao {
  const e = d.escolhe / 100;
  const pa = d.paraA / 100;
  const pbn = d.brancoNulo / 100;
  return { a: e * pa, b: e * (1 - pa), bn: (1 - e) * pbn, abs: (1 - e) * (1 - pbn) };
}

/**
 * Partes em % inteiros que somam exatamente 100 (maior resto) — para exibição.
 * Empates no resto favorecem a ordem a → b → bn → abs (estável e igual para os dois finalistas na média).
 */
export function partesPct(p: PartesDivisao): PartesDivisao {
  const chaves: (keyof PartesDivisao)[] = ['a', 'b', 'bn', 'abs'];
  const total = chaves.reduce((s, k) => s + Math.max(0, p[k]), 0);
  if (total <= 0) return { a: 0, b: 0, bn: 0, abs: 100 };
  const brutos = chaves.map((k) => (Math.max(0, p[k]) / total) * 100);
  const base = brutos.map(Math.floor);
  let falta = 100 - base.reduce((s, x) => s + x, 0);
  const ordem = brutos.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((x, y) => y.resto - x.resto || x.i - y.i);
  for (let j = 0; falta > 0 && j < ordem.length; j++, falta--) base[ordem[j].i]++;
  return { a: base[0], b: base[1], bn: base[2], abs: base[3] };
}

// =============================================================================================
// Candidatos: finalistas e eliminados
// =============================================================================================

export interface FinalistasT1 {
  a: CandidatoPresidenteT1;
  b: CandidatoPresidenteT1;
  ia: number;
  ib: number;
}

export function finalistasDe(ds: PresidenteT1Dataset): FinalistasT1 {
  const ia = ds.candidatos.findIndex((c) => c.numero === ds.finalistas[0]);
  const ib = ds.candidatos.findIndex((c) => c.numero === ds.finalistas[1]);
  if (ia < 0 || ib < 0) throw new Error('Dataset sem os dois finalistas');
  return { a: ds.candidatos[ia], b: ds.candidatos[ib], ia, ib };
}

/** Candidatos eliminados no 1º turno, ordenados por votos (desc). */
export function eliminadosDe(ds: PresidenteT1Dataset): CandidatoPresidenteT1[] {
  const [na, nb] = ds.finalistas;
  return ds.candidatos.filter((c) => c.numero !== na && c.numero !== nb).sort((x, y) => y.votos - x.votos || x.numero - y.numero);
}

/** Proporção (0–100) do finalista A entre os dois finalistas no 1º turno (Brasil + exterior). */
export function proporcaoFinalistasT1(ds: PresidenteT1Dataset): number {
  const { a, b } = finalistasDe(ds);
  const s = a.votos + b.votos;
  return s > 0 ? (a.votos / s) * 100 : 50;
}

// =============================================================================================
// Presets neutros (nada baseado em pesquisas)
// =============================================================================================

export type PresetId = 'proporcional' | 'metade' | 'branco';

export interface PresetInfo {
  id: PresetId;
  rotulo: string;
  curto: string;
  descricao: string;
}

export const PRESETS: readonly PresetInfo[] = [
  {
    id: 'proporcional',
    rotulo: 'Proporcional ao 1º turno',
    curto: 'Proporcional',
    descricao: 'Os eleitores de cada candidato eliminado se dividem na mesma proporção dos dois finalistas no 1º turno.',
  },
  {
    id: 'metade',
    rotulo: 'Metade para cada',
    curto: 'Metade',
    descricao: 'Os eleitores de cada candidato eliminado se dividem meio a meio entre os dois finalistas.',
  },
  {
    id: 'branco',
    rotulo: 'Todos votam branco ou nulo',
    curto: 'Branco/nulo',
    descricao: 'Nenhum eleitor dos candidatos eliminados escolhe um finalista: todos votam branco ou nulo.',
  },
];

export const PRESET_INICIAL: PresetId = 'proporcional';

/** Quem votou branco/nulo no 1º turno: por padrão continua votando branco/nulo (igual em todos os presets). */
export const DIVISAO_BRANCOS_PADRAO: Divisao = { escolhe: 0, paraA: 50, brancoNulo: 100 };

export function divisaoDoPreset(id: PresetId, ds: PresidenteT1Dataset): Divisao {
  switch (id) {
    case 'metade':
      return { escolhe: 100, paraA: 50, brancoNulo: 100 };
    case 'branco':
      return { escolhe: 0, paraA: 50, brancoNulo: 100 };
    case 'proporcional':
    default:
      return { escolhe: 100, paraA: Math.round(proporcaoFinalistasT1(ds)), brancoNulo: 100 };
  }
}

export function cenarioDoPreset(id: PresetId, ds: PresidenteT1Dataset): Cenario {
  const d = divisaoDoPreset(id, ds);
  const eliminados: Record<string, Divisao> = {};
  for (const c of eliminadosDe(ds)) eliminados[String(c.numero)] = { ...d };
  return { eliminados, brancosNulosT1: { ...DIVISAO_BRANCOS_PADRAO }, comparecimento: { delta: 0, paraA: 50 } };
}

export const cenarioInicial = (ds: PresidenteT1Dataset) => cenarioDoPreset(PRESET_INICIAL, ds);

const mesmaDivisao = (x: Divisao, y: Divisao) => x.escolhe === y.escolhe && x.paraA === y.paraA && x.brancoNulo === y.brancoNulo;

/** Preset que o cenário reproduz exatamente (ou null se foi ajustado). */
export function presetDoCenario(c: Cenario, ds: PresidenteT1Dataset): PresetId | null {
  for (const p of PRESETS) {
    const ref = cenarioDoPreset(p.id, ds);
    if (cenariosIguais(c, ref, ds)) return p.id;
  }
  return null;
}

export function cenariosIguais(x: Cenario, y: Cenario, ds: PresidenteT1Dataset): boolean {
  if (!mesmaDivisao(x.brancosNulosT1, y.brancosNulosT1)) return false;
  if (x.comparecimento.delta !== y.comparecimento.delta) return false;
  // paraA do comparecimento só importa quando há variação
  if (x.comparecimento.delta !== 0 && x.comparecimento.paraA !== y.comparecimento.paraA) return false;
  return eliminadosDe(ds).every((c) => {
    const k = String(c.numero);
    const dx = x.eliminados[k];
    const dy = y.eliminados[k];
    return !!dx && !!dy && mesmaDivisao(dx, dy);
  });
}

/** Completa e limpa um cenário: todos os eliminados presentes, inteiros 0–100, delta válido. */
export function normalizarCenario(c: Partial<Cenario> | null | undefined, ds: PresidenteT1Dataset): Cenario {
  const base = cenarioInicial(ds);
  const eliminados: Record<string, Divisao> = {};
  for (const cand of eliminadosDe(ds)) {
    const k = String(cand.numero);
    eliminados[k] = normalizarDivisao(c?.eliminados?.[k], base.eliminados[k]);
  }
  return {
    eliminados,
    brancosNulosT1: normalizarDivisao(c?.brancosNulosT1, DIVISAO_BRANCOS_PADRAO),
    comparecimento: {
      delta: normalizarDelta(c?.comparecimento?.delta),
      paraA: clampInt(c?.comparecimento?.paraA, 0, 100, 50),
    },
  };
}

/** Aplica o mesmo valor a todos os candidatos eliminados (controle "todos juntos"). */
export function definirTodos(c: Cenario, ds: PresidenteT1Dataset, parcial: Partial<Divisao>): Cenario {
  const eliminados: Record<string, Divisao> = { ...c.eliminados };
  for (const cand of eliminadosDe(ds)) {
    const k = String(cand.numero);
    eliminados[k] = normalizarDivisao({ ...(c.eliminados[k] ?? divisaoDoPreset(PRESET_INICIAL, ds)), ...parcial }, divisaoDoPreset(PRESET_INICIAL, ds));
  }
  return { ...c, eliminados };
}

/**
 * Média dos eliminados para o controle "todos juntos", ponderada pelos votos de cada um (paraA é ponderado por quem
 * escolhe um finalista; brancoNulo, por quem não escolhe — com fallback para os votos quando o peso é zero).
 */
export function mediaEliminados(c: Cenario, ds: PresidenteT1Dataset): Divisao {
  let pv = 0;
  let se = 0;
  let pe = 0;
  let sa = 0;
  let pn = 0;
  let sn = 0;
  let saSimples = 0;
  let snSimples = 0;
  for (const cand of eliminadosDe(ds)) {
    const d = c.eliminados[String(cand.numero)];
    if (!d) continue;
    const v = cand.votos;
    pv += v;
    se += v * d.escolhe;
    const we = v * d.escolhe;
    pe += we;
    sa += we * d.paraA;
    const wn = v * (100 - d.escolhe);
    pn += wn;
    sn += wn * d.brancoNulo;
    saSimples += v * d.paraA;
    snSimples += v * d.brancoNulo;
  }
  if (pv <= 0) return divisaoDoPreset(PRESET_INICIAL, ds);
  return {
    escolhe: Math.round(se / pv),
    paraA: Math.round(pe > 0 ? sa / pe : saSimples / pv),
    brancoNulo: Math.round(pn > 0 ? sn / pn : snSimples / pv),
  };
}

/** Todos os eliminados com a mesma divisão? */
export function eliminadosUniformes(c: Cenario, ds: PresidenteT1Dataset): boolean {
  const lista = eliminadosDe(ds).map((x) => c.eliminados[String(x.numero)]).filter(Boolean);
  return lista.every((d) => mesmaDivisao(d, lista[0]));
}

// =============================================================================================
// Cálculo
// =============================================================================================

/** Resultado de uma área (UF, exterior ou Brasil) no cenário. */
export interface ResultadoArea {
  eleitorado: number;
  comparecimento: number;
  abstencao: number;
  /** [finalista A, finalista B] */
  votos: [number, number];
  /** Brancos + nulos (não dá para separar os dois nas hipóteses). */
  brancosNulos: number;
}

export interface ResultadoUfCenario extends ResultadoArea {
  uf: UF;
  /** Quem estava à frente entre os dois finalistas no 1º turno nesta UF (0 = A, 1 = B, null = empate). */
  liderT1: 0 | 1 | null;
  /** Votos dos finalistas no 1º turno nesta UF [A, B]. */
  votosT1: [number, number];
}

/** Para onde foram os votos (Brasil + exterior), em votos (não arredondados). */
export interface FluxoCenario {
  /** Eleitores dos candidatos eliminados. */
  eliminados: PartesDivisao & { total: number };
  /** Quem votou branco/nulo no 1º turno. */
  brancosNulosT1: PartesDivisao & { total: number };
  /** Variação do comparecimento (positiva = entram; negativa = saem), já limitada pelo eleitorado. */
  comparecimento: { total: number; a: number; b: number; bn: number };
}

export interface ResultadoCenario {
  brasil: ResultadoArea;
  /** Mesma ordem de `ds.ufs` (27 UFs + ZZ). */
  ufs: ResultadoUfCenario[];
  /** Estados (27, sem o exterior) em que cada finalista fica à frente [A, B]. */
  estados: [number, number];
  /** Estados empatados voto a voto. */
  empates: number;
  /** Estados em que fica à frente quem estava ATRÁS entre os dois finalistas no 1º turno. */
  mudaram: UF[];
  fluxo: FluxoCenario;
}

const UFS_BR = new Set<string>(UFS);

/** Vencedor de uma área: 0 = A, 1 = B, null = empate (ou sem votos). */
export function vencedorArea(r: Pick<ResultadoArea, 'votos'>): 0 | 1 | null {
  const [a, b] = r.votos;
  if (a === b) return null;
  return a > b ? 0 : 1;
}

/** % dos votos válidos de A (0) ou B (1) — via calc.pctValidos. */
export const pctFinalista = (r: Pick<ResultadoArea, 'votos'>, i: 0 | 1) => pctValidos(r, i);

/** Diferença em p.p. (≥ 0) e em votos entre os dois — via calc.margem. */
export const margemArea = (r: Pick<ResultadoArea, 'votos'>) => margem(r);

export const pctComparecimentoArea = (r: Pick<ResultadoArea, 'comparecimento' | 'eleitorado'>) =>
  pctComparecimento({ comparecimento: r.comparecimento, eleitoradoTotalizado: r.eleitorado });

export const pctAbstencaoArea = (r: Pick<ResultadoArea, 'abstencao' | 'eleitorado'>) =>
  pctAbstencao({ abstencao: r.abstencao, eleitoradoTotalizado: r.eleitorado });

/** Brancos + nulos, % do comparecimento (mesma regra de calc.pctBrancos). */
export const pctBrancosNulosArea = (r: Pick<ResultadoArea, 'brancosNulos' | 'comparecimento'>) =>
  pctBrancos({ brancos: r.brancosNulos, comparecimento: r.comparecimento });

const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Arredonda valores ≥ 0 para inteiros que somam exatamente `total` (maior resto; empate → ordem dada). */
export function arredondarComSoma(xs: readonly number[], total: number): number[] {
  const v = xs.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const s = soma(v);
  if (s <= 0 || total <= 0) return v.map(() => 0);
  const brutos = v.map((x) => (x / s) * total);
  const base = brutos.map(Math.floor);
  let falta = total - soma(base);
  const ordem = brutos.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((p, q) => q.resto - p.resto || p.i - q.i);
  for (let j = 0; falta > 0 && j < ordem.length; j++, falta--) base[ordem[j].i]++;
  return base;
}

export function calcularCenario(ds: PresidenteT1Dataset, cenarioBruto: Cenario): ResultadoCenario {
  const cenario = normalizarCenario(cenarioBruto, ds);
  const { ia, ib } = finalistasDe(ds);
  const partes = ds.candidatos.map((c, i) =>
    i === ia || i === ib ? null : partesDivisao(cenario.eliminados[String(c.numero)] ?? divisaoDoPreset(PRESET_INICIAL, ds)),
  );
  const pBn = partesDivisao(cenario.brancosNulosT1);
  const delta = cenario.comparecimento.delta / 100;
  const paComp = cenario.comparecimento.paraA / 100;

  const fluxo: FluxoCenario = {
    eliminados: { a: 0, b: 0, bn: 0, abs: 0, total: 0 },
    brancosNulosT1: { a: 0, b: 0, bn: 0, abs: 0, total: 0 },
    comparecimento: { total: 0, a: 0, b: 0, bn: 0 },
  };

  const ufs: ResultadoUfCenario[] = ds.ufs.map((u) => {
    let a = u.votos[ia] ?? 0;
    let b = u.votos[ib] ?? 0;
    let bn = 0;
    let abs = 0;
    for (let i = 0; i < u.votos.length; i++) {
      const p = partes[i];
      if (!p) continue;
      const v = u.votos[i] ?? 0;
      a += v * p.a;
      b += v * p.b;
      bn += v * p.bn;
      abs += v * p.abs;
      fluxo.eliminados.a += v * p.a;
      fluxo.eliminados.b += v * p.b;
      fluxo.eliminados.bn += v * p.bn;
      fluxo.eliminados.abs += v * p.abs;
      fluxo.eliminados.total += v;
    }
    const bn1 = u.brancos + u.nulos;
    a += bn1 * pBn.a;
    b += bn1 * pBn.b;
    bn += bn1 * pBn.bn;
    abs += bn1 * pBn.abs;
    fluxo.brancosNulosT1.a += bn1 * pBn.a;
    fluxo.brancosNulosT1.b += bn1 * pBn.b;
    fluxo.brancosNulosT1.bn += bn1 * pBn.bn;
    fluxo.brancosNulosT1.abs += bn1 * pBn.abs;
    fluxo.brancosNulosT1.total += bn1;

    // Variação do comparecimento: entra/sai gente com a taxa de brancos e nulos do 1º turno na UF.
    const comp0 = a + b + bn;
    if (delta !== 0 && u.eleitorado > 0) {
      let d = delta * u.eleitorado;
      d = d > 0 ? Math.min(d, Math.max(0, u.eleitorado - comp0)) : Math.max(d, -comp0);
      const taxaBn = u.comparecimento > 0 ? bn1 / u.comparecimento : 0;
      const da = d * (1 - taxaBn) * paComp;
      const db = d * (1 - taxaBn) * (1 - paComp);
      const dbn = d * taxaBn;
      // Saída limitada ao que cada parte tem (nunca negativo).
      const na = Math.max(0, a + da);
      const nb = Math.max(0, b + db);
      const nbn = Math.max(0, bn + dbn);
      fluxo.comparecimento.a += na - a;
      fluxo.comparecimento.b += nb - b;
      fluxo.comparecimento.bn += nbn - bn;
      fluxo.comparecimento.total += na - a + (nb - b) + (nbn - bn);
      a = na;
      b = nb;
      bn = nbn;
    }

    // Arredonda preservando o total (sem abstenção nem variação, o comparecimento do 1º turno fica exato).
    const comp = Math.min(u.eleitorado, Math.round(a + b + bn));
    const [A, B, BN] = arredondarComSoma([a, b, bn], comp);
    const vA = u.votos[ia] ?? 0;
    const vB = u.votos[ib] ?? 0;
    return {
      uf: u.uf,
      eleitorado: u.eleitorado,
      comparecimento: comp,
      abstencao: Math.max(0, u.eleitorado - comp),
      votos: [A, B],
      brancosNulos: BN,
      liderT1: vA === vB ? null : vA > vB ? 0 : 1,
      votosT1: [vA, vB],
    };
  });

  const brasil: ResultadoArea = {
    eleitorado: soma(ufs.map((u) => u.eleitorado)),
    comparecimento: soma(ufs.map((u) => u.comparecimento)),
    abstencao: soma(ufs.map((u) => u.abstencao)),
    votos: [soma(ufs.map((u) => u.votos[0])), soma(ufs.map((u) => u.votos[1]))],
    brancosNulos: soma(ufs.map((u) => u.brancosNulos)),
  };

  const estados: [number, number] = [0, 0];
  let empates = 0;
  const mudaram: UF[] = [];
  for (const u of ufs) {
    if (!UFS_BR.has(u.uf)) continue;
    const v = vencedorArea(u);
    if (v === null) empates++;
    else estados[v]++;
    if (v !== null && u.liderT1 !== null && v !== u.liderT1) mudaram.push(u.uf);
  }

  return { brasil, ufs, estados, empates, mudaram, fluxo };
}

// =============================================================================================
// Codec da URL (?c=…): binário compacto em base64url, robusto a entradas inválidas
// =============================================================================================
//
// Bytes: [versão=1, delta×2+20 (0–40), comparecimento.paraA, bn1.escolhe, bn1.paraA, bn1.brancoNulo,
//         (número, escolhe, paraA, brancoNulo) × N]
// Todos os valores cabem num byte. Entradas desconhecidas, repetidas ou fora da faixa são ignoradas; um cabeçalho
// inválido invalida o código inteiro (a página volta ao cenário inicial).

export const VERSAO_CODIGO = 1;
/** Limite de tamanho do parâmetro (evita processar textos enormes vindos de links). */
export const MAX_CODIGO = 600;

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INDICE: Record<string, number> = Object.fromEntries([...ALFABETO].map((ch, i) => [ch, i]));

export function bytesParaBase64Url(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] & 255;
    const b1 = i + 1 < bytes.length ? bytes[i + 1] & 255 : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] & 255 : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALFABETO[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALFABETO[n & 63];
  }
  return out;
}

/** base64url sem padding → bytes; null se houver caractere inválido ou comprimento impossível. */
export function base64UrlParaBytes(s: string): number[] | null {
  const limpo = s.replace(/=+$/, '');
  if (limpo.length % 4 === 1) return null;
  const out: number[] = [];
  for (let i = 0; i < limpo.length; i += 4) {
    const grupo = limpo.slice(i, i + 4);
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const ch = grupo[j];
      if (ch === undefined) {
        n <<= 6;
        continue;
      }
      const v = INDICE[ch];
      if (v === undefined) return null;
      n = (n << 6) | v;
    }
    out.push((n >> 16) & 255);
    if (grupo.length > 2) out.push((n >> 8) & 255);
    if (grupo.length > 3) out.push(n & 255);
  }
  return out;
}

export function codificarCenario(c: Cenario): string {
  const delta = normalizarDelta(c.comparecimento.delta);
  const bytes = [
    VERSAO_CODIGO,
    Math.round(delta * 2) + 20,
    clampInt(c.comparecimento.paraA, 0, 100, 50),
    ...valoresDivisao(normalizarDivisao(c.brancosNulosT1, DIVISAO_BRANCOS_PADRAO)),
  ];
  const nums = Object.keys(c.eliminados)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0 && n < 256)
    .sort((x, y) => x - y);
  for (const n of nums) {
    const d = c.eliminados[String(n)];
    if (!d) continue;
    bytes.push(n, ...valoresDivisao(normalizarDivisao(d, { escolhe: 100, paraA: 50, brancoNulo: 100 })));
  }
  return bytesParaBase64Url(bytes);
}

const valoresDivisao = (d: Divisao) => [d.escolhe, d.paraA, d.brancoNulo];

export interface CodigoCenario {
  delta: number;
  paraAComparecimento: number;
  brancosNulosT1: Divisao;
  eliminados: Record<string, Divisao>;
}

const divisaoDeBytes = (e: number, a: number, n: number): Divisao | null =>
  e <= 100 && a <= 100 && n <= 100 ? { escolhe: e, paraA: a, brancoNulo: n } : null;

/** Lê o código sem depender do dataset (null = código inválido). Nunca lança. */
export function lerCodigoCenario(codigo: unknown): CodigoCenario | null {
  if (typeof codigo !== 'string') return null;
  const s = codigo.trim();
  if (!s || s.length > MAX_CODIGO || !/^[A-Za-z0-9_-]+={0,2}$/.test(s)) return null;
  const bytes = base64UrlParaBytes(s);
  if (!bytes || bytes.length < 6 || bytes[0] !== VERSAO_CODIGO) return null;
  if (bytes[1] > 40 || bytes[2] > 100) return null;
  const bn1 = divisaoDeBytes(bytes[3], bytes[4], bytes[5]);
  if (!bn1) return null;
  const eliminados: Record<string, Divisao> = {};
  for (let i = 6; i + 3 < bytes.length; i += 4) {
    const n = bytes[i];
    const d = divisaoDeBytes(bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const k = String(n);
    if (n === 0 || !d || k in eliminados) continue;
    eliminados[k] = d;
  }
  return { delta: (bytes[1] - 20) / 2, paraAComparecimento: bytes[2], brancosNulosT1: bn1, eliminados };
}

/**
 * Código da URL → cenário completo para este dataset. Candidatos ausentes no código ficam com o cenário inicial;
 * números desconhecidos ou de finalistas são ignorados. null = código inválido.
 */
export function decodificarCenario(codigo: unknown, ds: PresidenteT1Dataset): Cenario | null {
  const lido = lerCodigoCenario(codigo);
  if (!lido) return null;
  const base = cenarioInicial(ds);
  const eliminados: Record<string, Divisao> = {};
  for (const cand of eliminadosDe(ds)) {
    const k = String(cand.numero);
    eliminados[k] = lido.eliminados[k] ?? base.eliminados[k];
  }
  return normalizarCenario(
    { eliminados, brancosNulosT1: lido.brancosNulosT1, comparecimento: { delta: lido.delta, paraA: lido.paraAComparecimento } },
    ds,
  );
}

// =============================================================================================
// Premissas e textos (neutros; usados na página, no cartão e na imagem de prévia)
// =============================================================================================

export const AVISO_CENARIO = 'Cenário hipotético montado por você a partir do resultado oficial do 1º turno. Não é pesquisa nem previsão.';
export const MARCA_CENARIO = 'Cenário hipotético · não é pesquisa nem previsão';

/** Nome curto para textos apertados (até 2 palavras do nome de urna, sem títulos como "Escritor"). */
export function nomeCurto(nomeUrna: string): string {
  const TITULOS = new Set(['escritor', 'veterinário', 'veterinario', 'professor', 'professora', 'profª', 'prof.', 'doutor', 'doutora', 'dr.', 'dra.', 'coronel', 'pastor', 'delegado', 'delegada']);
  const p = nomeUrna.trim().split(/\s+/);
  const sem = p.length > 1 && TITULOS.has(p[0].toLocaleLowerCase('pt-BR')) ? p.slice(1) : p;
  return sem.slice(0, 2).join(' ');
}

/** "49% Lula · 51% Flávio Bolsonaro · 0% branco/nulo · 0% não vota" (só as partes > 0, sempre A antes de B). */
export function textoPartes(p: PartesDivisao, nomes: { a: string; b: string }, opts: { zeros?: boolean } = {}): string {
  const q = partesPct(p);
  const itens: [number, string][] = [
    [q.a, nomes.a],
    [q.b, nomes.b],
    [q.bn, 'branco/nulo'],
    [q.abs, 'não vota'],
  ];
  return itens
    .filter(([v], i) => opts.zeros || v > 0 || i < 2)
    .map(([v, r]) => `${fmtPct(v, 0)} ${r}`)
    .join(' · ');
}

export interface Premissa {
  id: 'finalistas' | 'eliminados' | 'brancos' | 'comparecimento' | 'estados' | `cand-${number}`;
  rotulo: string;
  texto: string;
}

const partesDoFluxo = (f: PartesDivisao & { total: number }): PartesDivisao =>
  f.total > 0 ? { a: f.a / f.total, b: f.b / f.total, bn: f.bn / f.total, abs: f.abs / f.total } : { a: 0, b: 0, bn: 0, abs: 1 };

/**
 * Premissas do cenário em linguagem simples (sempre visíveis na página e impressas no cartão).
 * `detalheCandidatos`: quantos eliminados listar um a um (os mais votados), além do agregado.
 */
export function premissasCenario(
  ds: PresidenteT1Dataset,
  cenario: Cenario,
  resultado: ResultadoCenario = calcularCenario(ds, cenario),
  opts: { detalheCandidatos?: number; nomesCurtos?: boolean } = {},
): Premissa[] {
  const { a, b } = finalistasDe(ds);
  const nomes = opts.nomesCurtos ? { a: nomeCurto(a.nomeUrna), b: nomeCurto(b.nomeUrna) } : { a: a.nomeUrna, b: b.nomeUrna };
  const elim = eliminadosDe(ds);
  const c = normalizarCenario(cenario, ds);
  const fluxo = resultado.fluxo;
  const out: Premissa[] = [];

  out.push({
    id: 'finalistas',
    rotulo: 'Finalistas',
    texto: `Quem votou em ${a.nomeUrna} ou em ${b.nomeUrna} no 1º turno repete o voto.`,
  });

  const uniformes = eliminadosUniformes(c, ds);
  const totalElim = fluxo.eliminados.total;
  out.push({
    id: 'eliminados',
    rotulo: `Demais ${elim.length} candidatos · ${fmtCompact(totalElim)} de votos`,
    texto: `${uniformes ? '' : 'No total: '}${textoPartes(partesDoFluxo(fluxo.eliminados), nomes)}`,
  });

  const n = Math.max(0, Math.min(elim.length, opts.detalheCandidatos ?? 0));
  if (!uniformes) {
    for (const cand of elim.slice(0, n)) {
      const d = c.eliminados[String(cand.numero)];
      out.push({
        id: `cand-${cand.numero}`,
        rotulo: opts.nomesCurtos ? nomeCurto(cand.nomeUrna) : cand.nomeUrna,
        texto: textoPartes(partesDivisao(d), nomes),
      });
    }
  }

  const bn = c.brancosNulosT1;
  out.push({
    id: 'brancos',
    rotulo: `Brancos e nulos do 1º turno · ${fmtCompact(fluxo.brancosNulosT1.total)}`,
    texto:
      bn.escolhe === 0 && bn.brancoNulo === 100 ? 'Continuam votando branco ou nulo.' : textoPartes(partesDivisao(bn), nomes),
  });

  const dc = c.comparecimento.delta;
  const sinal = dc > 0 ? '+' : '−';
  const saem = fluxo.eliminados.abs + fluxo.brancosNulosT1.abs >= 0.5;
  out.push({
    id: 'comparecimento',
    rotulo: 'Comparecimento',
    texto:
      dc === 0
        ? saem
          ? 'Igual ao do 1º turno, menos quem deixa de votar nas hipóteses acima.'
          : 'Igual ao do 1º turno em cada estado.'
        : `${fmtPP(dc)} do eleitorado (${sinal}${fmtCompact(Math.abs(fluxo.comparecimento.total))} de eleitores); ${dc > 0 ? 'quem passa a votar escolhe' : 'quem deixa de votar escolheria'} ${fmtPct(c.comparecimento.paraA, 0)} ${nomes.a} · ${fmtPct(100 - c.comparecimento.paraA, 0)} ${nomes.b}.`,
  });

  out.push({ id: 'estados', rotulo: 'Estados', texto: 'A mesma divisão vale para todos os estados e para o exterior.' });
  return out;
}

/** Resumo do placar para textos: "Lula 49,61% × Flávio Bolsonaro 50,39%" (sempre A antes de B). */
export function placarCenarioTexto(ds: PresidenteT1Dataset, r: ResultadoCenario, opts: { curtos?: boolean } = {}): string {
  const { a, b } = finalistasDe(ds);
  const na = opts.curtos ? nomeCurto(a.nomeUrna) : a.nomeUrna;
  const nb = opts.curtos ? nomeCurto(b.nomeUrna) : b.nomeUrna;
  return `${na} ${fmtPct(pctFinalista(r.brasil, 0))} × ${nb} ${fmtPct(pctFinalista(r.brasil, 1))}`;
}

/** "à frente em 14 estados" / "× 13" — frase neutra sobre os estados (A antes de B). */
export function estadosTexto(ds: PresidenteT1Dataset, r: ResultadoCenario): string {
  const { a, b } = finalistasDe(ds);
  const emp = r.empates ? `; ${fmtInt(r.empates)} ${r.empates === 1 ? 'empate' : 'empates'}` : '';
  return `${a.nomeUrna} à frente em ${fmtInt(r.estados[0])} ${r.estados[0] === 1 ? 'estado' : 'estados'} e ${b.nomeUrna} em ${fmtInt(r.estados[1])}${emp}`;
}

/** Caminho da página com o cenário (link compartilhável). */
export const rotaCenario = (c: Cenario) => `/cenarios?c=${codificarCenario(c)}`;
