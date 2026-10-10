/**
 * Modos de coloração dos mapas (funções puras, sem React).
 *
 * Cada modo transforma a contagem de uma área (`Tally`/`Summary`/`MunicipioResumo`) num preenchimento CSS
 * (`rgb(var(--token) / α)`, nunca hex) + um rótulo curto, e descreve a legenda correspondente.
 *
 *  - 'vencedor'       cor do líder, intensidade pela margem em 4 buckets (calc.bucketMargem)
 *  - 'margem'         escala divergente contínua A ↔ B (diferença em p.p., satura em ±40)
 *  - 'apurado'        % de seções totalizadas, sequencial NEUTRA (cinza, sem matiz: ver fillEscalaNeutra)
 *  - 'comparecimento' % de comparecimento nas seções totalizadas, sequencial neutra (68% → 88%)
 *  - 'variacao'       variação do % do candidato 0 vs 1º turno (divergente, satura em ±10 p.p.).
 *                     Base do 1º turno: participação do candidato 0 entre os dois finalistas,
 *                     v0 / (v0 + v1) — comparável com o % de válidos do 2º turno.
 *
 * Território sem nenhuma seção totalizada é sempre 'pendente' (hachurado no mapa).
 */
import type { CorCandidato, MunicipiosNacionalSnapshot, Race, Tally } from '@/shared/types';
import { bucketMargem, margem, pctComparecimento, pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtPct, fmtPP } from '@/shared/format';
import {
  FILL_EMPATE,
  FILL_NEUTRO,
  FILL_PENDENTE,
  MARGEM_ROTULOS,
  fillApurado,
  fillEscalaNeutra,
  fillMargem,
  rgbSlot,
  slotDe,
} from '@/app/lib/raceUi';
import { tokenCss } from '@/app/lib/tokens';

export type MapMode = 'vencedor' | 'margem' | 'apurado' | 'comparecimento' | 'variacao';

export interface MapModeInfo {
  id: MapMode;
  /** Rótulo completo (desktop). */
  label: string;
  /** Rótulo curto (segmented no celular). */
  curto: string;
  descricao: string;
}

export const MAP_MODES: readonly MapModeInfo[] = [
  {
    id: 'vencedor',
    label: 'Vencedor',
    curto: 'Vencedor',
    descricao: 'Cor de quem está à frente; quanto mais forte, maior a vantagem.',
  },
  {
    id: 'margem',
    label: 'Margem',
    curto: 'Margem',
    descricao: 'Diferença entre os dois candidatos, em escala contínua.',
  },
  { id: 'apurado', label: '% apurado', curto: 'Apurado', descricao: 'Percentual de seções já totalizadas.' },
  {
    id: 'comparecimento',
    label: 'Comparecimento',
    curto: 'Compar.',
    descricao: 'Eleitores que votaram, nas seções já totalizadas.',
  },
  {
    id: 'variacao',
    label: 'Variação vs 1º turno',
    curto: '1º turno',
    descricao: 'Quanto o primeiro candidato ganhou ou perdeu em relação ao 1º turno (entre os dois finalistas).',
  },
];

/** Saturação das escalas contínuas. */
export const MARGEM_MAX_PP = 40;
export const VARIACAO_MAX_PP = 10;
export const COMPARECIMENTO_DOMINIO: readonly [number, number] = [68, 88];

export interface ModeCtx {
  race: Pick<Race, 'candidatos'>;
  /** Votos do 1º turno na mesma área (modo 'variacao'). Índices 0 e 1 = os mesmos dois finalistas. */
  primeiroTurno?: Pick<Tally, 'votos'> | null;
}

export interface ModeValue {
  /** Preenchimento CSS (`rgb(var(--x) / α)`). */
  fill: string;
  /** Sem seções totalizadas (ou sem base de comparação) → hachura. */
  pendente: boolean;
  /** Rótulo curto para o mapa (ex.: "52,3%", "+4,1 p.p."). null quando não se aplica. */
  rotulo: string | null;
  /** Valor numérico do modo (p.p., % etc.), para tabelas/ordenação. */
  valor: number | null;
}

type T = Pick<Tally, 'votos' | 'secoes' | 'secoesTotalizadas' | 'comparecimento' | 'eleitoradoTotalizado'>;

const PEND: ModeValue = { fill: FILL_PENDENTE, pendente: true, rotulo: null, valor: null };
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Intensidade (0–1) → opacidade da escala contínua. O piso mantém o tom visível sobre a superfície. */
export const alphaEscala = (t: number) => 0.12 + 0.88 * Math.pow(clamp01(t), 0.85);

/** Participação (0–100) do candidato 0 entre os dois finalistas no 1º turno. */
export function baseFinalistas(pt: Pick<Tally, 'votos'> | null | undefined): number | null {
  if (!pt || pt.votos.length < 2) return null;
  const s = pt.votos[0] + pt.votos[1];
  return s > 0 ? (pt.votos[0] / s) * 100 : null;
}

/** Valor do modo para uma área. `t` ausente → pendente. */
export function valorModo(modo: MapMode, t: T | undefined | null, ctx: ModeCtx): ModeValue {
  if (!t || t.secoesTotalizadas <= 0) return PEND;
  switch (modo) {
    case 'apurado': {
      const p = pctTotalizadas(t);
      return { fill: fillApurado(p), pendente: false, rotulo: rotuloApurado(p), valor: p };
    }
    case 'comparecimento': {
      const p = pctComparecimento(t);
      const [lo, hi] = COMPARECIMENTO_DOMINIO;
      return {
        fill: fillEscalaNeutra(alphaEscala((p - lo) / (hi - lo))),
        pendente: false,
        rotulo: fmtPct(p, 1),
        valor: p,
      };
    }
    case 'margem': {
      const m = margem(t);
      if (m.lider === null) return empate(t);
      const d = pctValidos(t, 0) - pctValidos(t, 1);
      const cor = slotDe(ctx.race, d >= 0 ? 0 : 1);
      return {
        fill: rgbSlot(cor, alphaEscala(Math.abs(d) / MARGEM_MAX_PP)),
        pendente: false,
        rotulo: fmtPP(Math.abs(d)).replace(/^\+/, ''),
        valor: d,
      };
    }
    case 'variacao': {
      const base = baseFinalistas(ctx.primeiroTurno);
      if (base === null || t.votos.length < 2 || t.votos[0] + t.votos[1] <= 0) return PEND;
      const v = pctValidos(t, 0) - base;
      const cor = slotDe(ctx.race, v >= 0 ? 0 : 1);
      return {
        fill: rgbSlot(cor, alphaEscala(Math.abs(v) / VARIACAO_MAX_PP)),
        pendente: false,
        rotulo: fmtPP(v),
        valor: v,
      };
    }
    case 'vencedor':
    default: {
      const m = margem(t);
      if (m.lider === null) return empate(t);
      return {
        fill: fillMargem(slotDe(ctx.race, m.lider), bucketMargem(m.pp)),
        pendente: false,
        rotulo: fmtPct(pctValidos(t, m.lider), 1),
        valor: m.pp,
      };
    }
  }
}

/** % apurado arredondado para baixo (nunca mostra "100%" antes de terminar). */
export function rotuloApurado(p: number): string {
  return p < 10 ? fmtPct(Math.floor(p * 10) / 10, 1) : fmtPct(Math.floor(p), 0);
}

function empate(t: T): ModeValue {
  const temVotos = t.votos.some((v) => v > 0);
  return { fill: temVotos ? FILL_EMPATE : FILL_NEUTRO, pendente: false, rotulo: temVotos ? 'Empate' : null, valor: 0 };
}

// ---------------------------------------------------------------------------------------------
// Legendas
// ---------------------------------------------------------------------------------------------

export interface LegendItem {
  label: string;
  fill: string;
  hachura?: boolean;
}

export type LegendSpec =
  | {
      tipo: 'buckets';
      titulo: string;
      /** Uma linha por candidato: 4 amostras da menor para a maior margem. */
      linhas: { nome: string; cor: CorCandidato; fills: string[] }[];
      rotulos: readonly string[];
      extras: LegendItem[];
    }
  | {
      tipo: 'escala';
      titulo: string;
      /** Amostras da esquerda para a direita (gradiente). */
      stops: string[];
      /** Marcas (pos 0–1) e rótulos. */
      ticks: { pos: number; label: string }[];
      /** Polos de uma escala divergente (candidato à esquerda e à direita). */
      polos?: { esquerda: { nome: string; cor: CorCandidato }; direita: { nome: string; cor: CorCandidato } };
      extras: LegendItem[];
    };

const PENDENTE_ITEM: LegendItem = { label: 'Sem seções apuradas', fill: FILL_PENDENTE, hachura: true };

export function legendaModo(modo: MapMode, race: Pick<Race, 'candidatos'>): LegendSpec {
  const c0 = race.candidatos[0];
  const c1 = race.candidatos[1];
  const nome0 = c0?.nomeUrna ?? 'Candidato 1';
  const nome1 = c1?.nomeUrna ?? 'Candidato 2';
  const cor0 = c0?.cor ?? 'a';
  const cor1 = c1?.cor ?? 'b';
  const amostras = (fn: (t: number) => string, n = 9) => Array.from({ length: n }, (_, i) => fn(i / (n - 1)));

  switch (modo) {
    case 'margem': {
      const stops = [
        ...amostras((t) => rgbSlot(cor1, alphaEscala(1 - t)), 6).slice(0, 5),
        ...amostras((t) => rgbSlot(cor0, alphaEscala(t)), 6),
      ];
      return {
        tipo: 'escala',
        titulo: 'Diferença entre os candidatos',
        stops,
        ticks: [
          { pos: 0, label: `${MARGEM_MAX_PP}+` },
          { pos: 0.25, label: `${MARGEM_MAX_PP / 2}` },
          { pos: 0.5, label: '0' },
          { pos: 0.75, label: `${MARGEM_MAX_PP / 2}` },
          { pos: 1, label: `${MARGEM_MAX_PP}+ p.p.` },
        ],
        polos: { esquerda: { nome: nome1, cor: cor1 }, direita: { nome: nome0, cor: cor0 } },
        extras: [{ label: 'Empate', fill: FILL_EMPATE }, PENDENTE_ITEM],
      };
    }
    case 'variacao': {
      const stops = [
        ...amostras((t) => rgbSlot(cor1, alphaEscala(1 - t)), 6).slice(0, 5),
        ...amostras((t) => rgbSlot(cor0, alphaEscala(t)), 6),
      ];
      return {
        tipo: 'escala',
        titulo: `Variação de ${nome0} vs 1º turno`,
        stops,
        ticks: [
          { pos: 0, label: `−${VARIACAO_MAX_PP}` },
          { pos: 0.25, label: `−${VARIACAO_MAX_PP / 2}` },
          { pos: 0.5, label: '0' },
          { pos: 0.75, label: `+${VARIACAO_MAX_PP / 2}` },
          { pos: 1, label: `+${VARIACAO_MAX_PP} p.p.` },
        ],
        polos: { esquerda: { nome: `${nome0} perde`, cor: cor1 }, direita: { nome: `${nome0} ganha`, cor: cor0 } },
        extras: [PENDENTE_ITEM],
      };
    }
    case 'apurado':
      return {
        tipo: 'escala',
        titulo: 'Seções totalizadas',
        stops: amostras((t) => fillApurado(Math.max(0.5, t * 100))),
        ticks: [
          { pos: 0, label: '0%' },
          { pos: 0.5, label: '50%' },
          { pos: 1, label: '100%' },
        ],
        extras: [PENDENTE_ITEM],
      };
    case 'comparecimento': {
      const [lo, hi] = COMPARECIMENTO_DOMINIO;
      return {
        tipo: 'escala',
        titulo: 'Comparecimento',
        stops: amostras((t) => fillEscalaNeutra(alphaEscala(t))),
        ticks: [
          { pos: 0, label: `≤${lo}%` },
          { pos: 0.5, label: `${(lo + hi) / 2}%` },
          { pos: 1, label: `≥${hi}%` },
        ],
        extras: [PENDENTE_ITEM],
      };
    }
    case 'vencedor':
    default:
      return {
        tipo: 'buckets',
        titulo: 'Quem está à frente e por quanto',
        linhas: [
          { nome: nome0, cor: cor0, fills: [0, 1, 2, 3].map((b) => fillMargem(cor0, b as 0 | 1 | 2 | 3)) },
          { nome: nome1, cor: cor1, fills: [0, 1, 2, 3].map((b) => fillMargem(cor1, b as 0 | 1 | 2 | 3)) },
        ],
        rotulos: MARGEM_ROTULOS,
        extras: [{ label: 'Empate', fill: FILL_EMPATE }, PENDENTE_ITEM],
      };
  }
}

/**
 * Índice IBGE → votos, para o `primeiroTurno` do UfMap a partir de `useUf('pres-t1', uf).municipios`
 * (ou de qualquer lista de MunicipioResumo).
 */
export function votosPorIbge(
  lista: readonly { ibge: string; votos: number[] }[],
): Record<string, Pick<Tally, 'votos'>> {
  const out: Record<string, Pick<Tally, 'votos'>> = {};
  for (const m of lista) if (m.ibge) out[m.ibge] = { votos: m.votos };
  return out;
}

// ---------------------------------------------------------------------------------------------
// Mapa nacional por município (MunicipiosNacionalSnapshot: arrays inteiros alinhados com municipios-br.json)
// ---------------------------------------------------------------------------------------------

/** Opacidade quantizada (passos de 0,02): poucos preenchimentos distintos → desenho em lotes no canvas. */
const alphaQ = (t: number) => Math.round(alphaEscala(t) * 50) / 50;

export interface MunBrCtx {
  race: Pick<Race, 'candidatos'>;
  /** Snapshot do 1º turno na mesma ordem (modo 'variacao'). */
  t1?: MunicipiosNacionalSnapshot | null;
}

/**
 * % dos válidos de cada candidato num município do snapshot nacional (mesma ordem de `race.candidatos`).
 * 2º turno: [p0, 100 − p0]. 1º turno (finalistas + "Outros"): p1 sai da margem entre os dois finalistas.
 * null = sem votos válidos.
 */
export function pctsMunBr(s: MunicipiosNacionalSnapshot, i: number, nCandidatos: number): number[] | null {
  const lider = s.lider[i];
  if (lider === undefined || lider < 0) return null;
  const p0 = s.pct0[i] / 100;
  const m = s.margem[i] / 10;
  if (nCandidatos <= 2) return [p0, Math.max(0, 100 - p0)];
  const p1 = lider === 0 ? p0 - m : lider === 1 ? p0 + m : p0;
  const out = [p0, Math.max(0, p1)];
  out.push(Math.max(0, 100 - p0 - Math.max(0, p1)));
  for (let k = 3; k < nCandidatos; k++) out.push(0);
  return out;
}

/** Base do 1º turno para a variação: participação do candidato 0 entre os dois finalistas (0–100). */
export function baseFinalistasMunBr(t1: MunicipiosNacionalSnapshot, i: number): number | null {
  const lider = t1.lider[i];
  if (lider === undefined || lider < 0) return null;
  const p0 = t1.pct0[i] / 100;
  const m = t1.margem[i] / 10;
  const p1 = lider === 0 ? p0 - m : lider === 1 ? p0 + m : p0;
  return p0 + p1 > 0 ? (p0 / (p0 + p1)) * 100 : null;
}

/** Preenchimento de um município (posição `i`) no modo pedido. Mesmas escalas e legendas do mapa por UF. */
export function valorMunBr(modo: MapMode, s: MunicipiosNacionalSnapshot, i: number, ctx: MunBrCtx): { fill: string; pendente: boolean } {
  const apurado = s.apurado[i] ?? 0;
  const lider = s.lider[i] ?? -1;
  if (apurado <= 0 && lider < 0) return { fill: FILL_PENDENTE, pendente: true };
  switch (modo) {
    case 'apurado':
      return { fill: fillApurado(apurado / 10), pendente: false };
    case 'comparecimento': {
      const [lo, hi] = COMPARECIMENTO_DOMINIO;
      return { fill: fillEscalaNeutra(alphaQ((s.comparecimento[i] / 10 - lo) / (hi - lo))), pendente: false };
    }
    case 'margem': {
      if (lider < 0) return { fill: FILL_NEUTRO, pendente: false };
      if (lider > 1) return { fill: FILL_EMPATE, pendente: false };
      const m = s.margem[i] / 10;
      return { fill: rgbSlot(slotDe(ctx.race, lider), alphaQ(m / MARGEM_MAX_PP)), pendente: false };
    }
    case 'variacao': {
      if (!ctx.t1 || lider < 0) return { fill: FILL_PENDENTE, pendente: true };
      const base = baseFinalistasMunBr(ctx.t1, i);
      if (base === null) return { fill: FILL_PENDENTE, pendente: true };
      const v = s.pct0[i] / 100 - base;
      return { fill: rgbSlot(slotDe(ctx.race, v >= 0 ? 0 : 1), alphaQ(Math.abs(v) / VARIACAO_MAX_PP)), pendente: false };
    }
    case 'vencedor':
    default: {
      if (lider < 0) return { fill: FILL_NEUTRO, pendente: false };
      if (lider > 1) return { fill: FILL_EMPATE, pendente: false };
      return { fill: fillMargem(slotDe(ctx.race, lider), bucketMargem(s.margem[i] / 10)), pendente: false };
    }
  }
}
