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
        <span className="hidden text-fg-muted sm:inline"> p.p.</span>
      </span>
      <span className="sr-only">a favor de {race.candidatos[m.lider]?.nomeUrna}</span>
    </span>
  );
}

/** Valor ordenável da margem: positiva = candidato 0 à frente. */
export const margemAssinada = (t: Pick<Tally, 'votos'>) => (validos(t) > 0 ? pctValidos(t, 0) - pctValidos(t, 1) : -999);

/** % apurado com mini-barra. */
export function ApuradoCell({ t, compact }: { t: Pick<Tally, 'secoes' | 'secoesTotalizadas'>; compact?: boolean }) {
  const p = pctTotalizadas(t);
  return (
    <span className={cn('inline-flex items-center gap-2', compact ? 'w-full' : 'justify-end')}>
      <span className={cn('h-1 overflow-hidden rounded-full bg-surface-3', compact ? 'w-10' : 'hidden w-12 lg:block')} aria-hidden>
        <span className={cn('block h-full rounded-full', p >= 100 ? 'bg-ok' : 'bg-brand')} style={{ width: `${p}%` }} />
      </span>
      <span className={cn('num whitespace-nowrap', compact ? 'text-[11.5px] text-fg-muted' : 'text-fg')}>{fmtPct(p, p >= 99.95 || p === 0 ? 0 : 1)}</span>
    </span>
  );
}

/** Cabeçalho de coluna de candidato: monograma + nome (nome some no celular). */
export function CandHeader({ c }: { c: Candidate }) {
  return (
    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
      <CandidateAvatar candidato={c} size="xs" className="!h-5 !w-5 !text-[9px]" />
      <span className="hidden max-w-[9rem] truncate text-[12px] font-semibold text-fg-muted lg:inline">{c.nomeUrna}</span>
    </span>
  );
}
