/**
 * Rotas das imagens OG por página (integração, motor e dataset REAIS): PNG 1200×630, tamanho razoável, cache
 * (estática × ao vivo), ETag/304, validação de parâmetros, cenário com código gigante, fotos oficiais (inclusive as
 * convertidas de WebP), marca de simulação e anonimização.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CuriosidadesDataset } from '../shared/curiosidades';
import type { PresidenteT1Dataset } from '../shared/cenarios';
import { MARCA_CENARIO, calcularCenario, cenarioDoPreset, codificarCenario, premissasCenario } from '../shared/cenarios';
import { anonimizarRace } from '../shared/anon';
import { CC } from './app';
import { comPrimeiroTurnoLocal } from './og-rotas';
import { layoutCenario, layoutComposicao, layoutCuriosidade, layoutGovernadores, layoutSecao } from './og-cartoes';
import { svgHemiciclo } from './og-hemiciclo';
import { RAIZ, comando, login, montar, type Montado } from './test-helpers';

const json = <T>(p: string) => JSON.parse(readFileSync(join(RAIZ, 'public/data', p), 'utf8')) as T;

function dimensoesPng(buf: Buffer) {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

let m: Montado;
beforeAll(async () => {
  m = await montar();
});

async function png(url: string, status = 200) {
  const r = await m.app.request(url);
  expect(r.status, url).toBe(status);
  if (status !== 200) return { r, buf: Buffer.alloc(0) };
  expect(r.headers.get('content-type')).toBe('image/png');
  expect(r.headers.get('access-control-allow-origin')).toBe('*');
  const buf = Buffer.from(await r.arrayBuffer());
  expect(dimensoesPng(buf)).toEqual({ w: 1200, h: 630 });
  // WhatsApp/X: bem abaixo dos limites (≤ 400 KB)
  expect(buf.length).toBeGreaterThan(30_000);
  expect(buf.length).toBeLessThan(400_000);
  return { r, buf };
}

describe('imagens de dado oficial (cache longo, versão dos dados)', () => {
  it.each([
    '/api/og/candidato.png?sq=280002542548',
    '/api/og/candidato.png?sq=10002548050',
    '/api/og/senado.png',
    '/api/og/senado.png?uf=sp',
    '/api/og/camara.png',
    '/api/og/camara.png?uf=am',
    '/api/og/assembleia.png',
    '/api/og/assembleia.png?uf=df',
    '/api/og/curiosidade.png',
    '/api/og/curiosidade.png?f=finalistas-menor-diferenca',
    '/api/og/curiosidade.png?fato=brasil-eleitorado',
    '/api/og/cenario.png',
  ])('%s', async (url) => {
    const { r } = await png(url);
    expect(r.headers.get('cache-control')).toBe(CC.ogEstatica);
    // segunda vez: mesma imagem do cache (mesmo ETag) e 304 com If-None-Match
    const etag = r.headers.get('etag')!;
    expect((await m.app.request(url)).headers.get('etag')).toBe(etag);
    expect((await m.app.request(url, { headers: { 'if-none-match': etag } })).status).toBe(304);
  }, 30_000);

  it('ficha: foto oficial (JPEG do 2º turno e WebP convertida do Senado)', async () => {
    expect((await png('/api/og/candidato.png?sq=280002542548')).r.headers.get('x-og-fotos')).toBe('1');
    expect((await png('/api/og/candidato.png?sq=10002548050')).r.headers.get('x-og-fotos')).toBe('1');
    expect((await png('/api/og/senado.png?uf=sp')).r.headers.get('x-og-fotos')).toBe('1');
  }, 30_000);

  it('cenário: código válido → cartão do cenário; equivalentes compartilham a imagem; inválido/gigante → genérico', async () => {
    const ds = json<PresidenteT1Dataset>('presidente-t1.json');
    const cod = codificarCenario(cenarioDoPreset('metade', ds));
    const a = await png(`/api/og/cenario.png?c=${cod}`);
    const generico = await png('/api/og/cenario.png');
    expect(a.buf.equals(generico.buf)).toBe(false);
    expect((await png(`/api/og/cenario.png?c=${cod}==`)).r.headers.get('etag')).toBe(a.r.headers.get('etag'));
    for (const ruim of ['!!!', 'AAAA', 'Z'.repeat(5_000)]) {
      const g = await png(`/api/og/cenario.png?c=${encodeURIComponent(ruim)}`);
      expect(g.buf.equals(generico.buf)).toBe(true);
    }
  }, 30_000);
});

describe('imagens da apuração (seguem a página: 1º turno antes das 17h, 2º turno ao vivo depois)', () => {
  it('antes da apuração: município e seção mostram o 1º turno oficial (cache longo), com fotos', async () => {
    const mun = await png('/api/og/municipio.png?race=pres&uf=sp&cod=71072');
    expect(mun.r.headers.get('cache-control')).toBe(CC.ogEstatica);
    expect(mun.r.headers.get('x-og-fotos')).toBe('1');
    const sec = await png('/api/og/secao.png?race=pres&uf=sp&cod=71072&zona=1&secao=15');
    expect(sec.r.headers.get('cache-control')).toBe(CC.ogEstatica);
    await png('/api/og/governadores.png');
  }, 30_000);

  it('parâmetros: 400 malformado, 404 inexistente', async () => {
    await png('/api/og/municipio.png?race=pres&uf=sp', 400);
    await png('/api/og/municipio.png?race=pres&uf=sp&cod=abc', 400);
    await png('/api/og/municipio.png?race=pres&uf=sp&cod=99999', 404);
    await png('/api/og/municipio.png?race=gov-rj&uf=sp&cod=71072', 404);
    await png('/api/og/secao.png?race=pres&uf=sp&cod=71072&zona=1&secao=99999', 400);
    await png('/api/og/secao.png?race=pres&uf=sp&cod=71072&zona=1&secao=9999', 404);
    await png('/api/og/candidato.png?sq=12', 400);
    await png('/api/og/candidato.png?sq=123456789', 404);
    await png('/api/og/senado.png?uf=zz', 400);
    await png('/api/og/camara.png?uf=xx', 400);
    await png('/api/og/curiosidade.png?f=<script>', 400);
  }, 30_000);

  it('simulação: imagem ao vivo (cache curto), sem foto, nomes ocultos; troca para o 2º turno', async () => {
    const antes = await png('/api/og/municipio.png?race=pres&uf=sp&cod=71072');
    const cookie = await login(m);
    await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' });
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 55 });
    await comando(m, cookie, { tipo: 'relogio', acao: 'pausar' });
    const st = m.dados.status();
    expect(st.simulacao && st.anonimizado).toBe(true);
    const depois = await png('/api/og/municipio.png?race=pres&uf=sp&cod=71072');
    expect(depois.r.headers.get('cache-control')).toBe(CC.og);
    expect(depois.r.headers.get('x-og-fotos')).toBe('0');
    expect(depois.buf.equals(antes.buf)).toBe(false);
    const sec = await png('/api/og/secao.png?race=pres&uf=sp&cod=71072&zona=1&secao=15');
    expect(sec.r.headers.get('cache-control')).toBe(CC.og);
    const gov = await png('/api/og/governadores.png');
    expect(gov.r.headers.get('cache-control')).toBe(CC.og);
    // link explícito para o 1º turno continua oficial (cache longo)
    expect((await png('/api/og/municipio.png?race=pres-t1&uf=sp&cod=71072')).r.headers.get('cache-control')).toBe(CC.ogEstatica);
    // nomes reais ligados no admin: ainda sem foto (número simulado)
    await comando(m, cookie, { tipo: 'nomes-reais', ativo: true });
    expect((await png('/api/og/municipio.png?race=pres&uf=sp&cod=71072')).r.headers.get('x-og-fotos')).toBe('0');
    await comando(m, cookie, { tipo: 'nomes-reais', ativo: false });
  }, 60_000);
});

describe('layouts: neutralidade e marcas obrigatórias', () => {
  it('boletim simulado: selo SIMULAÇÃO, nomes anônimos nos dois turnos, nunca foto', async () => {
    const pres = m.ds.meta.races.find((r) => r.id === 'pres')!;
    const t1 = m.ds.meta.races.find((r) => r.id === 'pres-t1')!;
    const sec = { secao: 15, totalizada: true, totalizadaEm: 0, aptos: 300, comparecimento: 250, votos: [120, 110], brancos: 10, nulos: 10 };
    const txt = JSON.stringify(
      layoutSecao({
        uf: 'SP',
        nomeMunicipio: 'São Paulo',
        zona: 1,
        secao: 15,
        t2: { race: anonimizarRace(pres), detalhe: sec },
        t1: { race: anonimizarRace(t1), detalhe: { ...sec, votos: [100, 90, 40] } },
        simulacao: true,
      }),
    );
    expect(txt).toContain('SIMULAÇÃO');
    expect(txt).toContain('Candidato A');
    expect(txt).not.toContain('Lula');
    expect(txt).not.toContain('data:image/jpeg');
    expect(txt).not.toContain('data:image/png');
  });

  it('cenário: marca d\'água "CENÁRIO HIPOTÉTICO" e faixa "não é pesquisa nem previsão"', () => {
    const ds = json<PresidenteT1Dataset>('presidente-t1.json');
    const c = cenarioDoPreset('proporcional', ds);
    const r = calcularCenario(ds, c);
    const txt = JSON.stringify(layoutCenario({ ds, cenario: c, resultado: r, premissas: premissasCenario(ds, c, r) }));
    expect(txt).toContain('CENÁRIO HIPOTÉTICO');
    expect(txt).toContain(MARCA_CENARIO.toUpperCase());
    expect(txt).toContain('rgb(25,194,176)'); // A turquesa
    expect(txt).toContain('rgb(245,165,36)'); // B âmbar
    expect(txt).not.toContain('data:image/jpeg'); // sem foto: números hipotéticos
  });

  it('composição: cores neutras de partido (nunca as dos slots A/B), maior bancada primeiro', () => {
    const camara = json<{ composicao: { sigla: string; eleitos: number }[] }>('cargos/camara.json');
    const txt = JSON.stringify(layoutComposicao({ kicker: 'K', titulo: 'T', bancadas: camara.composicao, pendentes: 8, rotuloTotal: 'cadeiras' }));
    expect(txt).not.toContain('rgb(25,194,176)');
    expect(txt).not.toContain('rgb(245,165,36)');
    const hem = svgHemiciclo(camara.composicao, 8, 560);
    expect(hem.total).toBe(513);
    const svg = Buffer.from(hem.uri.split(',')[1], 'base64').toString();
    expect(svg.match(/<circle/g)).toHaveLength(513);
    expect(svg).not.toMatch(/rgb\(25,194,176\)|rgb\(245,165,36\)/);
  });

  it('curiosidade com par: os dois finalistas com o mesmo peso (A turquesa antes de B âmbar)', () => {
    const cur = json<CuriosidadesDataset>('curiosidades.json');
    const fato = cur.fatos.find((f) => f.par)!;
    const txt = JSON.stringify(layoutCuriosidade({ fato, finalistas: cur.finalistas }));
    expect(txt.indexOf(cur.finalistas.a.nomeUrna)).toBeLessThan(txt.indexOf(cur.finalistas.b.nomeUrna));
    expect(txt).toContain('DADOS OFICIAIS · TSE');
  });

  it('governadores: SIMULAÇÃO só quando simulado', () => {
    const disputas = m.ds.meta.races
      .filter((r) => r.turno === 2 && r.cargo === 'Governador')
      .map((r) => ({ uf: r.abrangencia as 'RJ', race: anonimizarRace(r), resumo: m.controller.nacional(r.id).resumo }));
    expect(disputas).toHaveLength(7);
    expect(JSON.stringify(layoutGovernadores({ disputas, primeiroTurno: false, simulacao: true, aoVivo: true, anonimizado: true }))).toContain('SIMULAÇÃO');
    expect(JSON.stringify(layoutGovernadores({ disputas, primeiroTurno: true, simulacao: false, aoVivo: false }))).not.toContain('SIMULAÇÃO');
  });
});

describe('cartão de UF antes da apuração (revisão de QA)', () => {
  it('usa o 1º turno DA UF, não o nacional, no "NO 1º TURNO" de cada finalista', () => {
    const meta = json<{ races: import('../shared/types').Race[] }>('meta.json');
    const pres = meta.races.find((r) => r.id === 'pres')!;
    const t1 = meta.races.find((r) => r.id === 'pres-t1')!;
    const ds = json<PresidenteT1Dataset>('presidente-t1.json');
    const sp = ds.ufs.find((u) => u.uf === 'SP')!;
    const porNumero = (n: number) => sp.votos[ds.candidatos.findIndex((c) => c.numero === n)];
    // resumo do 1º turno em SP na ordem de pres-t1 (finalistas + Outros)
    const votos = t1.candidatos.map((c) => (c.agregado ? sp.votos.reduce((a, b) => a + b, 0) - porNumero(13) - porNumero(22) : porNumero(c.numero)));
    const r = comPrimeiroTurnoLocal(pres, t1, { votos });
    const lula = r.candidatos.find((c) => c.numero === 13)!;
    const flavio = r.candidatos.find((c) => c.numero === 22)!;
    expect(lula.primeiroTurno?.votos).toBe(9505413);
    expect(flavio.primeiroTurno?.votos).toBe(12922023);
    expect(lula.primeiroTurno!.pct).toBeCloseTo(38.2, 1);
    expect(flavio.primeiroTurno!.pct).toBeCloseTo(51.93, 1);
    // e não é o nacional
    expect(lula.primeiroTurno?.votos).not.toBe(pres.candidatos.find((c) => c.numero === 13)!.primeiroTurno?.votos);
    // sem dado local: sem número (nunca o nacional)
    expect(comPrimeiroTurnoLocal(pres, undefined, null).candidatos.every((c) => c.primeiroTurno === undefined)).toBe(true);
  });
});
