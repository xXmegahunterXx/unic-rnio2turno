/**
 * Cartões do placar com retratos grandes (og-placar.ts): os quatro formatos servidos em /api/og/apuracao.png e
 * /api/og/municipio.png, as regras de foto (originais do TSE só com número real e nome real; monograma no mesmo quadro na
 * simulação), as cores que vêm dos dados, o "Oferecimento" abaixo da marca do Sintonia e o 2º turno pela fonte TSE (feed
 * FORJADO só aqui, com o fetch falso de src/tse/__fixtures__).
 *
 * Com OG_PREVIA_DIR=<pasta>, grava os PNGs servidos para conferência visual.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnuncioConfig } from '../shared/anuncios';
import { anonimizarRace } from '../shared/anon';
import type { Race, Summary } from '../shared/types';
import { criarFakeFetch, jsonFixture, BASE, type FakeFetch } from '../tse/__fixtures__/fake-fetch';
import type { TseResultadoArquivo } from '../tse/feed';
import { C, type No } from './og';
import { DIM_OG, FORMATOS_OG, comporSobreFundo, layoutPlacar, quedaBrilho, type FormatoOg } from './og-placar';
import { OFERECIMENTO_NO_PLACAR } from './og-oferecimento';
import { comando, login, montar, type Montado } from './test-helpers';

const SAIDA = process.env.OG_PREVIA_DIR;
if (SAIDA) mkdirSync(SAIDA, { recursive: true });

function dimensoesPng(buf: Buffer) {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Todos os textos de uma árvore satori, na ordem do desenho. */
function textos(no: unknown): string[] {
  if (typeof no === 'string') return [no];
  if (!no || typeof no !== 'object') return [];
  const ch = (no as No).props?.children;
  return (Array.isArray(ch) ? ch : [ch]).flatMap(textos);
}

/** As fontes (src) de todas as imagens da árvore. */
function imagens(no: unknown): string[] {
  if (!no || typeof no !== 'object') return [];
  const n = no as No;
  const proprias = n.type === 'img' ? [String(n.props.src)] : [];
  const ch = n.props?.children;
  return [...proprias, ...(Array.isArray(ch) ? ch : [ch]).flatMap(imagens)];
}

const JPEG_A = 'data:image/jpeg;base64,/9j/AAAA';
const JPEG_B = 'data:image/jpeg;base64,/9j/BBBB';

const resumoDe = (votos: number[], extra: Partial<Summary> = {}): Summary => ({
  secoes: 1000,
  secoesTotalizadas: 632,
  eleitorado: 1,
  eleitoradoTotalizado: 1,
  comparecimento: 1,
  abstencao: 0,
  votos,
  brancos: 0,
  nulos: 0,
  status: 'apurando',
  lider: 0,
  eleito: null,
  ultimaAtualizacao: Date.UTC(2026, 9, 25, 21, 42, 13),
  ...extra,
});

let m: Montado;
let pres: Race;
let presT1: Race;
let gov: Race;
beforeAll(async () => {
  m = await montar();
  pres = m.ds.meta.races.find((r) => r.id === 'pres')!;
  presT1 = m.ds.meta.races.find((r) => r.id === 'pres-t1')!;
  gov = m.ds.meta.races.find((r) => r.id === 'gov-am')!;
});

describe('layout', () => {
  it('fotos só quando passadas para os dois; sem elas, monograma no mesmo quadro', () => {
    const base = { race: pres, resumo: resumoDe([500, 400]), simulacao: false, horario: 0, pre: false };
    for (const formato of FORMATOS_OG) {
      const com = imagens(layoutPlacar({ ...base, formato, fotos: [JPEG_A, JPEG_B] }));
      expect(com).toContain(JPEG_A);
      expect(com).toContain(JPEG_B);
      // tudo ou nada: com a foto de um só, nenhum rosto
      const meia = layoutPlacar({ ...base, formato, fotos: [JPEG_A, null] });
      expect(imagens(meia).some((s) => s.startsWith('data:image/jpeg'))).toBe(false);
      expect(textos(meia)).toEqual(expect.arrayContaining(['L', 'FB'])); // monogramas
    }
  });

  it('cores dos dados (vermelho/azul com nomes reais; turquesa/âmbar com nomes ocultos), nunca da posição', () => {
    const real = JSON.stringify(layoutPlacar({ race: pres, resumo: resumoDe([500, 400]), simulacao: false, horario: 0, pre: false }));
    expect(real).toContain(C.vermelho);
    expect(real).toContain(C.azul);
    expect(real).not.toContain(C.a);
    const anon = JSON.stringify(layoutPlacar({ race: anonimizarRace(pres), resumo: resumoDe([500, 400]), simulacao: true, horario: 0, pre: false }));
    expect(anon).toContain('Candidato A');
    expect(anon).toContain(C.a);
    expect(anon).toContain(C.b);
    expect(anon).not.toContain(C.vermelho);
    expect(anon).not.toContain(C.azul);
    const g = JSON.stringify(layoutPlacar({ race: gov, uf: 'AM', resumo: resumoDe([500, 400]), simulacao: false, horario: 0, pre: false }));
    expect(g).toContain(C.a);
    expect(g).not.toContain(C.vermelho);
  });

  it('simulação: selo, marca-d\'água e nunca "Fonte: TSE"; real: fonte e horário de Brasília', () => {
    for (const formato of FORMATOS_OG) {
      const sim = textos(layoutPlacar({ race: anonimizarRace(pres), resumo: resumoDe([500, 400]), simulacao: true, horario: 0, pre: false, formato }));
      expect(sim).toContain('SIMULAÇÃO · DADOS FICTÍCIOS');
      expect(sim).toContain('SIMULAÇÃO');
      expect(sim.join(' ')).not.toContain('Fonte: TSE');
      const real = textos(layoutPlacar({ race: pres, resumo: resumoDe([500, 400]), simulacao: false, horario: Date.UTC(2026, 9, 25, 21, 42, 13), pre: false, formato }));
      expect(real.join(' ')).toContain('Atualizado às 18:42:13 (Brasília) · Fonte: TSE');
      expect(real).toContain('63,20% das seções totalizadas');
      expect(real.join(' ')).not.toContain('SIMULAÇÃO');
    }
  });

  it('1º turno oficial: % dos válidos de calc.ts, "Demais candidatos" e nunca "eleito"', () => {
    const votos = presT1.candidatos.map((c) => c.primeiroTurno!.votos);
    const t = textos(layoutPlacar({ race: presT1, resumo: resumoDe(votos, { secoesTotalizadas: 1000, status: 'encerrada', eleito: 1 }), simulacao: false, horario: 0, pre: false }));
    expect(t).toEqual(expect.arrayContaining(['45,16', '47,03', '53.879.538', '56.104.503', 'RESULTADO OFICIAL · TSE']));
    expect(t.join(' ')).toContain('Demais candidatos: 7,81%');
    expect(t.join(' ')).not.toMatch(/ELEITO/);
  });

  it('"ELEITO" só no 2º turno, na abrangência da disputa e depois de começar', () => {
    const r = resumoDe([600, 400], { secoesTotalizadas: 1000, status: 'encerrada', eleito: 0 });
    const txt = (o: Partial<Parameters<typeof layoutPlacar>[0]>) => textos(layoutPlacar({ race: pres, resumo: r, simulacao: false, horario: 0, pre: false, ...o })).join(' ');
    expect(txt({})).toContain('ELEITO');
    expect(txt({ resumo: { ...r, status: 'apurando' } })).toContain('MATEMATICAMENTE ELEITO');
    expect(txt({ uf: 'SP' })).not.toContain('ELEITO');
    expect(txt({ local: true })).not.toContain('ELEITO');
  });

  it('antes das 17h: percentuais do 1º turno rotulados, sem barra de progresso', () => {
    const t = textos(layoutPlacar({ race: pres, resumo: resumoDe([0, 0], { secoesTotalizadas: 0, status: 'aguardando' }), simulacao: false, horario: 0, pre: true }));
    expect(t.filter((x) => x === 'NO 1º TURNO')).toHaveLength(2);
    expect(t).toEqual(expect.arrayContaining(['45,16', '47,03', '25/10 · A PARTIR DAS 17H', 'Apuração a partir das 17h de 25/10']));
  });

  it('marca do site sempre; "Oferecimento" só com anunciante, rotulado e DEPOIS do rodapé do Sintonia', () => {
    for (const formato of FORMATOS_OG) {
      const sem = textos(layoutPlacar({ race: pres, resumo: resumoDe([500, 400]), simulacao: false, horario: 0, pre: false, formato }));
      expect(sem).toContain('sintonia2026.com.br');
      expect(sem).not.toContain('Oferecimento:');
      const com = textos(layoutPlacar({ race: pres, resumo: resumoDe([500, 400]), simulacao: false, horario: 0, pre: false, formato, oferecimento: 'X'.repeat(80), dominio: 'exemplo.com.br' }));
      expect(com).toContain('exemplo.com.br');
      expect(com.indexOf('Oferecimento:')).toBeGreaterThan(com.indexOf('exemplo.com.br'));
      expect(com).toContain('X'.repeat(40)); // marca cortada em 40, como no cadastro
      expect(com).not.toContain('X'.repeat(41));
    }
  });

  it('fundo: brilho na cor de cada lado, só onde o desenho é transparente', () => {
    expect(quedaBrilho(0, 0.3)).toBeCloseTo(0.3);
    expect(quedaBrilho(1, 0.3)).toBe(0);
    const w = 40;
    const h = 20;
    const px = new Uint8Array(w * h * 4);
    px.set([10, 20, 30, 255], (5 * w + 20) * 4); // um pixel opaco do desenho no meio
    comporSobreFundo(px, w, h, C.vermelho, C.azul);
    const em = (x: number, y: number) => Array.from(px.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));
    expect(em(20, 5)).toEqual([10, 20, 30, 255]); // desenho intacto
    expect(em(0, 0)[0]).toBeGreaterThan(em(0, 0)[2]); // canto esquerdo puxa para o vermelho
    expect(em(w - 1, 0)[2]).toBeGreaterThan(em(w - 1, 0)[0]); // canto direito puxa para o azul
    expect(em(0, 0)[3]).toBe(255);
  });
});

describe('rotas (motor)', () => {
  it('os quatro formatos com as dimensões certas e cache separado; formato inválido → 400', async () => {
    const etags = new Set<string>();
    for (const formato of FORMATOS_OG) {
      const r = await m.app.request(`/api/og/apuracao.png?race=pres-t1${formato === 'og' ? '' : `&formato=${formato}`}`);
      expect(r.status).toBe(200);
      // 1º turno oficial, nomes reais: os retratos oficiais (pacote presidente-hd)
      expect(r.headers.get('x-og-fotos')).toBe('1');
      const buf = Buffer.from(await r.arrayBuffer());
      expect(dimensoesPng(buf)).toEqual(DIM_OG[formato]);
      // prévia de link abaixo de ~300 KB (o WhatsApp ignora prévia pesada)
      if (formato === 'og') expect(buf.length).toBeLessThan(300_000);
      etags.add(r.headers.get('etag')!);
      if (SAIDA) writeFileSync(join(SAIDA, `motor-pres-t1-${formato}.png`), buf);
    }
    expect(etags.size).toBe(4);
    expect((await m.app.request('/api/og/apuracao.png?race=pres&formato=quadrado')).status).toBe(400);
    const mun = await m.app.request('/api/og/municipio.png?race=pres-t1&uf=sp&cod=71072&formato=feed');
    expect(mun.status).toBe(200);
    expect(dimensoesPng(Buffer.from(await mun.arrayBuffer()))).toEqual(DIM_OG.feed);
  }, 60_000);

  it('simulação (mesmo com os nomes reais ligados): nunca foto ao lado de número simulado, em nenhum formato', async () => {
    const s = await montar();
    const cookie = await login(s);
    await comando(s, cookie, { tipo: 'fonte', fonte: 'simulacao' });
    await comando(s, cookie, { tipo: 'nomes-reais', ativo: true });
    await comando(s, cookie, { tipo: 'relogio', acao: 'iniciar' });
    await comando(s, cookie, { tipo: 'saltar-pct', pct: 40 });
    for (const formato of FORMATOS_OG) {
      const r = await s.app.request(`/api/og/apuracao.png?race=pres&formato=${formato}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('x-og-fotos')).toBe('0');
      const buf = Buffer.from(await r.arrayBuffer());
      if (SAIDA) writeFileSync(join(SAIDA, `motor-pres-sim-${formato}.png`), buf);
    }
    // o 1º turno é dado oficial: com os nomes reais, foto
    expect((await s.app.request('/api/og/apuracao.png?race=pres-t1&formato=x')).headers.get('x-og-fotos')).toBe('1');
    // nomes ocultos: nem no 1º turno
    await comando(s, cookie, { tipo: 'nomes-reais', ativo: false });
    expect((await s.app.request('/api/og/apuracao.png?race=pres-t1&formato=x')).headers.get('x-og-fotos')).toBe('0');
  }, 60_000);

  it(OFERECIMENTO_NO_PLACAR ? 'oferecimento: o placar ganha a faixa com anúncio de compartilhamento no ar; sem anúncio, a imagem de sempre' : 'oferecimento DESLIGADO no placar (regra §1.5): com anúncio de compartilhamento no ar, a imagem do placar não muda', async () => {
    const s = await montar();
    const cookie = await login(s);
    const antes = Buffer.from(await (await s.app.request('/api/og/apuracao.png?race=pres-t1&formato=x')).arrayBuffer());
    const anuncio: AnuncioConfig = {
      id: 'lynx',
      marca: 'Lynx Pay',
      titulo: 'Pix na hora, sem taxa',
      texto: '',
      cta: 'Abrir conta',
      url: 'https://lynx.com.br',
      formatos: ['compartilhamento'],
      peso: 5,
      cota: 'apoio',
      ativo: true,
      inicio: null,
      fim: null,
      naoPolitico: true,
    };
    expect((await comando(s, cookie, { tipo: 'anuncio-salvar', anuncio })).status).toBe(200);
    const com = await s.app.request('/api/og/apuracao.png?race=pres-t1&formato=x');
    const bufCom = Buffer.from(await com.arrayBuffer());
    expect(bufCom.equals(antes)).toBe(!OFERECIMENTO_NO_PLACAR);
    if (SAIDA) writeFileSync(join(SAIDA, 'motor-pres-t1-x-oferecimento.png'), bufCom);
    await comando(s, cookie, { tipo: 'anuncio-remover', id: 'lynx' });
    const depois = Buffer.from(await (await s.app.request('/api/og/apuracao.png?race=pres-t1&formato=x')).arrayBuffer());
    expect(dimensoesPng(depois)).toEqual(DIM_OG.x);
    expect(depois.equals(bufCom)).toBe(!OFERECIMENTO_NO_PLACAR);
  }, 60_000);
});

describe('rotas (fonte TSE com o 2º turno forjado)', () => {
  let t: Montado;
  let f: FakeFetch;
  const BR = 'ele2026/6258/dados/br/br-c0001-e006258-u.json';

  beforeAll(async () => {
    f = criarFakeFetch();
    t = await montar({ fetch: f, agora: Date.UTC(2026, 9, 25, 21, 43, 0) });
    const cookie = await login(t);
    expect((await comando(t, cookie, { tipo: 'tse', tse: { baseUrl: BASE } })).status).toBe(200);
    expect((await comando(t, cookie, { tipo: 'fonte', fonte: 'tse' })).status).toBe(200);
    // números FICTÍCIOS só neste teste: 61,3% das seções, cada finalista com o seu total
    const d = structuredClone(jsonFixture<TseResultadoArquivo>(BR));
    Object.assign(d, { dg: '25/10/2026', hg: '18:42:13', dt: '25/10/2026', ht: '18:42:13', and: 'p' });
    Object.assign(d.s, { st: '30000', pst: '61,27' });
    for (const a of d.carg[0].agr) for (const p of a.par) for (const c of p.cand) c.vap = c.n === '13' ? '4123456' : '3987654';
    Object.assign(d.v, { vv: '8111110', vnom: '8111110', tv: '8400000', vb: '120000', tvn: '168890' });
    f.rotas.set(BR, d);
    expect(await t.tse.fonte!.pollPrioritario()).toBe('novo');
  });

  afterAll(async () => {
    await t.tse.encerrar();
  });

  it('o placar do 2º turno sai do feed: dado real → retratos oficiais, nos quatro formatos', async () => {
    const n = (await (await t.app.request('/api/apuracao/pres/br')).json()) as { resumo: Summary };
    expect(n.resumo.secoesTotalizadas).toBe(30000);
    for (const formato of FORMATOS_OG as readonly FormatoOg[]) {
      const r = await t.app.request(`/api/og/apuracao.png?race=pres&formato=${formato}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('x-og-fotos')).toBe('1');
      const buf = Buffer.from(await r.arrayBuffer());
      expect(dimensoesPng(buf)).toEqual(DIM_OG[formato]);
      if (SAIDA) writeFileSync(join(SAIDA, `tse-pres-${formato}.png`), buf);
    }
  }, 60_000);
});
