import type { ReactNode } from 'react';
import { cn } from '@/app/lib/cn';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Linha pequena acima do título (ex.: "2º turno · 25 de outubro"). */
  eyebrow?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Ações à direita (desktop) / abaixo (celular). */
  actions?: ReactNode;
  /** Conteúdo extra sob o subtítulo (ex.: RaceSwitcher). */
  children?: ReactNode;
  className?: string;
}

/** Cabeçalho de página: trilha, título display, subtítulo e ações. */
export function PageHeader({ title, subtitle, eyebrow, breadcrumbs, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn('pb-5 pt-5 sm:pb-8 sm:pt-8', className)}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} className="mb-3 sm:mb-4" /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{eyebrow}</div>
          ) : null}
          <h1 className="text-balance font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[44px]">
            {title}
          </h1>
          {subtitle ? <p className="mt-2 max-w-2xl text-pretty text-[15px] leading-relaxed text-fg-muted sm:text-base">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  );
}
