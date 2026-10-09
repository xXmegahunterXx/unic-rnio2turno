/**
 * URL de arquivos estáticos (public/). No build demo (preview estático servido em subcaminho, HashRouter)
 * resolve relativo ao documento; em produção (BrowserRouter) usa caminho absoluto a partir da raiz.
 * Em Web Worker, passe `base` explicitamente (o worker não tem `document`).
 */
export function assetUrl(path: string, base?: string): string {
  const clean = path.replace(/^\/+/, '');
  if (base) return new URL(clean, base).toString();
  if (__DEMO__ && typeof document !== 'undefined') return new URL(clean, document.baseURI).toString();
  return `/${clean}`;
}

/** Base absoluta para repassar ao Worker no modo demo. */
export function assetBase(): string {
  if (typeof document !== 'undefined') return new URL('./', document.baseURI).toString();
  return '/';
}
