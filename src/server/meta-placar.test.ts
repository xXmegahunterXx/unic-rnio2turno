/**
 * Placar da fonte TSE nas meta tags (I07a): só o cache (nunca baixa nada), nunca lança, cópia renovada em segundo plano
 * no máximo a cada 10 s, ordem da urna, nomes ocultos e a ligação com o contexto das meta tags. No fim, o app inteiro na
 * fonte TSE com o fetch falso: a descrição de /apuracao ganha o placar do arquivo nacional sem nenhum pedido a mais.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Race, Summary, UF } from '../shared/types';
import { BASE, criarFakeFetch, jsonFixture, type FakeFetch } from '../tse/__fixtures__/fake-fetch';
import { MetaPlacarTse, RENOVAR_MS, VALIDADE_MS, leituraSemDownload, ligarMetaNoite, type FonteTseMeta } from './meta-placar';
import { metaDaRota, type ContextoMeta } from './meta-tags';
import { comando, datasetReal, login, montar, type Montado } from './test-helpers';

let races: Map<string, Race>;
beforeAll(async () => {
  const ds = await datasetReal();
  races = new Map(ds.meta.races.map((r) => [r.id, r]));
});

const resumo = (votos: number[], st = 600, s = 1000): Summary => ({
  secoes: s,
  secoesTotalizadas: st,
  eleitorado: 10_000,
  eleitoradoTotalizado: 6_000,
  comparecimento: 5_000,
  abstencao: 1_000,
  votos,
  brancos: 10,
  nulos: 20,
  status: 'apurando',
  lider: votos[0] >= votos[1] ? 0 : 1,
  eleito: null,
  ultimaAtualizacao: null,
});

/** TseSource falso: conta as leituras e deixa controlar a saúde. */
function fonteFalsa(agora: () => number) {
  const f = {
    leiturasNacional: 0,
    leiturasMunicipios: 0,
    ultimoPoll: agora() as number | null,
    mapeadaComo: 'pres' as string | null,
    bloqueadoAte: null as number | null,
    falhar: false,
    br: resumo([4_800, 5_200]),
    sp: resumo([1_100, 900], 300, 500),
    health() {
      return {
        bloqueadoAte: f.bloqueadoAte,
        intervaloSeg: 15,
        esperaSeg: 15,
        corridas: [{ race: 'pres', mapeadaComo: f.mapeadaComo, ultimoPoll: f.ultimoPoll }],
      };
    },
    async nacional(raceId: string) {
      f.leiturasNacional++;
      if (f.falhar) throw new Error('falhou');
      return { race: raceId, resumo: f.br, ufs: { SP: f.sp } as Partial<Record<UF, Summary>> };
    },
    resumosMunicipaisEmCache(raceId: string) {
      f.leiturasMunicipios++;
      if (f.falhar) throw new Error('falhou');
      return raceId === 'pres' ? [{ uf: 'SP' as UF, cod: '62910', resumo: resumo([700, 300], 50, 50) }] : [];
    },
  };
  return f;
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('guarda "não baixa nada" (espelha a do TseSource)', () => {
  const h = (o: Partial<ReturnType<FonteTseMeta['health']>> & { corrida?: { mapeadaComo: string | null; ultimoPoll: number | null } }) => ({
    bloqueadoAte: null,
    intervaloSeg: 10,
    esperaSeg: 10,
    corridas: o.corrida ? [{ race: 'pres', ...o.corrida }] : [],
    ...o,
  });
  it('pausa por bloqueio: lê (a fonte não pede nada); sem a corrida, sem arquivo ou lida há muito: não lê', () => {
    expect(leituraSemDownload(h({ bloqueadoAte: 2_000 }), 'pres', 1_000)).toBe(true);
    expect(leituraSemDownload(h({}), 'pres', 1_000)).toBe(false);
    expect(leituraSemDownload(h({ corrida: { mapeadaComo: null, ultimoPoll: 900 } }), 'pres', 1_000)).toBe(false);
    expect(leituraSemDownload(h({ corrida: { mapeadaComo: 'pres', ultimoPoll: null } }), 'pres', 1_000)).toBe(false);
    expect(leituraSemDownload(h({ corrida: { mapeadaComo: 'pres', ultimoPoll: 0 } }), 'pres', 13_000)).toBe(true);
    expect(leituraSemDownload(h({ corrida: { mapeadaComo: 'pres', ultimoPoll: 0 } }), 'pres', 14_500)).toBe(false);
    // backoff: espera maior vale
    expect(leituraSemDownload(h({ esperaSeg: 60, corrida: { mapeadaComo: 'pres', ultimoPoll: 0 } }), 'pres', 80_000)).toBe(true);
  });
});

describe('MetaPlacarTse', () => {
  it('Brasil e UF: a 1ª consulta pede a cópia em segundo plano (null); depois usa a cópia, renovada a cada 10 s', async () => {
    let t = 1_000_000;
    const f = fonteFalsa(() => t);
    const mp = new MetaPlacarTse({ tse: { fonte: f }, fonteDe: () => 'tse', races, now: () => t });
    expect(mp.placar('pres')).toBeNull();
    expect(f.leiturasNacional).toBe(1);
    expect(mp.placar('pres')).toBeNull(); // pedido em andamento: não repete
    expect(f.leiturasNacional).toBe(1);
    await esperar();
    const br = mp.placar('pres')!;
    expect(br.resumo.votos).toEqual([4_800, 5_200]);
    expect(br.simulacao).toBe(false);
    expect(br.race.candidatos.map((c) => c.numero)).toEqual([13, 22]); // ordem da urna
    expect(mp.placar('pres', 'SP')!.resumo.votos).toEqual([1_100, 900]);
    expect(mp.placar('pres', 'RJ')).toBeNull(); // UF sem arquivo em cache
    expect(f.leiturasNacional).toBe(1);
    t += RENOVAR_MS;
    f.ultimoPoll = t;
    f.br = resumo([5_000, 5_000], 900);
    expect(mp.placar('pres')!.resumo.secoesTotalizadas).toBe(600); // ainda a cópia anterior…
    await esperar();
    expect(mp.placar('pres')!.resumo.secoesTotalizadas).toBe(900); // …e a nova logo depois
    expect(f.leiturasNacional).toBe(2);
  });

  it('leitura arriscada (corrida sem arquivo ou lida há muito): não pede nada; cópia velha demais some', async () => {
    let t = 5_000_000;
    const f = fonteFalsa(() => t);
    const mp = new MetaPlacarTse({ tse: { fonte: f }, fonteDe: () => 'tse', races, now: () => t });
    f.mapeadaComo = null;
    expect(mp.placar('pres')).toBeNull();
    expect(f.leiturasNacional).toBe(0);
    f.mapeadaComo = 'pres';
    mp.placar('pres');
    await esperar();
    expect(mp.placar('pres')).not.toBeNull();
    // o laço parou de ler (poll antigo): nenhuma leitura nova; a cópia vale até 15 min
    t += 5 * 60_000;
    expect(mp.placar('pres')).not.toBeNull();
    t += VALIDADE_MS;
    expect(mp.placar('pres')).toBeNull();
    expect(f.leiturasNacional).toBe(1);
  });

  it('município: só o que já está em cache; mapa remontado no máximo a cada 10 s', () => {
    let t = 9_000_000;
    const f = fonteFalsa(() => t);
    const mp = new MetaPlacarTse({ tse: { fonte: f }, fonteDe: () => 'tse', races, now: () => t });
    expect(mp.placarMunicipio('pres', 'SP', '62910')!.resumo.votos).toEqual([700, 300]);
    expect(mp.placarMunicipio('pres', 'SP', '71072')).toBeNull();
    expect(f.leiturasMunicipios).toBe(1);
    t += RENOVAR_MS - 1;
    mp.placarMunicipio('pres', 'SP', '62910');
    expect(f.leiturasMunicipios).toBe(1);
    t += 1;
    mp.placarMunicipio('pres', 'SP', '62910');
    expect(f.leiturasMunicipios).toBe(2);
    expect(f.leiturasNacional).toBe(0);
  });

  it('nunca lança: fonte ausente, erro da fonte, corrida de 1º turno ou desconhecida → null', async () => {
    const t = 1_000;
    const f = fonteFalsa(() => t);
    expect(new MetaPlacarTse({ tse: { fonte: null }, fonteDe: () => 'tse', races, now: () => t }).placar('pres')).toBeNull();
    const mp = new MetaPlacarTse({ tse: { fonte: f }, fonteDe: () => 'tse', races, now: () => t });
    f.falhar = true;
    expect(mp.placar('pres')).toBeNull();
    await esperar();
    expect(mp.placar('pres')).toBeNull();
    expect(mp.placarMunicipio('pres', 'SP', '62910')).toBeNull();
    f.falhar = false;
    expect(mp.placar('pres-t1')).toBeNull();
    expect(mp.placar('xyz')).toBeNull();
    expect(mp.placarMunicipio('pres-t1', 'SP', '62910')).toBeNull();
  });

  it('nomes ocultos no painel: Candidato A/B', async () => {
    const t = 1_000;
    const f = fonteFalsa(() => t);
    const mp = new MetaPlacarTse({ tse: { fonte: f }, fonteDe: () => 'tse', races, now: () => t, anonimizado: () => true });
    mp.placar('pres');
    await esperar();
    expect(mp.placar('pres')!.race.candidatos.map((c) => c.nomeUrna)).toEqual(['Candidato A', 'Candidato B']);
  });
});

describe('ligarMetaNoite', () => {
  it('corridas na fonte TSE usam o cache da fonte; as do motor seguem com o placar já configurado; relógio ligado', async () => {
    const t = Date.UTC(2026, 9, 25, 22, 0, 0);
    const f = fonteFalsa(() => t);
    const motor = vi.fn(() => null);
    const ctx: ContextoMeta = { races, nomeMunicipio: () => 'Campinas', placar: motor, placarMunicipio: motor, fase: () => 'apurando' };
    ligarMetaNoite(ctx, { tse: { fonte: f }, fonteDe: (r) => (races.get(r)?.turno === 2 ? 'tse' : 'motor'), races, now: () => t });
    expect(ctx.agora?.()).toBe(t);
    ctx.placar!('pres-t1');
    expect(motor).toHaveBeenCalledTimes(1);
    metaDaRota('/apuracao', new URLSearchParams(), ctx);
    await esperar();
    const m = metaDaRota('/apuracao', new URLSearchParams(), ctx);
    expect(m.descricao).toMatch(/^Com 60,00% das seções totalizadas: Lula 48,00% · Flávio Bolsonaro 52,00% dos votos válidos\./);
    const mun = metaDaRota('/apuracao/sp/62910', new URLSearchParams(), ctx);
    expect(mun.descricao).toMatch(/^Campinas \(SP\) · Com 100,00% das seções totalizadas: Lula 70,00% · Flávio Bolsonaro 30,00%/);
    expect(motor).toHaveBeenCalledTimes(1);
  });

  it("chave 'meta-placar' desligada: nenhuma descrição com placar (TSE nem motor); religada, volta", async () => {
    const t = Date.UTC(2026, 9, 25, 22, 0, 0);
    const f = fonteFalsa(() => t);
    const motor = vi.fn(() => null);
    let ligado = false;
    const ctx: ContextoMeta = { races, nomeMunicipio: () => 'Campinas', placar: motor, placarMunicipio: motor, fase: () => 'apurando' };
    ligarMetaNoite(ctx, { tse: { fonte: f }, fonteDe: (r) => (races.get(r)?.turno === 2 ? 'tse' : 'motor'), races, now: () => t, ligado: () => ligado });
    expect(ctx.placar!('pres-t1')).toBeNull();
    expect(motor).not.toHaveBeenCalled();
    metaDaRota('/apuracao', new URLSearchParams(), ctx);
    await esperar();
    expect(metaDaRota('/apuracao', new URLSearchParams(), ctx).descricao).not.toMatch(/Lula|%/);
    ligado = true;
    metaDaRota('/apuracao', new URLSearchParams(), ctx);
    await esperar();
    expect(metaDaRota('/apuracao', new URLSearchParams(), ctx).descricao).toMatch(/Lula 48,00%/);
  });
});

describe('app na fonte TSE (fetch falso): placar do arquivo nacional na descrição, sem pedido a mais', () => {
  let m: Montado;
  let f: FakeFetch;
  const ARQ_BR = 'ele2026/6258/dados/br/br-c0001-e006258-u.json';
  beforeAll(async () => {
    f = criarFakeFetch();
    // 2º turno em andamento no arquivo nacional: 30.000 de 48.964 seções, 13 com 51,2 mi e 22 com 48,8 mi de votos
    const br = jsonFixture<Record<string, any>>(ARQ_BR);
    br.s = { ...br.s, st: '30000', pst: '61,27', snt: '18964', psnt: '38,73' };
    br.v = { ...br.v, vvc: '100000000', vv: '100000000', tv: '100000000' };
    for (const c of br.carg[0].agr.flatMap((a: any) => a.par.flatMap((p: any) => p.cand))) c.vap = c.n === '13' ? '51200000' : '48800000';
    f.rotas.set(ARQ_BR, br);
    const dist = mkdtempSync(join(tmpdir(), 'sintonia-meta-placar-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><title>x</title><meta name="description" content="" /><!--app-meta--></head><body></body></html>');
    // 19h43 de Brasília: depois do fim da votação (prorrogada até as 19h; antes disso as descrições não levam nomes)
    m = await montar({ fetch: f, agora: Date.UTC(2026, 9, 25, 22, 43, 0), env: { SERVE_STATIC: '1', DIST_DIR: dist } });
    const cookie = await login(m);
    expect((await comando(m, cookie, { tipo: 'tse', tse: { baseUrl: BASE } })).status).toBe(200);
    expect((await comando(m, cookie, { tipo: 'fonte', fonte: 'tse' })).status).toBe(200);
    m.tse.sincronizar('pre', m.controller.state().tse); // sem polling de verdade
    await m.app.request('/api/apuracao/pres/br'); // lê o arquivo nacional (como faria o laço)
    // a leitura da corrida (todas as UFs) termina em segundo plano: só então a guarda deixa ler o cache
    for (let i = 0; i < 200 && !m.tse.health()?.corridas.find((c) => c.race === 'pres')?.ultimoPoll; i++) await new Promise((r) => setTimeout(r, 10));
  }, 60_000);
  afterAll(async () => {
    await m.tse.encerrar();
  });

  const descricao = async (p: string) => {
    const h = await (await m.app.request(p)).text();
    return /<meta name="description" content="([^"]*)"/.exec(h)?.[1] ?? '';
  };

  it('a 1ª página do minuto pede a cópia; a seguinte já traz o placar; nenhum arquivo do TSE a mais', async () => {
    const antes = f.chamadas.length;
    await descricao('/apuracao');
    await esperar();
    m.relogio.t += 60_000; // outro minuto: outra chave do cache do HTML
    // poll "recente" para a guarda (o laço está parado neste teste): a cópia de 1 min atrás continua valendo
    expect(await descricao('/apuracao')).toMatch(/^Com 61,26% das seções totalizadas: Lula 51,20% · Flávio Bolsonaro 48,80% dos votos válidos\./);
    expect(await descricao('/apuracao/sp/62910')).toMatch(/^Apuração do 2º turno em Campinas \(SP\) ao vivo/); // município fora do cache
    expect(f.chamadas.slice(antes)).toEqual([]);
  }, 30_000);
});
