/**
 * Slider com marcas. Input range nativo (acessível, teclado, leitores de tela) sobreposto a uma
 * trilha desenhada com tokens.
 */
import { useId, useRef, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/app/lib/cn';
import { valorNoTrilho } from '@/app/lib/trilho';

export interface SliderMark {
  value: number;
  label?: ReactNode;
}

export interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  /** Formata o valor exibido à direita do rótulo e no aria-valuetext. */
  format?: (v: number) => string;
  marks?: SliderMark[];
  /** Preenche a partir deste valor (ex.: 0 num slider −5…+5). Padrão: min. */
  origin?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format = (v) => String(v),
  marks,
  origin,
  disabled,
  ariaLabel,
  className,
}: SliderProps) {
  const id = useId();
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * 100;
  const p = pct(value);
  const o = pct(origin ?? min);
  const ini = Math.min(p, o);
  const fim = Math.max(p, o);
  // Toque: o valor segue o dedo em qualquer ponto da trilha (no iOS/WebKit, inclusive no navegador embutido do app do
  // X, o range nativo só obedece a quem arrasta o próprio polegar). Mouse e teclado ficam com o input nativo.
  const trilho = useRef<HTMLDivElement>(null);
  const dedo = useRef<number | null>(null);
  const valorNoPonto = (x: number) => {
    const r = trilho.current?.getBoundingClientRect();
    return r && r.width > 0 ? valorNoTrilho(x, r.left, r.width, min, max, step) : value;
  };
  const aoTocar = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.pointerType === 'mouse') return;
    dedo.current = e.pointerId;
    const n = valorNoPonto(e.clientX);
    if (n !== value) onChange(n);
  };
  const aoArrastar = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || dedo.current !== e.pointerId) return;
    const n = valorNoPonto(e.clientX);
    if (n !== value) onChange(n);
  };
  const aoSoltar = () => {
    dedo.current = null;
  };
  return (
    <div className={cn('w-full', disabled && 'opacity-50', className)}>
      {label ? (
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-sm font-medium text-fg">
            {label}
          </label>
          <span className="num text-sm font-semibold text-fg">{format(value)}</span>
        </div>
      ) : null}
      <div
        ref={trilho}
        className="relative h-6 touch-pan-y"
        onPointerDown={aoTocar}
        onPointerMove={aoArrastar}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand-grad" style={{ left: `${ini}%`, width: `${fim - ini}%` }} />
        {marks?.map((m) => (
          <span
            key={m.value}
            aria-hidden
            className={cn('absolute top-1/2 h-2.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full', m.value >= Math.min(value, origin ?? min) && m.value <= Math.max(value, origin ?? min) ? 'bg-brand-ink/70' : 'bg-fg-subtle/60')}
            style={{ left: `${pct(m.value)}%` }}
          />
        ))}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label ? undefined : ariaLabel}
          aria-valuetext={format(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          // área de toque de 44 px de altura (a trilha desenhada tem 24 px)
          className="peer absolute inset-x-0 -bottom-2.5 -top-2.5 z-10 w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand bg-brand-ink',
            'shadow-[0_2px_8px_rgb(0_0_0/0.35)] transition-[box-shadow,transform] duration-150',
            'peer-hover:scale-110 peer-active:scale-110 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/40',
          )}
          style={{ left: `${p}%` }}
        />
      </div>
      {marks?.some((m) => m.label !== undefined) ? (
        <div className="relative mt-1.5 h-4">
          {marks.map((m, i) => (
            <span
              key={m.value}
              className={cn(
                'num absolute text-[11px] text-fg-muted',
                i === 0 && pct(m.value) === 0 ? 'translate-x-0' : i === marks.length - 1 && pct(m.value) === 100 ? '-translate-x-full' : '-translate-x-1/2',
              )}
              style={{ left: `${pct(m.value)}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
