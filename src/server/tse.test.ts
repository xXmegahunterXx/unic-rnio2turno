/**
 * Fonte 'tse' no servidor, sem rede: o `fetch` falso do adaptador serve os arquivos REAIS do feed (fixtures
 * de src/tse/__fixtures__). Corridas de 2º turno vêm do TseSource; as de 1º turno seguem no dataset.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminSnapshot } from '../shared/api';
import type { LiveStatus, MunicipiosNacionalSnapshot, NationalSnapshot } from '../shared/types';
import { CC } from './app';
import { criarFakeFetch, jsonFixture, BASE, type FakeFetch } from '../tse/__fixtures__/fake-fetch';
import type { TseResultadoArquivo } from '../tse/feed';
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

    const rn = await m.app.request('/api/apuracao/pres/br');
    const etag = rn.headers.get('etag')!;
    // Brasil: o balde é a marca dos números (hash do conteúdo), sem relógio
    expect(etag).toMatch(/-tse[0-9a-z]+-/);
    expect(rn.headers.get('cache-control')).toBe(CC.tseVivo);

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
    expect((await m.app.request('/api/apuracao/gov-am/uf/sp')).status).toBe(404);
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
    expect(rec.headers.get('etag')).toMatch(/-h[a-z0-9]+-tse[0-9a-z]+-/);
    expect(rec.headers.get('cache-control')).toBe(CC.tseVivo);
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

  it('"mais rápido que a TV": marca no status, ETag que muda na hora com dado novo e ?d= com cache próprio', async () => {
    const BR = 'ele2026/6258/dados/br/br-c0001-e006258-u.json';
    const st0 = (await (await m.app.request('/api/status')).json()) as LiveStatus;
    const f0 = st0.frescor!;
    expect(Object.keys(f0)).toEqual(expect.arrayContaining(['pres', 'gov-df']));
    expect(f0.pres!.marca).toMatch(/^[0-9a-z]+$/);
    const r0 = await m.app.request('/api/apuracao/pres/br');
    const e0 = r0.headers.get('etag')!;
    // nada mudou no TSE e o relógio anda: mesmo ETag (304), sem baixar de novo
    m.relogio.t += 12_000;
    const r1 = await m.app.request('/api/apuracao/pres/br', { headers: { 'if-none-match': e0 } });
    expect(r1.status).toBe(304);
    // ?d=<marca atual>: a CDN pode guardar mais (o conteúdo daquela marca não muda); marca velha/estranha: cache curto
    const rd = await m.app.request(`/api/apuracao/pres/br?d=${f0.pres!.marca}`);
    expect(rd.headers.get('cache-control')).toBe(CC.tseMarca);
    expect(rd.headers.get('etag')).toBe(e0);
    expect((await m.app.request('/api/apuracao/pres/br?d=zzz')).headers.get('cache-control')).toBe(CC.tseVivo);
    // abaixo do Brasil: marca + balde de 5 s (os municípios chegam pela fila)
    expect((await m.app.request('/api/apuracao/pres/uf/sp')).headers.get('cache-control')).toBe(CC.tseVivo);

    // o TSE publica: a próxima leitura prioritária muda a marca, o status e o ETag NA HORA (sem esperar balde)
    const d = structuredClone(jsonFixture<TseResultadoArquivo>(BR));
    Object.assign(d, { dg: '25/10/2026', hg: '23:59:50', dt: '25/10/2026', ht: '23:59:50', and: 'p' });
    Object.assign(d.s, { st: '480' });
    f.rotas.set(BR, d);
    expect(await m.tse.fonte!.pollPrioritario()).toBe('novo');
    const st1 = (await (await m.app.request('/api/status')).json()) as LiveStatus;
    expect(st1.frescor!.pres!.marca).not.toBe(f0.pres!.marca);
    expect(st1.frescor!.pres!.conferidoEm).toBe(m.relogio.t);
    const r2 = await m.app.request('/api/apuracao/pres/br', { headers: { 'if-none-match': e0 } });
    expect(r2.status).toBe(200);
    expect(r2.headers.get('etag')).not.toBe(e0);
    expect(((await r2.json()) as NationalSnapshot).resumo.secoesTotalizadas).toBe(480);
    // a marca antiga no endereço não segura o dado velho: responde o atual, com cache curto
    const rv = await m.app.request(`/api/apuracao/pres/br?d=${f0.pres!.marca}`);
    expect(rv.headers.get('cache-control')).toBe(CC.tseVivo);
    expect(((await rv.json()) as NationalSnapshot).resumo.secoesTotalizadas).toBe(480);
    f.rotas.delete(BR);
  });

  it('admin: intervalo do arquivo prioritário no comando tse e na saúde do feed', async () => {
    const r = await comando(m, cookie, { tipo: 'tse', tse: { intervaloPrioritarioSeg: 4 } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as AdminSnapshot).state.tse.intervaloPrioritarioSeg).toBe(4);
    const h = (await (await m.app.request('/api/admin/tse/health', { headers: { cookie } })).json()) as { prioritario: { intervaloSeg: number; ativo: boolean } };
    expect(h.prioritario).toMatchObject({ intervaloSeg: 4, ativo: true });
    expect((await comando(m, cookie, { tipo: 'tse', tse: { intervaloPrioritarioSeg: 1 } })).status).toBe(400);
  });

  it('voltar para pre desliga o polling', async () => {
    await comando(m, cookie, { tipo: 'fonte', fonte: 'pre' });
    expect(m.tse.ativo).toBe(false);
    const n = (await (await m.app.request('/api/apuracao/pres/br')).json()) as NationalSnapshot;
    expect(n.resumo.secoes).toBe(m.ds.meta.totaisPrimeiroTurno.secoes); // motor (estrutura do 1º turno)
    // fora da fonte tse: sem frescor no status
    expect(((await (await m.app.request('/api/status')).json()) as LiveStatus).frescor).toBeUndefined();
  });
});
