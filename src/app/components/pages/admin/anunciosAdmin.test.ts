/** Utilidades puras da seção "Anunciantes" do painel. */
import { describe, expect, it } from 'vitest';
import type { MetricaAnuncio } from '@/shared/anuncios';
import { HORA_MS, csvPorHora, csvRelatorio, ctr, deCampoData, linhasRelatorio, paraCampoData, serieHoras, situacaoDe, totais48h, totaisDe } from './anunciosAdmin';

const AGORA = Date.UTC(2026, 9, 15, 15, 30, 0); // 12:30 de Brasília
const H0 = Math.floor(AGORA / HORA_MS) * HORA_MS;

const metricas: MetricaAnuncio[] = [
  { id: 'lynx', formato: 'topo', impressoes: 1000, cliques: 12, porHora: [{ hora: H0 - HORA_MS, impressoes: 300, cliques: 2 }, { hora: H0, impressoes: 100, cliques: 1 }] },
  { id: 'lynx', formato: 'nativo', impressoes: 200, cliques: 8, porHora: [{ hora: H0, impressoes: 50, cliques: 3 }] },
  { id: 'velho', formato: 'topo', impressoes: 10, cliques: 0, porHora: [{ hora: H0 - 60 * HORA_MS, impressoes: 10, cliques: 0 }] },
];

describe('anunciosAdmin', () => {
  it('situação pelo relógio do servidor', () => {
    expect(situacaoDe({ ativo: false, inicio: null, fim: null }, AGORA)).toBe('pausado');
    expect(situacaoDe({ ativo: true, inicio: null, fim: null }, AGORA)).toBe('no-ar');
    expect(situacaoDe({ ativo: true, inicio: AGORA + 1, fim: null }, AGORA)).toBe('agendado');
    expect(situacaoDe({ ativo: true, inicio: null, fim: AGORA }, AGORA)).toBe('encerrado');
    expect(situacaoDe({ ativo: false, inicio: null, fim: AGORA }, AGORA)).toBe('pausado');
  });

  it('campo datetime-local em horário de Brasília (independe do fuso do aparelho)', () => {
    expect(paraCampoData(Date.UTC(2026, 9, 25, 20, 0))).toBe('2026-10-25T17:00');
    expect(deCampoData('2026-10-25T17:00')).toBe(Date.UTC(2026, 9, 25, 20, 0));
    expect(deCampoData('')).toBeNull();
    expect(paraCampoData(null)).toBe('');
    expect(deCampoData('25/10/2026')).toBeNaN();
    for (const ms of [Date.UTC(2026, 0, 1, 2, 59), AGORA - (AGORA % 60_000)]) expect(deCampoData(paraCampoData(ms))).toBe(ms);
  });

  it('totais, 48 h e CTR', () => {
    expect(totaisDe(metricas, 'lynx')).toEqual({ impressoes: 1200, cliques: 20 });
    expect(totaisDe(metricas)).toEqual({ impressoes: 1210, cliques: 20 });
    expect(totais48h(metricas, AGORA, 'lynx')).toEqual({ impressoes: 450, cliques: 6 });
    expect(totais48h(metricas, AGORA)).toEqual({ impressoes: 450, cliques: 6 }); // a hora de 60 h atrás fica de fora
    const s = serieHoras(metricas, AGORA, 'lynx');
    expect(s).toHaveLength(48);
    expect(s[47]).toEqual({ hora: H0, impressoes: 150, cliques: 4 });
    expect(s[46].impressoes).toBe(300);
    expect(ctr({ impressoes: 0, cliques: 0 })).toBeNull();
    expect(ctr({ impressoes: 200, cliques: 3 })).toBeCloseTo(1.5);
  });

  it('relatório: por anúncio e formato, ids removidos marcados; CSV em pt-BR (";" e vírgula decimal, BOM)', () => {
    const linhas = linhasRelatorio(metricas, [{ id: 'lynx', marca: 'Lynx' }, { id: 'novo', marca: 'Novo' }]);
    expect(linhas.map((l) => [l.id, l.marca, l.removido, l.formatos.map((f) => f.formato)])).toEqual([
      ['lynx', 'Lynx', false, ['topo', 'nativo']],
      ['novo', 'Novo', false, []],
      ['velho', 'velho', true, ['topo']],
    ]);
    const csv = csvRelatorio(metricas, [{ id: 'lynx', marca: 'Lynx; "Pay"' }], AGORA - 86400_000, AGORA);
    expect(csv.startsWith('﻿anuncio;marca;formato;impressoes_visiveis;cliques;ctr_pct;desde;gerado_em\r\n')).toBe(true);
    expect(csv).toContain('lynx;"Lynx; ""Pay""";topo;1000;12;1,20;');
    expect(csv).toContain('lynx;"Lynx; ""Pay""";total;1200;20;1,67;');
    const ph = csvPorHora(metricas, [{ id: 'lynx', marca: 'Lynx' }]);
    expect(ph.split('\r\n').filter(Boolean)).toHaveLength(1 + 4);
    expect(ph).toContain(`lynx;Lynx;topo;${new Date(H0).toISOString()};100;1`);
  });
});
