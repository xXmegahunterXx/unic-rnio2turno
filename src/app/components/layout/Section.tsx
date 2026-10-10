import type { ReactNode } from 'react';
import { cn } from '@/app/lib/cn';

export interface SectionProps {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** Ações à direita do título (ex.: Segmented, link "ver tudo"). */
  actions?: ReactNode;
  children?: ReactNode;
  /** Envolve o conteúdo num cartão padrão. */
  card?: boolean;
  className?: string;
  contentClassName?: string;
}

/** Bloco de página com título h2, descrição e ações; espaçamento vertical padrão. */
export function Section({ id, title, description, actions, children, card, className, contentClassName }: SectionProps) {
  return (
    <section id={id} aria-labelledby={title && id ? `${id}-titulo` : undefined} className={cn('scroll-mt-28 py-5 sm:py-7', className)}>
      {title || actions ? (
        <div className="mb-3.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 sm:mb-4">
          <div className="min-w-0">
            {title ? (
              <h2 id={id ? `${id}-titulo` : undefined} className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-1 text-[13.5px] leading-snug text-fg-muted sm:text-sm">{description}</p> : null}
          </div>
          {actions ? <div className="flex min-w-0 max-w-full items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn(card && 'rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6', contentClassName)}>{children}</div>
    </section>
  );
}
