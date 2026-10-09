import type { HTMLAttributes } from 'react';
import { cn } from '@/app/lib/cn';

/** Bloco de carregamento com brilho deslizante (respeita prefers-reduced-motion via CSS global). */
export function Skeleton({ className, rounded = 'md', ...rest }: HTMLAttributes<HTMLDivElement> & { rounded?: 'sm' | 'md' | 'lg' | 'full' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer bg-[length:200%_100%]',
        'bg-[linear-gradient(90deg,rgb(var(--surface-2))_0%,rgb(var(--surface-3))_45%,rgb(var(--surface-2))_90%)]',
        rounded === 'sm' && 'rounded-md',
        rounded === 'md' && 'rounded-lg',
        rounded === 'lg' && 'rounded-2xl',
        rounded === 'full' && 'rounded-full',
        className,
      )}
      {...rest}
    />
  );
}

/** Linhas de texto falsas. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
