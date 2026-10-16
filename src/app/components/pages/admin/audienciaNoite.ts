/**
 * Utilidades puras da "medição da noite" (I14) na seção Audiência do painel: curva minuto a minuto, páginas por UF, país
 * e aparelho, horas de tela e os CSVs. Sem React. Contrato em src/shared/audiencia.ts; servidor em src/server/audiencia.ts.
 *
 * Tudo agregado: só siglas e totais (nenhum dado de pessoa chega ao painel).
 */
import {
  APARELHOS,
  diaBrasilia,
  type Aparelho,
  type ContagemDiaAudiencia,
  type DiaAudiencia,
  type HoraAudiencia,
  type MinutoAudiencia,
  type TelaAudiencia,
} from '@/shared/audiencia';
import { UF_NOMES } from '@/shared/constants';
import { UFS, type UFBr } from '@/shared/types';
import { csvDe, dataHoraBrasilia } from './crescimentoAdmin';

export const MINUTO_MS = 60_000;
/** Minutos na curva (24 h), como no servidor. */
export const MINUTOS_CURVA = 1440;
const DIA_MS = 86_400_000;

export const ROTULO_APARELHO: Record<Aparelho, string> = {
  celular: 'Celular',
  computador: 'Computador ou tablet',
  nd: 'Não informado',
};

// ---- período ------------------------------------------------------------------------------------------------------

export type PeriodoNoite = 'hoje' | '7d' | '14d';
export const PERIODOS_NOITE: { id: PeriodoNoite; rotulo: string; dias: number }[] = [
  { id: 'hoje', rotulo: 'Hoje', dias: 1 },
  { id: '7d', rotulo: '7 dias', dias: 7 },
  { id: '14d', rotulo: '14 dias', dias: 14 },
];

/** "2026-10-25" → o dia `n` dias antes ("2026-10-19" com n = 6). */
export function diaAntes(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) - n * DIA_MS).toISOString().slice(0, 10);
}

/** Soma as contagens dos `dias` dias de calendário que terminam em `hoje` (Brasília). */
export function somaPeriodo(lista: readonly ContagemDiaAudiencia[] | undefined, hoje: string, dias: number): Record<string, number> {
  const desde = diaAntes(hoje, dias - 1);
  const s: Record<string, number> = {};
  for (const c of lista ?? []) {
    if (c.dia < desde || c.dia > hoje) continue;
    for (const [k, v] of Object.entries(c.n)) if (Number.isFinite(v) && v > 0) s[k] = (s[k] ?? 0) + v;
  }
  return s;
}

const total = (s: Record<string, number>) => Object.values(s).reduce((t, v) => t + v, 0);

// ---- rankings -----------------------------------------------------------------------------------------------------

export interface LinhaNoite {
  chave: string;
  rotulo: string;
  valor: number;
  /** fração do total do período (0–1), "não informado" incluído */
  fracao: number;
}

export interface RankingNoite {
  /** do maior para o menor, sem "não informado" (e sem "outros", que vem por último) */
  itens: LinhaNoite[];
  /** "não informado" (e, nos países, "outros países"), sempre no fim */
  resto: LinhaNoite[];
  total: number;
}

function ranking(s: Record<string, number>, rotulo: (k: string) => string, ehResto: (k: string) => boolean): RankingNoite {
  const t = total(s);
  const linha = ([chave, valor]: [string, number]): LinhaNoite => ({ chave, rotulo: rotulo(chave), valor, fracao: t > 0 ? valor / t : 0 });
  const ord = Object.entries(s)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { itens: ord.filter(([k]) => !ehResto(k)).map(linha), resto: ord.filter(([k]) => ehResto(k)).map(linha), total: t };
}

/** UF do Brasil pela sigla ("SP" → "São Paulo"). */
export const nomeUf = (k: string): string => (k === 'ND' ? 'Não informado' : ((UF_NOMES as Record<string, string>)[k] ?? k));

export function rankingUf(s: Record<string, number>): RankingNoite {
  return ranking(s, nomeUf, (k) => k === 'ND');
}

let nomesRegiao: Intl.DisplayNames | null | undefined;
/** País pelo código ISO ("PT" → "Portugal"); 'ND' e 'ZZ' têm rótulo próprio. */
export function nomePais(k: string): string {
  if (k === 'ND') return 'Não informado';
  if (k === 'ZZ') return 'Outros países';
  if (nomesRegiao === undefined) {
    try {
      nomesRegiao = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
    } catch {
      nomesRegiao = null;
    }
  }
  try {
    return nomesRegiao?.of(k) ?? k;
  } catch {
    return k;
  }
}

export function rankingPais(s: Record<string, number>): RankingNoite {
  return ranking(s, nomePais, (k) => k === 'ND' || k === 'ZZ');
}

/** Fatias por aparelho, na ordem fixa (celular, computador, não informado); só as que têm página. */
export function fatiasAparelho(s: Record<string, number>): (LinhaNoite & { aparelho: Aparelho })[] {
  const t = total(s);
  return APARELHOS.filter((a) => (s[a] ?? 0) > 0).map((a) => ({ aparelho: a, chave: a, rotulo: ROTULO_APARELHO[a], valor: s[a] ?? 0, fracao: t > 0 ? (s[a] ?? 0) / t : 0 }));
}

/** Fração no celular entre os aparelhos conhecidos (sem "não informado"); null sem página. */
export function fracaoCelular(s: Record<string, number>): number | null {
  const c = s.celular ?? 0;
  const k = s.computador ?? 0;
  return c + k > 0 ? c / (c + k) : null;
}

// ---- curva --------------------------------------------------------------------------------------------------------

/**
 * Série para o gráfico: um ponto por minuto das últimas 24 h até `agora` (o mais antigo primeiro); `null` = minuto sem
 * amostra (servidor fora do ar ou antes de a medição começar).
 */
export function serieCurva(curva: readonly MinutoAudiencia[] | undefined, agora: number): { inicio: number; valores: (number | null)[] } {
  const fim = Math.floor(agora / MINUTO_MS) * MINUTO_MS;
  const inicio = fim - (MINUTOS_CURVA - 1) * MINUTO_MS;
  const valores: (number | null)[] = new Array(MINUTOS_CURVA).fill(null);
  for (const m of curva ?? []) {
    const i = Math.round((m.minuto - inicio) / MINUTO_MS);
    if (i >= 0 && i < MINUTOS_CURVA) valores[i] = m.pessoas;
  }
  return { inicio, valores };
}

/** Maior minuto (o primeiro, em empate), quantos minutos medidos e o último. */
export function resumoCurva(curva: readonly MinutoAudiencia[] | undefined): { max: MinutoAudiencia | null; medidos: number; ultimo: MinutoAudiencia | null } {
  let max: MinutoAudiencia | null = null;
  for (const m of curva ?? []) if (m.pessoas > 0 && (!max || m.pessoas > max.pessoas)) max = m;
  return { max, medidos: curva?.length ?? 0, ultimo: curva?.length ? curva[curva.length - 1] : null };
}

/** Teto "redondo" do eixo (1, 2, 2,5 ou 5 × 10^n) acima do máximo. */
export function tetoEixo(max: number): number {
  if (!(max > 0)) return 10;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= max) return f * p;
  return 10 * p;
}

/** Minutos que começam uma hora cheia múltipla de `passoH` em Brasília (marcas do eixo x). */
export function marcasHoras(inicio: number, passoH: number): number[] {
  const out: number[] = [];
  const fim = inicio + (MINUTOS_CURVA - 1) * MINUTO_MS;
  // Brasília = UTC−3 (sem horário de verão)
  let t = Math.ceil(inicio / 3_600_000) * 3_600_000;
  for (; t <= fim; t += 3_600_000) {
    const hBr = (new Date(t).getUTCHours() + 21) % 24;
    if (hBr % passoH === 0) out.push(t);
  }
  return out;
}

// ---- horas de tela ------------------------------------------------------------------------------------------------

/** Horas de tela de um dia ("2026-10-25"); 0 sem medição. */
export function telaDoDia(tela: TelaAudiencia | undefined, dia: string): number {
  return tela?.porDia.find((d) => d.dia === dia)?.horas ?? 0;
}

/** Horas de tela nas últimas `n` horas da janela. */
export function telaUltimasHoras(tela: TelaAudiencia | undefined, n: number): number {
  return (tela?.porHora ?? []).slice(-n).reduce((s, h) => s + h.horas, 0);
}

/** Hoje (Brasília) a partir de `agora`. */
export const hojeBrasilia = (agora: number) => diaBrasilia(agora);

// ---- CSV ----------------------------------------------------------------------------------------------------------

/** Curva minuto a minuto (só os minutos medidos). */
export function csvCurva(curva: readonly MinutoAudiencia[] | undefined): string {
  return csvDe([['minuto_brasilia', 'pessoas_ao_mesmo_tempo_max'], ...(curva ?? []).map((m) => [dataHoraBrasilia(m.minuto), m.pessoas])]);
}

/** Por hora (14 dias): páginas, pico e horas de tela. */
export function csvHorasNoite(horas: readonly HoraAudiencia[], tela: TelaAudiencia | undefined): string {
  const porHora = new Map((tela?.porHora ?? []).map((h) => [h.hora, h.horas]));
  return csvDe([
    ['hora_inicio_brasilia', 'paginas_vistas', 'pico_simultaneo', 'horas_de_tela'],
    ...horas.map((h) => [dataHoraBrasilia(h.hora), h.paginas, h.pico, decimal(porHora.get(h.hora) ?? 0)]),
  ]);
}

/** "12,34" (vírgula decimal, como a planilha em pt-BR espera num CSV com ";"). */
const decimal = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

/**
 * Por dia: páginas, horas de tela, aparelhos e as 27 UFs (+ não informada). Dias com qualquer medição, do mais antigo ao
 * mais recente.
 */
export function csvLocalDias(o: {
  dias: readonly DiaAudiencia[];
  porUf?: readonly ContagemDiaAudiencia[];
  porAparelho?: readonly ContagemDiaAudiencia[];
  horasTela?: TelaAudiencia;
}): string {
  const uf = new Map((o.porUf ?? []).map((c) => [c.dia, c.n]));
  const ap = new Map((o.porAparelho ?? []).map((c) => [c.dia, c.n]));
  const tela = new Map((o.horasTela?.porDia ?? []).map((d) => [d.dia, d.horas]));
  const paginas = new Map(o.dias.map((d) => [d.dia, d.paginas]));
  const todos = [...new Set([...paginas.keys(), ...uf.keys(), ...ap.keys(), ...tela.keys()])].sort();
  const linhas: (string | number)[][] = [
    ['dia', 'paginas_vistas', 'horas_de_tela', 'celular', 'computador_ou_tablet', 'aparelho_nao_informado', ...UFS.map((u) => `uf_${u}`), 'uf_nao_informada'],
  ];
  for (const dia of todos) {
    const u = uf.get(dia) ?? {};
    const a = ap.get(dia) ?? {};
    linhas.push([dia, paginas.get(dia) ?? 0, decimal(tela.get(dia) ?? 0), a.celular ?? 0, a.computador ?? 0, a.nd ?? 0, ...UFS.map((x: UFBr) => u[x] ?? 0), u.ND ?? 0]);
  }
  return csvDe(linhas);
}

/** Países: uma linha por dia × país. */
export function csvPaises(porPais: readonly ContagemDiaAudiencia[] | undefined): string {
  const linhas: (string | number)[][] = [['dia', 'pais', 'nome', 'paginas_vistas']];
  for (const c of porPais ?? []) for (const [k, v] of Object.entries(c.n).sort((a, b) => b[1] - a[1])) linhas.push([c.dia, k, nomePais(k), v]);
  return csvDe(linhas);
}
