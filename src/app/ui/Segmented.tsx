/**
 * Controle segmentado estilo iOS com indicador deslizante (Framer Motion).
 * Semântica de radiogroup (setas ←/→ mudam a seleção) — ou de tablist com `role="tablist"`.
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from './Icon';

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  icon?: IconName;
  /** Rótulo acessível quando `label` não é texto. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedProps<V extends string> {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (v: V) => void;
  /** Nome do grupo para leitores de tela. */
  ariaLabel: string;
  size?: 'sm' | 'md';
  /** Ocupa a largura toda (segmentos iguais). */
  block?: boolean;
  /** 'radiogroup' (padrão) ou 'tablist' (quando controla painéis). */
  role?: 'radiogroup' | 'tablist';
  className?: string;
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  block,
  role = 'radiogroup',
  className,
}: SegmentedProps<V>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    const habilitados = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    const pos = habilitados.indexOf(idx);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = habilitados[(pos + 1) % habilitados.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = habilitados[(pos - 1 + habilitados.length) % habilitados.length];
    else if (e.key === 'Home') next = habilitados[0];
    else if (e.key === 'End') next = habilitados[habilitados.length - 1];
    if (next >= 0) {
      e.preventDefault();
      onChange(options[next].value);
      refs.current[next]?.focus();
    }
  }

  const itemRole = role === 'tablist' ? 'tab' : 'radio';
  return (
    <LayoutGroup id={id}>
      <div
        role={role}
        aria-label={ariaLabel}
        className={cn(
          'relative inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-[3px]',
          block && 'flex w-full',
          className,
        )}
      >
        {options.map((o, i) => {
          const sel = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role={itemRole}
              aria-checked={itemRole === 'radio' ? sel : undefined}
              aria-selected={itemRole === 'tab' ? sel : undefined}
              aria-label={o.ariaLabel}
              tabIndex={sel ? 0 : -1}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                'relative z-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0',
                'disabled:cursor-not-allowed disabled:opacity-40',
                size === 'sm' ? 'h-7 rounded-[9px] px-2.5 text-xs' : 'h-8 rounded-[10px] px-3.5 text-[13px]',
                block && 'flex-1',
                sel ? 'text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {sel ? (
                <motion.span
                  layoutId="seg-indicador"
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-[inherit] border border-line bg-surface-3 shadow-[0_1px_2px_rgb(0_0_0/0.25),0_4px_12px_-6px_rgb(0_0_0/0.4)] dark:bg-surface-3"
                  transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.9 }}
                />
              ) : null}
              {o.icon ? <Icon name={o.icon} size={size === 'sm' ? 14 : 16} /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
