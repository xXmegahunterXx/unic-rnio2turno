import { Fragment, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';

export interface Crumb {
  label: string;
  /** Sem `to` = página atual. */
  to?: string;
}

/** Trilha de navegação (Brasil › São Paulo › Campinas). Rola na horizontal se não couber. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  // No celular, mantém o item atual (o último) visível.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [items]);
  return (
    <nav ref={ref} aria-label="Você está em" className={cn('-mx-1 overflow-x-auto scrollbar-none', className)}>
      <ol className="flex w-max items-center gap-0.5 px-1 text-[13px]">
        {items.map((c, i) => {
          const ultimo = i === items.length - 1;
          return (
            <Fragment key={`${c.label}-${i}`}>
              <li className="flex items-center">
                {c.to && !ultimo ? (
                  <Link
                    to={c.to}
                    className="rounded-md px-1 py-0.5 font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={ultimo ? 'page' : undefined} className="px-1 py-0.5 font-medium text-fg">
                    {c.label}
                  </span>
                )}
              </li>
              {!ultimo ? (
                <li aria-hidden className="text-fg-subtle">
                  <Icon name="chevron-direita" size={14} />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
