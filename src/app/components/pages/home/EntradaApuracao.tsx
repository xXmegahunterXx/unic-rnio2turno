/**
 * Cartão de entrada "Apuração ao vivo" da Home.
 *  - Antes das 17h: "Como foi o 1º turno" com o resultado OFICIAL (pres-t1) e o cartograma por UF.
 *  - Apurando/encerrada: o cartograma do 2º turno ao vivo (quem está à frente em cada estado).
 * Corridas via `useRace` (anonimizadas na simulação); candidatos na ordem da urna, mesma tipografia.
 */
import { useNavigate } from 'react-router-dom';
import { UFS, type Candidate, type LiveStatus, type Race, type Summary, type UF } from '@/shared/types';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPct } from '@/shared/format';
import { useNacional, useRace } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { Skeleton } from '@/app/ui/Skeleton';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { TileMap } from '@/app/components/apuracao/TileMap';
import { NotaNomesOcultos } from './NotaNomesOcultos';

export function EntradaApuracao({ status, anonimizado, className }: { status: LiveStatus | undefined; anonimizado: boolean; className?: string }) {
  const navigate = useNavigate();
  const fase = status?.fase ?? 'pre';
  const t1 = fase === 'pre';
  const raceId = t1 ? 'pres-t1' : 'pres';
  const race = useRace(raceId);
  const q = useNacional(raceId);
  const data = q.data && q.data.race === raceId ? q.data : undefined;
  const pst = data ? pctTotalizadas(data.resumo) : 0;

  return (
    <article className={cn('relative isolate flex flex-col overflow-hidden rounded-[28px] border border-line bg-surface shadow-card', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-28 h-64 w-64 rounded-full bg-brand/[0.12] blur-3xl" />
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg sm:h-10 sm:w-10">
              <Icon name="ao-vivo" size={20} />
            </span>
            <span className="whitespace-nowrap font-display text-[17px] font-semibold tracking-[-0.02em] text-fg sm:text-[19px]">Apuração ao vivo</span>
          </span>
          {t1 ? (
            <span className="num inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-2 px-2.5 text-[12px] font-medium text-fg-muted">
              <Icon name="relogio" size={13} />
              25/10 · 17h
            </span>
          ) : fase === 'apurando' ? (
            <span className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-alert/30 bg-alert/10 px-2.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-fg">
              <LiveDot size={7} />
              Ao vivo
            </span>
          ) : (
            <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border border-line bg-surface-2 px-2.5 text-[12px] font-medium text-fg-muted">Encerrada</span>
          )}
        </div>

        <h3 className="mt-5 text-balance font-display text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[30px]">
          {t1 ? 'Como foi o 1º turno' : fase === 'apurando' ? 'Quem está à frente em cada estado' : 'O resultado, estado por estado'}
        </h3>
        <p className="mt-2 text-pretty text-[14.5px] leading-relaxed text-fg-muted">
          {t1 ? (
            <>Resultado oficial do TSE, de 4 de outubro. No dia 25, às 17h, este mapa passa a mostrar o 2º turno ao vivo.</>
          ) : (
            <>
              Presidente, 2º turno · <span className="num font-medium text-fg">{fmtPct(pst)}</span> das seções totalizadas.
            </>
          )}
        </p>

        <div className="mt-6 grid grid-cols-1 items-start gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)]">
          <div className="min-w-0">
            {race && data ? t1 ? <Linhas race={race} resumo={data.resumo} /> : <PlacarEstados race={race} ufs={data.ufs} /> : <LinhasEsqueleto />}
            {!t1 && status?.simulacao ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <SimulationRibbon variant="badge" />
                {anonimizado ? <NotaNomesOcultos /> : null}
              </div>
            ) : null}
          </div>
          <div className="mx-auto w-full max-w-[230px] sm:max-w-none">
            {race && data ? (
              <TileMap
                ufs={data.ufs}
                race={race}
                valores={false}
                exterior={false}
                onSelect={(uf) => navigate(`/apuracao/${uf.toLowerCase()}${t1 ? '?race=pres-t1' : ''}`)}
                rotuloAcao={(uf) => `Ver ${uf}`}
                ariaLabel={t1 ? 'Mais votado em cada estado no 1º turno' : 'Quem está à frente em cada estado'}
              />
            ) : (
              <Skeleton className="aspect-[6/8] w-full" rounded="lg" />
            )}
            {race ? <LegendaMapa race={race} t1={t1} pendentes={!!data && UFS.some((uf) => !data.ufs[uf] || data.ufs[uf]!.secoesTotalizadas <= 0)} /> : null}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-6 sm:flex-row sm:items-center">
          <ButtonLink to={t1 ? '/apuracao?race=pres-t1' : '/apuracao'} variant="secondary" size="lg" iconRight="seta" className="w-full sm:w-auto">
            {t1 ? 'Ver o 1º turno em detalhe' : 'Abrir a apuração'}
          </ButtonLink>
          <ButtonLink to="/governadores" variant="ghost" size="lg" className="w-full sm:w-auto">
            Governadores
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}

function Linhas({ race, resumo }: { race: Race; resumo: Summary }) {
  const semVotos = validos(resumo) === 0;
  return (
    <ul className="space-y-3.5">
      {race.candidatos.map((c, i) => (
        <Linha key={`${c.numero}-${i}`} c={c} pct={pctValidos(resumo, i)} votos={resumo.votos[i] ?? 0} semVotos={semVotos} />
      ))}
    </ul>
  );
}

function Linha({ c, pct, votos, semVotos }: { c: Candidate; pct: number; votos: number; semVotos: boolean }) {
  const s = corSlot(c.cor);
  const agregado = !!c.agregado;
  return (
    <li>
      <div className="flex items-center gap-3">
        {agregado ? (
          <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-line/[2.5] text-fg-subtle">
            <Icon name="mais" size={14} />
          </span>
        ) : (
          <CandidateAvatar candidato={c} size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <div className={cn('text-[14.5px] leading-tight', agregado ? 'font-medium text-fg-muted' : 'truncate font-semibold text-fg')}>
            {agregado ? 'Demais candidatos' : c.nomeUrna}
          </div>
          {!agregado ? (
            <div className="num mt-0.5 truncate text-[12px] text-fg-muted">
              {c.partido} · {c.numero}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div
            className={cn(
              'num font-display font-semibold leading-none tracking-[-0.03em]',
              agregado ? 'text-[18px] text-fg-muted' : cn('text-[24px]', semVotos ? 'text-fg-subtle' : s.textDisplay),
            )}
          >
            {fmtPct(pct)}
          </div>
          <div className="num mt-1 text-[11.5px] text-fg-muted">{fmtInt(votos)} votos</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', agregado ? 'bg-cand-outros/60' : s.bg)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </li>
  );
}

/** Ao vivo: em quantos estados cada candidato está à frente (ordem da urna) e quantos aguardam. */
function PlacarEstados({ race, ufs }: { race: Race; ufs: Partial<Record<UF, Summary>> }) {
  const finalistas = race.candidatos.filter((c) => !c.agregado);
  const cont = new Map<number, number>();
  let aguardando = 0;
  let empate = 0;
  for (const uf of UFS) {
    const t = ufs[uf];
    if (!t || t.secoesTotalizadas <= 0 || validos(t) === 0) {
      aguardando++;
      continue;
    }
    const m = margem(t);
    if (m.lider === null) empate++;
    else cont.set(m.lider, (cont.get(m.lider) ?? 0) + 1);
  }
  return (
    <div>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Estados com cada um à frente</p>
      <ul className="mt-3 space-y-2">
        {finalistas.map((c) => {
          const i = race.candidatos.indexOf(c);
          const n = cont.get(i) ?? 0;
          const s = corSlot(c.cor);
          return (
            <li key={c.numero} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/50 px-3 py-2.5">
              <CandidateAvatar candidato={c} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-fg">{c.nomeUrna}</span>
              <span className={cn('num font-display text-[26px] font-semibold leading-none tracking-[-0.03em]', s.textDisplay)}>{fmtInt(n)}</span>
            </li>
          );
        })}
      </ul>
      <p className="num mt-2.5 text-[12.5px] text-fg-muted">
        {aguardando > 0 ? `${fmtInt(aguardando)} ${aguardando === 1 ? 'estado aguarda' : 'estados aguardam'} a 1ª seção` : 'Todos os estados com seções totalizadas'}
        {empate > 0 ? ` · ${fmtInt(empate)} empatado${empate === 1 ? '' : 's'}` : ''}
      </p>
    </div>
  );
}

function LinhasEsqueleto() {
  return (
    <div className="space-y-4" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" rounded="full" />
          <div className="flex-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="mt-2 h-1.5 w-full" rounded="full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LegendaMapa({ race, t1, pendentes }: { race: Race; t1: boolean; pendentes: boolean }) {
  const finalistas = race.candidatos.filter((c) => !c.agregado);
  return (
    <div className="mt-3">
      <p className="text-center text-[11px] font-medium uppercase tracking-[0.12em] text-fg-subtle">{t1 ? 'Mais votado no estado' : 'À frente no estado'}</p>
      <ul className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
        {finalistas.map((c) => (
          <li key={c.numero} className="inline-flex min-w-0 items-center gap-1.5">
            <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', corSlot(c.cor).bg)} />
            <span className="truncate">{c.nomeUrna}</span>
          </li>
        ))}
        {!t1 && pendentes ? (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-pending" />
            Aguardando
          </li>
        ) : null}
      </ul>
    </div>
  );
}
