/**
 * Palpite no servidor: a imagem de prévia é GENÉRICA (sem candidato, sem número, sem resultado e sem ler palpite algum),
 * leva a faixa "Oferecimento" do anúncio de compartilhamento, e as meta tags/sitemap da /palpite.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnuncioConfig } from '../shared/anuncios';
import { OG_H, OG_W, renderPng, type No } from './og';
import { comOferecimento } from './og-oferecimento';
import { ROTA_OG_PALPITE, layoutPalpite } from './og-palpite';
import { comando, login, montar } from './test-helpers';

const SAIDA = process.env.OG_PREVIA_DIR;

function textos(no: unknown): string[] {
  if (typeof no === 'string') return [no];
  if (!no || typeof no !== 'object') return [];
  const ch = (no as No).props?.children;
  return (Array.isArray(ch) ? ch : [ch]).flatMap(textos);
}

function anuncio(id: string, extra: Partial<AnuncioConfig> = {}): AnuncioConfig {
  return {
    id,
    marca: `Marca ${id}`,
    titulo: 'Pix na hora, sem taxa',
    texto: '',
    cta: 'Abrir conta',
    url: `https://${id}.com.br`,
    formatos: ['compartilhamento'],
    peso: 5,
    cota: 'apoio',
    ativo: true,
    inicio: null,
    fim: null,
    naoPolitico: true,
    ...extra,
  };
}

describe('imagem genérica do Palpite', () => {
  it('sem nome, número de urna, foto ou resultado de candidato', () => {
    const t = textos(layoutPalpite()).join(' ');
    expect(t).toContain('Qual é o seu palpite?');
    expect(t).not.toMatch(/Lula|Bolsonaro|Flávio|\b13\b|\b22\b/);
    expect(JSON.stringify(layoutPalpite())).not.toMatch(/data:image\/(jpeg|webp)/);
  });

  it('renderiza 1200×630, com e sem a faixa "Oferecimento"', async () => {
    if (SAIDA) mkdirSync(SAIDA, { recursive: true });
    for (const [nome, no] of [
      ['palpite', layoutPalpite()],
      ['palpite-oferecimento', comOferecimento(layoutPalpite(), 'Lynx Pay')],
    ] as const) {
      const png = await renderPng(no);
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([OG_W, OG_H]);
      if (SAIDA) writeFileSync(join(SAIDA, `og-${nome}.png`), png);
    }
  }, 60_000);
});

describe('rota, meta tags e sitemap', () => {
  it('nunca lê palpite; faixa só com anúncio de compartilhamento; anunciante no &v= das meta tags', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'sintonia-dist-palpite-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><!--app-meta--></head><body></body></html>');
    const m = await montar({ env: { SERVE_STATIC: '1', DIST_DIR: dist } });
    const cookie = await login(m);
    const bytes = async (u: string) => {
      const r = await m.app.request(u);
      expect(r.status, u).toBe(200);
      expect(r.headers.get('content-type')).toBe('image/png');
      return Buffer.from(await r.arrayBuffer());
    };
    const html = async () => {
      const r = await m.app.request('/palpite');
      expect(r.status).toBe(200);
      return r.text();
    };
    const vDe = (h: string) => /og:image" content="[^"]*\/api\/og\/palpite\.png\?v=([^"&]+)"/.exec(h)?.[1];

    const sem = await bytes(ROTA_OG_PALPITE);
    // a rota não tem parâmetro: uma query qualquer (alguém colando o código) não muda nada
    expect((await bytes(`${ROTA_OG_PALPITE}?p=1e0&c=1e0`)).equals(sem)).toBe(true);
    const h0 = await html();
    expect(vDe(h0)).toBe('v1');
    expect(h0).toContain('<link rel="canonical" href="');
    expect(h0).toMatch(/canonical" href="[^"]*\/palpite"/);
    expect(h0).not.toContain('noindex');
    expect(h0).toContain('Não é pesquisa');

    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    const com = await bytes(ROTA_OG_PALPITE);
    expect(com.equals(sem)).toBe(false);
    expect(vDe(await html())).toMatch(/^v1-of[a-z0-9]+$/);

    // anúncio sem o formato 'compartilhamento': a imagem volta a ser a de sempre
    await comando(m, cookie, { tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { formatos: ['topo'] }) });
    expect((await bytes(ROTA_OG_PALPITE)).equals(sem)).toBe(true);
    expect(vDe(await html())).toBe('v1');

    const sitemap = await (await m.app.request('/sitemap-paginas.xml') /* I07b: /sitemap.xml virou índice */).text();
    expect(sitemap).toContain('/palpite</loc>');
  }, 120_000);
});

describe('ilustração neutra do Palpite (conferência final)', () => {
  it('o divisor fica no MEIO da trilha (sem preenchimento puxado para um lado)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/og-palpite.ts', 'utf8');
    // trilha de 388 px: alça de 24 px centrada em 194
    expect(src).toContain("left: 182, top: 6, width: 24");
    expect(src).not.toMatch(/left: 194, top: 0, width: 58/);
    const chamada = readFileSync('src/app/components/palpite/ChamadaPalpite.tsx', 'utf8');
    expect(chamada).not.toMatch(/left-\[64%\]/);
  });
});
