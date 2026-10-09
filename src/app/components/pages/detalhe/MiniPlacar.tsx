/**
 * Linha compacta de placar (listas de destaques, painel do município): nome, barra A|B,
 * % de cada candidato nas pontas e % apurado. Candidatos sempre na ordem da urna.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Race, Tally } from '@/shared/types';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { rotuloApurado } from '@/app/components/apuracao/mapModes';

export interface MiniPlacarProps {
  race: Race;
  t: Tally;
  nome: ReactNode;
  /** Selos/rótulos ao lado do nome. */
  badge?: ReactNode;
  /** Texto/valor à direita do nome (ex.: eleitorado, margem). */
  extra?: ReactNode;
  /** Prefixo (ex.: posição no ranking). */
  rank?: number;
  to?: string;
  /** Esconde o % apurado. */
  semApurado?: boolean;
  className?: string;
}

export function MiniPlacar({ race, t, nome, badge, extra, rank, to, semApurado, className }: MiniPlacarProps) {
  const tem = validos(t) > 0;
  const m = margem(t);
  const [a, b] = race.candidatos;
  const pa = pctValidos(t, 0);
  const pb = pctValidos(t, 1);
  const pst = pctTotalizadas(t);
  const corpo = (
    <>
      {rank !== undefined ? (
        <span aria-hidden className="num mt-0.5 w-5 shrink-0 text-center text-[12px] font-semibold text-fg-subtle">
          {rank}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[14.5px] font-medium leading-tight text-fg">{nome}</span>
          {badge}
          {extra ? <span className="num ml-auto shrink-0 text-[12px] text-fg-muted">{extra}</span> : null}
        </span>
        <VoteSplitBar
          votos={t.votos}
          cores={race.candidatos.map((c) => c.cor)}
          size="xs"
          showMarker={race.candidatos.length === 2}
          nomes={race.candidatos.map((c) => c.nomeUrna)}
          className="mt-2"
        />
        <span className="mt-1.5 flex items-center justify-between gap-2 text-[12px] leading-none">
          <span className={cn('num', tem ? cn(corSlot(a.cor).text, m.lider === 0 && 'font-semibold') : 'text-fg-subtle')}>
            {tem ? fmtPct(pa, 1) : '—'}
          </span>
          {!semApurado ? (
            <span className="num truncate text-[11.5px] text-fg-muted">
              {t.secoesTotalizadas === 0 ? 'aguardando' : pst >= 100 ? 'totalizado' : `${rotuloApurado(pst)} apurado`}
            </span>
          ) : null}
          <span className={cn('num', tem ? cn(corSlot(b.cor).text, m.lider === 1 && 'font-semibold') : 'text-fg-subtle')}>
            {tem ? fmtPct(pb, 1) : '—'}
          </span>
        </span>
      </span>
    </>
  );
  const cls = cn('-mx-2 flex items-start gap-2.5 rounded-xl px-2 py-2.5', className);
  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          cls,
          'transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        )}
      >
        {corpo}
      </Link>
    );
  }
  return <div className={cls}>{corpo}</div>;
}
