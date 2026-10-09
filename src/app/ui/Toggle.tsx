import { useId, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/app/lib/cn';

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Rótulo visível (ou use `ariaLabel`). */
  label?: ReactNode;
  description?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** Interruptor (role="switch"). */
export function Toggle({ checked, onChange, label, description, ariaLabel, disabled, size = 'md', className }: ToggleProps) {
  const id = useId();
  const w = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const k = size === 'sm' ? 16 : 20;
  const shift = size === 'sm' ? 16 : 20;
  const btn = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full p-[2px] transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-45',
        checked ? 'bg-brand' : 'bg-surface-3 ring-1 ring-inset ring-line/[1.5]',
        w,
      )}
    >
      <motion.span
        aria-hidden
        className="block rounded-full bg-brand-ink shadow-[0_1px_3px_rgb(0_0_0/0.35)]"
        style={{ width: k, height: k }}
        animate={{ x: checked ? shift : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 36 }}
      />
    </button>
  );
  if (!label) return <span className={className}>{btn}</span>;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={id} className={cn('min-w-0 cursor-pointer', disabled && 'cursor-not-allowed opacity-60')}>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description ? <span className="mt-0.5 block text-[13px] text-fg-muted">{description}</span> : null}
      </label>
      {btn}
    </div>
  );
}
