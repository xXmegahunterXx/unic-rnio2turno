/**
 * Pré-carregamento de páginas ao passar o mouse, tocar ou focar um link (o chunk da página chega antes do clique).
 * Os `import()` apontam para os MESMOS arquivos do router.tsx, então o Vite gera os mesmos chunks (nada duplica).
 *
 * Respeita economia de dados (`navigator.connection.saveData`) e redes 2G: nesses casos não pré-carrega nada.
 * Cada rota é pedida uma vez por sessão.
 */
type Carregador = () => Promise<unknown>;

const ROTAS: [teste: (p: string) => boolean, carregar: Carregador][] = [
  [(p) => p === '/', () => import('@/app/pages/Home')],
  [(p) => p === '/teste', () => import('@/app/pages/teste/TestePage')],
  [(p) => p === '/teste/resultado', () => import('@/app/pages/teste/ResultadoPage')],
  [(p) => p.startsWith('/duelo/'), () => import('@/app/pages/teste/DueloPage')],
  [(p) => p === '/apuracao', () => import('@/app/pages/apuracao/NacionalPage')],
  [(p) => p === '/apuracao/consulta', () => import('@/app/pages/apuracao/ConsultaPage')],
  [(p) => p === '/governadores', () => import('@/app/pages/apuracao/GovernadoresPage')],
  [(p) => /^\/apuracao\/[a-z]{2}\/[^/]+\/\d+\/\d+$/.test(p), () => import('@/app/pages/apuracao/SecaoPage')],
  [(p) => /^\/apuracao\/[a-z]{2}\/[^/]+$/.test(p), () => import('@/app/pages/apuracao/MunicipioPage')],
  [(p) => /^\/apuracao\/[a-z]{2}$/.test(p), () => import('@/app/pages/apuracao/UfPage')],
  [(p) => p === '/curiosidades', () => import('@/app/pages/curiosidades/CuriosidadesPage')],
  [(p) => p === '/cenarios', () => import('@/app/pages/cenarios/CenariosPage')],
  [(p) => p === '/senado', () => import('@/app/pages/cargos/SenadoPage')],
  [(p) => p === '/camara', () => import('@/app/pages/cargos/CamaraPage')],
  [(p) => p.startsWith('/assembleias'), () => import('@/app/pages/cargos/AssembleiaPage')],
  [(p) => p === '/metodologia', () => import('@/app/pages/static/MetodologiaPage')],
  [(p) => p === '/privacidade', () => import('@/app/pages/static/PrivacidadePage')],
  [(p) => p === '/sobre', () => import('@/app/pages/static/SobrePage')],
  [(p) => p === '/tv', () => import('@/app/pages/tv/TvPage')],
];

const pedidos = new Set<string>();

interface ConexaoInfo {
  saveData?: boolean;
  effectiveType?: string;
}

/** true quando vale pré-carregar (sem economia de dados e fora do 2G). */
export function podePreCarregar(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: ConexaoInfo }).connection;
  if (!c) return true;
  return !c.saveData && !/(^|-)2g$/.test(c.effectiveType ?? '');
}

/** Caminho sem query/hash e sem barra final. */
export function caminhoDe(to: string): string {
  const p = to.split(/[?#]/)[0] || '/';
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

/** Carregador da página de uma rota (ou null). Puro o bastante para teste. */
export function carregadorDe(to: string): Carregador | null {
  const p = caminhoDe(to);
  return ROTAS.find(([t]) => t(p))?.[1] ?? null;
}

/** Pré-carrega o chunk da página de `to` (uma vez). */
export function preCarregarRota(to: string): void {
  const p = caminhoDe(to);
  if (pedidos.has(p) || !podePreCarregar()) return;
  const c = carregadorDe(p);
  if (!c) return;
  pedidos.add(p);
  c().catch(() => pedidos.delete(p));
}

/** Props para um <Link>: pré-carrega ao apontar, tocar ou focar. */
export function propsPreCarregar(to: string) {
  const f = () => preCarregarRota(to);
  return { onPointerEnter: f, onTouchStart: f, onFocus: f };
}

/** Pré-carrega quando o navegador estiver ocioso (ex.: a página do CTA principal), só em rede boa. */
export function preCarregarQuandoOcioso(to: string, atrasoMs = 2500): () => void {
  if (typeof window === 'undefined') return () => {};
  const c = (navigator as Navigator & { connection?: ConexaoInfo }).connection;
  if (c && c.effectiveType && c.effectiveType !== '4g') return () => {};
  let id = 0;
  const t = window.setTimeout(() => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) id = ric(() => preCarregarRota(to), { timeout: 4000 });
    else preCarregarRota(to);
  }, atrasoMs);
  return () => {
    window.clearTimeout(t);
    const cic = (window as Window & { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback;
    if (id && cic) cic(id);
  };
}
