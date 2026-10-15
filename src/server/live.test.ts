/**
 * Modo streamer no servidor: /live e /streamers são páginas conhecidas (200, não 404), a /live fica fora dos buscadores,
 * a /streamers entra no sitemap; cabeçalhos: a /live é aberta como página principal pela fonte de navegador do
 * OBS/Streamlabs (não é iframe), então o `frame-ancestors 'self'` padrão não a atrapalha — e as prévias da /streamers
 * (iframe na mesma origem) continuam permitidas; os widgets /embed/* seguem iguais (qualquer site).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { rotasSitemap } from './app';
import { montar, type Montado } from './test-helpers';

const TEMPLATE = `<!doctype html>
<html lang="pt-BR" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <title>Sintonia</title>
    <meta name="description" content="Descrição padrão." />
    <!--app-meta-->
    <script>(function(){document.documentElement.setAttribute('data-x','1')})();</script>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

let m: Montado;

beforeAll(async () => {
  const dist = mkdtempSync(join(tmpdir(), 'sintonia-live-'));
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), TEMPLATE);
  writeFileSync(join(dist, 'assets/index-abc123.js'), 'console.log(1)');
  m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: dist, PUBLIC_URL: 'https://sintonia2026.com.br' } });
});

const get = (p: string) => m.app.request(p);

describe('/live (fonte de navegador do OBS)', () => {
  it('200 com título próprio, fora dos buscadores e canônico na /streamers', async () => {
    const r = await get('/live?layout=barra&fundo=transparente');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-robots-tag')).toBe('noindex');
    const h = await r.text();
    expect(h).toContain('<title>Modo streamer · Apuração ao vivo · Sintonia</title>');
    expect(h).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(h).toContain('<link rel="canonical" href="https://sintonia2026.com.br/streamers" />');
    expect(h).toContain('<div id="root"></div>');
  });

  it('cabeçalhos: CSP com o hash do script inline (tema/fundo antes da pintura) e quadro só na mesma origem', async () => {
    const r = await get('/live?layout=placar');
    const csp = r.headers.get('content-security-policy')!;
    // o script inline do index.html é autorizado pelo hash (o do tema/fundo transparente da /live roda)
    expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    // estilos inline permitidos (o <style> do fundo transparente e os style= do React)
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    // a fonte do OBS abre a /live como página principal: frame-ancestors/X-Frame-Options valem só para iframes —
    // e a prévia da /streamers é iframe na MESMA origem, permitido por 'self'
    expect(csp).toMatch(/frame-ancestors 'self'$/);
    expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(csp).toContain("frame-src 'self'");
    // a /live só fala com o próprio site (status, apuração, anúncios por /api/anuncio/img)
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("img-src 'self' https://sintonia2026.com.br data: blob:");
  });

  it('/embed/* continua igual: pode ir em iframe de qualquer site', async () => {
    const e = await get('/embed/placar');
    expect(e.status).toBe(200);
    expect(e.headers.get('x-frame-options')).toBeNull();
    expect(e.headers.get('content-security-policy')).toMatch(/frame-ancestors \*$/);
  });
});

describe('/streamers', () => {
  it('200, indexável, com título e descrição próprios', async () => {
    const r = await get('/streamers');
    expect(r.status).toBe(200);
    const h = await r.text();
    expect(h).toContain('<title>Use o Sintonia na sua live · Para streamers · Sintonia</title>');
    expect(h).toContain('OBS');
    expect(h).not.toContain('noindex');
  });

  it('sitemap: /streamers sim, /live não', async () => {
    const rotas = rotasSitemap().map(([p]) => p);
    expect(rotas).toContain('/streamers');
    expect(rotas).not.toContain('/live');
    const x = await (await get('/sitemap.xml')).text();
    expect(x).toContain('<loc>https://sintonia2026.com.br/streamers</loc>');
    expect(x).not.toContain('/live<');
  });

  it('subcaminhos inexistentes continuam 404', async () => {
    expect((await get('/live/extra')).status).toBe(404);
    expect((await get('/streamers/x')).status).toBe(404);
  });
});
