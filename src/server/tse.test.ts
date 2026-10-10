/**
 * Fonte 'tse' no servidor, sem rede: o `fetch` falso do adaptador serve os arquivos REAIS do feed (fixtures
 * de src/tse/__fixtures__). Corridas de 2º turno vêm do TseSource; as de 1º turno seguem no dataset.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminSnapshot } from '../shared/api';
import type { LiveStatus, MunicipiosNacionalSnapshot, NationalSnapshot } from '../shared/types';
import { CC } from './app';
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

  it('?t= na fonte tse: Brasil/UF pelo histórico; município responde o agora; mapa nacional por município', async () => {
    const st = (await (await m.app.request('/api/status')).json()) as LiveStatus;
    const t = m.relogio.t - 10 * 60_000;
    const r = await m.app.request(`/api/apuracao/pres/br?t=${t}&v=${st.versao}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe(CC.historico);
    expect(r.headers.get('etag')).toMatch(/-h[a-z0-9]+-/);
    const n = (await r.json()) as NationalSnapshot;
    expect(n.simNow).toBe(Math.floor(t / 1000) * 1000);
    expect(n.resumo.secoesTotalizadas).toBe(0);
    expect(n.resumo.secoes).toBe(48_964);
    // passado recente na fonte tse: o ETag acompanha o balde do agora (dados ainda podem chegar)
    const rec = await m.app.request(`/api/apuracao/pres/br?t=${m.relogio.t - 30_000}`);
    expect(rec.headers.get('etag')).toMatch(/-h[a-z0-9]+-tse\d+-/);
    expect(rec.headers.get('cache-control')).toBe(CC.snapshot);
    // município/zona/seção não têm histórico: ?t= responde o agora (mesmo ETag)
    const a = await m.app.request('/api/apuracao/pres/uf/ac/mun/01120');
    const b = await m.app.request(`/api/apuracao/pres/uf/ac/mun/01120?t=${t}`);
    expect(b.status).toBe(200);
    expect(b.headers.get('etag')).toBe(a.headers.get('etag'));

    const mb = await m.app.request('/api/apuracao/pres/br/municipios');
    expect(mb.status).toBe(200);
    const mbj = (await mb.json()) as MunicipiosNacionalSnapshot;
    if (m.ds.municipiosBr) expect(mbj.lider).toHaveLength(m.ds.municipiosBr.ordem.length);
    expect(mbj.apurado.every((x) => x === 0)).toBe(true);
    expect(mbj.municipiosLiderados).toEqual([0, 0]);
  });

  it('voltar para pre desliga o polling', async () => {
    await comando(m, cookie, { tipo: 'fonte', fonte: 'pre' });
    expect(m.tse.ativo).toBe(false);
    const n = (await (await m.app.request('/api/apuracao/pres/br')).json()) as NationalSnapshot;
    expect(n.resumo.secoes).toBe(m.ds.meta.totaisPrimeiroTurno.secoes); // motor (estrutura do 1º turno)
  });
});
