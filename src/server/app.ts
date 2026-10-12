/**
 * Aplicação Hono (sem I/O de subida): API pública, admin, OG images, estáticos + meta tags e /healthz.
 * `main.ts` monta as dependências (dataset, controller, persistência) e sobe o servidor; os testes usam
 * `createApp(...).app.request(...)` diretamente.
 *
 * Contrato das rotas: src/shared/api.ts. Cache para CDN: ARCHITECTURE.md §6.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { HttpBindings } from '@hono/node-server';
import type { AdminCommand, MetricasServidor, ServidorInfo } from '../shared/api';
import type { AdminMetrics, LiveStatus, Race, RaceId, Summary, TseConfig, UF } from '../shared/types';
import { UFS } from '../shared/types';
import type { MunicipiosBr } from '../shared/dataset';
import type { LoadedDataset, Controller } from '../engine/api';
import { NotFoundError } from '../engine/api';
import { COOKIE_SESSAO, LimiteTaxa, Sessoes, chaveCliente, senhaConfere } from './auth';
import { motivoSemSimulacao, type ServerConfig } from './config';
import { Dados, type InstanteNormalizado, type NivelApuracao } from './dados';
import { PacotesFotos } from './fotos';
import {
  CacheRespostas,
  type CorpoPronto,
  casaEtag,
  corpoCodificado,
  etagFraco,
  hashCurto,
  negociar,
} from './http-cache';
import { caminhoParaLog, msgErro, type Logger } from './log';
import { AVISO_AGUARDANDO_TSE, AgendadorTse } from './troca-auto';
import { consultaNormalizada, injetarMeta, metaDaRota, type ContextoMeta } from './meta-tags';
import { MAX_CODIGO, calcularCenario, codificarCenario, decodificarCenario, placarCenarioTexto } from '../shared/cenarios';
import { Metricas } from './metrics';
import { CC_OG, registrarOg } from './og-rotas';
import { ServicoOg } from './og-servico';
import { DadosEstaticos } from './dados-estaticos';
import { anonimizarRace } from '../shared/anon';
import { Estaticos, pareceArquivo } from './static';
import type { TseManager } from './tse';
import {
  ErroValidacao,
  loginSchema,
  parseAdminCommand,
  parseCodMunicipio,
  parseInstante,
  parseNumero,
  parseRace,
  parseUf,
  parseVersaoUrl,
} from './validation';

export interface AppDeps {
  config: ServerConfig;
  dataset: LoadedDataset;
  controller: Controller;
  tse: TseManager;
  log: Logger;
  now?: () => number;
  /** Conferência do feed antes da troca automática (testes); padrão: `tse.testar`. */
  verificarTse?: (tse: TseConfig) => Promise<{ ok: boolean; detalhe: string }>;
}

/** Permissions-Policy das páginas: nada de câmera, microfone, localização, pagamentos, USB nem "tópicos" de anúncio. */
export const PERMISSOES = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()';

/** Cache-Control por tipo de rota (ARCHITECTURE.md §6). */
export const CC = {
  status: 'public, max-age=0, s-maxage=1',
  meta: 'public, max-age=60, s-maxage=300',
  snapshot: 'public, max-age=0, s-maxage=2, stale-while-revalidate=10',
  /** 1º turno: resultado final, não muda */
  t1: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  /**
   * "Reveja a noite": instante passado consolidado COM a versão do admin na URL (`&v=`): o passado não muda,
   * e qualquer mudança de cenário/fonte troca a versão — logo, a URL.
   */
  historico: 'public, max-age=600, s-maxage=3600, stale-while-revalidate=600',
  /** instante passado consolidado sem `v` (ou com `v` antiga): a CDN guarda pouco */
  historicoSemVersao: 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
  /** logo do patrocínio com o hash do conteúdo na URL */
  imutavel: 'public, max-age=86400, s-maxage=86400, immutable',
  og: CC_OG.vivo,
  /** imagens de dado oficial/real (cargos, ficha, curiosidades, cenários, 1º turno) */
  ogEstatica: CC_OG.estatica,
  ogTeste: CC_OG.teste,
  html: 'no-cache',
  privado: 'no-store',
} as const;

type Ctx = Context<{ Bindings: HttpBindings }>;

export const ROBOTS_TXT = ['User-agent: *', 'Allow: /api/og/', 'Disallow: /api/', 'Disallow: /admin', ''].join('\n');

/** robots.txt com o endereço do sitemap (absoluto, como o protocolo exige). */
export const robotsTxt = (origem: string) => `${ROBOTS_TXT}\nSitemap: ${origem}/sitemap.xml\n`;

/** Páginas públicas indexáveis (sitemap.xml): [caminho, changefreq, prioridade]. */
export function rotasSitemap(): [string, string, string][] {
  const ufs = UFS.map((u) => u.toLowerCase());
  return [
    ['/', 'hourly', '1.0'],
    ['/apuracao', 'hourly', '0.9'],
    ...ufs.map((u): [string, string, string] => [`/apuracao/${u}`, 'hourly', '0.7']),
    ['/governadores', 'hourly', '0.8'],
    ['/teste', 'weekly', '0.9'],
    ['/curiosidades', 'weekly', '0.7'],
    ['/cenarios', 'weekly', '0.7'],
    ['/senado', 'weekly', '0.6'],
    ['/camara', 'weekly', '0.6'],
    ['/assembleias', 'weekly', '0.5'],
    ...ufs.map((u): [string, string, string] => [`/assembleias/${u}`, 'weekly', '0.4']),
    ['/metodologia', 'monthly', '0.4'],
    ['/sobre', 'monthly', '0.3'],
    ['/privacidade', 'monthly', '0.3'],
  ];
}

export function sitemapXml(origem: string, lastmod?: string): string {
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const urls = rotasSitemap().map(
    ([p, f, pr]) =>
      `  <url><loc>${esc(origem + p)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>${f}</changefreq><priority>${pr}</priority></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** Tamanho máximo da URL (caminho + query). Maior → 414. */
export const MAX_URL = 8192;
/** Corpo máximo de qualquer requisição (o admin tem limites menores por rota). */
export const MAX_CORPO = 512 * 1024;

/**
 * Content-Security-Policy das páginas: scripts só do próprio site + os scripts inline do index.html autorizados pelo
 * hash (tema e pré-carregamento); estilos inline (atributos style do React/framer-motion); imagens de qualquer https
 * (logo de patrocínio por URL) e data:/blob: (cartões de compartilhar); nada de plugins; `frame-ancestors` 'self' (ou *
 * nos widgets /embed/*).
 */
export function cspPagina(template: string, embed: boolean): string {
  const hashes: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(template); m; m = re.exec(template)) {
    if (/\bsrc\s*=/.test(m[1]) || !m[2].trim()) continue;
    if (/\btype\s*=\s*["']?(application\/(ld\+)?json)/i.test(m[1])) continue;
    hashes.push(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
  return [
    "default-src 'self'",
    `script-src 'self'${hashes.length ? ` ${hashes.join(' ')}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${embed ? '*' : "'self'"}`,
  ].join('; ');
}

/** Rotas "quentes" (polling e estáticos): log por amostragem. */
const ehQuente = (p: string) =>
  p === '/api/status' || p.startsWith('/api/apuracao/') || p.startsWith('/assets/') || p.startsWith('/data/') || p.startsWith('/geo/');

/** Host (com porta) bem formado; o resto vira null (não entra em URL absoluta nem no cache). */
const hostValido = (h: string | undefined | null): string | null =>
  h && h.length <= 255 && /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:.]+\](:\d{1,5})?$/i.test(h) ? h.toLowerCase() : null;

/** IP plausível (v4/v6), até 64 caracteres. */
const ipValido = (v: string | undefined | null): string | null => {
  const x = v?.trim();
  return x && x.length <= 64 && /^[0-9a-f:.]+$/i.test(x) ? x : null;
};

/** Erro HTTP com corpo `{ erro }`. */
class ErroHttp extends Error {
  constructor(
    readonly status: number,
    msg: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(msg);
  }
}

const perf = () => performance.now();

/** Buffer → Uint8Array sem cópia (o node-server envia Uint8Array direto, sem stream). */
const u8 = (b: Buffer) => new Uint8Array(b.buffer as ArrayBuffer, b.byteOffset, b.byteLength);

/** Resposta com corpo binário opcional (HEAD/304 → null). */
function responder(c: Context, body: Buffer | null, status: number, headers: Record<string, string>): Response {
  return body === null ? c.body(null, status as 200, headers) : c.body(u8(body), status as 200, headers);
}

export function createApp(deps: AppDeps) {
  const { config, controller, log } = deps;
  const now = deps.now ?? Date.now;
  const app = new Hono<{ Bindings: HttpBindings }>();
  // ordem do mapa nacional por município (fonte 'tse'): a do dataset; senão DATA_DIR/municipios-br.json
  let ordemBrCache: { em: number; v: MunicipiosBr | null } | null = null;
  const ordemBr = (): MunicipiosBr | null => {
    if (deps.dataset.municipiosBr) return deps.dataset.municipiosBr;
    const t = now();
    if (ordemBrCache && (ordemBrCache.v || t - ordemBrCache.em < 60_000)) return ordemBrCache.v;
    let v: MunicipiosBr | null = null;
    try {
      const x = JSON.parse(readFileSync(join(config.dataDir, 'municipios-br.json'), 'utf8')) as MunicipiosBr;
      if (x && Array.isArray(x.uf) && Array.isArray(x.cod) && x.uf.length === x.cod.length) v = x;
    } catch {
      v = null;
    }
    ordemBrCache = { em: t, v };
    return v;
  };
  const dados = new Dados(controller, deps.tse, now, ordemBr);
  const fotos = new PacotesFotos(config.dataDir, now);
  const metricas = new Metricas(now);
  const respostas = new CacheRespostas(now);
  // a chave das sessões depende da senha: trocar ADMIN_PASSWORD invalida as sessões abertas
  const chaveSessao = createHmac('sha256', config.adminSecret)
    .update(`sessao|${createHash('sha256').update(config.adminPassword ?? '').digest('hex')}`)
    .digest();
  const sessoes = new Sessoes(chaveSessao, now, config.sessaoMs);
  const limiteLogin = new LimiteTaxa(10, 60_000, now);
  const limiteLoginGlobal = new LimiteTaxa(300, 60_000, now);
  const limiteOg = config.ogLimiteMin > 0 ? new LimiteTaxa(config.ogLimiteMin, 60_000, now) : null;
  let encerrando = false;
  const prefixoReq = randomBytes(3).toString('hex');
  let seqReq = 0;
  /** id de cada requisição em andamento (para o log de erro). */
  const idsReq = new WeakMap<Request, string>();
  const salCliente = randomBytes(16);
  const estaticos = config.serveStatic ? new Estaticos(config.distDir) : null;
  const races = new Map<string, Race>(controller.meta().races.map((r) => [r.id.toLowerCase(), r]));
  const nomes = new Map<string, string>();
  for (const [uf, d] of Object.entries(deps.dataset.ufs)) for (const m of d?.municipios ?? []) nomes.set(`${uf}|${m.cod}`, m.nome);
  const nomeMunicipio = (uf: UF, cod: string) => nomes.get(`${uf}|${cod}`);
  const dadosEstaticos = new DadosEstaticos(config.dataDir, now);
  // imagens OG: LRU de 256 PNGs / 64 MB, uma renderização por vez e no máximo 16 na fila
  // (o código de um cenário não vai para o log: é a hipótese de quem compartilhou)
  const servicoOg = new ServicoOg({ now, aoFalhar: (chave, err) => log.erro(`Falha ao gerar a imagem OG ${chave.startsWith('cen|') ? 'cen|…' : chave}`, err) });

  // ---- utilidades --------------------------------------------------------------------------------
  /**
   * IP do cliente (só para limites e contagem; nunca vai para o log). Com TRUST_PROXY: CF-Connecting-IP → Fly-Client-IP
   * → X-Real-IP (o Caddy do deploy calcula e manda só este) → o ÚLTIMO endereço do X-Forwarded-For (o que o proxy viu;
   * os anteriores podem ter sido forjados pelo cliente). Valores malformados são ignorados.
   */
  const ipDe = (c: Ctx): string => {
    if (config.trustProxy) {
      const xff = c.req.header('x-forwarded-for');
      const h =
        ipValido(c.req.header('cf-connecting-ip')) ??
        ipValido(c.req.header('fly-client-ip')) ??
        ipValido(c.req.header('x-real-ip')) ??
        (xff ? ipValido(xff.split(',').pop()) : null);
      if (h) return h;
    }
    return c.env?.incoming?.socket?.remoteAddress ?? 'desconhecido';
  };
  const clienteDe = (c: Ctx) => chaveCliente(ipDe(c), salCliente);

  /** Host da requisição (X-Forwarded-Host com TRUST_PROXY), validado; null se malformado. */
  const hostDe = (c: Ctx): string | null =>
    hostValido((config.trustProxy && c.req.header('x-forwarded-host')?.split(',')[0]?.trim()) || c.req.header('host') || new URL(c.req.url).host);

  const origemDe = (c: Ctx): string => {
    if (config.publicUrl) return config.publicUrl;
    const u = new URL(c.req.url);
    const xfp = config.trustProxy ? c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() : undefined;
    const proto = xfp === 'https' || xfp === 'http' ? xfp : u.protocol.replace(':', '');
    return `${proto}://${hostDe(c) ?? 'localhost'}`;
  };

  /**
   * CSRF do admin (além do cookie SameSite=Strict e do corpo só em JSON): pedido de navegador vindo de outro site é
   * recusado. Sec-Fetch-Site cross-site/same-site → não; Origin (ou Referer) precisa ser o próprio site (PUBLIC_URL ou o
   * Host da requisição; em dev, também localhost). Sem Origin e sem Referer = cliente fora do navegador (curl): passa,
   * porque CSRF só existe em navegador, e navegadores sempre mandam Origin num POST.
   */
  const origemPermitida = (c: Ctx): boolean => {
    const sfs = c.req.header('sec-fetch-site');
    if (sfs && sfs !== 'same-origin' && sfs !== 'none') return false;
    let o = c.req.header('origin');
    if (!o) {
      const ref = c.req.header('referer');
      if (!ref) return true;
      o = ref;
    }
    if (o === 'null') return false;
    let u: URL;
    try {
      u = new URL(o);
    } catch {
      return false;
    }
    if (config.publicUrl && u.origin === config.publicUrl) return true;
    const host = hostDe(c);
    if (host && u.host.toLowerCase() === host) return true;
    return !config.producao && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
  };

  const extraMetricas = (): Partial<AdminMetrics> => ({
    requisicoesUltimoMinuto: metricas.requisicoesUltimoMinuto(),
    clientesAtivosEstimados: metricas.clientes.estimar(),
    ultimoCalculoMs: Math.max(metricas.ultimoCalculoMs, controller.metrics().ultimoCalculoMs),
    log: log.recentes(50),
  });

  /** Responde JSON a partir de um corpo pronto (comprimido conforme Accept-Encoding). */
  const enviar = async (c: Ctx, corpo: CorpoPronto, headers: Record<string, string>, status = 200) => {
    const cod = negociar(c.req.header('accept-encoding'));
    const body = await corpoCodificado(corpo, cod);
    const h: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', vary: 'Accept-Encoding', ...headers };
    if (body !== corpo.bruto && cod) h['content-encoding'] = cod;
    return responder(c, c.req.method === 'HEAD' ? null : body, status, h);
  };

  const json = (c: Ctx, v: unknown, headers: Record<string, string>, status = 200) =>
    enviar(c, { bruto: Buffer.from(JSON.stringify(v)) }, headers, status);

  /** `?t=` validado (400 se malformado) e normalizado para a corrida/nível (ver Dados.instante). */
  const instanteDe = (c: Ctx, race: RaceId, nivel: NivelApuracao): InstanteNormalizado =>
    dados.instante(race, parseInstante(c.req.query('t')), nivel);

  /**
   * Snapshot com ETag fraco (versão, balde dos dados, rota), 304 e cache de resposta por segundo.
   * `rota` é a forma canônica (minúsculas, zeros à esquerda) — a mesma para URLs equivalentes.
   * Com instante passado (`inst.t`), o balde é o próprio instante; consolidado + `&v=<versão atual>` →
   * cache longo (CC.historico).
   */
  const snapshot = async (c: Ctx, race: RaceId, rota: string, inst: InstanteNormalizado, montar: () => Promise<unknown>) => {
    const r = dados.race(race);
    const st = dados.status();
    const passado = inst.t !== undefined;
    const etag = etagFraco(`v${st.versao}`, passado ? dados.baldeHistorico(race, inst) : dados.balde(race), hashCurto(rota));
    let cc: string = r.turno === 1 ? CC.t1 : CC.snapshot;
    if (passado && inst.consolidado) cc = parseVersaoUrl(c.req.query('v')) === st.versao ? CC.historico : CC.historicoSemVersao;
    const headers = {
      'cache-control': cc,
      etag,
      'access-control-allow-origin': '*',
    };
    if (casaEtag(c.req.header('if-none-match'), etag)) {
      return c.body(null, 304, { ...headers, vary: 'Accept-Encoding' });
    }
    const { p, hit } = respostas.obter(`${rota}|${etag}`, async () => {
      const t0 = perf();
      const v = await montar();
      const bruto = Buffer.from(JSON.stringify(v));
      metricas.ultimoCalculoMs = Math.round((perf() - t0) * 100) / 100;
      return { bruto };
    });
    metricas.cache(hit);
    return enviar(c, await p, headers);
  };

  const exigirJson = (c: Ctx) => {
    const ct = c.req.header('content-type') ?? '';
    if (!/^application\/json\b/i.test(ct)) throw new ErroHttp(415, 'Envie o corpo como application/json.');
  };

  const lerJson = async (c: Ctx): Promise<unknown> => {
    exigirJson(c);
    try {
      return await c.req.json();
    } catch {
      throw new ErroValidacao('JSON inválido no corpo da requisição.');
    }
  };

  // ---- troca automática 'pre' → 'tse' e travas de produção ----------------------------------------
  const agendador = new AgendadorTse({
    controller,
    sincronizar: (fonte, tse) => deps.tse.sincronizar(fonte, tse),
    verificar: deps.verificarTse ?? ((tse) => deps.tse.testar(tse)),
    habilitada: config.tseAuto,
    inicioPadrao: config.tseInicio,
    log,
    now,
  });
  const motivoSim = motivoSemSimulacao(config);
  /** Produção sem ALLOW_SIMULACAO: um estado salvo (ou adotado de outra instância) em simulação volta para 'pre'. */
  const aplicarTravas = (origem: string) => {
    if (motivoSim && controller.state().fonte === 'simulacao') {
      controller.command({ tipo: 'fonte', fonte: 'pre' });
      const st = controller.state();
      deps.tse.sincronizar(st.fonte, st.tse);
      log.aviso(`${origem}: fonte "simulacao" trocada por "pre" (produção sem ALLOW_SIMULACAO=1; versão ${st.versao})`);
    }
  };
  aplicarTravas('Subida');
  /** Comando que poria a simulação no ar (bloqueado em produção sem ALLOW_SIMULACAO). */
  const ligaSimulacao = (cmd: AdminCommand) =>
    (cmd.tipo === 'fonte' && cmd.fonte === 'simulacao') || (cmd.tipo === 'relogio' && cmd.acao === 'iniciar' && controller.state().fonte === 'pre');

  // ---- middlewares -------------------------------------------------------------------------------
  /** Fração registrada no log de acesso (ver LOG_AMOSTRA): 0 = nunca, 1 = sempre. */
  const amostraDe = (path: string, status: number, ms: number): number => {
    if (status >= 500 || status === 429 || ms >= 1000) return 1;
    if (path === '/healthz' || path === '/readyz') return 0;
    if (path.startsWith('/api/admin/')) return 1;
    if (ehQuente(path) || (pareceArquivo(path) && !path.startsWith('/api/'))) return config.logAmostra;
    if (!path.startsWith('/api/') || path.startsWith('/api/og/')) return config.logAmostraPaginas;
    return 1;
  };

  app.use('*', async (c, next) => {
    const t0 = perf();
    const path = c.req.path;
    const api = path.startsWith('/api/');
    const idIn = config.trustProxy ? c.req.header('x-request-id') : undefined;
    const id = idIn && /^[A-Za-z0-9._:-]{8,64}$/.test(idIn) ? idIn : `${prefixoReq}-${(++seqReq).toString(36)}`;
    idsReq.set(c.req.raw, id);
    metricas.emAndamento++;
    try {
      if (c.req.url.length > MAX_URL) {
        c.res = c.json({ erro: 'Endereço longo demais.' }, 414, { 'cache-control': CC.privado });
      } else if (Number(c.req.header('content-length') ?? 0) > MAX_CORPO) {
        c.res = c.json({ erro: 'Corpo grande demais.' }, 413, { 'cache-control': CC.privado, connection: 'close' });
      } else {
        if (api) metricas.clientes.registrar(ipDe(c)); // vira 1 bit com sal (ClientesAtivos); o IP não é guardado
        await next();
      }
    } finally {
      metricas.emAndamento--;
    }
    // headers direto no objeto (c.header() após o fim recriaria a Response e perderia o envio rápido do node-server)
    const h = c.res.headers;
    h.set('x-content-type-options', 'nosniff');
    h.set('referrer-policy', 'strict-origin-when-cross-origin');
    h.set('x-request-id', id);
    h.set('x-sintonia-versao', config.build.commit);
    if (config.producao) h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    // SIGTERM: a resposta fecha a conexão keep-alive (o cliente reconecta em outra instância/no processo novo)
    if (encerrando) h.set('connection', 'close');
    const ms = perf() - t0;
    const status = c.res.status;
    if (api || path === '/healthz') metricas.requisicao(ms, status);
    else if (status === 429) metricas.requisicao(ms, status);
    const amostra = amostraDe(path, status, ms);
    if (amostra > 0 && (amostra >= 1 || Math.random() < amostra)) {
      log.req({ id, metodo: c.req.method, rota: caminhoParaLog(path), status, ms: Math.round(ms * 10) / 10, amostra });
    }
  });

  app.onError((err, c) => {
    const e = err as Error & { status?: number; headers?: Record<string, string> };
    const status = typeof e.status === 'number' && e.status >= 400 && e.status < 600 ? e.status : 500;
    // o cliente recebe só a mensagem (nunca a pilha); 5xx = mensagem genérica, detalhes só no log
    if (status >= 500) log.erro(`Erro em ${c.req.method} ${caminhoParaLog(c.req.path)}`, err, { id: idsReq.get(c.req.raw) });
    const corpo = { erro: status >= 500 ? 'Erro interno. Tente novamente em instantes.' : e.message };
    const headers: Record<string, string> = { 'cache-control': CC.privado, ...(e.headers ?? {}) };
    if (status === 404 && c.req.path.startsWith('/api/apuracao/')) {
      // 404 coerente pode ir para a CDN por pouco tempo (evita martelar a origem com URLs inexistentes)
      headers['cache-control'] = 'public, max-age=30, s-maxage=60';
      headers['access-control-allow-origin'] = '*';
    }
    return c.json(corpo, status as 400, headers);
  });

  // ---- saúde ---------------------------------------------------------------------------------------
  /** Vivo (liveness): o processo responde. Rápido, sem tocar em dados; usado pelo HEALTHCHECK do Docker. */
  app.get('/healthz', (c) => {
    const st = dados.status();
    const tse = deps.tse.health();
    return c.json(
      {
        ok: true,
        fonte: st.fonte,
        fase: st.fase,
        versao: st.versao,
        uptimeSeg: Math.round((now() - metricas.iniciadoEm) / 1000),
        memoriaMb: Math.round(process.memoryUsage().rss / 1048576),
        tse: tse ? { ok: tse.ok, rodando: tse.rodando } : null,
        build: config.build.commit,
        encerrando,
      },
      200,
      { 'cache-control': CC.privado },
    );
  });

  /**
   * Pronto (readiness): dataset carregado, modelo construído, build do app presente (quando serve estáticos) e o
   * processo não está encerrando. 503 = não mande tráfego para esta instância agora.
   */
  const prontidao = () => {
    const motivos: string[] = [];
    if (encerrando) motivos.push('encerrando');
    if (!controller.meta().races.length) motivos.push('dataset sem corridas');
    if (!controller.metrics().modeloConstruidoEm) motivos.push('modelo não construído');
    if (estaticos && !estaticos.template()) motivos.push(`build do app ausente em ${config.distDir}`);
    return motivos;
  };
  app.get('/readyz', (c) => {
    const motivos = prontidao();
    return c.json({ ok: motivos.length === 0, motivos, build: config.build.commit }, motivos.length ? 503 : 200, { 'cache-control': CC.privado });
  });

  /** Versão do build (também no cabeçalho x-sintonia-versao de toda resposta). */
  app.get('/api/versao', (c) =>
    c.json({ ...config.build, iniciadoEm: new Date(metricas.iniciadoEm).toISOString() }, 200, {
      'cache-control': CC.privado,
      'access-control-allow-origin': '*',
    }),
  );

  // ---- SEO: sitemap.xml e robots.txt (com a origem pública; valem mesmo se o build trouxer os seus) ----
  app.get('/sitemap.xml', (c) =>
    c.body(sitemapXml(origemDe(c), config.build.data?.slice(0, 10)), 200, {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    }),
  );
  app.get('/robots.txt', (c) => c.text(robotsTxt(origemDe(c)), 200, { 'cache-control': 'public, max-age=3600, s-maxage=86400' }));

  // ---- API pública -------------------------------------------------------------------------------
  // logo do patrocínio em data URI sai do status (consultado por todos a cada poucos segundos) e vira uma URL
  // com o hash do conteúdo, servida por /api/patrocinio/logo com cache longo
  let logoMemo: { img: string; h: string; tipo: string; corpo: Buffer } | null = null;
  const logo = (img: string) => {
    if (logoMemo?.img === img) return logoMemo;
    const m = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/.exec(img);
    if (!m) return null;
    logoMemo = { img, h: hashCurto(img), tipo: m[1], corpo: Buffer.from(m[2], 'base64') };
    return logoMemo;
  };

  /** LiveStatus público: + pessoas agora (estimativa arredondada) e logo do patrocínio por URL. */
  const statusPublico = (c: Ctx): LiveStatus => {
    const st = dados.status();
    const out: LiveStatus = { ...st, pessoasAgora: metricas.pessoasAgora() };
    // troca automática esperando o TSE responder: aviso discreto (só se o admin não publicou um aviso próprio)
    if (!st.aviso && agendador.avisoPublico()) out.aviso = { nivel: 'info', texto: AVISO_AGUARDANDO_TSE };
    const p = st.patrocinio;
    if (p?.imagem?.startsWith('data:')) {
      const l = logo(p.imagem);
      const { imagem: _, ...semImagem } = p;
      out.patrocinio = l ? { ...semImagem, imagem: `${origemDe(c)}/api/patrocinio/logo?h=${l.h}` } : semImagem;
    }
    return out;
  };

  app.get('/api/status', (c) => json(c, statusPublico(c), { 'cache-control': CC.status, 'access-control-allow-origin': '*' }));

  app.get('/api/patrocinio/logo', (c) => {
    const img = dados.status().patrocinio?.imagem;
    const l = img?.startsWith('data:') ? logo(img) : null;
    if (!l) throw new NotFoundError('Nenhuma logo de patrocínio publicada.');
    const etag = etagFraco('pat', l.h);
    const headers: Record<string, string> = {
      'content-type': l.tipo,
      'cache-control': c.req.query('h') === l.h ? CC.imutavel : 'public, max-age=60, s-maxage=60',
      etag,
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
      // SVG enviado pelo admin: aberto direto no navegador, nunca executa script nem carrega nada
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    return responder(c, c.req.method === 'HEAD' ? null : l.corpo, 200, headers);
  });

  app.get('/api/meta', async (c) => {
    const etag = etagFraco('meta', deps.dataset.meta.versao, hashCurto(deps.dataset.meta.geradoEm));
    const headers = { 'cache-control': CC.meta, etag, 'access-control-allow-origin': '*' };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    const { p, hit } = respostas.obter('meta', () => ({ bruto: Buffer.from(JSON.stringify(dados.meta())) }));
    metricas.cache(hit);
    return enviar(c, await p, headers);
  });

  // Todas as rotas de apuração aceitam ?t=<epoch ms> ("reveja a noite"; ver Dados.instante e CC.historico).
  app.get('/api/apuracao/:race/br', (c) => {
    const race = parseRace(c.req.param('race'));
    const inst = instanteDe(c, race, 'br');
    return snapshot(c, race, `${race}/br`, inst, () => dados.nacional(race, inst.t));
  });

  app.get('/api/apuracao/:race/br/municipios', (c) => {
    const race = parseRace(c.req.param('race'));
    const inst = instanteDe(c, race, 'brmun');
    return snapshot(c, race, `${race}/br/municipios`, inst, () => dados.municipiosBr(race, inst.t));
  });

  app.get('/api/apuracao/:race/uf/:uf', (c) => {
    const race = parseRace(c.req.param('race'));
    const uf = parseUf(c.req.param('uf'));
    const inst = instanteDe(c, race, 'uf');
    return snapshot(c, race, `${race}/uf/${uf}`, inst, () => dados.uf(race, uf, inst.t));
  });

  app.get('/api/apuracao/:race/uf/:uf/mun/:cod', (c) => {
    const race = parseRace(c.req.param('race'));
    const uf = parseUf(c.req.param('uf'));
    const cod = parseCodMunicipio(c.req.param('cod'));
    const inst = instanteDe(c, race, 'mun');
    return snapshot(c, race, `${race}/uf/${uf}/mun/${cod}`, inst, () => dados.municipio(race, uf, cod, inst.t));
  });

  app.get('/api/apuracao/:race/uf/:uf/mun/:cod/zona/:zona', (c) => {
    const race = parseRace(c.req.param('race'));
    const uf = parseUf(c.req.param('uf'));
    const cod = parseCodMunicipio(c.req.param('cod'));
    const zona = parseNumero(c.req.param('zona'), 'zona');
    const inst = instanteDe(c, race, 'zona');
    return snapshot(c, race, `${race}/uf/${uf}/mun/${cod}/zona/${zona}`, inst, () => dados.zona(race, uf, cod, zona, inst.t));
  });

  app.get('/api/apuracao/:race/uf/:uf/mun/:cod/zona/:zona/secao/:secao', (c) => {
    const race = parseRace(c.req.param('race'));
    const uf = parseUf(c.req.param('uf'));
    const cod = parseCodMunicipio(c.req.param('cod'));
    const zona = parseNumero(c.req.param('zona'), 'zona');
    const secao = parseNumero(c.req.param('secao'), 'secao');
    const inst = instanteDe(c, race, 'secao');
    return snapshot(c, race, `${race}/uf/${uf}/mun/${cod}/zona/${zona}/secao/${secao}`, inst, async () => {
      const d = await dados.secao(race, uf, cod, zona, secao, inst.t);
      if (!d) throw new NotFoundError(`Boletim da seção ${secao} (zona ${zona}) indisponível.`);
      return d;
    });
  });

  // ---- OG images (og-rotas.ts) ------------------------------------------------------------------
  registrarOg(app, {
    dados,
    controller,
    races,
    fotos,
    estaticos: dadosEstaticos,
    nomeMunicipio,
    log,
    now,
    dominio: config.publicUrl ? new URL(config.publicUrl).host : null,
    servico: servicoOg,
    versaoDataset: `t1-${hashCurto(`${deps.dataset.meta.versao}|${deps.dataset.meta.geradoEm}`)}`,
    limitarRender: limiteOg ? (c) => limiteOg.tentar(clienteDe(c)) : undefined,
  });

  // ---- Admin ---------------------------------------------------------------------------------------
  const admin = new Hono<{ Bindings: HttpBindings }>();

  admin.use('*', async (c, next) => {
    c.header('cache-control', CC.privado);
    c.header('x-robots-tag', 'noindex');
    if (!config.adminPassword) {
      throw new ErroHttp(503, 'Painel de administração desabilitado: defina ADMIN_PASSWORD no servidor.');
    }
    await next();
  });
  // 64 KB em geral; 256 KB no /command (o patrocínio pode trazer a logo em data URI de até 150 KB)
  const limite = (kb: number) => bodyLimit({ maxSize: kb * 1024, onError: (c) => c.json({ erro: 'Corpo grande demais.' }, 413) });
  const limitePadrao = limite(64);
  const limiteComando = limite(256);
  admin.use('*', (c, next) => (c.req.path.endsWith('/command') ? limiteComando(c, next) : limitePadrao(c, next)));
  // CSRF: POST só da própria origem (ver origemPermitida)
  admin.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !origemPermitida(c)) {
      log.aviso(`Admin: ${c.req.method} ${caminhoParaLog(c.req.path)} recusado (origem de outro site)`);
      throw new ErroHttp(403, 'Origem não permitida.');
    }
    await next();
  });

  const autenticado = (c: Ctx) => sessoes.validar(getCookie(c, COOKIE_SESSAO));

  admin.post('/login', async (c) => {
    exigirJson(c);
    const cliente = clienteDe(c);
    const espera = limiteLogin.tentar(cliente) || limiteLoginGlobal.tentar('global');
    if (espera > 0) {
      log.aviso('Admin: muitas tentativas de login — bloqueio temporário');
      throw new ErroHttp(429, `Muitas tentativas. Tente de novo em ${espera} s.`, { 'retry-after': String(espera) });
    }
    const body = loginSchema.safeParse(await lerJson(c));
    if (!body.success) throw new ErroValidacao('Informe { "senha": "…" }.');
    if (!senhaConfere(body.data.senha, config.adminPassword!)) {
      log.aviso('Admin: login recusado (senha incorreta)');
      throw new ErroHttp(401, 'Senha incorreta.');
    }
    limiteLogin.zerar(cliente);
    const { token } = sessoes.criar();
    setCookie(c, COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: config.producao,
      path: '/api/admin',
      maxAge: Math.floor(sessoes.duracaoMs / 1000),
    });
    log.info('Admin: login efetuado');
    return c.json({ ok: true });
  });

  admin.post('/logout', (c) => {
    const token = getCookie(c, COOKIE_SESSAO);
    if (token && sessoes.validar(token)) log.info('Admin: logout');
    sessoes.revogar(token);
    deleteCookie(c, COOKIE_SESSAO, { path: '/api/admin', secure: config.producao, httpOnly: true, sameSite: 'Strict' });
    return c.json({ ok: true });
  });

  admin.use('*', async (c, next) => {
    if (!autenticado(c)) throw new ErroHttp(401, 'Sessão ausente ou expirada. Faça login.');
    await next();
  });

  const metricasServidor = (): MetricasServidor => {
    const r = metricas.ultimoResumo;
    const mem = process.memoryUsage();
    return {
      reqPorSeg: Math.round(metricas.requisicoesUltimoMinuto() / 6) / 10,
      p50Ms: r ? Math.round(r.p50 * 100) / 100 : 0,
      p95Ms: r ? Math.round(r.p95 * 100) / 100 : 0,
      p99Ms: r ? Math.round(r.p99 * 100) / 100 : 0,
      erros5xx: r?.erros5xx ?? 0,
      respostas429: r?.respostas429 ?? 0,
      cacheHit: r ? Math.round(r.cacheHit * 1000) / 1000 : 0,
      emAndamento: metricas.emAndamento,
      eventLoopP99Ms: metricas.eventLoopP99Ms(),
      heapMb: Math.round(mem.heapUsed / 1048576),
      rssMb: Math.round(mem.rss / 1048576),
      og: { emMemoria: servicoOg.tamanho, mb: Math.round((servicoOg.emMemoria / 1048576) * 10) / 10, naFila: servicoOg.pendentes },
      respostasEmCache: respostas.tamanho,
    };
  };

  const servidorInfo = (): ServidorInfo => ({
    producao: config.producao,
    build: config.build,
    simulacao: { permitida: !motivoSim, motivo: motivoSim },
    trocaAuto: agendador.info(),
    metricas: metricasServidor(),
  });

  /** AdminSnapshot com o `pessoasAgora` e o aviso do status público (o painel mostra o mesmo do site) + servidor. */
  const snapshotAdmin = () => {
    const snap = controller.adminSnapshot(extraMetricas());
    const aviso = !snap.status.aviso && agendador.avisoPublico() ? { nivel: 'info' as const, texto: AVISO_AGUARDANDO_TSE } : snap.status.aviso;
    return { ...snap, status: { ...snap.status, aviso, pessoasAgora: metricas.pessoasAgora() }, servidor: servidorInfo() };
  };

  admin.get('/state', (c) => c.json(snapshotAdmin()));

  admin.post('/command', async (c) => {
    const cmd = parseAdminCommand(await lerJson(c));
    if (motivoSim && ligaSimulacao(cmd)) {
      log.aviso(`Admin: comando "${cmd.tipo}" recusado — simulação bloqueada em produção (ALLOW_SIMULACAO)`);
      throw new ErroHttp(403, motivoSim);
    }
    controller.command(cmd);
    const s = controller.state();
    if (cmd.tipo === 'fonte' || cmd.tipo === 'tse' || cmd.tipo === 'relogio' || cmd.tipo === 'troca-auto') deps.tse.sincronizar(s.fonte, s.tse);
    log.info(`Admin: comando "${cmd.tipo}"${'acao' in cmd ? ` (${cmd.acao})` : ''} aplicado (versão ${s.versao}, fonte ${s.fonte})`);
    // "tentar agora": não espera o próximo segundo do agendador
    if (cmd.tipo === 'troca-auto' && cmd.acao === 'agora') void agendador.tick();
    return c.json(snapshotAdmin());
  });

  admin.get('/presets', (c) => c.json(controller.presets()));

  admin.get('/tse/test', async (c) => {
    const t0 = perf();
    const r = await Promise.race([
      deps.tse.testar(controller.state().tse),
      new Promise<{ ok: boolean; detalhe: string }>((res) =>
        setTimeout(() => res({ ok: false, detalhe: 'Sem resposta do TSE em 25 s.' }), 25_000).unref?.(),
      ),
    ]);
    log.info(`Admin: teste do feed do TSE → ${r.ok ? 'ok' : 'falhou'} (${Math.round(perf() - t0)} ms)`);
    return c.json(r);
  });

  admin.get('/tse/health', (c) => c.json(deps.tse.health()));

  app.route('/api/admin', admin);

  app.all('/api/*', () => {
    throw new ErroHttp(404, 'Rota da API inexistente.');
  });

  // ---- App (produção): estáticos + SPA com meta tags -------------------------------------------------
  if (estaticos) {
    /** Placar para a descrição (só fontes do motor: na fonte 'tse' não vale a pena esperar o feed). */
    const placarMeta = (race: string, snap: { race: string; resumo: Summary }) => {
      const r = dados.race(race);
      const raceMeta = races.get(snap.race) ?? r;
      const st = dados.status();
      return {
        resumo: snap.resumo,
        simulacao: st.simulacao && r.turno === 2,
        race: st.anonimizado ? anonimizarRace(raceMeta) : raceMeta,
      };
    };
    const ctxMeta: ContextoMeta = {
      races,
      nomeMunicipio,
      placar(race, uf) {
        if (dados.fonteDe(race) === 'tse') return null;
        return placarMeta(race, uf ? controller.uf(race, uf) : controller.nacional(race));
      },
      placarMunicipio(race, uf, cod) {
        if (dados.fonteDe(race) === 'tse') return null;
        return placarMeta(race, controller.municipio(race, uf, cod));
      },
      fase: () => dados.status().fase,
      // a vitrine /kit só existe no dev e no build demo (no build normal a rota cai no 404 do app)
      kit: !config.producao,
      ficha: (sq) => ({ lida: dadosEstaticos.ficha(sq), existe: dadosEstaticos.existeCandidato(sq) }),
      cargo: (nome) => dadosEstaticos.cargo(nome),
      curiosidades: () => dadosEstaticos.curiosidades(),
      cenario(codigo) {
        // tamanho e alfabeto conferidos antes de decodificar (códigos gigantes nunca chegam ao decodificador)
        if (codigo.length > MAX_CODIGO || !/^[A-Za-z0-9_-]+={0,2}$/.test(codigo)) return null;
        const ds = dadosEstaticos.presidenteT1();
        const cen = ds ? decodificarCenario(codigo, ds.valor) : null;
        if (!ds || !cen) return null;
        return { codigo: codificarCenario(cen), placar: placarCenarioTexto(ds.valor, calcularCenario(ds.valor, cen)), versao: ds.versao };
      },
    };

    /** CSP por template (os hashes dos scripts inline mudam a cada build). */
    let cspMemo: { tpl: string; pagina: string; embed: string } | null = null;
    const csp = (tpl: string, embed: boolean) => {
      if (cspMemo?.tpl !== tpl) cspMemo = { tpl, pagina: cspPagina(tpl, false), embed: cspPagina(tpl, true) };
      return embed ? cspMemo.embed : cspMemo.pagina;
    };

    app.get('*', async (c) => {
      const path = c.req.path;
      const head = c.req.method === 'HEAD';
      const arq = estaticos.arquivo(path, c.req.header('accept-encoding') ?? null, c.req.header('if-none-match') ?? null, head);
      if (arq) {
        const body = arq.body ? await arq.body : null;
        return responder(c, body, arq.status, arq.headers);
      }
      if (pareceArquivo(path)) return c.text('Arquivo não encontrado', 404, { 'cache-control': 'public, max-age=60' });
      const tpl = estaticos.template();
      if (!tpl) return c.text('Build do app ausente (rode npm run build).', 503, { 'cache-control': CC.privado });

      const url = new URL(c.req.url);
      const st = dados.status();
      const versaoImg = `${st.versao}-${Math.floor(now() / 60_000).toString(36)}`;
      const origem = origemDe(c);
      // só os parâmetros que mudam a página entram na chave (utm_* e afins não multiplicam o cache)
      // o código do Duelo (respostas do Teste Cego) não entra nem na chave do cache: a página é a mesma para todos.
      // A origem entra (sem PUBLIC_URL ela vem do Host): um Host forjado nunca contamina a página dos outros.
      const chave = `html|${origem}|${path.startsWith('/duelo/') ? '/duelo/*' : path}|${consultaNormalizada(url.searchParams)}|${versaoImg}`;
      const { p } = respostas.obter(chave, () => {
        const m = metaDaRota(path, url.searchParams, ctxMeta);
        const raceQ = url.searchParams.get('race');
        const canonico = m.canonico ?? `${path}${raceQ && races.has(raceQ.toLowerCase()) ? `?race=${raceQ.toLowerCase()}` : ''}`;
        const html = injetarMeta(tpl, m, origem, `${origem}${canonico}`, m.imagemVersao ?? versaoImg, { twitterSite: config.twitterSite });
        return Object.assign({ bruto: Buffer.from(html) }, { status: m.status, noindex: !!m.noindex });
      });
      const corpo = (await p) as CorpoPronto & { status: 200 | 404; noindex: boolean };
      const cod = negociar(c.req.header('accept-encoding'));
      const body = await corpoCodificado(corpo, cod);
      const embed = path.startsWith('/embed/');
      const headers: Record<string, string> = {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': CC.html,
        vary: 'Accept-Encoding',
        'permissions-policy': PERMISSOES,
        // widgets (/embed/*): podem ser exibidos em iframe de qualquer site — SÓ estas rotas
        'content-security-policy': csp(tpl, embed),
        'cross-origin-opener-policy': 'same-origin-allow-popups',
      };
      if (!embed) headers['x-frame-options'] = 'SAMEORIGIN';
      if (body !== corpo.bruto && cod) headers['content-encoding'] = cod;
      if (corpo.noindex || path.startsWith('/admin') || path.startsWith('/duelo/')) headers['x-robots-tag'] = 'noindex';
      return responder(c, head ? null : body, corpo.status, headers);
    });
  }

  /** Resumo do último minuto (para o log operacional): texto + campos (no log JSON, um objeto por minuto). */
  const resumoMinuto = (): { msg: string; campos: Record<string, number> } | null => {
    const r = metricas.fecharMinuto();
    if (r.requisicoes === 0) return null;
    const clientes = metricas.clientes.estimar();
    const mem = Math.round(process.memoryUsage().rss / 1048576);
    return {
      msg:
        `Último minuto: ${r.requisicoes} req (${Math.round(r.requisicoes / 60)}/s) · processamento p50 ${r.p50.toFixed(2)} ms · ` +
        `p95 ${r.p95.toFixed(2)} ms · p99 ${r.p99.toFixed(2)} ms · máx ${r.max.toFixed(0)} ms` +
        ` · cache ${(r.cacheHit * 100).toFixed(0)}% · 304: ${r.respostas304} · 429: ${r.respostas429} · 5xx: ${r.erros5xx}` +
        ` · clientes ~${clientes} · ${mem} MB`,
      campos: {
        requisicoes: r.requisicoes,
        reqPorSeg: Math.round(r.requisicoes / 60),
        p50Ms: Math.round(r.p50 * 100) / 100,
        p95Ms: Math.round(r.p95 * 100) / 100,
        p99Ms: Math.round(r.p99 * 100) / 100,
        maxMs: Math.round(r.max),
        cacheHit: Math.round(r.cacheHit * 1000) / 1000,
        respostas304: r.respostas304,
        respostas429: r.respostas429,
        erros5xx: r.erros5xx,
        clientes,
        memoriaMb: mem,
      },
    };
  };

  /** SIGTERM: /readyz passa a 503 e as respostas fecham a conexão keep-alive (main.ts drena e encerra). */
  const encerrar = () => {
    encerrando = true;
    agendador.parar();
    metricas.pararEventLoop();
  };

  return { app, dados, metricas, respostas, sessoes, estaticos, resumoMinuto, msgErro, agendador, aplicarTravas, encerrar, prontidao };
}

export type SintoniaApp = ReturnType<typeof createApp>;
