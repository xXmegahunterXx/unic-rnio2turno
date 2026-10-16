/**
 * TseManager (leva 3): chave 'aviso-nacional' no frescor público (I18), "Retomar agora" (I03, comando `tse-retomar`) e
 * o teto de pedidos por segundo vindo da TseConfig (`limitePorSeg`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModoAvisoNacional, Race, TseConfig } from '../shared/types';
import { TseClient, TseSource } from '../tse';
import { BASE, criarFakeFetch, jsonFixture, type FakeFetch } from '../tse/__fixtures__/fake-fetch';
import type { TseResultadoArquivo } from '../tse/feed';
import racesJson from '../tse/__fixtures__/races.json';
import { TseManager } from './tse';

const races = racesJson as unknown as Race[];
const CONFIG: TseConfig = { baseUrl: BASE, ciclo: 'ele2026', eleicaoPres: '6258', eleicaoGov: '6260', pleito: '3221', intervaloSeg: 15 };
const BR = 'ele2026/6258/dados/br/br-c0001-e006258-u.json';
const SP = 'ele2026/6258/dados/sp/sp-c0001-e006258-u.json';
const INICIO = Date.UTC(2026, 9, 25, 22, 0, 0);

const base = jsonFixture<TseResultadoArquivo>(BR);
function arq(st: number, hora: string, abr = 'br'): TseResultadoArquivo {
  const d = structuredClone(base);
  Object.assign(d, { dg: '25/10/2026', hg: hora, dt: '25/10/2026', ht: hora, and: 'p', tf: 'n' });
  if (abr !== 'br') Object.assign(d, { tpabr: 'uf', cdabr: abr });
  Object.assign(d.s, { st: String(st) });
  return d;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: INICIO });
});
afterEach(() => {
  vi.useRealTimers();
});

function montar(f: FakeFetch, modo: { v: ModoAvisoNacional }) {
  let src: TseSource | null = null;
  const tse = new TseManager({
    races,
    log: () => undefined,
    avisoNacional: () => modo.v,
    criar: (config) => {
      const client = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined, concorrencia: 8, semTeto: true, limitePorSeg: config.limitePorSeg });
      src = new TseSource({ config, races, client, log: () => undefined, aquecerMunicipios: false });
      return src;
    },
  });
  return { tse, fonte: () => src! };
}

describe('TseManager (leva 3)', () => {
  it("aviso-nacional 'off' tira nacionalParadoDesde do frescor público; 'auto' devolve (o detector segue rodando)", async () => {
    const f = criarFakeFetch();
    f.rotas.set(BR, arq(1000, '19:00:00'));
    f.rotas.set(SP, arq(1000, '19:00:00', 'sp'));
    const modo = { v: 'auto' as ModoAvisoNacional };
    const { tse } = montar(f, modo);
    tse.sincronizar('tse', CONFIG);
    await vi.advanceTimersByTimeAsync(1_000);
    f.rotas.set(SP, arq(1200, '19:00:40', 'sp'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(tse.frescor()!.pres!.nacionalParadoDesde).toBe(Date.UTC(2026, 9, 25, 22, 0, 0));
    modo.v = 'off';
    expect(tse.frescor()!.pres!.nacionalParadoDesde).toBeUndefined();
    expect(tse.health()!.corridas.find((c) => c.race === 'pres')!.nacionalParadoDesde).not.toBeNull();
    modo.v = 'auto';
    expect(tse.frescor()!.pres!.nacionalParadoDesde).toBeDefined();
    await tse.encerrar();
  });

  it('retomar(): sem fonte ou sem pausa não faz nada; com pausa, retoma', async () => {
    const f = criarFakeFetch();
    const { tse } = montar(f, { v: 'auto' });
    expect(tse.retomar()).toEqual({ retomou: false, detalhe: 'As leituras do TSE não estavam pausadas.' });
    tse.sincronizar('tse', CONFIG);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(tse.retomar().retomou).toBe(false);
    f.rotas.set(BR, { status: 429 });
    await vi.advanceTimersByTimeAsync(5_500);
    expect(tse.health()!.bloqueadoAte).not.toBeNull();
    expect(tse.frescor()!.pres!.tseBloqueadoAte).toBe(tse.health()!.bloqueadoAte);
    f.rotas.delete(BR);
    const r = tse.retomar();
    expect(r.retomou).toBe(true);
    expect(tse.health()!.bloqueio).toBeNull();
    await tse.encerrar();
  });

  it('limitePorSeg da TseConfig chega ao cliente (e muda na hora pelo comando tse)', async () => {
    const f = criarFakeFetch();
    const { tse } = montar(f, { v: 'auto' });
    tse.garantir({ ...CONFIG, limitePorSeg: 25 });
    expect(tse.health()!.http.limitePorSeg).toBe(25);
    tse.sincronizar('tse', { ...CONFIG, limitePorSeg: 60 });
    expect(tse.health()!.http.limitePorSeg).toBe(60);
    expect(tse.health()!.config.limitePorSeg).toBe(60);
    await tse.encerrar();
  });
});
