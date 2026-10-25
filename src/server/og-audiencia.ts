/**
 * Imagem do marco de audiência da noite (I26, aba "Postar" do painel): "Mais de 50 mil pessoas acompanham a apuração
 * no Sintonia agora". GENÉRICA: sem candidato (nome, foto, número de urna, cor), sem placar e sem anúncio — só a marca
 * do Sintonia, o marco e o domínio. Serve para o dono postar quando a audiência passa de 10, 50 ou 100 mil pessoas.
 *
 * O número NUNCA vem da URL: vem do servidor (`pessoas()`, o MESMO "pessoas agora" público do status — some abaixo do
 * piso de 500 ou com a chave 'contador-publico' desligada) e é arredondado PARA BAIXO ao marco (`marcoAtingido`). O
 * `?m=` só pode baixar o marco (o cartão do painel pede o dele; se o servidor contar menos, sai o que ele contar):
 * ninguém fabrica "1 milhão de pessoas" mudando o endereço. Abaixo do 1º marco (ou sem número, ou com `?m=0`), sai o
 * convite genérico "Apuração ao vivo", sem número.
 *
 * Formatos (`?formato=`): og 1200×630 (padrão), x 1200×675 e story 1080×1920 (Status/Stories).
 * Cache: em memória, uma imagem por (marco, formato) — no máximo 12, cada uma gerada uma vez; HTTP com 60 s
 * (`CC_OG_AUDIENCIA`; borda da Cloudflare com `stale-if-error`). Ligação no servidor: `registrarOgAudiencia` (A2).
 */
import type { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import type { Logger } from './log';
import { C, LOGO_URI, OG_H, OG_W, h, renderPng, type No } from './og';
import { cabecalhosCache } from './http-cache';
import { fmtInt } from '../shared/format';

export const ROTA_OG_AUDIENCIA = '/api/og/audiencia.png';
/** Navegador e borda: 60 s (o "pessoas agora" muda; o marco, raramente). */
export const CC_OG_AUDIENCIA = 'public, max-age=60, s-maxage=60, stale-while-revalidate=60';
/** Borda da Cloudflare (I04): mesmo TTL e a imagem pronta continua saindo se a origem cair. */
export const CC_OG_AUDIENCIA_BORDA = 'max-age=60, stale-while-revalidate=60, stale-if-error=600';

/** Marcos da noite (pessoas ao mesmo tempo). O mesmo de `MARCOS_AUDIENCIA` em src/app/components/pages/admin/postar.ts. */
export const MARCOS_AUDIENCIA = [10_000, 50_000, 100_000] as const;
export type MarcoAudiencia = (typeof MARCOS_AUDIENCIA)[number];

export type FormatoOgAudiencia = 'og' | 'x' | 'story';
export const DIM_OG_AUDIENCIA: Record<FormatoOgAudiencia, { w: number; h: number }> = {
  og: { w: OG_W, h: OG_H },
  x: { w: 1200, h: 675 },
  story: { w: 1080, h: 1920 },
};

/** Maior marco atingido por `n` (arredondado PARA BAIXO), ou null abaixo do 1º / sem número. Puro. */
export function marcoAtingido(n: number | null | undefined): MarcoAudiencia | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  let m: MarcoAudiencia | null = null;
  for (const x of MARCOS_AUDIENCIA) if (n >= x) m = x;
  return m;
}

/**
 * Marco exibido: o do servidor, no máximo o pedido em `?m=` (que só pode baixar). `?m=0` = convite sem número (o
 * cartão "Convite" da aba Postar). `pedido` fora da lista = ignorado. Puro (testado: a URL nunca aumenta o número).
 */
export function marcoExibido(nServidor: number | null | undefined, pedido: string | null | undefined): MarcoAudiencia | null {
  if (pedido === '0') return null;
  const doServidor = marcoAtingido(nServidor);
  const p = Number(pedido);
  const pedidoValido = (MARCOS_AUDIENCIA as readonly number[]).includes(p) ? (p as MarcoAudiencia) : null;
  if (doServidor === null || pedidoValido === null) return doServidor;
  return pedidoValido <= doServidor ? pedidoValido : doServidor;
}

/** "10 mil", "50 mil", "100 mil". */
const rotuloMarco = (m: number) => `${fmtInt(m / 1000)} mil`;

/** Textos da imagem (testados: sem candidato nem placar). */
export function textosAudiencia(marco: MarcoAudiencia | null): { sobrancelha: string; titulo: string; linha: string } {
  if (marco === null) return { sobrancelha: 'ELEIÇÕES 2026 · 2º TURNO', titulo: 'Apuração ao vivo', linha: 'Do Brasil inteiro até a sua seção, com os dados oficiais do TSE.' };
  return { sobrancelha: 'AGORA NO SINTONIA', titulo: `Mais de ${rotuloMarco(marco)} pessoas`, linha: 'acompanham a apuração do 2º turno, seção por seção.' };
}

/** Layout genérico (satori) no formato pedido. */
export function layoutAudiencia(marco: MarcoAudiencia | null, formato: FormatoOgAudiencia = 'og', dominio = 'sintonia2026.com.br'): No {
  const { w, h: alt } = DIM_OG_AUDIENCIA[formato];
  const story = formato === 'story';
  const k = story ? 1.5 : 1;
  const t = textosAudiencia(marco);
  // ondas concêntricas nas cores da marca (nunca as dos candidatos): "muita gente junta", sem número de candidato
  const anel = (d: number, alfa: number) =>
    h('div', {
      position: 'absolute',
      left: w - (story ? w / 2 : 300) - d / 2,
      top: (story ? alt * 0.7 : alt / 2) - d / 2,
      width: d,
      height: d,
      borderRadius: d / 2,
      border: `${Math.round(3 * k)}px solid rgba(196,168,255,${alfa})`,
    });
  return h(
    'div',
    {
      width: w,
      height: alt,
      flexDirection: 'column',
      background: C.bg,
      backgroundImage: 'radial-gradient(circle at 18% 0%, rgba(124,92,255,0.34) 0%, rgba(124,92,255,0.08) 38%, rgba(9,9,15,0) 70%)',
      color: C.fg,
      fontFamily: 'Inter',
      position: 'relative',
      overflow: 'hidden',
    },
    anel(story ? 820 : 520, 0.1),
    anel(story ? 600 : 380, 0.16),
    anel(story ? 380 : 240, 0.24),
    h('div', {
      position: 'absolute',
      left: w - (story ? w / 2 : 300) - 60 * k,
      top: (story ? alt * 0.7 : alt / 2) - 60 * k,
      width: 120 * k,
      height: 120 * k,
      borderRadius: 60 * k,
      background: C.brand,
    }),
    h(
      'div',
      { flexDirection: 'column', padding: story ? '120px 84px' : '56px 64px', width: story ? w : 720, height: story ? alt * 0.55 : alt },
      h(
        'div',
        { alignItems: 'center', gap: 16 * k },
        { type: 'img', props: { src: LOGO_URI, width: 52 * k, height: 52 * k, style: { width: 52 * k, height: 52 * k } } },
        h('div', { fontFamily: 'Bricolage', fontWeight: 700, fontSize: 36 * k, color: C.fg, letterSpacing: -1 }, 'Sintonia'),
      ),
      h('div', { fontSize: 22 * k, fontWeight: 600, color: C.brand2, letterSpacing: 3, marginTop: story ? 140 : 64 }, t.sobrancelha),
      h(
        'div',
        { fontFamily: 'Bricolage', fontWeight: 800, fontSize: (marco === null ? 88 : 80) * k, color: C.fg, letterSpacing: -3, lineHeight: 1.02, marginTop: 12 * k },
        t.titulo,
      ),
      h('div', { fontSize: 30 * k, color: C.muted, marginTop: 22 * k, lineHeight: 1.35, maxWidth: story ? 900 : 600 }, t.linha),
    ),
    h(
      'div',
      { position: 'absolute', left: story ? 84 : 64, bottom: story ? 120 : 44, fontSize: 24 * k, fontWeight: 700, color: C.fg, letterSpacing: -0.3 },
      dominio.replace(/^www\./, ''),
    ),
  );
}

export interface DepsOgAudiencia {
  /**
   * "Pessoas agora" PÚBLICO do servidor (o mesmo do status: undefined abaixo do piso ou com 'contador-publico' em off).
   * Em app.ts: `() => pessoasPublico(noite())`.
   */
  pessoas: () => number | undefined;
  /** Domínio exibido (ex.: "sintonia2026.com.br"); null = o padrão. */
  dominio?: string | null;
  /** Cabeçalho da borda da Cloudflare (I04; `CDN_CC=0` → false). Ausente = ligado. */
  borda?: boolean;
  log?: Pick<Logger, 'info'>;
}

type App = Hono<{ Bindings: HttpBindings }>;

/** `?formato=`: og (padrão), x ou story; qualquer outra coisa vira og. */
export function formatoAudiencia(v: string | null | undefined): FormatoOgAudiencia {
  return v === 'x' || v === 'story' ? v : 'og';
}

/** Imagens prontas, por (marco, formato, domínio): no máximo 4 marcos × 3 formatos por domínio, cada uma gerada uma vez. */
const memoImagens = new Map<string, Promise<Buffer>>();

/** PNG do marco (null = o convite genérico "Apuração ao vivo", sem número nem candidato), gerado uma vez. */
export function pngAudiencia(
  marco: MarcoAudiencia | null,
  formato: FormatoOgAudiencia = 'og',
  dominio = 'sintonia2026.com.br',
  log?: Pick<Logger, 'info'>,
): Promise<Buffer> {
  const chave = `${marco ?? 0}|${formato}|${dominio}`;
  let pr = memoImagens.get(chave);
  if (!pr) {
    const t0 = performance.now();
    const { w, h: alt } = DIM_OG_AUDIENCIA[formato];
    pr = renderPng(layoutAudiencia(marco, formato, dominio), w, alt);
    memoImagens.set(chave, pr);
    pr.then(
      (png) => log?.info(`OG audiência ${marco ?? 0}|${formato} gerada em ${Math.round(performance.now() - t0)} ms (${Math.round(png.length / 1024)} KB)`),
      () => memoImagens.delete(chave),
    );
  }
  return pr;
}

/**
 * O convite genérico (o mesmo de `?m=0`): é a prévia do dia da votação (0h–19h de 25/10) nas meta tags e o que as rotas
 * de imagem com candidato respondem nesse intervalo (og-rotas.ts).
 */
export const pngConvite = (formato: FormatoOgAudiencia = 'og', dominio = 'sintonia2026.com.br', log?: Pick<Logger, 'info'>) =>
  pngAudiencia(null, formato, dominio, log);

/** Registra `/api/og/audiencia.png` (1 import + 1 linha em app.ts, frente A2). */
export function registrarOgAudiencia(app: App, d: DepsOgAudiencia): void {
  const dominio = d.dominio || 'sintonia2026.com.br';
  app.get(ROTA_OG_AUDIENCIA, async (c) => {
    const formato = formatoAudiencia(c.req.query('formato'));
    const marco = marcoExibido(d.pessoas(), c.req.query('m'));
    const png = await pngAudiencia(marco, formato, dominio, d.log);
    const headers = {
      'content-type': 'image/png',
      ...cabecalhosCache(CC_OG_AUDIENCIA, CC_OG_AUDIENCIA_BORDA, d.borda !== false),
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
      'content-disposition': `inline; filename="sintonia-audiencia-${marco ?? 'ao-vivo'}-${formato}.png"`,
    };
    if (c.req.method === 'HEAD') return c.body(null, 200, headers);
    return c.body(new Uint8Array(png.buffer as ArrayBuffer, png.byteOffset, png.byteLength), 200, headers);
  });
}
