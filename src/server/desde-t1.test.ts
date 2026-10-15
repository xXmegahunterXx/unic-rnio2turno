/**
 * "Desde o 1º turno" por município no Brasil (GET /api/apuracao/:race/br/desde-t1): soma só municípios com 100% das
 * seções; com a apuração inteira, a soma dos municípios bate com o Brasil; na fonte TSE nunca baixa nada; nomes ocultos
 * → 404; cache curto com ETag.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NationalSnapshot } from '../shared/types';
import type { DesdeT1Agregado } from '../shared/desde-t1';
import { criarFakeFetch, BASE, type FakeFetch } from '../tse/__fixtures__/fake-fetch';
import { CC_DESDE_T1 } from './desde-t1';
import { comando, login, montar, type Montado } from './test-helpers';

const URL_BR = '/api/apuracao/pres/br/desde-t1';

describe('motor (simulação com nomes reais)', () => {
  let m: Montado;
  let cookie: string;
  beforeAll(async () => {
    m = await montar();
    cookie = await login(m);
    await comando(m, cookie, { tipo: 'fonte', fonte: 'simulacao' });
    await comando(m, cookie, { tipo: 'nomes-reais', ativo: true });
    await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' });
  });

  it('só Presidente no 2º turno; nomes ocultos → 404', async () => {
    expect((await m.app.request('/api/apuracao/gov-am/br/desde-t1')).status).toBe(404);
    expect((await m.app.request('/api/apuracao/pres-t1/br/desde-t1')).status).toBe(404);
    await comando(m, cookie, { tipo: 'nomes-reais', ativo: false });
    expect((await m.app.request(URL_BR)).status).toBe(404);
    await comando(m, cookie, { tipo: 'nomes-reais', ativo: true });
    expect((await m.app.request(URL_BR)).status).toBe(200);
  }, 30_000);

  it('em andamento: só os municípios concluídos; cobertura e "onde" coerentes', async () => {
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 60 });
    m.relogio.t += 6_000;
    const r = await m.app.request(URL_BR);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe(CC_DESDE_T1);
    const a = (await r.json()) as DesdeT1Agregado;
    expect(a.race).toBe('pres');
    expect(a.areasTotal).toBeGreaterThan(5500);
    expect(a.areasConcluidas).toBeGreaterThan(0);
    expect(a.areasConcluidas).toBeLessThan(a.areasTotal);
    expect(a.eleitoradoConcluido).toBeLessThan(a.eleitoradoTotal);
    expect(a.somas).toHaveLength(2);
    // mesma quantidade de lugares para os dois, com nome e só onde ele cresceu mais que o outro
    for (const l of a.onde) {
      expect(l.length).toBeLessThanOrEqual(3);
      for (const x of l) {
        expect(x.vantagem).toBeGreaterThan(0);
        expect(x.nome).toMatch(/\((?:[A-Z]{2}|Exterior)\)$/);
      }
    }
    // ETag → 304
    const e = r.headers.get('etag')!;
    expect((await m.app.request(URL_BR, { headers: { 'if-none-match': e } })).status).toBe(304);
  }, 30_000);

  it('apuração inteira: a soma dos municípios é exatamente a diferença do Brasil (votos agora − votos no 1º turno)', async () => {
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 100 });
    m.relogio.t += 6_000;
    const a = (await (await m.app.request(URL_BR)).json()) as DesdeT1Agregado;
    expect(a.areasConcluidas).toBe(a.areasTotal);
    expect(a.eleitoradoConcluido).toBe(a.eleitoradoTotal);
    const n2 = (await (await m.app.request('/api/apuracao/pres/br')).json()) as NationalSnapshot;
    const n1 = (await (await m.app.request('/api/apuracao/pres-t1/br')).json()) as NationalSnapshot;
    expect(n2.resumo.secoesTotalizadas).toBe(n2.resumo.secoes);
    expect(a.somas).toEqual([n2.resumo.votos[0] - n1.resumo.votos[0], n2.resumo.votos[1] - n1.resumo.votos[1]]);
  }, 30_000);
});

describe('fonte TSE: só o que já está em cache (nunca baixa nada)', () => {
  let m: Montado;
  let f: FakeFetch;
  beforeAll(async () => {
    f = criarFakeFetch();
    m = await montar({ fetch: f, agora: Date.UTC(2026, 9, 25, 21, 43, 0) });
    const cookie = await login(m);
    expect((await comando(m, cookie, { tipo: 'tse', tse: { baseUrl: BASE } })).status).toBe(200);
    expect((await comando(m, cookie, { tipo: 'fonte', fonte: 'tse' })).status).toBe(200);
    m.tse.sincronizar('pre', m.controller.state().tse); // sem polling de verdade
    await m.app.request('/api/apuracao/pres/br'); // a corrida existe na fonte
  });
  afterAll(async () => {
    await m.tse.encerrar();
  });

  it('sem município lido: nenhum concluído, total = todos os municípios; nenhum arquivo de município pedido', async () => {
    const antes = f.chamadas.length;
    const r = await m.app.request(URL_BR);
    expect(r.status).toBe(200);
    const a = (await r.json()) as DesdeT1Agregado;
    // a carga inicial da fonte (arquivos de UF/governador) pode terminar agora; arquivo de MUNICÍPIO ou de
    // acompanhamento ('ab'), nunca
    const novas = f.chamadas.slice(antes);
    expect(novas.filter((u) => /\/[a-z]{2}\d{5}-c\d{4}-|-ab\.json$/.test(u))).toEqual([]);
    expect(a.areasConcluidas).toBe(0);
    expect(a.areasTotal).toBeGreaterThan(5500);
    expect(a.somas).toEqual([0, 0]);
    expect(a.onde).toEqual([[], []]);
  }, 30_000);
});
