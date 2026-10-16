import { Fragment, useLayoutEffect, useRef, useState } from 'react';
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
  // Esmaece a borda esquerda quando há itens escondidos (dica de que dá para rolar).
  const [cortado, setCortado] = useState(false);
  // No celular, mantém o item atual (o último) visível.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setCortado(el.scrollLeft > 1);
  }, [items]);
  // degradê largo: a palavra cortada no começo some de vez (nunca se lê "rasil" no lugar de "Brasil")
  const fade = 'linear-gradient(90deg, transparent, transparent 10px, black 48px)';
  return (
    <nav
      ref={ref}
      aria-label="Você está em"
      onScroll={(e) => setCortado(e.currentTarget.scrollLeft > 1)}
      // respiro vertical compensado: a rolagem horizontal cortaria a área de toque (44 px) dos links
      className={cn('-mx-1 -my-2.5 overflow-x-auto py-2.5 scrollbar-none', className)}
      style={cortado ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
    >
      <ol className="flex w-max items-center px-1 text-[13px] sm:gap-0.5">
        {items.map((c, i) => {
          const ultimo = i === items.length - 1;
          return (
            <Fragment key={`${c.label}-${i}`}>
              <li className="flex items-center">
                {c.to && !ultimo ? (
                  <Link
                    to={c.to}
                    className="toque relative rounded-md px-1 py-0.5 font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
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
                  <Icon name="chevron-direita" size={13} />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
