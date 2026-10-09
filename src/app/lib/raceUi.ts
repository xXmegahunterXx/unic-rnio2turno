/**
 * Cores por slot de candidato → classes Tailwind e valores CSS.
 *
 * CONTRATO com os componentes de mapa/gráfico/mosaico: as funções daqui são puras e devolvem só
 * referências a tokens (`rgb(var(--cand-a) / α)`), nunca hex. O slot vem de `Candidate.cor`
 * ('a' = menor número na urna, turquesa; 'b' = maior número, âmbar; 'outros' = cinza neutro).
 *
 * As classes estão escritas por extenso de propósito: o Tailwind só gera classes que aparecem
 * literalmente no código-fonte.
 */
import type { CorCandidato, Race, Tally } from '@/shared/types';
import { bucketMargem, margem, pctTotalizadas } from '@/shared/calc';

export type MargemBucket = 0 | 1 | 2 | 3;

export interface SlotUi {
  /** Fundo sólido na cor do slot. */
  bg: string;
  /** Fundo translúcido (realce suave, chips). */
  bgSoft: string;
  /** Fundo bem sutil (linhas de tabela, áreas grandes). */
  bgFaint: string;
  /** Texto na cor do slot com contraste AA nos dois temas (escurece no tema claro). */
  text: string;
  /** Texto sobre `bg` (tinta). */
  ink: string;
  /** Preenchimento SVG. */
  fill: string;
  /** Traço SVG. */
  stroke: string;
  /** Borda. */
  border: string;
  /** Anel (ring) de foco/destaque. */
  ring: string;
  /** Gradiente sutil para cartões de destaque (de cima para baixo). */
  glow: string;
  /** Valor CSS sólido: `rgb(var(--cand-a))`. Útil em style/fill de SVG e canvas (via getComputedStyle). */
  css: string;
  /** Nome da variável CSS (sem `var()`): '--cand-a'. */
  cssVar: string;
}

const SLOTS: Record<CorCandidato, SlotUi> = {
  a: {
    bg: 'bg-cand-a',
    bgSoft: 'bg-cand-a/15',
    bgFaint: 'bg-cand-a/[0.07]',
    text: 'text-[color:color-mix(in_srgb,rgb(var(--cand-a))_62%,rgb(var(--fg)))] dark:text-cand-a',
    ink: 'text-cand-a-ink',
    fill: 'fill-cand-a',
    stroke: 'stroke-cand-a',
    border: 'border-cand-a',
    ring: 'ring-cand-a',
    glow: 'from-cand-a/[0.14] to-transparent',
    css: 'rgb(var(--cand-a))',
    cssVar: '--cand-a',
  },
  b: {
    bg: 'bg-cand-b',
    bgSoft: 'bg-cand-b/15',
    bgFaint: 'bg-cand-b/[0.07]',
    text: 'text-[color:color-mix(in_srgb,rgb(var(--cand-b))_62%,rgb(var(--fg)))] dark:text-cand-b',
    ink: 'text-cand-b-ink',
    fill: 'fill-cand-b',
    stroke: 'stroke-cand-b',
    border: 'border-cand-b',
    ring: 'ring-cand-b',
    glow: 'from-cand-b/[0.14] to-transparent',
    css: 'rgb(var(--cand-b))',
    cssVar: '--cand-b',
  },
  outros: {
    bg: 'bg-cand-outros',
    bgSoft: 'bg-cand-outros/15',
    bgFaint: 'bg-cand-outros/[0.07]',
    text: 'text-fg-muted',
    ink: 'text-bg',
    fill: 'fill-cand-outros',
    stroke: 'stroke-cand-outros',
    border: 'border-cand-outros',
    ring: 'ring-cand-outros',
    glow: 'from-cand-outros/[0.12] to-transparent',
    css: 'rgb(var(--cand-outros))',
    cssVar: '--cand-outros',
  },
};

/** Classes e valores CSS do slot de cor. */
export function corSlot(cor: CorCandidato): SlotUi {
  return SLOTS[cor] ?? SLOTS.outros;
}

/** Slot do candidato i de uma corrida ('outros' se o índice não existir). */
export function slotDe(race: Pick<Race, 'candidatos'> | undefined, i: number | null | undefined): CorCandidato {
  if (!race || i === null || i === undefined) return 'outros';
  return race.candidatos[i]?.cor ?? 'outros';
}

/** `rgb(var(--cand-a) / α)`. */
export function rgbSlot(cor: CorCandidato, alpha = 1): string {
  const v = corSlot(cor).cssVar;
  return alpha >= 1 ? `rgb(var(${v}))` : `rgb(var(${v}) / ${round(alpha)})`;
}

/**
 * Opacidade por bucket de margem (<5, 5–15, 15–30, ≥30 p.p.). A escala é perceptualmente espaçada
 * e o menor nível ainda se distingue do território pendente nos dois temas.
 */
export const MARGEM_ALPHA: readonly [number, number, number, number] = [0.32, 0.55, 0.78, 1];

/** Preenchimento CSS para o mapa/mosaico: cor do líder com intensidade pela margem. */
export function fillMargem(cor: CorCandidato, bucket: MargemBucket): string {
  return rgbSlot(cor, MARGEM_ALPHA[bucket] ?? 1);
}

/** Território/seção ainda sem apuração. */
export const FILL_PENDENTE = 'rgb(var(--pending))';
/** Empate exato. */
export const FILL_EMPATE = 'rgb(var(--cand-outros) / 0.55)';
/** Totalizada sem votos válidos / vencedor desconhecido. */
export const FILL_NEUTRO = 'rgb(var(--fg-subtle) / 0.45)';
/** Contorno entre polígonos (combina com o fundo do cartão). */
export const STROKE_DIVISA = 'rgb(var(--surface))';

/**
 * Preenchimento de uma área a partir de uma contagem: pendente se nenhuma seção totalizada,
 * empate/neutro quando não há líder, senão a cor do líder pela margem.
 */
export function fillTally(
  race: Pick<Race, 'candidatos'>,
  t: Pick<Tally, 'votos' | 'secoes' | 'secoesTotalizadas'>,
): string {
  if (t.secoesTotalizadas <= 0) return FILL_PENDENTE;
  const m = margem(t);
  if (m.lider === null) return t.votos.some((v) => v > 0) ? FILL_EMPATE : FILL_NEUTRO;
  return fillMargem(slotDe(race, m.lider), bucketMargem(m.pp));
}

/** Opacidade (0–1) para o modo "% apurado" dos mapas: escala sequencial na cor da marca. */
export function fillApurado(pct: number): string {
  if (pct <= 0) return FILL_PENDENTE;
  const a = 0.18 + 0.82 * Math.min(1, Math.max(0, pct / 100));
  return `rgb(var(--brand) / ${round(a)})`;
}

/** Atalho: fill de % apurado para uma contagem. */
export const fillApuradoTally = (t: Pick<Tally, 'secoes' | 'secoesTotalizadas'>) => fillApurado(pctTotalizadas(t));

/**
 * Estado do mosaico de seções (`ZonaMosaico.estado`, 1 caractere por seção) → preenchimento CSS.
 * '0' pendente · 'a'..'d' candidato 0 por bucket · 'e'..'h' candidato 1 · 'x' empate · 'z' sem válidos ·
 * 't' totalizada sem vencedor informado.
 */
export function fillMosaico(ch: string, cores: readonly CorCandidato[] = ['a', 'b']): string {
  const code = ch.charCodeAt(0);
  if (ch === '0') return FILL_PENDENTE;
  if (code >= 97 && code <= 100) return fillMargem(cores[0] ?? 'a', (code - 97) as MargemBucket);
  if (code >= 101 && code <= 104) return fillMargem(cores[1] ?? 'b', (code - 101) as MargemBucket);
  if (ch === 'x') return FILL_EMPATE;
  if (ch === 't') return 'rgb(var(--fg-muted) / 0.55)';
  return FILL_NEUTRO;
}

/** Rótulos dos buckets para legendas. */
export const MARGEM_ROTULOS: readonly [string, string, string, string] = [
  'até 5 p.p.',
  '5 a 15 p.p.',
  '15 a 30 p.p.',
  '30 p.p. ou mais',
];

function round(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}
