/**
 * Revisão integrada da fase 2 (motor + servidor): testes de regressão dos defeitos achados na integração.
 *  - locais de votação na 1ª resposta de zona/seção (antes vinham só a partir da 2ª, com o MESMO ETag → 304 eterno);
 *  - locais também na fonte 'tse' (o feed oficial não traz o local de votação);
 *  - patrocínio: a validação do servidor (zod) e a do motor aceitam e recusam exatamente os mesmos valores;
 *  - "pessoas agora": a troca horária do sal não dobra a contagem por 30 s;
 *  - `?t=` anterior ao começo da noite vira um único instante (sem uma entrada de cache por segundo pedido).
 * Motor REAL (dataset de public/data).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { LiveStatus, NationalSnapshot, SecaoDetalhe, ZonaSnapshot } from '../shared/types';
import { INICIO_APURACAO } from '../shared/constants';
import { validaPatrocinio } from '../engine/state';
import { ClientesAtivos, SAL_TROCA_MS } from './metrics';
import { Dados } from './dados';
import type { TseManager } from './tse';
import { adminCommandSchema } from './validation';
import { comando, login, montar, type Montado } from './test-helpers';

// Belo Horizonte, zona 33: as seções 1–12 ficam na E. E. Bernardo Monteiro (public/data/locais/mg.json)
const BH = { uf: 'mg', cod: '41238', zona: 33, secao: 1, escola: 'Escola Estadual Bernardo Monteiro' } as const;

describe('locais de votação já na 1ª resposta de zona/seção', () => {
  let m: Montado;
  beforeAll(async () => {
    m = await montar(); // controller novo: nenhum arquivo de locais carregado ainda
  });

  it('1º turno (zona): a 1ª resposta já traz `local`, e o ETag só muda com os números', async () => {
    const url = `/api/apuracao/pres-t1/uf/${BH.uf}/mun/${BH.cod}/zona/${BH.zona}`;
    const r1 = await m.app.request(url);
    expect(r1.status).toBe(200);
    const z1 = (await r1.json()) as ZonaSnapshot;
    const s1 = z1.secoes.find((s) => s.secao === BH.secao)!;
    expect(s1.local?.nome).toBe(BH.escola);
    expect(z1.secoes.filter((s) => s.local).length).toBe(z1.secoes.length);
    // a revalidação com o ETag da 1ª resposta dá 304 — e agora isso é correto, porque ela já tinha o local
    const r2 = await m.app.request(url, { headers: { 'if-none-match': r1.headers.get('etag')! } });
    expect(r2.status).toBe(304);
  });

  it('2º turno (simulação): zona e seção da 1ª consulta de outra UF também trazem `local`', async () => {
    const cookie = await login(m);
    await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' });
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 50 });
    // Rio Branco (AC): UF ainda não consultada neste controller
    const z = (await (await m.app.request('/api/apuracao/pres/uf/ac/mun/01392/zona/1')).json()) as ZonaSnapshot;
    expect(z.secoes.length).toBeGreaterThan(0);
    expect(z.secoes.every((s) => !!s.local?.nome)).toBe(true);
    const n = z.secoes[0].secao;
    const d = (await (await m.app.request(`/api/apuracao/gov-ac/uf/ac/mun/01392/zona/1/secao/${n}`)).json()) as SecaoDetalhe;
    expect(d.local).toEqual(z.secoes[0].local);
  });
});

describe('?t= antes do começo da noite', () => {
  it('qualquer instante antes de 16:59:30 é o mesmo instante (um ETag só, nada totalizado)', async () => {
    const m = await montar();
    const cookie = await login(m);
    await comando(m, cookie, { tipo: 'relogio', acao: 'iniciar' });
    await comando(m, cookie, { tipo: 'saltar-pct', pct: 30 });
    const ini = INICIO_APURACAO - 30_000;
    const etags = new Set<string>();
    for (const t of [1, 1_700_000_000_000, ini - 5_000, ini]) {
      const r = await m.app.request(`/api/apuracao/pres/br?t=${t}`);
      expect(r.status).toBe(200);
      etags.add(r.headers.get('etag')!);
      const n = (await r.json()) as NationalSnapshot;
      expect(n.resumo.secoesTotalizadas).toBe(0);
      expect(n.simNow).toBe(ini);
    }
    expect(etags.size).toBe(1);
  });
});

describe('fonte TSE: zona e seção ganham o local de votação do dataset', () => {
  let m: Montado;
  const chamadas: string[] = [];
  beforeAll(async () => {
    m = await montar();
    const cookie = await login(m);
    expect((await comando(m, cookie, { tipo: 'fonte', fonte: 'tse' })).status).toBe(200);
    m.tse.sincronizar('pre', m.controller.state().tse); // nada de polling de verdade no teste
  });

  /** Dados com um adaptador do TSE de mentira (zona com 3 seções; boletim da seção 1). */
  const dadosFalsos = () => {
    const zona: ZonaSnapshot = {
      race: 'pres',
      uf: 'MG',
      cod: BH.cod,
      nomeMunicipio: 'Belo Horizonte',
      zona: BH.zona,
      geradoEm: 0,
      simNow: 0,
      resumo: { secoes: 3, secoesTotalizadas: 0, eleitorado: 0, eleitoradoTotalizado: 0, comparecimento: 0, abstencao: 0, votos: [0, 0], brancos: 0, nulos: 0, status: 'aguardando', lider: null, eleito: null, ultimaAtualizacao: null },
      secoes: [1, 2, 9999].map((secao) => ({ secao, totalizada: false, totalizadaEm: null, aptos: 0, comparecimento: 0, votos: [0, 0], brancos: 0, nulos: 0 })),
    };
    const boletim = { ...zona.secoes[0], race: 'pres', uf: 'MG', cod: BH.cod, nomeMunicipio: 'Belo Horizonte', zona: BH.zona, abstencao: 0, codigoIdentificacao: '', simulado: false } as SecaoDetalhe;
    const fonte = {
      zona: async () => {
        chamadas.push('zona');
        return zona;
      },
      secao: async () => {
        chamadas.push('secao');
        return boletim;
      },
    };
    const tse = { sincronizar: () => undefined, fonte } as unknown as TseManager;
    return { dados: new Dados(m.controller, tse, () => 0), zona, boletim };
  };

  it('zona: `local` nas seções conhecidas, sem alterar o objeto do adaptador', async () => {
    const { dados, zona } = dadosFalsos();
    const z = await dados.zona('pres', 'MG', BH.cod, BH.zona);
    expect(chamadas).toContain('zona');
    expect(z.secoes[0].local?.nome).toBe(BH.escola);
    expect(z.secoes[1].local?.nome).toBe(BH.escola);
    expect(z.secoes[2].local).toBeUndefined(); // seção que o dataset não conhece
    expect(zona.secoes[0].local).toBeUndefined(); // o snapshot do adaptador não foi mutado
  });

  it('seção (boletim): `local` acrescentado numa cópia', async () => {
    const { dados, boletim } = dadosFalsos();
    const d = await dados.secao('pres', 'MG', BH.cod, BH.zona, BH.secao);
    expect(d?.local?.nome).toBe(BH.escola);
    expect(boletim.local).toBeUndefined();
  });
});

describe('patrocínio: servidor (zod) e motor aceitam e recusam os mesmos valores', () => {
  const ok = { marca: 'Padaria', texto: 'Oferece a apuração.', url: 'https://exemplo.com.br' };
  // ~110 KB de imagem em base64 (antes: o servidor aceitava até 150 KB e o motor recusava acima de ~45 KB → 400)
  const img110k = `data:image/png;base64,${'A'.repeat(150_000)}`;
  const casos: [string, unknown][] = [
    ['mínimo', ok],
    ['logo PNG de ~110 KB', { ...ok, imagem: img110k }],
    ['logo > 150 KB', { ...ok, imagem: `data:image/png;base64,${'A'.repeat(210_000)}` }],
    ['logo GIF', { ...ok, imagem: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }],
    ['logo URL https', { ...ok, imagem: 'https://cdn.exemplo.com.br/logo.svg' }],
    ['logo URL https longa', { ...ok, imagem: `https://cdn.exemplo.com.br/${'x'.repeat(600)}.png` }],
    ['texto com 140', { ...ok, texto: 'x'.repeat(140) }],
    ['texto com 141', { ...ok, texto: 'x'.repeat(141) }],
    ['marca com 60', { ...ok, marca: 'x'.repeat(60) }],
    ['marca com 61', { ...ok, marca: 'x'.repeat(61) }],
    ['url sem domínio', { ...ok, url: 'https://localhost/x' }],
    ['url com espaço', { ...ok, url: 'https://exemplo.com.br/a b' }],
    ['url http', { ...ok, url: 'http://exemplo.com.br' }],
  ];

  it.each(casos)('%s', (_n, patrocinio) => {
    const zod = adminCommandSchema.safeParse({ tipo: 'patrocinio', patrocinio }).success;
    const motor = 'ok' in validaPatrocinio(patrocinio);
    expect(motor).toBe(zod);
  });

  it('logo de ~110 KB em data URI: aceita de ponta a ponta e sai do status como URL', async () => {
    const m = await montar();
    const cookie = await login(m);
    const r = await comando(m, cookie, { tipo: 'patrocinio', patrocinio: { ...ok, imagem: img110k } });
    expect(r.status).toBe(200);
    const s = (await (await m.app.request('/api/status')).json()) as LiveStatus;
    expect(s.patrocinio?.imagem).toMatch(/\/api\/patrocinio\/logo\?h=/);
  });
});

describe('pessoas agora: troca do sal', () => {
  it('a troca horária do sal não conta duas vezes quem segue acessando', () => {
    let t = Date.UTC(2026, 9, 25, 20, 0, 5);
    const c = new ClientesAtivos(() => t);
    const ips = Array.from({ length: 500 }, (_, i) => `203.0.${i >> 8}.${i & 255}`);
    // os mesmos 500 clientes, a cada 5 s, atravessando a troca do sal
    const fim = t + SAL_TROCA_MS + 60_000;
    let max = 0;
    let min = Infinity;
    for (; t <= fim; t += 5_000) {
      for (const ip of ips) c.registrar(ip);
      if (t > Date.UTC(2026, 9, 25, 20, 0, 40)) {
        const n = c.estimar();
        max = Math.max(max, n);
        min = Math.min(min, n);
      }
    }
    expect(max).toBeLessThanOrEqual(520); // antes: ~1.000 por até 30 s depois da troca
    expect(min).toBeGreaterThanOrEqual(480);
  });
});
