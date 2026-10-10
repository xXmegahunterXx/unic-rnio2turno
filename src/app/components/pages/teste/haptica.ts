/**
 * Toque tátil sutil (Vibration API). Só quando o aparelho permite (Android/Chrome; o iOS ignora) e a pessoa não pediu
 * movimento reduzido. Nunca lança: em iframes sem permissão ou navegadores antigos, simplesmente não faz nada.
 */
export function vibrar(padrao: number | number[] = 10): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate(padrao);
  } catch {
    /* sem vibração */
  }
}
