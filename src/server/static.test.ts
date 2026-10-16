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
import { CC_BORDA } from './app';
import { CABECALHO_BORDA } from './http-cache';
import { comando, login, montar, type Montado } from './test-helpers';

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
  m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: dist, PUBLIC_URL: 'https://sintonia.exemplo.br', TWITTER_SITE: 'https://x.com/sintonia' } });
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

  it('/apuracao?race=gov-am → título e imagem da corrida', async () => {
    const html = await (await get('/apuracao?race=gov-am')).text();
    expect(html).toContain('<title>Eleição 2026 no Amazonas: 1º turno e apuração do 2º turno · Governador · Sintonia</title>'); // I07: título por fase
    expect(html).toContain('apuracao.png?race=gov-am');
    expect(html).toContain('<meta property="og:url" content="https://sintonia.exemplo.br/apuracao?race=gov-am" />');
  });

  it('link antigo de uma UF que saiu do 2º turno (gov-rj, 10/10/2026) cai em Presidente', async () => {
    const html = await (await get('/apuracao?race=gov-rj')).text();
    expect(html).toContain('<title>Eleição 2026 para Presidente: 1º turno e apuração do 2º turno · Sintonia</title>'); // I07: título por fase
    expect(html).toContain('apuracao.png?race=pres');
  });

  it('/apuracao/:uf e /apuracao/:uf/:cod usam nomes do dataset', async () => {
    const uf = await (await get('/apuracao/sp')).text();
    expect(uf).toContain('Eleição 2026 em São Paulo: 1º turno e apuração do 2º turno'); // I07: título por fase
    expect(uf).toContain('apuracao.png?race=pres&amp;uf=sp');
    const mun = await (await get('/apuracao/ac/1066')).text();
    expect(mun).toContain('Eleição 2026 em Porto Walter (AC)'); // I07: título por fase
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
    const cand = await get('/candidato/280002542548');
    expect(cand.status).toBe(200);
    expect(await cand.text()).toContain('Lula (PT) · Presidente · Ficha do candidato · Sintonia');
    // sequencial bem formado, mas fora do índice de candidatos → 404 (a SPA mostra "não encontrado")
    expect((await get('/candidato/280001607829')).status).toBe(404);
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
    const csp = r.headers.get('content-security-policy')!;
    expect(csp).toMatch(/frame-ancestors 'self'$/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('permissions-policy')).toContain('camera=()');
    expect(r.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
  });

  it('embeds (/embed/*): podem ir em iframe de qualquer site; o resto continua protegido', async () => {
    const e = await get('/embed/placar');
    expect(e.status).toBe(200);
    expect(e.headers.get('x-frame-options')).toBeNull();
    expect(e.headers.get('content-security-policy')).toMatch(/frame-ancestors \*$/);
    expect(e.headers.get('x-robots-tag')).toBe('noindex');
    expect(await e.text()).toContain('<meta name="robots" content="noindex, nofollow" />');
    for (const p of ['/', '/apuracao', '/teste', '/admin']) {
      const r = await get(p);
      expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(r.headers.get('content-security-policy')).toMatch(/frame-ancestors 'self'$/);
    }
  });

  it('fase 3: imagem específica por página, twitter:site e chave de cache com os parâmetros da página', async () => {
    const mun = await (await get('/apuracao/sp/71072')).text();
    expect(mun).toContain('/api/og/municipio.png?race=pres&amp;uf=sp&amp;cod=71072&amp;v=');
    expect(mun).toContain('<meta name="twitter:site" content="@sintonia" />');
    expect(mun).toContain('<meta property="og:image:secure_url"');
    const a = await (await get('/curiosidades?fato=brasil-eleitorado&utm_source=x')).text();
    const b = await (await get('/curiosidades?fato=finalistas-menor-diferenca')).text();
    expect(a).toContain('curiosidade.png?f=brasil-eleitorado');
    expect(a).toContain('<link rel="canonical" href="https://sintonia.exemplo.br/curiosidades?fato=brasil-eleitorado" />');
    expect(b).toContain('curiosidade.png?f=finalistas-menor-diferenca');
    expect(await (await get('/senado?uf=sp')).text()).toContain('/api/og/senado.png?uf=sp');
    expect(await (await get('/cenarios')).text()).toContain('/api/og/cenario.png?v=');
    // código de cenário gigante: página normal com o cartão genérico (nada de 5xx)
    const g = await get(`/cenarios?c=${'A'.repeat(4_000)}`);
    expect(g.status).toBe(200);
    expect(await g.text()).toContain('/api/og/cenario.png?v=');
    // duelo: nenhum pedaço do código no HTML
    const d = await (await get('/duelo/RESPOSTAS-DO-TESTE')).text();
    expect(d).not.toContain('RESPOSTAS-DO-TESTE');
  });

  it('textos são escapados (sem injeção de HTML)', () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
  });

  it('robots.txt padrão: imagens OG e os dados das páginas de apuração liberados (I06), resto da API e admin fora', async () => {
    const r = await get('/robots.txt');
    expect(r.status).toBe(200);
    // 1 h também na borda: mudança de regra chega no mesmo dia
    expect(r.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=3600');
    const t = await r.text();
    expect(t).toContain('Allow: /api/og/');
    for (const a of ['Allow: /api/status', 'Allow: /api/meta', 'Allow: /api/apuracao/']) {
      expect(t).toContain(a);
      // antes do Disallow: robôs que usam a PRIMEIRA regra que casa também liberam
      expect(t.indexOf(a)).toBeLessThan(t.indexOf('Disallow: /api/'));
    }
    expect(t).toContain('Disallow: /api/');
    expect(t).toContain('Disallow: /admin');
    expect(t).not.toContain('/duelo'); // o robô precisa ler a página do Duelo para montar o cartão
  });

  it('HTML na borda (I05): só com a chave "html-borda"; nunca admin, widgets, Duelo, relatório, 404', async () => {
    const paginas = ['/', '/apuracao', '/apuracao/sp', '/teste', '/live'];
    const fora = ['/admin', '/embed/placar', '/duelo/abc123', '/relatorio', '/rota-que-nao-existe'];
    // padrão: desligada — só o no-cache do navegador
    for (const p of [...paginas, ...fora]) expect((await get(p)).headers.get(CABECALHO_BORDA), p).toBeNull();
    const cookie = await login(m);
    expect((await comando(m, cookie, { tipo: 'html-borda', ligado: true })).status).toBe(200);
    try {
      for (const p of paginas) {
        const r = await get(p, { 'accept-encoding': 'br' });
        expect(r.status, p).toBe(200);
        expect(r.headers.get('cache-control'), p).toBe('no-cache');
        expect(r.headers.get(CABECALHO_BORDA), p).toBe(CC_BORDA.html);
        expect(r.headers.get('vary'), p).toBe('Accept-Encoding');
      }
      expect(CC_BORDA.html).toBe('max-age=15, stale-while-revalidate=15, stale-if-error=86400');
      for (const p of fora) expect((await get(p)).headers.get(CABECALHO_BORDA), p).toBeNull();
      expect((await get('/rota-que-nao-existe')).status).toBe(404);
      // arquivos do build e a API seguem com o próprio cache
      expect((await get('/assets/index-abc123.js')).headers.get(CABECALHO_BORDA)).toBeNull();
    } finally {
      expect((await comando(m, cookie, { tipo: 'html-borda', ligado: false })).status).toBe(200);
    }
    // desligada: a próxima resposta já sai sem o cabeçalho (a borda revalida em até 15 s e para de guardar)
    expect((await get('/')).headers.get(CABECALHO_BORDA)).toBeNull();
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
