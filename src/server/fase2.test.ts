/**
 * Fase 2 no servidor: "reveja a noite" (?t=), mapa nacional por município, pessoas agora, patrocínio,
 * fotos oficiais no OG e meta tags das rotas novas. Motor REAL (dataset de public/data).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdminSnapshot } from '../shared/api';
import type { LiveStatus, MunicipiosNacionalSnapshot, MunicipioSnapshot, NationalSnapshot, UfSnapshot } from '../shared/types';
import { pctTotalizadas } from '../shared/calc';
import { CC } from './app';
import { arredondarPessoas } from './metrics';
import { fotosDoPlacar, layoutPlacar } from './og';
import { comando, login, montar, type Montado } from './test-helpers';

/** Retratos JPEG mínimos (30×40), só para teste. */
const JPEG_A =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAoAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDiq2NI8LanrMXnwIkcHOJZWwGI7DAJP1xjg81j17VBDHbQRwRLtjiUIi5zgAYFFeq6aVjSlTU3qeUav4f1DRGBu41MTHCyxnKk4zj1H4gdDWZXrviGGOfw9fpKu5RA7gZxyo3D9QK8iqqNRzjqKrBQegV2GheOVsbKOz1C3eRYV2xyxYzgYABBwOB3z6cd6z/C3/L1/wAA/wDZq362lRjUWp4lfNnhqzpqF7eflfsZHiTxidXtmsrSBorZiC7SYLPjBAx259znA6ciuXrv65jxN/yEY/8AriP5mhUlTjZFYbNHiqvI42+f/ALHhb/l6/4B/wCzVv0UVtHY8PM/97n8vyQVzHib/kIx/wDXEfzNFFE9jTKf95Xoz//Z';
const JPEG_B =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAoAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDiq2NI8LanrMXnwIkcHOJZWwGI7DAJP1xjg81j17VBDHbQRwRLtjiUIi5zgAYFFeq6aVjSlTU3qeUav4f1DRGBu41MTHCyxnKk4zj1H4gdDWZXrviGGOfw9fpKu5RA7gZxyo3D9QK8iqqNRzjqKrBQegV2GheOVsbKOz1C3eRYV2xyxYzgYABBwOB3z6cd6Z4F/wCX7/tn/wCzV1teRjczjSquk4Xt5+XoduHwrlBTUrX8jjfEnjE6vbNZWkDRWzEF2kwWfGCBjtz7nOB05FcvXrVcP42/5DEX/Xuv/oTVWBzFVqnslC3zv+hOJwrhHncr/It+Bf8Al+/7Z/8As1dbRRXi5r/vk/l+SPQwf8CPz/MK4fxt/wAhiL/r3X/0JqKK1yf/AHpejIx38E//2Q==';
/** PNG 1×1 (logo de patrocínio de teste). */
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const SQ = ['280001111111', '280002222222'];

describe('"reveja a noite" (?t=) na simulação', () => {
  let m: Montado;
  let cookie: string;
  let versao: number;
  let agora: NationalSnapshot;
  let t25: number;
  const get = (p: string, h: Record<string, string> = {}) => m.app.request(p, { headers: h });

  beforeAll(async () => {
    m = await montar();
    cookie = await login(m);
    await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' });
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 60 });
    const snap = (await (await comando(m, cookie, { tipo: 'relogio', acao: 'pausar' })).json()) as AdminSnapshot;
    versao = snap.state.versao;
    t25 = Math.ceil(snap.marcos.find((x) => x.pct === 25)!.t / 1000) * 1000; // marcos têm ms; o t é truncado ao segundo
    agora = (await (await get('/api/apuracao/pres/br')).json()) as NationalSnapshot;
  });

  it('instante passado consolidado: números do passado, série/eventos cortados, cache longo com &v=', async () => {
    const t = t25 + 500;
    const r = await get(`/api/apuracao/pres/br?t=${t}&v=${versao}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe(CC.historico);
    const etag = r.headers.get('etag')!;
    expect(etag).toMatch(new RegExp(`^W/"v${versao}-h[a-z0-9]+-[a-z0-9]+"$`));
    const n = (await r.json()) as NationalSnapshot;
    expect(n.simNow).toBe(Math.floor(t / 1000) * 1000);
    expect(pctTotalizadas(n.resumo)).toBeGreaterThanOrEqual(25);
    expect(pctTotalizadas(n.resumo)).toBeLessThan(26);
    expect(n.resumo.secoesTotalizadas).toBeLessThan(agora.resumo.secoesTotalizadas);
    expect(n.serie.every((p) => p.t <= n.simNow)).toBe(true);
    expect(n.eventos.every((e) => e.t <= n.simNow)).toBe(true);
    // sem a versão (ou com versão velha) a CDN guarda pouco; o ETag é o mesmo
    const semV = await get(`/api/apuracao/pres/br?t=${t}`);
    expect(semV.headers.get('cache-control')).toBe(CC.historicoSemVersao);
    expect(semV.headers.get('etag')).toBe(etag);
    expect((await get(`/api/apuracao/pres/br?t=${t}&v=${versao - 1}`)).headers.get('cache-control')).toBe(CC.historicoSemVersao);
    // 304 com o ETag
    const r304 = await get(`/api/apuracao/pres/br?t=${t}&v=${versao}`, { 'if-none-match': etag });
    expect(r304.status).toBe(304);
    expect(r304.headers.get('cache-control')).toBe(CC.historico);
    // o mesmo segundo → mesma resposta (t truncado ao segundo)
    expect((await get(`/api/apuracao/pres/br?t=${Math.floor(t / 1000) * 1000}`)).headers.get('etag')).toBe(etag);
  });

  it('instante futuro é limitado ao agora (mesmo ETag e cache curto); passado recente não vai para cache longo', async () => {
    const r0 = await get('/api/apuracao/pres/br');
    const futuro = await get(`/api/apuracao/pres/br?t=${agora.simNow + 3_600_000}&v=${versao}`);
    expect(futuro.status).toBe(200);
    expect(futuro.headers.get('etag')).toBe(r0.headers.get('etag'));
    expect(futuro.headers.get('cache-control')).toBe(CC.snapshot);
    const nf = (await futuro.json()) as NationalSnapshot;
    expect(nf.simNow).toBe(agora.simNow);
    expect(nf.resumo.secoesTotalizadas).toBe(agora.resumo.secoesTotalizadas);

    const recente = await get(`/api/apuracao/pres/br?t=${agora.simNow - 10_000}&v=${versao}`);
    expect(recente.headers.get('cache-control')).toBe(CC.snapshot);
    expect(recente.headers.get('etag')).toMatch(/-h[a-z0-9]+-/);
  });

  it('antes das 17h: nada totalizado', async () => {
    const n = (await (await get(`/api/apuracao/pres/br?t=${Date.UTC(2026, 9, 25, 19, 30)}`)).json()) as NationalSnapshot;
    expect(n.resumo.secoesTotalizadas).toBe(0);
  });

  it('UF, município, zona e seção também aceitam ?t=', async () => {
    const t = t25 + 500;
    const u = (await (await get(`/api/apuracao/pres/uf/sp?t=${t}`)).json()) as UfSnapshot;
    const uAgora = (await (await get('/api/apuracao/pres/uf/sp')).json()) as UfSnapshot;
    expect(u.simNow).toBe(Math.floor(t / 1000) * 1000);
    expect(u.resumo.secoesTotalizadas).toBeLessThanOrEqual(uAgora.resumo.secoesTotalizadas);
    expect(u.municipios.reduce((a, x) => a + x.secoesTotalizadas, 0)).toBe(u.resumo.secoesTotalizadas);
    const mun = (await (await get(`/api/apuracao/pres/uf/sp/mun/71072?t=${t}`)).json()) as MunicipioSnapshot;
    expect(mun.simNow).toBe(Math.floor(t / 1000) * 1000);
    const z = await get(`/api/apuracao/pres/uf/sp/mun/71072/zona/1?t=${t}`);
    expect(z.status).toBe(200);
    const sec = (await z.json()) as { secoes: { secao: number }[] };
    const s = await get(`/api/apuracao/pres/uf/sp/mun/71072/zona/1/secao/${sec.secoes[0].secao}?t=${t}`);
    expect(s.status).toBe(200);
  });

  it.each(['abc', '-5', '0', '1.5', '1e12', '12345678901234567', '%20', 'undefined'])('?t=%s → 400', async (t) => {
    const r = await get(`/api/apuracao/pres/br?t=${t}`);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/Instante inválido/);
  });

  it('1º turno ignora ?t= (resultado final: mesmo ETag, cache do 1º turno)', async () => {
    const a = await get('/api/apuracao/pres-t1/br');
    const b = await get(`/api/apuracao/pres-t1/br?t=${t25}`);
    expect(b.status).toBe(200);
    expect(b.headers.get('etag')).toBe(a.headers.get('etag'));
    expect(b.headers.get('cache-control')).toBe(CC.t1);
  });

  it('GET /api/apuracao/:race/br/municipios: arrays alinhados, contagem de líderes, ?t= e 404', async () => {
    const r = await get('/api/apuracao/pres/br/municipios');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe(CC.snapshot);
    const b = (await r.json()) as MunicipiosNacionalSnapshot;
    const n = b.lider.length;
    expect(n).toBeGreaterThan(5_000);
    if (m.ds.municipiosBr) expect(n).toBe(m.ds.municipiosBr.ordem.length);
    for (const k of ['margem', 'apurado', 'comparecimento', 'pct0'] as const) expect(b[k]).toHaveLength(n);
    expect(b.lider.every((x) => x >= -1 && x <= 2)).toBe(true);
    expect(b.apurado.every((x) => x >= 0 && x <= 1000)).toBe(true);
    const lideres = [0, 1].map((i) => b.lider.filter((x) => x === i).length);
    expect(b.municipiosLiderados.slice(0, 2)).toEqual(lideres);
    expect(lideres[0] + lideres[1]).toBeGreaterThan(1_000);

    const passado = (await (await get(`/api/apuracao/pres/br/municipios?t=${t25 + 500}`)).json()) as MunicipiosNacionalSnapshot;
    const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);
    expect(soma(passado.apurado)).toBeLessThan(soma(b.apurado));
    expect(passado.simNow).toBe(Math.floor((t25 + 500) / 1000) * 1000);

    // governador: fora da UF da disputa, sem dado
    const gov = (await (await get('/api/apuracao/gov-rj/br/municipios')).json()) as MunicipiosNacionalSnapshot;
    expect(gov.lider).toHaveLength(n);
    if (m.ds.municipiosBr) {
      const ufs = m.ds.municipiosBr.uf;
      expect(gov.lider.every((x, i) => ufs[i] === 'RJ' || x === -1)).toBe(true);
      expect(gov.apurado.every((x, i) => ufs[i] === 'RJ' || x === 0)).toBe(true);
    }
    expect((await get('/api/apuracao/nada/br/municipios')).status).toBe(404);
    expect((await get('/api/apuracao/pres/br/municipios?t=x')).status).toBe(400);
    // 1º turno: tudo apurado
    const t1 = (await (await get('/api/apuracao/pres-t1/br/municipios')).json()) as MunicipiosNacionalSnapshot;
    expect(t1.apurado.filter((x) => x === 1000).length).toBeGreaterThan(5_000);
  });
});

describe('LiveStatus: pessoas agora e patrocínio', () => {
  let m: Montado;
  let cookie: string;
  const status = async () => (await (await m.app.request('/api/status')).json()) as LiveStatus;

  beforeAll(async () => {
    m = await montar();
    cookie = await login(m);
  });

  it('arredondamento: < 10 exato; < 1.000 em dezenas; depois centenas', () => {
    expect([0, 1, 9].map(arredondarPessoas)).toEqual([0, 1, 9]);
    expect([10, 14, 15, 994, 995].map(arredondarPessoas)).toEqual([10, 10, 20, 990, 1000]);
    expect([1234, 1250, 98_765, 1_234_567].map(arredondarPessoas)).toEqual([1200, 1300, 98_800, 1_234_600]);
    expect([-3, Number.NaN].map(arredondarPessoas)).toEqual([0, 0]);
  });

  it('pessoasAgora vem da estimativa de clientes ativos (sem IP guardado), arredondada e com cache de 5 s', async () => {
    const s0 = await status();
    expect(s0.pessoasAgora).toBe(1); // só este "cliente" (sem socket nos testes)
    for (let i = 0; i < 1234; i++) m.metricas.clientes.registrar(`198.51.${i >> 8}.${i & 255}`);
    expect((await status()).pessoasAgora).toBe(1); // cache de 5 s
    m.relogio.t += 5_000;
    const s1 = await status();
    expect(s1.pessoasAgora).toBe(1200);
    // a janela é de ~30 s: sem novos acessos, cai
    m.relogio.t += 40_000;
    expect((await status()).pessoasAgora).toBe(1);
  });

  it('patrocínio válido aparece no status; logo em data URI vira URL servida com cache longo', async () => {
    const r = await comando(m, cookie, {
      tipo: 'patrocinio',
      patrocinio: { marca: 'Café do Bairro', texto: 'Oferece a apuração ao vivo.', url: 'https://exemplo.com.br/cafe', imagem: PNG_1PX },
    });
    expect(r.status).toBe(200);
    const s = await status();
    expect(s.patrocinio).toMatchObject({ marca: 'Café do Bairro', texto: 'Oferece a apuração ao vivo.', url: 'https://exemplo.com.br/cafe' });
    expect(s.patrocinio!.imagem).toMatch(/^http:\/\/localhost\/api\/patrocinio\/logo\?h=[a-z0-9]+$/);
    expect(JSON.stringify(s)).not.toContain('base64');
    const caminho = new URL(s.patrocinio!.imagem!).pathname + new URL(s.patrocinio!.imagem!).search;
    const logo = await m.app.request(caminho);
    expect(logo.status).toBe(200);
    expect(logo.headers.get('content-type')).toBe('image/png');
    expect(logo.headers.get('cache-control')).toBe(CC.imutavel);
    expect(logo.headers.get('content-security-policy')).toContain('sandbox');
    expect(Buffer.from(await logo.arrayBuffer()).equals(Buffer.from(PNG_1PX.split(',')[1], 'base64'))).toBe(true);
    // logo por URL https segue como está
    await comando(m, cookie, {
      tipo: 'patrocinio',
      patrocinio: { marca: 'Café do Bairro', texto: 'Oferece a apuração.', url: 'https://exemplo.com.br', imagem: 'https://cdn.exemplo.com.br/logo.svg' },
    });
    expect((await status()).patrocinio!.imagem).toBe('https://cdn.exemplo.com.br/logo.svg');
    expect((await m.app.request('/api/patrocinio/logo')).status).toBe(404);
    // remover
    expect((await comando(m, cookie, { tipo: 'patrocinio', patrocinio: null })).status).toBe(200);
    expect((await status()).patrocinio).toBeNull();
  });

  it.each([
    ['marca longa', { marca: 'x'.repeat(61), texto: 'ok', url: 'https://a.com.br' }, /marca/],
    ['marca vazia', { marca: '  ', texto: 'ok', url: 'https://a.com.br' }, /marca/],
    ['texto longo', { marca: 'A', texto: 'x'.repeat(141), url: 'https://a.com.br' }, /texto/],
    ['url http', { marca: 'A', texto: 'ok', url: 'http://a.com.br' }, /url/],
    ['url javascript', { marca: 'A', texto: 'ok', url: 'javascript:alert(1)' }, /url/],
    ['url com senha', { marca: 'A', texto: 'ok', url: 'https://u:p@a.com.br' }, /url/],
    ['imagem gif', { marca: 'A', texto: 'ok', url: 'https://a.com.br', imagem: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }, /imagem/],
    ['imagem http', { marca: 'A', texto: 'ok', url: 'https://a.com.br', imagem: 'http://a.com.br/x.png' }, /imagem/],
    ['imagem > 150 KB', { marca: 'A', texto: 'ok', url: 'https://a.com.br', imagem: `data:image/png;base64,${'A'.repeat(210_000)}` }, /imagem/],
    ['campo extra', { marca: 'A', texto: 'ok', url: 'https://a.com.br', partido: 'X' }, /Comando inválido/],
  ])('patrocínio inválido (%s) → 400', async (_n, patrocinio, re) => {
    const r = await comando(m, cookie, { tipo: 'patrocinio', patrocinio });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toMatch(re);
  });
});

describe('OG com fotos oficiais', () => {
  const dirComFotos = mkdtempSync(join(tmpdir(), 'sintonia-fotos-'));
  const dirSemFotos = mkdtempSync(join(tmpdir(), 'sintonia-sem-fotos-'));
  let com: Montado;
  let sem: Montado;

  beforeAll(async () => {
    com = await montar({ env: { DATA_DIR: dirComFotos } });
    sem = await montar({ env: { DATA_DIR: dirSemFotos } });
    // candidatos de 'pres' com sqcand (o meta.json pode ainda não trazer) e o pacote com as fotos deles
    const cands = com.ds.meta.races.find((r) => r.id === 'pres')!.candidatos;
    cands.forEach((c, i) => (c.sqcand ??= SQ[i]));
    for (const c of cands) expect(c.fotoGrupo ?? 'segundo-turno').toBe('segundo-turno');
    mkdirSync(join(dirComFotos, 'fotos'), { recursive: true });
    const pacote = { grupo: 'segundo-turno', fotos: { [cands[0].sqcand!]: JPEG_A, [cands[1].sqcand!]: JPEG_B } };
    writeFileSync(join(dirComFotos, 'fotos', 'segundo-turno.json'), JSON.stringify(pacote));
  });

  it('layout: retrato só com foto de todos os finalistas; nunca WebP', () => {
    const race = com.ds.meta.races.find((r) => r.id === 'pres')!;
    const resumo = com.controller.nacional('pres').resumo;
    const base = { race, resumo, simulacao: false, horario: 0, pre: true };
    expect(JSON.stringify(layoutPlacar({ ...base, fotos: [JPEG_A, JPEG_B] }))).toContain(JPEG_A.slice(0, 60));
    expect(fotosDoPlacar({ race, fotos: [JPEG_A, null] })).toBeNull();
    expect(fotosDoPlacar({ race, fotos: [JPEG_A, 'data:image/webp;base64,UklGRg=='] })).toBeNull();
    expect(JSON.stringify(layoutPlacar({ ...base, fotos: [JPEG_A, null] }))).not.toContain('data:image/jpeg');
  });

  it('com pacote e sem anonimização → fotos; sem pacote → monograma', async () => {
    const a = await com.app.request('/api/og/apuracao.png?race=pres');
    expect(a.status).toBe(200);
    expect(a.headers.get('x-og-fotos')).toBe('1');
    const b = await sem.app.request('/api/og/apuracao.png?race=pres');
    expect(b.status).toBe(200);
    expect(b.headers.get('x-og-fotos')).toBe('0');
    expect(Buffer.from(await a.arrayBuffer()).equals(Buffer.from(await b.arrayBuffer()))).toBe(false);
  }, 30_000);

  it('simulação anonimizada → nunca foto, mesmo com o pacote', async () => {
    const cookie = await login(com);
    await comando(com, cookie, { tipo: 'relogio', acao: 'iniciar' });
    await comando(com, cookie, { tipo: 'saltar-pct', pct: 30 });
    const st = (await (await com.app.request('/api/status')).json()) as LiveStatus;
    expect(st.anonimizado).toBe(true);
    const r = await com.app.request('/api/og/apuracao.png?race=pres');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-og-fotos')).toBe('0');
    // nomes reais ligados na simulação: ainda sem foto — foto oficial nunca acompanha número fictício (fase 3)
    await comando(com, cookie, { tipo: 'nomes-reais', ativo: true });
    const r2 = await com.app.request('/api/og/apuracao.png?race=pres');
    expect(r2.status).toBe(200);
    expect(r2.headers.get('x-og-fotos')).toBe('0');
    // …mas o 1º turno (número real) continua com as fotos, mesmo durante a simulação
    const t1 = await com.app.request('/api/og/apuracao.png?race=pres-t1');
    expect(t1.headers.get('x-og-fotos')).toBe('1');
    await comando(com, cookie, { tipo: 'nomes-reais', ativo: false });
    const r3 = await com.app.request('/api/og/apuracao.png?race=pres');
    expect(r3.headers.get('x-og-fotos')).toBe('0');
  }, 30_000);
});
