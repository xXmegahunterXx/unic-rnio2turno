import { useCallback, useSyncExternalStore } from 'react';

/** true quando a media query casa. SSR/primeira renderização: `fallback`. */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query],
  );
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, get, () => fallback);
}

/** Breakpoints do Tailwind (mobile-first). */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
export const useReducedMotionPref = () => useMediaQuery('(prefers-reduced-motion: reduce)');
