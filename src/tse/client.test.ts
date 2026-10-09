/** TseClient: retry/backoff, 404 como "ausente", 304 com validadores, timeout e limite de concorrência. */
import { describe, expect, it } from 'vitest';
import { MAX_CONCORRENCIA, TseClient, TseHttpError, type FetchLike } from './client';
import { BASE, criarFakeFetch } from './__fixtures__/fake-fetch';

const semEspera = { sleep: async () => undefined, random: () => 0.5 };

describe('TseClient', () => {
  it('lê JSON real e usa ETag (304 na segunda vez)', async () => {
    const f = criarFakeFetch();
    const c = new TseClient({ baseUrl: `${BASE}/`, fetch: f, ...semEspera });
    const path = 'ele2026/6257/dados/br/br-c0001-e006257-u.json';
    const r1 = await c.getJson<{ ele: string }>(path);
    expect(r1.status).toBe('ok');
    if (r1.status !== 'ok') return;
    expect(r1.data.ele).toBe('6257');
    expect(r1.url).toBe(`${BASE}/${path}`);
    expect(r1.validadores.etag).toBeTruthy();
    const r2 = await c.getJson(path, { validadores: r1.validadores });
    expect(r2.status).toBe('nao-modificado');
    expect(c.stats()).toMatchObject({ requisicoes: 2, ok: 1, naoModificado: 1, erros: 0 });
  });

  it('404 do CDN (NoSuchKey) é "ausente", sem retry', async () => {
    const f = criarFakeFetch();
    const c = new TseClient({ baseUrl: BASE, fetch: f, ...semEspera });
    const r = await c.getJson('ele2026/6260/dados/rj/rj-c0003-e006260-u.json');
    expect(r).toMatchObject({ status: 'ausente', httpStatus: 404 });
    expect(f.chamadas).toHaveLength(1);
  });

  it('5xx e erro de rede: retry com backoff; desiste após as tentativas', async () => {
    let n = 0;
    const esperas: number[] = [];
    const f: FetchLike = async () => {
      n++;
      if (n < 3) return new Response('x', { status: 503 });
      return new Response('{"ok":1}', { status: 200 });
    };
    const c = new TseClient({ baseUrl: BASE, fetch: f, tentativas: 3, backoffMs: 100, sleep: async (ms) => void esperas.push(ms), random: () => 0.5 });
    const r = await c.getJson<{ ok: number }>('a.json');
    expect(r.status).toBe('ok');
    expect(n).toBe(3);
    expect(esperas).toEqual([100, 200]); // 100·2^i·(0,5+0,5)
    expect(c.stats().retentativas).toBe(2);

    const sempre: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const c2 = new TseClient({ baseUrl: BASE, fetch: sempre, tentativas: 2, ...semEspera });
    await expect(c2.getJson('a.json')).rejects.toBeInstanceOf(TseHttpError);
    expect(c2.stats().erros).toBe(1);
    expect(c2.stats().ultimoErro?.msg).toMatch(/falha de rede/);
  });

  it('429 respeita Retry-After', async () => {
    let n = 0;
    const esperas: number[] = [];
    const f: FetchLike = async () =>
      ++n === 1 ? new Response('', { status: 429, headers: { 'retry-after': '2' } }) : new Response('{}', { status: 200 });
    const c = new TseClient({ baseUrl: BASE, fetch: f, sleep: async (ms) => void esperas.push(ms) });
    expect((await c.getJson('a.json')).status).toBe('ok');
    expect(esperas).toEqual([2000]);
  });

  it('JSON truncado é transitório (retry)', async () => {
    let n = 0;
    const f: FetchLike = async () => new Response(++n === 1 ? '{"carg": [' : '{"a":1}', { status: 200 });
    const c = new TseClient({ baseUrl: BASE, fetch: f, ...semEspera });
    expect((await c.getJson('a.json')).status).toBe('ok');
    expect(n).toBe(2);
  });

  it('timeout por tentativa', async () => {
    const f: FetchLike = (_u, init) =>
      new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    const c = new TseClient({ baseUrl: BASE, fetch: f, timeoutMs: 20, tentativas: 1, ...semEspera });
    await expect(c.getJson('a.json')).rejects.toThrow(/timeout após 20 ms/);
  });

  it(`nunca passa de ${MAX_CONCORRENCIA} requisições simultâneas e respeita prioridade`, async () => {
    let ativos = 0;
    let pico = 0;
    const ordem: string[] = [];
    const f: FetchLike = async (u) => {
      ativos++;
      pico = Math.max(pico, ativos);
      ordem.push(u.split('/').pop()!);
      await new Promise((r) => setTimeout(r, 5));
      ativos--;
      return new Response('{}', { status: 200 });
    };
    const c = new TseClient({ baseUrl: BASE, fetch: f, concorrencia: 50, ...semEspera });
    const ps = Array.from({ length: 30 }, (_, i) => c.getJson(`b${i}.json`, { prioridade: 'baixa' }));
    ps.push(c.getJson('urgente.json', { prioridade: 'alta' }));
    await Promise.all(ps);
    expect(pico).toBe(MAX_CONCORRENCIA);
    expect(ordem.indexOf('urgente.json')).toBe(MAX_CONCORRENCIA); // primeiro da fila
  });

  it('bytes (bu.dat)', async () => {
    const f = criarFakeFetch();
    const c = new TseClient({ baseUrl: BASE, fetch: f, ...semEspera });
    const r = await c.getBytes(
      'ele2026/arquivo-urna/3220/dados/zz/29459/0001/1695/364a37623661394b4a326e61493366534f543179307974433776674c682b75617a30366b483241634734773d/o03220zz2945900011695-bu.dat',
    );
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.data.length).toBe(1548);
  });
});
