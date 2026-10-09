/** Wordmark "Sintonia" com o símbolo do favicon (onda + ponto), em tokens. */
import { useId } from 'react';
import { cn } from '@/app/lib/cn';

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={cn('shrink-0', className)}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--brand))' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--brand-2))' }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" className="fill-fg dark:fill-surface-3" />
      <rect x=".75" y=".75" width="62.5" height="62.5" rx="15.25" fill="none" className="stroke-transparent dark:stroke-line/[1.5]" strokeWidth="1.5" />
      <path d="M14 38c6-14 12-14 18 0s12 14 18 0" fill="none" stroke={`url(#g${id})`} strokeWidth="6" strokeLinecap="round" />
      <circle cx="32" cy="22" r="4" className="fill-brand-ink" />
    </svg>
  );
}

export function Logo({ size = 28, className, showText = true }: { size?: number; className?: string; showText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      {showText ? (
        <span className="font-display text-[19px] font-semibold leading-none tracking-[-0.025em] text-fg">Sintonia</span>
      ) : (
        <span className="sr-only">Sintonia</span>
      )}
    </span>
  );
}
