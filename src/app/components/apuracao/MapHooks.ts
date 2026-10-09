/** Hooks utilitários dos componentes de visualização. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Largura/altura de um elemento (ResizeObserver). Começa com `inicial` até medir. */
export function useElementSize<T extends HTMLElement>(inicial = { w: 0, h: 0 }) {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState(inicial);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useIsoLayoutEffect(() => {
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, size, el] as const;
}

/** Valor anterior (do render passado). */
export function usePrevious<T>(v: T): T | undefined {
  const r = useRef<T | undefined>(undefined);
  useEffect(() => {
    r.current = v;
  });
  return r.current;
}

/** Fecha algo ao tocar/clicar fora de `el` (só enquanto `ativo`). */
export function useClickOutside(el: HTMLElement | null, ativo: boolean, onFora: () => void) {
  const cb = useRef(onFora);
  cb.current = onFora;
  useEffect(() => {
    if (!ativo || !el) return;
    const h = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) cb.current();
    };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, [el, ativo]);
}

/** Respeita prefers-reduced-motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
