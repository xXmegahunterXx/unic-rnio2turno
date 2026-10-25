/**
 * "Projeção do Sintonia" no servidor (GET /api/apuracao/:race/br/projecao e /:uf/projecao): fases (pré → cedo,
 * apurando → disponível, definido/encerrada somem), converge para o resultado final, nunca 500, chave da noite
 * 'projecao' e, na fonte TSE, nunca baixa arquivo de município.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NationalSnapshot, UfSnapshot } from '../shared/types';
import type { RespostaProjecao } from '../shared/projecao';
import { pctValidos } from '../shared/calc';
import { criarFakeFetch, BASE, type FakeFetch } from '../tse/__fixtures__/fake-fetch';
import { CC_PROJECAO } from './projecao';
import { comando, login, montar, type Montado } from './test-helpers';

const pede = async (m: Montado, url: string) => {
  const r = await m.app.request(url);
  return { r, j: r.status === 200 ? ((await r.json()) as RespostaProjecao).projecao : null };
};

describe('motor (simulação)', () => {
  let m: Montado;
  let cookie: string;
  beforeAll(async () => {
    m = await montar();
    cookie = await login(m);
  });

  it('fonte pré: indisponível, motivo "cedo"; rotas e validação', async () => {
    const { r, j } = await pede(m, '/api/apuracao/pres/br/projecao');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe(CC_PROJECAO);
    expect(j).toMatchObject({ race: 'pres', abrangencia: 'BR', disponivel: false, motivo: 'cedo', candidatos: [] });
    expect((await m.app.request('/api/apuracao/pres/xx/projecao')).status).toBe(400);
    expect((await m.app.request('/api/apuracao/gov-df/sp/projecao')).status).toBe(404);
    expect((await m.app.request('/api/apuracao/pres-t1/br/projecao')).status).toBe(404);
    expect((await m.app.request('/api/apuracao/nada/br/projecao')).status).toBe(404);
    // governador com 'br' = a UF da disputa
    expect((await pede(m, '/api/apuracao/gov-df/br/projecao')).j).toMatchObject({ abrangencia: 'DF' });
  }, 30_000);

  it('apurando: disponível no Brasil, numa UF, no exterior e nos governadores; faixa coerente; converge para o final', async () => {
    await comando(m, cookie, { tipo: 'fonte', fonte: 'simulacao' });
    await comando(m, cookie, { tipo: 'preset', preset: 'equilibrio-a' });
    await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' });
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 2 });
    m.relogio.t += 6_000;
    expect((await pede(m, '/api/apuracao/pres/br/projecao')).j).toMatchObject({ disponivel: false, motivo: 'cedo' });

    await comando(m, cookie, { tipo: 'saltar-pct', pct: 35 });
    m.relogio.t += 6_000;
    const urls = ['/api/apuracao/pres/br/projecao', '/api/apuracao/pres/sp/projecao', '/api/apuracao/pres/ba/projecao', '/api/apuracao/gov-df/df/projecao', '/api/apuracao/gov-am/am/projecao'];
    for (const u of urls) {
      const { r, j } = await pede(m, u);
      expect(r.status, u).toBe(200);
      if (!j!.disponivel) {
        // UF pode estar fora dos limiares ou já definida; nunca 'sem-base'
        expect(['cedo', 'definido'], u).toContain(j!.motivo);
        continue;
      }
      expect(j!.candidatos.map((c) => c.indice)).toEqual([0, 1]);
      expect(j!.candidatos[0].pct + j!.candidatos[1].pct).toBeCloseTo(100, 3);
      for (const c of j!.candidatos) {
        expect(c.min).toBeLessThanOrEqual(c.pct);
        expect(c.max).toBeGreaterThanOrEqual(c.pct);
        expect(c.max - c.min).toBeGreaterThanOrEqual(0.6 - 1e-9);
      }
      expect(j!.fracaoApurada).toBeGreaterThanOrEqual(0.1);
      expect(JSON.stringify(j)).not.toMatch(/nomeUrna|Lula|Flávio/);
    }
    const br35 = (await pede(m, urls[0])).j!;
    expect(br35.disponivel).toBe(true);
    expect(br35.pctSecoes).toBeGreaterThan(30);

    // resultado final (100%) para conferir a projeção feita com 35%
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 100 });
    m.relogio.t += 6_000;
    const fim = (await (await m.app.request('/api/apuracao/pres/br')).json()) as NationalSnapshot;
    const final0 = pctValidos(fim.resumo, 0);
    expect(Math.abs(br35.candidatos[0].pct - final0)).toBeLessThan(1);
    expect(br35.candidatos[0].min).toBeLessThanOrEqual(final0);
    expect(br35.candidatos[0].max).toBeGreaterThanOrEqual(final0);
    // encerrada (ou definida): some
    const { j: depois } = await pede(m, urls[0]);
    expect(depois!.disponivel).toBe(false);
    expect(['encerrada', 'definido']).toContain(depois!.motivo);
    const sp = (await (await m.app.request('/api/apuracao/pres/uf/SP')).json()) as UfSnapshot;
    expect(sp.resumo.secoesTotalizadas).toBe(sp.resumo.secoes);
  }, 60_000);

  it('chave da noite "projecao": desligada → motivo "desligada" na hora; religada volta', async () => {
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 40 });
    m.relogio.t += 6_000;
    expect((await pede(m, '/api/apuracao/pres/br/projecao')).j!.disponivel).toBe(true);
    expect((await comando(m, cookie, { tipo: 'projecao', ligado: false })).status).toBe(200);
    m.relogio.t += 1_500; // a leitura das chaves é guardada por 1 s
    expect((await pede(m, '/api/apuracao/pres/br/projecao')).j).toMatchObject({ disponivel: false, motivo: 'desligada', candidatos: [] });
    expect((await pede(m, '/api/apuracao/gov-df/df/projecao')).j).toMatchObject({ disponivel: false, motivo: 'desligada' });
    expect((await comando(m, cookie, { tipo: 'projecao', ligado: 'sim' })).status).toBe(400);
    await comando(m, cookie, { tipo: 'projecao', ligado: true });
    m.relogio.t += 1_500;
    expect((await pede(m, '/api/apuracao/pres/br/projecao')).j!.disponivel).toBe(true);
    // ETag → 304
    const r = await m.app.request('/api/apuracao/pres/br/projecao');
    expect((await m.app.request('/api/apuracao/pres/br/projecao', { headers: { 'if-none-match': r.headers.get('etag')! } })).status).toBe(304);
  }, 30_000);
});

describe('fonte TSE: só o que já está em cache (nunca baixa município)', () => {
  let m: Montado;
  let f: FakeFetch;
  beforeAll(async () => {
    f = criarFakeFetch();
    m = await montar({ fetch: f, agora: Date.UTC(2026, 9, 25, 21, 43, 0) });
    const cookie = await login(m);
    expect((await comando(m, cookie, { tipo: 'tse', tse: { baseUrl: BASE } })).status).toBe(200);
    expect((await comando(m, cookie, { tipo: 'fonte', fonte: 'tse' })).status).toBe(200);
    m.tse.sincronizar('pre', m.controller.state().tse); // sem polling de verdade
    await m.app.request('/api/apuracao/pres/br');
  });
  afterAll(async () => {
    await m.tse.encerrar();
  });

  it('responde 200 sem pedir arquivo de município nem acompanhamento', async () => {
    const antes = f.chamadas.length;
    for (const u of ['/api/apuracao/pres/br/projecao', '/api/apuracao/pres/sp/projecao', '/api/apuracao/gov-df/df/projecao']) {
      const { r, j } = await pede(m, u);
      expect(r.status, u).toBe(200);
      expect(typeof j!.disponivel).toBe('boolean');
      if (j!.disponivel) expect(j!.candidatos[0].pct + j!.candidatos[1].pct).toBeCloseTo(100, 3);
    }
    const novas = f.chamadas.slice(antes);
    expect(novas.filter((u) => /\/[a-z]{2}\d{5}-c\d{4}-|-ab\.json$/.test(u))).toEqual([]);
  }, 30_000);
});
