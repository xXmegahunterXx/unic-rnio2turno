/**
 * Imagem de prévia (OG 1200×630) da página /palpite — GENÉRICA, como a do Teste Cego.
 *
 * O palpite de cada pessoa NUNCA chega aqui: no link ele vai depois do "#" (`/palpite#1e0`), parte do endereço que o
 * navegador não envia; esta rota não lê parâmetro algum. Os cartões com o palpite (x/feed/story) são gerados no
 * navegador (src/app/components/palpite/CartaoPalpite.tsx). Sem nome, número ou foto de candidato e sem resultado: só o
 * convite, com a ilustração do divisor nas cores da marca — por isso pode levar a faixa "Oferecimento: <marca>" do
 * anúncio de compartilhamento (og-oferecimento.ts; o master vence).
 *
 * Cache: uma imagem por conjunto de anunciantes (`tagOferecimento`), em memória; as meta tags levam o anunciante no
 * `&v=` (imagemComOferecimento), então trocar o anunciante gera outra URL.
 */
import type { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import type { LiveStatus } from '../shared/types';
import type { Logger } from './log';
import { C, OG_H, fundo, h, marca, renderPng, type No } from './og';
import { comOferecimento, oferecimentoDe, tagOferecimento } from './og-oferecimento';

export const ROTA_OG_PALPITE = '/api/og/palpite.png';
/** Mesmo cache da imagem do Teste Cego (o anunciante entra na URL das meta tags). */
export const CC_OG_PALPITE = 'public, max-age=86400, s-maxage=86400';

/** Ilustração neutra do divisor (cores da marca, nunca as dos candidatos): "?% × ?%" sobre uma trilha. */
function ilustracao(): No {
  const lado = (texto: string, alinhar: 'flex-start' | 'flex-end') =>
    h(
      'div',
      { flexDirection: 'column', alignItems: alinhar },
      h('div', { width: 64, height: 64, borderRadius: 32, background: C.surface3, border: `3px solid ${C.brand2}`, alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 30, color: C.brand2 }, '?'),
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 84, color: C.fg, letterSpacing: -3, lineHeight: 1, marginTop: 18 }, texto),
    );
  return h(
    'div',
    {
      position: 'absolute',
      left: 676,
      top: 128,
      width: 460,
      height: 374,
      borderRadius: 32,
      background: C.surface,
      border: `2px solid ${C.line}`,
      flexDirection: 'column',
      padding: '36px 36px 32px',
    },
    h('div', { justifyContent: 'space-between' }, lado('?%', 'flex-start'), h('div', { fontSize: 40, color: C.subtle, alignSelf: 'flex-end', marginBottom: 14 }, '×'), lado('?%', 'flex-end')),
    // trilha: metades suaves, preenchimento do meio até o divisor, marca dos 50% e o divisor
    h(
      'div',
      { position: 'relative', height: 56, marginTop: 34, alignItems: 'center' },
      h(
        'div',
        { width: 388, height: 16, borderRadius: 8, background: C.surface3, overflow: 'hidden', position: 'relative' },
        h('div', { position: 'absolute', left: 0, top: 0, width: 194, height: 16, background: 'rgba(124,92,255,0.28)' }),
        h('div', { position: 'absolute', left: 194, top: 0, width: 194, height: 16, background: 'rgba(196,168,255,0.22)' }),
        h('div', { position: 'absolute', left: 194, top: 0, width: 58, height: 16, background: C.brand }),
      ),
      h('div', { position: 'absolute', left: 193, top: 12, width: 3, height: 32, borderRadius: 2, background: 'rgba(244,244,250,0.6)' }),
      h('div', { position: 'absolute', left: 240, top: 6, width: 24, height: 44, borderRadius: 12, background: C.fg, border: `1px solid ${C.line}` }),
    ),
    h('div', { fontSize: 20, color: C.muted, marginTop: 14 }, '% dos votos válidos · somam 100%'),
  );
}

/** Cartão genérico do Palpite (sem candidato, sem número, sem resultado). */
export function layoutPalpite(): No {
  return fundo(
    h(
      'div',
      { flexDirection: 'column', padding: '56px 64px', width: 640, height: OG_H },
      marca(),
      h('div', { fontSize: 22, fontWeight: 600, color: C.brand2, letterSpacing: 3, marginTop: 56 }, 'ELEIÇÕES 2026 · 2º TURNO'),
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 84, color: C.fg, letterSpacing: -3, lineHeight: 1, marginTop: 10 }, 'Qual é o seu palpite?'),
      h(
        'div',
        { fontSize: 28, color: C.muted, marginTop: 22, lineHeight: 1.35, maxWidth: 560 },
        'Crave o % dos votos válidos de cada candidato até 24/10 e veja depois por quanto errou. Fica só no seu aparelho.',
      ),
    ),
    ilustracao(),
  );
}

export interface DepsOgPalpite {
  /** status atual (anúncios no ar) */
  status: () => Pick<LiveStatus, 'anuncios'>;
  log?: Pick<Logger, 'info'>;
}

type App = Hono<{ Bindings: HttpBindings }>;

/** Registra `/api/og/palpite.png` (1 linha em og-rotas.ts). */
export function registrarOgPalpite(app: App, d: DepsOgPalpite): void {
  /** uma imagem por conjunto de anunciantes ('' = sem anúncio) */
  let memo: { tag: string; png: Promise<Buffer> } | null = null;
  app.get(ROTA_OG_PALPITE, async (c) => {
    const anuncios = d.status().anuncios;
    const tag = tagOferecimento(anuncios);
    if (memo?.tag !== tag) {
      const of = oferecimentoDe(anuncios, 'palpite');
      const t0 = performance.now();
      const pr = renderPng(of ? comOferecimento(layoutPalpite(), of.marca) : layoutPalpite());
      const atual = { tag, png: pr };
      memo = atual;
      pr.then(
        (png) => d.log?.info(`OG palpite gerada em ${Math.round(performance.now() - t0)} ms (${Math.round(png.length / 1024)} KB)`),
        () => {
          if (memo === atual) memo = null;
        },
      );
    }
    const png = await memo.png;
    const headers = {
      'content-type': 'image/png',
      'cache-control': CC_OG_PALPITE,
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
    };
    if (c.req.method === 'HEAD') return c.body(null, 200, headers);
    return c.body(new Uint8Array(png.buffer as ArrayBuffer, png.byteOffset, png.byteLength), 200, headers);
  });
}
