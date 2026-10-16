/**
 * Imagem de prévia (OG 1200×630) da página /anuncie — GENÉRICA, sem candidato (foto, nome, número de urna ou
 * percentual) e sem anunciante: quem recebe o link da página de vendas no WhatsApp não vê marca ao lado de candidato
 * (ARCHITECTURE §1.5). Só a marca do Sintonia, o convite e uma maquete neutra da faixa "Publicidade · Sua marca".
 * Imagem fixa (não depende do status): gerada uma vez e guardada em memória.
 */
import type { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { C, OG_H, fundo, h, marca, renderPng, type No } from './og';

export const ROTA_OG_ANUNCIE = '/api/og/anuncie.png';
export const CC_OG_ANUNCIE = 'public, max-age=86400, s-maxage=86400';

/** Maquete neutra: a faixa de anúncio e um cartão, nas cores da marca. */
function maquete(): No {
  const linha = (w: number, cor: string, alto = 14) => h('div', { width: w, height: alto, borderRadius: alto / 2, background: cor });
  return h(
    'div',
    { position: 'absolute', left: 676, top: 128, width: 460, height: 374, borderRadius: 32, background: C.surface, border: `2px solid ${C.line}`, flexDirection: 'column', padding: '30px 30px' },
    h(
      'div',
      { alignItems: 'center', borderRadius: 18, background: C.surface3, padding: '16px 18px' },
      h('div', { width: 52, height: 52, borderRadius: 14, background: C.brand, alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 24, color: C.fg }, 'SM'),
      h(
        'div',
        { flexDirection: 'column', marginLeft: 16 },
        h('div', { fontSize: 16, fontWeight: 600, color: C.subtle, letterSpacing: 2 }, 'PUBLICIDADE'),
        h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 30, color: C.fg, marginTop: 4 }, 'Sua marca'),
      ),
    ),
    h('div', { flexDirection: 'column', marginTop: 28 }, linha(380, C.surface3), h('div', { height: 14 }), linha(300, C.surface3), h('div', { height: 14 }), linha(340, C.surface3)),
    h(
      'div',
      { marginTop: 'auto', alignItems: 'center', justifyContent: 'space-between' },
      h('div', { fontSize: 20, color: C.muted }, 'Só anunciantes não políticos'),
      h('div', { borderRadius: 999, background: C.brand2, padding: '10px 20px', fontSize: 20, fontWeight: 700, color: C.bg }, 'Saiba mais'),
    ),
  );
}

export function layoutAnuncie(): No {
  return fundo(
    h(
      'div',
      { flexDirection: 'column', padding: '56px 64px', width: 640, height: OG_H },
      marca(),
      h('div', { fontSize: 22, fontWeight: 600, color: C.brand2, letterSpacing: 3, marginTop: 56 }, 'ANUNCIE NO SINTONIA'),
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 76, color: C.fg, letterSpacing: -3, lineHeight: 1.02, marginTop: 10 }, 'Sua marca na noite da apuração'),
      h(
        'div',
        { fontSize: 27, color: C.muted, marginTop: 22, lineHeight: 1.35, maxWidth: 560 },
        'Faixa no topo, cartões no conteúdo, Modo TV, chat ao vivo e lives. Sempre rotulado, sem pop-up.',
      ),
    ),
    maquete(),
  );
}

type App = Hono<{ Bindings: HttpBindings }>;

export function registrarOgAnuncie(app: App): void {
  let png: Promise<Buffer> | null = null;
  app.get(ROTA_OG_ANUNCIE, async (c) => {
    png ??= renderPng(layoutAnuncie());
    let b: Buffer;
    try {
      b = await png;
    } catch (e) {
      png = null;
      throw e;
    }
    const headers = { 'content-type': 'image/png', 'cache-control': CC_OG_ANUNCIE, 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' };
    if (c.req.method === 'HEAD') return c.body(null, 200, headers);
    return c.body(new Uint8Array(b.buffer as ArrayBuffer, b.byteOffset, b.byteLength), 200, headers);
  });
}
