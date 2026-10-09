/**
 * Faixa dos 7 governadores na Home. Antes da apuração: quem disputa e o resultado de cada um no 1º turno
 * (dado oficial). Durante/depois: % de válidos do 2º turno ao vivo e % de seções.
 * Celular: carrossel com encaixe; desktop: grade 4 × 2 (o 8º cartão leva a /governadores).
 * Corridas via `useRaces` (anonimizadas na simulação); candidatos na ordem da urna.
 */
import { Link } from 'react-router-dom';
import type { Candidate, Fase, NationalSnapshot, Race, UF } from '@/shared/types';
import { UF_NOMES, UFS_GOV_2T } from '@/shared/constants';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { useNacional, useRaces } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { Skeleton } from '@/app/ui/Skeleton';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';

const ID = (uf: UF) => `gov-${uf.toLowerCase()}`;

/** As 7 consultas sempre na mesma ordem (regras de hooks). */
function useGovernadores() {
  const l = UFS_GOV_2T;
  const q0 = useNacional(ID(l[0]));
  const q1 = useNacional(ID(l[1]));
  const q2 = useNacional(ID(l[2]));
  const q3 = useNacional(ID(l[3]));
  const q4 = useNacional(ID(l[4]));
  const q5 = useNacional(ID(l[5]));
  const q6 = useNacional(ID(l[6]));
  return [q0, q1, q2, q3, q4, q5, q6].map((q, i) => ({ uf: l[i], data: q.data && q.data.race === ID(l[i]) ? q.data : undefined }));
}

export function FaixaGovernadores({ fase, className }: { fase: Fase; className?: string }) {
  const races = useRaces();
  const govs = useGovernadores();
  const pre = fase === 'pre';
  return (
    <section aria-labelledby="home-gov" className={cn('min-w-0', className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">Também no dia 25</p>
          <h2 id="home-gov" className="mt-1.5 text-balance font-display text-[26px] font-semibold leading-tight tracking-[-0.03em] text-fg sm:text-[34px]">
            Governador em 7 estados
          </h2>
          <p className="mt-1.5 text-[14.5px] leading-snug text-fg-muted">
            {pre ? 'Quem disputa o 2º turno e como cada um foi no 1º turno.' : 'O 2º turno para governador, ao vivo.'}
          </p>
        </div>
        <Link
          to="/governadores"
          className="hidden shrink-0 items-center gap-1 rounded-lg px-1 py-1 text-[14px] font-semibold text-brand-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:inline-flex"
        >
          Ver todos
          <Icon name="chevron-direita" size={16} />
        </Link>
      </div>

      <ul className="-mx-4 mt-5 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 md:grid-cols-4">
        {govs.map((g) => {
          const race = races?.find((r) => r.id === ID(g.uf));
          return (
            <li key={g.uf} className="w-[78%] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none">
              {race ? <CartaoGov uf={g.uf} race={race} data={g.data} pre={pre} /> : <Skeleton className="h-[176px] w-full" rounded="lg" />}
            </li>
          );
        })}
        <li className="w-[78%] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none">
          <Link
            to="/governadores"
            className="group flex h-full min-h-[176px] flex-col justify-between rounded-2xl border border-dashed border-line/[2] bg-surface-2/40 p-4 transition-colors hover:border-brand/40 hover:bg-brand/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-5"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
              <Icon name="grade" size={20} />
            </span>
            <span>
              <span className="block font-display text-[18px] font-semibold leading-tight tracking-[-0.015em] text-fg">As 7 disputas lado a lado</span>
              <span className="mt-1 inline-flex items-center gap-1 text-[13.5px] font-medium text-brand-fg">
                Ver governadores
                <Icon name="seta" size={15} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}

function CartaoGov({ uf, race, data, pre }: { uf: UF; race: Race; data: NationalSnapshot | undefined; pre: boolean }) {
  const resumo = data?.resumo;
  const temVotos = !!resumo && validos(resumo) > 0;
  return (
    <Link
      to={`/apuracao/${uf.toLowerCase()}?race=${race.id}`}
      aria-label={`Governador · ${UF_NOMES[uf]}: ${race.candidatos.map((c) => c.nomeUrna).join(' × ')}`}
      className="group flex h-full min-h-[176px] flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-[transform,border-color] duration-200 hover:-translate-y-px hover:border-line/[2.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg bg-surface-3 px-2 font-display text-[14px] font-semibold tracking-[0.02em] text-fg">
          {uf}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{UF_NOMES[uf]}</span>
        <Icon name="chevron-direita" size={17} className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
      </div>

      <ul className="mt-4 space-y-2.5">
        {race.candidatos.map((c, i) => (
          <LinhaGov key={c.numero} c={c} pct={pre ? (c.primeiroTurno?.pct ?? null) : resumo ? pctValidos(resumo, i) : null} apagado={!pre && !temVotos} />
        ))}
      </ul>

      <div className="mt-auto pt-4">
        {pre ? (
          <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-fg-subtle">% no 1º turno · oficial</p>
        ) : resumo ? (
          <>
            <VoteSplitBar votos={resumo.votos} cores={race.candidatos.map((c) => c.cor)} nomes={race.candidatos.map((c) => c.nomeUrna)} size="xs" />
            <p className="num mt-2 text-[12px] text-fg-muted">{fmtPct(pctTotalizadas(resumo))} das seções</p>
          </>
        ) : (
          <Skeleton className="h-1.5 w-full" rounded="full" />
        )}
      </div>
    </Link>
  );
}

function LinhaGov({ c, pct, apagado }: { c: Candidate; pct: number | null; apagado: boolean }) {
  const s = corSlot(c.cor);
  return (
    <li className="flex items-center gap-2.5">
      <CandidateAvatar candidato={c} size="xs" />
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">{c.nomeUrna}</span>
      <span className={cn('num shrink-0 font-display text-[16px] font-semibold tracking-[-0.02em]', apagado || pct === null ? 'text-fg-subtle' : s.text)}>
        {pct === null ? '—' : fmtPct(pct, 1)}
      </span>
    </li>
  );
}
