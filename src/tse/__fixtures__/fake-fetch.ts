/**
 * `fetch` falso para os testes do adaptador TSE (sem rede).
 *
 * Serve os arquivos reais reduzidos de `__fixtures__/oficial/**` (mesmos caminhos do feed), com ETag e 304,
 * e aceita sobreposições (`rotas`) para montar cenários sintéticos (apuração em andamento, erro 500…).
 * Caminho não encontrado → 404 com o XML "NoSuchKey" que o CDN do TSE devolve.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FetchLike } from '../client';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'oficial');
export const BASE = 'https://resultados.tse.jus.br/oficial';

export type Rota = unknown | ((path: string) => unknown) | { status: number; body?: string };

export interface FakeFetch extends FetchLike {
  chamadas: string[];
  /** caminho relativo → conteúdo (objeto JSON, Uint8Array) ou `{ status }` */
  rotas: Map<string, Rota>;
  /** quando true, toda requisição lança erro de rede */
  foraDoAr: boolean;
}

const NO_SUCH_KEY =
  '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message></Message><BucketName>tse-resultados-1</BucketName></Error>';

function etagDe(buf: Uint8Array) {
  let h = 2166136261;
  for (let i = 0; i < buf.length; i++) h = Math.imul(h ^ buf[i], 16777619) >>> 0;
  return `"${h.toString(16)}-${buf.length}"`;
}

export function lerFixture(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, rel)));
}

export function jsonFixture<T = any>(rel: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf-8')) as T;
}

export function criarFakeFetch(): FakeFetch {
  const rotas = new Map<string, Rota>();
  const chamadas: string[] = [];
  const f = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    chamadas.push(url);
    if (f.foraDoAr) throw new TypeError('fetch failed');
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const rel = url.startsWith(BASE) ? url.slice(BASE.length + 1) : url;
    let corpo: Uint8Array | null = null;
    let tipo = 'application/json';
    if (rotas.has(rel)) {
      let r = rotas.get(rel);
      if (typeof r === 'function') r = (r as (p: string) => unknown)(rel);
      if (r && typeof r === 'object' && 'status' in (r as object) && typeof (r as { status: unknown }).status === 'number' && !('carg' in (r as object))) {
        const { status, body } = r as { status: number; body?: string };
        return new Response(body ?? '', { status });
      }
      if (r instanceof Uint8Array) {
        corpo = r;
        tipo = 'application/octet-stream';
      } else corpo = new TextEncoder().encode(JSON.stringify(r));
    } else {
      const arq = join(FIXTURES, rel);
      if (!existsSync(arq)) return new Response(NO_SUCH_KEY, { status: 404, headers: { 'content-type': 'application/xml' } });
      corpo = new Uint8Array(readFileSync(arq));
      if (!rel.endsWith('.json')) tipo = 'application/octet-stream';
    }
    const etag = etagDe(corpo);
    const headers = new Headers(init?.headers);
    if (headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
    return new Response(corpo as ConstructorParameters<typeof Response>[0], { status: 200, headers: { 'content-type': tipo, etag, 'last-modified': 'Mon, 05 Oct 2026 15:52:12 GMT' } });
  }) as FakeFetch;
  f.chamadas = chamadas;
  f.rotas = rotas;
  f.foraDoAr = false;
  return f;
}
