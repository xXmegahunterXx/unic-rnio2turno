/**
 * Desafio do palpite no servidor: a imagem de prévia é GENÉRICA (sem candidato, sem número, sem apelido, sem resultado,
 * sem ler parâmetro algum) e a página /palpite/desafio tem meta tags próprias, fora dos buscadores e do sitemap.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OG_H, OG_W, renderPng, type No } from './og';
import { ROTA_OG_DESAFIO, layoutDesafio } from './og-desafio';
import { montar } from './test-helpers';

const SAIDA = process.env.OG_PREVIA_DIR;

function textos(no: unknown): string[] {
  if (typeof no === 'string') return [no];
  if (!no || typeof no !== 'object') return [];
  const ch = (no as No).props?.children;
  return (Array.isArray(ch) ? ch : [ch]).flatMap(textos);
}

describe('imagem genérica do desafio', () => {
  it('sem nome, número de urna, percentual, foto, valor ou prêmio', () => {
    const t = textos(layoutDesafio()).join(' ');
    expect(t).toContain('Quem chega mais perto?');
    expect(t).toContain('Sem dinheiro, só pela graça');
    expect(t).not.toMatch(/Lula|Bolsonaro|Flávio|\b13\b|\b22\b|%/);
    expect(t).not.toMatch(/apost|\bbets?\b|bol[ãa]o|pr[êe]mi|valendo|R\$/i);
    expect(JSON.stringify(layoutDesafio())).not.toMatch(/data:image\/(jpeg|webp)/);
  });

  it('renderiza 1200×630', async () => {
    const png = await renderPng(layoutDesafio());
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([OG_W, OG_H]);
    if (SAIDA) {
      mkdirSync(SAIDA, { recursive: true });
      writeFileSync(join(SAIDA, 'og-desafio.png'), png);
    }
  }, 60_000);

  it('o módulo não lê query, cookie nem cabeçalho do pedido (nada do visitante chega à imagem)', () => {
    const src = readFileSync('src/server/og-desafio.ts', 'utf8');
    expect(src).not.toMatch(/c\.req\.(query|param|header|cookie)/);
  });
});

describe('rota, meta tags e sitemap do desafio', () => {
  it('imagem igual com qualquer query; página com noindex, canônico sem código e imagem própria', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'sintonia-dist-desafio-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><!--app-meta--></head><body></body></html>');
    const m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: dist } });
    const bytes = async (u: string) => {
      const r = await m.app.request(u);
      expect(r.status, u).toBe(200);
      expect(r.headers.get('content-type')).toBe('image/png');
      expect(r.headers.get('cache-control')).toContain('max-age=86400');
      return Buffer.from(await r.arrayBuffer());
    };
    const a = await bytes(ROTA_OG_DESAFIO);
    expect((await bytes(`${ROTA_OG_DESAFIO}?n=Ana&p=1e0&c=1abcde`)).equals(a)).toBe(true);

    const r = await m.app.request('/palpite/desafio?utm_source=whatsapp');
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/og:image" content="[^"]*\/api\/og\/desafio\.png\?v=v2"/);
    expect(html).toMatch(/canonical" href="[^"]*\/palpite\/desafio"/);
    expect(html).not.toContain('utm_source');
    expect(html).toContain('noindex');
    expect(html).toContain('Desafio do palpite');
    expect(html).toContain('Sem dinheiro, só pela graça');
    expect(html).not.toMatch(/Lula|Bolsonaro|apost|\bbets?\b|bol[ãa]o|pr[êe]mi/i);
    // o "/palpite" de sempre continua indexável, com a sua imagem
    const h2 = await (await m.app.request('/palpite')).text();
    expect(h2).not.toContain('noindex');
    expect(h2).toContain('/api/og/palpite.png');

    const sitemap = await (await m.app.request('/sitemap-paginas.xml')).text();
    expect(sitemap).toContain('/palpite</loc>');
    expect(sitemap).not.toContain('/palpite/desafio');
  }, 120_000);
});
