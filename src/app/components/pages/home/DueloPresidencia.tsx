/**
 * O confronto do 2º turno para Presidente — o "pôster" do topo da Home (e do topo da apuração antes das 17h):
 * as duas fotos oficiais lado a lado, do MESMO tamanho e tratamento (quadro 4:5, anel e brilho suave na cor de
 * identidade que vem dos dados, `corSlot`/`rgbSlot`), o "×" do confronto, nome, partido · número e o resultado.
 *
 *  - Antes das 17h (`PainelDuelo`, fase 'pre'): o resultado OFICIAL do 1º turno — % dos votos válidos (calc.ts) e
 *    votos —, a barra dividida (os demais candidatos no meio, a linha marca 50%) e a contagem regressiva.
 *  - Apurando/encerrada: o placar do 2º turno (números que rolam), a barra com os 50% e o % de seções totalizadas.
 *    Foto só com números reais e nomes reais (`useFotosHero`): na simulação, o monograma no mesmo quadro.
 *
 * Neutralidade: ordem da urna (como vem em `race.candidatos`: 13 à esquerda, 22 à direita), textos simétricos e sem
 * adjetivos, cores sempre da corrida. Publicidade NUNCA entra aqui (é placar/resultado, com foto e nome): os blocos de
 * anúncio ficam entre as seções da página, separados deste cartão.
 */
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Candidate, LiveStatus, Race, Summary } from '@/shared/types';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { INICIO_APURACAO } from '@/shared/constants';
import { fmtHora, fmtInt, fmtPct } from '@/shared/format';
import { partidoENumero } from '@/shared/anon';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Badge, toneFromCor } from '@/app/ui/Badge';
import { Countdown } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { Skeleton } from '@/app/ui/Skeleton';
import { CandidateRetrato } from '@/app/components/apuracao/CandidateAvatar';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { propsPreCarregar } from '@/app/components/layout/prefetch';
import { NotaNomesOcultos } from './NotaNomesOcultos';
import { useFotosHero, type FotosHero } from './fotosHero';
import { useRelogioApuracao } from './relogio';

const CompartilharConfronto = lazy(() => import('./CompartilharConfronto'));
const preCarregarConfronto = () => void import('./CompartilharConfronto');

// ── Peças ─────────────────────────────────────────────────────────────────────────────────────────

export interface ConfrontoProps {
  race: Race;
  fotos: FotosHero;
  /** Conteúdo sob o nome de cada finalista (resultado); `i` = índice em `race.candidatos`. */
  abaixo?: (c: Candidate, i: number) => ReactNode;
  /** Índice (em `race.candidatos`) de quem está eleito: selo no retrato. */
  eleito?: number | null;
  /** Largura máxima de cada retrato (o quadro mantém 4:5). */
  retratoClassName?: string;
  /** Tamanho do nome. */
  nomeClassName?: string;
  className?: string;
}

/**
 * Fotos (ou monogramas) lado a lado com o "×" no meio, nome e partido · número. Grade de três linhas: os nomes e as
 * linhas de partido ficam alinhados mesmo quando um nome quebra em duas linhas.
 */
export function Confronto({ race, fotos, abaixo, eleito, retratoClassName, nomeClassName, className }: ConfrontoProps) {
  const finalistas = race.candidatos.filter((c) => !c.agregado);
  if (finalistas.length !== 2) return null;
  const idx = finalistas.map((c) => race.candidatos.indexOf(c));
  const colunas = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 min-[400px]:gap-x-4 sm:gap-x-8';
  return (
    <div className={cn('min-w-0', className)} aria-label={`${finalistas[0].nomeUrna} e ${finalistas[1].nomeUrna}`}>
      {/* Linha 1: retratos + "×" sobre o vão (não cobre rosto: fica na borda dos quadros) */}
      <div className={cn('relative', colunas)}>
        {finalistas.map((c, k) => (
          <CandidateRetrato
            key={c.numero}
            candidato={c}
            foto={fotos.fotos[idx[k]]}
            carregando={fotos.estado === 'carregando'}
            eleito={eleito === idx[k]}
            className={cn('mx-auto max-w-[200px]', retratoClassName)}
          />
        ))}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 z-10 inline-flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line/[2] bg-surface font-display text-[20px] font-semibold leading-none text-fg shadow-card sm:h-12 sm:w-12 sm:text-[24px]"
        >
          ×
        </span>
      </div>
      {/* Linha 2: nomes (base alinhada) */}
      <div className={cn('mt-3 items-end text-center sm:mt-4', colunas)}>
        {finalistas.map((c) => (
          <div
            key={c.numero}
            className={cn(
              'min-w-0 text-balance font-display text-[17px] font-semibold leading-[1.1] tracking-[-0.02em] text-fg min-[400px]:text-[18px] sm:text-[22px]',
              nomeClassName,
            )}
          >
            {c.nomeUrna}
          </div>
        ))}
      </div>
      {/* Linha 3: partido · número */}
      <div className={cn('mt-1 text-center', colunas)}>
        {finalistas.map((c) => (
          <div key={c.numero} className={cn('num truncate text-[12.5px] font-semibold sm:text-[13.5px]', corSlot(c.cor).text)}>
            {partidoENumero(c)}
          </div>
        ))}
      </div>
      {abaixo ? (
        <div className={cn('mt-2 text-center sm:mt-3', colunas)}>
          {finalistas.map((c, k) => (
            <div key={c.numero} className="flex min-w-0 flex-col items-center">
              {abaixo(c, idx[k])}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** "45,16%" com o símbolo menor (número grande do placar). */
export function PctGrande({ valor, className }: { valor: number; className?: string }) {
  const txt = fmtPct(valor);
  return (
    <span className={cn('num font-display font-semibold leading-none tracking-[-0.045em]', className)}>
      {txt.slice(0, -1)}
      <span className="ml-[0.04em] text-[0.5em] font-semibold">%</span>
    </span>
  );
}

/** Votos do 1º turno de cada candidato da corrida (oficiais, do dataset); undefined se faltar algum. */
export function votosPrimeiroTurno(race: Pick<Race, 'candidatos'> | undefined): number[] | undefined {
  if (!race) return undefined;
  const v = race.candidatos.map((c) => c.primeiroTurno?.votos);
  return v.every((x): x is number => typeof x === 'number') ? v : undefined;
}

/** Linha "Os demais candidatos somaram X% dos válidos" (só quando há o agregado "Outros"). */
function LegendaOutros({ race, votos }: { race: Race; votos: number[] }) {
  const i = race.candidatos.findIndex((c) => c.agregado);
  return (
    <p className="num mt-2 flex items-center justify-center gap-1.5 text-center text-[11.5px] leading-snug text-fg-muted sm:text-[12.5px]">
      {i >= 0 ? (
        <>
          <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', corSlot(race.candidatos[i].cor).bg)} />
          <span>
            Demais candidatos: <span className="font-semibold text-fg">{fmtPct(pctValidos({ votos }, i))}</span> dos válidos · Fonte: TSE
          </span>
        </>
      ) : (
        <span>% dos votos válidos · a linha marca 50%</span>
      )}
    </p>
  );
}

// ── Resultado oficial do 1º turno (antes das 17h) ─────────────────────────────────────────────────

export interface DueloPrimeiroTurnoProps {
  /** Corrida do 1º turno ('pres-t1': os dois finalistas + "Outros"). */
  race: Race;
  /** Resultado grande (Home) ou só uma linha "1º turno: 45,16%" (topo da apuração, que mostra o placar logo abaixo). */
  variante?: 'resultado' | 'compacto';
  retratoClassName?: string;
  nomeClassName?: string;
  className?: string;
}

/** Fotos + resultado oficial do 1º turno (dado real: foto liberada, salvo nomes ocultos na simulação). */
export function DueloPrimeiroTurno({ race, variante = 'resultado', retratoClassName, nomeClassName, className }: DueloPrimeiroTurnoProps) {
  const fotos = useFotosHero(race);
  const votos = votosPrimeiroTurno(race);
  const grande = variante === 'resultado';
  return (
    <div className={cn('min-w-0', className)}>
      <Confronto
        race={race}
        fotos={fotos}
        retratoClassName={retratoClassName}
        nomeClassName={nomeClassName}
        abaixo={
          votos
            ? (c, i) =>
                grande ? (
                  <>
                    <PctGrande
                      valor={pctValidos({ votos }, i)}
                      className={cn('mt-1 text-[34px] min-[400px]:text-[38px] sm:text-[46px] lg:text-[50px]', corSlot(c.cor).textDisplay)}
                    />
                    <span className="num mt-1 text-[12px] text-fg-muted sm:text-[13px]">
                      <span className="font-semibold text-fg">{fmtInt(votos[i])}</span> votos
                    </span>
                  </>
                ) : (
                  <span className="num inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/80 px-2.5 py-1 text-[12px] text-fg-muted sm:text-[12.5px]">
                    1º turno
                    <span className={cn('font-semibold', corSlot(c.cor).text)}>{fmtPct(pctValidos({ votos }, i))}</span>
                  </span>
                )
            : undefined
        }
      />
      {grande && votos ? (
        <div className="mt-4 sm:mt-5">
          <VoteSplitBar votos={votos} cores={race.candidatos.map((c) => c.cor)} nomes={race.candidatos.map((c) => c.nomeUrna)} size="md" />
          <LegendaOutros race={race} votos={votos} />
        </div>
      ) : null}
    </div>
  );
}

// ── Cartão da Home (todas as fases) ───────────────────────────────────────────────────────────────

const vidro =
  'relative isolate overflow-hidden rounded-[28px] border border-line/[1.6] bg-surface/80 p-3.5 shadow-card backdrop-blur-xl min-[400px]:p-4 sm:p-6 lg:p-7';

export interface PainelDueloProps {
  status: LiveStatus | undefined;
  /** `dataUpdatedAt` do status (interpola a contagem). */
  recebidoEm: number;
  /** Corrida do 2º turno ('pres'), anônima na simulação. */
  race: Race | undefined;
  /** Corrida do 1º turno ('pres-t1'), anônima na simulação. */
  raceT1: Race | undefined;
  /** Placar do 2º turno (apurando/encerrada). */
  resumo: Summary | undefined;
  anonimizado: boolean;
  /** Retratos maiores (coluna do desktop). */
  largo?: boolean;
  className?: string;
}

export function PainelDuelo({ status, recebidoEm, race, raceT1, resumo, anonimizado, largo, className }: PainelDueloProps) {
  const fase = status?.fase;
  const retrato = largo ? 'max-w-[220px] xl:max-w-[236px]' : 'max-w-[176px] sm:max-w-[210px]';
  return (
    <div className={cn(vidro, className)}>
      {/* brilho interno da marca (decoração neutra: nunca cor de candidato) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-2/50 to-transparent" />
        <div className="absolute -top-28 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-brand/[0.14] blur-3xl" />
      </div>
      {!status || (fase === 'pre' ? !raceT1 : !race) ? (
        <Esqueleto retrato={retrato} />
      ) : fase === 'pre' ? (
        <>
          <Cabecalho>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Icon name="check-circulo" size={14} className="shrink-0 text-brand-fg" />
              <span className="truncate">Resultado do 1º turno</span>
            </span>
            <BotaoCompartilharConfronto race={raceT1!} simulado={false} />
          </Cabecalho>
          <DueloPrimeiroTurno race={raceT1!} retratoClassName={retrato} className="mt-3.5 sm:mt-5" />
          <ContagemDuelo status={status} recebidoEm={recebidoEm} />
          {anonimizado ? <NotaNomesOcultos className="mt-3" /> : null}
        </>
      ) : (
        <AoVivo status={status} race={race!} resumo={resumo} anonimizado={anonimizado} retrato={retrato} />
      )}
    </div>
  );
}

function Cabecalho({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[22px] items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-fg-muted sm:text-[11.5px]">
      {children}
    </div>
  );
}

/**
 * "Compartilhar" do cartão: abre o sheet do kit com o cartão do placar (o mesmo da apuração). O sheet só é baixado no
 * 1º toque (ou ao apontar/focar); ícone sozinho abaixo de 400 px.
 */
function BotaoCompartilharConfronto({ race, simulado }: { race: Race; simulado: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  const rotulo = race.turno === 1 ? 'Compartilhar resultado' : 'Compartilhar placar';
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={rotulo}
        title={rotulo}
        onPointerEnter={preCarregarConfronto}
        onFocus={preCarregarConfronto}
        onClick={() => {
          setMontado(true);
          setAberto(true);
        }}
        className={cn(
          'toque relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line/[1.6] bg-surface-2/80 px-2.5',
          'text-[12px] font-semibold normal-case tracking-normal text-fg transition-colors hover:border-line/[3] hover:bg-surface-3',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        )}
      >
        <Icon name="compartilhar" size={14} className="text-brand-fg" />
        <span className="max-[399px]:sr-only">Compartilhar</span>
      </button>
      {montado ? (
        <Suspense fallback={null}>
          <CompartilharConfronto aberto={aberto} onFechar={() => setAberto(false)} race={race} simulado={simulado} />
        </Suspense>
      ) : null}
    </>
  );
}

function Esqueleto({ retrato }: { retrato: string }) {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-3.5 w-48" />
      <div className="mt-3.5 grid grid-cols-2 gap-x-3 min-[400px]:gap-x-4 sm:mt-5 sm:gap-x-8">
        {[0, 1].map((k) => (
          <div key={k} className={cn('mx-auto aspect-[4/5] w-full', retrato)}>
            <Skeleton className="h-full w-full" rounded="lg" />
          </div>
        ))}
      </div>
      <Skeleton className="mx-auto mt-4 h-5 w-3/4" />
      <Skeleton className="mt-4 h-[46px] w-full" rounded="lg" />
      <Skeleton className="mt-5 h-[62px] w-full" rounded="lg" />
    </div>
  );
}

/** Contagem regressiva para as 17h de 25/10 (relógio interpolado; o tique re-renderiza só este bloco). */
function ContagemDuelo({ status, recebidoEm }: { status: LiveStatus; recebidoEm: number }) {
  const relogio = useRelogioApuracao(status, recebidoEm);
  const alvo = status.inicioApuracao || INICIO_APURACAO;
  return (
    <div className="mt-4 border-t border-line pt-3.5 sm:mt-6 sm:pt-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-fg sm:text-[11.5px]">
          <Icon name="relogio" size={14} className="shrink-0 text-brand-fg" />
          <span className="truncate">2º turno · apuração em</span>
        </span>
        <span className="num shrink-0 text-[12px] font-medium text-fg-muted">
          25/10 · {fmtHora(alvo)} <span className="hidden sm:inline">(Brasília)</span>
        </span>
      </div>
      <Countdown target={alvo} now={relogio} size="md" hideZeroDays doneLabel="Começando…" className="mt-2.5 w-full [&>div]:min-w-0" />
    </div>
  );
}

// ── Apurando / encerrada ──────────────────────────────────────────────────────────────────────────

function AoVivo({ status, race, resumo, anonimizado, retrato }: { status: LiveStatus; race: Race; resumo: Summary | undefined; anonimizado: boolean; retrato: string }) {
  const encerrada = status.fase === 'encerrada';
  const parado = encerrada || status.pausado || status.congelado;
  const fotos = useFotosHero(race);
  const pronto = !!resumo && race.candidatos.filter((c) => !c.agregado).length === 2;
  const semVotos = pronto ? validos(resumo!) === 0 : true;
  const pst = resumo ? pctTotalizadas(resumo) : 0;
  const eleito = pronto ? resumo!.eleito : null;
  const eleitoC = eleito !== null && eleito !== undefined ? race.candidatos[eleito] : null;
  return (
    <div>
      <Cabecalho>
        <span className="inline-flex min-w-0 items-center gap-2 font-bold text-fg">
          <LiveDot tone={parado ? 'muted' : 'live'} pulse={!parado} size={7} />
          <span className="truncate">
            {encerrada ? 'Apuração encerrada' : 'Ao vivo'}
            <span className="font-semibold text-fg-muted"> · Presidente</span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2">
          {status.simulacao ? <SimulationRibbon variant="badge" /> : null}
          {pronto ? <BotaoCompartilharConfronto race={race} simulado={status.simulacao} /> : null}
        </span>
      </Cabecalho>

      {pronto ? (
        <>
          <Confronto
            race={race}
            fotos={fotos}
            eleito={eleito}
            retratoClassName={retrato}
            className="mt-3.5 sm:mt-5"
            abaixo={(c, i) => (
              <>
                <span className="mt-1 flex h-5 items-center">
                  {eleito === i ? (
                    <Badge tone={toneFromCor(c.cor)} size="xs" caps icon="check">
                      Eleito
                    </Badge>
                  ) : resumo!.lider === i && !semVotos && eleito === null ? (
                    <Badge tone={toneFromCor(c.cor)} size="xs" caps icon="seta-cima">
                      À frente
                    </Badge>
                  ) : null}
                </span>
                <NumberRoll
                  value={pctValidos(resumo!, i)}
                  format={(n) => fmtPct(n)}
                  smallChars="%"
                  smallClassName="text-[0.5em] ml-[0.04em] font-semibold"
                  className={cn(
                    'mt-1 font-display text-[34px] font-semibold leading-none tracking-[-0.045em] min-[400px]:text-[38px] sm:text-[46px] lg:text-[50px]',
                    semVotos ? 'text-fg-subtle' : corSlot(c.cor).textDisplay,
                  )}
                />
                <span className="num mt-1 text-[12px] text-fg-muted sm:text-[13px]">
                  <NumberRoll value={resumo!.votos[i] ?? 0} className="font-semibold text-fg" /> votos
                </span>
              </>
            )}
          />
          <VoteSplitBar votos={resumo!.votos} cores={race.candidatos.map((c) => c.cor)} nomes={race.candidatos.map((c) => c.nomeUrna)} size="md" className="mt-4 sm:mt-5" />
          {eleitoC && !encerrada ? (
            <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-snug text-fg-muted">
              <Icon name="info" size={15} className="mt-px shrink-0 text-fg-subtle" />
              <span>
                <span className="font-semibold text-fg">{eleitoC.nomeUrna}</span> está matematicamente eleito: a diferença já supera o eleitorado que
                falta apurar.
              </span>
            </p>
          ) : null}
          <div className="mt-4 border-t border-line pt-3.5 sm:mt-5 sm:pt-4">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-fg-muted">Seções totalizadas</span>
              <span className="num font-semibold text-fg">
                <NumberRoll value={pst} format={(n) => fmtPct(n)} duration={500} />
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full w-full origin-left rounded-full bg-brand-grad transition-transform duration-700 ease-out"
                style={{ transform: `scaleX(${Math.max(0, Math.min(100, pst)) / 100})` }}
              />
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
        <Esqueleto retrato={retrato} />
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {anonimizado ? <NotaNomesOcultos /> : <span />}
        <Link
          to="/apuracao"
          {...propsPreCarregar('/apuracao')}
          className="group inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-[14px] font-semibold text-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Abrir a apuração
          <Icon name="seta" size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
