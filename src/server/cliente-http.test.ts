/**
 * Cliente HTTP do app (src/app/data/http.ts) contra o servidor de verdade (app.fetch, sem rede), com um
 * "pote de cookies" mínimo no papel do navegador.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createHttpClient, HttpError, UnauthorizedError } from '../app/data/http';
import { CommandError, NotFoundError } from '../engine/api';
import { SENHA, montar, type Montado } from './test-helpers';

let m: Montado;
let cookies = '';
const chamadas: { url: string; init?: RequestInit }[] = [];

const fetchNavegador: typeof fetch = async (input, init) => {
  const url = String(input);
  chamadas.push({ url, init });
  const headers = new Headers(init?.headers);
  if (init?.credentials === 'same-origin' && cookies) headers.set('cookie', cookies);
  const r = await m.app.fetch(new Request(`http://localhost${url}`, { ...init, headers }));
  const sc = r.headers.get('set-cookie');
  if (sc) {
    const [par] = sc.split(';');
    cookies = /Max-Age=0/.test(sc) ? '' : par;
  }
  return r;
};

beforeAll(async () => {
  m = await montar();
});

describe('createHttpClient', () => {
  it('rotas públicas com o prefixo /api e UF/corrida em minúsculas', async () => {
    const c = createHttpClient({ fetch: fetchNavegador });
    const st = await c.status();
    expect(st.fonte).toBe('pre');
    const meta = await c.meta();
    expect(meta.races.length).toBeGreaterThan(2);
    const u = await c.uf('PRES-T1', 'SP');
    expect(u.uf).toBe('SP');
    expect(chamadas.at(-1)!.url).toBe('/api/apuracao/pres-t1/uf/sp');
    expect(chamadas.at(-1)!.init?.credentials).toBe('same-origin');
    const z = await c.zona('pres', 'SP', '71072', 1);
    expect(z.zona).toBe(1);
    const s = await c.secao('pres', 'SP', '71072', 1, z.secoes[0].secao);
    expect(s?.secao).toBe(z.secoes[0].secao);
  });

  it('municipiosBr e "reveja a noite": ?t= truncado ao segundo + &v= (versão vista no status)', async () => {
    const c = createHttpClient({ fetch: fetchNavegador });
    const mb = await c.municipiosBr('PRES-T1');
    expect(chamadas.at(-1)!.url).toBe('/api/apuracao/pres-t1/br/municipios');
    expect(mb.lider.length).toBeGreaterThan(5_000);
    // sem status ainda: só ?t=
    await c.nacional('pres', { t: 1_792_960_000_123 });
    expect(chamadas.at(-1)!.url).toBe('/api/apuracao/pres/br?t=1792960000000');
    const st = await c.status();
    await c.uf('pres', 'SP', { t: 1_792_960_000_999 });
    expect(chamadas.at(-1)!.url).toBe(`/api/apuracao/pres/uf/sp?t=1792960000000&v=${st.versao}`);
    await c.municipiosBr('pres', { t: 1_792_960_000_000 });
    expect(chamadas.at(-1)!.url).toBe(`/api/apuracao/pres/br/municipios?t=1792960000000&v=${st.versao}`);
    const z = await c.zona('pres', 'SP', '71072', 1, { t: 1_792_960_000_000 });
    expect(chamadas.at(-1)!.url).toBe(`/api/apuracao/pres/uf/sp/mun/71072/zona/1?t=1792960000000&v=${st.versao}`);
    await c.secao('pres', 'SP', '71072', 1, z.secoes[0].secao, { t: 1_792_960_000_000 });
    expect(chamadas.at(-1)!.url).toMatch(/\/secao\/\d+\?t=1792960000000&v=\d+$/);
    // t ausente/inválido = agora (sem query)
    await c.municipio('pres', 'SP', '71072', { t: Number.NaN });
    expect(chamadas.at(-1)!.url).toBe('/api/apuracao/pres/uf/sp/mun/71072');
    await c.nacional('pres', {});
    expect(chamadas.at(-1)!.url).toBe('/api/apuracao/pres/br');
  });

  it('erros tipados: 404 → NotFoundError, seção 404 → null, 400 → CommandError', async () => {
    const c = createHttpClient({ fetch: fetchNavegador });
    await expect(c.nacional('nao-existe')).rejects.toBeInstanceOf(NotFoundError);
    await expect(c.municipio('pres', 'SP', '99999')).rejects.toThrow(/não encontrado/);
    expect(await c.secao('pres', 'SP', '71072', 1, 9999)).toBeNull();
    await expect(c.uf('pres', 'XX' as never)).rejects.toBeInstanceOf(CommandError);
  });

  it('admin: login/logout com cookie, 401 tipado, comandos', async () => {
    const c = createHttpClient({ fetch: fetchNavegador });
    await expect(c.admin.state()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(await c.admin.login('errada')).toBe(false);
    expect(await c.admin.login(SENHA)).toBe(true);
    expect(cookies).toMatch(/^sintonia_admin=/);
    const snap = await c.admin.command({ tipo: 'aviso', aviso: { nivel: 'info', texto: 'Teste do cliente' } });
    expect(snap.state.aviso?.texto).toBe('Teste do cliente');
    expect((await c.admin.presets()).length).toBeGreaterThan(0);
    await expect(c.admin.command({ tipo: 'velocidade', velocidade: -5 })).rejects.toBeInstanceOf(CommandError);
    await c.admin.logout();
    expect(cookies).toBe('');
    await expect(c.admin.state()).rejects.toMatchObject({ status: 401, name: 'UnauthorizedError' });
  });

  it('timeout e falha de rede → HttpError status 0', async () => {
    const lento = createHttpClient({
      fetch: (_u, init) =>
        new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('abortado', 'AbortError')))),
      timeouts: { status: 30 },
    });
    await expect(lento.status()).rejects.toMatchObject({ status: 0, name: 'HttpError' });
    const fora = createHttpClient({ fetch: () => Promise.reject(new TypeError('fetch failed')) });
    const e = await fora.meta().catch((x) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect(e.message).toMatch(/Sem conexão/);
  });

  it('5xx/429 com corpo não-JSON (CDN) → HttpError com o status', async () => {
    const c = createHttpClient({ fetch: async () => new Response('<html>502</html>', { status: 502 }) });
    await expect(c.status()).rejects.toMatchObject({ status: 502 });
  });
});
