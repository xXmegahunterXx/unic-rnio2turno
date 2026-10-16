/**
 * I18 (leva 3) — aviso do arquivo NACIONAL parado, sem rede e com relógio falso: o arquivo Brasil de Presidente na
 * mesma geração (`dg/hg`) por mais de 90 s enquanto a soma das seções totalizadas das UFs (e do exterior) passa a dele
 * → `frescor().pres.nacionalParadoDesde`. Nada de soma de votos: só a comparação das contagens de seções.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Race, TseConfig } from '../shared/types';
import { TseClient } from './client';
import { NACIONAL_PARADO_MS, TseSource } from './source';
import type { TseResultadoArquivo } from './feed';
import { BASE, criarFakeFetch, jsonFixture, type FakeFetch } from './__fixtures__/fake-fetch';
import racesJson from './__fixtures__/races.json';

const races = racesJson as unknown as Race[];
const CONFIG: TseConfig = { baseUrl: BASE, ciclo: 'ele2026', eleicaoPres: '6258', eleicaoGov: '6260', pleito: '3221', intervaloSeg: 15 };
const BR = 'ele2026/6258/dados/br/br-c0001-e006258-u.json';
const uf = (u: string) => `ele2026/6258/dados/${u}/${u}-c0001-e006258-u.json`;
/** 25/10/2026 19:00 de Brasília */
const INICIO = Date.UTC(2026, 9, 25, 22, 0, 0);
/** "hh:mm:ss" de 25/10 em Brasília → epoch ms */
const brt = (h: string) => {
  const [hh, mm, ss] = h.split(':').map(Number);
  return Date.UTC(2026, 9, 25, hh + 3, mm, ss);
};

const base = jsonFixture<TseResultadoArquivo>(BR);
function arq(st: number, hora: string, abr = 'br'): TseResultadoArquivo {
  const d = structuredClone(base);
  Object.assign(d, { dg: '25/10/2026', hg: hora, dt: '25/10/2026', ht: hora, and: 'p', tf: 'n' });
  if (abr !== 'br') Object.assign(d, { tpabr: 'uf', cdabr: abr });
  Object.assign(d.s, { st: String(st) });
  return d;
}

function criar(f: FakeFetch) {
  const client = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined, concorrencia: 8, semTeto: true });
  return new TseSource({ config: CONFIG, races, client, log: () => undefined, aquecerMunicipios: false });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: INICIO });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('arquivo nacional parado com os estados andando', () => {
  it('preenche nacionalParadoDesde depois de 90 s e some quando o arquivo nacional volta a mudar', async () => {
    const f = criarFakeFetch();
    f.rotas.set(BR, arq(1000, '19:00:00'));
    f.rotas.set(uf('sp'), arq(600, '19:00:00', 'sp'));
    f.rotas.set(uf('mg'), arq(400, '19:00:00', 'mg'));
    const src = criar(f);
    src.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(src.frescor().pres!.nacionalParadoDesde).toBeUndefined();

    // os estados andam; o arquivo Brasil fica na geração das 19:00:00 (o TSE travou o nacional, como em 04/10)
    f.rotas.set(uf('sp'), arq(700, '19:00:40', 'sp'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(src.frescor().pres!.nacionalParadoDesde).toBeUndefined(); // ainda dentro dos 90 s
    await vi.advanceTimersByTimeAsync(NACIONAL_PARADO_MS);
    expect(src.frescor().pres!.nacionalParadoDesde).toBe(brt('19:00:00'));
    expect(src.health().corridas.find((c) => c.race === 'pres')!.nacionalParadoDesde).toBe(brt('19:00:00'));
    // o placar continua o do arquivo oficial (nada de soma dos estados)
    expect((await src.nacional('pres')).resumo.secoesTotalizadas).toBe(1000);
    // só Presidente (abrangência Brasil) tem arquivo nacional
    expect(src.frescor()['gov-df']?.nacionalParadoDesde).toBeUndefined();

    // o TSE volta a publicar o nacional
    f.rotas.set(BR, arq(1100, '19:02:30'));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(src.frescor().pres!.nacionalParadoDesde).toBeUndefined();
    src.stop();
  });

  it('arquivo nacional parado mas em dia com os estados (fim da apuração, antes das 17h): nada de aviso', async () => {
    const f = criarFakeFetch();
    f.rotas.set(BR, arq(1000, '19:00:00'));
    f.rotas.set(uf('sp'), arq(600, '19:00:00', 'sp'));
    f.rotas.set(uf('mg'), arq(400, '19:00:00', 'mg'));
    const src = criar(f);
    src.start();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(src.frescor().pres!.nacionalParadoDesde).toBeUndefined();
    src.stop();
  });

  it('geração nova do arquivo nacional, mesmo com as mesmas seções, conta como "andando"', async () => {
    const f = criarFakeFetch();
    f.rotas.set(BR, arq(1000, '19:00:00'));
    f.rotas.set(uf('sp'), arq(1100, '19:00:00', 'sp'));
    const src = criar(f);
    src.start();
    // o nacional ganha geração nova a cada 30 s (os números ainda não alcançaram os estados)
    for (const h of ['19:00:30', '19:01:00', '19:01:30', '19:02:00']) {
      await vi.advanceTimersByTimeAsync(30_000);
      f.rotas.set(BR, arq(1000, h));
    }
    await vi.advanceTimersByTimeAsync(6_000);
    expect(src.frescor().pres!.nacionalParadoDesde).toBeUndefined();
    src.stop();
  });
});
