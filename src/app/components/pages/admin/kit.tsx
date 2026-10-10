/**
 * Peças de UI locais do admin (variações que ainda não existem no kit compartilhado).
 * Candidatas a virar componente do kit: Campo/AreaTexto (input de texto), Kbd, Passo (stepper numérico),
 * DuelSlider (cabo de guerra A × B), ViesSlider (deslocamento ± a partir do centro), Callout, MiniSerie.
 */
import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import type { CorCandidato } from '@/shared/types';
import { Button, Dialog, Icon, type IconName } from '@/app/ui';
import { fmtPct } from '@/shared/format';
import { useNow } from '@/app/lib/useNow';
import { fmtMs } from './rotulos';
import { NomesOcultos } from '@/app/components/apuracao/NomesOcultos';

// ---- tipografia / estrutura --------------------------------------------------------------------------

/** Rótulo em caixa alta (cabeçalhos de métricas, grupos). */
export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('block text-[11px] font-semibold uppercase leading-[1.25] tracking-[0.1em] text-fg-muted', className)}>
      {children}
    </span>
  );
}

/** Cabeçalho de seção do painel. */
export function CabecalhoSecao({
  titulo,
  descricao,
  acoes,
  icone,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  icone?: IconName;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mb-6">
      <div className="min-w-0 flex-[1_1_18rem]">
        <h1 className="flex items-center gap-2.5 font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[28px]">
          {icone ? (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-brand-fg">
              <Icon name={icone} size={19} />
            </span>
          ) : null}
          {titulo}
        </h1>
        {descricao ? <p className="mt-1.5 max-w-2xl text-pretty text-[14px] leading-relaxed text-fg-muted">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </header>
  );
}

/** Cartão com cabeçalho compacto (título, subtítulo, ações). */
export function Painel({
  titulo,
  subtitulo,
  acoes,
  icone,
  children,
  className,
  corpoClassName,
  pt,
  semPadding,
  id,
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  icone?: IconName;
  children?: ReactNode;
  className?: string;
  /** Classes extras do corpo (não repita padding: use `pt`/`semPadding`). */
  corpoClassName?: string;
  /** Padding superior do corpo (classe). Padrão 'pt-4'. */
  pt?: string;
  /** Corpo sem padding (tabelas que vão de borda a borda). */
  semPadding?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn('relative min-w-0 rounded-2xl border border-line bg-surface shadow-card', className)}>
      {titulo ? (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="flex min-w-0 flex-[1_1_12rem] items-start gap-2.5">
            {icone ? <Icon name={icone} size={18} className="mt-0.5 shrink-0 text-fg-muted" /> : null}
            <div className="min-w-0">
              <h2 className="font-display text-[16px] font-semibold leading-tight tracking-[-0.01em] text-fg">{titulo}</h2>
              {subtitulo ? <p className="mt-1 text-[13px] leading-snug text-fg-muted">{subtitulo}</p> : null}
            </div>
          </div>
          {acoes ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{acoes}</div> : null}
        </div>
      ) : null}
      <div className={cn(!semPadding && 'px-4 pb-4 sm:px-5 sm:pb-5', !semPadding && (pt ?? (titulo ? 'pt-4' : 'pt-4 sm:pt-5')), corpoClassName)}>
        {children}
      </div>
    </section>
  );
}

/** Caixa de mensagem inline. */
export function Callout({
  tom = 'info',
  icone,
  titulo,
  children,
  className,
}: {
  tom?: 'info' | 'alerta' | 'ok' | 'neutro';
  icone?: IconName;
  titulo?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const estilos = {
    info: 'border-brand/30 bg-brand/[0.08]',
    alerta: 'border-alert/35 bg-alert/[0.08]',
    ok: 'border-ok/35 bg-ok/[0.08]',
    neutro: 'border-line bg-surface-2/70',
  }[tom];
  const corIcone = { info: 'text-brand-fg', alerta: 'text-alert-fg', ok: 'text-ok-fg', neutro: 'text-fg-muted' }[tom];
  const ic = icone ?? ({ info: 'info', alerta: 'alerta', ok: 'check-circulo', neutro: 'info' } as const)[tom];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-3.5 py-3 text-[13.5px] leading-snug', estilos, className)}>
      <Icon name={ic} size={17} className={cn('mt-px shrink-0', corIcone)} />
      <div className="min-w-0 flex-1 text-pretty text-fg-muted">
        {titulo ? <p className="mb-0.5 font-semibold text-fg">{titulo}</p> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * Nota discreta "Nomes ocultos na simulação" (componente do kit). `onClick` leva à configuração em Fonte.
 */
export function NotaNomesOcultos({ onClick, className }: { onClick?: () => void; className?: string }) {
  return (
    <NomesOcultos onClick={onClick} dica={onClick ? 'Configurar em Fonte › Nomes na simulação' : undefined} className={className} />
  );
}

/** Tecla de atalho. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-surface-2 px-1.5',
        'font-mono text-[11.5px] font-semibold text-fg shadow-[inset_0_-1px_0_rgb(var(--line)/0.18)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Separador vertical para barras. */
export function SepV({ className }: { className?: string }) {
  return <span aria-hidden className={cn('h-8 w-px shrink-0 bg-[rgb(var(--line)/var(--line-alpha))]', className)} />;
}

// ---- formulários -------------------------------------------------------------------------------------

const inputBase =
  'w-full rounded-xl border border-line bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-subtle ' +
  'transition-colors hover:border-line/[2] focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  rotulo?: ReactNode;
  dica?: ReactNode;
  erro?: ReactNode;
  sufixo?: ReactNode;
  mono?: boolean;
  wrapperClassName?: string;
}

/** Campo de texto com rótulo, dica e erro. */
export function Campo({ rotulo, dica, erro, sufixo, mono, className, wrapperClassName, id, ...rest }: CampoProps) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className={cn('min-w-0', wrapperClassName)}>
      {rotulo ? (
        <label htmlFor={cid} className="mb-1.5 block text-[13px] font-medium text-fg-muted">
          {rotulo}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={cid}
          aria-invalid={erro ? true : undefined}
          aria-describedby={dica || erro ? `${cid}-d` : undefined}
          className={cn(inputBase, 'h-10', mono && 'font-mono text-[13px]', sufixo && 'pr-12', erro && 'border-alert/60', className)}
          {...rest}
        />
        {sufixo ? (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-fg-muted">{sufixo}</span>
        ) : null}
      </div>
      {erro || dica ? (
        <p id={`${cid}-d`} className={cn('mt-1.5 text-[12.5px] leading-snug', erro ? 'text-alert-fg' : 'text-fg-muted')}>
          {erro ?? dica}
        </p>
      ) : null}
    </div>
  );
}

export function AreaTexto({
  rotulo,
  dica,
  className,
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo?: ReactNode; dica?: ReactNode }) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className="min-w-0">
      {rotulo ? (
        <label htmlFor={cid} className="mb-1.5 block text-[13px] font-medium text-fg-muted">
          {rotulo}
        </label>
      ) : null}
      <textarea id={cid} className={cn(inputBase, 'min-h-[96px] resize-y py-2.5 leading-relaxed', className)} {...rest} />
      {dica ? <div className="mt-1.5 text-[12.5px] text-fg-muted">{dica}</div> : null}
    </div>
  );
}

/** Stepper numérico compacto: [−] valor [+]. */
export function Passo({
  valor,
  onChange,
  min = 0,
  max = 600,
  passo = 5,
  sufixo,
  rotulo,
  icone,
  className,
}: {
  valor: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  passo?: number;
  sufixo?: string;
  rotulo: string;
  /** Ícone à esquerda (quando não há rótulo visível por perto). */
  icone?: IconName;
  className?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const lim = (v: number) => Math.min(max, Math.max(min, v));
  const btn =
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-35 disabled:hover:bg-transparent';
  return (
    <div
      role="group"
      aria-label={rotulo}
      title={icone ? rotulo : undefined}
      className={cn('inline-flex h-9 items-center rounded-xl border border-line bg-surface-2 p-0.5', className)}
    >
      {icone ? <Icon name={icone} size={14} className="ml-1.5 mr-0.5 shrink-0 text-fg-subtle" /> : null}
      <button type="button" className={btn} aria-label={`Diminuir ${rotulo}`} disabled={valor <= min} onClick={() => onChange(lim(valor - passo))}>
        <Icon name="menos" size={15} />
      </button>
      <label className="flex min-w-0 items-baseline justify-center gap-0.5 px-0.5">
        <span className="sr-only">{rotulo}</span>
        <input
          inputMode="numeric"
          value={texto ?? String(valor)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTexto(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
          onBlur={() => {
            if (texto !== null) onChange(lim(Number(texto) || 0));
            setTexto(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              onChange(lim(valor + passo));
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(lim(valor - passo));
            }
          }}
          className="num w-8 bg-transparent text-center text-[13.5px] font-semibold text-fg focus:outline-none"
        />
        {sufixo ? <span className="text-[11px] text-fg-muted">{sufixo}</span> : null}
      </label>
      <button type="button" className={btn} aria-label={`Aumentar ${rotulo}`} disabled={valor >= max} onClick={() => onChange(lim(valor + passo))}>
        <Icon name="mais" size={15} />
      </button>
    </div>
  );
}

// ---- sliders -----------------------------------------------------------------------------------------

const inputRange =
  'peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed';
const polegar =
  'pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-fg ' +
  'shadow-[0_2px_8px_rgb(0_0_0/0.35),0_0_0_1px_rgb(var(--line)/0.2)] transition-transform duration-150 ' +
  'peer-hover:scale-110 peer-active:scale-110 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/45';

/**
 * Cabo de guerra A × B: o valor é o % de A; a trilha à esquerda do polegar tem a cor de A e à direita a de B.
 * Nomes e percentuais dos dois lados (B = 100 − A). Candidatos sempre na ordem da urna (A à esquerda).
 * `cores`: as cores que vêm dos dados (`race.candidatos[i].cor`); padrão, os slots neutros turquesa/âmbar.
 */
export function DuelSlider({
  valor,
  onChange,
  nomes,
  cores = ['a', 'b'],
  min = 40,
  max = 60,
  passo = 0.05,
  compacto,
  rotulo,
  alterado,
  disabled,
}: {
  valor: number;
  onChange: (v: number) => void;
  nomes: [string, string];
  cores?: readonly [CorCandidato, CorCandidato];
  min?: number;
  max?: number;
  passo?: number;
  compacto?: boolean;
  rotulo: string;
  /** Realça que o valor difere do aplicado. */
  alterado?: boolean;
  disabled?: boolean;
}) {
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  const p = pct(valor);
  const meio = pct(50);
  const marcas = [min, (min + 50) / 2, 50, (max + 50) / 2, max].filter((m, i, a) => a.indexOf(m) === i);
  return (
    <div className={cn('w-full', disabled && 'opacity-50')}>
      <div className={cn('flex items-end justify-between gap-3', compacto ? 'mb-2' : 'mb-3')}>
        <div className="min-w-0">
          <span className={cn('block truncate font-medium text-fg', compacto ? 'text-[13px]' : 'text-sm')}>{nomes[0]}</span>
          <span className={cn('num block font-display font-semibold leading-none tracking-[-0.02em]', corSlot(cores[0]).text, compacto ? 'mt-1 text-[17px]' : 'mt-1.5 text-[24px]')}>
            {fmtPct(valor)}
          </span>
        </div>
        {alterado ? (
          <span className="mb-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-brand/15 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-fg">
            Não aplicado
          </span>
        ) : null}
        <div className="min-w-0 text-right">
          <span className={cn('block truncate font-medium text-fg', compacto ? 'text-[13px]' : 'text-sm')}>{nomes[1]}</span>
          <span className={cn('num block font-display font-semibold leading-none tracking-[-0.02em]', corSlot(cores[1]).text, compacto ? 'mt-1 text-[17px]' : 'mt-1.5 text-[24px]')}>
            {fmtPct(100 - valor)}
          </span>
        </div>
      </div>
      <div className={cn('relative', compacto ? 'h-6' : 'h-7')}>
        <div className="absolute inset-x-0 top-1/2 flex h-2.5 -translate-y-1/2 overflow-hidden rounded-full">
          <div className={cn('h-full transition-[width] duration-100', corSlot(cores[0]).bg)} style={{ width: `${p}%` }} />
          <div className={cn('h-full flex-1', corSlot(cores[1]).bg)} />
        </div>
        <span aria-hidden className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/70" style={{ left: `${meio}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={passo}
          value={valor}
          disabled={disabled}
          aria-label={rotulo}
          aria-valuetext={`${nomes[0]} ${fmtPct(valor)}, ${nomes[1]} ${fmtPct(100 - valor)}`}
          onChange={(e) => onChange(Number(e.target.value))}
          className={inputRange}
        />
        <span aria-hidden className={polegar} style={{ left: `${p}%` }} />
      </div>
      {!compacto ? (
        <div className="relative mt-1.5 h-4">
          {marcas.map((m, i) => (
            <span
              key={m}
              className={cn(
                'num absolute text-[11px] text-fg-muted',
                i === 0 ? 'translate-x-0' : i === marcas.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
              )}
              style={{ left: `${pct(m)}%` }}
            >
              {fmtPct(m, 0)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Viés em p.p. (positivo = a favor de A). Para manter A à esquerda, puxar o polegar para a ESQUERDA favorece A.
 * A trilha preenche do centro até o polegar na cor de quem é favorecido.
 */
export function ViesSlider({
  valor,
  onChange,
  nomes,
  cores = ['a', 'b'],
  limite = 10,
  passo = 0.5,
  rotulo,
}: {
  valor: number;
  onChange: (v: number) => void;
  nomes: [string, string];
  /** Cores dos dois candidatos (dos dados); padrão, os slots neutros. */
  cores?: readonly [CorCandidato, CorCandidato];
  limite?: number;
  passo?: number;
  rotulo: string;
}) {
  const interno = -valor; // esquerda = A
  const p = ((interno + limite) / (2 * limite)) * 100;
  const ini = Math.min(p, 50);
  const fim = Math.max(p, 50);
  return (
    <div className="relative h-7 w-full">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
      <div
        className={cn('absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full', corSlot(valor > 0 ? cores[0] : cores[1]).bg)}
        style={{ left: `${ini}%`, width: `${fim - ini}%` }}
      />
      <span aria-hidden className="absolute left-1/2 top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-subtle" />
      <input
        type="range"
        min={-limite}
        max={limite}
        step={passo}
        value={interno}
        aria-label={rotulo}
        aria-valuetext={textoVies(valor, nomes)}
        onChange={(e) => onChange(-Number(e.target.value) || 0)}
        onDoubleClick={() => onChange(0)}
        className={inputRange}
      />
      <span aria-hidden className={cn(polegar, 'h-[18px] w-[18px]')} style={{ left: `${p}%` }} />
    </div>
  );
}

export function textoVies(v: number, nomes: [string, string]): string {
  if (!v) return 'Neutro';
  const pp = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${pp} p.p. → ${v > 0 ? nomes[0] : nomes[1]}`;
}

// ---- mini-série (sparkline) --------------------------------------------------------------------------

export function MiniSerie({
  valores,
  className,
  tom = 'brand',
  ariaLabel,
}: {
  valores: number[];
  className?: string;
  tom?: 'brand' | 'ok' | 'muted';
  ariaLabel?: string;
}) {
  const W = 120;
  const H = 32;
  if (valores.length < 2) return <div className={cn('h-8', className)} aria-hidden />;
  const max = Math.max(...valores, 1e-9);
  const min = Math.min(...valores, 0);
  const x = (i: number) => (i / (valores.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
  const d = valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const cor = { brand: 'stroke-brand-2', ok: 'stroke-ok', muted: 'stroke-fg-muted' }[tom];
  const area = { brand: 'fill-brand/10', ok: 'fill-ok/10', muted: 'fill-fg-muted/10' }[tom];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn('h-8 w-full', className)} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : true}>
      <path d={`${d}L${W},${H}L0,${H}Z`} className={area} />
      <path d={d} fill="none" className={cor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

// ---- diálogo de confirmação ---------------------------------------------------------------------------

export function DialogoConfirmacao({
  aberto,
  titulo,
  descricao,
  corpo,
  confirmar = 'Confirmar',
  perigo,
  onResposta,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: ReactNode;
  corpo?: ReactNode;
  confirmar?: string;
  perigo?: boolean;
  onResposta: (ok: boolean) => void;
}) {
  return (
    <Dialog
      open={aberto}
      onClose={() => onResposta(false)}
      title={titulo}
      description={descricao}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onResposta(false)}>
            Cancelar
          </Button>
          {perigo ? (
            <button
              type="button"
              onClick={() => onResposta(true)}
              data-autofocus
              className={cn(
                'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-alert/45 bg-alert/15 px-4 text-sm font-semibold text-alert-fg',
                'transition-colors hover:bg-alert/25 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              )}
            >
              {confirmar}
            </button>
          ) : (
            <Button variant="primary" onClick={() => onResposta(true)} data-autofocus>
              {confirmar}
            </Button>
          )}
        </>
      }
    >
      {corpo ? <div className="text-[14px] leading-relaxed text-fg-muted">{corpo}</div> : null}
    </Dialog>
  );
}

/** Tempo decorrido desde `desde` (performance.now), atualizado a cada 100 ms. */
export function Cronometro({ desde }: { desde: number | null }) {
  useNow(100);
  if (desde === null) return null;
  return <span className="num">{fmtMs(performance.now() - desde)}</span>;
}
