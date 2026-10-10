/**
 * Widgets para incorporar (iframe em sites e blogs) — também usados como prévia no diálogo "Incorporar".
 * Leves: sem o cabeçalho do site; só os hooks de dados (que já se atualizam sozinhos) e componentes de apuração.
 *
 * Regras: candidatos via `useRace` (anônimos na simulação, sem foto), ordem da urna, cores por slot; selo
 * SIMULAÇÃO e "dados fictícios" sempre que houver número simulado; link "via Sintonia ↗" em nova aba.
 * Antes das 17h de 25/10: contagem regressiva + quem disputa + o 1º turno OFICIAL (mapa e cidades).
 */
import type { ReactNode } from 'react';
import { UFS, type Candidate, type LiveStatus, type Race, type Summary, type UF, type UFBr } from '@/shared/types';
import { INICIO_APURACAO, UF_NOMES, UFS_GOV_2T } from '@/shared/constants';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtHora, fmtInt, fmtPct } from '@/shared/format';
import { useAnonimizado, useNacional, useRace, useStatus, useUf } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { abrirExterno, urlAbsoluta } from '@/app/lib/share';
import { Countdown } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { Skeleton } from '@/app/ui/Skeleton';
import { BrazilMap } from '@/app/components/apuracao/BrazilMap';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { SimulationRibbon } from '@/app/components/apuracao/SimulationRibbon';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { LogoMark } from '@/app/components/layout/Logo';
import { useRelogioApuracao } from '@/app/components/pages/home/relogio';
import { caminhoPaginaCompleta, type OpcoesEmbed } from './codigo';

export function WidgetEmbed({ opcoes, className }: { opcoes: OpcoesEmbed; className?: string }) {
  if (opcoes.tipo === 'mapa') return <WidgetMapa opcoes={opcoes} className={className} />;
  if (opcoes.tipo === 'uf') return <WidgetUf opcoes={opcoes} className={className} />;
  return <WidgetPlacar opcoes={opcoes} className={className} />;
}

// ── Moldura ─────────────────────────────────────────────────────────────────────────────────

function Moldura({
  opcoes,
  titulo,
  contexto,
  selo,
  rodape,
  children,
  className,
}: {
  opcoes: OpcoesEmbed;
  titulo: ReactNode;
  contexto?: ReactNode;
  selo?: ReactNode;
  rodape: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const link = urlAbsoluta(caminhoPaginaCompleta(opcoes));
  return (
    <div className={cn('flex w-full flex-col bg-surface text-fg', className)}>
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <LogoMark size={22} />
          <div className="min-w-0 truncate text-[14px] font-semibold leading-tight">
            {titulo}
            {contexto ? <span className="font-medium text-fg-muted"> · {contexto}</span> : null}
          </div>
        </div>
        {selo}
      </header>
      <div className="min-w-0 px-4 pb-3.5 pt-3">{children}</div>
      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[11.5px] text-fg-muted">
        <span className="min-w-0 truncate">{rodape}</span>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md font-semibold text-fg hover:text-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          via Sintonia
          <Icon name="externo" size={13} />
        </a>
      </footer>
    </div>
  );
}

function SeloFase({ status, t1, simulado }: { status: LiveStatus | undefined; t1: boolean; simulado: boolean }) {
  if (!status) return null;
  if (simulado) return <SimulationRibbon variant="badge" />;
  if (t1 || status.fase === 'pre')
    return (
      <span className="num inline-flex h-6 shrink-0 items-center gap-1.5 rounded-lg bg-surface-3 px-2 text-[11px] font-semibold text-fg-muted">
        <Icon name="relogio" size={12} />
        25/10 · 17h
      </span>
    );
  const parado = status.fase === 'encerrada' || status.pausado || status.congelado;
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-lg bg-surface-3 px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-fg">
      <LiveDot tone={parado ? 'muted' : 'live'} pulse={!parado} size={7} />
      {status.fase === 'encerrada' ? 'Encerrada' : 'Ao vivo'}
    </span>
  );
}

function rodapeDe(status: LiveStatus | undefined, resumo: Summary | undefined, simulado: boolean, t1: boolean): string {
  if (simulado) return `Simulação · dados fictícios${resumo?.ultimaAtualizacao ? ` · ${fmtHora(resumo.ultimaAtualizacao)}` : ''}`;
  if (t1) return 'Resultado oficial do 1º turno · Fonte: TSE';
  if (status?.fase === 'pre') return 'Apuração a partir das 17h (Brasília) · Fonte: TSE';
  return `Fonte: TSE${resumo?.ultimaAtualizacao ? ` · atualizado às ${fmtHora(resumo.ultimaAtualizacao)}` : ''}`;
}

// ── Duelo compacto (2º turno) ───────────────────────────────────────────────────────────────

function Duelo({ race, resumo }: { race: Race; resumo: Summary }) {
  const finalistas = race.candidatos.filter((c) => !c.agregado);
  const semVotos = validos(resumo) === 0;
  return (
    <div aria-live="polite">
      <div className="grid grid-cols-2 gap-3">
        {finalistas.map((c) => {
          const i = race.candidatos.indexOf(c);
          const dir = i === 1;
          return (
            <div key={c.numero} className={cn('flex min-w-0 flex-col', dir ? 'items-end text-right' : 'items-start')}>
              <div className={cn('flex min-w-0 max-w-full items-center gap-2', dir && 'flex-row-reverse')}>
                <CandidateAvatar candidato={c} size="sm" eleito={resumo.eleito === i} />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold leading-tight">{c.nomeUrna}</div>
                  <div className="num truncate text-[11.5px] text-fg-muted">
                    {c.partido} · {c.numero}
                  </div>
                </div>
              </div>
              <NumberRoll
                value={pctValidos(resumo, i)}
                format={(n) => fmtPct(n)}
                smallChars="%"
                smallClassName="text-[0.48em] ml-[0.04em] font-semibold"
                className={cn('mt-2 font-display text-[clamp(1.9rem,9vw,2.75rem)] font-semibold leading-none tracking-[-0.045em]', semVotos ? 'text-fg-subtle' : corSlot(c.cor).textDisplay)}
              />
              <div className="num mt-1 text-[11.5px] text-fg-muted">{fmtInt(resumo.votos[i] ?? 0)} votos</div>
            </div>
          );
        })}
      </div>
      <VoteSplitBar votos={resumo.votos} cores={race.candidatos.map((c) => c.cor)} nomes={race.candidatos.map((c) => c.nomeUrna)} size="sm" className="mt-3" />
      <div className="num mt-2 flex items-center justify-between gap-2 text-[12px] text-fg-muted">
        <span>
          <span className="font-semibold text-fg">{fmtPct(pctTotalizadas(resumo))}</span> das seções totalizadas
        </span>
        {resumo.eleito !== null && race.candidatos[resumo.eleito] ? (
          <span className="font-semibold text-fg">{race.candidatos[resumo.eleito].nomeUrna} eleito</span>
        ) : null}
      </div>
    </div>
  );
}

/** Antes das 17h: contagem regressiva e quem disputa (e o 1º turno, se não for simulação anônima). */
function Antes({ race, status, recebidoEm }: { race: Race | undefined; status: LiveStatus; recebidoEm: number }) {
  const anonimizado = useAnonimizado();
  const relogio = useRelogioApuracao(status, recebidoEm);
  const alvo = status.inicioApuracao || INICIO_APURACAO;
  const finalistas = race?.candidatos.filter((c) => !c.agregado) ?? [];
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">A apuração começa em</div>
      <Countdown target={alvo} now={relogio} size="sm" hideZeroDays doneLabel="Começando…" className="mt-2 w-full [&>div]:min-w-0" />
      {finalistas.length === 2 ? (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {finalistas.map((c) => (
            <Disputante key={c.numero} c={c} mostrar1t={!anonimizado} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Disputante({ c, mostrar1t }: { c: Candidate; mostrar1t: boolean }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-2.5 py-2">
      <CandidateAvatar candidato={c} size="xs" />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold leading-tight">{c.nomeUrna}</div>
        <div className="num truncate text-[11px] text-fg-muted">
          {c.partido} · {c.numero}
          {mostrar1t && c.primeiroTurno ? ` · ${fmtPct(c.primeiroTurno.pct)} no 1º turno` : ''}
        </div>
      </div>
    </li>
  );
}

// ── Placar ──────────────────────────────────────────────────────────────────────────────────

function WidgetPlacar({ opcoes, className }: { opcoes: OpcoesEmbed; className?: string }) {
  const statusQ = useStatus();
  const status = statusQ.data;
  const race = useRace(opcoes.race);
  const q = useNacional(opcoes.race);
  const resumo = q.data && q.data.race === opcoes.race ? q.data.resumo : undefined;
  const pre = status?.fase === 'pre';
  const simulado = !!status?.simulacao && !pre;
  const gov = opcoes.race.startsWith('gov-');
  const ufGov = gov ? (opcoes.race.slice(4).toUpperCase() as UF) : null;
  return (
    <Moldura
      opcoes={opcoes}
      className={className}
      titulo={gov ? 'Governador' : 'Presidente'}
      contexto={ufGov ? UF_NOMES[ufGov] : '2º turno'}
      selo={<SeloFase status={status} t1={false} simulado={simulado} />}
      rodape={rodapeDe(status, resumo, simulado, false)}
    >
      {!status || !race ? (
        <EsqueletoDuelo />
      ) : pre ? (
        <Antes race={race} status={status} recebidoEm={statusQ.dataUpdatedAt} />
      ) : resumo ? (
        <Duelo race={race} resumo={resumo} />
      ) : (
        <EsqueletoDuelo />
      )}
    </Moldura>
  );
}

function EsqueletoDuelo() {
  return (
    <div aria-busy="true">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[88px] w-full" rounded="lg" />
        <Skeleton className="h-[88px] w-full" rounded="lg" />
      </div>
      <Skeleton className="mt-3 h-2.5 w-full" rounded="full" />
    </div>
  );
}

// ── Mapa ────────────────────────────────────────────────────────────────────────────────────

function WidgetMapa({ opcoes, className }: { opcoes: OpcoesEmbed; className?: string }) {
  const { data: status } = useStatus();
  const t1 = status?.fase === 'pre';
  const raceId = t1 ? 'pres-t1' : 'pres';
  const race = useRace(raceId);
  const q = useNacional(raceId);
  const data = q.data && q.data.race === raceId ? q.data : undefined;
  const simulado = !!status?.simulacao && !t1;
  const finalistas = race?.candidatos.filter((c) => !c.agregado) ?? [];
  const cont = new Map<number, number>();
  let aguardando = 0;
  if (data)
    for (const uf of UFS) {
      const t = data.ufs[uf];
      if (!t || t.secoesTotalizadas <= 0 || validos(t) === 0) aguardando++;
      else {
        const m = margem(t);
        if (m.lider !== null) cont.set(m.lider, (cont.get(m.lider) ?? 0) + 1);
      }
    }
  return (
    <Moldura
      opcoes={opcoes}
      className={className}
      titulo="Presidente"
      contexto={t1 ? 'mais votado no 1º turno' : 'quem está à frente em cada estado'}
      selo={<SeloFase status={status} t1={t1} simulado={simulado} />}
      rodape={rodapeDe(status, data?.resumo, simulado, t1)}
    >
      {race && data ? (
        <>
          <ul className="grid grid-cols-2 gap-2">
            {finalistas.map((c) => {
              const i = race.candidatos.indexOf(c);
              return (
                <li key={c.numero} className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-2.5 py-2">
                  <span aria-hidden className={cn('h-3 w-3 shrink-0 rounded-[4px]', corSlot(c.cor).bg)} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{c.nomeUrna}</span>
                  <span className={cn('num font-display text-[20px] font-semibold leading-none', corSlot(c.cor).textDisplay)}>{fmtInt(cont.get(i) ?? 0)}</span>
                </li>
              );
            })}
          </ul>
          <p className="num mt-1.5 text-[11.5px] text-fg-muted">
            {t1 ? 'Estados com cada um como mais votado' : 'Estados com cada um à frente'}
            {aguardando > 0 ? ` · ${fmtInt(aguardando)} aguardando` : ''}
            {!t1 ? ` · ${fmtPct(pctTotalizadas(data.resumo))} das seções` : ''}
          </p>
          <div className="mx-auto mt-2 w-full max-w-[520px]">
            <BrazilMap
              ufs={data.ufs}
              race={race}
              valores={false}
              onSelect={(uf: UFBr) => abrirExterno(urlAbsoluta(`/apuracao/${uf.toLowerCase()}${t1 ? '?race=pres-t1' : ''}`))}
              rotuloAcao={(uf) => `Abrir ${uf} no Sintonia`}
              ariaLabel={t1 ? 'Mais votado em cada estado no 1º turno' : 'Quem está à frente em cada estado'}
            />
          </div>
        </>
      ) : (
        <div aria-busy="true">
          <Skeleton className="h-11 w-full" rounded="lg" />
          <Skeleton className="mx-auto mt-3 aspect-square w-full max-w-[420px]" rounded="lg" />
        </div>
      )}
    </Moldura>
  );
}

// ── Estado ──────────────────────────────────────────────────────────────────────────────────

function WidgetUf({ opcoes, className }: { opcoes: OpcoesEmbed; className?: string }) {
  const { data: status } = useStatus();
  const uf = opcoes.uf;
  const t1 = status?.fase === 'pre';
  const raceId = t1 ? 'pres-t1' : 'pres';
  const race = useRace(raceId);
  const q = useUf(raceId, uf);
  const data = q.data && q.data.race === raceId && q.data.uf === uf ? q.data : undefined;
  const temGov = UFS_GOV_2T.includes(uf);
  const simulado = !!status?.simulacao && !t1;
  const maiores = data ? [...data.municipios].sort((a, b) => b.eleitorado - a.eleitorado).slice(0, 5) : [];
  return (
    <Moldura
      opcoes={opcoes}
      className={className}
      titulo={UF_NOMES[uf]}
      contexto={t1 ? '1º turno · Presidente' : '2º turno'}
      selo={<SeloFase status={status} t1={t1} simulado={simulado} />}
      rodape={rodapeDe(status, data?.resumo, simulado, t1)}
    >
      {race && data ? (
        <>
          {t1 ? <LinhasT1 race={race} resumo={data.resumo} /> : <Duelo race={race} resumo={data.resumo} />}
          {temGov && !t1 ? <GovCompacto uf={uf} /> : null}
          <div className="mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Maiores cidades</div>
            <ul className="mt-1.5 divide-y divide-line">
              {maiores.map((m) => {
                const sem = validos(m) === 0;
                const lider = sem ? null : margem(m).lider;
                const c = lider !== null ? race.candidatos[lider] : null;
                return (
                  <li key={m.cod} className="flex items-center gap-2.5 py-1.5 text-[13px]">
                    <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', c ? corSlot(c.cor).bg : 'bg-pending')} />
                    <span className="min-w-0 flex-1 truncate font-medium">{m.nome}</span>
                    <span className="num shrink-0 text-fg-muted">{c ? `${c.nomeUrna} ${fmtPct(pctValidos(m, lider!))}` : 'aguardando'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : (
        <div aria-busy="true">
          <EsqueletoDuelo />
          <Skeleton className="mt-4 h-28 w-full" rounded="lg" />
        </div>
      )}
    </Moldura>
  );
}

/** 1º turno (oficial): finalistas + demais, em linhas. */
function LinhasT1({ race, resumo }: { race: Race; resumo: Summary }) {
  return (
    <ul className="space-y-2.5">
      {race.candidatos.map((c, i) => {
        const pct = pctValidos(resumo, i);
        return (
          <li key={`${c.numero}-${i}`}>
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className={cn('min-w-0 truncate', c.agregado ? 'text-fg-muted' : 'font-semibold')}>{c.agregado ? 'Demais candidatos' : c.nomeUrna}</span>
              <span className={cn('num shrink-0 font-display text-[18px] font-semibold', c.agregado ? 'text-fg-muted' : corSlot(c.cor).textDisplay)}>{fmtPct(pct)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className={cn('h-full rounded-full', c.agregado ? 'bg-cand-outros/60' : corSlot(c.cor).bg)} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function GovCompacto({ uf }: { uf: UF }) {
  const id = `gov-${uf.toLowerCase()}`;
  const race = useRace(id);
  const q = useNacional(id);
  const resumo = q.data && q.data.race === id ? q.data.resumo : undefined;
  if (!race || !resumo) return null;
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
        <span>Governador</span>
        <span className="num normal-case tracking-normal">{fmtPct(pctTotalizadas(resumo))} das seções</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {race.candidatos.map((c, i) => (
          <li key={c.numero} className="flex items-center gap-2 text-[13px]">
            <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', corSlot(c.cor).bg)} />
            <span className="min-w-0 flex-1 truncate font-medium">{c.nomeUrna}</span>
            <span className={cn('num font-display text-[16px] font-semibold', validos(resumo) === 0 ? 'text-fg-subtle' : corSlot(c.cor).textDisplay)}>{fmtPct(pctValidos(resumo, i))}</span>
          </li>
        ))}
      </ul>
      <VoteSplitBar votos={resumo.votos} cores={race.candidatos.map((c) => c.cor)} size="xs" className="mt-2" />
    </div>
  );
}
