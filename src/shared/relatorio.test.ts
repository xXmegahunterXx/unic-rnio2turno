/**
 * Relatório de entrega do anunciante (src/shared/relatorio.ts): totais e série por período (campanha, noite da eleição,
 * últimas 24 h), CTR e CSV (";", vírgula decimal, BOM e proteção contra fórmula).
 */
import { describe, expect, it } from 'vitest';
import type { AnuncioPublico } from './anuncios';
import { csvRelatorioAnunciante, ctrPct, LINKS_POR_ANUNCIO, NOITE_ELEICAO, serieDoPeriodo, totaisDoPeriodo, type RelatorioAnunciante } from './relatorio';

const H = 3_600_000;
const z = (iso: string) => Date.parse(iso);

const anuncio: AnuncioPublico = {
  id: 'lynx',
  marca: 'Lynx',
  titulo: 'Carteira digital com Pix em tempo real e sem mensalidade',
  texto: '',
  cta: 'Saiba mais',
  href: '',
  destino: 'lynxpix.cc',
  formatos: ['topo', 'rodape', 'nativo', 'tv', 'compartilhamento'],
  peso: 5,
  cota: 'master',
};

/** 26/10, 3h30 de Brasília: a noite já acabou. */
const AGORA = z('2026-10-26T06:30:00Z');

const rel = (extra: Partial<RelatorioAnunciante> = {}): RelatorioAnunciante => ({
  geradoEm: AGORA,
  desde: z('2026-10-01T00:00:00Z'),
  anuncio,
  situacao: 'no-ar',
  inicio: z('2026-10-20T14:30:00Z'),
  fim: null,
  horas: [
    { hora: z('2026-10-20T15:00:00Z'), formato: 'nativo', impressoes: 50, cliques: 0 },
    { hora: z('2026-10-20T15:00:00Z'), formato: 'topo', impressoes: 100, cliques: 2 },
    // noite da eleição (25/10 17h → 26/10 2h de Brasília = 20:00Z → 05:00Z)
    { hora: z('2026-10-25T20:00:00Z'), formato: 'topo', impressoes: 1000, cliques: 10 },
    { hora: z('2026-10-25T23:00:00Z'), formato: 'rodape', impressoes: 500, cliques: 5 },
    { hora: z('2026-10-26T04:00:00Z'), formato: 'tv', impressoes: 200, cliques: 0 },
    // 26/10 2h de Brasília: já fora da noite
    { hora: z('2026-10-26T05:00:00Z'), formato: 'topo', impressoes: 70, cliques: 1 },
  ],
  dias: [{ dia: '2026-10-05', impressoes: 300, cliques: 3 }],
  alcance: { campanha: 1500, noite: 900 },
  ...extra,
});

describe('constantes', () => {
  it('noite da eleição: 25/10 17h → 26/10 2h (Brasília)', () => {
    expect(new Date(NOITE_ELEICAO.inicio).toISOString()).toBe('2026-10-25T20:00:00.000Z');
    expect(new Date(NOITE_ELEICAO.fim).toISOString()).toBe('2026-10-26T05:00:00.000Z');
    expect(LINKS_POR_ANUNCIO).toBe(5);
  });
});

describe('ctrPct', () => {
  it('cliques ÷ impressões em %, null sem impressões', () => {
    expect(ctrPct({ impressoes: 1000, cliques: 10 })).toBe(1);
    expect(ctrPct({ impressoes: 3, cliques: 1 })).toBeCloseTo(33.333, 3);
    expect(ctrPct({ impressoes: 0, cliques: 0 })).toBeNull();
  });
});

describe('totaisDoPeriodo', () => {
  it('campanha: horas de detalhe + dias anteriores; alcance da campanha; frequência', () => {
    const t = totaisDoPeriodo(rel(), 'campanha', AGORA);
    expect(t.impressoes).toBe(2220);
    expect(t.cliques).toBe(21);
    expect(t.alcance).toBe(1500);
    expect(t.frequencia).toBeCloseTo(2220 / 1500, 6);
    // formatos medidos do anúncio (mesmo com zero), na ordem do contrato; 'compartilhamento' não é medido
    expect(t.porFormato).toEqual([
      { formato: 'topo', impressoes: 1170, cliques: 13 },
      { formato: 'rodape', impressoes: 500, cliques: 5 },
      { formato: 'nativo', impressoes: 50, cliques: 0 },
      { formato: 'tv', impressoes: 200, cliques: 0 },
    ]);
  });

  it('noite: só as horas de 25/10 17h a 26/10 2h; alcance da noite', () => {
    const t = totaisDoPeriodo(rel(), 'noite', AGORA);
    expect([t.impressoes, t.cliques, t.alcance]).toEqual([1700, 15, 900]);
    expect(t.frequencia).toBeCloseTo(1700 / 900, 6);
    expect(t.porFormato.find((f) => f.formato === 'nativo')).toEqual({ formato: 'nativo', impressoes: 0, cliques: 0 });
  });

  it('últimas 24 h: a hora atual e as 23 anteriores, sem alcance', () => {
    const t = totaisDoPeriodo(rel(), 'ultimas24h', AGORA);
    expect([t.impressoes, t.cliques]).toEqual([1770, 16]);
    expect(t.alcance).toBeNull();
    expect(t.frequencia).toBeNull();
  });

  it('alcance ausente → sem frequência; estimativa nunca passa das impressões', () => {
    const sem = totaisDoPeriodo(rel({ alcance: { campanha: null, noite: null } }), 'noite', AGORA);
    expect([sem.alcance, sem.frequencia]).toEqual([null, null]);
    const exagerado = totaisDoPeriodo(rel({ alcance: { campanha: 9_999, noite: 2_000 } }), 'noite', AGORA);
    expect(exagerado.alcance).toBe(1700);
    expect(exagerado.frequencia).toBe(1);
    const zero = totaisDoPeriodo(rel({ horas: [], dias: [], alcance: { campanha: 0, noite: 0 } }), 'campanha', AGORA);
    expect([zero.impressoes, zero.alcance, zero.frequencia]).toEqual([0, 0, null]);
  });
});

describe('serieDoPeriodo', () => {
  it('noite: 9 horas (17h → 1h de Brasília), somando os formatos, com zeros', () => {
    const s = serieDoPeriodo(rel(), 'noite', AGORA);
    expect(s).toHaveLength(9);
    expect(s[0]).toEqual({ hora: NOITE_ELEICAO.inicio, impressoes: 1000, cliques: 10 });
    expect(s[3]).toEqual({ hora: NOITE_ELEICAO.inicio + 3 * H, impressoes: 500, cliques: 5 });
    expect(s[8]).toEqual({ hora: NOITE_ELEICAO.fim - H, impressoes: 200, cliques: 0 });
    expect(s.reduce((n, h) => n + h.impressoes, 0)).toBe(1700);
  });

  it('noite em andamento vai até a hora atual; antes dela, vazia', () => {
    expect(serieDoPeriodo(rel(), 'noite', z('2026-10-25T22:10:00Z'))).toHaveLength(3);
    expect(serieDoPeriodo(rel(), 'noite', z('2026-10-25T19:59:00Z'))).toEqual([]);
  });

  it('últimas 24 h: 24 horas até a atual', () => {
    const s = serieDoPeriodo(rel(), 'ultimas24h', AGORA);
    expect(s).toHaveLength(24);
    expect(s[23].hora).toBe(z('2026-10-26T06:00:00Z'));
    expect(s.reduce((n, h) => n + h.impressoes, 0)).toBe(1770);
  });

  it('campanha: do início (ou da 1ª hora com dado) até a hora atual — ou até o fim do anúncio', () => {
    const s = serieDoPeriodo(rel(), 'campanha', AGORA);
    expect(s[0].hora).toBe(z('2026-10-20T14:00:00Z'));
    expect(s.at(-1)!.hora).toBe(z('2026-10-26T06:00:00Z'));
    expect(s).toHaveLength(137);
    expect(s.reduce((n, h) => n + h.impressoes, 0)).toBe(1920); // os dias anteriores não têm hora
    const encerrado = serieDoPeriodo(rel({ fim: z('2026-10-26T05:00:00Z') }), 'campanha', AGORA);
    expect(encerrado.at(-1)!.hora).toBe(z('2026-10-26T05:00:00Z')); // a hora com dado depois do fim (bônus) aparece
    expect(serieDoPeriodo(rel({ horas: [] }), 'campanha', AGORA)).toEqual([]);
  });

  it('campanha longa: no máximo os 14 dias de detalhe', () => {
    const horas = Array.from({ length: 20 * 24 }, (_, i) => ({ hora: AGORA - (i + 1) * H - (AGORA % H), formato: 'topo' as const, impressoes: 1, cliques: 0 }));
    const s = serieDoPeriodo(rel({ horas, inicio: AGORA - 30 * 24 * H }), 'campanha', AGORA);
    expect(s).toHaveLength(14 * 24);
  });
});

describe('csvRelatorioAnunciante', () => {
  it('";", vírgula decimal, BOM e quebra CRLF; dias, horas (Brasília) e total', () => {
    const csv = csvRelatorioAnunciante(rel());
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const linhas = csv.slice(1).trimEnd().split('\r\n');
    expect(linhas[0]).toBe('marca;tipo;inicio_brasilia;formato;impressoes_visiveis;cliques;ctr_pct');
    expect(linhas[1]).toBe('Lynx;dia;2026-10-05;todos;300;3;1,00');
    expect(linhas[2]).toBe('Lynx;hora;2026-10-20 12:00;topo;100;2;2,00');
    expect(linhas[3]).toBe('Lynx;hora;2026-10-20 12:00;nativo;50;0;0,00');
    expect(linhas[4]).toBe('Lynx;hora;2026-10-25 17:00;topo;1000;10;1,00');
    expect(linhas.at(-1)).toBe('Lynx;total;;todos;2220;21;0,95');
    expect(linhas).toHaveLength(1 + 1 + 6 + 1);
  });

  it('CTR vazio sem impressões', () => {
    const csv = csvRelatorioAnunciante(rel({ horas: [{ hora: z('2026-10-25T20:00:00Z'), formato: 'tv', impressoes: 0, cliques: 0 }], dias: [] }));
    expect(csv).toContain('Lynx;hora;2026-10-25 17:00;tv;0;0;\r\n');
  });

  it('proteção contra fórmula (a mesma do csvCampo do painel)', () => {
    const com = (marca: string) => csvRelatorioAnunciante(rel({ anuncio: { ...anuncio, marca }, horas: [], dias: [] })).slice(1).split('\r\n')[1];
    expect(com('=1+1')).toBe("'=1+1;total;;todos;0;0;");
    expect(com('@SOMA(A1)')).toBe("'@SOMA(A1);total;;todos;0;0;");
    expect(com('+5511')).toBe("'+5511;total;;todos;0;0;");
    expect(com('Loja; "Centro"')).toBe('"Loja; ""Centro""";total;;todos;0;0;');
    expect(com('Café, Bar')).toBe('"Café, Bar";total;;todos;0;0;');
    expect(com('Café,=1+1')).toBe(`"Café,'=1+1";total;;todos;0;0;`);
  });
});
