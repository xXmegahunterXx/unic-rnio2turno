/**
 * Aplicação Hono (sem I/O de subida): API pública, admin, OG images, estáticos + meta tags e /healthz.
 * `main.ts` monta as dependências (dataset, controller, persistência) e sobe o servidor; os testes usam
 * `createApp(...).app.request(...)` diretamente.
 *
 * Contrato das rotas: src/shared/api.ts. Cache para CDN: ARCHITECTURE.md §6.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { HttpBindings } from '@hono/node-server';
import type { AdminMetrics, LiveStatus, Race, RaceId, UF } from '../shared/types';
import type { MunicipiosBr } from '../shared/dataset';
import type { LoadedDataset, Controller } from '../engine/api';
import { NotFoundError } from '../engine/api';
import { COOKIE_SESSAO, LimiteTaxa, SESSAO_MS, Sessoes, chaveCliente, senhaConfere } from './auth';
import type { ServerConfig } from './config';
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
import { injetarMeta, metaDaRota, type ContextoMeta } from './meta-tags';
import { Metricas } from './metrics';
import { layoutPlacar, layoutTeste, renderPng } from './og';
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
}

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
  og: 'public, max-age=30, s-maxage=30, stale-while-revalidate=60',
  ogTeste: 'public, max-age=86400, s-maxage=86400',
  html: 'no-cache',
  privado: 'no-store',
} as const;

const OG_TTL_MS = 30_000;
/** Grupo padrão do pacote de fotos oficiais (public/data/fotos/{grupo}.json) quando o candidato não diz. */
const GRUPO_FOTOS_PADRAO = 'segundo-turno';
/** Imagem vencida da mesma fonte ainda serve (enquanto a nova é gerada) por até 5 min. */
const OG_STALE_MS = 5 * 60_000;
const OG_CACHE_MAX = 128;
const OG_FILA_MAX = 16;

type Ctx = Context<{ Bindings: HttpBindings }>;

/** Imagem OG pronta: PNG, se usou fotos oficiais e o "versão|modo" do estado com que foi gerada. */
interface OgPronta {
  png: Buffer;
  fotos: boolean;
  sub: string;
}

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
  const sessoes = new Sessoes(config.adminSecret, now);
  const limiteLogin = new LimiteTaxa(10, 60_000, now);
  const limiteLoginGlobal = new LimiteTaxa(300, 60_000, now);
  const salCliente = randomBytes(16);
  const estaticos = config.serveStatic ? new Estaticos(config.distDir) : null;
  const races = new Map<string, Race>(controller.meta().races.map((r) => [r.id.toLowerCase(), r]));
  const nomes = new Map<string, string>();
  for (const [uf, d] of Object.entries(deps.dataset.ufs)) for (const m of d?.municipios ?? []) nomes.set(`${uf}|${m.cod}`, m.nome);
  const nomeMunicipio = (uf: UF, cod: string) => nomes.get(`${uf}|${cod}`);
  const ogCache = new Map<string, { png: Buffer | null; fotos: boolean; em: number; sub: string; pendente: Promise<OgPronta> | null }>();
  let ogFila: Promise<unknown> = Promise.resolve();
  let ogNaFila = 0;
  let ogTeste: Promise<Buffer> | null = null;

  // ---- utilidades --------------------------------------------------------------------------------
  const ipDe = (c: Ctx): string => {
    if (config.trustProxy) {
      const h =
        c.req.header('cf-connecting-ip') ??
        c.req.header('fly-client-ip') ??
        c.req.header('x-real-ip') ??
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (h) return h;
    }
    return c.env?.incoming?.socket?.remoteAddress ?? 'desconhecido';
  };
  const clienteDe = (c: Ctx) => chaveCliente(ipDe(c), salCliente);

  const origemDe = (c: Ctx): string => {
    if (config.publicUrl) return config.publicUrl;
    const u = new URL(c.req.url);
    const proto = (config.trustProxy && c.req.header('x-forwarded-proto')?.split(',')[0]?.trim()) || u.protocol.replace(':', '');
    const host = (config.trustProxy && c.req.header('x-forwarded-host')) || c.req.header('host') || u.host;
    return `${proto}://${host}`;
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

  // ---- middlewares -------------------------------------------------------------------------------
  app.use('*', async (c, next) => {
    const t0 = perf();
    const path = c.req.path;
    const api = path.startsWith('/api/');
    if (api) metricas.clientes.registrar(ipDe(c)); // vira 1 bit com sal (ClientesAtivos); o IP não é guardado
    await next();
    // headers direto no objeto (c.header() após o fim recriaria a Response e perderia o envio rápido do node-server)
    const h = c.res.headers;
    h.set('x-content-type-options', 'nosniff');
    h.set('referrer-policy', 'strict-origin-when-cross-origin');
    if (config.producao) h.set('strict-transport-security', 'max-age=15552000; includeSubDomains');
    const ms = perf() - t0;
    if (api || path === '/healthz') metricas.requisicao(ms, c.res.status);
    if (c.res.status >= 500) log.erro(`${c.req.method} ${caminhoParaLog(path)} → ${c.res.status} (${ms.toFixed(1)} ms)`);
  });

  app.onError((err, c) => {
    const e = err as Error & { status?: number; headers?: Record<string, string> };
    const status = typeof e.status === 'number' && e.status >= 400 && e.status < 600 ? e.status : 500;
    if (status >= 500) log.erro(`Erro em ${c.req.method} ${caminhoParaLog(c.req.path)}`, err);
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
      },
      200,
      { 'cache-control': CC.privado },
    );
  });

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

  // ---- OG images ---------------------------------------------------------------------------------
  /**
   * Renderização serial (satori ocupa a thread principal ~0,2–0,3 s por imagem): uma por vez, no máximo
   * OG_FILA_MAX na fila. Imagem vencida (> 30 s) do MESMO modo é servida na hora enquanto a nova é gerada
   * em segundo plano; troca de modo (real ↔ simulação, nomes reais ↔ anonimizado) sempre espera a imagem nova
   * (a marca "SIMULAÇÃO" nunca pode faltar nem sobrar, e nome/foto real nunca acompanha número fictício).
   * `sub` = "versão|modo" do estado com que a imagem foi gerada.
   */
  const modoOg = (st: LiveStatus) => `${st.fonte}${st.anonimizado ? '-anon' : ''}`;

  const renderOg = (chave: string, montar: () => Promise<OgPronta>): Promise<OgPronta> => {
    let e = ogCache.get(chave);
    if (!e) {
      e = { png: null, fotos: false, em: 0, sub: '', pendente: null };
      ogCache.set(chave, e);
      while (ogCache.size > OG_CACHE_MAX) ogCache.delete(ogCache.keys().next().value as string);
    }
    if (e.pendente) return e.pendente;
    if (ogNaFila >= OG_FILA_MAX) throw new ErroHttp(503, 'Gerando muitas imagens agora; tente de novo em instantes.', { 'retry-after': '10' });
    const ent = e;
    ogNaFila++;
    const p: Promise<OgPronta> = ogFila.catch(() => undefined).then(async () => {
      try {
        const pronta = await montar();
        Object.assign(ent, { png: pronta.png, fotos: pronta.fotos, em: now(), sub: pronta.sub });
        return pronta;
      } finally {
        ogNaFila--;
        ent.pendente = null;
      }
    });
    ogFila = p;
    ent.pendente = p;
    p.catch((err) => log.erro(`Falha ao gerar a imagem OG ${chave}`, err));
    return p;
  };

  /**
   * Fotos oficiais (pacote DATA_DIR/fotos/{grupo}.json, chave = Candidate.sqcand) para o placar da imagem:
   * nunca na simulação anonimizada; só quando há foto de TODOS os finalistas (tratamento igual).
   */
  const fotosOg = (race: Race, anonimizado: boolean): string[] | undefined => {
    if (anonimizado) return undefined;
    const lista = race.candidatos.map((cd) => (cd.agregado || !cd.sqcand ? null : fotos.foto(cd.fotoGrupo || GRUPO_FOTOS_PADRAO, cd.sqcand)));
    const finalistas = race.candidatos.map((cd, i) => (cd.agregado ? -1 : i)).filter((i) => i >= 0);
    return finalistas.length >= 2 && finalistas.every((i) => lista[i]) ? lista.map((f) => f ?? '') : undefined;
  };

  app.get('/api/og/apuracao.png', async (c) => {
    const race = parseRace(c.req.query('race') || 'pres');
    const r = dados.race(race);
    const ufQ = c.req.query('uf');
    const uf = ufQ ? parseUf(ufQ) : undefined;
    if (uf && !r.ufs.includes(uf)) throw new NotFoundError(`A UF ${uf} não participa da corrida ${r.id}.`);
    const st = dados.status();
    const chave = `${r.id}|${uf ?? 'br'}`;
    const sub = `${st.versao}|${modoOg(st)}`;
    const montar = async (): Promise<OgPronta> => {
      const t0 = perf();
      const snap = uf ? await dados.uf(r.id, uf) : await dados.nacional(r.id);
      const resumo = snap.resumo;
      const agoraSt = dados.status();
      const simulacao = agoraSt.simulacao && r.turno === 2;
      const anon = !!agoraSt.anonimizado;
      const fonteTse = dados.fonteDe(r.id) === 'tse';
      const raceOg = races.get(snap.race) ?? r;
      const fotosPlacar = fotosOg(raceOg, anon);
      const png = await renderPng(
        layoutPlacar({
          // simulação anônima: nada de nome nem foto real em imagem com números fictícios
          race: anon ? anonimizarRace(raceOg) : raceOg,
          uf,
          resumo,
          simulacao,
          horario: simulacao ? snap.simNow : fonteTse ? (resumo.ultimaAtualizacao ?? snap.geradoEm) : snap.geradoEm,
          pre: r.turno === 2 && resumo.secoesTotalizadas === 0,
          fotos: fotosPlacar,
        }),
      );
      log.info(
        `OG ${r.id}${uf ? `/${uf}` : ''} gerada em ${Math.round(perf() - t0)} ms (${Math.round(png.length / 1024)} KB` +
          `${fotosPlacar ? ', com fotos oficiais' : ''})`,
      );
      return { png, fotos: !!fotosPlacar, sub: `${agoraSt.versao}|${modoOg(agoraSt)}` };
    };

    const e = ogCache.get(chave);
    const agora = now();
    const mesmoModo = !!e?.png && e.sub.split('|')[1] === modoOg(st);
    let pronta: OgPronta;
    let em: number;
    if (e?.png && e.sub === sub && agora - e.em < OG_TTL_MS) {
      [pronta, em] = [{ png: e.png, fotos: e.fotos, sub: e.sub }, e.em]; // fresca
    } else if (e?.png && mesmoModo && agora - e.em < OG_STALE_MS) {
      [pronta, em] = [{ png: e.png, fotos: e.fotos, sub: e.sub }, e.em]; // vencida: serve já e renova em segundo plano
      try {
        void renderOg(chave, montar).catch(() => undefined);
      } catch {
        /* fila cheia: segue com a vencida */
      }
    } else {
      pronta = await renderOg(chave, montar);
      // a geração em andamento podia ser do modo anterior (ex.: nomes reais → anonimizado): gera de novo
      if (pronta.sub.split('|')[1] !== modoOg(dados.status())) pronta = await renderOg(chave, montar);
      em = ogCache.get(chave)?.em ?? agora;
    }
    const etag = etagFraco('og', hashCurto(chave), hashCurto(pronta.sub), em.toString(36));
    const headers = {
      'content-type': 'image/png',
      'cache-control': CC.og,
      etag,
      'access-control-allow-origin': '*',
      'x-og-fotos': pronta.fotos ? '1' : '0',
    };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    return responder(c, pronta.png, 200, headers);
  });

  app.get('/api/og/teste.png', async (c) => {
    ogTeste ??= renderPng(layoutTeste());
    ogTeste.catch(() => (ogTeste = null));
    const png = await ogTeste;
    return responder(c, png, 200, {
      'content-type': 'image/png',
      'cache-control': CC.ogTeste,
      'access-control-allow-origin': '*',
    });
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
      maxAge: Math.floor(SESSAO_MS / 1000),
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

  /** AdminSnapshot com o `pessoasAgora` do status público (o painel mostra o mesmo número do site). */
  const snapshotAdmin = () => {
    const snap = controller.adminSnapshot(extraMetricas());
    return { ...snap, status: { ...snap.status, pessoasAgora: metricas.pessoasAgora() } };
  };

  admin.get('/state', (c) => c.json(snapshotAdmin()));

  admin.post('/command', async (c) => {
    const cmd = parseAdminCommand(await lerJson(c));
    controller.command(cmd);
    const s = controller.state();
    if (cmd.tipo === 'fonte' || cmd.tipo === 'tse' || cmd.tipo === 'relogio') deps.tse.sincronizar(s.fonte, s.tse);
    log.info(`Admin: comando "${cmd.tipo}" aplicado (versão ${s.versao})`);
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
    const ctxMeta: ContextoMeta = {
      races,
      nomeMunicipio,
      placar(race, uf) {
        if (dados.fonteDe(race) === 'tse') return null;
        const r = dados.race(race);
        const snap = uf ? controller.uf(race, uf) : controller.nacional(race);
        const raceMeta = races.get(snap.race) ?? r;
        const st = dados.status();
        return {
          resumo: snap.resumo,
          simulacao: st.simulacao && r.turno === 2,
          race: st.anonimizado ? anonimizarRace(raceMeta) : raceMeta,
        };
      },
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
      const raceQ = url.searchParams.get('race');
      const st = dados.status();
      const versaoImg = `${st.versao}-${Math.floor(now() / 60_000).toString(36)}`;
      const chave = `html|${path}|${raceQ ?? ''}|${versaoImg}`;
      let status: 200 | 404 = 200;
      const { p } = respostas.obter(chave, () => {
        const m = metaDaRota(path, url.searchParams, ctxMeta);
        const origem = origemDe(c);
        const pagina = `${origem}${path}${raceQ && races.has(raceQ.toLowerCase()) ? `?race=${raceQ.toLowerCase()}` : ''}`;
        const html = injetarMeta(tpl, m, origem, pagina, versaoImg);
        return Object.assign({ bruto: Buffer.from(html) }, { status: m.status });
      });
      const corpo = (await p) as CorpoPronto & { status: 200 | 404 };
      status = corpo.status;
      const cod = negociar(c.req.header('accept-encoding'));
      const body = await corpoCodificado(corpo, cod);
      const headers: Record<string, string> = {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': CC.html,
        vary: 'Accept-Encoding',
        'x-frame-options': 'SAMEORIGIN',
        'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      };
      if (body !== corpo.bruto && cod) headers['content-encoding'] = cod;
      if (path.startsWith('/admin') || path.startsWith('/duelo/')) headers['x-robots-tag'] = 'noindex';
      return responder(c, head ? null : body, status, headers);
    });
  }

  /** Resumo do último minuto (para o log operacional). */
  const resumoMinuto = () => {
    const r = metricas.fecharMinuto();
    if (r.requisicoes === 0) return null;
    return (
      `Último minuto: ${r.requisicoes} req (${Math.round(r.requisicoes / 60)}/s) · processamento p50 ${r.p50.toFixed(2)} ms · ` +
      `p95 ${r.p95.toFixed(2)} ms · p99 ${r.p99.toFixed(2)} ms · máx ${r.max.toFixed(0)} ms` +
      ` · cache ${(r.cacheHit * 100).toFixed(0)}% · 304: ${r.respostas304} · 5xx: ${r.erros5xx}` +
      ` · clientes ~${metricas.clientes.estimar()}`
    );
  };

  return { app, dados, metricas, respostas, sessoes, estaticos, resumoMinuto, msgErro };
}

export type SintoniaApp = ReturnType<typeof createApp>;
