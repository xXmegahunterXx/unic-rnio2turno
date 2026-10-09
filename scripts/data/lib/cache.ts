/**
 * Download com cache em disco para o feed do TSE.
 *
 *  - Espelha cada caminho do feed em `data-raw/tse/<caminho>` (diretório ignorado pelo git).
 *  - Reexecuções não rebaixam o que já está no cache (a menos que `refresh`), então o pipeline é
 *    reprodutível offline depois do primeiro download.
 *  - Concorrência limitada (padrão 12), timeout por requisição e retry com backoff exponencial + jitter
 *    para erros de rede, timeouts, 429 e 5xx. 404 é definitivo (retorna null).
 *  - Só grava arquivos que são JSON válido; a gravação é atômica (tmp + rename).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { url as tseUrl } from './tse-feed';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** Cache bruto do feed (padrão data-raw/tse; `TSE_RAW_DIR=...` para usar outro diretório). */
export const RAW_DIR = process.env.TSE_RAW_DIR ? path.resolve(process.env.TSE_RAW_DIR) : path.join(ROOT, 'data-raw', 'tse');

export const rawPath = (feedPath: string) => path.join(RAW_DIR, feedPath);

/** Semáforo simples para limitar a concorrência. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    queue.shift()!();
  };
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      next();
    });
    try {
      return await fn();
    } finally {
      active--;
      next();
    }
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchStats {
  baixados: number;
  doCache: number;
  inexistentes: number;
  falhas: number;
  tentativasExtras: number;
  bytes: number;
}

export interface CachedFetcherOptions {
  concorrencia?: number;
  timeoutMs?: number;
  tentativas?: number;
  /** Ignora o cache e baixa de novo (para arquivos que mudam, como o do 2º turno). */
  refresh?: boolean;
  log?: (msg: string) => void;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly feedPath: string,
  ) {
    super(`HTTP ${status} em ${feedPath}`);
  }
}

export function createFetcher(opts: CachedFetcherOptions = {}) {
  const { concorrencia = 12, timeoutMs = 25_000, tentativas = 7, log = console.log } = opts;
  const limit = createLimiter(concorrencia);
  const stats: FetchStats = { baixados: 0, doCache: 0, inexistentes: 0, falhas: 0, tentativasExtras: 0, bytes: 0 };

  async function lerCache(p: string): Promise<string | null> {
    const file = rawPath(p);
    if (!existsSync(file)) return null;
    const txt = await readFile(file, 'utf8');
    try {
      JSON.parse(txt);
      return txt;
    } catch {
      log(`  cache corrompido, rebaixando: ${p}`);
      return null;
    }
  }

  async function baixar(p: string): Promise<string | null> {
    let ultimoErro: unknown = null;
    for (let i = 0; i < tentativas; i++) {
      if (i > 0) {
        stats.tentativasExtras++;
        const espera = Math.min(30_000, 600 * 2 ** (i - 1)) * (0.75 + Math.random() * 0.5);
        await sleep(espera);
      }
      try {
        const res = await fetch(tseUrl(p), {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: 'application/json', 'user-agent': 'sintonia-data-pipeline/1.0' },
        });
        if (res.status === 404) {
          // Arquivo inexistente no feed. Definitivo (403 do proxy/CDN, por outro lado, é tratado como erro).
          await res.arrayBuffer().catch(() => undefined);
          return null;
        }
        if (!res.ok) {
          await res.arrayBuffer().catch(() => undefined);
          throw new HttpError(res.status, p);
        }
        const txt = await res.text();
        JSON.parse(txt); // garante JSON íntegro (resposta truncada/HTML de erro → retry)
        stats.bytes += Buffer.byteLength(txt);
        return txt;
      } catch (err) {
        ultimoErro = err;
        if (i >= 2) log(`  tentativa ${i + 1}/${tentativas} falhou para ${p}: ${(err as Error).message}`);
      }
    }
    throw new Error(`Falha ao baixar ${p} após ${tentativas} tentativas: ${(ultimoErro as Error)?.message}`);
  }

  async function gravar(p: string, txt: string) {
    const file = rawPath(p);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, txt);
    await rename(tmp, file);
  }

  /**
   * Garante o arquivo no cache. Retorna 'cache' | 'baixado' | 'inexistente'.
   * Com `refresh`, tenta baixar de novo; se falhar e houver cache, mantém o cache (com aviso).
   */
  async function ensure(p: string, o: { refresh?: boolean; opcional?: boolean } = {}) {
    return limit(async () => {
      const refresh = o.refresh ?? opts.refresh ?? false;
      if (!refresh) {
        const c = await lerCache(p);
        if (c !== null) {
          stats.doCache++;
          return 'cache' as const;
        }
      }
      try {
        const txt = await baixar(p);
        if (txt === null) {
          stats.inexistentes++;
          if (!o.opcional) throw new Error(`Arquivo obrigatório inexistente no feed (404): ${p}`);
          return 'inexistente' as const;
        }
        await gravar(p, txt);
        stats.baixados++;
        return 'baixado' as const;
      } catch (err) {
        if (refresh && (await lerCache(p)) !== null) {
          log(`  aviso: não foi possível atualizar ${p}; usando cache (${(err as Error).message})`);
          stats.doCache++;
          return 'cache' as const;
        }
        stats.falhas++;
        throw err;
      }
    });
  }

  return { ensure, stats };
}

/** Lê e faz parse de um arquivo do cache bruto. Lança erro claro se ausente. */
export async function readRaw<T>(feedPath: string): Promise<T> {
  const file = rawPath(feedPath);
  if (!existsSync(file)) {
    throw new Error(`Arquivo bruto ausente: ${feedPath}. Rode antes: npx tsx scripts/data/fetch-tse.ts`);
  }
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

/** Igual a readRaw, mas retorna null se o arquivo não estiver no cache. */
export async function readRawOpcional<T>(feedPath: string): Promise<T | null> {
  return existsSync(rawPath(feedPath)) ? readRaw<T>(feedPath) : null;
}
