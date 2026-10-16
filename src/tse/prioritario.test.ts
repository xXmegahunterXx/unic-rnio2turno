/**
 * Arquivo prioritário (resumo Brasil de Presidente) e frescor ("mais rápido que a TV"), sem rede:
 *  - laço próprio, mais curto, só com o arquivo Brasil; o laço normal deixa de pedi-lo enquanto o prioritário está em dia;
 *  - requisições condicionais (304) e nada em paralelo além do limite do cliente;
 *  - backoff quando o TSE falha (sem retentativas no prioritário) e volta rápida quando ele responde;
 *  - cópia mais antiga vinda do CDN do TSE é descartada (o placar nunca "volta");
 *  - marca dos números: muda só quando o conteúdo muda; `frescor()` com a última leitura boa.
 * Relógio e timers falsos (vi.useFakeTimers): os laços rodam de verdade, em tempo simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Race, TseConfig } from '../shared/types';
import { TseClient } from './client';
import { TseSource } from './source';
import type { TseResultadoArquivo } from './feed';
import { BASE, criarFakeFetch, jsonFixture, type FakeFetch } from './__fixtures__/fake-fetch';
import racesJson from './__fixtures__/races.json';

const races = racesJson as unknown as Race[];
const CONFIG: TseConfig = { baseUrl: BASE, ciclo: 'ele2026', eleicaoPres: '6258', eleicaoGov: '6260', pleito: '3221', intervaloSeg: 15 };
const BR = 'ele2026/6258/dados/br/br-c0001-e006258-u.json';
const SP = 'ele2026/6258/dados/sp/sp-c0001-e006258-u.json';
/** 25/10/2026 18:00 de Brasília */
const INICIO = Date.UTC(2026, 9, 25, 21, 0, 0);

const base = jsonFixture<TseResultadoArquivo>(BR);
/** Arquivo Brasil com `st` seções totalizadas, gerado (dg/hg) e totalizado (dt/ht) em `hora` (Brasília). */
function arqBr(st: number, hora: string, votos: [number, number] = [st * 10, st * 9]): TseResultadoArquivo {
  const d = structuredClone(base);
  Object.assign(d, { dg: '25/10/2026', hg: hora, dt: '25/10/2026', ht: hora, and: 'p', tf: 'n' });
  Object.assign(d.s, { st: String(st) });
  const c = votos[0] + votos[1] + 30;
  Object.assign(d.e, { est: String(st * 300), c: String(c), a: String(st * 300 - c) });
  Object.assign(d.v, { tv: String(c), vvc: String(c - 30), vv: String(c - 30), vnom: String(c - 30), vb: '10', tvn: '20' });
  for (const cd of d.carg[0].agr.flatMap((a) => a.par.flatMap((x) => x.cand))) cd.vap = String(cd.n === '13' ? votos[0] : votos[1]);
  return d;
}

const contar = (f: FakeFetch, path: string, desde = 0) => f.chamadas.slice(desde).filter((u) => u.endsWith(path)).length;

function criar(f: FakeFetch, config: Partial<TseConfig> = {}) {
  const logs: string[] = [];
  // semTeto: estes testes medem o ritmo dos laços, não o teto de pedidos por segundo (que tem testes próprios)
  const client = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined, concorrencia: 8, semTeto: true });
  const src = new TseSource({ config: { ...CONFIG, ...config }, races, client, log: (m) => logs.push(m), aquecerMunicipios: false });
  return { src, logs, client };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: INICIO });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('laço prioritário (resumo Brasil de Presidente)', () => {
  it('lê o arquivo Brasil a cada 5 s e os demais a cada 15 s, com pedido condicional (304)', async () => {
    const f = criarFakeFetch();
    const { src } = criar(f);
    src.start();
    await vi.advanceTimersByTimeAsync(100);
    const t0 = f.chamadas.length;
    await vi.advanceTimersByTimeAsync(60_000);
    // 60 s: ~12 leituras do Brasil (prioritário) e ~4 dos estados (laço normal, que não repete o Brasil)
    const br = contar(f, BR, t0);
    const sp = contar(f, SP, t0);
    expect(br).toBeGreaterThanOrEqual(11);
    expect(br).toBeLessThanOrEqual(13);
    expect(sp).toBeGreaterThanOrEqual(3);
    expect(sp).toBeLessThanOrEqual(5);
    const h = src.health();
    expect(h.prioritario).toMatchObject({ race: 'pres', ativo: true, intervaloSeg: 5, falhasConsecutivas: 0 });
    expect(h.prioritario!.contagem.naoModificados).toBeGreaterThanOrEqual(10); // nada mudou: 304
    expect(h.http.emVoo).toBeLessThanOrEqual(8);
    src.stop();
  });

  it('dado novo no Brasil aparece na próxima leitura prioritária e muda a marca; nada novo = mesma marca', async () => {
    const f = criarFakeFetch();
    const { src } = criar(f);
    src.start();
    await vi.advanceTimersByTimeAsync(100);
    const m0 = src.marca('pres');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(src.marca('pres')).toBe(m0); // só 304: mesma marca

    f.rotas.set(BR, arqBr(1200, '18:00:20'));
    await vi.advanceTimersByTimeAsync(5_100); // no máximo um intervalo prioritário
    const n = await src.nacional('pres');
    expect(n.resumo.secoesTotalizadas).toBe(1200);
    const m1 = src.marca('pres');
    expect(m1).not.toBe(m0);
    const fr = src.frescor().pres!;
    expect(fr.marca).toBe(m1);
    expect(fr.conferidoEm).toBeGreaterThan(Date.now() - 6_000);
    // atraso TSE → nós medido pela geração do arquivo (18:00:20) e a leitura
    const at = src.health().prioritario!.atrasoMs;
    expect(at.amostras).toBe(1);
    expect(at.ultimo).toBeGreaterThanOrEqual(0);
    expect(at.ultimo).toBeLessThanOrEqual(6_000);
    src.stop();
  });

  it('cópia mais ANTIGA do CDN do TSE (geração anterior) é descartada: o placar não volta', async () => {
    const f = criarFakeFetch();
    const { src } = criar(f);
    f.rotas.set(BR, arqBr(2000, '18:00:30'));
    expect(await src.pollPrioritario()).toBe('novo');
    const m = src.marca('pres');
    f.rotas.set(BR, arqBr(1500, '18:00:10')); // outro servidor do CDN, ainda com o arquivo de 20 s antes
    expect(await src.pollPrioritario()).toBe('antigo');
    expect(src.marca('pres')).toBe(m);
    expect(src.health().prioritario!.contagem.antigosDescartados).toBe(1);
    expect(src.health().corridas.find((c) => c.race === 'pres')!.secoesTotalizadas).toBe(2000);
    // geração mais nova com menos seções (retotalização do TSE): segue o TSE
    f.rotas.set(BR, arqBr(1990, '18:00:40'));
    expect(await src.pollPrioritario()).toBe('novo');
    expect(src.marca('pres')).not.toBe(m);
    expect((await src.nacional('pres')).resumo.secoesTotalizadas).toBe(1990);
  });

  it('TSE fora do ar: backoff no prioritário (1 tentativa por vez) e no laço normal; volta rápida quando responde', async () => {
    const f = criarFakeFetch();
    const { src, logs } = criar(f);
    src.start();
    await vi.advanceTimersByTimeAsync(6_000);
    f.foraDoAr = true;
    const t0 = f.chamadas.length;
    await vi.advanceTimersByTimeAsync(120_000);
    // sem backoff seriam 24 leituras do Brasil em 2 min; com 5→10→20→30→30 s (±20%): no máximo ~6
    const br = contar(f, BR, t0);
    expect(br).toBeGreaterThanOrEqual(3);
    expect(br).toBeLessThanOrEqual(7);
    // laço normal: 3 tentativas por arquivo, mas os ciclos se espaçam (15→30→60→120 s): bem menos que 8 ciclos
    const sp = contar(f, SP, t0);
    expect(sp).toBeLessThanOrEqual(4 * 3);
    expect(src.health().ok).toBe(false); // o arquivo Brasil não está sendo lido: a saúde mostra
    const h = src.health();
    expect(h.prioritario!.falhasConsecutivas).toBeGreaterThanOrEqual(3);
    expect(h.prioritario!.esperaSeg).toBeGreaterThan(10);
    expect(h.esperaSeg).toBeGreaterThan(15);
    expect(logs.filter((l) => l.includes('falha na leitura prioritária'))).toHaveLength(1); // log sem repetição

    f.foraDoAr = false;
    f.rotas.set(BR, arqBr(800, '18:03:00'));
    await vi.advanceTimersByTimeAsync(75_000); // a próxima leitura prioritária (≤ 30 s + 20%) vê o TSE de volta
    expect(src.health().prioritario!.falhasConsecutivas).toBe(0);
    expect((await src.nacional('pres')).resumo.secoesTotalizadas).toBe(800);
    expect(logs.some((l) => l.includes('leitura prioritária normalizada'))).toBe(true);
    // e o laço normal sai do backoff logo depois (antecipado pelo prioritário; não espera os até 2 min do backoff)
    const h2 = src.health();
    expect(h2.corridas.find((c) => c.race === 'pres')!.falhasConsecutivas).toBe(0);
    expect(h2.esperaSeg).toBe(15);
    expect(h2.ok).toBe(true);
    src.stop();
  });

  it('TSE fora do ar: a fila de municípios em segundo plano para (milhares de arquivos não viram 3 tentativas cada)', async () => {
    const f = criarFakeFetch();
    // SP em apuração com 300 municípios a baixar (códigos fictícios: 404 = "ainda não publicado", não é erro)
    const uf = arqBr(50, '18:00:05');
    Object.assign(uf, { tpabr: 'uf', cdabr: 'sp' });
    f.rotas.set(SP, uf);
    const abr = Array.from({ length: 300 }, (_, i) => ({ tpabr: 'mun', cdabr: String(80000 + i), dt: '25/10/2026', ht: '18:00:05', s: { ts: '10', st: '5' }, e: { te: '1000', est: '500', c: '400', a: '100' } }));
    f.rotas.set('ele2026/6258/dados/sp/sp-e006258-ab.json', { ele: '6258', t: '2', dg: '25/10/2026', hg: '18:00:05', abr });
    // cada arquivo de município leva 200 ms (a fila de 300 levaria ~30 s com 2 trabalhadores)
    const lento = (async (u: string, init?: RequestInit) => {
      if (/\/sp8\d{4}-c0001/.test(u)) await new Promise((r) => setTimeout(r, 200));
      return f(u, init);
    }) as typeof f;
    const client = new TseClient({ baseUrl: BASE, fetch: lento, sleep: async () => undefined, concorrencia: 8, semTeto: true });
    const src = new TseSource({ config: CONFIG, races, client, log: () => undefined, workersMunicipios: 2, concorrencia: 8 });
    const mun = (desde: number) => f.chamadas.slice(desde).filter((u) => /\/sp8\d{4}-c0001/.test(u)).length;
    src.start();
    await vi.advanceTimersByTimeAsync(1_000); // 1º ciclo: agenda os 300 municípios; a fila começa a baixar
    f.foraDoAr = true;
    const t0 = f.chamadas.length;
    await vi.advanceTimersByTimeAsync(90_000);
    // sem a pausa: ~300 arquivos × 3 tentativas; com ela, só o que sai até a 1ª leitura prioritária falhar (≤ 5 s)
    expect(mun(t0)).toBeLessThan(120);
    expect(src.health().municipios.fila).toBe(0);
    f.foraDoAr = false;
    await vi.advanceTimersByTimeAsync(90_000);
    expect(mun(t0)).toBeGreaterThan(100); // TSE de volta: a fila volta a andar
    src.stop();
  });

  it('intervalo prioritário ≥ normal desliga o laço à parte (o normal lê o Brasil); a troca vale na hora', async () => {
    const f = criarFakeFetch();
    const { src } = criar(f, { intervaloPrioritarioSeg: 15 });
    src.start();
    await vi.advanceTimersByTimeAsync(100);
    const t0 = f.chamadas.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(contar(f, BR, t0)).toBeLessThanOrEqual(5);
    expect(src.health().prioritario!.ativo).toBe(false);

    src.setConfig({ intervaloPrioritarioSeg: 3 });
    const t1 = f.chamadas.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(contar(f, BR, t1)).toBeGreaterThanOrEqual(9);
    expect(src.health().prioritario).toMatchObject({ ativo: true, intervaloSeg: 3 });
    src.stop();
  });

  it('stop() para os dois laços', async () => {
    const f = criarFakeFetch();
    const { src } = criar(f);
    src.start();
    await vi.advanceTimersByTimeAsync(10_000);
    src.stop();
    const n = f.chamadas.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(f.chamadas.length).toBe(n);
  });
});

describe('marca dos números e frescor', () => {
  it('marca: hash do conteúdo (igual em outra instância com os mesmos dados; muda com o dado)', async () => {
    const f = criarFakeFetch();
    f.rotas.set(BR, arqBr(10, '18:00:05'));
    const a = criar(f).src;
    const b = criar(f).src;
    await a.pollOnce();
    await b.pollOnce();
    expect(a.marca('pres')).toBe(b.marca('pres'));
    expect(a.marca('pres')).toMatch(/^[0-9a-z]{1,12}$/);
    f.rotas.set(BR, arqBr(10, '18:00:05', [101, 89])); // mesmas seções, votos diferentes
    await a.pollOnce();
    expect(a.marca('pres')).not.toBe(b.marca('pres'));
    // frescor: todas as disputas do 2º turno; sem leitura boa ainda → conferidoEm null
    const c = criar(criarFakeFetch()).src;
    const fr = c.frescor();
    expect(Object.keys(fr).sort()).toEqual(races.filter((r) => r.turno === 2).map((r) => r.id).sort());
    expect(fr.pres!.conferidoEm).toBeNull();
  });
});
