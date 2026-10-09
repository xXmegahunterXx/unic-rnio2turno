import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/app/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Espaçamento interno. Padrão 'md' (16 px no mobile, 24 px no desktop). */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Realce: borda mais visível + leve brilho de marca. */
  highlight?: boolean;
  /** Efeito de hover para cartões clicáveis. */
  interactive?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}

const pads = { none: '', sm: 'p-3 sm:p-4', md: 'p-4 sm:p-6', lg: 'p-5 sm:p-8' };

/** Cartão padrão: `rounded-2xl bg-surface border border-line shadow-card`. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', highlight, interactive, as = 'div', className, ...rest },
  ref,
) {
  const Tag = as as 'div';
  return (
    <Tag
      ref={ref}
      className={cn(
        'relative rounded-2xl border border-line bg-surface shadow-card',
        pads[padding],
        highlight && 'border-[color:rgb(var(--brand)/0.35)] shadow-glow',
        interactive &&
          'transition-[transform,border-color,background-color] duration-200 hover:-translate-y-px hover:border-[color:rgb(var(--line)/0.16)] hover:bg-[color:color-mix(in_srgb,rgb(var(--surface))_92%,rgb(var(--fg)))]',
        className,
      )}
      {...rest}
    />
  );
});

/** Cabeçalho de cartão: título + ações à direita. */
export function CardHeader({
  title,
  subtitle,
  actions,
  className,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 text-fg-muted">{icon}</span> : null}
        <div className="min-w-0">
          <h3 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-fg">{title}</h3>
          {subtitle ? <p className="mt-1 text-[13px] leading-snug text-fg-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
