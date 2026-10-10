import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/app/lib/cn';
import type { CorCandidato } from '@/shared/types';
import { Icon, type IconName } from './Icon';

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'ok'
  | 'alert'
  | 'pending'
  | 'cand-a'
  | 'cand-b'
  | 'cand-vermelho'
  | 'cand-azul'
  | 'outros'
  | 'solid';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-fg-muted',
  brand:
    'bg-brand/15 text-brand-fg',
  ok: 'bg-ok/15 text-ok-fg',
  alert: 'bg-alert/15 text-alert-fg',
  pending: 'bg-pending/60 text-fg-muted',
  'cand-a': 'bg-cand-a/15 text-cand-a-fg',
  'cand-b': 'bg-cand-b/15 text-cand-b-fg',
  'cand-vermelho': 'bg-cand-vermelho/15 text-cand-vermelho-fg',
  'cand-azul': 'bg-cand-azul/15 text-cand-azul-fg',
  outros: 'bg-cand-outros/15 text-fg-muted',
  solid: 'bg-fg text-bg',
};

const TOM_DA_COR: Record<CorCandidato, BadgeTone> = {
  a: 'cand-a',
  b: 'cand-b',
  vermelho: 'cand-vermelho',
  azul: 'cand-azul',
  outros: 'outros',
};

/** Tom do selo na cor do candidato (vinda dos dados: `Candidate.cor`). */
export const toneFromCor = (cor: CorCandidato): BadgeTone => TOM_DA_COR[cor] ?? 'outros';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: 'xs' | 'sm' | 'md';
  icon?: IconName;
  /** Ponto colorido à esquerda (usa a cor do texto). */
  dot?: boolean;
  /** Caixa alta com tracking (selos: "ELEITO", "SIMULAÇÃO"). */
  caps?: boolean;
  children?: ReactNode;
}

const sizes = {
  xs: 'h-5 gap-1 px-1.5 text-[10.5px] rounded-md',
  sm: 'h-6 gap-1.5 px-2 text-xs rounded-lg',
  md: 'h-7 gap-1.5 px-2.5 text-[13px] rounded-[10px]',
};

/** Selo/rótulo curto. */
export function Badge({ tone = 'neutral', size = 'sm', icon, dot, caps, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap font-semibold leading-none',
        sizes[size],
        tones[tone],
        caps && 'uppercase tracking-[0.08em]',
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {icon ? <Icon name={icon} size={size === 'md' ? 15 : size === 'sm' ? 13 : 12} strokeWidth={2} /> : null}
      {children}
    </span>
  );
}

/** Pílula (mais arredondada, com borda): status, filtros, tags. */
export function Pill({
  className,
  active,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium',
        active ? 'border-transparent bg-fg text-bg' : 'border-line bg-surface-2/70 text-fg-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
