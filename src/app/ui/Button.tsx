/**
 * Botões. `primary` usa o gradiente da marca (violeta) — só para a ação principal da tela.
 * Aceita `asChild`-like via `as="a"`/Link? Não: para links use `<ButtonLink>` (react-router).
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-cta text-brand-ink shadow-[0_8px_24px_-10px_rgb(var(--brand)/0.7),inset_0_1px_0_0_rgb(var(--brand-ink)/0.22)] ' +
    'hover:brightness-110 hover:shadow-[0_10px_30px_-10px_rgb(var(--brand)/0.85),inset_0_1px_0_0_rgb(var(--brand-ink)/0.22)]',
  secondary: 'bg-surface-3 text-fg hover:bg-[color:color-mix(in_srgb,rgb(var(--surface-3))_82%,rgb(var(--fg)))]',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
  outline: 'border border-line bg-transparent text-fg hover:border-line/[2.5] hover:bg-surface-2',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-[10px] px-3 text-[13px]',
  md: 'h-10 rounded-xl px-4 text-sm',
  lg: 'h-12 rounded-[16px] px-6 text-[15px]',
};

const iconSizes: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ícone à esquerda. */
  icon?: IconName;
  /** Ícone à direita. */
  iconRight?: IconName;
  /** Ocupa toda a largura. */
  block?: boolean;
  /** Mostra spinner e desabilita. */
  loading?: boolean;
}

export function buttonClasses({ variant = 'secondary', size = 'md', block }: ButtonStyleProps = {}) {
  return cn(base, variants[variant], sizes[size], block && 'w-full');
}

function Conteudo({ icon, iconRight, size = 'md', loading, children }: ButtonStyleProps & { children?: ReactNode }) {
  const s = iconSizes[size];
  return (
    <>
      {loading ? <Spinner size={s} /> : icon ? <Icon name={icon} size={s} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={s} className="-mr-0.5" /> : null}
    </>
  );
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cn('animate-spin', className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, iconRight, block, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, block }), className)}
      {...rest}
    >
      <Conteudo icon={icon} iconRight={iconRight} size={size} loading={loading}>
        {children}
      </Conteudo>
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps, ButtonStyleProps {}

/** Link do react-router com aparência de botão. */
export function ButtonLink({ variant, size, icon, iconRight, block, loading, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cn(buttonClasses({ variant, size, block }), className)} {...rest}>
      <Conteudo icon={icon} iconRight={iconRight} size={size} loading={loading}>
        {children}
      </Conteudo>
    </Link>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Rótulo acessível (obrigatório: o botão não tem texto). */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mostra o rótulo como tooltip nativo (title). Padrão true. */
  showTitle?: boolean;
}

const iconBtnSizes: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 rounded-[10px]',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-[16px]',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', showTitle = true, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={showTitle ? label : undefined}
      className={cn(base, variants[variant], iconBtnSizes[size], 'px-0', className)}
      {...rest}
    >
      <Icon name={icon} size={iconSizes[size]} />
    </button>
  );
});
