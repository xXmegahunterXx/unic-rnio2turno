/**
 * Rotas de crescimento (ARCHITECTURE §11.12): audiência real agregada, "Siga o Sintonia" e pedidos de anunciantes.
 * Registradas por `registrarCrescimento(app, admin, deps)` (2 linhas em app.ts, antes do 404 de /api/* e de
 * `app.route('/api/admin', admin)`).
 *
 * Públicas:
 *  - `POST /api/audiencia`   sinal do app (página vista / presença), corpo text/plain ou JSON ≤ 512 B, só do próprio
 *                            site; responde `{ s }` (próximo sinal de presença) — nunca é guardado em cache;
 *  - `GET  /api/divulgacao`  redes do Sintonia + números medidos (só com "Mostrar audiência na /anuncie" ligado);
 *                            `public, max-age=120, s-maxage=60` + ETag (pode entrar na Regra 1 da Cloudflare);
 *  - `POST /api/anuncie/lead` formulário "Quero anunciar" (JSON ≤ 8 KB, só do próprio site).
 * Painel (sessão + CSRF do admin): `/api/admin/audiencia` (GET; POST { acao: 'zerar' }), `/api/admin/divulgacao`
 * (GET; POST { redes?, mostrarAudiencia? }) e `/api/admin/leads` (GET; POST ComandoLead).
 *
 * Persistência: STATE_DIR/audiencia.json (a cada 60 s e no encerramento — main.ts), leads.json e divulgacao.json (a
 * cada mudança). Sem os stores (testes), tudo fica em memória.
 */
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { HttpBindings } from '@hono/node-server';
import { z } from 'zod';
import { validaRedes, type DivulgacaoConfig, type DivulgacaoPublica } from '../shared/audiencia';
import type { ComandoLead, RespostaLead } from '../shared/leads';
import { Audiencia } from './audiencia';
import { casaEtag, etagFraco, hashCurto } from './http-cache';
import { Leads } from './leads';
import type { Logger } from './log';
import type { JsonStore } from './state-store';

type Ctx = Context<{ Bindings: HttpBindings }>;
type App = Hono<{ Bindings: HttpBindings }>;

const CC_PRIVADO = 'no-store';
/** `GET /api/divulgacao`: o navegador guarda 2 min, a CDN 1 min (mudança no painel aparece em até ~3 min). */
export const CC_DIVULGACAO = 'public, max-age=120, s-maxage=60';

/** Stores de STATE_DIR (main.ts). */
export interface StoresCrescimento {
  audiencia?: JsonStore | null;
  leads?: JsonStore | null;
  divulgacao?: JsonStore | null;
}

export interface DepsCrescimento {
  now: () => number;
  log: Logger;
  /** chave anonimizada da rede do cliente (hash com sal; nunca o IP) */
  clienteDe: (c: Ctx) => string;
  /** rede LARGA (IPv6 /56) para a audiência vendável e os pedidos de anunciantes; padrão = clienteDe */
  redeLargaDe?: (c: Ctx) => string;
  /** pedido do próprio site (Origin/Referer/Sec-Fetch-Site) */
  origemPermitida: (c: Ctx) => boolean;
  /** estimativa que o servidor já tinha (Metricas.pessoasAgora) */
  pessoasAgora: () => number;
  stores?: StoresCrescimento;
  /**
   * Motivo de o formulário "Quero anunciar" estar FECHADO agora (null = aberto). Em produção, fechado enquanto não houver
   * e-mail de privacidade configurado no painel (Comunicação → Contatos públicos): é o canal para retirar o
   * consentimento (LGPD art. 18) — a mesma regra que fecha o formulário no app.
   */
  formularioFechado?: () => string | null;
}

/** Configuração do painel: redes do Sintonia e o interruptor da audiência na /anuncie (padrão: desligado). */
export class Divulgacao {
  private cfg: DivulgacaoConfig = { redes: {}, mostrarAudiencia: false };
  /** muda a cada alteração (ETag do GET público) */
  versao = 0;

  constructor(private readonly store: JsonStore | null = null) {
    const salvo = store?.ler();
    if (salvo && typeof salvo === 'object') {
      const s = salvo as Partial<DivulgacaoConfig>;
      const r = validaRedes(s.redes);
      this.cfg = { redes: 'ok' in r ? r.ok : {}, mostrarAudiencia: s.mostrarAudiencia === true };
    }
  }

  get config(): DivulgacaoConfig {
    return { redes: { ...this.cfg.redes }, mostrarAudiencia: this.cfg.mostrarAudiencia };
  }

  /** Aplica uma mudança do painel (validada). */
  aplicar(m: { redes?: unknown; mostrarAudiencia?: unknown }): { ok: true } | { ok: false; erro: string } {
    const novo = this.config;
    if (m.redes !== undefined) {
      const r = validaRedes(m.redes);
      if ('erro' in r) return { ok: false, erro: r.erro };
      novo.redes = r.ok;
    }
    if (m.mostrarAudiencia !== undefined) {
      if (typeof m.mostrarAudiencia !== 'boolean') return { ok: false, erro: 'mostrarAudiencia: verdadeiro ou falso.' };
      novo.mostrarAudiencia = m.mostrarAudiencia;
    }
    this.cfg = novo;
    this.versao++;
    this.store?.salvar(this.config);
    return { ok: true };
  }

  async persistir(): Promise<void> {
    await this.store?.flush();
  }
}

const comandoLeadSchema = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('respondido'), id: z.string().regex(/^[a-f0-9]{6,32}$/), valor: z.boolean() }),
  z.object({ acao: z.literal('apagar'), id: z.string().regex(/^[a-f0-9]{6,32}$/) }),
]);

const comandoDivulgacaoSchema = z
  .object({ redes: z.record(z.string(), z.union([z.string().max(400), z.null()])).optional(), mostrarAudiencia: z.boolean().optional() })
  .strict();

const comandoAudienciaSchema = z.object({ acao: z.literal('zerar') }).strict();

const erroJson = (c: Ctx, status: number, erro: string, extra: Record<string, unknown> = {}) =>
  c.json({ ok: false, erro, ...extra }, status as 400, { 'cache-control': CC_PRIVADO });

const limite = (bytes: number) =>
  bodyLimit({ maxSize: bytes, onError: (c) => c.json({ ok: false, erro: 'Corpo grande demais.' }, 413, { 'cache-control': CC_PRIVADO }) });

/** JSON do painel (415/400 com mensagem). */
async function jsonAdmin(c: Ctx): Promise<unknown | Response> {
  const ct = c.req.header('content-type') ?? '';
  if (!/^application\/json\b/i.test(ct)) return c.json({ erro: 'Envie o corpo como application/json.' }, 415);
  try {
    return await c.req.json();
  } catch {
    return c.json({ erro: 'JSON inválido no corpo da requisição.' }, 400);
  }
}

export function registrarCrescimento(app: App, admin: App, deps: DepsCrescimento) {
  const { log } = deps;
  const audiencia = new Audiencia({ now: deps.now, pessoasServidor: deps.pessoasAgora, store: deps.stores?.audiencia ?? null });
  const leads = new Leads({ now: deps.now, store: deps.stores?.leads ?? null });
  const divulgacao = new Divulgacao(deps.stores?.divulgacao ?? null);

  // ---- públicas -----------------------------------------------------------------------------------------------

  /**
   * Sinal do app. Outro site → 403; sem `Sec-Fetch-Site: same-origin` (fora do navegador, ou navegador antigo) → aceito
   * sem contar (a medição fica menor, nunca maior). O corpo é text/plain (sem preflight) ou JSON.
   */
  app.post('/api/audiencia', limite(512), async (c) => {
    if (!deps.origemPermitida(c)) return erroJson(c, 403, 'Origem não permitida.');
    const ct = c.req.header('content-type') ?? '';
    if (ct && !/^(application\/json|text\/plain)\b/i.test(ct)) return erroJson(c, 415, 'Envie o sinal em JSON.');
    let corpo: unknown;
    try {
      corpo = JSON.parse(await c.req.text());
    } catch {
      return erroJson(c, 400, 'Sinal inválido.');
    }
    const doSite = c.req.header('sec-fetch-site') === 'same-origin';
    const r = doSite ? audiencia.sinal((deps.redeLargaDe ?? deps.clienteDe)(c), c.req.header('user-agent'), corpo) : { s: audiencia.intervaloS };
    if (!r) return erroJson(c, 400, 'Sinal inválido.');
    return c.json(r, 200, { 'cache-control': CC_PRIVADO });
  });

  /** Redes do Sintonia e, se o painel deixar, os números medidos. */
  app.get('/api/divulgacao', (c) => {
    const cfg = divulgacao.config;
    const corpo: DivulgacaoPublica = { redes: cfg.redes, audiencia: cfg.mostrarAudiencia ? audiencia.publico() : null };
    const texto = JSON.stringify(corpo);
    const etag = etagFraco('div', hashCurto(texto));
    const headers: Record<string, string> = { 'cache-control': CC_DIVULGACAO, etag, vary: 'Accept-Encoding', 'x-robots-tag': 'noindex' };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    const h = { ...headers, 'content-type': 'application/json; charset=utf-8' };
    return c.req.method === 'HEAD' ? c.body(null, 200, h) : c.body(texto, 200, h);
  });

  /** Formulário "Quero anunciar". */
  app.post('/api/anuncie/lead', limite(8192), async (c) => {
    // navegador manda Origin (e Sec-Fetch-Site) em todo POST: sem eles não é o formulário do site
    const sfs = c.req.header('sec-fetch-site');
    if (!deps.origemPermitida(c) || (sfs ? sfs !== 'same-origin' : !c.req.header('origin'))) return erroJson(c, 403, 'Origem não permitida.');
    const ct = c.req.header('content-type') ?? '';
    if (!/^application\/json\b/i.test(ct)) return erroJson(c, 415, 'Envie o formulário em JSON.');
    const fechado = deps.formularioFechado?.() ?? null;
    if (fechado) return erroJson(c, 503, fechado);
    let corpo: unknown;
    try {
      corpo = await c.req.json();
    } catch {
      return erroJson(c, 400, 'Formulário inválido.');
    }
    const r = leads.receber(corpo, (deps.redeLargaDe ?? deps.clienteDe)(c));
    if (!r.ok) {
      const headers: Record<string, string> = { 'cache-control': CC_PRIVADO };
      if (r.esperaS) headers['retry-after'] = String(r.esperaS);
      return c.json({ ok: false, erro: r.erro, ...(r.campo ? { campo: r.campo } : {}) } satisfies RespostaLead, r.status as 400, headers);
    }
    // só o fato, nunca o conteúdo
    if (r.guardado) log.info(`Anuncie: novo pedido de contato (${leads.novos()} sem resposta)`);
    return c.json({ ok: true } satisfies RespostaLead, 200, { 'cache-control': CC_PRIVADO });
  });

  // ---- painel -------------------------------------------------------------------------------------------------

  admin.get('/audiencia', (c) => c.json(audiencia.paraAdmin()));
  admin.post('/audiencia', async (c) => {
    const b = await jsonAdmin(c);
    if (b instanceof Response) return b;
    if (!comandoAudienciaSchema.safeParse(b).success) return c.json({ erro: 'Comando inválido.' }, 400);
    audiencia.zerar();
    await audiencia.persistir();
    log.info('Admin: audiência — medição zerada');
    return c.json(audiencia.paraAdmin());
  });

  admin.get('/divulgacao', (c) => c.json(divulgacao.config));
  admin.post('/divulgacao', async (c) => {
    const b = await jsonAdmin(c);
    if (b instanceof Response) return b;
    const p = comandoDivulgacaoSchema.safeParse(b);
    if (!p.success) return c.json({ erro: 'Configuração inválida.' }, 400);
    const r = divulgacao.aplicar(p.data);
    if (!r.ok) return c.json({ erro: r.erro }, 400);
    const cfg = divulgacao.config;
    log.info(`Admin: divulgação — ${Object.keys(cfg.redes).length} rede(s), audiência na /anuncie ${cfg.mostrarAudiencia ? 'ligada' : 'desligada'}`);
    return c.json(cfg);
  });

  admin.get('/leads', (c) => c.json(leads.paraAdmin()));
  admin.post('/leads', async (c) => {
    const b = await jsonAdmin(c);
    if (b instanceof Response) return b;
    const p = comandoLeadSchema.safeParse(b);
    if (!p.success) return c.json({ erro: 'Comando inválido.' }, 400);
    const r = leads.comando(p.data satisfies ComandoLead);
    if (!r.ok) return c.json({ erro: r.erro }, 404);
    log.info(`Admin: interessados — ${r.log}`);
    return c.json(leads.paraAdmin());
  });

  return {
    audiencia,
    leads,
    divulgacao,
    /** liga a amostragem do pico (a cada 10 s) */
    iniciar: () => audiencia.iniciar(),
    parar: () => audiencia.parar(),
    /** grava o que estiver pendente (main.ts: a cada 60 s e no encerramento) */
    persistir: async () => {
      await Promise.all([audiencia.persistir(), leads.persistir(), divulgacao.persistir()]);
    },
  };
}

export type Crescimento = ReturnType<typeof registrarCrescimento>;
