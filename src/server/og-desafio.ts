/**
 * Imagem de prévia (OG 1200×630) do link de desafio `/palpite/desafio#<código>` — GENÉRICA, como a do Palpite.
 *
 * O apelido e o palpite de quem desafiou NUNCA chegam aqui: no link eles vão depois do "#" (parte do endereço que o
 * navegador não envia); esta rota não lê parâmetro algum. Sem nome, número, foto ou percentual de candidato e sem
 * resultado: só o convite "Quem chega mais perto?" com uma lista ilustrativa ("?" e "cravou"), nas cores da marca. O texto
 * vale em todas as fases (antes do prazo, no dia da votação e depois): a imagem fica 24 h na CDN.
 * O ranking do desafio (apelidos e diferenças) é gerado no NAVEGADOR (src/app/components/palpite/CartaoDesafio.tsx).
 *
 * Sem a faixa "Oferecimento": a URL das meta tags não leva o anunciante (`imagemComOferecimento`, og-oferecimento.ts,
 * fora desta frente), então trocar o anunciante deixaria a imagem velha na CDN por um dia. Para ligar, basta incluir
 * ROTA_OG_DESAFIO em `imagemComOferecimento` e usar `comOferecimento(layoutDesafio(), …)` aqui, como em og-palpite.ts.
 */
import type { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import type { Logger } from './log';
import { C, OG_H, fundo, h, marca, renderPng, type No } from './og';

export const ROTA_OG_DESAFIO = '/api/og/desafio.png';
/** Mesmo cache das imagens genéricas do Teste Cego e do Palpite. */
export const CC_OG_DESAFIO = 'public, max-age=86400, s-maxage=86400';

/** Marca de "cravou" desenhada (sem depender de o glifo existir nas fontes do satori). */
const CHECK_URI = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#c4a8ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
).toString('base64')}`;

/** Uma linha da lista ilustrativa: monograma "?", traços no lugar do apelido e "cravou ✓" (nenhum número). */
function linha(largura: number, destaque: boolean): No {
  return h(
    'div',
    {
      alignItems: 'center',
      height: 66,
      padding: '0 18px',
      borderRadius: 18,
      background: destaque ? 'rgba(124,92,255,0.16)' : 'rgba(255,255,255,0.03)',
      border: `2px solid ${destaque ? 'rgba(124,92,255,0.45)' : C.line}`,
      marginTop: 12,
    },
    h(
      'div',
      { width: 40, height: 40, borderRadius: 20, background: C.surface3, border: `3px solid ${C.brand2}`, alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 20, color: C.brand2 },
      '?',
    ),
    h('div', { marginLeft: 16, width: largura, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.18)' }),
    h('div', { flexGrow: 1 }),
    h(
      'div',
      { alignItems: 'center', fontSize: 19, fontWeight: 700, color: C.brand2 },
      { type: 'img', props: { src: CHECK_URI, width: 22, height: 22, style: { width: 22, height: 22, marginRight: 8 } } },
      'cravou',
    ),
  );
}

/** Ilustração neutra: "Meu desafio" com três participantes que cravaram (sem números). */
function ilustracao(): No {
  return h(
    'div',
    {
      position: 'absolute',
      left: 676,
      top: 118,
      width: 460,
      height: 394,
      borderRadius: 32,
      background: C.surface,
      border: `2px solid ${C.line}`,
      flexDirection: 'column',
      padding: '30px 30px 28px',
    },
    h('div', { fontSize: 18, fontWeight: 700, color: C.subtle, letterSpacing: 2.5 }, 'MEU DESAFIO'),
    linha(150, true),
    linha(118, false),
    linha(170, false),
    h('div', { flexGrow: 1 }),
    h('div', { fontSize: 19, color: C.muted, lineHeight: 1.3 }, 'Os números saem com o resultado oficial'),
  );
}

/** Cartão genérico do desafio (sem candidato, sem número, sem apelido, sem resultado). */
export function layoutDesafio(): No {
  return fundo(
    h(
      'div',
      { flexDirection: 'column', padding: '56px 64px', width: 640, height: OG_H },
      marca(),
      h('div', { fontSize: 22, fontWeight: 600, color: C.brand2, letterSpacing: 3, marginTop: 52 }, 'DESAFIO DO PALPITE · 2º TURNO'),
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 80, color: C.fg, letterSpacing: -3, lineHeight: 1, marginTop: 10 }, 'Quem chega mais perto?'),
      h(
        'div',
        { fontSize: 27, color: C.muted, marginTop: 20, lineHeight: 1.35, maxWidth: 560 },
        // texto que vale em todas as fases (a imagem fica 24 h na CDN): antes do prazo, no dia da votação e depois
        'Desafio do palpite entre amigos. O ranking do grupo sai com o resultado oficial do TSE.',
      ),
      h(
        'div',
        { marginTop: 24, alignSelf: 'flex-start', alignItems: 'center', padding: '10px 20px', borderRadius: 999, background: 'rgba(124,92,255,0.16)', border: '2px solid rgba(124,92,255,0.45)', color: C.fg, fontSize: 21, fontWeight: 700 },
        'Sem dinheiro, só pela graça',
      ),
    ),
    ilustracao(),
  );
}

export interface DepsOgDesafio {
  log?: Pick<Logger, 'info'>;
}

type App = Hono<{ Bindings: HttpBindings }>;

/** Registra `/api/og/desafio.png` (1 linha em og-rotas.ts). Uma imagem só, gerada no primeiro pedido. */
export function registrarOgDesafio(app: App, d: DepsOgDesafio = {}): void {
  let memo: Promise<Buffer> | null = null;
  app.get(ROTA_OG_DESAFIO, async (c) => {
    if (!memo) {
      const t0 = performance.now();
      const pr = renderPng(layoutDesafio());
      memo = pr;
      pr.then(
        (png) => d.log?.info(`OG desafio gerada em ${Math.round(performance.now() - t0)} ms (${Math.round(png.length / 1024)} KB)`),
        () => {
          if (memo === pr) memo = null;
        },
      );
    }
    const png = await memo;
    const headers = {
      'content-type': 'image/png',
      'cache-control': CC_OG_DESAFIO,
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
    };
    if (c.req.method === 'HEAD') return c.body(null, 200, headers);
    return c.body(new Uint8Array(png.buffer as ArrayBuffer, png.byteOffset, png.byteLength), 200, headers);
  });
}
