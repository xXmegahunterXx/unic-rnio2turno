/**
 * Mapa do site (I07b): índice + páginas, municípios (todos, com o exterior), candidatos e cargos; lastmod real, sem
 * changefreq/priority; nada privado; cada endereço de município e de candidato abre com título próprio (200) nas meta
 * tags; rotas com cache de 1 h, compressão e HEAD; o app inteiro serve o índice e o robots.txt aponta para ele.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import type { LoadedDataset } from '../engine/api';
import type { Race, UF } from '../shared/types';
import { ondeMunicipio } from '../shared/titulos';
import { UFS } from '../shared/types';
import { DadosEstaticos } from './dados-estaticos';
import { metaDaRota, type ContextoMeta } from './meta-tags';
import {
  ARQUIVOS_SITEMAP,
  CC_SITEMAP,
  dataSitemap,
  fontesSitemap,
  montarSitemaps,
  paginasSitemap,
  registrarSitemap,
  rotasSitemap,
  xmlIndice,
  xmlUrlset,
  type Sitemaps,
} from './sitemap';
import { RAIZ, datasetReal, montar } from './test-helpers';

const DATA_DIR = join(RAIZ, 'public/data');
const BUILD = '2026-10-16T09:00:00Z';
let ds: LoadedDataset;
let s: Sitemaps;

beforeAll(async () => {
  ds = await datasetReal();
  s = montarSitemaps(fontesSitemap({ dataset: ds, dataDir: DATA_DIR, buildData: BUILD }));
});

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((a) => a[1]);

describe('listas', () => {
  it('municípios: todos os do dataset e as cidades do exterior, sem repetir, no formato /apuracao/<uf>/<cod>', () => {
    const esperado = Object.values(ds.ufs).reduce((n, d) => n + (d?.municipios.length ?? 0), 0);
    expect(esperado).toBeGreaterThan(5_700);
    expect(s.municipios).toHaveLength(esperado);
    expect(new Set(s.municipios.map((e) => e.caminho)).size).toBe(esperado);
    expect(s.municipios.every((e) => /^\/apuracao\/[a-z]{2}\/\d{5}$/.test(e.caminho))).toBe(true);
    const caminhos = s.municipios.map((e) => e.caminho);
    expect(caminhos).toContain('/apuracao/sp/62910'); // Campinas
    expect(caminhos).toContain('/apuracao/df/97012'); // Brasília
    expect(caminhos.filter((c) => c.startsWith('/apuracao/zz/')).length).toBe(ds.ufs.ZZ!.municipios.length);
    // as 27 UFs + exterior estão lá
    expect(new Set(caminhos.map((c) => c.split('/')[2])).size).toBe(28);
  });

  it('candidatos: as fichas do índice, sem repetir; cargos: Senado e Câmara por UF', () => {
    expect(s.candidatos.length).toBeGreaterThan(1_500);
    expect(new Set(s.candidatos.map((e) => e.caminho)).size).toBe(s.candidatos.length);
    expect(s.candidatos.every((e) => /^\/candidato\/\d{6,15}$/.test(e.caminho))).toBe(true);
    expect(s.cargos).toHaveLength(54);
    for (const u of UFS) {
      expect(s.cargos.map((e) => e.caminho)).toContain(`/senado?uf=${u.toLowerCase()}`);
      expect(s.cargos.map((e) => e.caminho)).toContain(`/camara?uf=${u.toLowerCase()}`);
    }
  });

  it('páginas: a lista de sempre (compatível com rotasSitemap) e nada privado em lugar nenhum', () => {
    expect(s.paginas.map((e) => e.caminho)).toEqual(paginasSitemap());
    expect(rotasSitemap().map(([p]) => p)).toEqual(paginasSitemap());
    const tudo = ARQUIVOS_SITEMAP.flatMap((n) => s[n].map((e) => e.caminho));
    expect(tudo.some((c) => /admin|duelo|embed|kit|\/live\b|cenarios\?|relatorio|\/api\//.test(c))).toBe(false);
    expect(tudo).toContain('/palpite');
    expect(tudo).toContain('/streamers');
  });

  it('lastmod real: institucional = build; dados = o mais recente entre build e dataset; sem data, sem lastmod', () => {
    const build = Date.parse(BUILD);
    const dataset = Date.parse(ds.meta.geradoEm);
    const de = (c: string) => s.paginas.find((e) => e.caminho === c)?.lastmod;
    expect(de('/metodologia')).toBe(build);
    expect(de('/apuracao/sp')).toBe(Math.max(build, dataset));
    expect(s.municipios[0].lastmod).toBe(Math.max(build, dataset));
    // build antigo, dataset novo: vale o dataset
    const antigo = montarSitemaps({ municipios: [{ uf: 'SP', cod: '62910' }], candidatos: [], buildEm: Date.UTC(2026, 0, 1), datasetEm: dataset });
    expect(antigo.municipios[0].lastmod).toBe(dataset);
    expect(antigo.paginas.find((e) => e.caminho === '/sobre')?.lastmod).toBe(Date.UTC(2026, 0, 1));
    const semData = montarSitemaps({ municipios: [{ uf: 'SP', cod: '62910' }], candidatos: ['123456'] });
    expect(xmlUrlset('https://x', semData.municipios)).not.toContain('<lastmod>');
    // lixo nas fontes não vira endereço
    const lixo = montarSitemaps({ municipios: [{ uf: 'SP', cod: '../x' }], candidatos: ['abc', '1'] });
    expect(lixo.municipios).toEqual([]);
    expect(lixo.candidatos).toEqual([]);
  });
});

describe('XML', () => {
  it('urlset sem changefreq/priority, com origem absoluta e escape; índice com os 4 arquivos e o lastmod de cada', () => {
    const x = xmlUrlset('https://sintonia2026.com.br', s.municipios);
    expect(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
    expect(x).not.toMatch(/changefreq|priority/);
    expect(locs(x)).toHaveLength(s.municipios.length);
    expect(locs(x)[0]).toMatch(/^https:\/\/sintonia2026\.com\.br\/apuracao\/[a-z]{2}\/\d{5}$/);
    expect(x).toContain(`<lastmod>${dataSitemap(s.municipios[0].lastmod!)}</lastmod>`);
    expect(dataSitemap(Date.UTC(2026, 9, 12, 14, 36, 15, 526))).toBe('2026-10-12T14:36:15Z');
    expect(xmlUrlset('https://a.b', [{ caminho: '/x?a=1&b=<2>' }])).toContain('<loc>https://a.b/x?a=1&amp;b=&lt;2&gt;</loc>');
    const i = xmlIndice('https://sintonia2026.com.br', s);
    expect(i).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(locs(i)).toEqual(ARQUIVOS_SITEMAP.map((n) => `https://sintonia2026.com.br/sitemap-${n}.xml`));
    expect((i.match(/<lastmod>/g) ?? []).length).toBe(4);
    // tamanho: bem abaixo do limite de 50 MB e de 50 mil endereços por arquivo
    expect(Buffer.byteLength(x)).toBeLessThan(2_000_000);
  });
});

describe('cada endereço do mapa abre com título próprio nas meta tags (o que o robô de busca lê)', () => {
  it('municípios: 200, nome da cidade no título e na descrição; candidatos: 200 com a ficha', () => {
    const races = new Map<string, Race>(ds.meta.races.map((r) => [r.id, r]));
    const nomes = new Map<string, string>();
    for (const [uf, d] of Object.entries(ds.ufs)) for (const m of d?.municipios ?? []) nomes.set(`${uf}|${m.cod}`, m.nome);
    const est = new DadosEstaticos(DATA_DIR);
    const ctx: ContextoMeta = {
      races,
      nomeMunicipio: (uf, cod) => nomes.get(`${uf}|${cod}`),
      fase: () => 'pre',
      agora: () => Date.UTC(2026, 9, 20, 15, 0, 0),
      ficha: (sq) => ({ lida: est.ficha(sq), existe: est.existeCandidato(sq) }),
    };
    const titulos = new Set<string>();
    for (const e of s.municipios) {
      const [, , uf, cod] = e.caminho.split('/');
      const m = metaDaRota(e.caminho, new URLSearchParams(), ctx);
      const nome = nomes.get(`${uf.toUpperCase()}|${cod}`)!;
      expect(m.status, e.caminho).toBe(200);
      expect(m.noindex, e.caminho).toBeFalsy();
      expect(m.titulo.startsWith(`Eleição 2026 ${ondeMunicipio(nome, uf.toUpperCase() as UF)}: `), e.caminho).toBe(true);
      expect(m.descricao, e.caminho).toContain(nome);
      titulos.add(m.titulo);
    }
    expect(titulos.size).toBe(s.municipios.length); // nenhum título repetido
    for (const e of s.candidatos.slice(0, 200)) {
      const m = metaDaRota(e.caminho, new URLSearchParams(), ctx);
      expect(m.status, e.caminho).toBe(200);
      expect(m.titulo, e.caminho).toContain('Ficha do candidato');
    }
    for (const e of [...s.paginas, ...s.cargos]) {
      const [p, qs] = e.caminho.split('?');
      expect(metaDaRota(p, new URLSearchParams(qs ?? ''), ctx).status, e.caminho).toBe(200);
    }
  }, 60_000);
});

describe('rotas', () => {
  const app = () => {
    const a = new Hono<{ Bindings: HttpBindings }>();
    registrarSitemap(a, { dataset: ds, dataDir: DATA_DIR, buildData: BUILD, origemDe: () => 'https://sintonia2026.com.br' });
    return a;
  };

  it('índice e arquivos: XML, cache de 1 h, gzip/br sob pedido e HEAD sem corpo', async () => {
    const a = app();
    const r = await a.request('/sitemap.xml');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(r.headers.get('cache-control')).toBe(CC_SITEMAP);
    expect(locs(await r.text())).toHaveLength(4);
    for (const n of ARQUIVOS_SITEMAP) {
      const x = await (await a.request(`/sitemap-${n}.xml`)).text();
      expect(locs(x).length, n).toBe(s[n].length);
    }
    const gz = await a.request('/sitemap-municipios.xml', { headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers.get('content-encoding')).toBe('gzip');
    expect(gz.headers.get('vary')).toBe('Accept-Encoding');
    const texto = gunzipSync(Buffer.from(await gz.arrayBuffer())).toString('utf8');
    expect(locs(texto)).toHaveLength(s.municipios.length);
    const br = await a.request('/sitemap-municipios.xml', { headers: { 'accept-encoding': 'br' } });
    expect(br.headers.get('content-encoding')).toBe('br');
    const head = await a.request('/sitemap-municipios.xml', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    expect((await a.request('/sitemap-outro.xml')).status).toBe(404);
  });

  it('origem por pedido (sem PUBLIC_URL): cada origem tem o seu XML e a memória é limitada', async () => {
    const a = new Hono<{ Bindings: HttpBindings }>();
    registrarSitemap(a, { dataset: ds, dataDir: DATA_DIR, origemDe: (c) => `https://${c.req.header('host') ?? 'x'}` });
    for (let i = 0; i < 20; i++) {
      const x = await (await a.request('/sitemap.xml', { headers: { host: `h${i}.exemplo` } })).text();
      expect(locs(x)[0]).toBe(`https://h${i}.exemplo/sitemap-paginas.xml`);
    }
  });

  it('no app: /sitemap.xml é o índice (com PUBLIC_URL), as páginas em /sitemap-paginas.xml, e o robots.txt aponta o índice', async () => {
    const m = await montar({ env: { PUBLIC_URL: 'https://sintonia.exemplo.br' } });
    const i = await (await m.app.request('/sitemap.xml')).text();
    expect(i).toContain('<sitemapindex');
    expect(locs(i)).toContain('https://sintonia.exemplo.br/sitemap-municipios.xml');
    const p = locs(await (await m.app.request('/sitemap-paginas.xml')).text());
    expect(p).toContain('https://sintonia.exemplo.br/apuracao');
    expect(p).toHaveLength(paginasSitemap().length);
    const mun = locs(await (await m.app.request('/sitemap-municipios.xml')).text());
    expect(mun).toContain('https://sintonia.exemplo.br/apuracao/sp/62910');
    expect(await (await m.app.request('/robots.txt')).text()).toContain('Sitemap: https://sintonia.exemplo.br/sitemap.xml');
  }, 30_000);
});
