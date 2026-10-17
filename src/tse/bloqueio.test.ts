/**
 * I03 (leva 3) — respeito ao limite do TSE, sem rede e com relógio falso:
 *  - teto de pedidos por segundo (balde de fichas global) nunca ultrapassado numa janela de 10 s (nem 100 num segundo);
 *  - fatia reservada: o arquivo de uma disputa passa na frente de centenas de pedidos comuns;
 *  - bloqueio (`TseBloqueioError`): 429, 403 da Akamai / "Access Denied" e 403 num arquivo já lido; o 403 em XML de
 *    arquivo nunca lido continua "ausente";
 *  - pausa total: zero pedidos durante a pausa (laços, fila de municípios e consultas de visitantes), saúde e frescor
 *    mostram o bloqueio, e "Retomar agora" volta na hora;
 *  - `conferidoEm` só anda com 200/304 do arquivo principal;
 *  - cache negativo de município não publicado: 60 s, dobrando, e zerado quando o acompanhamento mostra o município andando.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Race, TseConfig } from '../shared/types';
import { TSE_LIMITE_POR_SEG } from '../shared/constants';
import { BaldeFichas, PAUSA_BLOQUEIO_MS, TseBloqueioError, TseClient, limitePorSegValido, retryAfterDe, type FetchLike } from './client';
import { TseSource } from './source';
import type { TseResultadoArquivo } from './feed';
import { BASE, criarFakeFetch, jsonFixture, type FakeFetch } from './__fixtures__/fake-fetch';
import racesJson from './__fixtures__/races.json';

const races = racesJson as unknown as Race[];
const CONFIG: TseConfig = { baseUrl: BASE, ciclo: 'ele2026', eleicaoPres: '6258', eleicaoGov: '6260', pleito: '3221', intervaloSeg: 15 };
const BR = 'ele2026/6258/dados/br/br-c0001-e006258-u.json';
/** 25/10/2026 18:00 de Brasília */
const INICIO = Date.UTC(2026, 9, 25, 21, 0, 0);
const NO_SUCH_KEY = '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>';
const AKAMAI_HTML =
  '<HTML><HEAD>\n<TITLE>Access Denied</TITLE>\n</HEAD><BODY>\n<H1>Access Denied</H1>\nYou don\'t have permission to access "http&#58;&#47;&#47;resultados&#46;tse&#46;jus&#46;br&#47;" on this server.<P>\nReference&#32;&#35;18&#46;1</BODY>\n</HTML>\n';

const base = jsonFixture<TseResultadoArquivo>(BR);
function arqBr(st: number, hora: string): TseResultadoArquivo {
  const d = structuredClone(base);
  Object.assign(d, { dg: '25/10/2026', hg: hora, dt: '25/10/2026', ht: hora, and: 'p', tf: 'n' });
  Object.assign(d.s, { st: String(st) });
  return d;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: INICIO });
});
afterEach(() => {
  vi.useRealTimers();
});

/** fetch que só registra o instante e responde 200 na hora */
function contador() {
  const instantes: number[] = [];
  const urls: string[] = [];
  const f: FetchLike = async (u) => {
    instantes.push(Date.now());
    urls.push(u);
    return new Response('{}', { status: 200 });
  };
  return { f, instantes, urls };
}

/** maior número de instantes numa janela [t, t + ms) */
function picoJanela(ts: number[], ms: number): number {
  const o = [...ts].sort((a, b) => a - b);
  let pico = 0;
  let j = 0;
  for (let i = 0; i < o.length; i++) {
    while (o[i] - o[j] >= ms) j++;
    pico = Math.max(pico, i - j + 1);
  }
  return pico;
}

describe('teto de pedidos por segundo (balde de fichas)', () => {
  it(`padrão ${TSE_LIMITE_POR_SEG.padrao}/s: nunca acima do teto numa janela de 10 s nem de 100 num segundo`, async () => {
    const { f, instantes } = contador();
    const c = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined });
    expect(c.limitePorSeg).toBe(40);
    const ps = Array.from({ length: 1000 }, (_, i) => c.getJson(`m${i}.json`, { prioridade: i % 2 ? 'baixa' : 'alta' }));
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.all(ps);
    expect(instantes).toHaveLength(1000);
    const rajada = 40; // até 1 s de teto guardado (40 + 40 ≤ 100, o limite publicado pelo TSE)
    expect(picoJanela(instantes, 10_000)).toBeLessThanOrEqual(40 * 10 + rajada);
    expect(picoJanela(instantes, 1_000)).toBeLessThanOrEqual(100);
    // e não fica muito abaixo do teto (a fila anda no ritmo dele)
    expect(picoJanela(instantes, 10_000)).toBeGreaterThanOrEqual(40 * 10 - 5);
    expect(c.stats().ritmo.picoSeg).toBeLessThanOrEqual(100);
  });

  it('teto ajustável na hora (painel → Fonte) e limitado a 5–90', async () => {
    expect(limitePorSegValido(200)).toBe(90);
    expect(limitePorSegValido(1)).toBe(5);
    expect(limitePorSegValido(undefined)).toBe(40);
    expect(limitePorSegValido('x')).toBe(40);
    const { f, instantes } = contador();
    const c = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined, limitePorSeg: 10 });
    const ps = Array.from({ length: 600 }, (_, i) => c.getJson(`m${i}.json`, { prioridade: 'baixa' }));
    await vi.advanceTimersByTimeAsync(5_000);
    const em5s = instantes.length;
    expect(em5s).toBeLessThanOrEqual(10 * 5 + 10);
    c.setLimitePorSeg(90);
    expect(c.stats().limitePorSeg).toBe(90);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(instantes.length - em5s).toBeGreaterThan(90 * 2);
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all(ps);
    // com 90/s a rajada encolhe (90 + 10 ≤ 100)
    expect(picoJanela(instantes.slice(em5s), 1_000)).toBeLessThanOrEqual(100);
  });

  it('fatia reservada: o arquivo de uma disputa passa na frente de centenas de pedidos comuns', async () => {
    const { f, urls } = contador();
    const c = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined });
    const ps = Array.from({ length: 400 }, (_, i) => c.getJson(`m${i}.json`, { prioridade: 'alta' }));
    await vi.advanceTimersByTimeAsync(2_000); // fila comum saturando o teto
    const antes = urls.length;
    const t0 = Date.now();
    let fim = 0;
    const br = c.getJson('br.json', { reservado: true, prioridade: 'alta' }).then(() => (fim = Date.now()));
    await vi.advanceTimersByTimeAsync(50);
    await br;
    expect(fim - t0).toBeLessThanOrEqual(30);
    expect(urls.indexOf(`${BASE}/br.json`)).toBeLessThanOrEqual(antes + 1);
    await vi.advanceTimersByTimeAsync(15_000);
    await Promise.all(ps);
  });

  it('balde: a reserva fica para os reservados', () => {
    let t = 0;
    const b = new BaldeFichas(40, () => t);
    expect(b.capacidade).toBe(40);
    expect(b.reserva).toBe(16);
    let comuns = 0;
    while (b.tentar(false)) comuns++;
    expect(comuns).toBe(40 - 16);
    let reservados = 0;
    while (b.tentar(true)) reservados++;
    expect(reservados).toBe(16);
    expect(b.esperaMs(true)).toBe(25);
    t += 25;
    expect(b.tentar(true)).toBe(true);
  });
});

describe('bloqueio do TSE (TseBloqueioError)', () => {
  const resposta = (status: number, body = '', headers: Record<string, string> = {}): FetchLike => async () => new Response(body, { status, headers });

  it('403 da Akamai (cabeçalho Server) ou página "Access Denied" é bloqueio; 403 em XML de arquivo nunca lido é "ausente"', async () => {
    const a = new TseClient({ baseUrl: BASE, fetch: resposta(403, 'x', { server: 'AkamaiGHost' }), sleep: async () => undefined });
    await expect(a.getJson('a.json')).rejects.toMatchObject({ name: 'TseBloqueioError', motivo: 'akamai', status: 403 });
    expect(a.bloqueio()).toMatchObject({ motivo: 'akamai', porRetryAfter: false, ate: INICIO + PAUSA_BLOQUEIO_MS });

    const h = new TseClient({ baseUrl: BASE, fetch: resposta(403, AKAMAI_HTML, { 'content-type': 'text/html' }), sleep: async () => undefined });
    await expect(h.getJson('a.json')).rejects.toMatchObject({ motivo: 'acesso-negado' });

    const x = new TseClient({ baseUrl: BASE, fetch: resposta(403, NO_SUCH_KEY, { 'content-type': 'application/xml' }), sleep: async () => undefined });
    expect(await x.getJson('a.json')).toMatchObject({ status: 'ausente', httpStatus: 403 });
    expect(x.bloqueio()).toBeNull();
  });

  it('403 num arquivo que já deu 200 é bloqueio (mesmo em XML)', async () => {
    let n = 0;
    const f: FetchLike = async () =>
      ++n === 1 ? new Response('{}', { status: 200, headers: { etag: '"a"' } }) : new Response(NO_SUCH_KEY, { status: 403 });
    const c = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined });
    expect((await c.getJson('a.json')).status).toBe('ok');
    await expect(c.getJson('a.json')).rejects.toMatchObject({ motivo: 'arquivo-ja-lido' });
    expect(c.bloqueio()?.arquivo).toBe('a.json');
    expect(c.stats().bloqueios).toBe(1);
  });

  it("chave 'pausa-tse': 'restrita' ignora o 403 em arquivo já lido; 'off' nunca pausa (429 = erro comum, 403 = ausente)", async () => {
    let modo: 'auto' | 'restrita' | 'off' = 'restrita';
    let n = 0;
    const jaLido: FetchLike = async () =>
      ++n === 1 ? new Response('{}', { status: 200, headers: { etag: '"a"' } }) : new Response(NO_SUCH_KEY, { status: 403 });
    const r = new TseClient({ baseUrl: BASE, fetch: jaLido, sleep: async () => undefined, modoPausa: () => modo });
    expect((await r.getJson('a.json')).status).toBe('ok');
    expect(await r.getJson('a.json')).toMatchObject({ status: 'ausente', httpStatus: 403 });
    expect(r.bloqueio()).toBeNull();
    // 'restrita' continua pausando com sinal claro (borda do TSE)
    const ak = new TseClient({ baseUrl: BASE, fetch: resposta(403, 'x', { server: 'AkamaiGHost' }), sleep: async () => undefined, modoPausa: () => 'restrita' });
    await expect(ak.getJson('a.json')).rejects.toMatchObject({ motivo: 'akamai' });
    // 'off': nada pausa
    modo = 'off';
    const t429 = new TseClient({ baseUrl: BASE, fetch: resposta(429), sleep: async () => undefined, modoPausa: () => modo });
    const e = await t429.getJson('a.json').catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(TseBloqueioError);
    expect(e).toMatchObject({ status: 429 });
    expect(t429.bloqueio()).toBeNull();
    const off403 = new TseClient({ baseUrl: BASE, fetch: resposta(403, 'x', { server: 'AkamaiGHost' }), sleep: async () => undefined, modoPausa: () => 'off' });
    expect(await off403.getJson('a.json')).toMatchObject({ status: 'ausente' });
    expect(off403.bloqueio()).toBeNull();
    // leitura com erro: vale o padrão ('auto')
    const quebrado = new TseClient({
      baseUrl: BASE,
      fetch: resposta(429),
      sleep: async () => undefined,
      modoPausa: () => {
        throw new Error('x');
      },
    });
    await expect(quebrado.getJson('a.json')).rejects.toBeInstanceOf(TseBloqueioError);
  });

  it('Retry-After em segundos ou data HTTP, dentro de 5 s–60 min', () => {
    const r = (v: string) => new Response('', { status: 429, headers: { 'retry-after': v } });
    expect(retryAfterDe(r('120'), INICIO)).toBe(120_000);
    expect(retryAfterDe(r('1'), INICIO)).toBe(5_000);
    expect(retryAfterDe(r('99999'), INICIO)).toBe(3_600_000);
    expect(retryAfterDe(r(new Date(INICIO + 300_000).toUTCString()), INICIO)).toBe(300_000);
    expect(retryAfterDe(r('amanhã'), INICIO)).toBeNull();
    expect(retryAfterDe(new Response('', { status: 429 }), INICIO)).toBeNull();
  });

  it('pausa: a fila de espera falha na hora, nada sai, e retomar() volta antes do prazo', async () => {
    let bloquear = true;
    let pedidos = 0;
    const f: FetchLike = async () => {
      pedidos++;
      return bloquear ? new Response('', { status: 429 }) : new Response('{}', { status: 200 });
    };
    const c = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined, concorrencia: 1 });
    const eventos: (string | null)[] = [];
    c.aoMudarBloqueio((b) => eventos.push(b ? b.motivo : null));
    const ps = Array.from({ length: 5 }, (_, i) => c.getJson(`a${i}.json`).catch((e: unknown) => e));
    const res = await Promise.all(ps);
    expect(pedidos).toBe(1);
    expect(res.every((e) => e instanceof TseBloqueioError)).toBe(true);
    expect(res.filter((e) => (e as TseBloqueioError).semPedido)).toHaveLength(4);
    expect(eventos).toEqual(['http-429']);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await expect(c.getJson('b.json')).rejects.toBeInstanceOf(TseBloqueioError);
    expect(pedidos).toBe(1);
    bloquear = false;
    expect(c.retomar()?.motivo).toBe('http-429');
    expect(eventos).toEqual(['http-429', null]);
    expect((await c.getJson('b.json')).status).toBe('ok');
    expect(c.retomar()).toBeNull(); // sem pausa: nada a retomar
  });
});

// ---------------------------------------------------------------------------------------------------
// TseSource: pausa total, saúde, frescor e conferidoEm
// ---------------------------------------------------------------------------------------------------

function criar(f: FakeFetch, extra: Partial<ConstructorParameters<typeof TseSource>[0]> = {}, semTeto = false) {
  const logs: string[] = [];
  const client = new TseClient({ baseUrl: BASE, fetch: f, sleep: async () => undefined, concorrencia: 8, semTeto });
  const src = new TseSource({ config: CONFIG, races, client, log: (m) => logs.push(m), aquecerMunicipios: false, ...extra });
  return { src, logs, client };
}

describe('pausa total no bloqueio (TseSource)', () => {
  it('429 no arquivo Brasil: zero pedidos por 11 min (laços e consultas), saúde e frescor mostram; depois volta sozinho', async () => {
    const f = criarFakeFetch();
    f.rotas.set(BR, arqBr(1000, '18:00:00'));
    const { src, logs } = criar(f);
    src.start();
    await vi.advanceTimersByTimeAsync(6_000);
    // um visitante já abriu um município (a lista de municípios do TSE fica em cache)
    const pm = src.municipio('pres', 'AC', '01120');
    await vi.advanceTimersByTimeAsync(1_000);
    await pm;
    const conferido = src.frescor().pres!.conferidoEm;
    expect(conferido).not.toBeNull();
    expect(src.health().ok).toBe(true);

    f.rotas.set(BR, { status: 429 });
    await vi.advanceTimersByTimeAsync(5_500); // próxima leitura prioritária leva o 429
    const h = src.health();
    expect(h.bloqueio).toMatchObject({ motivo: 'http-429', httpStatus: 429, porRetryAfter: false, arquivo: BR });
    expect(h.bloqueadoAte).toBe(h.bloqueio!.ate);
    expect(h.bloqueio!.ate - h.bloqueio!.desde).toBe(11 * 60_000);
    expect(h.ok).toBe(false);
    const fr = src.frescor();
    expect(fr.pres!.tseBloqueadoAte).toBe(h.bloqueadoAte);
    expect(fr['gov-df']?.tseBloqueadoAte).toBe(h.bloqueadoAte); // a pausa é global
    expect(fr.pres!.conferidoEm).toBe(conferido); // o 429 não conta como leitura boa
    expect(logs.filter((l) => l.includes('leituras PAUSADAS'))).toHaveLength(1);

    const t0 = f.chamadas.length;
    // visitantes continuam consultando: respondem com o último dado bom, sem pedir nada ao TSE
    const n = await src.nacional('pres');
    expect(n.resumo.secoesTotalizadas).toBe(1000);
    await src.uf('pres', 'SP');
    await src.municipio('pres', 'AC', '01120');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(f.chamadas.length).toBe(t0);
    expect(logs.filter((l) => /PAUSADAS|falha/.test(l))).toHaveLength(1); // nada de log repetido
    expect(src.frescor().pres!.conferidoEm).toBe(conferido);

    f.rotas.set(BR, arqBr(1200, '18:11:00'));
    await vi.advanceTimersByTimeAsync(90_000); // fim da pausa: o prioritário prova, o laço normal vem 2 s depois
    expect(f.chamadas.length).toBeGreaterThan(t0);
    expect(src.health().bloqueio).toBeNull();
    expect(src.frescor().pres!.tseBloqueadoAte).toBeUndefined();
    expect((await src.nacional('pres')).resumo.secoesTotalizadas).toBe(1200);
    expect(src.frescor().pres!.conferidoEm).toBeGreaterThan(conferido!);
    src.stop();
  });

  it('o 1º pedido depois da pausa é um só (o laço normal espera a prova do prioritário)', async () => {
    const f = criarFakeFetch();
    const { src } = criar(f);
    src.start();
    await vi.advanceTimersByTimeAsync(6_000);
    f.rotas.set(BR, { status: 429, headers: { 'retry-after': '60' } });
    await vi.advanceTimersByTimeAsync(5_500);
    const ate = src.health().bloqueadoAte!;
    expect(ate - Date.now()).toBeGreaterThan(50_000);
    const t0 = f.chamadas.length;
    await vi.advanceTimersByTimeAsync(ate - Date.now() + 500);
    // o prioritário provou com 1 pedido, levou outro 429 e a pausa recomeçou: o laço normal não saiu
    expect(f.chamadas.length - t0).toBe(1);
    expect(src.health().bloqueio).not.toBeNull();
    src.stop();
  });

  it('403 num arquivo já lido pausa; "Retomar agora" volta na hora', async () => {
    const f = criarFakeFetch();
    f.rotas.set(BR, arqBr(500, '18:00:00'));
    const { src, logs } = criar(f);
    src.start();
    await vi.advanceTimersByTimeAsync(6_000);
    f.rotas.set(BR, { status: 403, body: NO_SUCH_KEY });
    await vi.advanceTimersByTimeAsync(5_500);
    expect(src.health().bloqueio?.motivo).toBe('arquivo-ja-lido');
    f.rotas.set(BR, arqBr(600, '18:00:20'));
    const t0 = f.chamadas.length;
    expect(src.retomar()?.motivo).toBe('arquivo-ja-lido');
    expect(logs.some((l) => l.includes('retomadas pelo painel'))).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(f.chamadas.length).toBeGreaterThan(t0);
    expect(src.health().bloqueio).toBeNull();
    expect((await src.nacional('pres')).resumo.secoesTotalizadas).toBe(600);
    expect(src.retomar()).toBeNull();
    src.stop();
  });
});

describe('conferidoEm só com 200/304', () => {
  it('arquivo principal ausente (404): o TSE respondeu, mas o "Atualizado às" não anda', async () => {
    const f = criarFakeFetch();
    f.rotas.set(BR, { status: 404 });
    const { src } = criar(f);
    expect(await src.pollPrioritario()).toBe('ausente');
    await src.pollOnce();
    expect(src.frescor().pres!.conferidoEm).toBeNull();
    const pres = src.health().corridas.find((c) => c.race === 'pres')!;
    expect(pres.ultimoPollOk).not.toBeNull(); // respondeu (não é falha)
    expect(pres.conferidoEm).toBeNull();
    expect(src.health().prioritario!.ultimaLeituraOk).toBeNull();
    f.rotas.set(BR, arqBr(10, '18:00:00'));
    expect(await src.pollPrioritario()).toBe('novo');
    expect(src.frescor().pres!.conferidoEm).toBe(Date.now());
  });
});

describe('cache negativo de arquivo ainda não publicado', () => {
  const MUN = 'ele2026/6258/dados/ac/ac01120-c0001-e006258-u.json';
  const AB = 'ele2026/6258/dados/ac/ac-e006258-ab.json';
  const ab = (st: number) => ({
    ele: '6258',
    t: '2',
    dg: '25/10/2026',
    hg: '18:00:05',
    abr: [{ tpabr: 'mun', cdabr: '01120', dt: '25/10/2026', ht: '18:00:05', s: { ts: '45', st: String(st) }, e: { te: '1000', est: '500', c: '400', a: '100' } }],
  });
  const pedidosMun = (f: FakeFetch) => f.chamadas.filter((u) => u.endsWith(MUN)).length;

  it('60 s, dobrando a cada novo 404 (até 10 min); zerado quando o acompanhamento mostra o município andando', async () => {
    const f = criarFakeFetch();
    f.rotas.set(AB, ab(0));
    const { src } = criar(f, {}, true); // o teto tem testes próprios; aqui o relógio falso só anda quando o teste manda
    await src.uf('pres', 'AC'); // acompanhamento lido (nada totalizado)
    await src.municipio('pres', 'AC', '01120');
    expect(pedidosMun(f)).toBe(1); // 404: ainda não publicado
    await vi.advanceTimersByTimeAsync(30_000);
    await src.municipio('pres', 'AC', '01120');
    expect(pedidosMun(f)).toBe(1); // dentro dos 60 s
    await vi.advanceTimersByTimeAsync(31_000);
    await src.municipio('pres', 'AC', '01120');
    expect(pedidosMun(f)).toBe(2); // venceu; 404 de novo → 120 s
    await vi.advanceTimersByTimeAsync(90_000);
    await src.municipio('pres', 'AC', '01120');
    expect(pedidosMun(f)).toBe(2);
    await vi.advanceTimersByTimeAsync(31_000);
    await src.municipio('pres', 'AC', '01120');
    expect(pedidosMun(f)).toBe(3); // → 240 s

    // o TSE totaliza seções do município: o acompanhamento muda e o arquivo é pedido já, sem esperar os 240 s
    f.rotas.set(AB, ab(5));
    await vi.advanceTimersByTimeAsync(16_000);
    await src.uf('pres', 'AC'); // acompanhamento vencido: relido em segundo plano
    await vi.advanceTimersByTimeAsync(100);
    await src.uf('pres', 'AC');
    await vi.advanceTimersByTimeAsync(100);
    expect(pedidosMun(f)).toBe(4);
  });
});
