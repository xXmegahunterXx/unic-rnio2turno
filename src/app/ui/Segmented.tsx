/**
 * Controle segmentado estilo iOS com indicador deslizante.
 * Semântica de radiogroup (setas ←/→ mudam a seleção) — ou de tablist com `role="tablist"`.
 *
 * O indicador é um único elemento posicionado por CSS (transform + width, com transição): só mede o
 * layout quando a seleção muda ou quando o controle muda de tamanho (ResizeObserver) — nunca a cada
 * re-render da página (importante nas telas que atualizam a cada poucos segundos).
 */
import { memo, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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

function SegmentedImpl<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  block,
  role = 'radiogroup',
  className,
}: SegmentedProps<V>) {
  const contRef = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selIdx = options.findIndex((o) => o.value === value);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  // Só anima depois da primeira medição (evita o indicador "voar" do canto ao montar).
  const [animar, setAnimar] = useState(false);

  useLayoutEffect(() => {
    const el = refs.current[selIdx];
    const cont = contRef.current;
    if (!el || !cont) {
      setInd(null);
      return;
    }
    const medir = () =>
      setInd((prev) => {
        const x = el.offsetLeft;
        const w = el.offsetWidth;
        return prev && prev.x === x && prev.w === w ? prev : { x, w };
      });
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(cont);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [selIdx, options.length]);

  useLayoutEffect(() => {
    if (ind && !animar) {
      const id = requestAnimationFrame(() => setAnimar(true));
      return () => cancelAnimationFrame(id);
    }
  }, [ind, animar]);

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
      refs.current[next]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }

  const itemRole = role === 'tablist' ? 'tab' : 'radio';
  return (
    <div
      ref={contRef}
      role={role}
      aria-label={ariaLabel}
      className={cn(
        'relative isolate inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-[3px]',
        block && 'flex w-full',
        className,
      )}
    >
      {ind ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute bottom-[3px] left-0 top-[3px] -z-10 border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.12),0_3px_10px_-4px_rgb(0_0_0/0.25)]',
            'dark:bg-surface-3 dark:shadow-[0_1px_2px_rgb(0_0_0/0.3),0_4px_12px_-6px_rgb(0_0_0/0.45)]',
            size === 'sm' ? 'rounded-[9px]' : 'rounded-[10px]',
            animar && 'transition-[transform,width] duration-300 ease-[cubic-bezier(.3,1.25,.5,1)]',
          )}
          style={{ width: ind.w, transform: `translateX(${ind.x}px)` }}
        />
      ) : null}
      {options.map((o, i) => {
        const sel = i === selIdx;
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
            tabIndex={sel || (selIdx < 0 && i === 0) ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0',
              'disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'h-7 rounded-[9px] px-2.5 text-xs' : 'h-8 rounded-[10px] px-3.5 text-[13px]',
              block && 'flex-1',
              sel ? 'text-fg' : 'text-fg-muted hover:text-fg',
              // sem medição (ex.: SSR/primeiro frame) o selecionado ainda se destaca
              sel && !ind && 'bg-surface dark:bg-surface-3',
            )}
          >
            {o.icon ? <Icon name={o.icon} size={size === 'sm' ? 14 : 16} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Memoizado: com `onChange` estável (useState setter / useCallback), re-renders da página pai não
 * chegam aqui. Mesmo sem isso, o custo por render é baixo (não há medição de layout no render).
 */
export const Segmented = memo(SegmentedImpl) as typeof SegmentedImpl;
