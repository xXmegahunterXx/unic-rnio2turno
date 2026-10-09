/**
 * Fonte 'tse' no servidor, sem rede: o `fetch` falso do adaptador serve os arquivos REAIS do feed (fixtures
 * de src/tse/__fixtures__). Corridas de 2º turno vêm do TseSource; as de 1º turno seguem no dataset.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminSnapshot } from '../shared/api';
import type { LiveStatus, NationalSnapshot } from '../shared/types';
import { criarFakeFetch, BASE, type FakeFetch } from '../tse/__fixtures__/fake-fetch';
import { comando, login, montar, type Montado } from './test-helpers';

let m: Montado;
let f: FakeFetch;
let cookie: string;

beforeAll(async () => {
  f = criarFakeFetch();
  m = await montar({ fetch: f, agora: Date.UTC(2026, 9, 26, 3, 0, 0) });
  cookie = await login(m);
  const r = await comando(m, cookie, { tipo: 'tse', tse: { baseUrl: BASE } });
  expect(r.status).toBe(200);
});

afterAll(async () => {
  await m.tse.encerrar();
});

describe('fonte tse', () => {
  it('testar conexão usa a TseConfig atual', async () => {
    const r = await m.app.request('/api/admin/tse/test', { headers: { cookie } });
    expect(r.status).toBe(200);
    const b = (await r.json()) as { ok: boolean; detalhe: string };
    expect(b.ok).toBe(true);
    expect(b.detalhe).toMatch(/Feed ok: eleição 6258/);
    expect(f.chamadas.some((u) => u.endsWith('/comum/config/ele-c.json'))).toBe(true);
  });

  it('trocar a fonte liga o polling; 2º turno sai do feed oficial', async () => {
    const r = await comando(m, cookie, { tipo: 'fonte', fonte: 'tse' });
    expect(r.status).toBe(200);
    const snap = (await r.json()) as AdminSnapshot;
    expect(snap.status.fonte).toBe('tse');
    expect(snap.status.simulacao).toBe(false);
    expect(m.tse.ativo).toBe(true);

    const n = (await (await m.app.request('/api/apuracao/pres/br')).json()) as NationalSnapshot;
    // arquivo real do 2º turno (09/10/2026): publicado e zerado, com a configuração parcial
    expect(n.resumo.secoes).toBe(48_964);
    expect(n.resumo.eleitorado).toBe(15_922_180);
    expect(n.resumo.secoesTotalizadas).toBe(0);
    expect(n.resumo.status).toBe('aguardando');

    const etag = (await m.app.request('/api/apuracao/pres/br')).headers.get('etag')!;
    expect(etag).toMatch(/-tse\d+-/);

    const st = (await (await m.app.request('/api/status')).json()) as LiveStatus;
    expect(st.fonte).toBe('tse');
    expect(st.simulacao).toBe(false);

    const h = await m.app.request('/api/admin/tse/health', { headers: { cookie } });
    expect(((await h.json()) as { rodando: boolean }).rodando).toBe(true);
  });

  it('1º turno continua no dataset (não depende do feed)', async () => {
    const antes = f.chamadas.length;
    const n = (await (await m.app.request('/api/apuracao/pres-t1/br')).json()) as NationalSnapshot;
    expect(n.resumo.secoes).toBe(m.ds.meta.totaisPrimeiroTurno.secoes);
    expect(f.chamadas.slice(antes).some((u) => u.includes('6257'))).toBe(false);
  });

  it('UF inexistente na corrida → 404 também na fonte tse', async () => {
    expect((await m.app.request('/api/apuracao/gov-rj/uf/sp')).status).toBe(404);
  });

  it('voltar para pre desliga o polling', async () => {
    await comando(m, cookie, { tipo: 'fonte', fonte: 'pre' });
    expect(m.tse.ativo).toBe(false);
    const n = (await (await m.app.request('/api/apuracao/pres/br')).json()) as NationalSnapshot;
    expect(n.resumo.secoes).toBe(m.ds.meta.totaisPrimeiroTurno.secoes); // motor (estrutura do 1º turno)
  });
});
