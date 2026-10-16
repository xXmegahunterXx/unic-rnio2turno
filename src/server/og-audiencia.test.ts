/**
 * Imagem do marco de audiência (I26): genérica (sem candidato nem placar), número só do servidor e arredondado para
 * baixo ao marco — a URL nunca aumenta o número.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { describe, expect, it } from 'vitest';
import { MARCOS_AUDIENCIA as MARCOS_PAINEL } from '../app/components/pages/admin/postar';
import { renderPng, type No } from './og';
import {
  CC_OG_AUDIENCIA,
  DIM_OG_AUDIENCIA,
  MARCOS_AUDIENCIA,
  ROTA_OG_AUDIENCIA,
  formatoAudiencia,
  layoutAudiencia,
  marcoAtingido,
  marcoExibido,
  registrarOgAudiencia,
  textosAudiencia,
} from './og-audiencia';

const SAIDA = process.env.OG_PREVIA_DIR;

function textos(no: unknown): string[] {
  if (typeof no === 'string') return [no];
  if (!no || typeof no !== 'object') return [];
  const ch = (no as No).props?.children;
  return (Array.isArray(ch) ? ch : [ch]).flatMap(textos);
}

describe('marcos', () => {
  it('arredonda PARA BAIXO ao marco; abaixo do 1º (ou sem número), nenhum', () => {
    expect(marcoAtingido(undefined)).toBeNull();
    expect(marcoAtingido(Number.NaN)).toBeNull();
    expect(marcoAtingido(499)).toBeNull();
    expect(marcoAtingido(9_999)).toBeNull();
    expect(marcoAtingido(10_000)).toBe(10_000);
    expect(marcoAtingido(49_999)).toBe(10_000);
    expect(marcoAtingido(50_000)).toBe(50_000);
    expect(marcoAtingido(143_000)).toBe(100_000);
  });

  it('o ?m= da URL só pode BAIXAR o marco, nunca aumentar', () => {
    expect(marcoExibido(12_000, '100000')).toBe(10_000);
    expect(marcoExibido(12_000, '50000')).toBe(10_000);
    expect(marcoExibido(60_000, '10000')).toBe(10_000);
    expect(marcoExibido(60_000, '50000')).toBe(50_000);
    expect(marcoExibido(60_000, null)).toBe(50_000);
    expect(marcoExibido(undefined, '100000')).toBeNull();
    expect(marcoExibido(9_000, '10000')).toBeNull();
    // valores fora da lista são ignorados (não viram "número livre")
    expect(marcoExibido(60_000, '1000000')).toBe(50_000);
    expect(marcoExibido(60_000, '20000')).toBe(50_000);
    expect(marcoExibido(60_000, 'abc')).toBe(50_000);
    // ?m=0: o convite sem número (cartão "Convite" da aba Postar)
    expect(marcoExibido(143_000, '0')).toBeNull();
  });

  it('a lista é a mesma do painel (aba Postar)', () => {
    expect([...MARCOS_AUDIENCIA]).toEqual([...MARCOS_PAINEL]);
  });

  it('formato: og, x ou story; o resto vira og', () => {
    expect(formatoAudiencia('story')).toBe('story');
    expect(formatoAudiencia('x')).toBe('x');
    expect(formatoAudiencia('feed')).toBe('og');
    expect(formatoAudiencia(undefined)).toBe('og');
  });
});

describe('imagem genérica', () => {
  it('sem candidato, número de urna, partido nem placar; o número é só o do marco', () => {
    for (const m of [null, ...MARCOS_AUDIENCIA]) {
      for (const f of ['og', 'x', 'story'] as const) {
        const t = textos(layoutAudiencia(m, f)).join(' ');
        expect(t).not.toMatch(/Lula|Bolsonaro|Flávio|Candidato|\bPT\b|\bPL\b|\b13\b|\b22\b|%|vence|lidera|vitória/i);
        expect(t).toContain('sintonia2026.com.br');
        if (m) expect(t).toContain(textosAudiencia(m).titulo);
        else expect(t).toContain('Apuração ao vivo');
      }
    }
    expect(textosAudiencia(50_000).titulo).toBe('Mais de 50 mil pessoas');
    expect(textosAudiencia(100_000).titulo).toBe('Mais de 100 mil pessoas');
    expect(JSON.stringify(layoutAudiencia(50_000))).not.toMatch(/data:image\/(jpeg|webp)/);
  });

  it('renderiza nos três formatos (PNG com a dimensão certa)', async () => {
    if (SAIDA) mkdirSync(SAIDA, { recursive: true });
    for (const [m, f] of [
      [50_000, 'og'],
      [100_000, 'x'],
      [10_000, 'story'],
      [null, 'og'],
    ] as const) {
      const { w, h } = DIM_OG_AUDIENCIA[f];
      const png = await renderPng(layoutAudiencia(m, f), w, h);
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([w, h]);
      if (SAIDA) writeFileSync(join(SAIDA, `og-audiencia-${m ?? 'ao-vivo'}-${f}.png`), png);
    }
  }, 60_000);
});

describe('rota /api/og/audiencia.png', () => {
  function app(pessoas: () => number | undefined, borda?: boolean) {
    const a = new Hono<{ Bindings: HttpBindings }>();
    registrarOgAudiencia(a, { pessoas, borda });
    return a;
  }

  it('PNG com cache de 60 s (navegador e borda); a URL não aumenta o número', async () => {
    let n: number | undefined = 12_000;
    const a = app(() => n);
    const r1 = await a.request(`${ROTA_OG_AUDIENCIA}?m=100000&formato=x`);
    expect(r1.status).toBe(200);
    expect(r1.headers.get('content-type')).toBe('image/png');
    expect(r1.headers.get('cache-control')).toBe(CC_OG_AUDIENCIA);
    expect(r1.headers.get('cloudflare-cdn-cache-control')).toMatch(/max-age=60.*stale-if-error=600/);
    expect(r1.headers.get('content-disposition')).toContain('sintonia-audiencia-10000-x.png');
    const b1 = Buffer.from(await r1.arrayBuffer());
    // mesmo marco (10 mil) com ?m=10000: a MESMA imagem
    const b2 = Buffer.from(await (await a.request(`${ROTA_OG_AUDIENCIA}?m=10000&formato=x`)).arrayBuffer());
    expect(b1.equals(b2)).toBe(true);
    // contador desligado (ou abaixo do piso): imagem sem número
    n = undefined;
    const r3 = await a.request(`${ROTA_OG_AUDIENCIA}?m=100000&formato=x`);
    expect(r3.headers.get('content-disposition')).toContain('sintonia-audiencia-ao-vivo-x.png');
    expect(Buffer.from(await r3.arrayBuffer()).equals(b1)).toBe(false);
  }, 60_000);

  it('CDN_CC=0: só o Cache-Control', async () => {
    const r = await app(() => 60_000, false).request(ROTA_OG_AUDIENCIA, { method: 'HEAD' });
    expect(r.status).toBe(200);
    expect(r.headers.get('cloudflare-cdn-cache-control')).toBeNull();
    expect(r.headers.get('content-disposition')).toContain('sintonia-audiencia-50000-og.png');
  }, 60_000);
});
