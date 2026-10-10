/**
 * Bloco do Exterior (ZZ): votos de brasileiros fora do país — só para Presidente.
 */
import { memo } from 'react';
import type { Race, RaceId, Summary } from '@/shared/types';
import type { UfMeta } from '@/shared/dataset';
import { pctComparecimento, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { ApuracaoProgress } from '@/app/components/apuracao/ApuracaoProgress';
import { linkUf } from './fase';

export interface ExteriorCardProps {
  race: Race;
  resumo: Summary;
  meta?: UfMeta;
  raceLink: RaceId;
  /** Instante do "reveja a noite" (o link leva `?t=`). */
  t?: number;
  className?: string;
}

export const ExteriorCard = memo(function ExteriorCard({ race, resumo, meta, raceLink, t, className }: ExteriorCardProps) {
  const tem = validos(resumo) > 0;
  const finalistas = race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);
  return (
    <section aria-labelledby="exterior-titulo" className={cn('relative min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
            <Icon name="globo" size={19} />
          </span>
          <div className="min-w-0">
            <h2 id="exterior-titulo" className="font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg">
              Exterior
            </h2>
            <p className="text-[12.5px] leading-snug text-fg-muted">Brasileiros que votam fora do país · só Presidente</p>
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {finalistas.map(({ c, i }) => (
            <li key={c.numero} className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-[14px] text-fg">
                <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', corSlot(c.cor).bg)} />
                <span className="truncate">{c.nomeUrna}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="num text-[12px] text-fg-muted">{fmtInt(resumo.votos[i] ?? 0)}</span>
                {tem ? (
                  <NumberRoll value={pctValidos(resumo, i)} format={(n) => fmtPct(n)} smallChars="%" className={cn('font-display text-[20px] font-semibold leading-none tracking-[-0.02em]', corSlot(c.cor).textDisplay)} />
                ) : (
                  <span className="font-display text-[20px] font-semibold leading-none text-fg-subtle">—</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <VoteSplitBar votos={resumo.votos} cores={race.candidatos.map((c) => c.cor)} size="sm" className="mt-3" nomes={race.candidatos.map((c) => c.nomeUrna)} />

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">Eleitorado</dt>
            <dd className="num mt-1 text-[15px] font-semibold leading-none text-fg">{fmtInt(resumo.eleitorado)}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">Comparecimento</dt>
            <dd className="num mt-1 text-[15px] font-semibold leading-none text-fg">{resumo.eleitoradoTotalizado > 0 ? fmtPct(pctComparecimento(resumo), 1) : '—'}</dd>
          </div>
        </dl>
        {meta ? (
          <p className="num mt-2.5 text-[12px] text-fg-muted">
            {fmtInt(meta.secoes)} seções em {fmtInt(meta.municipios)} {meta.municipios === 1 ? 'cidade' : 'cidades'} no exterior
          </p>
        ) : null}

        {pctTotalizadas(resumo) < 100 || resumo.status !== 'encerrada' ? <ApuracaoProgress resumo={resumo} variant="compact" className="mt-4" /> : null}

        <ButtonLink to={linkUf('ZZ', raceLink, t)} variant="outline" size="sm" iconRight="chevron-direita" className="mt-4 w-full">
          Ver cidades e seções do exterior
        </ButtonLink>
      </div>
    </section>
  );
});
