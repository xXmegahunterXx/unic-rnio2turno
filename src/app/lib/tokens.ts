/**
 * Tokens de cor em tempo de execução — fonte ÚNICA para quem precisa da cor "resolvida" (canvas, contraste).
 *
 * Ponte entre os preenchimentos CSS (strings de `src/app/lib/raceUi.ts`, sempre do tipo
 * `rgb(var(--token) / α)`) e o que o SVG/canvas precisa em tempo de execução:
 *  - leitura dos tokens do tema atual (getComputedStyle) com atualização na troca de tema;
 *  - resolução de um preenchimento para RGB opaco (composto sobre a superfície do cartão),
 *    usado no canvas do mosaico e no cálculo de contraste dos rótulos;
 *  - escolha automática da tinta do rótulo (token `fg` ou `bg`, o de maior contraste).
 *
 * Nada de hex aqui: as cores reais vêm sempre das variáveis CSS de `src/app/styles.css`.
 */
import { useSyncExternalStore } from 'react';

export type RGB = readonly [number, number, number];

/** Tokens lidos do CSS. */
export const TOKENS = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'fg',
  'fg-muted',
  'fg-subtle',
  'line',
  'brand',
  'brand-2',
  'brand-deep',
  'brand-fg',
  'cand-a',
  'cand-a-soft',
  'cand-a-fg',
  'cand-b',
  'cand-b-soft',
  'cand-b-fg',
  'cand-outros',
  'pending',
  'ok',
  'alert',
] as const;
export type ColorToken = (typeof TOKENS)[number];
export type TokenColors = Record<ColorToken, RGB> & { lineAlpha: number };

/** `rgb(var(--token))` ou `rgb(var(--token) / α)` (α com 3 casas). Único construtor de cor CSS do app. */
export function tokenCss(token: ColorToken, alpha = 1): string {
  return alpha >= 1 ? `rgb(var(--${token}))` : `rgb(var(--${token}) / ${Math.round(Math.max(0, alpha) * 1000) / 1000})`;
}

// ---------------------------------------------------------------------------------------------
// Store de tokens (um só para o app inteiro), invalidado quando o tema muda.
// ---------------------------------------------------------------------------------------------

let snapshot: TokenColors | null = null;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
let mql: MediaQueryList | null = null;

function parseTriplet(v: string): RGB {
  const p = v
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return [p[0] || 0, p[1] || 0, p[2] || 0];
}

function readTokens(): TokenColors {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<ColorToken, RGB>;
  for (const t of TOKENS) out[t] = parseTriplet(cs.getPropertyValue(`--${t}`));
  const la = parseFloat(cs.getPropertyValue('--line-alpha'));
  return Object.assign(out, { lineAlpha: Number.isFinite(la) ? la : 0.08 });
}

function invalidate() {
  // Lê no próximo frame: a troca de data-theme precisa ter sido aplicada ao CSSOM.
  const prev = snapshot;
  snapshot = null;
  const next = getTokens();
  if (prev && JSON.stringify(prev) === JSON.stringify(next)) {
    snapshot = prev; // mantém a identidade (useSyncExternalStore exige snapshot estável)
    return;
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(invalidate);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    mql = window.matchMedia?.('(prefers-color-scheme: light)') ?? null;
    mql?.addEventListener('change', invalidate);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
      mql?.removeEventListener('change', invalidate);
      mql = null;
    }
  };
}

/** Tokens do tema atual (fora de React). */
export function getTokens(): TokenColors {
  if (!snapshot) snapshot = readTokens();
  return snapshot;
}

/** Tokens do tema atual; re-renderiza quando o tema muda. `null` fora do navegador. */
export function useTokenColors(): TokenColors | null {
  return useSyncExternalStore(
    subscribe,
    () => (typeof document === 'undefined' ? null : getTokens()),
    () => null,
  );
}

// ---------------------------------------------------------------------------------------------
// Resolução de preenchimentos CSS → RGB
// ---------------------------------------------------------------------------------------------

const RE_FILL = /rgb\(\s*var\(--([\w-]+)\)\s*(?:\/\s*([\d.]+)\s*)?\)/;
const cacheParse = new Map<string, { token: ColorToken; alpha: number } | null>();

/** Interpreta `rgb(var(--token) / α)`. Devolve null para outros formatos (ex.: url(#padrão)). */
export function parseFill(css: string): { token: ColorToken; alpha: number } | null {
  let r = cacheParse.get(css);
  if (r !== undefined) return r;
  const m = RE_FILL.exec(css);
  r = m && (TOKENS as readonly string[]).includes(m[1]) ? { token: m[1] as ColorToken, alpha: m[2] ? +m[2] : 1 } : null;
  cacheParse.set(css, r);
  return r;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Preenchimento CSS → RGB opaco, composto sobre `sobre` (padrão: superfície do cartão). */
export function resolveFill(css: string, tk: TokenColors, sobre: ColorToken = 'surface'): RGB {
  const p = parseFill(css);
  if (!p) return tk.pending;
  return mix(tk[sobre], tk[p.token], Math.max(0, Math.min(1, p.alpha)));
}

/** RGB resolvido → string CSS (uso exclusivo em canvas, onde var() não funciona). */
export function rgbCss(c: RGB, alpha = 1): string {
  const r = Math.round(c[0]);
  const g = Math.round(c[1]);
  const b = Math.round(c[2]);
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

function lum(c: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

export function contraste(a: RGB, b: RGB): number {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Tinta de rótulo sobre um preenchimento: o token (`fg` ou `bg`) com maior contraste.
 * Como `fg` e `bg` são extremos opostos nos dois temas, sempre há uma opção legível.
 */
export function inkToken(fillCss: string, tk: TokenColors | null): 'fg' | 'bg' {
  if (!tk) return 'fg';
  const c = resolveFill(fillCss, tk);
  return contraste(c, tk.fg) >= contraste(c, tk.bg) ? 'fg' : 'bg';
}
