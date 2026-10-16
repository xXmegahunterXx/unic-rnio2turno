import { describe, expect, it } from 'vitest';
import type { ContagemDiaAudiencia } from '@/shared/audiencia';
import {
  csvCurva,
  csvHorasNoite,
  csvLocalDias,
  csvPaises,
  diaAntes,
  fatiasAparelho,
  fracaoCelular,
  marcasHoras,
  nomePais,
  rankingPais,
  rankingUf,
  resumoCurva,
  serieCurva,
  somaPeriodo,
  telaDoDia,
  telaUltimasHoras,
  tetoEixo,
} from './audienciaNoite';

/** 25/10/2026 19:00 de Brasília. */
const NOITE = Date.UTC(2026, 9, 25, 22, 0, 0);

describe('período e somas', () => {
  it('dias de calendário que terminam hoje (não os n registros)', () => {
    expect(diaAntes('2026-10-25', 6)).toBe('2026-10-19');
    expect(diaAntes('2026-11-01', 1)).toBe('2026-10-31');
    const lista: ContagemDiaAudiencia[] = [
      { dia: '2026-10-10', n: { SP: 100 } },
      { dia: '2026-10-19', n: { SP: 1, RJ: 2 } },
      { dia: '2026-10-25', n: { SP: 3, ND: 1 } },
    ];
    expect(somaPeriodo(lista, '2026-10-25', 1)).toEqual({ SP: 3, ND: 1 });
    expect(somaPeriodo(lista, '2026-10-25', 7)).toEqual({ SP: 4, RJ: 2, ND: 1 });
    expect(somaPeriodo(undefined, '2026-10-25', 7)).toEqual({});
  });
});

describe('rankings', () => {
  it('UF: nome por extenso, do maior para o menor, "não informado" à parte; frações sobre o total', () => {
    const r = rankingUf({ SP: 50, RJ: 30, ND: 20 });
    expect(r.total).toBe(100);
    expect(r.itens.map((i) => [i.rotulo, i.fracao])).toEqual([
      ['São Paulo', 0.5],
      ['Rio de Janeiro', 0.3],
    ]);
    expect(r.resto).toEqual([{ chave: 'ND', rotulo: 'Não informado', valor: 20, fracao: 0.2 }]);
  });

  it('país: nome em português; "não informado" e "outros países" no fim', () => {
    expect(nomePais('BR')).toBe('Brasil');
    expect(nomePais('PT')).toBe('Portugal');
    expect(nomePais('ZZ')).toBe('Outros países');
    const r = rankingPais({ BR: 90, US: 4, ZZ: 1, ND: 5 });
    expect(r.itens.map((i) => i.chave)).toEqual(['BR', 'US']);
    expect(r.resto.map((i) => i.chave)).toEqual(['ND', 'ZZ']);
  });

  it('aparelho: ordem fixa (a cor segue o aparelho, não a posição) e fração no celular sem "não informado"', () => {
    expect(fatiasAparelho({ computador: 30, celular: 60, nd: 10 }).map((f) => [f.aparelho, f.fracao])).toEqual([
      ['celular', 0.6],
      ['computador', 0.3],
      ['nd', 0.1],
    ]);
    expect(fatiasAparelho({ computador: 5 }).map((f) => f.aparelho)).toEqual(['computador']);
    expect(fracaoCelular({ celular: 60, computador: 20, nd: 1000 })).toBe(0.75);
    expect(fracaoCelular({ nd: 3 })).toBeNull();
  });
});

describe('curva', () => {
  it('1.440 pontos até agora; minuto sem amostra = null', () => {
    const curva = [
      { minuto: NOITE - 2 * 60_000, pessoas: 10 },
      { minuto: NOITE, pessoas: 30 },
      { minuto: NOITE - 2 * 86_400_000, pessoas: 99 }, // fora da janela
    ];
    const s = serieCurva(curva, NOITE + 30_000);
    expect(s.valores).toHaveLength(1440);
    expect(s.inicio).toBe(NOITE - 1439 * 60_000);
    expect(s.valores.at(-1)).toBe(30);
    expect(s.valores.at(-2)).toBeNull();
    expect(s.valores.at(-3)).toBe(10);
    expect(s.valores.filter((v) => v !== null)).toHaveLength(2);
  });

  it('resumo: maior minuto (o primeiro no empate), medidos e o último', () => {
    const r = resumoCurva([
      { minuto: 1, pessoas: 0 },
      { minuto: 2, pessoas: 7 },
      { minuto: 3, pessoas: 7 },
      { minuto: 4, pessoas: 2 },
    ]);
    expect(r.max).toEqual({ minuto: 2, pessoas: 7 });
    expect(r.medidos).toBe(4);
    expect(r.ultimo).toEqual({ minuto: 4, pessoas: 2 });
    expect(resumoCurva([]).max).toBeNull();
  });

  it('eixo: teto redondo; marcas nas horas cheias de Brasília', () => {
    expect(tetoEixo(0)).toBe(10);
    expect(tetoEixo(7)).toBe(10);
    expect(tetoEixo(12_300)).toBe(20_000);
    expect(tetoEixo(240)).toBe(250);
    expect(tetoEixo(5000)).toBe(5000);
    const inicio = NOITE + 30 * 60_000 - 1439 * 60_000; // 19:30 de ontem até 19:30 de hoje (Brasília)
    const m = marcasHoras(inicio, 6);
    // 00h, 06h, 12h, 18h de Brasília = 03, 09, 15, 21 UTC
    expect(m.map((t) => new Date(t).getUTCHours())).toEqual([3, 9, 15, 21]);
  });
});

describe('horas de tela', () => {
  const tela = {
    porHora: [
      { hora: NOITE - 3_600_000, horas: 1.5 },
      { hora: NOITE, horas: 2.25 },
    ],
    porDia: [{ dia: '2026-10-25', horas: 3.75 }],
  };
  it('do dia e das últimas horas', () => {
    expect(telaDoDia(tela, '2026-10-25')).toBe(3.75);
    expect(telaDoDia(tela, '2026-10-24')).toBe(0);
    expect(telaDoDia(undefined, '2026-10-25')).toBe(0);
    expect(telaUltimasHoras(tela, 1)).toBe(2.25);
    expect(telaUltimasHoras(tela, 24)).toBe(3.75);
  });
});

describe('CSV', () => {
  const linhas = (csv: string) => csv.replace(/^﻿/, '').trim().split('\r\n');

  it('curva e horas (vírgula decimal nas horas de tela)', () => {
    expect(linhas(csvCurva([{ minuto: NOITE, pessoas: 12 }]))).toEqual(['minuto_brasilia;pessoas_ao_mesmo_tempo_max', '2026-10-25 19:00;12']);
    const h = linhas(csvHorasNoite([{ hora: NOITE, paginas: 5, pico: 3 }], { porHora: [{ hora: NOITE, horas: 1.5 }], porDia: [] }));
    expect(h).toEqual(['hora_inicio_brasilia;paginas_vistas;pico_simultaneo;horas_de_tela', '2026-10-25 19:00;5;3;1,50']);
    expect(linhas(csvHorasNoite([{ hora: NOITE, paginas: 5, pico: 3 }], undefined))[1]).toBe('2026-10-25 19:00;5;3;0,00');
  });

  it('por dia: aparelhos e as 27 UFs; países em linhas', () => {
    const csv = linhas(
      csvLocalDias({
        dias: [{ dia: '2026-10-25', unicos: 1, paginas: 10, entradas: 1, porGrupo: {}, origens: {}, pico: null, reinicios: 0 }],
        porUf: [{ dia: '2026-10-25', n: { SP: 6, ND: 2 } }],
        porAparelho: [{ dia: '2026-10-25', n: { celular: 7, computador: 3 } }],
        horasTela: { porHora: [], porDia: [{ dia: '2026-10-25', horas: 2 }] },
      }),
    );
    const cab = csv[0].split(';');
    const v = csv[1].split(';');
    expect(cab).toHaveLength(6 + 27 + 1);
    expect(v[cab.indexOf('paginas_vistas')]).toBe('10');
    expect(v[cab.indexOf('horas_de_tela')]).toBe('2,00');
    expect(v[cab.indexOf('celular')]).toBe('7');
    expect(v[cab.indexOf('uf_SP')]).toBe('6');
    expect(v[cab.indexOf('uf_RJ')]).toBe('0');
    expect(v[cab.indexOf('uf_nao_informada')]).toBe('2');
    expect(linhas(csvPaises([{ dia: '2026-10-25', n: { PT: 1, BR: 9 } }]))).toEqual([
      'dia;pais;nome;paginas_vistas',
      '2026-10-25;BR;Brasil;9',
      '2026-10-25;PT;Portugal;1',
    ]);
  });
});
