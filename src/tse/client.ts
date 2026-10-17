/**
 * Cliente HTTP do feed oficial do TSE.
 *
 *  - `fetch` injetável (testes sem rede; Node 20+ e navegador usam o global).
 *  - Timeout por tentativa (AbortController), retry com backoff exponencial + jitter em erro de rede, timeout e 5xx
 *    (503 respeita Retry-After). 404/410 e o 403 em XML do S3 (NoSuchKey/AccessDenied) de arquivo NUNCA lido não são
 *    erro: viram `{ status: 'ausente' }` (o TSE publica arquivos aos poucos; ausência é estado normal).
 *  - Requisição condicional (If-None-Match / If-Modified-Since): o CDN do TSE devolve ETag e Last-Modified e responde
 *    304 (verificado). O chamador guarda os validadores junto do valor já mapeado (compacto) — o cliente não retém
 *    corpos em memória.
 *  - Concorrência global limitada (≤ 8, por respeito ao servidor) com 3 prioridades.
 *  - I03 — teto de pedidos por segundo (balde de fichas GLOBAL): `limitePorSeg` (padrão 40, 5–90; `TSE_LIMITE_POR_SEG`),
 *    rajada de até 1 s de teto (sem passar de 100 pedidos num mesmo segundo, o limite publicado pelo TSE), e uma FATIA
 *    RESERVADA (40% da rajada) para os arquivos das disputas (Brasil e UFs, opção
 *    `reservado`): os outros pedidos só usam uma ficha quando sobra mais que a reserva, e os reservados passam na frente
 *    da fila. Cada tentativa (inclusive as retentativas) gasta uma ficha. Em qualquer janela de T segundos saem no
 *    máximo `limitePorSeg × T + rajada` pedidos.
 *  - I03 — bloqueio do TSE (`TseBloqueioError`): 429; 403 com `Server: AkamaiGHost` ou página HTML "Access Denied";
 *    403 num arquivo que já deu 200/304. O cliente PAUSA TUDO (nenhum pedido sai) até o Retry-After ou, sem ele,
 *    por 11 min; os pedidos durante a pausa falham na hora com `TseBloqueioError` (`semPedido: true`), e a fila de
 *    espera é esvaziada. `retomar()` encerra a pausa antes (botão "Retomar agora" do painel, para falso positivo).
 *    Quem quiser saber do início/fim da pausa assina `aoMudarBloqueio`.
 *  - Estatísticas para `health()`.
 *
 * Isomórfico: só usa fetch, AbortController e setTimeout.
 */
import { TSE_LIMITE_POR_SEG } from '../shared/constants';
import type { ModoPausaTse } from '../shared/types';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type Prioridade = 'alta' | 'normal' | 'baixa';

export interface Validadores {
  etag?: string;
  lastModified?: string;
}

export type TseResposta<T> =
  | { status: 'ok'; data: T; validadores: Validadores; url: string; ms: number }
  | { status: 'nao-modificado'; validadores: Validadores; url: string; ms: number }
  | { status: 'ausente'; httpStatus: number; url: string; ms: number };

export interface TseRequisicaoOpcoes {
  validadores?: Validadores;
  prioridade?: Prioridade;
  /**
   * Arquivo de uma disputa (Brasil ou UF, lido no laço de consulta): usa a fatia reservada do balde de fichas e passa na
   * frente dos demais pedidos na fila. Padrão false.
   */
  reservado?: boolean;
  signal?: AbortSignal;
  /** Sobrescreve o timeout padrão (ms). */
  timeoutMs?: number;
  /** Sobrescreve o número de tentativas. */
  tentativas?: number;
}

export interface TseClientOptions {
  /** https://resultados.tse.jus.br/oficial */
  baseUrl: string;
  fetch?: FetchLike;
  /** Timeout por tentativa. Padrão 10 s. */
  timeoutMs?: number;
  /** Tentativas totais (1 = sem retry). Padrão 3. */
  tentativas?: number;
  /** Base do backoff exponencial. Padrão 500 ms (500, 1000, 2000… com jitter ±50%, teto 8 s). */
  backoffMs?: number;
  /** Requisições simultâneas (1–8). Padrão 6. */
  concorrencia?: number;
  /** Teto de pedidos por segundo (I03). Padrão `TSE_LIMITE_POR_SEG.padrao` (40); limitado a 5–90. */
  limitePorSeg?: number;
  /**
   * Sem o balde de fichas (nenhum teto por segundo). SÓ para testes que não são sobre o teto (com relógio falso parado,
   * o balde não se reabasteceria). Padrão false.
   */
  semTeto?: boolean;
  /** Pausa quando o TSE bloqueia sem Retry-After (ms). Padrão 11 min. */
  pausaPadraoMs?: number;
  /**
   * Quando pausar (chave 'pausa-tse' do painel), lido a cada 429/403: 'auto' (padrão) = 429, borda do TSE ou 403 num
   * arquivo já lido; 'restrita' = só 429 e borda do TSE; 'off' = nunca (429 vira erro comum; 403, "ausente").
   */
  modoPausa?: () => ModoPausaTse;
  /** Envia If-None-Match/If-Modified-Since. Padrão true. */
  condicional?: boolean;
  /** Cabeçalhos extras (ex.: User-Agent identificável no servidor). */
  headers?: Record<string, string>;
  /** Relógio dos instantes expostos (estatísticas, pausa). Padrão Date.now. */
  now?: () => number;
  /**
   * Relógio do balde de fichas (precisa andar de verdade: o `now` dos testes pode ser fixo). Padrão `Date.now()` lido a
   * cada uso (acompanha os relógios falsos do vitest).
   */
  relogioBalde?: () => number;
  /** Espera injetável (testes). */
  sleep?: (ms: number) => Promise<void>;
  /** Aleatoriedade injetável (jitter; testes). */
  random?: () => number;
}

/** Por que o TSE foi considerado bloqueando as leituras. */
export type MotivoBloqueio = 'http-429' | 'akamai' | 'acesso-negado' | 'arquivo-ja-lido';

export const MOTIVO_BLOQUEIO_TEXTO: Record<MotivoBloqueio, string> = {
  'http-429': 'HTTP 429 (pedidos demais)',
  akamai: 'HTTP 403 da borda do TSE (Akamai)',
  'acesso-negado': 'HTTP 403 "Access Denied"',
  'arquivo-ja-lido': 'HTTP 403 num arquivo já lido antes',
};

/** Pausa em curso (todas as leituras do TSE paradas). */
export interface BloqueioTse {
  /** início da pausa (epoch ms) */
  desde: number;
  /** nova tentativa a partir deste instante (epoch ms) */
  ate: number;
  motivo: MotivoBloqueio;
  httpStatus: number;
  /** caminho do arquivo que recebeu o bloqueio (sem a base) */
  arquivo: string;
  /** a duração veio do Retry-After do TSE (senão, a pausa padrão de 11 min) */
  porRetryAfter: boolean;
}

export interface TseClientStats {
  requisicoes: number;
  ok: number;
  naoModificado: number;
  ausente: number;
  erros: number;
  retentativas: number;
  emVoo: number;
  naFila: number;
  /** média móvel exponencial da latência das respostas (ms) */
  latenciaMs: number | null;
  ultimoSucesso: number | null;
  ultimoErro: { t: number; url: string; msg: string } | null;
  /** teto de pedidos por segundo em vigor (I03) */
  limitePorSeg: number;
  /** pedidos feitos nos últimos 10 s e o maior número num mesmo segundo do último minuto */
  ritmo: { ultimos10s: number; picoSeg: number };
  /** pausas por bloqueio do TSE desde a subida e pedidos recusados sem sair (pausa em curso) */
  bloqueios: number;
  recusadosNaPausa: number;
}

export class TseHttpError extends Error {
  readonly status: number | null;
  readonly url: string;
  constructor(msg: string, url: string, status: number | null) {
    super(msg);
    this.name = 'TseHttpError';
    this.url = url;
    this.status = status;
  }
}

/**
 * O TSE está limitando as leituras (ver o cabeçalho). `semPedido` = recusado antes de sair, porque a pausa já estava em
 * curso (nada foi pedido ao TSE: não vale registrar no log de novo).
 */
export class TseBloqueioError extends TseHttpError {
  readonly ate: number;
  readonly motivo: MotivoBloqueio;
  readonly semPedido: boolean;
  constructor(msg: string, url: string, status: number | null, ate: number, motivo: MotivoBloqueio, semPedido: boolean) {
    super(msg, url, status);
    this.name = 'TseBloqueioError';
    this.ate = ate;
    this.motivo = motivo;
    this.semPedido = semPedido;
  }
}

export const MAX_CONCORRENCIA = 8;
/** Limite publicado pelo TSE (pedidos por segundo; fonte ainda por confirmar): a rajada + o teto nunca passam dele. */
export const LIMITE_PUBLICADO_TSE = 100;
/** Pausa quando o TSE bloqueia sem dizer até quando (Retry-After). */
export const PAUSA_BLOQUEIO_MS = 11 * 60_000;
/** Faixa aceita do Retry-After de um bloqueio. */
const RETRY_AFTER_MIN_MS = 5_000;
const RETRY_AFTER_MAX_MS = 60 * 60_000;
/** Arquivos lidos com sucesso lembrados para o "403 num arquivo que já deu 200" (os mais antigos saem primeiro). */
const MAX_LIDOS = 20_000;

const PRIORIDADES: Prioridade[] = ['alta', 'normal', 'baixa'];
type Nivel = 'reservado' | Prioridade;
const NIVEIS: Nivel[] = ['reservado', ...PRIORIDADES];

/** Teto de pedidos por segundo limitado à faixa aceita (inteiro). */
export function limitePorSegValido(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return TSE_LIMITE_POR_SEG.padrao;
  return Math.min(TSE_LIMITE_POR_SEG.max, Math.max(TSE_LIMITE_POR_SEG.min, Math.round(n)));
}

/**
 * Balde de fichas: `taxa` fichas por segundo, até `capacidade` guardadas (a rajada). Os pedidos comuns só tiram uma
 * ficha quando ficam pelo menos `reserva` fichas no balde — a fatia dos arquivos das disputas.
 */
export class BaldeFichas {
  private fichas: number;
  private em: number;
  taxa = 0;
  capacidade = 0;
  reserva = 0;

  constructor(
    limitePorSeg: number,
    private readonly relogio: () => number,
  ) {
    this.ajustar(limitePorSeg);
    this.fichas = this.capacidade;
    this.em = relogio();
  }

  ajustar(limitePorSeg: number) {
    this.taxa = limitePorSegValido(limitePorSeg);
    // rajada: até 1 s de teto, sem que rajada + 1 s de teto passe dos 100 pedidos/s publicados pelo TSE
    this.capacidade = Math.max(2, Math.min(this.taxa, LIMITE_PUBLICADO_TSE - this.taxa));
    this.reserva = Math.max(1, Math.floor(this.capacidade * 0.4));
    if (this.fichas > this.capacidade) this.fichas = this.capacidade;
  }

  private repor() {
    const t = this.relogio();
    const dt = t - this.em;
    this.em = t;
    if (dt > 0) this.fichas = Math.min(this.capacidade, this.fichas + (dt * this.taxa) / 1000);
  }

  private minimo(reservado: boolean) {
    return reservado ? 1 : 1 + this.reserva;
  }

  /** Tira uma ficha se houver (true) — os comuns respeitam a reserva. */
  tentar(reservado: boolean): boolean {
    this.repor();
    if (this.fichas + 1e-9 < this.minimo(reservado)) return false;
    this.fichas -= 1;
    return true;
  }

  /** Quanto falta (ms) para haver ficha para este tipo de pedido. */
  esperaMs(reservado: boolean): number {
    this.repor();
    const falta = this.minimo(reservado) - this.fichas;
    return falta <= 0 ? 0 : Math.ceil((falta * 1000) / this.taxa);
  }

  get disponiveis() {
    this.repor();
    return Math.floor(this.fichas);
  }
}

interface Espera {
  entrar: () => void;
  recusar: (e: Error) => void;
}

export class TseClient {
  private base: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly tentativas: number;
  private readonly backoffMs: number;
  private readonly concorrencia: number;
  private readonly condicional: boolean;
  private readonly headers: Record<string, string>;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly pausaPadraoMs: number;
  private readonly balde: BaldeFichas;
  private readonly semTeto: boolean;
  private readonly modoPausaFn: () => ModoPausaTse;
  private readonly relogioBalde: () => number;

  private ativos = 0;
  private filas: Record<Nivel, Espera[]> = { reservado: [], alta: [], normal: [], baixa: [] };
  private timerBalde: ReturnType<typeof setTimeout> | null = null;
  private bloqueioAtual: BloqueioTse | null = null;
  private ouvintesBloqueio: ((b: BloqueioTse | null) => void)[] = [];
  /** arquivos já lidos com 200/304 (ordem de inserção = antiguidade) */
  private lidos = new Set<string>();
  /** pedidos por segundo do último minuto (anel de 60) */
  private porSeg = new Int32Array(60);
  private segDe = new Float64Array(60).fill(-1);
  private st: Omit<TseClientStats, 'emVoo' | 'naFila' | 'limitePorSeg' | 'ritmo'> = {
    requisicoes: 0,
    ok: 0,
    naoModificado: 0,
    ausente: 0,
    erros: 0,
    retentativas: 0,
    latenciaMs: null,
    ultimoSucesso: null,
    ultimoErro: null,
    bloqueios: 0,
    recusadosNaPausa: 0,
  };

  constructor(opts: TseClientOptions) {
    this.base = normalizarBase(opts.baseUrl);
    const f = opts.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    if (!f) throw new Error('TseClient: fetch indisponível neste ambiente; injete `fetch`.');
    this.fetchImpl = f as FetchLike;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.tentativas = Math.max(1, opts.tentativas ?? 3);
    this.backoffMs = opts.backoffMs ?? 500;
    this.concorrencia = Math.min(MAX_CONCORRENCIA, Math.max(1, opts.concorrencia ?? 6));
    this.condicional = opts.condicional ?? true;
    this.headers = { ...(opts.headers ?? {}) };
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
    this.pausaPadraoMs = opts.pausaPadraoMs ?? PAUSA_BLOQUEIO_MS;
    this.relogioBalde = opts.relogioBalde ?? (() => Date.now());
    this.balde = new BaldeFichas(opts.limitePorSeg ?? TSE_LIMITE_POR_SEG.padrao, this.relogioBalde);
    this.semTeto = !!opts.semTeto;
    this.modoPausaFn = opts.modoPausa ?? (() => 'auto');
  }

  /** Modo da pausa por bloqueio agora (nunca lança; erro = 'auto'). */
  private modoPausa(): ModoPausaTse {
    try {
      const m = this.modoPausaFn();
      return m === 'restrita' || m === 'off' ? m : 'auto';
    } catch {
      return 'auto';
    }
  }

  get baseUrl() {
    return this.base;
  }

  setBaseUrl(url: string) {
    this.base = normalizarBase(url);
  }

  /** Teto de pedidos por segundo (painel → Fonte; vale na hora). */
  get limitePorSeg() {
    return this.balde.taxa;
  }

  setLimitePorSeg(v: number) {
    this.balde.ajustar(v);
    this.bombear();
  }

  url(path: string) {
    return /^https?:\/\//.test(path) ? path : `${this.base}/${path.replace(/^\/+/, '')}`;
  }

  stats(): TseClientStats {
    const s = Math.floor(this.relogioBalde() / 1000);
    let ultimos10s = 0;
    let picoSeg = 0;
    for (let i = 0; i < 60; i++) {
      const seg = this.segDe[i];
      if (seg <= s - 60 || seg > s) continue;
      if (seg > s - 10) ultimos10s += this.porSeg[i];
      picoSeg = Math.max(picoSeg, this.porSeg[i]);
    }
    return {
      ...this.st,
      emVoo: this.ativos,
      naFila: NIVEIS.reduce((a, p) => a + this.filas[p].length, 0),
      limitePorSeg: this.balde.taxa,
      ritmo: { ultimos10s, picoSeg },
    };
  }

  // ---- pausa por bloqueio ---------------------------------------------------------------------

  /** Pausa em curso (null = lendo normalmente; a pausa vencida some sozinha). */
  bloqueio(): BloqueioTse | null {
    const b = this.bloqueioAtual;
    if (b && this.now() >= b.ate) this.bloqueioAtual = null;
    return this.bloqueioAtual ? { ...this.bloqueioAtual } : null;
  }

  /** Encerra a pausa antes da hora ("Retomar agora"). Devolve a pausa encerrada (null = não havia). */
  retomar(): BloqueioTse | null {
    const b = this.bloqueio();
    this.bloqueioAtual = null;
    if (b) this.avisar(null);
    this.bombear();
    return b;
  }

  /** Assina o início (com a pausa) e o fim antecipado (null) de uma pausa. Devolve a função para cancelar. */
  aoMudarBloqueio(fn: (b: BloqueioTse | null) => void): () => void {
    this.ouvintesBloqueio.push(fn);
    return () => {
      this.ouvintesBloqueio = this.ouvintesBloqueio.filter((x) => x !== fn);
    };
  }

  private avisar(b: BloqueioTse | null) {
    for (const fn of this.ouvintesBloqueio) {
      try {
        fn(b ? { ...b } : null);
      } catch {
        /* ouvinte com defeito não derruba o cliente */
      }
    }
  }

  private pausar(motivo: MotivoBloqueio, httpStatus: number, url: string, retryAfterMs: number | null): BloqueioTse {
    const agora = this.now();
    const dur = retryAfterMs ?? this.pausaPadraoMs;
    const ate = agora + dur;
    const atual = this.bloqueio();
    if (atual) {
      // pedidos simultâneos bloqueados juntos: uma pausa só (a mais longa)
      if (ate > atual.ate) this.bloqueioAtual = { ...atual, ate };
      return this.bloqueio()!;
    }
    this.bloqueioAtual = { desde: agora, ate, motivo, httpStatus, arquivo: this.caminho(url), porRetryAfter: retryAfterMs !== null };
    this.st.bloqueios++;
    // ninguém mais sai até o fim da pausa: a fila de espera falha já
    for (const n of NIVEIS) {
      const fila = this.filas[n];
      this.filas[n] = [];
      for (const w of fila) w.recusar(this.erroPausa(url));
    }
    this.avisar(this.bloqueioAtual);
    return { ...this.bloqueioAtual };
  }

  private erroPausa(url: string): TseBloqueioError {
    const b = this.bloqueioAtual!;
    this.st.recusadosNaPausa++;
    return new TseBloqueioError(`leituras do TSE pausadas (${MOTIVO_BLOQUEIO_TEXTO[b.motivo]})`, url, null, b.ate, b.motivo, true);
  }

  private caminho(url: string) {
    return url.startsWith(this.base) ? url.slice(this.base.length + 1) : url;
  }

  // ---- leitura ----------------------------------------------------------------------------------

  /** GET de um JSON do feed. */
  getJson<T>(path: string, opts: TseRequisicaoOpcoes = {}): Promise<TseResposta<T>> {
    return this.get(path, opts, async (res) => (await res.json()) as T);
  }

  /** GET binário (ex.: bu.dat). */
  getBytes(path: string, opts: TseRequisicaoOpcoes = {}): Promise<TseResposta<Uint8Array>> {
    return this.get(path, opts, async (res) => new Uint8Array(await res.arrayBuffer()));
  }

  private async get<T>(path: string, opts: TseRequisicaoOpcoes, ler: (res: Response) => Promise<T>): Promise<TseResposta<T>> {
    const url = this.url(path);
    const tentativas = Math.max(1, opts.tentativas ?? this.tentativas);
    const nivel: Nivel = opts.reservado ? 'reservado' : (opts.prioridade ?? 'normal');
    let ultimo: unknown = null;
    for (let i = 0; i < tentativas; i++) {
      if (opts.signal?.aborted) throw new TseHttpError('requisição cancelada', url, null);
      if (this.bloqueio()) throw this.erroPausa(url);
      // cada tentativa espera vaga (concorrência) e ficha (teto por segundo); a espera do backoff não prende a vaga
      await this.adquirir(nivel, url, opts.signal);
      let espera = -1;
      try {
        if (this.bloqueio()) throw this.erroPausa(url);
        if (i > 0) this.st.retentativas++;
        return await this.uma(url, opts, ler);
      } catch (err) {
        ultimo = err;
        if (err instanceof TseBloqueioError) {
          if (!err.semPedido) {
            this.st.erros++;
            this.st.ultimoErro = { t: this.now(), url, msg: err.message };
          }
          throw err;
        }
        const re = err instanceof TseHttpError ? err : null;
        const retentavel = !re || re.status === null || re.status >= 500;
        if (retentavel && i < tentativas - 1 && !opts.signal?.aborted) {
          const retryAfter = (err as { retryAfterMs?: number }).retryAfterMs;
          espera = retryAfter ?? Math.min(8000, this.backoffMs * 2 ** i * (0.5 + this.random()));
        }
      } finally {
        this.liberar();
      }
      if (espera < 0) break;
      await this.sleep(espera);
    }
    const msg = ultimo instanceof Error ? ultimo.message : String(ultimo);
    this.st.erros++;
    this.st.ultimoErro = { t: this.now(), url, msg };
    throw ultimo instanceof TseHttpError ? ultimo : new TseHttpError(msg, url, null);
  }

  private async uma<T>(url: string, opts: TseRequisicaoOpcoes, ler: (res: Response) => Promise<T>): Promise<TseResposta<T>> {
    const ctrl = new AbortController();
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    let expirou = false;
    const timer = setTimeout(() => {
      expirou = true;
      ctrl.abort();
    }, timeoutMs);
    const repassar = () => ctrl.abort();
    opts.signal?.addEventListener('abort', repassar, { once: true });

    const headers: Record<string, string> = { Accept: 'application/json, */*', ...this.headers };
    if (this.condicional && opts.validadores) {
      if (opts.validadores.etag) headers['If-None-Match'] = opts.validadores.etag;
      if (opts.validadores.lastModified) headers['If-Modified-Since'] = opts.validadores.lastModified;
    }

    const t0 = this.now();
    this.st.requisicoes++;
    this.contarPedido();
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method: 'GET', headers, signal: ctrl.signal });
      } catch (err) {
        if (expirou) throw new TseHttpError(`timeout após ${timeoutMs} ms`, url, null);
        if (opts.signal?.aborted) throw new TseHttpError('requisição cancelada', url, null);
        throw new TseHttpError(`falha de rede: ${(err as Error)?.message ?? String(err)}`, url, null);
      }
      const ms = this.now() - t0;
      this.registrarLatencia(ms);

      if (res.status === 304) {
        this.st.naoModificado++;
        this.st.ultimoSucesso = this.now();
        this.lembrarLido(url);
        return { status: 'nao-modificado', validadores: { ...opts.validadores, ...validadoresDe(res) }, url, ms };
      }
      if (res.status === 429) {
        await descartar(res);
        // chave 'pausa-tse' em 'off': erro comum (não repetido: < 500), sem pausa — o comportamento de antes da leva 3
        if (this.modoPausa() === 'off') throw new TseHttpError('HTTP 429 (pausa por bloqueio desligada no painel)', url, 429);
        const b = this.pausar('http-429', 429, url, retryAfterDe(res, this.now()));
        throw new TseBloqueioError(`HTTP 429 (${MOTIVO_BLOQUEIO_TEXTO['http-429']})`, url, 429, b.ate, 'http-429', false);
      }
      if (res.status === 403) {
        const modo = this.modoPausa();
        const lido = await motivo403(res, !!(opts.validadores?.etag || opts.validadores?.lastModified) || this.lidos.has(url));
        // 'restrita': o "403 num arquivo já lido" deixa de pausar; 'off': nenhum 403 pausa (vira "ausente", como antes)
        const motivo = modo === 'off' || (modo === 'restrita' && lido === 'arquivo-ja-lido') ? null : lido;
        if (motivo) {
          const b = this.pausar(motivo, 403, url, retryAfterDe(res, this.now()));
          throw new TseBloqueioError(`HTTP 403 (${MOTIVO_BLOQUEIO_TEXTO[motivo]})`, url, 403, b.ate, motivo, false);
        }
        this.st.ausente++;
        this.st.ultimoSucesso = this.now();
        return { status: 'ausente', httpStatus: 403, url, ms };
      }
      if (res.status === 404 || res.status === 410) {
        // S3/Ceph do TSE responde 404 (NoSuchKey) para arquivo ainda não publicado.
        this.st.ausente++;
        this.st.ultimoSucesso = this.now();
        await descartar(res);
        return { status: 'ausente', httpStatus: res.status, url, ms };
      }
      if (!res.ok) {
        await descartar(res);
        const e = new TseHttpError(`HTTP ${res.status}`, url, res.status) as TseHttpError & { retryAfterMs?: number };
        if (res.status === 503) {
          const ra = Number(res.headers.get('retry-after'));
          if (Number.isFinite(ra) && ra > 0) e.retryAfterMs = Math.min(30_000, ra * 1000);
        }
        throw e;
      }
      let data: T;
      try {
        data = await ler(res);
      } catch (err) {
        if (expirou) throw new TseHttpError(`timeout após ${timeoutMs} ms (lendo corpo)`, url, null);
        // corpo truncado/JSON inválido: trata como erro transitório (retentável)
        throw new TseHttpError(`corpo inválido: ${(err as Error)?.message ?? String(err)}`, url, null);
      }
      this.st.ok++;
      this.st.ultimoSucesso = this.now();
      this.lembrarLido(url);
      return { status: 'ok', data, validadores: validadoresDe(res), url, ms };
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', repassar);
    }
  }

  private lembrarLido(url: string) {
    if (this.lidos.has(url)) return;
    this.lidos.add(url);
    if (this.lidos.size > MAX_LIDOS) this.lidos.delete(this.lidos.values().next().value as string);
  }

  private contarPedido() {
    const s = Math.floor(this.relogioBalde() / 1000);
    const i = ((s % 60) + 60) % 60;
    if (this.segDe[i] !== s) {
      this.segDe[i] = s;
      this.porSeg[i] = 0;
    }
    this.porSeg[i]++;
  }

  private registrarLatencia(ms: number) {
    this.st.latenciaMs = this.st.latenciaMs === null ? ms : Math.round(this.st.latenciaMs * 0.8 + ms * 0.2);
  }

  // ---- vagas e fichas -------------------------------------------------------------------------

  private adquirir(nivel: Nivel, url: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const fila = this.filas[nivel];
      const w: Espera = {
        entrar: () => {
          signal?.removeEventListener('abort', cancelar);
          resolve();
        },
        recusar: (e) => {
          signal?.removeEventListener('abort', cancelar);
          reject(e);
        },
      };
      const cancelar = () => {
        const i = fila.indexOf(w);
        if (i >= 0) fila.splice(i, 1);
        reject(new TseHttpError('requisição cancelada', url, null));
      };
      signal?.addEventListener('abort', cancelar, { once: true });
      fila.push(w);
      this.bombear();
    });
  }

  /**
   * Despacha a fila: reservados primeiro, depois por prioridade; cada um precisa de vaga e de ficha. Sem ficha, agenda
   * um novo despacho para quando ela existir.
   */
  private bombear() {
    if (this.timerBalde) {
      clearTimeout(this.timerBalde);
      this.timerBalde = null;
    }
    for (const n of NIVEIS) {
      const fila = this.filas[n];
      while (fila.length) {
        if (this.ativos >= this.concorrencia) return; // a próxima liberação despacha
        if (!this.semTeto && !this.balde.tentar(n === 'reservado')) {
          const ms = Math.max(1, this.balde.esperaMs(n === 'reservado'));
          this.timerBalde = setTimeout(() => {
            this.timerBalde = null;
            this.bombear();
          }, ms);
          (this.timerBalde as { unref?: () => void }).unref?.();
          return;
        }
        const w = fila.shift()!;
        this.ativos++;
        w.entrar();
      }
    }
  }

  private liberar() {
    this.ativos--;
    this.bombear();
  }
}

function normalizarBase(url: string) {
  return url.replace(/\/+$/, '');
}

function validadoresDe(res: Response): Validadores {
  const v: Validadores = {};
  const etag = res.headers.get('etag');
  const lm = res.headers.get('last-modified');
  if (etag) v.etag = etag;
  if (lm) v.lastModified = lm;
  return v;
}

async function descartar(res: Response) {
  try {
    await res.arrayBuffer();
  } catch {
    /* ignora */
  }
}

/** Retry-After (segundos ou data HTTP) em ms, dentro da faixa aceita; null = ausente/inválido. */
export function retryAfterDe(res: Response, agora: number): number | null {
  const v = res.headers.get('retry-after')?.trim();
  if (!v) return null;
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(v)) ms = Number(v) * 1000;
  else {
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return null;
    ms = t - agora;
  }
  if (!Number.isFinite(ms)) return null;
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(RETRY_AFTER_MIN_MS, Math.round(ms)));
}

/**
 * 403: bloqueio (motivo) ou arquivo ausente (null)? Bloqueio = borda do TSE (`Server: AkamaiGHost`), página HTML
 * "Access Denied" (a da Akamai) ou 403 num arquivo que já deu 200/304. O 403 em XML do S3 (AccessDenied/NoSuchKey) de um
 * arquivo nunca lido é "ainda não publicado".
 */
async function motivo403(res: Response, jaLido: boolean): Promise<MotivoBloqueio | null> {
  const server = res.headers.get('server') ?? '';
  let corpo = '';
  try {
    corpo = (await res.text()).slice(0, 4096);
  } catch {
    /* corpo ilegível: decide pelos cabeçalhos */
  }
  if (/akamai/i.test(server)) return 'akamai';
  const xml = /^\s*(<\?xml|<Error\b)/i.test(corpo);
  if (!xml && /access denied/i.test(corpo)) return 'acesso-negado';
  if (jaLido) return 'arquivo-ja-lido';
  return null;
}
