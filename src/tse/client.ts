/**
 * Cliente HTTP do feed oficial do TSE.
 *
 *  - `fetch` injetável (testes sem rede; Node 20+ e navegador usam o global).
 *  - Timeout por tentativa (AbortController), retry com backoff exponencial + jitter em erro de rede,
 *    timeout, 429 (respeita Retry-After) e 5xx. 404/403 não são erro: viram `{ status: 'ausente' }`
 *    (o TSE publica arquivos aos poucos; ausência é estado normal).
 *  - Requisição condicional (If-None-Match / If-Modified-Since): o CDN do TSE devolve ETag e
 *    Last-Modified e responde 304 (verificado). O chamador guarda os validadores junto do valor já
 *    mapeado (compacto) — o cliente não retém corpos em memória.
 *  - Concorrência global limitada (≤ 8, por respeito ao servidor) com 3 prioridades.
 *  - Estatísticas para `health()`.
 *
 * Isomórfico: só usa fetch, AbortController e setTimeout.
 */

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
  /** Envia If-None-Match/If-Modified-Since. Padrão true. */
  condicional?: boolean;
  /** Cabeçalhos extras (ex.: User-Agent identificável no servidor). */
  headers?: Record<string, string>;
  now?: () => number;
  /** Espera injetável (testes). */
  sleep?: (ms: number) => Promise<void>;
  /** Aleatoriedade injetável (jitter; testes). */
  random?: () => number;
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

export const MAX_CONCORRENCIA = 8;

const PRIORIDADES: Prioridade[] = ['alta', 'normal', 'baixa'];

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

  private ativos = 0;
  private filas: Record<Prioridade, (() => void)[]> = { alta: [], normal: [], baixa: [] };
  private st: TseClientStats = {
    requisicoes: 0,
    ok: 0,
    naoModificado: 0,
    ausente: 0,
    erros: 0,
    retentativas: 0,
    emVoo: 0,
    naFila: 0,
    latenciaMs: null,
    ultimoSucesso: null,
    ultimoErro: null,
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
  }

  get baseUrl() {
    return this.base;
  }

  setBaseUrl(url: string) {
    this.base = normalizarBase(url);
  }

  url(path: string) {
    return /^https?:\/\//.test(path) ? path : `${this.base}/${path.replace(/^\/+/, '')}`;
  }

  stats(): TseClientStats {
    return { ...this.st, emVoo: this.ativos, naFila: PRIORIDADES.reduce((a, p) => a + this.filas[p].length, 0) };
  }

  /** GET de um JSON do feed. */
  getJson<T>(path: string, opts: TseRequisicaoOpcoes = {}): Promise<TseResposta<T>> {
    return this.get(path, opts, async (res) => (await res.json()) as T);
  }

  /** GET binário (ex.: bu.dat). */
  getBytes(path: string, opts: TseRequisicaoOpcoes = {}): Promise<TseResposta<Uint8Array>> {
    return this.get(path, opts, async (res) => new Uint8Array(await res.arrayBuffer()));
  }

  // -------------------------------------------------------------------------------------------

  private async get<T>(path: string, opts: TseRequisicaoOpcoes, ler: (res: Response) => Promise<T>): Promise<TseResposta<T>> {
    const url = this.url(path);
    await this.adquirir(opts.prioridade ?? 'normal', opts.signal);
    try {
      return await this.comRetry(url, opts, ler);
    } finally {
      this.liberar();
    }
  }

  private async comRetry<T>(url: string, opts: TseRequisicaoOpcoes, ler: (res: Response) => Promise<T>): Promise<TseResposta<T>> {
    const tentativas = Math.max(1, opts.tentativas ?? this.tentativas);
    let ultimo: unknown = null;
    for (let i = 0; i < tentativas; i++) {
      if (opts.signal?.aborted) throw new TseHttpError('requisição cancelada', url, null);
      if (i > 0) this.st.retentativas++;
      try {
        return await this.uma(url, opts, ler);
      } catch (err) {
        ultimo = err;
        const re = err instanceof TseHttpError ? err : null;
        const retentavel = !re || re.status === null || re.status === 429 || re.status >= 500;
        if (!retentavel || i === tentativas - 1 || opts.signal?.aborted) break;
        const retryAfter = (err as { retryAfterMs?: number }).retryAfterMs;
        const espera = retryAfter ?? Math.min(8000, this.backoffMs * 2 ** i * (0.5 + this.random()));
        await this.sleep(espera);
      }
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
        return { status: 'nao-modificado', validadores: { ...opts.validadores, ...validadoresDe(res) }, url, ms };
      }
      if (res.status === 404 || res.status === 403 || res.status === 410) {
        // S3/Ceph do TSE responde 404 (NoSuchKey) para arquivo ainda não publicado.
        this.st.ausente++;
        this.st.ultimoSucesso = this.now();
        await descartar(res);
        return { status: 'ausente', httpStatus: res.status, url, ms };
      }
      if (!res.ok) {
        await descartar(res);
        const e = new TseHttpError(`HTTP ${res.status}`, url, res.status) as TseHttpError & { retryAfterMs?: number };
        if (res.status === 429 || res.status === 503) {
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
      return { status: 'ok', data, validadores: validadoresDe(res), url, ms };
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', repassar);
    }
  }

  private registrarLatencia(ms: number) {
    this.st.latenciaMs = this.st.latenciaMs === null ? ms : Math.round(this.st.latenciaMs * 0.8 + ms * 0.2);
  }

  private adquirir(p: Prioridade, signal?: AbortSignal): Promise<void> {
    if (this.ativos < this.concorrencia) {
      this.ativos++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const fila = this.filas[p];
      const entrar = () => {
        signal?.removeEventListener('abort', cancelar);
        this.ativos++;
        resolve();
      };
      const cancelar = () => {
        const i = fila.indexOf(entrar);
        if (i >= 0) fila.splice(i, 1);
        reject(new TseHttpError('requisição cancelada', '', null));
      };
      signal?.addEventListener('abort', cancelar, { once: true });
      fila.push(entrar);
    });
  }

  private liberar() {
    this.ativos--;
    for (const p of PRIORIDADES) {
      const prox = this.filas[p].shift();
      if (prox) {
        prox();
        return;
      }
    }
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
