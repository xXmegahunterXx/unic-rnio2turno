/**
 * Cliente HTTP do app (produção/dev): implementa `ApuracaoClient` sobre a API do servidor Hono (prefixo /api).
 *
 *  - Erros tipados, iguais aos do cliente local (demo): 404 → `NotFoundError`, 400 → `CommandError`,
 *    401 → `UnauthorizedError` (status 401); demais → `HttpError` com `status` (0 = rede/timeout).
 *  - `secao()` devolve `null` no 404 (seção sem boletim / inexistente).
 *  - Timeouts por tipo de chamada (AbortController); `credentials: 'same-origin'` (cookie do admin).
 *  - O cache HTTP do navegador revalida com ETag (304) automaticamente.
 */
import type { AdminCommand, AdminSnapshot, ApuracaoClient, PublicMeta } from '@/shared/api';
import type {
  LiveStatus,
  MunicipioSnapshot,
  NationalSnapshot,
  PresetInfo,
  RaceId,
  SecaoDetalhe,
  UF,
  UfSnapshot,
  ZonaSnapshot,
} from '@/shared/types';
import { CommandError, NotFoundError } from '@/engine/api';

/** Falha HTTP genérica (5xx, 429, 503…) ou de rede (`status` 0). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    msg: string,
    readonly url = '',
  ) {
    super(msg);
    this.name = 'HttpError';
  }
}

/** Sessão do admin ausente/expirada (mesmo nome e status do cliente local). */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(msg = 'Faça login para acessar o painel de simulação.') {
    super(msg);
    this.name = 'UnauthorizedError';
  }
}

export interface HttpClientOptions {
  /** Prefixo da API. Padrão '/api'. */
  base?: string;
  /** fetch injetável (testes/SSR). Padrão: globalThis.fetch. */
  fetch?: typeof fetch;
  /** Timeouts em ms. */
  timeouts?: Partial<Record<'status' | 'dados' | 'admin' | 'tse', number>>;
}

const TIMEOUTS = { status: 8_000, dados: 20_000, admin: 20_000, tse: 35_000 };

const enc = encodeURIComponent;
const lower = (s: string) => enc(String(s).toLowerCase());

export function createHttpClient(opts: HttpClientOptions = {}): ApuracaoClient {
  const base = (opts.base ?? '/api').replace(/\/+$/, '');
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const to = { ...TIMEOUTS, ...opts.timeouts };

  async function req<T>(
    path: string,
    o: { method?: 'GET' | 'POST'; body?: unknown; timeout: number; nullOn404?: boolean } = { timeout: to.dados },
  ): Promise<T> {
    const url = `${base}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeout);
    let r: Response;
    try {
      r = await f(url, {
        method: o.method ?? 'GET',
        credentials: 'same-origin',
        headers: o.body !== undefined ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const abortado = ctrl.signal.aborted || (e instanceof Error && e.name === 'AbortError');
      throw new HttpError(
        0,
        abortado ? `Tempo esgotado (${Math.round(o.timeout / 1000)} s) ao consultar o servidor.` : 'Sem conexão com o servidor.',
        url,
      );
    }
    try {
      if (r.ok) return (await r.json()) as T;
      let msg = `Erro ${r.status}`;
      try {
        const b = (await r.json()) as { erro?: unknown };
        if (typeof b?.erro === 'string') msg = b.erro;
      } catch {
        /* corpo não-JSON (proxy/CDN) */
      }
      if (r.status === 404) {
        if (o.nullOn404) return null as T;
        throw new NotFoundError(msg);
      }
      if (r.status === 400) throw new CommandError(msg);
      if (r.status === 401) throw new UnauthorizedError(msg);
      throw new HttpError(r.status, msg, url);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw new HttpError(0, 'Tempo esgotado ao ler a resposta do servidor.', url);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  const ap = (race: RaceId) => `/apuracao/${lower(race)}`;

  return {
    status: () => req<LiveStatus>('/status', { timeout: to.status }),
    meta: () => req<PublicMeta>('/meta', { timeout: to.dados }),
    nacional: (race) => req<NationalSnapshot>(`${ap(race)}/br`, { timeout: to.dados }),
    uf: (race, uf: UF) => req<UfSnapshot>(`${ap(race)}/uf/${lower(uf)}`, { timeout: to.dados }),
    municipio: (race, uf, cod) => req<MunicipioSnapshot>(`${ap(race)}/uf/${lower(uf)}/mun/${enc(cod)}`, { timeout: to.dados }),
    zona: (race, uf, cod, zona) =>
      req<ZonaSnapshot>(`${ap(race)}/uf/${lower(uf)}/mun/${enc(cod)}/zona/${enc(String(zona))}`, { timeout: to.dados }),
    secao: (race, uf, cod, zona, secao) =>
      req<SecaoDetalhe | null>(`${ap(race)}/uf/${lower(uf)}/mun/${enc(cod)}/zona/${enc(String(zona))}/secao/${enc(String(secao))}`, {
        timeout: to.dados,
        nullOn404: true,
      }),
    admin: {
      async login(senha: string) {
        try {
          await req<{ ok: true }>('/admin/login', { method: 'POST', body: { senha }, timeout: to.admin });
          return true;
        } catch (e) {
          if (e instanceof UnauthorizedError) return false;
          throw e;
        }
      },
      async logout() {
        await req<{ ok: true }>('/admin/logout', { method: 'POST', body: {}, timeout: to.admin });
      },
      state: () => req<AdminSnapshot>('/admin/state', { timeout: to.admin }),
      command: (cmd: AdminCommand) => req<AdminSnapshot>('/admin/command', { method: 'POST', body: cmd, timeout: to.admin }),
      presets: () => req<PresetInfo[]>('/admin/presets', { timeout: to.admin }),
      testarTse: () => req<{ ok: boolean; detalhe: string; amostra?: unknown }>('/admin/tse/test', { timeout: to.tse }),
    },
  };
}
