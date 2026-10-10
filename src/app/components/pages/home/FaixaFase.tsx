/**
 * Faixa da fase no hero do CELULAR (compacta, para os CTAs caberem na 1ª dobra):
 *  - antes das 17h: contagem regressiva + "quem disputa" numa linha (ordem da urna);
 *  - apurando/encerrada: placar compacto (A × B, barra com os 50%, % de seções), inteiro clicável → /apuracao.
 * Mesma altura aproximada nos dois estados e no esqueleto (sem pulo de layout quando o status chega).
 * Candidatos via `useRace` (anônimos na simulação, sem foto); selo SIMULAÇÃO quando for o caso.
 */
import { Link } from 'react-router-dom';
import type { Candidate, LiveStatus, Race, Summary } from '@/shared/types';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { INICIO_APURACAO } from '@/shared/constants';
import { fmtHora, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Countdown } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { Skeleton } from '@/app/ui/Skeleton';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { propsPreCarregar } from '@/app/components/layout/prefetch';
import { useRelogioApuracao } from './relogio';

const caixa = 'relative isolate block overflow-hidden rounded-[22px] border border-line/[1.6] bg-surface/80 p-3.5 shadow-card backdrop-blur-xl';

export interface FaixaFaseProps {
  status: LiveStatus | undefined;
  recebidoEm: number;
  race: Race | undefined;
  resumo: Summary | undefined;
  className?: string;
}

export function FaixaFase({ status, recebidoEm, race, resumo, className }: FaixaFaseProps) {
  if (!status) {
    return (
      <div className={cn(caixa, 'min-h-[146px]', className)} aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="mt-3 h-[58px] w-full" rounded="lg" />
        <Skeleton className="mt-3 h-4 w-56" />
      </div>
    );
  }
  if (status.fase === 'pre') return <Contagem status={status} recebidoEm={recebidoEm} race={race} className={className} />;
  return <Placar status={status} race={race} resumo={resumo} className={className} />;
}

function Contagem({ status, recebidoEm, race, className }: { status: LiveStatus; recebidoEm: number; race: Race | undefined; className?: string }) {
  const relogio = useRelogioApuracao(status, recebidoEm);
  const alvo = status.inicioApuracao || INICIO_APURACAO;
  const finalistas = race?.candidatos.filter((c) => !c.agregado) ?? [];
  return (
    <div className={cn(caixa, 'min-h-[146px]', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
          <Icon name="relogio" size={14} className="text-brand-fg" />
          A apuração começa em
        </span>
        <span className="num shrink-0 text-[12px] font-medium text-fg-muted">25/10 · {fmtHora(alvo)}</span>
      </div>
      <Countdown target={alvo} now={relogio} size="md" hideZeroDays doneLabel="Começando…" className="mt-2.5 w-full [&>div]:min-w-0" />
      {finalistas.length === 2 ? (
        <div className="mt-2.5 flex min-w-0 items-center justify-center gap-2 text-[13px] text-fg-muted">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em]">Presidente</span>
          <Nome c={finalistas[0]} />
          <span aria-hidden className="text-fg-subtle">×</span>
          <Nome c={finalistas[1]} />
        </div>
      ) : null}
    </div>
  );
}

function Nome({ c }: { c: Candidate }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', corSlot(c.cor).bg)} />
      <span className="truncate font-medium text-fg">{c.nomeUrna}</span>
      <span className="num shrink-0 text-fg-subtle">{c.numero}</span>
    </span>
  );
}

function Placar({ status, race, resumo, className }: { status: LiveStatus; race: Race | undefined; resumo: Summary | undefined; className?: string }) {
  const encerrada = status.fase === 'encerrada';
  const finalistas = race?.candidatos.filter((c) => !c.agregado) ?? [];
  const pronto = !!resumo && !!race && finalistas.length === 2;
  const parado = encerrada || status.pausado || status.congelado;
  return (
    <Link
      to="/apuracao"
      {...propsPreCarregar('/apuracao')}
      aria-label="Abrir a apuração ao vivo"
      className={cn(caixa, 'min-h-[146px] transition-colors hover:border-line/[2.4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', className)}
    >
      <div className="flex min-h-[24px] items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.14em] text-fg">
          <LiveDot tone={parado ? 'muted' : 'live'} pulse={!parado} size={7} />
          {encerrada ? 'Apuração encerrada' : 'Ao vivo'}
          <span className="font-semibold text-fg-muted">· Presidente</span>
        </span>
        {status.simulacao ? <SimulationRibbon variant="badge" /> : null}
      </div>
      {pronto ? (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            {finalistas.map((c) => {
              const i = race!.candidatos.indexOf(c);
              const dir = i === 1;
              const semVotos = validos(resumo!) === 0;
              return (
                <div key={c.numero} className={cn('flex min-w-0 flex-col', dir ? 'items-end text-right' : 'items-start')}>
                  <div className={cn('flex min-w-0 max-w-full items-center gap-1.5', dir && 'flex-row-reverse')}>
                    <CandidateAvatar candidato={c} size="xs" eleito={resumo!.eleito === i} />
                    <span className="truncate text-[13px] font-semibold text-fg">{c.nomeUrna}</span>
                  </div>
                  <NumberRoll
                    value={pctValidos(resumo!, i)}
                    format={(n) => fmtPct(n)}
                    smallChars="%"
                    smallClassName="text-[0.5em] ml-[0.04em] font-semibold"
                    className={cn('mt-1 font-display text-[34px] font-semibold leading-none tracking-[-0.045em]', semVotos ? 'text-fg-subtle' : corSlot(c.cor).textDisplay)}
                  />
                </div>
              );
            })}
          </div>
          <VoteSplitBar votos={resumo!.votos} cores={race!.candidatos.map((c) => c.cor)} nomes={race!.candidatos.map((c) => c.nomeUrna)} size="sm" className="mt-2.5" />
          <div className="num mt-2 flex items-center justify-between gap-2 text-[12px] text-fg-muted">
            <span>
              <span className="font-semibold text-fg">{fmtPct(pctTotalizadas(resumo!))}</span> das seções
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-brand-fg">
              Abrir
              <Icon name="seta" size={14} />
            </span>
          </div>
        </>
      ) : (
        <div aria-busy="true">
          <Skeleton className="mt-3 h-[52px] w-full" rounded="lg" />
          <Skeleton className="mt-3 h-2.5 w-full" rounded="full" />
        </div>
      )}
    </Link>
  );
}
