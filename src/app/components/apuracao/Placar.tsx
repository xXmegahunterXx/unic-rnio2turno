/**
 * Placar — o "duelo" principal. Candidatos SEMPRE na ordem da urna (A à esquerda, B à direita),
 * nunca reordenados por quem lidera (neutralidade). Percentual de válidos em NumberRoll, votos
 * absolutos, partido/número, vice, selo de quem está à frente e de "Eleito".
 *
 * Variantes:
 *  - 'hero'    → página nacional (números gigantes, barra, progresso).
 *  - 'default' → mesma estrutura, escala menor (UF, município).
 *  - 'compact' → cartões de UF/governador (linhas por candidato).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Candidate, Race, Summary } from '@/shared/types';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Badge, toneFromCor } from '@/app/ui/Badge';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { ApuracaoProgress } from './ApuracaoProgress';
import { CandidateAvatar } from './CandidateAvatar';
import { SimulationRibbon } from './SimulationRibbon';
import { VoteSplitBar } from './VoteSplitBar';

export interface PlacarProps {
  race: Race;
  resumo: Summary;
  variant?: 'hero' | 'default' | 'compact';
  /** Linha acima do placar (hero/default) ou título do cartão (compact). Padrão: race.titulo. */
  titulo?: ReactNode;
  /** Subtítulo do cartão compacto (ex.: "Governador"). */
  subtitulo?: ReactNode;
  /** Cartão compacto clicável (link do react-router). */
  to?: string;
  onClick?: () => void;
  /** Mostra o progresso da apuração (padrão: true no hero/default, barra fina no compact). */
  showProgress?: boolean;
  /** Mostra o vice (padrão true no hero). */
  showVice?: boolean;
  /** Selo de simulação dentro do placar. */
  simulado?: boolean;
  /** Ações no canto (ex.: ShareButton). */
  actions?: ReactNode;
  className?: string;
}

interface Linha {
  i: number;
  c: Candidate;
  pct: number;
  votos: number;
  lider: boolean;
  eleito: boolean;
}

function linhas(race: Race, resumo: Summary): { finalistas: Linha[]; outros: Linha | null } {
  const todas = race.candidatos.map((c, i) => ({
    i,
    c,
    pct: pctValidos(resumo, i),
    votos: resumo.votos[i] ?? 0,
    lider: resumo.lider === i,
    eleito: race.turno === 2 && resumo.eleito === i,
  }));
  return { finalistas: todas.filter((l) => !l.c.agregado), outros: todas.find((l) => l.c.agregado) ?? null };
}

/** Texto curto para aria-live (1 casa decimal, para não "falar" a cada atualização mínima). */
function textoVivo(race: Race, resumo: Summary): string {
  if (validos(resumo) === 0) return `${race.titulo}: aguardando votos.`;
  const partes = race.candidatos.map((c, i) => `${c.nomeUrna} ${fmtPct(pctValidos(resumo, i), 1)}`);
  const el = resumo.eleito !== null && race.turno === 2 ? ` ${race.candidatos[resumo.eleito]?.nomeUrna} eleito.` : '';
  return `${race.titulo}: ${partes.join(', ')} dos votos válidos, com ${fmtPct(pctTotalizadas(resumo), 1)} das seções.${el}`;
}

function SeloEleito({ resumo, cor, size = 'sm', className }: { resumo: Summary; cor: Candidate['cor']; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const mat = resumo.status !== 'encerrada';
  return (
    <Badge tone={toneFromCor(cor)} size={size} icon="check" caps className={className}>
      {mat ? 'Matematicamente eleito' : 'Eleito'}
    </Badge>
  );
}

export function Placar(props: PlacarProps) {
  return props.variant === 'compact' ? <PlacarCompacto {...props} /> : <PlacarDuelo {...props} />;
}

function PlacarDuelo({
  race,
  resumo,
  variant = 'hero',
  titulo,
  showProgress = true,
  showVice,
  simulado,
  actions,
  className,
}: PlacarProps) {
  const hero = variant === 'hero';
  const { finalistas, outros } = linhas(race, resumo);
  const semVotos = validos(resumo) === 0;
  const vice = showVice ?? hero;
  const eleito = finalistas.find((l) => l.eleito);
  const [a, b] = finalistas;
  const pctCls = hero
    ? 'text-[clamp(2.6rem,12.5vw,5.75rem)] sm:text-[clamp(4rem,8vw,6.25rem)]'
    : 'text-[clamp(2.25rem,10vw,3.5rem)]';

  return (
    <section
      aria-label={`Placar · ${race.titulo}`}
      className={cn(
        'relative overflow-hidden rounded-3xl border border-line bg-surface shadow-card',
        hero ? 'p-4 pt-5 sm:p-8' : 'p-4 sm:p-6',
        className,
      )}
    >
      {/* brilhos laterais nas cores dos slots: identidade do duelo, sem favorecer ninguém */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className={cn('absolute -left-24 -top-24 h-64 w-64 rounded-full blur-3xl', a ? corSlot(a.c.cor).bgSoft : '', 'opacity-60')} />
        <div className={cn('absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl', b ? corSlot(b.c.cor).bgSoft : '', 'opacity-60')} />
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {textoVivo(race, resumo)}
      </p>

      <div className="relative">
        <div className="mb-4 flex min-h-[28px] items-center justify-between gap-3 sm:mb-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 text-[12px] font-semibold uppercase leading-tight tracking-[0.14em] text-fg-muted">
              {titulo ?? (
                <>
                  {race.titulo}
                  <span className="hidden sm:inline"> · {race.turno}º turno</span>
                </>
              )}
            </span>
            {simulado ? <SimulationRibbon variant="badge" /> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {eleito ? <SeloEleito resumo={resumo} cor={eleito.c.cor} size={hero ? 'sm' : 'xs'} className="hidden sm:inline-flex" /> : null}
            {actions}
          </div>
        </div>

        <div className={cn('grid grid-cols-2 gap-x-3 sm:gap-x-8', hero && 'lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]')}>
          {a ? <LadoDuelo l={a} lado="esq" hero={hero} pctCls={pctCls} semVotos={semVotos} vice={vice} resumo={resumo} /> : <div />}
          {hero ? <Diferenca resumo={resumo} /> : null}
          {b ? <LadoDuelo l={b} lado="dir" hero={hero} pctCls={pctCls} semVotos={semVotos} vice={vice} resumo={resumo} /> : <div />}
        </div>

        <div className={cn(hero ? 'mt-5 sm:mt-7' : 'mt-4 sm:mt-5')}>
          <VoteSplitBar
            votos={resumo.votos}
            cores={race.candidatos.map((c) => c.cor)}
            size={hero ? 'lg' : 'md'}
            nomes={race.candidatos.map((c) => c.nomeUrna)}
          />
          <div className="mt-2 flex items-center justify-between text-[11.5px] text-fg-muted">
            <span className="num">{a ? fmtPct(a.pct, 1) : ''}</span>
            <span>50% dos válidos</span>
            <span className="num">{b ? fmtPct(b.pct, 1) : ''}</span>
          </div>
          {outros ? (
            <p className="mt-2 text-center text-[12.5px] text-fg-muted">
              Demais candidatos: <span className="num font-medium text-fg">{fmtPct(outros.pct)}</span> ·{' '}
              <span className="num">{fmtInt(outros.votos)}</span> votos
            </p>
          ) : null}
        </div>

        {showProgress ? (
          <div className={cn('border-t border-line', hero ? 'mt-6 pt-5 sm:mt-8 sm:pt-6' : 'mt-5 pt-4')}>
            <ApuracaoProgress resumo={resumo} variant={hero ? 'default' : 'compact'} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Coluna central do hero (desktop): diferença em votos e em pontos percentuais. */
function Diferenca({ resumo }: { resumo: Summary }) {
  const m = margem(resumo);
  return (
    <div className="hidden min-w-[150px] flex-col items-center justify-center self-center px-2 pt-10 text-center lg:flex">
      <span aria-hidden className="mb-3 h-8 w-px bg-gradient-to-b from-transparent to-[rgb(var(--line)/0.2)]" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Diferença</span>
      {m.lider !== null ? (
        <>
          <span className="num mt-1.5 font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-fg">{fmtInt(m.votos)}</span>
          <span className="num mt-1 text-[12.5px] text-fg-muted">votos · {fmtPP(m.pp).replace('+', '')}</span>
        </>
      ) : (
        <span className="mt-1.5 text-[13px] text-fg-muted">—</span>
      )}
      <span aria-hidden className="mt-3 h-8 w-px bg-gradient-to-t from-transparent to-[rgb(var(--line)/0.2)]" />
    </div>
  );
}

function LadoDuelo({
  l,
  lado,
  hero,
  pctCls,
  semVotos,
  vice,
  resumo,
}: {
  l: Linha;
  lado: 'esq' | 'dir';
  hero: boolean;
  pctCls: string;
  semVotos: boolean;
  vice: boolean;
  resumo: Summary;
}) {
  const s = corSlot(l.c.cor);
  const dir = lado === 'dir';
  const meta = [l.c.partido, String(l.c.numero)].join(' · ');
  return (
    <div className={cn('flex min-w-0 flex-col', dir ? 'items-end text-right' : 'items-start text-left')}>
      <div className={cn('flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3', dir ? 'items-end sm:flex-row-reverse' : 'items-start')}>
        <CandidateAvatar
          candidato={l.c}
          size={hero ? 'md' : 'sm'}
          eleito={l.eleito}
          className={hero ? 'sm:h-14 sm:w-14 sm:text-[19px]' : 'sm:h-11 sm:w-11 sm:text-[15px]'}
        />
        <div className={cn('min-w-0', dir && 'text-right')}>
          <div className={cn('font-display font-semibold leading-[1.08] tracking-[-0.02em] text-fg', hero ? 'text-[17px] sm:text-[26px]' : 'text-[16px] sm:text-[20px]')}>
            {l.c.nomeUrna}
          </div>
          <div className="num mt-0.5 text-[12px] text-fg-muted sm:text-[13px]">{meta}</div>
        </div>
      </div>

      <div className={cn('mt-3 flex h-6 items-center sm:mt-4', dir && 'justify-end')}>
        {l.lider && !semVotos && !l.eleito ? (
          <Badge tone={toneFromCor(l.c.cor)} size="xs" caps icon={dir ? undefined : 'seta-cima'}>
            À frente
          </Badge>
        ) : l.eleito ? (
          <Badge tone={toneFromCor(l.c.cor)} size="xs" caps icon="check">
            Eleito
          </Badge>
        ) : null}
      </div>

      <NumberRoll
        value={l.pct}
        format={(n) => fmtPct(n)}
        smallChars="%"
        smallClassName="text-[0.42em] ml-[0.06em] font-semibold"
        className={cn(
          'font-display font-semibold leading-none tracking-[-0.045em]',
          pctCls,
          semVotos ? 'text-fg-subtle' : s.textDisplay,
          !semVotos && !l.lider && resumo.lider !== null && 'opacity-[0.88]',
        )}
      />
      <div className="num mt-2 text-[13px] text-fg-muted sm:text-[15px]">
        <NumberRoll value={l.votos} className="font-semibold text-fg" /> <span>votos</span>
      </div>
      {vice && l.c.vice ? (
        <div className="mt-1.5 hidden max-w-full truncate text-[12.5px] text-fg-muted sm:block">Vice: {l.c.vice}</div>
      ) : null}
    </div>
  );
}

function PlacarCompacto({ race, resumo, titulo, subtitulo, to, onClick, showProgress = true, simulado, actions, className }: PlacarProps) {
  const { finalistas, outros } = linhas(race, resumo);
  const semVotos = validos(resumo) === 0;
  const eleito = finalistas.find((l) => l.eleito);
  const corpo = (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {textoVivo(race, resumo)}
      </p>
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-[17px] font-semibold leading-tight tracking-[-0.015em] text-fg">
              {titulo ?? race.titulo}
            </h3>
            {simulado ? <SimulationRibbon variant="badge" className="h-5 px-1.5 text-[9.5px]" /> : null}
          </div>
          {subtitulo ? <p className="mt-0.5 text-[12.5px] text-fg-muted">{subtitulo}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {eleito ? (
            <Badge tone={toneFromCor(eleito.c.cor)} size="xs" caps icon="check">
              Eleito
            </Badge>
          ) : null}
          {actions}
          {to || onClick ? <Icon name="chevron-direita" size={18} className="text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" /> : null}
        </div>
      </div>
      <ul className="space-y-2.5">
        {finalistas.map((l) => {
          const s = corSlot(l.c.cor);
          return (
            <li key={l.i} className="flex items-center gap-3">
              <CandidateAvatar candidato={l.c} size="sm" eleito={l.eleito} />
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-[14.5px] leading-tight', l.lider && !semVotos ? 'font-semibold text-fg' : 'font-medium text-fg')}>
                  {l.c.nomeUrna}
                </div>
                <div className="num mt-0.5 truncate text-[12px] text-fg-muted">
                  {l.c.partido} · {fmtInt(l.votos)} votos
                </div>
              </div>
              <NumberRoll
                value={l.pct}
                format={(n) => fmtPct(n)}
                smallChars="%"
                className={cn('font-display text-[22px] font-semibold leading-none tracking-[-0.03em]', semVotos ? 'text-fg-subtle' : s.textDisplay)}
              />
            </li>
          );
        })}
      </ul>
      {outros ? (
        <p className="mt-2 text-[12px] text-fg-muted">
          Demais: <span className="num">{fmtPct(outros.pct)}</span>
        </p>
      ) : null}
      <VoteSplitBar votos={resumo.votos} cores={race.candidatos.map((c) => c.cor)} size="sm" className="mt-3.5" nomes={race.candidatos.map((c) => c.nomeUrna)} />
      {showProgress ? <ApuracaoProgress resumo={resumo} variant="compact" className="mt-3.5" /> : null}
    </>
  );
  const cls = cn(
    'group relative block rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5',
    (to || onClick) &&
      'transition-[transform,border-color,background-color] duration-200 hover:-translate-y-px hover:border-[color:rgb(var(--line)/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    className,
  );
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={`${typeof titulo === 'string' ? titulo : race.titulo}: ver detalhes`}>
        {corpo}
      </Link>
    );
  }
  if (onClick) {
    return (
      <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())} className={cn(cls, 'cursor-pointer')}>
        {corpo}
      </div>
    );
  }
  return <article className={cls}>{corpo}</article>;
}
