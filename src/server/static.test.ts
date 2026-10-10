/**
 * Produção: arquivos do build com cache longo/curto, compressão, fallback da SPA com meta tags por rota,
 * 404 e proteção contra path traversal.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { escapeHtml } from './meta-tags';
import { montar, type Montado } from './test-helpers';

const TEMPLATE = `<!doctype html>
<html lang="pt-BR" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <title>Sintonia · Apuração ao vivo e Teste Cego do 2º turno</title>
    <meta name="description" content="Descrição padrão." />
    <!--app-meta-->
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

let m: Montado;
let dist: string;

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'sintonia-dist-'));
  mkdirSync(join(dist, 'assets'), { recursive: true });
  mkdirSync(join(dist, 'geo'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), TEMPLATE);
  writeFileSync(join(dist, 'assets/index-abc123.js'), `console.log(${JSON.stringify('x'.repeat(5000))});`);
  writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(dist, 'geo/br.json'), JSON.stringify({ viewBox: '0 0 1 1', ufs: {}, pad: 'y'.repeat(3000) }));
  // diretórios novos da fase 2 (JSONs grandes)
  mkdirSync(join(dist, 'data/locais'), { recursive: true });
  mkdirSync(join(dist, 'data/secao'), { recursive: true });
  const locais = { uf: 'SP', locais: Array.from({ length: 4000 }, (_, i) => ({ nome: `Escola Estadual ${i}`, endereco: `Rua ${i % 97}, ${i}` })) };
  writeFileSync(join(dist, 'data/locais/sp.json'), JSON.stringify(locais));
  writeFileSync(join(dist, 'data/secao/sp.json'), JSON.stringify({ n: 3, aptos: 'AAAA'.repeat(2000) }));
  writeFileSync(join(dist, 'geo/br-mun.json'), JSON.stringify({ viewBox: '0 0 1 1', municipios: { '3550308': 'M0 0L1 1'.repeat(400) }, ufs: {} }));
  m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: dist, PUBLIC_URL: 'https://sintonia.exemplo.br' } });
});

const get = (p: string, h: Record<string, string> = {}) => m.app.request(p, { headers: h });

describe('arquivos do build', () => {
  it('/assets/*: 1 ano imutável, gzip, ETag + 304', async () => {
    const r = await get('/assets/index-abc123.js', { 'accept-encoding': 'gzip' });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(r.headers.get('content-type')).toContain('text/javascript');
    expect(r.headers.get('content-encoding')).toBe('gzip');
    const txt = gunzipSync(Buffer.from(await r.arrayBuffer())).toString();
    expect(txt.startsWith('console.log("xxx')).toBe(true);
    const r304 = await get('/assets/index-abc123.js', { 'if-none-match': r.headers.get('etag')! });
    expect(r304.status).toBe(304);
  });

  it('demais arquivos: cache curto; favicon relativo resolvido em rotas aninhadas', async () => {
    const geo = await get('/geo/br.json');
    expect(geo.status).toBe(200);
    expect(geo.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    const fav = await get('/apuracao/sp/favicon.svg');
    expect(fav.status).toBe(200);
    expect(fav.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('data/** e geo/** (inclusive os diretórios novos): cache longo na CDN, ETag e br/gzip pré-computados', async () => {
    for (const p of ['/data/locais/sp.json', '/data/secao/sp.json', '/geo/br-mun.json']) {
      const r = await get(p, { 'accept-encoding': 'gzip, deflate, br' });
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
      expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(r.headers.get('content-encoding')).toBe('br');
      expect(r.headers.get('vary')).toBe('Accept-Encoding');
      const corpo = brotliDecompressSync(Buffer.from(await r.arrayBuffer()));
      expect(() => JSON.parse(corpo.toString())).not.toThrow();
      expect((await get(p, { 'if-none-match': r.headers.get('etag')! })).status).toBe(304);
    }
    const bruto = await get('/data/locais/sp.json');
    const tamanho = Buffer.from(await bruto.arrayBuffer()).length;
    const br = await get('/data/locais/sp.json', { 'accept-encoding': 'br' });
    expect(Buffer.from(await br.arrayBuffer()).length).toBeLessThan(tamanho / 5);
  });

  it('aquecer(): pré-comprime data/ e geo/ sem erro', async () => {
    const r = await m.estaticos!.aquecer(['data', 'geo']);
    expect(r.arquivos).toBe(4);
    expect(r.comprimidos).toBeGreaterThan(0);
    expect(r.comprimidos).toBeLessThan(r.bytes);
    expect(m.estaticos!.emMemoria).toBeGreaterThan(r.bytes - 1);
  });

  it('arquivo inexistente → 404 (não cai na SPA); path traversal bloqueado', async () => {
    expect((await get('/assets/nao-existe.js')).status).toBe(404);
    for (const p of ['/..%2f..%2fpackage.json', '/assets/..%2f..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/package.json']) {
      const r = await get(p);
      expect([400, 404]).toContain(r.status);
      expect(await r.text()).not.toContain('"name": "sintonia"');
    }
  });
});

describe('SPA com meta tags por rota', () => {
  it('/ → index.html sem cache, OG/Twitter completos, imagem absoluta', async () => {
    const r = await get('/');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-cache');
    const html = await r.text();
    expect(html).not.toContain('<!--app-meta-->');
    expect(html).toContain('<meta property="og:title" content="Sintonia · Apuração ao vivo e Teste Cego do 2º turno" />');
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/sintonia\.exemplo\.br\/api\/og\/apuracao\.png\?race=pres&amp;v=[^"]+" \/>/);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('/assets/index-abc123.js');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it('/apuracao?race=gov-rj → título e imagem da corrida', async () => {
    const html = await (await get('/apuracao?race=gov-rj')).text();
    expect(html).toContain('<title>Apuração ao vivo · Governador · Rio de Janeiro · Sintonia</title>');
    expect(html).toContain('apuracao.png?race=gov-rj');
    expect(html).toContain('<meta property="og:url" content="https://sintonia.exemplo.br/apuracao?race=gov-rj" />');
  });

  it('/apuracao/:uf e /apuracao/:uf/:cod usam nomes do dataset', async () => {
    const uf = await (await get('/apuracao/sp')).text();
    expect(uf).toContain('Apuração em São Paulo · Presidente');
    expect(uf).toContain('apuracao.png?race=pres&amp;uf=sp');
    const mun = await (await get('/apuracao/ac/1066')).text();
    expect(mun).toContain('Apuração em Porto Walter (AC)');
    const bu = await (await get('/apuracao/sp/71072/1/15')).text();
    expect(bu).toContain('Boletim de urna · Zona 1, Seção 15 · São Paulo (SP)');
  });

  it('/teste e /duelo/:codigo: cartão do Teste Cego; duelo sem indexação', async () => {
    const t = await (await get('/teste')).text();
    expect(t).toContain('/api/og/teste.png');
    const d = await get('/duelo/AbC123xyz');
    expect(d.status).toBe(200);
    expect(d.headers.get('x-robots-tag')).toBe('noindex');
    const dh = await d.text();
    expect(dh).toContain('noindex');
    expect(dh).toContain('Duelo no Teste Cego');
  });

  it('rotas da fase 2: TV, Senado, Câmara, Assembleias e ficha do candidato', async () => {
    const tv = await get('/tv');
    expect(tv.status).toBe(200);
    expect(await tv.text()).toContain('<title>Modo TV · Apuração ao vivo · Sintonia</title>');
    expect(await (await get('/senado')).text()).toContain('Senado · Resultado do 1º turno de 2026');
    expect(await (await get('/camara')).text()).toContain('Câmara dos Deputados');
    expect(await (await get('/assembleias/sp')).text()).toContain('Assembleia Legislativa · São Paulo');
    expect(await (await get('/assembleias/df')).text()).toContain('Câmara Legislativa · Distrito Federal');
    const cand = await get('/candidato/280001607829');
    expect(cand.status).toBe(200);
    expect(await cand.text()).toContain('Ficha do candidato · Sintonia');
    expect((await get('/assembleias/zz')).status).toBe(404);
    expect((await get('/assembleias/xx')).status).toBe(404);
    expect((await get('/candidato/abc')).status).toBe(404);
  });

  it('rota desconhecida → 404 com a SPA (página "não encontrada")', async () => {
    const r = await get('/rota/que/nao/existe');
    expect(r.status).toBe(404);
    expect(await r.text()).toContain('<div id="root"></div>');
    expect((await get('/apuracao/xx')).status).toBe(404);
    expect((await get('/apuracao/sp/99999')).status).toBe(404);
  });

  it('HTML comprimido e headers de segurança', async () => {
    const r = await get('/governadores', { 'accept-encoding': 'br' });
    expect(r.headers.get('content-encoding')).toBe('br');
    expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('textos são escapados (sem injeção de HTML)', () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
  });

  it('a API continua respondendo JSON (não cai na SPA)', async () => {
    const r = await get('/api/nada');
    expect(r.status).toBe(404);
    expect(r.headers.get('content-type')).toContain('application/json');
  });
});

describe('/healthz', () => {
  it('200 sem cache', async () => {
    const r = await get('/healthz');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const b = (await r.json()) as { ok: boolean; fonte: string };
    expect(b.ok).toBe(true);
    expect(b.fonte).toBe('pre');
  });
});
