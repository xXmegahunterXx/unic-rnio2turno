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
      setSize((s) =>
        Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height },
      );
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

export type DirecaoSeta = 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp';
const VETOR: Record<DirecaoSeta, readonly [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};
export const ehSeta = (k: string): k is DirecaoSeta => k in VETOR;

/**
 * Navegação espacial por setas (mapas com "roving tabindex": uma parada de Tab no mapa, setas
 * passeiam pelas áreas). Devolve a chave do ponto mais próximo na direção da seta — a distância fora
 * do eixo pesa 2× — ou null se não houver nada naquela direção.
 */
export function vizinhoNaDirecao<K extends string>(
  pontos: Partial<Record<K, { x: number; y: number }>>,
  origem: K,
  dir: DirecaoSeta,
): K | null {
  const p0 = pontos[origem];
  if (!p0) return null;
  const [dx, dy] = VETOR[dir];
  let melhor: K | null = null;
  let melhorScore = Infinity;
  for (const k of Object.keys(pontos) as K[]) {
    if (k === origem) continue;
    const p = pontos[k]!;
    const vx = p.x - p0.x;
    const vy = p.y - p0.y;
    const ao = vx * dx + vy * dy;
    if (ao <= 0.5) continue;
    const perp = Math.abs(vx * dy - vy * dx);
    const score = ao + 2 * perp;
    if (score < melhorScore) {
      melhorScore = score;
      melhor = k;
    }
  }
  return melhor;
}
