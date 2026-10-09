import type { ReactNode } from 'react';
import { cn } from '@/app/lib/cn';

export interface StatProps {
  label: ReactNode;
  /** Valor já formatado (use `.num`/NumberRoll e os formatadores de src/shared/format.ts). */
  value: ReactNode;
  /** Linha secundária (ex.: "79,8% do eleitorado"). */
  sub?: ReactNode;
  /** 0–100: micro-barra abaixo do valor. */
  bar?: number;
  /** Classe da barra (ex.: 'bg-brand'). */
  barClassName?: string;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'center';
  className?: string;
}

/** Indicador numérico com rótulo, subtítulo e micro-barra opcional. */
export function Stat({ label, value, sub, bar, barClassName = 'bg-fg-muted', icon, size = 'md', align = 'left', className }: StatProps) {
  return (
    <div className={cn('min-w-0', align === 'center' && 'text-center', className)}>
      <div className={cn('flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-muted', align === 'center' && 'justify-center')}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'num mt-1.5 font-display font-semibold leading-none tracking-[-0.02em] text-fg',
          size === 'sm' && 'text-lg',
          size === 'md' && 'text-[22px] sm:text-2xl',
          size === 'lg' && 'text-[32px] sm:text-4xl',
        )}
      >
        {value}
      </div>
      {bar !== undefined ? (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div
            className={cn('h-full rounded-full transition-[width] duration-700 ease-out', barClassName)}
            style={{ width: `${Math.max(0, Math.min(100, bar))}%` }}
          />
        </div>
      ) : null}
      {sub ? <div className="num mt-1.5 text-[12.5px] leading-snug text-fg-muted">{sub}</div> : null}
    </div>
  );
}
