/**
 * Atalhos entre os cargos do 1º turno (Senado · Câmara · Assembleias · Governadores), em pílulas roláveis.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/app/lib/cn';

const ITENS = [
  { id: 'governadores', to: '/governadores', label: 'Governadores' },
  { id: 'senado', to: '/senado', label: 'Senado' },
  { id: 'camara', to: '/camara', label: 'Câmara dos Deputados' },
  { id: 'assembleias', to: '/assembleias', label: 'Assembleias' },
] as const;

export type CargoNav = (typeof ITENS)[number]['id'];

export function NavCargos({ atual, className }: { atual: CargoNav; className?: string }) {
  return (
    <nav aria-label="Outros cargos do 1º turno" className={cn('-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0', className)}>
      <ul className="flex w-max gap-1.5">
        {ITENS.map((it) => {
          const ativo = it.id === atual;
          return (
            <li key={it.id}>
              <Link
                to={it.to}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  ativo ? 'border-transparent bg-fg text-bg' : 'border-line bg-surface-2 text-fg-muted hover:border-line/[2.5] hover:text-fg',
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
