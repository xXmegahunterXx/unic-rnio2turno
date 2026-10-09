/**
 * Tooltip acessível (hover + foco), renderizado em portal e posicionado dentro da viewport.
 * O gatilho recebe `aria-describedby`. Toque: abre no toque e fecha ao tocar fora.
 */
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/app/lib/cn';

export interface TooltipProps {
  content: ReactNode;
  /** Elemento único focável (botão, link…). */
  children: ReactElement<Record<string, unknown>>;
  side?: 'top' | 'bottom';
  /** Atraso para abrir no hover (ms). */
  delay?: number;
  className?: string;
  disabled?: boolean;
}

export function Tooltip({ content, children, side = 'top', delay = 120, className, disabled }: TooltipProps) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; lado: 'top' | 'bottom' } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const bubble = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const abrir = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAberto(true), delay);
  }, [delay]);
  const fechar = useCallback(() => {
    window.clearTimeout(timer.current);
    setAberto(false);
  }, []);

  useLayoutEffect(() => {
    if (!aberto || !trigger.current) return;
    const calc = () => {
      const r = trigger.current!.getBoundingClientRect();
      const b = bubble.current?.getBoundingClientRect();
      const w = b?.width ?? 200;
      const h = b?.height ?? 36;
      let lado = side;
      if (lado === 'top' && r.top - h - 10 < 4) lado = 'bottom';
      if (lado === 'bottom' && r.bottom + h + 10 > window.innerHeight - 4) lado = 'top';
      const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      const y = lado === 'top' ? r.top - h - 8 : r.bottom + 8;
      setPos({ x, y, lado });
    };
    calc();
    const raf = requestAnimationFrame(calc);
    window.addEventListener('scroll', fechar, { passive: true, capture: true });
    window.addEventListener('resize', fechar);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', fechar, { capture: true });
      window.removeEventListener('resize', fechar);
    };
  }, [aberto, side, fechar]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    const onDown = (e: PointerEvent) => {
      if (trigger.current && !trigger.current.contains(e.target as Node)) fechar();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [aberto, fechar]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!isValidElement(children) || disabled) return children;

  const p = children.props as Record<string, (e: unknown) => void>;
  const trig = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      trigger.current = el;
    },
    'aria-describedby': aberto ? id : undefined,
    onPointerEnter: (e: PointerEvent) => {
      p.onPointerEnter?.(e);
      if (e.pointerType === 'mouse') abrir();
    },
    onPointerLeave: (e: PointerEvent) => {
      p.onPointerLeave?.(e);
      if (e.pointerType === 'mouse') fechar();
    },
    onPointerUp: (e: PointerEvent) => {
      p.onPointerUp?.(e);
      if (e.pointerType !== 'mouse') setAberto((v) => !v);
    },
    onFocus: (e: FocusEvent) => {
      p.onFocus?.(e);
      abrir();
    },
    onBlur: (e: FocusEvent) => {
      p.onBlur?.(e);
      fechar();
    },
  });

  return (
    <>
      {trig}
      {typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              {aberto ? (
                <motion.div
                  ref={bubble}
                  id={id}
                  role="tooltip"
                  initial={{ opacity: 0, y: (pos?.lado ?? side) === 'top' ? 4 : -4, scale: 0.98 }}
                  animate={{ opacity: pos ? 1 : 0, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                  transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
                  style={{ position: 'fixed', left: pos?.x ?? -9999, top: pos?.y ?? -9999, zIndex: 80 }}
                  className={cn(
                    'pointer-events-none max-w-[min(280px,calc(100vw-16px))] rounded-xl border border-line bg-surface-3 px-3 py-2',
                    'text-[12.5px] leading-snug text-fg shadow-[0_12px_32px_-12px_rgb(0_0_0/0.6)]',
                    className,
                  )}
                >
                  {content}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}
