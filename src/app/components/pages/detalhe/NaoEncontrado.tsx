/**
 * 404 amigável para escopos inexistentes (UF, município, zona, seção): explica o que aconteceu e
 * oferece caminhos (voltar um nível, consultar a seção, escolher outro estado).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';

export interface NaoEncontradoProps {
  icon?: IconName;
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function NaoEncontrado({ icon = 'pin', titulo, descricao, acoes, children, className }: NaoEncontradoProps) {
  return (
    <section
      role="alert"
      className={cn('relative overflow-hidden rounded-3xl border border-line bg-surface px-5 py-10 text-center shadow-card sm:px-10 sm:py-14', className)}
    >
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-48 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 blur-3xl" />
      <span className="relative mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface-2 text-fg-muted">
        <Icon name={icon} size={28} />
        <span className="num absolute -right-2 -top-2 rounded-md bg-fg px-1.5 py-0.5 text-[10.5px] font-bold text-bg">404</span>
      </span>
      <h1 className="relative mt-5 text-balance font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[32px]">
        {titulo}
      </h1>
      {descricao ? (
        <p className="relative mx-auto mt-2.5 max-w-lg text-pretty text-[15px] leading-relaxed text-fg-muted">{descricao}</p>
      ) : null}
      {acoes ? <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2.5">{acoes}</div> : null}
      {children ? <div className="relative mt-8 text-left">{children}</div> : null}
    </section>
  );
}

/** Grade de siglas para escolher um estado (404 de UF, Consulta). */
export function GradeUfs({ para, className }: { para: (sigla: string) => string; className?: string }) {
  const lista = [...UFS, 'ZZ' as const];
  return (
    <ul className={cn('grid grid-cols-5 gap-1.5 sm:grid-cols-7', className)}>
      {lista.map((u) => (
        <li key={u}>
          <Link
            to={para(u.toLowerCase())}
            title={UF_NOMES[u]}
            aria-label={UF_NOMES[u]}
            className="flex h-10 items-center justify-center rounded-xl border border-line bg-surface-2 font-mono text-[13px] font-semibold text-fg transition-colors hover:border-brand/50 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {u}
          </Link>
        </li>
      ))}
    </ul>
  );
}
