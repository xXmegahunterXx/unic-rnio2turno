import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/app/lib/cn';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[];
  label?: ReactNode;
  size?: 'sm' | 'md';
  /** Classe do contêiner. */
  wrapperClassName?: string;
}

/** Select nativo estilizado (melhor experiência no celular: usa o seletor do sistema). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, label, size = 'md', className, wrapperClassName, id, ...rest },
  ref,
) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className={cn('min-w-0', wrapperClassName)}>
      {label ? (
        <label htmlFor={sid} className="mb-1.5 block text-[13px] font-medium text-fg-muted">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <select
          ref={ref}
          id={sid}
          className={cn(
            'w-full cursor-pointer appearance-none truncate border border-line bg-surface-2 pr-9 font-medium text-fg',
            'transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            'disabled:cursor-not-allowed disabled:opacity-50',
            size === 'sm' ? 'h-8 rounded-[10px] pl-3 text-[13px]' : 'h-10 rounded-xl pl-3.5 text-sm',
            className,
          )}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted" />
      </div>
    </div>
  );
});
