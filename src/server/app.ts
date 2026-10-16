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
import type { AdminCommand, AdminSnapshot, MetricasServidor, ServidorInfo } from '../shared/api';
import { FORMATOS_COM_CLIQUE, FORMATOS_COM_IMPRESSAO, urlComUtm, type FormatoAnuncio, type MetricasAnunciosResposta } from '../shared/anuncios';
import { NOITE_ELEICAO, type RelatorioAnunciante, type SituacaoRelatorio } from '../shared/relatorio';
import { contatosEfetivos } from '../shared/contatos';
import { chavesNoite } from '../shared/chaves-noite';
import { PISO_PESSOAS_PUBLICO } from '../shared/constants';
import type { AdminMetrics, ChavesNoite, FrescorCorrida, LiveStatus, Race, RaceId, Summary, TseConfig, UF } from '../shared/types';
import { UFS } from '../shared/types';
import type { MunicipiosBr } from '../shared/dataset';
import type { LoadedDataset, Controller } from '../engine/api';
import { NotFoundError } from '../engine/api';
import { anuncioDoLegado, anuncioPublico } from '../engine/controller';
import {
  HORAS_DETALHE,
  HORAS_PAINEL,
  LimiteJanela,
  MetricasAnuncios,
  PessoasPorAnuncio,
  PessoasPorRede,
  TETO_PESSOAS,
  TETO_PESSOAS_ANUNCIO,
  TabelaAnuncios,
  ehRobo,
} from './anuncios';
import { registrarRelatorios } from './relatorios';
import { imagemComOferecimento, tagOferecimento } from './og-oferecimento';
import { SalaChat, registrarChatAdmin, registrarChatPublico } from './chat';
import { RegistroEnvios } from './chat-registro';
import { registrarCrescimento, type StoresCrescimento } from './crescimento';
import { createJsonStore, type JsonStore } from './state-store';
import { COOKIE_SESSAO, LimiteTaxa, Sessoes, chaveCliente, redeDoCliente, senhaConfere } from './auth';
import { motivoSemSimulacao, type ServerConfig } from './config';
import { Dados, type InstanteNormalizado, type NivelApuracao } from './dados';
import { PacotesFotos } from './fotos';
import {
  CABECALHO_BORDA,
  CacheRespostas,
  type CorpoPronto,
  cabecalhosCache,
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
import { registrarDesdeT1 } from './desde-t1';
import { ServicoOg } from './og-servico';
import { DadosEstaticos } from './dados-estaticos';
import { anonimizarRace } from '../shared/anon';
import { Estaticos, pareceArquivo } from './static';
import { VigiaNoite, avaliarSaude, unirSaude, type SaudeNoite } from './saude-noite';
import type { TseManager } from './tse';
import type { TseHealth } from '../tse';
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
  /**
   * Onde gravar as métricas agregadas dos anúncios (STATE_DIR/anuncios-metricas.json): lidas na criação do app;
   * `persistirMetricasAnuncios()` grava (main.ts: a cada 60 s e no encerramento). Ausente = só em memória.
   */
  metricasAnunciosStore?: JsonStore;
  /** STATE_DIR/audiencia.json, leads.json e divulgacao.json (crescimento.ts). Ausentes = só em memória. */
  crescimentoStores?: StoresCrescimento;
  /**
   * STATE_DIR/chat.json: configuração da sala do chat (aberta, modo lento, fixada) — volta igual depois de um reinício.
   * Ausente = só em memória (a sala nasce fechada a cada subida).
   */
  chatStore?: JsonStore;
  /**
   * Contagem por pessoa (rede + navegador) nos anúncios (E14). Ausente = `ANUNCIO_PESSOA` do ambiente (`0` desliga:
   * conta pela rede, como antes).
   */
  anuncioPessoa?: boolean;
  /** Relatório do anunciante por link privado (E17). Ausente = `RELATORIOS` do ambiente (`0` desliga: a rota dá 404). */
  relatorios?: boolean;
  /** STATE_DIR/relatorios.json (só os hashes dos tokens). Ausente = criado em `config.stateDir`. */
  relatoriosStore?: JsonStore;
  /**
   * Cabeçalho da borda da Cloudflare (`Cloudflare-CDN-Cache-Control`, I04). Ausente = `CDN_CC` do ambiente (`0` desliga:
   * só o `Cache-Control`, como antes da leva 3 — e a chave 'html-borda' passa a não ter efeito). Exige reinício.
   */
  cdnCc?: boolean;
  /** Alertas da noite (I16, frente B). Também ligáveis depois da criação por `ligarAlertas` (ver AlertasApp). */
  alertas?: AlertasApp;
}

/**
 * Alertas da noite (I16, frente B: src/server/alertas.ts, iniciados em main.ts). Opcionais: sem eles, `/api/saude-noite`
 * usa só a avaliação do servidor HTTP (saude-noite.ts) e o comando 'alerta-teste' responde 400.
 */
export interface AlertasApp {
  /** Avaliação própria dos alertas, somada à do servidor HTTP no `/api/saude-noite` ('atencao' de qualquer um vence). */
  saude?: () => SaudeNoite | null | undefined;
  /** Manda a mensagem de teste (Telegram). `detalhe` vai ao log do painel (sem dado de visitante). */
  teste?: () => Promise<{ ok: boolean; detalhe: string }> | { ok: boolean; detalhe: string };
}

/** Permissions-Policy das páginas: nada de câmera, microfone, localização, pagamentos, USB nem "tópicos" de anúncio. */
export const PERMISSOES = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()';

/**
 * Cache-Control por tipo de rota (ARCHITECTURE.md §6) — o que o NAVEGADOR lê (o `s-maxage` vale para a borda só se o
 * cabeçalho da borda faltar; ver CC_BORDA).
 */
export const CC = {
  status: 'public, max-age=0, s-maxage=1',
  meta: 'public, max-age=60, s-maxage=300',
  snapshot: 'public, max-age=0, s-maxage=2, stale-while-revalidate=10',
  /** fonte TSE ao vivo: a CDN guarda 1 s e serve cópia vencida por no máximo mais 1 s (ou 60 s se a origem falhar) */
  tseVivo: 'public, max-age=0, s-maxage=1, stale-while-revalidate=1, stale-if-error=60',
  /**
   * fonte TSE abaixo da UF (município, zona, seção) e o mapa nacional por município: esses números chegam pela fila de
   * municípios (cache de 60 s na origem); a borda guarda 10 s. Com `CDN_CC=0`, volta a `tseVivo` (como antes).
   */
  tseDetalhe: 'public, max-age=0, s-maxage=10, stale-while-revalidate=10, stale-if-error=60',
  /** placar nacional com `?d=<marca atual>`: o conteúdo daquela marca não muda (dado novo = marca nova = outra URL) */
  tseMarca: 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
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
  /** imagem de anúncio endereçada pelo hash do conteúdo (outra imagem = outra URL) */
  anuncioImg: 'public, max-age=31536000, s-maxage=31536000, immutable',
  og: CC_OG.vivo,
  /** imagens de dado oficial/real (cargos, ficha, curiosidades, cenários, 1º turno) */
  ogEstatica: CC_OG.estatica,
  ogTeste: CC_OG.teste,
  html: 'no-cache',
  privado: 'no-store',
} as const;

/** Tipos de rota com cabeçalho próprio da borda (CC_BORDA). */
export type TipoCacheBorda = 'status' | 'meta' | 'snapshot' | 'tseVivo' | 'tseDetalhe' | 'tseMarca' | 't1' | 'historico' | 'historicoSemVersao' | 'html';

/**
 * `Cloudflare-CDN-Cache-Control` por tipo de rota (I04, leva 3; ver http-cache.ts › CABECALHO_BORDA): o que a BORDA da
 * Cloudflare guarda, com `stale-if-error` — se a origem cair por alguns minutos, a borda continua entregando o último
 * placar (o app mostra a faixa "Conexão instável" quando o relógio do status para). O navegador continua com `CC`.
 * `CDN_CC=0` tira este cabeçalho (exige reinício, ~10 s).
 */
export const CC_BORDA: Record<TipoCacheBorda, string> = {
  status: 'max-age=1, stale-while-revalidate=2, stale-if-error=600',
  meta: 'max-age=300, stale-if-error=86400',
  snapshot: 'max-age=2, stale-while-revalidate=10, stale-if-error=600',
  /** Brasil e UF ao vivo na fonte TSE */
  tseVivo: 'max-age=1, stale-while-revalidate=1, stale-if-error=600',
  /** município, zona, seção e mapa nacional por município na fonte TSE */
  tseDetalhe: 'max-age=10, stale-while-revalidate=10, stale-if-error=600',
  /** placar nacional com `?d=<marca atual>`: o conteúdo daquela URL não muda mais */
  tseMarca: 'max-age=300, stale-if-error=600',
  t1: 'max-age=300, stale-while-revalidate=600, stale-if-error=86400',
  historico: 'max-age=3600, stale-while-revalidate=600, stale-if-error=86400',
  historicoSemVersao: 'max-age=30, stale-while-revalidate=60, stale-if-error=600',
  /**
   * I05: HTML das páginas SÓ com a chave 'html-borda' ligada (padrão desligada; liga no congelamento de 24/10, depois
   * do ensaio). Nunca em /admin, /embed, /duelo, /relatorio, 404 ou erro. Desligar: em até 15 s a borda revalida.
   */
  html: 'max-age=15, stale-while-revalidate=15, stale-if-error=86400',
};

type Ctx = Context<{ Bindings: HttpBindings }>;

/**
 * robots.txt (I06): as rotas de DADOS que as páginas de apuração pedem ao abrir (status, meta, apuração) ficam
 * liberadas — o robô de busca precisa delas para renderizar a página —, mas a API em si não é indexada
 * (`X-Robots-Tag: noindex` em toda /api/*, exceto as imagens /api/og/). `Allow` antes do `Disallow`: os robôs que
 * leem a primeira regra que casa (e não a mais longa) também liberam.
 */
export const ROBOTS_TXT = [
  'User-agent: *',
  'Allow: /api/og/',
  'Allow: /api/status',
  'Allow: /api/meta',
  'Allow: /api/apuracao/',
  'Disallow: /api/',
  'Disallow: /admin',
  'Disallow: /relatorio',
  '',
].join('\n');

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
    ['/anuncie', 'monthly', '0.3'],
    ['/streamers', 'weekly', '0.5'],
    ['/palpite', 'daily', '0.7'],
    ['/ao-vivo', 'hourly', '0.6'],
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
 * Corpo máximo do POST /api/admin/command: o anúncio leva a logo (≤ 150 KB), a versão da logo para fundo escuro
 * (≤ 150 KB) e a peça (≤ 400 KB) em data URI (base64 ≈ 4/3 → ~935 KB, mais os textos e os ajustes). Só esta rota (com
 * sessão de admin) passa de MAX_CORPO.
 */
export const MAX_CORPO_COMANDO = 1.5 * 1024 * 1024;

/**
 * Content-Security-Policy das páginas: scripts só do próprio site + os scripts inline do index.html autorizados pelo
 * hash (tema e pré-carregamento); estilos inline (atributos style do React/framer-motion); imagens só do próprio site
 * (as logos e peças dos anúncios são servidas por /api/anuncio/img; nada de terceiros — um pixel externo vazaria o IP
 * do visitante), da origem pública (`origemPublica`, PUBLIC_URL: as URLs absolutas das imagens dos anúncios usam ela,
 * e o site pode ser aberto por outro endereço) e data:/blob: (cartões de compartilhar); nada de plugins;
 * `frame-ancestors` 'self' (ou * nos widgets /embed/*).
 */
export function cspPagina(template: string, embed: boolean, origemPublica?: string | null): string {
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
    `img-src 'self'${origemPublica ? ` ${origemPublica}` : ''} data: blob:`,
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

/** Páginas cujo HTML nunca vai para a borda (I05), além dos widgets /embed/* e das respostas que não são 200. */
export const htmlForaDaBorda = (p: string): boolean =>
  p === '/admin' || p.startsWith('/admin/') || p.startsWith('/duelo/') || p === '/relatorio' || p.startsWith('/relatorio/') || p.startsWith('/embed/');

/** Rotas "quentes" (polling, estáticos e os eventos/cliques dos anúncios): log por amostragem. */
const ehQuente = (p: string) =>
  p === '/api/status' ||
  p.startsWith('/api/apuracao/') ||
  p.startsWith('/api/anuncio/') ||
  p.startsWith('/api/chat') ||
  p === '/api/audiencia' ||
  p === '/api/divulgacao' ||
  p.startsWith('/assets/') ||
  p.startsWith('/data/') ||
  p.startsWith('/geo/');

/**
 * Imagens enviadas pelo admin (logo SVG inclusive), abertas direto no navegador: nunca executam script nem carregam
 * nada (vale para /api/anuncio/img e /api/patrocinio/logo).
 */
export const CSP_IMAGEM = "sandbox; default-src 'none'; style-src 'unsafe-inline'";

/**
 * Eventos de anúncio (impressões) por REDE por minuto, com a contagem por pessoa (E14): IPv4 inteiro (CGNAT de
 * operadora: muita gente atrás de um endereço) e IPv6 /64. Acima disso → 429.
 */
export const EVENTOS_REDE_MIN = { v4: 3000, v6: 300 } as const;
/** Cliques contados por rede por minuto (acima disso o redirecionamento acontece, mas não conta). */
export const CLIQUES_REDE_MIN = { v4: 1000, v6: 100 } as const;
/** Com `ANUNCIO_PESSOA=0` (conta pela rede, como antes): eventos por rede por minuto; acima disso → 429. */
export const EVENTOS_ANUNCIO_MIN = 60;
/** Com `ANUNCIO_PESSOA=0`: cliques contados por rede por minuto. */
export const CLIQUES_ANUNCIO_MIN = 20;
/** Meta de impressões (E16): conferida a cada 15 s (e logo depois de cada comando do painel). */
export const INTERVALO_METAS_MS = 15_000;

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

/**
 * Fonte TSE: o motor deixa a fase em 'apurando' depois das 17h (não sabe dos números do feed). Quando o TSE dá como
 * concluída a totalização de Presidente e nenhuma outra disputa do 2º turno segue apurando (as sem arquivo publicado
 * ficam de fora), o status PÚBLICO passa a 'encerrada' — cabeçalho, widgets e TV deixam de dizer "ao vivo", como na
 * simulação (ensaio geral 12/10/2026: "AO VIVO" ao lado de "Apuração encerrada · eleito").
 */
export function tseTudoEncerrado(health: Pick<TseHealth, 'corridas'> | null, turnoDe: (race: string) => number | undefined): boolean {
  const c2 = (health?.corridas ?? []).filter((c) => turnoDe(c.race) === 2);
  if (!c2.some((c) => c.race === 'pres' && c.status === 'encerrada')) return false;
  return c2.every((c) => c.status === 'encerrada' || (c.status !== 'apurando' && c.secoesTotalizadas === 0));
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

  // ---- leva 3: borda da Cloudflare (I04) e "Chaves da noite" -------------------------------------------
  /** `Cloudflare-CDN-Cache-Control` ligado (CDN_CC ≠ 0)? */
  const cdnCc = deps.cdnCc ?? process.env.CDN_CC !== '0';
  if (!cdnCc) log.aviso('Borda: cabeçalho Cloudflare-CDN-Cache-Control DESLIGADO (CDN_CC=0) — só o Cache-Control, como antes da leva 3; a chave "html-borda" não tem efeito');
  /** Cabeçalhos de cache de um tipo de rota (com `CDN_CC=0`, o formato anterior: município etc. voltam a `tseVivo`). */
  const cacheDe = (tipo: TipoCacheBorda): Record<string, string> =>
    cdnCc ? cabecalhosCache(CC[tipo], CC_BORDA[tipo], true) : { 'cache-control': CC[tipo === 'tseDetalhe' ? 'tseVivo' : tipo] };
  /**
   * Chaves da noite (AdminState.noite; padrões em CHAVES_NOITE_PADRAO). `controller.state()` copia o estado inteiro: a
   * leitura fica guardada por 1 s (relógio real) e é renovada na hora a cada comando do painel. Outra instância que
   * adote o estado pelo admin.json vê a mudança em até 1 s.
   */
  let noiteMemo: { em: number; v: ChavesNoite } | null = null;
  const noite = (): ChavesNoite => {
    const t = performance.now();
    if (!noiteMemo || t - noiteMemo.em >= 1000) noiteMemo = { em: t, v: chavesNoite(controller.state()) };
    return noiteMemo.v;
  };
  /** Saúde da noite (/api/saude-noite): memória mínima + os alertas da frente B, se ligados. */
  const vigia = new VigiaNoite();
  let alertas: AlertasApp | null = deps.alertas ?? null;
  let ultimaSaude: SaudeNoite['noite'] = 'ok';

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
  /** Rede LARGA (IPv6 /56 na audiência vendável e nos pedidos de anunciantes, /48 nas denúncias do chat; IPv4 inteiro). */
  const redeLargaDe = (prefixo: 56 | 48) => (c: Ctx) => chaveCliente(ipDe(c), salCliente, prefixo);

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
    const etag = etagFraco(`v${st.versao}`, passado ? dados.baldeHistorico(race, inst) : dados.balde(race, inst.nivel), hashCurto(rota));
    let tipo: TipoCacheBorda = r.turno === 1 ? 't1' : 'snapshot';
    if (passado && inst.consolidado) tipo = parseVersaoUrl(c.req.query('v')) === st.versao ? 'historico' : 'historicoSemVersao';
    else if (r.turno === 2 && dados.fonteDe(race) === 'tse') {
      if (!passado && inst.nivel === 'br' && dados.marcaConfere(race, c.req.query('d'))) tipo = 'tseMarca';
      else tipo = inst.nivel === 'br' || inst.nivel === 'uf' ? 'tseVivo' : 'tseDetalhe';
    }
    const headers = {
      ...cacheDe(tipo),
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
    // monitores (a cada minuto): sem linha por pedido — a saúde da noite registra só as mudanças de estado
    if (path === '/healthz' || path === '/readyz' || path === '/api/saude-noite') return 0;
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
      } else if (Number(c.req.header('content-length') ?? 0) > (path === '/api/admin/command' ? MAX_CORPO_COMANDO : MAX_CORPO)) {
        c.res = c.json({ erro: 'Corpo grande demais.' }, 413, { 'cache-control': CC.privado, connection: 'close' });
      } else {
        // vira 1 bit com sal (ClientesAtivos); o IP não é guardado. IPv6 pela /64: trocar o endereço dentro da faixa não
        // multiplica "pessoas agora"
        if (api) metricas.clientes.registrar(redeDoCliente(ipDe(c)));
        await next();
      }
    } finally {
      metricas.emAndamento--;
    }
    // headers direto no objeto (c.header() após o fim recriaria a Response e perderia o envio rápido do node-server)
    const h = c.res.headers;
    h.set('x-content-type-options', 'nosniff');
    if (!h.has('referrer-policy')) h.set('referrer-policy', 'strict-origin-when-cross-origin');
    h.set('x-request-id', id);
    h.set('x-sintonia-versao', config.build.commit);
    // I06: a API pode ser lida pelos robôs (as páginas precisam dela para renderizar), mas não entra nos resultados —
    // salvo as imagens de prévia
    if (api && !path.startsWith('/api/og/') && !h.has('x-robots-tag')) h.set('x-robots-tag', 'noindex');
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
  // 1 h também na borda (antes, 1 dia): uma mudança de regra chega aos robôs no mesmo dia sem depender de purga
  app.get('/robots.txt', (c) => c.text(robotsTxt(origemDe(c)), 200, { 'cache-control': 'public, max-age=3600, s-maxage=3600' }));

  // ---- API pública -------------------------------------------------------------------------------
  // anúncios: imagens por hash e configs (links de destino) — atualizados quando a versão do admin muda
  const anuncios = new TabelaAnuncios();
  const sincAnuncios = (versao = controller.status().versao) => anuncios.sincronizar(versao, () => controller.state().anuncios);
  const metricasAnuncios = new MetricasAnuncios(now);
  if (deps.metricasAnunciosStore) {
    const salvo = deps.metricasAnunciosStore.ler();
    if (salvo && metricasAnuncios.carregar(salvo)) log.info(`Métricas dos anúncios restauradas de ${deps.metricasAnunciosStore.caminho}`);
  }
  // contagem por pessoa (rede + navegador, E14); ANUNCIO_PESSOA=0 → pela rede, com os limites de antes
  const anuncioPessoa = deps.anuncioPessoa ?? process.env.ANUNCIO_PESSOA !== '0';
  if (!anuncioPessoa) log.aviso('Anúncios: contagem por pessoa DESLIGADA (ANUNCIO_PESSOA=0) — impressões e cliques contam pela rede');
  // rede no teto de pessoas: uma linha por janela de 5 min, só a contagem (nunca a rede) — muitas seguidas podem ser
  // alguém trocando o User-Agent para inflar a contagem (RUNBOOK §3.9: ANUNCIO_PESSOA=0)
  const pessoas = new PessoasPorRede(now, undefined, undefined, undefined, (n) =>
    log.aviso(`Anúncios: ${n} rede(s) chegaram ao teto de pessoas (${TETO_PESSOAS.v4} navegadores por IPv4, ${TETO_PESSOAS.v6} por /64) em 5 min`),
  );
  const tetoAnuncio = (o: string) =>
    new PessoasPorAnuncio(now, undefined, undefined, undefined, (n) =>
      log.aviso(
        `Anúncios: ${n} par(es) rede × anúncio chegaram ao teto de ${TETO_PESSOAS_ANUNCIO.v4} pessoas (IPv4) em 5 min nas ${o} — se repetir muito, pode ser contagem inflada (RUNBOOK §3.9)`,
      ),
    );
  /** pessoas que UMA rede soma a UM anúncio (impressões e cliques à parte): limita a inflação da contagem e da meta */
  const pessoasImpressao = tetoAnuncio('impressões');
  const pessoasClique = tetoAnuncio('cliques');
  const limitePorRede = (porRede: { v4: number; v6: number }, comoAntes: number) => {
    // mapa cheio (mais de 100 mil redes no mesmo minuto, pico da noite): a rede nova passa sem limite em vez de levar
    // 429 e perder a impressão — a repetição e o teto de pessoas seguem valendo
    const v4 = new LimiteJanela(anuncioPessoa ? porRede.v4 : comoAntes, 60_000, now, undefined, 'deixa');
    const v6 = anuncioPessoa ? new LimiteJanela(porRede.v6, 60_000, now, undefined, 'deixa') : v4;
    return (k: { rede: string; v6: boolean }) => (k.v6 ? v6 : v4).tentar(k.rede);
  };
  const limiteEventos = limitePorRede(EVENTOS_REDE_MIN, EVENTOS_ANUNCIO_MIN);
  const limiteCliques = limitePorRede(CLIQUES_REDE_MIN, CLIQUES_ANUNCIO_MIN);
  /**
   * Quem conta na métrica dos anúncios: `rede` (hash com sal da rede: IPv4 inteiro, IPv6 /64) e `pessoa` (rede + hash
   * do navegador, com teto por rede — `PessoasPorRede`). Só em memória; nunca vai ao log nem ao disco.
   */
  const contagemDe = (c: Ctx): { rede: string; pessoa: string; v6: boolean } => {
    const ip = ipDe(c);
    const v6 = redeDoCliente(ip).includes(':');
    const rede = chaveCliente(ip, salCliente);
    return { rede, v6, pessoa: anuncioPessoa ? pessoas.pessoa(rede, c.req.header('user-agent') ?? '', v6) : rede };
  };

  /**
   * Meta de impressões (E16): a cada 15 s (e depois de cada comando do painel) compara o entregue com a meta de cada
   * anúncio; ao atingir, o anúncio sai do site (`anunciosParaSite`); meta aumentada ou retirada → volta. As imagens de
   * compartilhamento não são medidas nem contam para a meta, e seguem com o anúncio.
   */
  const verificarMetas = (): boolean => {
    sincAnuncios();
    const antes = new Set(metricasAnuncios.esgotadoEm.keys());
    if (!metricasAnuncios.verificarMetas(anuncios.todos())) return false;
    for (const id of metricasAnuncios.esgotadoEm.keys())
      if (!antes.has(id)) log.info(`Anúncios: meta de impressões atingida — ${anuncios.config(id)?.marca ?? id} (${id}) sai do site`);
    for (const id of antes) if (!metricasAnuncios.esgotadoEm.has(id)) log.info(`Anúncios: ${anuncios.config(id)?.marca ?? id} (${id}) de volta ao site (meta aumentada ou retirada)`);
    return true;
  };
  verificarMetas();
  /** Alcance estimado (pessoas) na campanha (a partir do dia do início) e na noite; nunca acima das impressões. */
  const alcanceDe = (id: string, inicio?: number | null): { campanha: number | null; noite: number | null } => {
    const teto = (v: number | null, max: number) => (v === null ? null : Math.min(v, max));
    return {
      campanha: teto(metricasAnuncios.alcance.estimar(id, 'campanha', inicio), metricasAnuncios.totalImpressoes(id)),
      noite: teto(metricasAnuncios.alcance.estimar(id, 'noite'), metricasAnuncios.impressoesEntre(id, NOITE_ELEICAO.inicio, NOITE_ELEICAO.fim)),
    };
  };
  const timerMetas = setInterval(() => {
    try {
      verificarMetas();
    } catch (e) {
      log.erro('Anúncios: falha ao conferir as metas de impressões', e);
    }
  }, INTERVALO_METAS_MS);
  timerMetas.unref?.();

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

  /** Fonte TSE com todas as disputas concluídas (ver tseTudoEncerrado), conferido no máximo a cada 2 s. */
  let encerradoTse = { em: -Infinity, v: false };
  const tseEncerrado = (): boolean => {
    const t = now();
    if (t - encerradoTse.em >= 2000) encerradoTse = { em: t, v: tseTudoEncerrado(deps.tse.health(), (r) => races.get(r)?.turno) };
    return encerradoTse.v;
  };

  /**
   * Anúncios e patrocínio (legado) para o site: imagens por URL (/api/anuncio/img?h=…, cache imutável) e links de clique
   * contado (/api/anuncio/ir/<id>; o app acrescenta `?f=<formato>`). O patrocínio das telas antigas aponta para o mesmo
   * anúncio (formato 'topo') e mantém a logo em /api/patrocinio/logo.
   */
  const anunciosParaSite = (st: LiveStatus, origem: string): Pick<LiveStatus, 'anuncios' | 'patrocinio'> => {
    sincAnuncios(st.versao);
    // meta de impressões atingida (E16): o anúncio sai do site (as impressões que ainda chegarem contam como bônus)
    const esg = metricasAnuncios.esgotadoEm;
    const noAr = esg.size ? (st.anuncios ?? []).filter((a) => !esg.has(a.id)) : (st.anuncios ?? []);
    const out: Pick<LiveStatus, 'anuncios' | 'patrocinio'> = { anuncios: noAr.map((a) => anuncios.publico(a, origem)) };
    const p = st.patrocinio;
    const a = p ? anuncioDoLegado(noAr) : undefined;
    if (p && a && a.id === anuncioDoLegado(st.anuncios)?.id) {
      const { imagem: img, ...resto } = p;
      const l = img?.startsWith('data:') ? logo(img) : null;
      out.patrocinio = { ...resto, url: `${origem}/api/anuncio/ir/${encodeURIComponent(a.id)}?f=topo`, ...(l ? { imagem: `${origem}/api/patrocinio/logo?h=${l.h}` } : {}) };
    } else if (p && a) {
      // o anúncio do legado bateu a meta: o patrocínio das telas antigas passa ao próximo (mesma escolha do motor)
      const imagem = anuncios.url(a.logo, origem);
      out.patrocinio = { marca: a.marca, texto: a.texto || a.titulo, url: `${origem}/api/anuncio/ir/${encodeURIComponent(a.id)}?f=topo`, ...(imagem ? { imagem } : {}) };
    } else out.patrocinio = null;
    return out;
  };

  /** LiveStatus público: + pessoas agora (estimativa arredondada), anúncios com imagens por URL e fase 'encerrada' no TSE. */
  /**
   * "N pessoas agora" PÚBLICO (I09): o maior entre o que chega à origem e a presença pelo sinal das páginas (com a
   * Cloudflare na frente, só o sinal atravessa a CDN). Omitido (`undefined`) abaixo de PISO_PESSOAS_PUBLICO ou com a
   * chave 'contador-publico' desligada — número pequeno não diz nada e chama atenção para si. O painel vê sempre.
   */
  const pessoasPublico = (n: ChavesNoite): number | undefined => {
    if (!n.contadorPublico) return undefined;
    const v = Math.max(metricas.pessoasAgora(), crescimento?.audiencia.presencaAgora ?? 0);
    return v >= PISO_PESSOAS_PUBLICO ? v : undefined;
  };

  /** Frescor do status público: sem `nacionalParadoDesde` com a chave 'aviso-nacional' em 'off' (I18). */
  const frescorPublico = (fr: LiveStatus['frescor'] | undefined, n: ChavesNoite): LiveStatus['frescor'] | undefined => {
    if (!fr || n.avisoNacional !== 'off') return fr;
    let mudou = false;
    const out: Partial<Record<string, FrescorCorrida>> = {};
    for (const [k, f] of Object.entries(fr)) {
      if (f && f.nacionalParadoDesde !== undefined) {
        const resto: FrescorCorrida = { ...f };
        delete resto.nacionalParadoDesde;
        out[k] = resto;
        mudou = true;
      } else out[k] = f;
    }
    return mudou ? out : fr;
  };

  /** LiveStatus público: + pessoas agora (piso e chave), anúncios com imagens por URL e fase 'encerrada' no TSE. */
  const statusPublico = (c: Ctx): LiveStatus => {
    const st = dados.status();
    const n = noite();
    const pessoasAgora = pessoasPublico(n);
    const out: LiveStatus = { ...st, ...(pessoasAgora !== undefined ? { pessoasAgora } : {}), ...anunciosParaSite(st, origemDe(c)) };
    if (st.fonte === 'tse' && st.fase === 'apurando' && tseEncerrado()) out.fase = 'encerrada';
    // troca automática esperando o TSE responder: aviso discreto (só se o admin não publicou um aviso próprio)
    if (!st.aviso && agendador.avisoPublico()) out.aviso = { nivel: 'info', texto: AVISO_AGUARDANDO_TSE };
    const frescor = frescorPublico(dados.frescor(), n); // fonte 'tse': marca dos números + última leitura boa (o app reconsulta na hora)
    if (frescor) out.frescor = frescor;
    return out;
  };

  // Com anúncios o corpo passa de 1 KB e sai comprimido (brotli): montado e comprimido no máximo 1×/s por origem e por
  // estado (versão, fase, aviso, frescor, chaves da noite) — sem CDN (contingência), o status é ~40% do tráfego. O
  // relógio (wallNow) e "pessoas agora" ficam até 1 s defasados, como já ficam na CDN (s-maxage=1). As chaves da noite
  // não mudam a versão (não invalidam o cache dos visitantes): entram na chave para valer já no mesmo segundo.
  app.get('/api/status', async (c) => {
    const st = dados.status();
    const fr = dados.frescor();
    vigia.observarMarca(fr?.pres?.marca, now());
    const n = noite();
    const chaveNoite = `${n.contadorPublico ? 1 : 0}${n.avisoNacional}${st.carga ? `${st.carga.fator}${st.carga.leve ? 'l' : ''}` : ''}`;
    const chave = `status|${origemDe(c)}|${st.versao}|${st.fase}|${st.aviso?.texto ?? ''}|${agendador.avisoPublico() ? 1 : 0}|${tseEncerrado() ? 1 : 0}|${fr ? hashCurto(JSON.stringify(fr)) : ''}|e${metricasAnuncios.geracaoEsgotados}|${chaveNoite}`;
    const { p, hit } = respostas.obter(chave, () => ({ bruto: Buffer.from(JSON.stringify(statusPublico(c))) }));
    metricas.cache(hit);
    return enviar(c, await p, { ...cacheDe('status'), 'access-control-allow-origin': '*' });
  });

  /**
   * Saúde da noite (I16; saude-noite.ts): `{ noite: 'ok' | 'atencao', motivo? }` para o monitor externo (palavra-chave
   * `"noite":"ok"`). Sempre 200, nunca guardado (no-store; na Cloudflare, regra de bypass). Mudança de estado vai ao log.
   */
  const saudeNoite = (): SaudeNoite => {
    const st = dados.status();
    const fr = dados.frescor();
    const t = now();
    vigia.observarMarca(fr?.pres?.marca, t);
    const tse = deps.tse.health();
    const fase = st.fonte === 'tse' && st.fase === 'apurando' && tseEncerrado() ? 'encerrada' : st.fase;
    const proprio = avaliarSaude({
      agora: t,
      encerrando,
      naoPronto: prontidao(),
      fonte: st.fonte,
      fase,
      tse,
      frescor: fr,
      presParadoDesde: vigia.paradoDesde,
      trocaAuto: agendador.info(),
      minutosRuins: vigia.minutosRuins,
    });
    let deles: SaudeNoite | null | undefined = null;
    try {
      deles = alertas?.saude?.();
    } catch (e) {
      log.erro('Saúde da noite: falha na avaliação dos alertas', e);
    }
    const r = unirSaude(proprio, deles);
    if (r.noite !== ultimaSaude) {
      ultimaSaude = r.noite;
      if (r.noite === 'atencao') log.aviso(`Saúde da noite: ATENÇÃO — ${r.motivo ?? 'sem motivo informado'}`);
      else log.info('Saúde da noite: ok de novo');
    }
    return r;
  };
  app.get('/api/saude-noite', (c) => c.json(saudeNoite(), 200, { 'cache-control': CC.privado }));

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
      'content-security-policy': CSP_IMAGEM,
      'x-content-type-options': 'nosniff',
    };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    return responder(c, c.req.method === 'HEAD' ? null : l.corpo, 200, headers);
  });

  // ---- anúncios: imagem, clique e impressão ---------------------------------------------------------
  /** Logo/peça de um anúncio pelo hash do conteúdo (cadastrado, no ar ou não). */
  app.get('/api/anuncio/img', (c) => {
    const h = c.req.query('h') ?? '';
    if (!/^[a-f0-9]{8,64}$/.test(h)) throw new ErroValidacao('Use /api/anuncio/img?h=<hash>.');
    sincAnuncios();
    const img = anuncios.obter(h);
    if (!img) throw new NotFoundError('Imagem de anúncio inexistente.');
    const etag = `"a-${img.h}"`;
    const headers: Record<string, string> = {
      'content-type': img.tipo,
      'cache-control': CC.anuncioImg,
      etag,
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
      'content-security-policy': CSP_IMAGEM,
      'x-content-type-options': 'nosniff',
    };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    return responder(c, c.req.method === 'HEAD' ? null : img.corpo, 200, headers);
  });

  /** Formato medido (`medidos`) que o anúncio usa. */
  const formatoValido = (f: unknown, de: readonly FormatoAnuncio[], medidos: readonly FormatoAnuncio[]): f is FormatoAnuncio =>
    typeof f === 'string' && medidos.includes(f as FormatoAnuncio) && de.includes(f as FormatoAnuncio);

  /**
   * O pedido é uma navegação de verdade (o visitante tocou no link)? Só GET (HEAD não conta), com Sec-Fetch-Dest
   * ausente ou 'document' (um <img>/<script> em outro site apontando para cá não conta) e Sec-Fetch-Site ausente,
   * 'same-origin' (o link no próprio site) ou 'none' (endereço digitado). Navegadores antigos não mandam os cabeçalhos.
   */
  const navegacaoDoSite = (c: Ctx): boolean => {
    if (c.req.method !== 'GET') return false;
    const dest = c.req.header('sec-fetch-dest');
    if (dest && dest !== 'document') return false;
    const site = c.req.header('sec-fetch-site');
    return !site || site === 'same-origin' || site === 'none';
  };

  /**
   * Evento de impressão mandado pelo próprio site: Origin do site OU Sec-Fetch-Site 'same-origin' (sendBeacon manda os
   * dois). Sem nenhum dos dois (curl, script fora do navegador), o pedido é aceito mas não conta.
   */
  const eventoDoSite = (c: Ctx): boolean => {
    const site = c.req.header('sec-fetch-site');
    if (site && site !== 'same-origin') return false;
    const o = c.req.header('origin');
    if (!o) return site === 'same-origin';
    return origemPermitida(c);
  };

  /**
   * Clique: anúncio cadastrado e no ar → conta (agregado; repetido do mesmo visitante, anúncio e formato em 30 min não
   * conta; robô não conta; só navegação de verdade a partir do site — `navegacaoDoSite`; só formatos com link) e 302
   * para o destino com UTM. Redireciona SEMPRE (contando ou não). Id desconhecido ou fora do ar → 302 para a home
   * (nunca redireciona para endereço vindo da URL: o destino é sempre o link cadastrado no painel).
   */
  app.get('/api/anuncio/ir/:id', (c) => {
    const id = c.req.param('id');
    const st = dados.status();
    const noAr = /^[a-z0-9-]{2,40}$/.test(id) ? st.anuncios?.find((a) => a.id === id) : undefined;
    sincAnuncios(st.versao);
    const cfg = noAr ? anuncios.config(id) : undefined;
    const h = { 'cache-control': CC.privado, 'x-robots-tag': 'noindex' };
    if (!noAr || !cfg) return c.body(null, 302, { ...h, location: '/' });
    const f = c.req.query('f');
    const formato = formatoValido(f, noAr.formatos, FORMATOS_COM_CLIQUE) ? f : null;
    if (formato && navegacaoDoSite(c) && !ehRobo(c.req.header('user-agent'))) {
      const k = contagemDe(c);
      if (limiteCliques(k)) metricasAnuncios.clique(id, formato, pessoasClique.pessoa(k, id));
    }
    return c.body(null, 302, { ...h, location: urlComUtm(cfg.url, cfg.id, formato ?? 'link') });
  });

  /**
   * Impressão VISÍVEL (o app manda quando o anúncio aparece na tela; navigator.sendBeacon → corpo text/plain com JSON).
   * Outro site → 403; sem Origin nem Sec-Fetch-Site → 204 sem contar (`eventoDoSite`); anúncio no ar com aquele formato
   * (e formato que aparece no site: 'compartilhamento' não é medido); repetida do mesmo visitante em 5 min não conta;
   * robô não conta.
   */
  app.post(
    '/api/anuncio/evento',
    bodyLimit({ maxSize: 2048, onError: (c) => c.json({ erro: 'Corpo grande demais.' }, 413, { 'cache-control': CC.privado }) }),
    async (c) => {
      // I11 (chave 'medir-anuncios' desligada no painel): 204 sem ler nem contar — alivia a origem no pico; os anúncios
      // seguem no ar e os cliques continuam contados
      if (!noite().medirAnuncios) return c.body(null, 204, { 'cache-control': CC.privado });
      if (!origemPermitida(c)) throw new ErroHttp(403, 'Origem não permitida.');
      const ct = c.req.header('content-type') ?? '';
      if (ct && !/^(application\/json|text\/plain)\b/i.test(ct)) throw new ErroHttp(415, 'Envie { id, formato } em JSON.');
      let corpo: unknown;
      try {
        corpo = JSON.parse(await c.req.text());
      } catch {
        throw new ErroValidacao('Envie { id, formato } em JSON.');
      }
      const { id, formato } = (corpo && typeof corpo === 'object' ? corpo : {}) as { id?: unknown; formato?: unknown };
      if (typeof id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(id) || typeof formato !== 'string')
        throw new ErroValidacao('Envie { id, formato } em JSON.');
      const a = dados.status().anuncios?.find((x) => x.id === id);
      if (!a) throw new NotFoundError('Anúncio fora do ar.');
      if (!formatoValido(formato, a.formatos, FORMATOS_COM_IMPRESSAO)) throw new ErroValidacao('Formato que este anúncio não usa ou que não é medido.');
      const k = contagemDe(c);
      if (!limiteEventos(k)) throw new ErroHttp(429, 'Muitos eventos; tente mais tarde.', { 'retry-after': '60' });
      if (eventoDoSite(c) && !ehRobo(c.req.header('user-agent'))) metricasAnuncios.impressao(id, formato, pessoasImpressao.pessoa(k, id));
      return c.body(null, 204, { 'cache-control': CC.privado });
    },
  );

  // chat ao vivo moderado (src/server/chat.ts): GET com cache de 1 s na CDN; POSTs só do próprio site; memória só.
  // Registro cifrado dos envios (chat-registro.ts): DESLIGADO sem CHAT_REGISTRO_CHAVE (decisão do dono e do advogado).
  // Chave errada (caminho com erro de digitação, PEM inválido, backup restaurado sem ela) NÃO derruba o site: o registro
  // fica desligado e a sala TRAVADA fechada (o dono decidiu exigir o registro; sem ele, a sala não abre).
  let registroChat: RegistroEnvios | null = null;
  let chatTravado: string | undefined;
  if (config.chatRegistroChave) {
    try {
      registroChat = new RegistroEnvios({
        dir: join(config.stateDir, 'chat-registro'),
        chavePublicaPem: readFileSync(config.chatRegistroChave, 'utf8'),
        now,
        aoFalhar: (e) => log.erro('Chat: falha ao gravar o registro de envios', e),
      });
    } catch (e) {
      chatTravado = 'Registro de envios configurado (CHAT_REGISTRO_CHAVE) mas inválido: a sala não abre sem ele. Veja os logs do servidor.';
      log.erro(`Chat: CHAT_REGISTRO_CHAVE (${config.chatRegistroChave}) ilegível ou inválida — registro DESLIGADO e sala TRAVADA fechada`, e);
    }
  }
  if (registroChat) log.aviso('Chat: registro cifrado dos envios LIGADO (CHAT_REGISTRO_CHAVE) — confira a /privacidade');
  const portaDe = (c: Ctx): number | null => {
    const h = config.chatRegistroHeaderPorta && config.trustProxy ? c.req.header(config.chatRegistroHeaderPorta) : undefined;
    const p = h !== undefined ? Number(h) : config.trustProxy ? NaN : Number(c.env?.incoming?.socket?.remotePort);
    return Number.isInteger(p) && p > 0 && p < 65536 ? p : null;
  };
  const chatSalvo = deps.chatStore?.ler() ?? null;
  const salaChat = SalaChat.doDataset(deps.dataset, {
    now,
    producao: config.producao,
    ensaio: config.chatEnsaio,
    registro: !!registroChat,
    travada: chatTravado,
    aoMudarConfig: deps.chatStore ? (cfg) => deps.chatStore!.salvar(cfg) : undefined,
  });
  if (chatSalvo !== null) {
    if (salaChat.restaurarConfig(chatSalvo)) {
      const cfg = salaChat.config();
      log.info(`Chat: configuração da sala restaurada (${cfg.aberta ? 'ABERTA' : 'fechada'}, modo lento ${cfg.lentoS} s${cfg.fixada ? ', com mensagem fixada' : ''})`);
    } else log.aviso(`Chat: ${deps.chatStore!.caminho} inválido — ignorado (a sala começa fechada)`);
  }
  registrarChatPublico(app, {
    sala: salaChat,
    clienteDe,
    redeDenunciaDe: redeLargaDe(48),
    origemPermitida,
    log,
    aoPublicar: registroChat
      ? (c, m) => registroChat.registrar({ id: m.id, em: m.em, ip: ipDe(c), porta: portaDe(c), apelido: m.apelido, texto: m.texto })
      : undefined,
  });

  app.get('/api/meta', async (c) => {
    const etag = etagFraco('meta', deps.dataset.meta.versao, hashCurto(deps.dataset.meta.geradoEm));
    const headers = { ...cacheDe('meta'), etag, 'access-control-allow-origin': '*' };
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

  // "Desde o 1º turno" no Brasil por município (src/server/desde-t1.ts): agregado com cache de 5 s, nunca baixa do TSE
  registrarDesdeT1(app, { dados, tse: deps.tse, races, now });

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
    borda: cdnCc,
    leve: () => noite().freio.leve,
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
  // 64 KB em geral; 1,5 MB no /command (o anúncio traz a logo, a versão para fundo escuro e a peça em data URI:
  // 150 + 150 + 400 KB, ~935 KB em JSON)
  const limite = (kb: number) => bodyLimit({ maxSize: kb * 1024, onError: (c) => c.json({ erro: 'Corpo grande demais.' }, 413) });
  const limitePadrao = limite(64);
  const limiteComando = limite(MAX_CORPO_COMANDO / 1024);
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

  /**
   * AdminSnapshot com o `pessoasAgora` e o aviso do status público (o painel mostra o mesmo do site) + servidor. As
   * imagens dos anúncios vão por URL (o painel consulta a cada 1 s: os data URIs não viajam a cada consulta).
   */
  const snapshotAdmin = (c: Ctx): AdminSnapshot => {
    const snap = controller.adminSnapshot(extraMetricas());
    const origem = origemDe(c);
    const aviso = !snap.status.aviso && agendador.avisoPublico() ? { nivel: 'info' as const, texto: AVISO_AGUARDANDO_TSE } : snap.status.aviso;
    const status: LiveStatus = { ...snap.status, aviso, pessoasAgora: metricas.pessoasAgora(), ...anunciosParaSite(snap.status, origem) };
    const state = { ...snap.state, anuncios: (snap.state.anuncios ?? []).map((a) => anuncios.paraPainel(a, origem)) };
    return { ...snap, state, status, servidor: servidorInfo() };
  };

  admin.get('/state', (c) => c.json(snapshotAdmin(c)));

  admin.post('/command', async (c) => {
    let cmd = parseAdminCommand(await lerJson(c));
    // imagem que voltou do painel como URL deste servidor → o conteúdo (editar sem trocar a imagem não a perde)
    if (cmd.tipo === 'anuncio-salvar') {
      sincAnuncios();
      cmd = { ...cmd, anuncio: anuncios.resolverAnuncio(cmd.anuncio) };
    } else if (cmd.tipo === 'anuncio-logo') {
      sincAnuncios();
      cmd = anuncios.resolverAnuncio(cmd);
    }
    if (motivoSim && ligaSimulacao(cmd)) {
      log.aviso(`Admin: comando "${cmd.tipo}" recusado — simulação bloqueada em produção (ALLOW_SIMULACAO)`);
      throw new ErroHttp(403, motivoSim);
    }
    // ---- leva 3: ações do próprio servidor (o motor não as executa; lá dariam "indisponível nesta versão") ----------
    if (cmd.tipo === 'tse-retomar') {
      // I03 (frente B): falso positivo de bloqueio → retoma as leituras do TSE já, sem esperar a pausa acabar
      const tse = deps.tse as Omit<TseManager, 'retomar'> & { retomar?: () => unknown };
      if (typeof tse.retomar !== 'function') throw new ErroHttp(400, 'Retomar as leituras do TSE: indisponível nesta versão.');
      const r = (await tse.retomar()) as { detalhe?: unknown } | null | undefined;
      log.info(`Admin: comando "tse-retomar" — ${typeof r?.detalhe === 'string' ? r.detalhe : 'leituras do TSE retomadas agora'}`);
      return c.json(snapshotAdmin(c));
    }
    if (cmd.tipo === 'alerta-teste') {
      // I16 (frente B): mensagem de teste aos alertas (Telegram), se configurados
      if (!alertas?.teste) throw new ErroHttp(400, 'Alerta de teste: indisponível nesta versão (alertas não ligados).');
      const r = await alertas.teste();
      if (!r.ok) {
        log.aviso(`Admin: alerta de teste não enviado — ${r.detalhe}`);
        throw new ErroHttp(400, `Alerta de teste não enviado: ${r.detalhe}`);
      }
      log.info(`Admin: alerta de teste enviado — ${r.detalhe}`);
      return c.json(snapshotAdmin(c));
    }
    controller.command(cmd);
    // chaves da noite: valem já (a leitura guardada por 1 s é renovada)
    noiteMemo = null;
    // anúncio removido: os links de relatório dele morrem junto (um id recriado não reabre o link antigo)
    if (cmd.tipo === 'anuncio-remover') relatorios.revogarDoAnuncio(cmd.id);
    // meta aumentada/retirada ou anúncio novo com meta: o site reflete já, sem esperar os 15 s
    if (cmd.tipo.startsWith('anuncio')) verificarMetas();
    const s = controller.state();
    if (cmd.tipo === 'fonte' || cmd.tipo === 'tse' || cmd.tipo === 'relogio' || cmd.tipo === 'troca-auto' || cmd.tipo === 'aviso-nacional')
      deps.tse.sincronizar(s.fonte, s.tse);
    log.info(`Admin: comando "${cmd.tipo}"${'acao' in cmd ? ` (${cmd.acao})` : ''} aplicado (versão ${s.versao}, fonte ${s.fonte})`);
    // "tentar agora": não espera o próximo segundo do agendador
    if (cmd.tipo === 'troca-auto' && cmd.acao === 'agora') void agendador.tick();
    return c.json(snapshotAdmin(c));
  });

  /**
   * Relatório de entrega dos anúncios (agregado: impressões visíveis e cliques por anúncio × formato × hora; `?horas=`
   * de 1 a 336, padrão 48), mais o entregue desde o início dos anúncios com meta, as metas atingidas e o alcance
   * estimado (campanha e noite da eleição).
   */
  admin.get('/anuncios/metricas', (c) => {
    const q = c.req.query('horas');
    const horas = q === undefined || q === '' ? HORAS_PAINEL : Number(q);
    if (!Number.isInteger(horas) || horas < 1 || horas > HORAS_DETALHE) throw new ErroValidacao(`Use ?horas= de 1 a ${HORAS_DETALHE}.`);
    sincAnuncios();
    const cfgs = anuncios.todos();
    const entregue: Record<string, number> = {};
    for (const a of cfgs) if (a.limiteImpressoes && a.inicio) entregue[a.id] = metricasAnuncios.entregueDesde(a.id, a.inicio);
    const alcance: NonNullable<MetricasAnunciosResposta['alcance']> = {};
    for (const id of new Set([...cfgs.map((a) => a.id), ...metricasAnuncios.alcance.ids()])) alcance[id] = alcanceDe(id, anuncios.config(id)?.inicio);
    const r: MetricasAnunciosResposta = {
      metricas: metricasAnuncios.lista(horas),
      desde: metricasAnuncios.desde,
      entregue,
      esgotadoEm: Object.fromEntries(metricasAnuncios.esgotadoEm),
      alcance,
    };
    return c.json(r);
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
  registrarChatAdmin(admin, { sala: salaChat, log });
  // audiência agregada, "Siga o Sintonia" e pedidos de anunciantes (src/server/crescimento.ts): rotas públicas e do painel
  const crescimento = registrarCrescimento(app, admin, {
    now,
    log,
    clienteDe,
    redeLargaDe: redeLargaDe(56),
    origemPermitida,
    pessoasAgora: () => metricas.pessoasAgora(),
    stores: deps.crescimentoStores,
    // produção: o formulário só abre com um e-mail de privacidade configurado no painel (canal para retirar o consentimento)
    formularioFechado: () => (config.producao && !contatosEfetivos(dados.status().contatos).privacidade ? 'O formulário abre em breve.' : null),
  });

  // relatório do anunciante por link privado (src/server/relatorios.ts): rota pública + links no painel
  const relatoriosLigados = deps.relatorios ?? process.env.RELATORIOS !== '0';
  if (!relatoriosLigados) log.aviso('Relatórios dos anunciantes DESLIGADOS (RELATORIOS=0): /api/anuncie/relatorio responde 404');
  const relatoriosStore =
    deps.relatoriosStore ?? createJsonStore(config.stateDir, 'relatorios.json', { debounceMs: 1000, onErro: (e) => log.erro('Falha ao salvar os links de relatório', e) });
  /** Relatório de entrega de um anúncio (agregado), como a página /relatorio recebe. null = anúncio removido. */
  const relatorioDe = (id: string, mostrarMeta: boolean, origem: string): RelatorioAnunciante | null => {
    sincAnuncios();
    const cfg = anuncios.config(id);
    if (!cfg) return null;
    const t = now();
    const esgotado = metricasAnuncios.esgotadoEm.has(id);
    const situacao: SituacaoRelatorio = esgotado
      ? 'meta-atingida'
      : cfg.fim && t >= cfg.fim
        ? 'encerrado'
        : dados.status().anunciosSuspensos
          ? 'suspenso'
          : !cfg.ativo
            ? 'pausado'
            : cfg.inicio && t < cfg.inicio
              ? 'agendado'
              : 'no-ar';
    const r: RelatorioAnunciante = {
      geradoEm: t,
      desde: metricasAnuncios.desde,
      // imagens por URL; sem link de clique (a página do relatório não conta clique)
      anuncio: { ...anuncios.publico(anuncioPublico(cfg), origem), href: '' },
      situacao,
      inicio: cfg.inicio ?? null,
      fim: cfg.fim ?? null,
      // só a partir do início da campanha (como a meta e o alcance)
      ...metricasAnuncios.paraRelatorio(id, cfg.inicio),
      alcance: {
        ...alcanceDe(id, cfg.inicio),
        segmentos: {
          campanha: metricasAnuncios.alcance.segmentosCom(id, 'campanha', cfg.inicio),
          noite: metricasAnuncios.alcance.segmentosCom(id, 'noite'),
        },
      },
    };
    if (mostrarMeta && cfg.limiteImpressoes && cfg.inicio) r.meta = { limite: cfg.limiteImpressoes, entregue: metricasAnuncios.entregueDesde(id, cfg.inicio) };
    return r;
  };
  const relatorios = registrarRelatorios(app, admin, {
    now,
    log,
    ligado: relatoriosLigados,
    store: relatoriosStore,
    origemPermitida,
    redeDe: clienteDe,
    origemDe,
    anuncioExiste: (id) => {
      sincAnuncios();
      return !!anuncios.config(id);
    },
    relatorio: relatorioDe,
  });

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
      // fase PÚBLICA (a do /api/status): na fonte TSE o motor fica em 'apurando' e o 'encerrada' vem de tseEncerrado()
      fase: () => {
        const st = dados.status();
        return st.fonte === 'tse' && st.fase === 'apurando' && tseEncerrado() ? 'encerrada' : st.fase;
      },
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
      if (cspMemo?.tpl !== tpl) cspMemo = { tpl, pagina: cspPagina(tpl, false, config.publicUrl), embed: cspPagina(tpl, true, config.publicUrl) };
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
        // anunciante das imagens ("Oferecimento", só nos cartões genéricos) trocado → outra URL de imagem (CDN e apps
        // buscam a nova); as imagens com candidato ou resultado nunca levam anúncio e não mudam de URL por isso
        const of = imagemComOferecimento(m.imagem) ? tagOferecimento(st.anuncios) : '';
        const vImg = `${m.imagemVersao ?? versaoImg}${of ? `-${of}` : ''}`;
        const html = injetarMeta(tpl, m, origem, `${origem}${canonico}`, vImg, { twitterSite: config.twitterSite });
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
      // I05 (chave 'html-borda', padrão desligada): a borda guarda o HTML 15 s e o serve por até 1 dia se a origem cair.
      // O navegador continua com no-cache. Nunca no admin, nos widgets, no Duelo (o código vai na URL), no relatório
      // do anunciante, na página "não encontrada" nem em erro.
      if (cdnCc && corpo.status === 200 && !embed && !htmlForaDaBorda(path) && noite().htmlBorda) headers[CABECALHO_BORDA] = CC_BORDA.html;
      return responder(c, head ? null : body, corpo.status, headers);
    });
  }

  /** Resumo do último minuto (para o log operacional): texto + campos (no log JSON, um objeto por minuto). */
  const resumoMinuto = (): { msg: string; campos: Record<string, number> } | null => {
    const r = metricas.fecharMinuto();
    vigia.minuto(r); // saúde da noite: minutos seguidos com 5xx > 1% ou p99 > 1 s
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
    clearInterval(timerMetas);
    agendador.parar();
    metricas.pararEventLoop();
  };

  /** Grava as métricas dos anúncios (se houver contagem nova) e os links de relatório pendentes, e espera terminar. */
  const persistirMetricasAnuncios = async (): Promise<void> => {
    await relatorios.persistir();
    const store = deps.metricasAnunciosStore;
    if (!store) return;
    if (metricasAnuncios.sujo) {
      metricasAnuncios.sujo = false;
      store.salvar(metricasAnuncios.toJSON());
    }
    await store.flush();
  };

  return {
    app,
    dados,
    metricas,
    respostas,
    sessoes,
    estaticos,
    resumoMinuto,
    msgErro,
    agendador,
    aplicarTravas,
    encerrar,
    prontidao,
    metricasAnuncios,
    persistirMetricasAnuncios,
    verificarMetas,
    relatorios,
    crescimento,
    /** Chaves da noite em vigor (leitura guardada por 1 s; ver `noite` acima): para os módulos das outras frentes. */
    noite,
    /** Saúde da noite (a mesma do GET /api/saude-noite). */
    saudeNoite,
    /** Liga os alertas da noite depois da criação (main.ts, frente B): saúde somada e 'alerta-teste'. */
    ligarAlertas: (a: AlertasApp | null) => {
      alertas = a;
    },
  };
}

export type SintoniaApp = ReturnType<typeof createApp>;
