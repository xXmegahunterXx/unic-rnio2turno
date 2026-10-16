/**
 * Mapa do site (I07b, busca): `/sitemap.xml` é um ÍNDICE para quatro arquivos —
 *  - `/sitemap-paginas.xml`: home, apuração (Brasil e as 27 UFs), governadores, Teste Cego, cargos do 1º turno,
 *    institucionais, streamers, palpite e chat (a lista de sempre, `paginasSitemap`);
 *  - `/sitemap-municipios.xml`: TODOS os municípios (5.570) e as cidades do exterior (`/apuracao/<uf>/<cod>`, a página
 *    que responde "resultado <cidade>" na busca), a partir do dataset carregado (o mesmo de municipios-br.json + ZZ);
 *  - `/sitemap-candidatos.xml`: as fichas `/candidato/<sqcand>` de candidatos/index.json;
 *  - `/sitemap-cargos.xml`: Senado e Câmara por estado (`/senado?uf=`, `/camara?uf=`, canônicos das meta tags).
 *
 * Gerados UMA vez na subida (lista fixa; o XML com a origem pública é montado uma vez por origem e guardado, comprimido
 * sob demanda). `lastmod` real: a data do build (commit) para páginas institucionais e o mais recente entre o build e a
 * geração do dataset (`meta.geradoEm`; `curiosidades.json` para /curiosidades) para as páginas de dados. Sem
 * `changefreq`/`priority` (os buscadores ignoram). Cache de 1 h (navegador e borda). Nada de rota privada (admin, Duelo,
 * widgets, /live, cenários com código, relatório): todas fora.
 *
 * Ligado em app.ts por `registrarSitemap(app, …)`; `rotasSitemap()` continua exportada (via app.ts) para os testes antigos.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Context, Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import type { LoadedDataset } from '../engine/api';
import { UFS, type UF } from '../shared/types';
import { corpoCodificado, negociar, type CorpoPronto } from './http-cache';

type App = Hono<{ Bindings: HttpBindings }>;
type Ctx = Context<{ Bindings: HttpBindings }>;

/** Navegador e borda: 1 h (o mapa só muda com um deploy ou dados novos). */
export const CC_SITEMAP = 'public, max-age=3600, s-maxage=3600';
/** Arquivos do índice, na ordem. */
export const ARQUIVOS_SITEMAP = ['paginas', 'municipios', 'candidatos', 'cargos'] as const;
export type ArquivoSitemap = (typeof ARQUIVOS_SITEMAP)[number];
/** Limite do protocolo por arquivo (50 mil URLs); acima disso o arquivo é cortado e o log avisa. */
export const MAX_URLS_SITEMAP = 50_000;

/** Páginas públicas indexáveis (sitemap-paginas.xml). */
export function paginasSitemap(): string[] {
  const ufs = UFS.map((u) => u.toLowerCase());
  return [
    '/',
    '/apuracao',
    ...ufs.map((u) => `/apuracao/${u}`),
    '/governadores',
    '/teste',
    '/curiosidades',
    '/cenarios',
    '/senado',
    '/camara',
    '/assembleias',
    ...ufs.map((u) => `/assembleias/${u}`),
    '/metodologia',
    '/sobre',
    '/privacidade',
    '/anuncie',
    '/streamers',
    '/palpite',
    '/ao-vivo',
  ];
}

/** Compatibilidade (testes da leva 2): `[caminho]` de cada página do sitemap de páginas. */
export function rotasSitemap(): [string][] {
  return paginasSitemap().map((p): [string] => [p]);
}

/** Páginas cujo conteúdo é dado (apuração, 1º turno, cargos): o lastmod considera também a geração do dataset. */
const RE_PAGINA_DE_DADOS = /^\/(apuracao|governadores|senado|camara|assembleias|cenarios|ao-vivo)?(\/|$)/;

export interface EntradaSitemap {
  /** caminho (com a query que importa), relativo à origem */
  caminho: string;
  /** epoch ms (ausente = sem lastmod) */
  lastmod?: number;
}

export interface FontesSitemap {
  /** municípios por UF (inclusive ZZ), na ordem do dataset */
  municipios: { uf: UF; cod: string }[];
  /** sequenciais das fichas (candidatos/index.json) */
  candidatos: string[];
  /** data do build (commit), epoch ms */
  buildEm?: number;
  /** geração do dataset (meta.geradoEm), epoch ms */
  datasetEm?: number;
  /** geração das curiosidades (curiosidades.json), epoch ms */
  curiosidadesEm?: number;
}

export type Sitemaps = Record<ArquivoSitemap, EntradaSitemap[]>;

const maior = (...xs: (number | undefined)[]): number | undefined => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0);
  return v.length ? Math.max(...v) : undefined;
};

/** As quatro listas (pura; testada em sitemap.test.ts). */
export function montarSitemaps(f: FontesSitemap): Sitemaps {
  const dados = maior(f.buildEm, f.datasetEm);
  const paginas = paginasSitemap().map((caminho): EntradaSitemap => {
    if (caminho === '/curiosidades') return { caminho, lastmod: maior(f.buildEm, f.curiosidadesEm) };
    return { caminho, lastmod: RE_PAGINA_DE_DADOS.test(caminho) ? dados : f.buildEm };
  });
  const vistos = new Set<string>();
  const municipios: EntradaSitemap[] = [];
  for (const m of f.municipios) {
    if (!/^\d{5}$/.test(m.cod)) continue;
    const caminho = `/apuracao/${m.uf.toLowerCase()}/${m.cod}`;
    if (vistos.has(caminho)) continue;
    vistos.add(caminho);
    municipios.push({ caminho, lastmod: dados });
  }
  const sqs = new Set(f.candidatos.filter((sq) => /^\d{6,15}$/.test(sq)));
  const candidatos = [...sqs].map((sq): EntradaSitemap => ({ caminho: `/candidato/${sq}`, lastmod: dados }));
  const ufs = UFS.map((u) => u.toLowerCase());
  const cargos: EntradaSitemap[] = [
    ...ufs.map((u): EntradaSitemap => ({ caminho: `/senado?uf=${u}`, lastmod: dados })),
    ...ufs.map((u): EntradaSitemap => ({ caminho: `/camara?uf=${u}`, lastmod: dados })),
  ];
  return { paginas, municipios, candidatos, cargos };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** W3C Datetime em UTC, sem milissegundos ("2026-10-12T14:36:15Z"). */
export const dataSitemap = (ms: number) => `${new Date(ms).toISOString().slice(0, 19)}Z`;

/** `<urlset>` com as entradas (até MAX_URLS_SITEMAP). */
export function xmlUrlset(origem: string, entradas: readonly EntradaSitemap[]): string {
  const linhas = entradas
    .slice(0, MAX_URLS_SITEMAP)
    .map((e) => `  <url><loc>${esc(origem + e.caminho)}</loc>${e.lastmod ? `<lastmod>${dataSitemap(e.lastmod)}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${linhas.join('\n')}\n</urlset>\n`;
}

/** `<sitemapindex>` para os arquivos (lastmod = o mais recente de cada um). */
export function xmlIndice(origem: string, s: Sitemaps): string {
  const linhas = ARQUIVOS_SITEMAP.filter((n) => s[n].length > 0).map((n) => {
    const lm = maior(...s[n].map((e) => e.lastmod));
    return `  <sitemap><loc>${esc(`${origem}/sitemap-${n}.xml`)}</loc>${lm ? `<lastmod>${dataSitemap(lm)}</lastmod>` : ''}</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${linhas.join('\n')}\n</sitemapindex>\n`;
}

const dataValida = (v: unknown): number | undefined => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t > 0 ? t : undefined;
};

function lerJson(dir: string, rel: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, rel), 'utf8')) as unknown;
  } catch {
    return null;
  }
}

export interface DepsSitemap {
  /** dataset carregado na subida (meta.geradoEm e os municípios de cada UF, inclusive ZZ) */
  dataset: Pick<LoadedDataset, 'meta' | 'ufs'>;
  /** DATA_DIR (candidatos/index.json e curiosidades.json) */
  dataDir: string;
  /** data do build (ISO; config.build.data) */
  buildData?: string | null;
  /** origem pública (PUBLIC_URL; sem ela, a do pedido) */
  origemDe(c: Ctx): string;
  /** aviso no log (arquivo cortado no limite do protocolo) */
  aviso?(msg: string): void;
}

/** Fontes do mapa a partir do dataset e de DATA_DIR (lidas uma vez; arquivo ausente = lista vazia). */
export function fontesSitemap(d: Pick<DepsSitemap, 'dataset' | 'dataDir' | 'buildData'>): FontesSitemap {
  const municipios: { uf: UF; cod: string }[] = [];
  const ordem = [...d.dataset.meta.ufs.map((u) => u.uf), ...(Object.keys(d.dataset.ufs) as UF[])];
  const feitas = new Set<string>();
  for (const uf of ordem) {
    if (feitas.has(uf)) continue;
    feitas.add(uf);
    for (const m of d.dataset.ufs[uf]?.municipios ?? []) municipios.push({ uf, cod: String(m.cod) });
  }
  const idx = lerJson(d.dataDir, 'candidatos/index.json') as { colunas?: unknown; linhas?: unknown } | null;
  const candidatos: string[] = [];
  if (idx && Array.isArray(idx.colunas) && Array.isArray(idx.linhas)) {
    const i = idx.colunas.indexOf('sqcand');
    if (i >= 0) for (const l of idx.linhas) if (Array.isArray(l)) candidatos.push(String(l[i] ?? ''));
  }
  const cur = lerJson(d.dataDir, 'curiosidades.json') as { geradoEm?: unknown } | null;
  return {
    municipios,
    candidatos,
    buildEm: dataValida(d.buildData),
    datasetEm: dataValida(d.dataset.meta.geradoEm),
    curiosidadesEm: dataValida(cur?.geradoEm),
  };
}

/** Rotas `/sitemap.xml` (índice) e `/sitemap-<arquivo>.xml`. As listas são montadas aqui, uma vez. */
export function registrarSitemap(app: App, d: DepsSitemap): Sitemaps {
  const s = montarSitemaps(fontesSitemap(d));
  for (const n of ARQUIVOS_SITEMAP) {
    if (s[n].length > MAX_URLS_SITEMAP) d.aviso?.(`sitemap-${n}.xml: ${s[n].length} endereços, acima do limite de ${MAX_URLS_SITEMAP} (cortado)`);
  }
  /** XML pronto por origem (com PUBLIC_URL, uma só; sem ela, no máximo 8 — um Host forjado não enche a memória) */
  const porOrigem = new Map<string, Map<string, CorpoPronto>>();
  const corpo = (origem: string, nome: ArquivoSitemap | 'indice'): CorpoPronto => {
    let m = porOrigem.get(origem);
    if (!m) {
      m = new Map();
      porOrigem.set(origem, m);
      while (porOrigem.size > 8) porOrigem.delete(porOrigem.keys().next().value as string);
    }
    let c = m.get(nome);
    if (!c) {
      c = { bruto: Buffer.from(nome === 'indice' ? xmlIndice(origem, s) : xmlUrlset(origem, s[nome])) };
      m.set(nome, c);
    }
    return c;
  };
  const servir = async (c: Ctx, nome: ArquivoSitemap | 'indice') => {
    const cp = corpo(d.origemDe(c), nome);
    const cod = negociar(c.req.header('accept-encoding'));
    const body = await corpoCodificado(cp, cod, true);
    const headers: Record<string, string> = {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': CC_SITEMAP,
      vary: 'Accept-Encoding',
    };
    if (body !== cp.bruto && cod) headers['content-encoding'] = cod;
    if (c.req.method === 'HEAD') return c.body(null, 200, headers);
    return c.body(new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength), 200, headers);
  };
  app.get('/sitemap.xml', (c) => servir(c, 'indice'));
  for (const n of ARQUIVOS_SITEMAP) app.get(`/sitemap-${n}.xml`, (c) => servir(c, n));
  return s;
}
