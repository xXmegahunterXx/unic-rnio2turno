/**
 * Cores por slot de candidato → classes Tailwind e valores CSS.
 *
 * CONTRATO com os componentes de mapa/gráfico/mosaico: as funções daqui são puras e devolvem só
 * referências a tokens (`rgb(var(--cand-a) / α)`), nunca hex. O slot vem de `Candidate.cor`:
 *  - 'vermelho' | 'azul': cores de identificação dos candidatos a Presidente (Lula vermelho, Flávio Bolsonaro azul,
 *    decisão do dono do produto; ver CORES_IDENTIDADE em src/shared/constants.ts);
 *  - 'a' | 'b': slots neutros (governadores e simulação com nomes ocultos) — 'a' = menor número na urna, turquesa;
 *    'b' = maior número, âmbar;
 *  - 'outros' = cinza neutro.
 * Use sempre a cor que vem dos dados (`corSlot(c.cor)`, `slotDe(race, i)`); nunca deduza a cor pelo índice.
 *
 * As classes estão escritas por extenso de propósito: o Tailwind só gera classes que aparecem
 * literalmente no código-fonte.
 */
import type { CorCandidato, Race, Tally } from '@/shared/types';
import { bucketMargem, margem, pctTotalizadas } from '@/shared/calc';
import { tokenCss, type ColorToken } from './tokens';

export type MargemBucket = 0 | 1 | 2 | 3;

export interface SlotUi {
  /** Fundo sólido na cor do slot. */
  bg: string;
  /** Fundo translúcido (realce suave, chips). */
  bgSoft: string;
  /** Fundo bem sutil (linhas de tabela, áreas grandes). */
  bgFaint: string;
  /** Texto pequeno na cor do slot, AA (≥ 4,5:1) nos dois temas — token `--cand-x-fg`. */
  text: string;
  /** Texto grande (≥ 24 px, números do placar): cor pura do slot, ≥ 3:1 nos dois temas. */
  textDisplay: string;
  /** Tinta sobre `bg` — só para ícones/sinais (≥ 3:1), não para texto. */
  ink: string;
  /** Preenchimento SVG. */
  fill: string;
  /** Traço SVG. */
  stroke: string;
  /** Borda. */
  border: string;
  /** Borda translúcida (40%), para caixas sobre `bgFaint`. */
  borderSoft: string;
  /** Anel (ring) de foco/destaque. */
  ring: string;
  /** Gradiente sutil para cartões de destaque (de cima para baixo). */
  glow: string;
  /** Valor CSS sólido: `rgb(var(--cand-a))`. Útil em style/fill de SVG e canvas (via getComputedStyle). */
  css: string;
  /** Nome da variável CSS (sem `var()`): '--cand-a'. */
  cssVar: string;
  /** Token de cor (para `tokenCss`/`resolveFill` de ./tokens). */
  token: ColorToken;
}

const SLOTS: Record<CorCandidato, SlotUi> = {
  a: {
    bg: 'bg-cand-a',
    bgSoft: 'bg-cand-a/15',
    bgFaint: 'bg-cand-a/[0.07]',
    text: 'text-cand-a-fg',
    textDisplay: 'text-cand-a',
    ink: 'text-cand-a-ink',
    fill: 'fill-cand-a',
    stroke: 'stroke-cand-a',
    border: 'border-cand-a',
    borderSoft: 'border-cand-a/40',
    ring: 'ring-cand-a',
    glow: 'from-cand-a/[0.14] to-transparent',
    css: 'rgb(var(--cand-a))',
    cssVar: '--cand-a',
    token: 'cand-a',
  },
  b: {
    bg: 'bg-cand-b',
    bgSoft: 'bg-cand-b/15',
    bgFaint: 'bg-cand-b/[0.07]',
    text: 'text-cand-b-fg',
    textDisplay: 'text-cand-b',
    ink: 'text-cand-b-ink',
    fill: 'fill-cand-b',
    stroke: 'stroke-cand-b',
    border: 'border-cand-b',
    borderSoft: 'border-cand-b/40',
    ring: 'ring-cand-b',
    glow: 'from-cand-b/[0.14] to-transparent',
    css: 'rgb(var(--cand-b))',
    cssVar: '--cand-b',
    token: 'cand-b',
  },
  vermelho: {
    bg: 'bg-cand-vermelho',
    bgSoft: 'bg-cand-vermelho/15',
    bgFaint: 'bg-cand-vermelho/[0.07]',
    text: 'text-cand-vermelho-fg',
    textDisplay: 'text-cand-vermelho',
    ink: 'text-cand-vermelho-ink',
    fill: 'fill-cand-vermelho',
    stroke: 'stroke-cand-vermelho',
    border: 'border-cand-vermelho',
    borderSoft: 'border-cand-vermelho/40',
    ring: 'ring-cand-vermelho',
    glow: 'from-cand-vermelho/[0.14] to-transparent',
    css: 'rgb(var(--cand-vermelho))',
    cssVar: '--cand-vermelho',
    token: 'cand-vermelho',
  },
  azul: {
    bg: 'bg-cand-azul',
    bgSoft: 'bg-cand-azul/15',
    bgFaint: 'bg-cand-azul/[0.07]',
    text: 'text-cand-azul-fg',
    textDisplay: 'text-cand-azul',
    ink: 'text-cand-azul-ink',
    fill: 'fill-cand-azul',
    stroke: 'stroke-cand-azul',
    border: 'border-cand-azul',
    borderSoft: 'border-cand-azul/40',
    ring: 'ring-cand-azul',
    glow: 'from-cand-azul/[0.14] to-transparent',
    css: 'rgb(var(--cand-azul))',
    cssVar: '--cand-azul',
    token: 'cand-azul',
  },
  outros: {
    bg: 'bg-cand-outros',
    bgSoft: 'bg-cand-outros/15',
    bgFaint: 'bg-cand-outros/[0.07]',
    text: 'text-fg-muted',
    textDisplay: 'text-fg-muted',
    ink: 'text-bg',
    fill: 'fill-cand-outros',
    stroke: 'stroke-cand-outros',
    border: 'border-cand-outros',
    borderSoft: 'border-cand-outros/40',
    ring: 'ring-cand-outros',
    glow: 'from-cand-outros/[0.12] to-transparent',
    css: 'rgb(var(--cand-outros))',
    cssVar: '--cand-outros',
    token: 'cand-outros',
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
  return tokenCss(corSlot(cor).token, alpha);
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
export const FILL_PENDENTE = tokenCss('pending');
/** Empate exato. */
export const FILL_EMPATE = tokenCss('cand-outros', 0.55);
/** Totalizada sem votos válidos / vencedor desconhecido. */
export const FILL_NEUTRO = tokenCss('fg-subtle', 0.45);
/** Totalizada sem vencedor informado (mosaico na fonte TSE). */
export const FILL_TOTALIZADA = tokenCss('fg-muted', 0.55);
/** Contorno entre polígonos (combina com o fundo do cartão). */
export const STROKE_DIVISA = tokenCss('surface');

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

/**
 * Escalas sequenciais que NÃO são de candidato ("% apurado", "Comparecimento"): tom neutro, sem matiz (o `fg` do tema
 * com opacidade). Era o violeta da marca, mas com Flávio Bolsonaro em azul um mapa inteiro em violeta-azulado podia
 * ser lido como "mapa azul" — e, com daltonismo (protan/deutan), violeta e azul quase se igualam. Teto de 85% para o
 * tom mais forte não ofuscar. `alpha` em 0–1.
 */
export function fillEscalaNeutra(alpha: number): string {
  return tokenCss('fg', 0.85 * Math.min(1, Math.max(0, alpha)));
}

/** Preenchimento do modo "% apurado" dos mapas: escala sequencial neutra (`fillEscalaNeutra`). */
export function fillApurado(pct: number): string {
  if (pct <= 0) return FILL_PENDENTE;
  return fillEscalaNeutra(0.18 + 0.82 * Math.min(1, Math.max(0, pct / 100)));
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
  if (ch === 't') return FILL_TOTALIZADA;
  return FILL_NEUTRO;
}

/** Rótulos dos buckets para legendas. */
export const MARGEM_ROTULOS: readonly [string, string, string, string] = [
  'até 5 p.p.',
  '5 a 15 p.p.',
  '15 a 30 p.p.',
  '30 p.p. ou mais',
];

/**
 * Dois brilhos radiais nos cantos de cima (esquerda = `cores[0]`, direita = `cores[1]`), como valor de `background`
 * inline — só tokens (`rgb(var(--cand-x) / α)`). Use com as cores que vêm dos dados (ex.: `race.candidatos[i].cor`).
 */
export function brilhoDuplo(cores: readonly [CorCandidato, CorCandidato], alpha: number, elipse = '60% 80%'): string {
  const g = (cor: CorCandidato, x: string) => `radial-gradient(ellipse ${elipse} at ${x} 0%, ${rgbSlot(cor, alpha)}, transparent 70%)`;
  return `${g(cores[0], '0%')}, ${g(cores[1], '100%')}`;
}
