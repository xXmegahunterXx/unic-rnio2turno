/**
 * Blocos menores da página nacional: regiões, liderança por estado, participação e tabela de UFs.
 * Todos memoizados (os dados chegam com referência estável quando não mudam).
 */
import { memo, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Race, RaceId, Regiao, Summary, Tally, UF } from '@/shared/types';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { margem } from '@/shared/calc';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { RegionBars } from '@/app/components/apuracao/RegionBars';
import { StatsGrid } from '@/app/components/apuracao/StatsGrid';
import { UfTable } from '@/app/components/apuracao/UfTable';
import { linkUf } from './fase';

const cartao = 'min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5';
const h2 = 'font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[21px]';

export const RegioesCard = memo(function RegioesCard({ race, regioes, className }: { race: Race; regioes: Partial<Record<Regiao, Summary>>; className?: string }) {
  return (
    <section aria-labelledby="regioes-titulo" className={cn(cartao, className)}>
      <h2 id="regioes-titulo" className={h2}>
        Por região
      </h2>
      <p className="mb-5 mt-0.5 text-[12.5px] leading-snug text-fg-muted">% dos votos válidos e andamento da totalização</p>
      <RegionBars race={race} regioes={regioes} />
    </section>
  );
});

/** Quantos estados cada candidato lidera (ou venceu, no 1º turno), com as siglas clicáveis. */
export const LiderancaCard = memo(function LiderancaCard({
  race,
  ufs,
  raceLink,
  className,
}: {
  race: Race;
  ufs: Partial<Record<UF, Summary>>;
  raceLink: RaceId;
  className?: string;
}) {
  const t1 = race.turno === 1;
  const { grupos, pendentes } = useMemo(() => {
    const g = new Map<number, UF[]>();
    const pend: UF[] = [];
    for (const uf of UFS) {
      const s = ufs[uf];
      if (!s || s.secoesTotalizadas <= 0) {
        pend.push(uf);
        continue;
      }
      const l = margem(s).lider;
      if (l === null) continue;
      g.set(l, [...(g.get(l) ?? []), uf]);
    }
    return { grupos: g, pendentes: pend };
  }, [ufs]);

  return (
    <section aria-labelledby="lideranca-titulo" className={cn(cartao, className)}>
      <h2 id="lideranca-titulo" className={h2}>
        {t1 ? 'Quem venceu em cada estado' : 'Quem lidera em cada estado'}
      </h2>
      <p className="mt-0.5 text-[12.5px] leading-snug text-fg-muted">Estados e DF em que cada um tem mais votos{t1 ? ' (1º turno)' : ' até agora'}</p>
      <ul className="mt-4 space-y-4">
        {race.candidatos.map((c, i) => {
          const lista = grupos.get(i) ?? [];
          if (c.agregado && lista.length === 0) return null;
          const s = corSlot(c.cor);
          return (
            <li key={c.numero}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <CandidateAvatar candidato={c} size="sm" />
                  <span className="truncate text-[15px] font-semibold text-fg">{c.agregado ? 'Demais candidatos' : c.nomeUrna}</span>
                </span>
                <span className="shrink-0 text-[13px] text-fg-muted">
                  <span className={cn('num font-display text-[24px] font-semibold leading-none tracking-[-0.02em]', lista.length ? s.textDisplay : 'text-fg-subtle')}>
                    {lista.length}
                  </span>{' '}
                  {lista.length === 1 ? 'estado' : 'estados'}
                </span>
              </div>
              {lista.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {lista.map((uf) => (
                    <Link
                      key={uf}
                      to={linkUf(uf, raceLink)}
                      title={UF_NOMES[uf]}
                      aria-label={`${UF_NOMES[uf]}: ver resultado`}
                      className={cn(
                        'inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-lg px-2 font-mono text-[12px] font-semibold transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        s.bgSoft,
                        s.text,
                      )}
                    >
                      {uf}
                    </Link>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {pendentes.length ? (
        <p className="mt-4 border-t border-line pt-3 text-[12.5px] leading-snug text-fg-muted">
          <span className="font-medium text-fg">{pendentes.length}</span> {pendentes.length === 1 ? 'estado ainda sem' : 'estados ainda sem'} seções totalizadas:{' '}
          <span className="font-mono text-[11.5px]">{pendentes.join(' · ')}</span>
        </p>
      ) : null}
    </section>
  );
});

export const ParticipacaoSecao = memo(function ParticipacaoSecao({ t, t1, className }: { t: Tally; t1?: boolean; className?: string }) {
  return (
    <section aria-labelledby="participacao-titulo" className={cn('min-w-0', className)}>
      <div className="mb-3.5 sm:mb-4">
        <h2 id="participacao-titulo" className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]">
          Participação
        </h2>
        <p className="mt-1 text-[13.5px] leading-snug text-fg-muted">
          {t1
            ? `Eleitorado de ${fmtInt(t.eleitorado)} pessoas no 1º turno.`
            : 'Comparecimento e abstenção sobre o eleitorado das seções já totalizadas; brancos e nulos sobre o comparecimento.'}
        </p>
      </div>
      <StatsGrid t={t} />
    </section>
  );
});

export const EstadosSecao = memo(function EstadosSecao({
  race,
  ufs,
  raceLink,
  className,
}: {
  race: Race;
  ufs: Partial<Record<UF, Summary>>;
  raceLink: RaceId;
  className?: string;
}) {
  const navigate = useNavigate();
  const abrir = useCallback((uf: UF) => navigate(linkUf(uf, raceLink)), [navigate, raceLink]);
  return (
    <section aria-labelledby="estados-titulo" className={cn('min-w-0', className)}>
      <div className="mb-3.5 sm:mb-4">
        <h2 id="estados-titulo" className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]">
          Todos os estados
        </h2>
        <p className="mt-1 text-[13.5px] leading-snug text-fg-muted">Toque no cabeçalho para ordenar; na linha, para ver municípios, zonas e seções.</p>
      </div>
      <div className="rounded-2xl border border-line bg-surface px-1 py-1 shadow-card sm:px-3 sm:py-2">
        <UfTable race={race} ufs={ufs} onSelect={abrir} />
      </div>
    </section>
  );
});
