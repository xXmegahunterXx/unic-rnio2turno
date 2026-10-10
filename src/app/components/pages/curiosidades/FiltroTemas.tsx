/** Filtro por tema (chips roláveis no celular), fixo sob o cabeçalho do app. */
import type { TemaCuriosidade } from '@/shared/curiosidades';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { ICONE_TEMA } from './formato';

export interface FiltroTemasProps {
  temas: { id: TemaCuriosidade; rotulo: string; n: number }[];
  total: number;
  atual: TemaCuriosidade | 'todos';
  onEscolher: (t: TemaCuriosidade | 'todos') => void;
  className?: string;
}

export function FiltroTemas({ temas, total, atual, onEscolher, className }: FiltroTemasProps) {
  const itens = [{ id: 'todos' as const, rotulo: 'Todos', n: total }, ...temas];
  return (
    <nav aria-label="Filtrar curiosidades por tema" className={cn('glass sticky top-[var(--app-header-h,56px)] z-30 -mx-4 border-b border-line px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8', className)}>
      <ul className="scrollbar-none -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 py-2.5 sm:gap-2">
        {itens.map((t) => {
          const ativo = atual === t.id;
          return (
            <li key={t.id} className="snap-start">
              <button
                type="button"
                aria-pressed={ativo}
                onClick={() => onEscolher(t.id)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  ativo ? 'border-transparent bg-fg text-bg' : 'border-line bg-surface/70 text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {t.id !== 'todos' ? <Icon name={ICONE_TEMA[t.id]} size={15} className={ativo ? '' : 'text-brand-fg'} /> : null}
                {t.rotulo}
                <span className={cn('num text-[12px]', ativo ? 'opacity-70' : 'text-fg-subtle')}>{t.n}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
