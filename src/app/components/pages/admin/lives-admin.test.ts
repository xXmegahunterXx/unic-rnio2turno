import { describe, expect, it } from 'vitest';
import type { LivesResumo } from '@/shared/lives';
import { csvLivesHoras, csvLivesResumo, fmtMinutos, janelaHoras, porAnuncio } from './SecaoLives';

const R: LivesResumo = {
  agora: 7,
  porLayout: { barra: 4, canto: 3 },
  minutos: { total: 125, porLayout: { barra: 100, canto: 25 }, porAnuncio: { 'marca-a': 90, '=perigo': 5 } },
  canaisBot: 12,
  pico: { n: 9, em: Date.UTC(2026, 9, 25, 21, 30) },
  desde: Date.UTC(2026, 9, 24, 15),
  agoraPorAnuncio: { 'marca-a': 6, 'marca-b': 1 },
  horas: [
    { h: Date.UTC(2026, 9, 25, 21), max: 9, minutos: 100 },
    { h: Date.UTC(2026, 9, 25, 20), max: 3, minutos: 25 },
  ],
  ligado: true,
};

describe('painel → Lives (puros)', () => {
  it('minutos por extenso', () => {
    expect(fmtMinutos(0)).toBe('0 min');
    expect(fmtMinutos(59)).toBe('59 min');
    expect(fmtMinutos(60)).toBe('1 h');
    expect(fmtMinutos(125)).toBe('2 h 05 min');
    expect(fmtMinutos(60 * 1234)).toBe('1.234 h');
  });

  it('anúncios: marca do cadastro, do que tem mais minutos para o que tem menos', () => {
    const l = porAnuncio(R, [{ id: 'marca-a', marca: 'Marca A' }]);
    expect(l.map(([id, a]) => [id, a.marca, a.minutos, a.agora])).toEqual([
      ['marca-a', 'Marca A', 90, 6],
      ['=perigo', '=perigo', 5, 0],
      ['marca-b', 'marca-b', 0, 1],
    ]);
  });

  it('gráfico: sempre as 48 horas até agora, as sem live zeradas', () => {
    const j = janelaHoras(R.horas!, Date.UTC(2026, 9, 25, 21, 40));
    expect(j).toHaveLength(48);
    expect(j.at(-1)).toEqual({ h: Date.UTC(2026, 9, 25, 21), max: 9, minutos: 100 });
    expect(j.at(-2)).toEqual({ h: Date.UTC(2026, 9, 25, 20), max: 3, minutos: 25 });
    expect(j[0]).toEqual({ h: Date.UTC(2026, 9, 23, 22), max: 0, minutos: 0 });
  });

  it('CSV por hora em ordem, horário de Brasília, ";" e BOM', () => {
    const c = csvLivesHoras(R.horas!);
    expect(c.startsWith('﻿hora_inicio_brasilia;lives_ao_mesmo_tempo_max;minutos_no_ar\r\n')).toBe(true);
    expect(c).toContain('2026-10-25 17:00;3;25\r\n2026-10-25 18:00;9;100');
  });

  it('CSV resumo: totais, layouts, anúncios (fórmula neutralizada), pico e canais', () => {
    const c = csvLivesResumo(R, [{ id: 'marca-a', marca: 'Marca A' }]);
    expect(c).toContain('total;todas;Todas as lives;125;7');
    expect(c).toContain('layout;barra;Barra;100;4');
    expect(c).toContain('layout;vertical;Em pé (9:16);0;0');
    expect(c).toContain('anuncio;marca-a;Marca A;90;6');
    expect(c).toContain("anuncio;'=perigo;'=perigo;5;0");
    expect(c).toContain('pico;2026-10-25 18:30;Maior número de lives ao mesmo tempo;;9');
    expect(c).toContain('canais_bot;todos;Canais distintos com o !apuracao;;12');
  });
});
