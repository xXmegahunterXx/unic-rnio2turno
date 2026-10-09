/**
 * Estados de página/bloco: vazio, erro e carregando (skeletons com a forma real do conteúdo).
 */
import type { ReactNode } from 'react';
import { cn } from '@/app/lib/cn';
import { Button } from '@/app/ui/Button';
import { Icon, type IconName } from '@/app/ui/Icon';
import { Skeleton } from '@/app/ui/Skeleton';

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon = 'urna', title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-fg-muted">
        <span aria-hidden className="absolute inset-0 rounded-2xl bg-brand/10 blur-xl" />
        <Icon name={icon} size={26} className="relative" />
      </span>
      <h3 className="mt-4 font-display text-[18px] font-semibold tracking-[-0.01em] text-fg">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-pretty text-[14px] leading-relaxed text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  message?: ReactNode;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  title = 'Não foi possível carregar os dados',
  message = 'Pode ser instabilidade momentânea. Os números voltam assim que a conexão for restabelecida.',
  onRetry,
  compact,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:rgb(var(--alert)/0.3)] bg-alert/10 text-alert">
        <Icon name="alerta" size={26} />
      </span>
      <h3 className="mt-4 font-display text-[18px] font-semibold tracking-[-0.01em] text-fg">{title}</h3>
      {message ? <p className="mt-1.5 max-w-sm text-pretty text-[14px] leading-relaxed text-fg-muted">{message}</p> : null}
      {onRetry ? (
        <Button variant="outline" icon="reset" onClick={onRetry} className="mt-5">
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

export type LoadingVariant = 'placar' | 'placar-compacto' | 'tabela' | 'lista' | 'stats' | 'boletim' | 'pagina';

export interface LoadingStateProps {
  variant?: LoadingVariant;
  /** Linhas (tabela/lista). */
  rows?: number;
  className?: string;
  /** Texto para leitores de tela. */
  label?: string;
}

/** Skeletons com a forma do conteúdo real (evita "pulos" de layout ao carregar). */
export function LoadingState({ variant = 'pagina', rows = 8, className, label = 'Carregando' }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      <span className="sr-only">{label}…</span>
      {variant === 'placar' && <SkPlacar />}
      {variant === 'placar-compacto' && <SkPlacarCompacto />}
      {variant === 'tabela' && <SkTabela rows={rows} />}
      {variant === 'lista' && <SkLista rows={rows} />}
      {variant === 'stats' && <SkStats />}
      {variant === 'boletim' && <SkBoletim />}
      {variant === 'pagina' && (
        <div className="space-y-6">
          <div className="space-y-3 pt-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-9 w-72 max-w-full" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <SkPlacar />
          <SkStats />
          <SkTabela rows={6} />
        </div>
      )}
    </div>
  );
}

function SkPlacar() {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4 pt-5 sm:p-8">
      <Skeleton className="mb-6 h-3 w-48" />
      <div className="grid grid-cols-2 gap-x-3 sm:gap-x-8">
        {[0, 1].map((k) => (
          <div key={k} className={cn('flex flex-col', k === 1 && 'items-end')}>
            <div className={cn('flex flex-col gap-2.5 sm:flex-row sm:items-center', k === 1 ? 'items-end sm:flex-row-reverse' : 'items-start')}>
              <Skeleton rounded="full" className="h-11 w-11 sm:h-14 sm:w-14" />
              <div className={cn('space-y-2', k === 1 && 'flex flex-col items-end')}>
                <Skeleton className="h-5 w-28 sm:w-40" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="mt-10 h-14 w-36 sm:h-20 sm:w-64" />
            <Skeleton className="mt-3 h-4 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-7 h-4 w-full" />
      <div className="mt-8 border-t border-line pt-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-3 h-1.5 w-full" />
      </div>
    </div>
  );
}

function SkPlacarCompacto() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <Skeleton className="mb-4 h-5 w-36" />
      {[0, 1].map((k) => (
        <div key={k} className="mb-3 flex items-center gap-3">
          <Skeleton rounded="full" className="h-8 w-8" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
      <Skeleton className="mt-4 h-2 w-full" rounded="full" />
      <Skeleton className="mt-4 h-1 w-full" rounded="full" />
    </div>
  );
}

function SkTabela({ rows }: { rows: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="flex gap-4 border-b border-line pb-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-14" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line py-3 last:border-0">
          <Skeleton className="h-6 w-8" />
          <Skeleton className="h-3.5" style={{ width: `${30 + ((i * 37) % 30)}%` }} />
          <Skeleton className="ml-auto h-3.5 w-12" />
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}

function SkLista({ rows }: { rows: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton rounded="full" className="h-8 w-8 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3.5" style={{ width: `${55 + ((i * 23) % 40)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkStats() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={cn('rounded-2xl border border-line bg-surface p-3.5 sm:p-4', i === 0 && 'col-span-2 lg:col-span-1')}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-6 w-24" />
          <Skeleton className="mt-2 h-3 w-28" />
          <Skeleton className="mt-3 h-1 w-full" rounded="full" />
        </div>
      ))}
    </div>
  );
}

function SkBoletim() {
  return (
    <div className="mx-auto w-full max-w-[400px] rounded-2xl border border-line bg-surface p-7">
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="mt-3 flex justify-between gap-6">
          <Skeleton className="h-3" style={{ width: `${35 + ((i * 17) % 30)}%` }} />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
      <Skeleton className="mx-auto mt-6 h-9 w-52" />
    </div>
  );
}
