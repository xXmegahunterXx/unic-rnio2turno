/**
 * OG images: PNG válido 1200×630, marca "SIMULAÇÃO" quando simulado, cache de 30 s e validação.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { C, layoutPlacar } from './og';
import { anonimizarRace } from '../shared/anon';
import { comando, login, montar, type Montado } from './test-helpers';

function dimensoesPng(buf: Buffer) {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // assinatura PNG
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

let m: Montado;
beforeAll(async () => {
  m = await montar();
});

describe('GET /api/og/apuracao.png', () => {
  it('PNG 1200×630 com cache de 30 s', async () => {
    const r = await m.app.request('/api/og/apuracao.png?race=pres');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('cache-control')).toBe('public, max-age=30, s-maxage=30, stale-while-revalidate=60');
    const buf = Buffer.from(await r.arrayBuffer());
    expect(dimensoesPng(buf)).toEqual({ w: 1200, h: 630 });
    expect(buf.length).toBeGreaterThan(20_000);
    expect(buf.length).toBeLessThan(400_000);
    // mesma imagem dentro de 30 s (servida do cache), 304 com o ETag
    const etag = r.headers.get('etag')!;
    expect((await m.app.request('/api/og/apuracao.png?race=pres', { headers: { 'if-none-match': etag } })).status).toBe(304);
  }, 30_000);

  it('governador por UF, 1º turno e erros de parâmetro', async () => {
    const gov = await m.app.request('/api/og/apuracao.png?race=gov-rj');
    expect(gov.status).toBe(200);
    expect(dimensoesPng(Buffer.from(await gov.arrayBuffer()))).toEqual({ w: 1200, h: 630 });
    const uf = await m.app.request('/api/og/apuracao.png?race=pres-t1&uf=ba');
    expect(uf.status).toBe(200);
    expect((await m.app.request('/api/og/apuracao.png?race=nada')).status).toBe(404);
    expect((await m.app.request('/api/og/apuracao.png?race=gov-rj&uf=sp')).status).toBe(404);
    expect((await m.app.request('/api/og/apuracao.png?race=pres&uf=xyz')).status).toBe(400);
  }, 30_000);

  it('simulação: nova imagem após o comando (versão nova) e marca SIMULAÇÃO no layout', async () => {
    const antes = await m.app.request('/api/og/apuracao.png?race=pres');
    const cookie = await login(m);
    await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' });
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 40 });
    const depois = await m.app.request('/api/og/apuracao.png?race=pres');
    expect(depois.status).toBe(200);
    expect(depois.headers.get('etag')).not.toBe(antes.headers.get('etag'));
    expect(Buffer.from(await depois.arrayBuffer()).equals(Buffer.from(await antes.arrayBuffer()))).toBe(false);

    const race = m.ds.meta.races.find((r) => r.id === 'pres')!;
    const n = m.controller.nacional('pres');
    const sim = JSON.stringify(layoutPlacar({ race, resumo: n.resumo, simulacao: true, horario: n.simNow, pre: false }));
    expect(sim).toContain('SIMULAÇÃO');
    expect(sim).toContain('das seções totalizadas');
    const real = JSON.stringify(layoutPlacar({ race, resumo: n.resumo, simulacao: false, horario: n.simNow, pre: false }));
    expect(real).not.toContain('SIMULAÇÃO');
    // nomes reais: cores de identificação (Lula vermelho, Flávio Bolsonaro azul — CORES_IDENTIDADE), vindas dos dados
    expect(sim).toContain(C.vermelho);
    expect(sim).toContain(C.azul);
    expect(sim).not.toContain(C.a);
    expect(sim).not.toContain(C.b);
    // nomes ocultos: cores NEUTRAS (turquesa = menor número; âmbar), nunca vermelho/azul
    const anon = JSON.stringify(layoutPlacar({ race: anonimizarRace(race), resumo: n.resumo, simulacao: true, horario: n.simNow, pre: false }));
    expect(anon).toContain('Candidato A');
    expect(anon).toContain(C.a);
    expect(anon).toContain(C.b);
    expect(anon).not.toContain(C.vermelho);
    expect(anon).not.toContain(C.azul);
  }, 30_000);
});

describe('regras do placar e proteção da origem', () => {
  it('"ELEITO" só no 2º turno e na abrangência da disputa (nunca no recorte de UF nem no 1º turno)', () => {
    const pres = m.ds.meta.races.find((r) => r.id === 'pres')!;
    const t1 = m.ds.meta.races.find((r) => r.id === 'pres-t1')!;
    const gov = m.ds.meta.races.find((r) => r.id === 'gov-rj')!;
    const base = m.controller.nacional('pres').resumo;
    const resumo = { ...base, votos: [100, 200], status: 'encerrada' as const, eleito: 1, secoesTotalizadas: base.secoes };
    const txt = (o: Partial<Parameters<typeof layoutPlacar>[0]>) =>
      JSON.stringify(layoutPlacar({ race: pres, resumo, simulacao: false, horario: 0, pre: false, ...o }));
    expect(txt({})).toContain('ELEITO');
    expect(txt({ uf: 'AC' })).not.toContain('ELEITO');
    expect(txt({ race: gov, uf: 'RJ' })).toContain('ELEITO');
    expect(txt({ race: t1, resumo: { ...resumo, votos: [100, 200, 50] } })).not.toContain('ELEITO');
    expect(txt({ resumo: { ...resumo, status: 'apurando' } })).toContain('MATEMATICAMENTE ELEITO');
  });

  it('imagem vencida da mesma fonte é servida na hora e renovada em segundo plano', async () => {
    const url = '/api/og/apuracao.png?race=gov-es';
    const a = await m.app.request(url);
    const e1 = a.headers.get('etag');
    m.relogio.t += 31_000; // venceu
    const b = await m.app.request(url);
    expect(b.status).toBe(200);
    expect(b.headers.get('etag')).toBe(e1); // a antiga, sem esperar
    let e2 = e1;
    for (let i = 0; i < 100 && e2 === e1; i++) {
      await new Promise((r) => setTimeout(r, 50));
      e2 = (await m.app.request(url)).headers.get('etag');
    }
    expect(e2).not.toBe(e1); // a nova chegou
  }, 30_000);

  it('fila limitada: rajada de imagens distintas → parte recebe 503 com Retry-After, nada quebra', async () => {
    const ufs = m.ds.meta.races.find((r) => r.id === 'pres-t1')!.ufs.slice(0, 24);
    const rs = await Promise.all(ufs.map((uf) => m.app.request(`/api/og/apuracao.png?race=pres-t1&uf=${uf.toLowerCase()}`)));
    const st = rs.map((r) => r.status);
    expect(st.every((x) => x === 200 || x === 503)).toBe(true);
    expect(st.filter((x) => x === 200).length).toBeGreaterThanOrEqual(16);
    const r503 = rs.find((r) => r.status === 503);
    expect(r503?.headers.get('retry-after')).toBe('10');
  }, 60_000);
});

describe('GET /api/og/teste.png', () => {
  it('cartão do Teste Cego (sem dados de preferência)', async () => {
    const r = await m.app.request('/api/og/teste.png');
    expect(r.status).toBe(200);
    expect(dimensoesPng(Buffer.from(await r.arrayBuffer()))).toEqual({ w: 1200, h: 630 });
    expect(r.headers.get('cache-control')).toContain('max-age=86400');
  }, 30_000);
});
