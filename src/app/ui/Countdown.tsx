/**
 * Contagem regressiva até um instante (epoch ms): dias · horas · min · seg.
 * `now` opcional permite usar o relógio simulado; sem ele usa o relógio local (tick de 1 s).
 */
import { useNow } from '@/app/lib/useNow';
import { cn } from '@/app/lib/cn';
import { NumberRoll } from './NumberRoll';

export interface CountdownProps {
  /** Instante alvo (epoch ms). */
  target: number;
  /** Relógio a usar (epoch ms). Padrão: Date.now() com tick de 1 s. */
  now?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Esconde "dias" quando zero. Padrão true. */
  hideZeroDays?: boolean;
  /** Texto exibido ao chegar a zero. */
  doneLabel?: string;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function partesTempo(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { dias: Math.floor(t / 86400), horas: Math.floor((t % 86400) / 3600), min: Math.floor((t % 3600) / 60), seg: t % 60 };
}

/** "2d 4h", "3h 12min", "12min 08s" — texto compacto para pílulas. */
export function fmtFaltam(ms: number): string {
  const p = partesTempo(ms);
  if (p.dias > 0) return `${p.dias}d ${p.horas}h`;
  if (p.horas > 0) return `${p.horas}h ${pad(p.min)}min`;
  return `${p.min}min ${pad(p.seg)}s`;
}

export function Countdown({ target, now, size = 'md', hideZeroDays = true, doneLabel = 'Começou', className }: CountdownProps) {
  const local = useNow(1000);
  const agora = now ?? local;
  const restante = target - agora;
  const p = partesTempo(restante);
  if (restante <= 0) {
    return <span className={cn('font-display font-semibold text-fg', className)}>{doneLabel}</span>;
  }
  const unidades: [number, string, string][] = [
    [p.dias, 'dias', 'd'],
    [p.horas, 'horas', 'h'],
    [p.min, 'minutos', 'min'],
    [p.seg, 'segundos', 's'],
  ];
  const lista = hideZeroDays && p.dias === 0 ? unidades.slice(1) : unidades;
  const numCls = size === 'lg' ? 'text-[clamp(2.25rem,9vw,3.75rem)]' : size === 'md' ? 'text-[28px]' : 'text-lg';
  const boxCls =
    size === 'sm'
      ? 'min-w-[2.6rem] px-1.5 py-1 rounded-lg'
      : size === 'md'
        ? 'min-w-[3.6rem] px-2 py-2 rounded-xl'
        : 'min-w-[4.6rem] sm:min-w-[5.6rem] px-2 py-3 rounded-2xl';
  return (
    <div
      role="timer"
      aria-label={`Faltam ${p.dias} dias, ${p.horas} horas, ${p.min} minutos e ${p.seg} segundos`}
      className={cn('inline-flex items-stretch gap-1.5 sm:gap-2', className)}
    >
      {lista.map(([v, longo, curto]) => (
        <div key={longo} aria-hidden className={cn('flex flex-col items-center border border-line bg-surface-2', boxCls)}>
          <NumberRoll value={v} format={(n) => (curto === 'd' ? String(n) : pad(n))} className={cn('font-display font-semibold leading-none tracking-tight text-fg', numCls)} />
          <span className={cn('mt-1 font-medium uppercase tracking-[0.12em] text-fg-muted', size === 'sm' ? 'text-[9px]' : 'text-[10px]')}>
            {size === 'sm' ? curto : longo}
          </span>
        </div>
      ))}
    </div>
  );
}
