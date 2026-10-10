/** Células reutilizadas pelas tabelas de apuração (UF, município, zona, seção). */
import type { Candidate, Race, Tally } from '@/shared/types';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot, slotDe } from '@/app/lib/raceUi';
import { CandidateAvatar } from './CandidateAvatar';

/** % de válidos do candidato i, colorido se ele lidera. */
export function PctCell({ t, i, race }: { t: Pick<Tally, 'votos'>; i: number; race: Race }) {
  if (validos(t) === 0) return <span className="text-fg-subtle">—</span>;
  const m = margem(t);
  const lider = m.lider === i;
  return (
    <span className={cn('num whitespace-nowrap', lider ? cn('font-semibold', corSlot(slotDe(race, i)).text) : 'text-fg')}>
      {fmtPct(pctValidos(t, i), 1)}
    </span>
  );
}

/** Margem em p.p. com o ponto da cor de quem lidera. */
export function MargemCell({ t, race }: { t: Pick<Tally, 'votos'>; race: Race }) {
  const m = margem(t);
  if (m.lider === null) return <span className="text-fg-subtle">{validos(t) > 0 ? 'Empate' : '—'}</span>;
  const s = corSlot(slotDe(race, m.lider));
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', s.bg)} />
      <span className="num font-medium text-fg">
        {fmtPP(m.pp).replace('+', '').replace(' p.p.', '')}
        <span className="hidden text-fg-muted [@container(min-width:560px)]:inline"> p.p.</span>
      </span>
      <span className="sr-only">a favor de {race.candidatos[m.lider]?.nomeUrna}</span>
    </span>
  );
}

/** Valor ordenável da margem: positiva = candidato 0 à frente. */
export const margemAssinada = (t: Pick<Tally, 'votos'>) => (validos(t) > 0 ? pctValidos(t, 0) - pctValidos(t, 1) : -999);

/** % apurado com mini-barra. */
export function ApuradoCell({ t, compact, bar = true }: { t: Pick<Tally, 'secoes' | 'secoesTotalizadas'>; compact?: boolean; bar?: boolean }) {
  const p = pctTotalizadas(t);
  return (
    <span className={cn('inline-flex items-center gap-2', compact ? 'w-full' : 'justify-end')}>
      {/* a mini-barra só aparece quando a TABELA é larga (container query da DataTable) */}
      <span className={cn('h-1 shrink-0 overflow-hidden rounded-full bg-surface-3', compact ? 'w-10' : bar ? 'hidden w-12 [@container(min-width:760px)]:block' : 'hidden')} aria-hidden>
        {/* progresso sempre na cor da marca (verde ficaria parecido com o turquesa dos slots neutros) */}
        <span className="block h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
      </span>
      <span className={cn('num whitespace-nowrap', compact ? 'text-[11.5px] text-fg-muted' : 'text-fg')}>{fmtPct(p, p >= 99.95 || p === 0 ? 0 : 1)}</span>
    </span>
  );
}

/** Cabeçalho de coluna de candidato: monograma na cor do slot (nome completo no title e para leitores de tela). */
export function CandHeader({ c }: { c: Candidate }) {
  return (
    <span className="inline-flex items-center normal-case tracking-normal" title={c.nomeUrna}>
      <CandidateAvatar candidato={c} size="xs" className="!h-[22px] !w-[22px] !text-[9.5px]" />
      <span className="sr-only">{c.nomeUrna}</span>
    </span>
  );
}

/**
 * Larguras padrão das colunas numéricas (tabelas com layout fixo). Respondem à largura da TABELA
 * (container query da DataTable), não da janela: a mesma tabela fica certa no celular e num cartão
 * de meia largura no desktop.
 */
export const W = {
  pct: 'w-16 [@container(min-width:520px)]:w-[4.75rem]',
  margem: 'w-[4.5rem] [@container(min-width:520px)]:w-[5.5rem]',
  apurado: 'w-[5rem] [@container(min-width:760px)]:w-[7.75rem]',
  apuradoSemBarra: 'w-[5.75rem]',
  eleitores: 'w-[5.75rem]',
  num: 'w-[4.25rem]',
} as const;

/**
 * Larguras mínimas da tabela para mostrar colunas secundárias (ver `hideBelowWidth`). Abaixo de
 * `apurado`, o % apurado aparece compacto sob o nome (use `soAbaixoDe[LARGURA.apurado]`).
 */
export const LARGURA = { apurado: 520, eleitores: 640, secundaria: 640 } as const;
