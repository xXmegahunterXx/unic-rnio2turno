/**
 * Painel do hero da Home, conforme a fase da apuração:
 *  - 'pre': contagem regressiva até as 17h (relógio interpolado) e "quem disputa" (ordem da urna);
 *  - 'apurando' / 'encerrada': placar compacto ao vivo da Presidência (AO VIVO, % de seções truncado
 *    como o TSE, barra A | B), com o selo de SIMULAÇÃO e o aviso "Nomes ocultos na simulação".
 * Candidatos SEMPRE via `useRace` (anonimizados na simulação) e na ordem da urna; mesmo tamanho para os dois.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { Candidate, LiveStatus, Race, Summary } from '@/shared/types';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { INICIO_APURACAO } from '@/shared/constants';
import { fmtHora, fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Badge, toneFromCor } from '@/app/ui/Badge';
import { Countdown } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { Skeleton } from '@/app/ui/Skeleton';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { NotaNomesOcultos } from './NotaNomesOcultos';
import { useRelogioApuracao } from './relogio';

const vidro =
  'relative isolate overflow-hidden rounded-[28px] border border-line/[1.6] bg-surface/75 p-5 shadow-card backdrop-blur-xl sm:p-7';

export interface PainelAoVivoProps {
  status: LiveStatus | undefined;
  /** Instante local em que o status chegou (React Query `dataUpdatedAt`), para interpolar o relógio. */
  recebidoEm: number;
  race: Race | undefined;
  resumo: Summary | undefined;
  anonimizado: boolean;
  className?: string;
}

export function PainelAoVivo({ status, recebidoEm, race, resumo, anonimizado, className }: PainelAoVivoProps) {
  const reduzir = useReducedMotion();
  const fase = status?.fase ?? 'pre';
  const chave = !status ? 'carregando' : fase === 'pre' ? 'pre' : 'vivo';
  return (
    <div className={cn(vidro, className)}>
      {/* brilho interno da marca */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-2/50 to-transparent" />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={chave}
          initial={reduzir ? false : { opacity: 0, y: 10, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduzir ? undefined : { opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.35, ease: [0.22, 0.9, 0.24, 1] }}
        >
          {chave === 'carregando' ? (
            <Esqueleto />
          ) : chave === 'pre' ? (
            <Contagem status={status!} recebidoEm={recebidoEm} race={race} />
          ) : (
            <Vivo status={status!} race={race} resumo={resumo} anonimizado={anonimizado} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-5 h-[92px] w-full" rounded="lg" />
      <Skeleton className="mt-6 h-12 w-full" rounded="lg" />
    </div>
  );
}

function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-[11.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted', className)}>{children}</div>;
}

// ── Antes das 17h ──────────────────────────────────────────────────────────────────────────────

function Contagem({ status, recebidoEm, race }: { status: LiveStatus; recebidoEm: number; race: Race | undefined }) {
  // O tique do relógio re-renderiza só este bloco.
  const relogio = useRelogioApuracao(status, recebidoEm);
  const alvo = status.inicioApuracao || INICIO_APURACAO;
  const finalistas = race?.candidatos.filter((c) => !c.agregado) ?? [];
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Rotulo className="inline-flex items-center gap-2">
          <Icon name="relogio" size={15} className="text-brand-fg" />A apuração começa em
        </Rotulo>
        <span className="num shrink-0 text-[12px] font-medium text-fg-muted">
          25/10 · {fmtHora(alvo)} <span className="hidden sm:inline">(Brasília)</span>
        </span>
      </div>
      <Countdown target={alvo} now={relogio} size="lg" hideZeroDays doneLabel="Começando…" className="mt-4 w-full" />

      {finalistas.length === 2 ? (
        <div className="mt-6 border-t border-line pt-5">
          <Rotulo>Quem disputa a Presidência</Rotulo>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
            <Disputante c={finalistas[0]} />
            <span aria-hidden className="mt-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface-2 text-[12px] font-semibold text-fg-subtle sm:mt-3.5">
              ×
            </span>
            <Disputante c={finalistas[1]} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Disputante({ c }: { c: Candidate }) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <CandidateAvatar candidato={c} size="md" className="sm:h-12 sm:w-12" />
      <div className="mt-2 text-balance font-display text-[16px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[18px]">{c.nomeUrna}</div>
      <div className="num mt-0.5 text-[12px] text-fg-muted">
        {c.partido} · {c.numero}
      </div>
    </div>
  );
}

// ── Apurando / encerrada ───────────────────────────────────────────────────────────────────────

function Vivo({ status, race, resumo, anonimizado }: { status: LiveStatus; race: Race | undefined; resumo: Summary | undefined; anonimizado: boolean }) {
  const encerrada = status.fase === 'encerrada';
  const pst = resumo ? pctTotalizadas(resumo) : 0;
  const finalistas = race?.candidatos.filter((c) => !c.agregado) ?? [];
  const pronto = !!resumo && finalistas.length === 2;
  const eleito = pronto && resumo!.eleito !== null ? race!.candidatos[resumo!.eleito] : null;
  return (
    <div>
      <div className="flex min-h-[26px] flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-fg">
          <LiveDot tone={encerrada || status.pausado || status.congelado ? 'muted' : 'live'} pulse={!encerrada && !status.pausado && !status.congelado} />
          {encerrada ? 'Apuração encerrada' : 'Ao vivo'}
          <span className="font-semibold text-fg-muted">· Presidente</span>
        </span>
        {status.simulacao ? <SimulationRibbon variant="badge" /> : null}
      </div>

      {pronto ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-6">
            {finalistas.map((c) => {
              const i = race!.candidatos.indexOf(c);
              return <LadoVivo key={c.numero} c={c} pct={pctValidos(resumo!, i)} votos={resumo!.votos[i] ?? 0} semVotos={validos(resumo!) === 0} eleito={eleito === c} lider={resumo!.lider === i} dir={i === 1} resumo={resumo!} />;
            })}
          </div>
          <VoteSplitBar votos={resumo!.votos} cores={race!.candidatos.map((c) => c.cor)} nomes={race!.candidatos.map((c) => c.nomeUrna)} size="md" className="mt-5" />
          {eleito && !encerrada ? (
            <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-snug text-fg-muted">
              <Icon name="info" size={15} className="mt-px shrink-0 text-fg-subtle" />
              <span>
                <span className="font-semibold text-fg">{eleito.nomeUrna}</span> está matematicamente eleito: a diferença já supera o eleitorado
                que falta apurar.
              </span>
            </p>
          ) : null}

          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-fg-muted">Seções totalizadas</span>
              <span className="num font-semibold text-fg">
                <NumberRoll value={pst} format={(n) => fmtPct(n)} duration={500} />
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div className="h-full rounded-full bg-brand-grad" initial={false} animate={{ width: `${pst}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
            </div>
            <div className="num mt-2 flex items-center justify-between gap-3 text-[12px] text-fg-muted">
              <span>
                {fmtInt(resumo!.secoesTotalizadas)} de {fmtInt(resumo!.secoes)}
              </span>
              {resumo!.ultimaAtualizacao ? <span>Atualizado às {fmtHora(resumo!.ultimaAtualizacao)}</span> : null}
            </div>
          </div>
        </>
      ) : (
        <div aria-busy="true">
          <Skeleton className="mt-5 h-[120px] w-full" rounded="lg" />
          <Skeleton className="mt-5 h-3 w-full" rounded="full" />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {anonimizado ? <NotaNomesOcultos /> : <span />}
        <Link
          to="/apuracao"
          className="group inline-flex items-center gap-1.5 rounded-lg text-[14px] font-semibold text-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Abrir a apuração
          <Icon name="seta" size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

function LadoVivo({
  c,
  pct,
  votos,
  semVotos,
  eleito,
  lider,
  dir,
  resumo,
}: {
  c: Candidate;
  pct: number;
  votos: number;
  semVotos: boolean;
  eleito: boolean;
  lider: boolean;
  dir: boolean;
  resumo: Summary;
}) {
  const s = corSlot(c.cor);
  return (
    <div className={cn('flex min-w-0 flex-col', dir ? 'items-end text-right' : 'items-start text-left')}>
      <div className={cn('flex min-w-0 items-center gap-2.5', dir && 'flex-row-reverse')}>
        <CandidateAvatar candidato={c} size="sm" eleito={eleito} className="sm:h-10 sm:w-10 sm:text-[14px]" />
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[17px]">{c.nomeUrna}</div>
          <div className="num truncate text-[11.5px] text-fg-muted sm:text-[12px]">
            {c.partido} · {c.numero}
          </div>
        </div>
      </div>
      <div className={cn('mt-3 flex h-5 items-center', dir && 'justify-end')}>
        {eleito ? (
          <Badge tone={toneFromCor(c.cor)} size="xs" caps icon="check">
            Eleito
          </Badge>
        ) : lider && !semVotos ? (
          <Badge tone={toneFromCor(c.cor)} size="xs" caps icon="seta-cima">
            À frente
          </Badge>
        ) : null}
      </div>
      <NumberRoll
        value={pct}
        format={(n) => fmtPct(n)}
        smallChars="%"
        smallClassName="text-[0.45em] ml-[0.04em] font-semibold"
        className={cn('mt-1.5 font-display text-[clamp(2.1rem,10.5vw,3.4rem)] font-semibold leading-none tracking-[-0.045em] lg:text-[3.25rem]', semVotos ? 'text-fg-subtle' : s.textDisplay)}
      />
      <div className="num mt-1.5 text-[12px] text-fg-muted sm:text-[13px]">
        <NumberRoll value={votos} className="font-semibold text-fg" /> votos
      </div>
    </div>
  );
}
