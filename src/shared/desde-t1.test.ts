import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DatasetMeta } from './dataset';
import type { Candidate, Race } from './types';
import { agregarDesdeT1, desdePrimeiroTurno, type ContagemT2 } from './desde-t1';

const cand = (numero: number, extra: Partial<Candidate> = {}): Candidate => ({ numero, nomeUrna: `C${numero}`, nome: '', partido: 'P', cor: 'a', ...extra });
const race = { candidatos: [cand(13), cand(22)] } as Pick<Race, 'candidatos'>;
const raceT1 = { candidatos: [cand(13), cand(22), cand(0, { agregado: true, nomeUrna: 'Outros' })] } as Pick<Race, 'candidatos'>;
const area = (votos: number[], secoesTotalizadas: number, secoes = 10, eleitorado = 1000): ContagemT2 => ({ votos, secoes, secoesTotalizadas, eleitorado });

describe('desdePrimeiroTurno', () => {
  it('abrangência concluída: diferença EXATA em votos e variação em p.p. (1º turno sobre todos os válidos)', () => {
    const r = desdePrimeiroTurno({ race, raceT1, t2: area([600, 500], 10), t1: { votos: [450, 470, 80] } });
    expect(r.concluida).toBe(true);
    expect(r.base).toBe('tudo');
    const [a, b] = r.candidatos;
    expect(a).toMatchObject({ numero: 13, votos1: 450, votos2: 600, diferenca: 150 });
    expect(b).toMatchObject({ numero: 22, votos1: 470, votos2: 500, diferenca: 30 });
    expect(a.pct1).toBeCloseTo(45);
    expect(a.pct2).toBeCloseTo(54.545, 2);
    expect(a.pp).toBeCloseTo(9.545, 2);
    expect(b.pp).toBeCloseTo(45.4545 - 47, 2);
  });

  it('em andamento: votos só nas subáreas 100% totalizadas (nunca o parcial contra o total do 1º turno)', () => {
    const r = desdePrimeiroTurno({
      race,
      raceT1,
      t2: area([700, 650], 25, 40, 4000),
      t1: { votos: [1000, 1100, 200] },
      areas2: { A: area([300, 200], 10), B: area([250, 300], 10, 10, 2000), C: area([150, 150], 5), D: area([0, 0], 0, 0, 0) },
      areas1: { A: { votos: [280, 190, 40] }, B: { votos: [260, 280, 60] }, C: { votos: [460, 630, 100] } },
    });
    expect(r.concluida).toBe(false);
    expect(r.base).toBe('parcial');
    expect(r.areasConcluidas).toBe(2);
    expect(r.areasTotal).toBe(3); // D não tem seções
    expect(r.eleitoradoConcluido).toBe(3000);
    expect(r.eleitoradoTotal).toBe(4000);
    expect(r.candidatos[0].diferenca).toBe(300 - 280 + (250 - 260));
    expect(r.candidatos[1].diferenca).toBe(200 - 190 + (300 - 280));
    // o % continua valendo (mesma conta do placar)
    expect(r.candidatos[0].pp).toBeCloseTo((700 / 1350) * 100 - (1000 / 2300) * 100, 6);
  });

  it('nenhuma subárea concluída: sem diferença em votos; sem votos válidos: sem %', () => {
    const r = desdePrimeiroTurno({ race, raceT1, t2: area([0, 0], 0), t1: { votos: [1, 1, 1] }, areas2: { A: area([0, 0], 3) }, areas1: { A: { votos: [1, 1, 1] } } });
    expect(r.base).toBe('nenhuma');
    expect(r.temVotos).toBe(false);
    expect(r.candidatos.every((c) => c.diferenca === null && c.pct2 === null && c.pp === null)).toBe(true);
  });

  it('casa os candidatos pelo número na urna (não pela posição)', () => {
    const invertido = { candidatos: [cand(22), cand(0, { agregado: true }), cand(13)] } as Pick<Race, 'candidatos'>;
    const r = desdePrimeiroTurno({ race, raceT1: invertido, t2: area([10, 20], 10), t1: { votos: [7, 3, 5] } });
    expect(r.candidatos[0]).toMatchObject({ numero: 13, votos1: 5, diferenca: 5 });
    expect(r.candidatos[1]).toMatchObject({ numero: 22, votos1: 7, diferenca: 13 });
  });

  it('"onde cada um cresceu mais que o outro": mesma regra para os dois, só subáreas concluídas e acima do piso', () => {
    const areas2: Record<string, ContagemT2> = {
      A: area([60, 40], 10, 10, 9000), // 13: 40→60 (+20) · 22: 50→40 (−10) → 13 cresceu 30 a mais
      B: area([45, 55], 10, 10, 9000), // 13: 45→45 (0)   · 22: 45→55 (+10) → 22 cresceu 10 a mais
      C: area([90, 10], 10, 10, 100), // minúsculo: fora
      D: area([80, 20], 5, 10, 9000), // em andamento: fora
      E: area([52, 48], 10, 10, 9000), // 13: 50→52 (+2)  · 22: 40→48 (+8)  → 22 cresceu 6 a mais
      F: area([50, 50], 10, 10, 9000), // 13: 30→50 (+20) · 22: 30→50 (+20) → empate: de ninguém
    };
    const areas1 = { A: { votos: [40, 50, 10] }, B: { votos: [45, 45, 10] }, C: { votos: [10, 80, 10] }, D: { votos: [10, 80, 10] }, E: { votos: [50, 40, 10] }, F: { votos: [30, 30, 40] } };
    const r = desdePrimeiroTurno({ race, raceT1, t2: area([1, 1], 1), t1: { votos: [1, 1, 1] }, areas2, areas1, ondeQuantos: 2, ondeEleitoradoMin: 5000 });
    expect(r.onde[0].map((x) => x.chave)).toEqual(['A']);
    expect(r.onde[1].map((x) => x.chave)).toEqual(['B', 'E']);
    expect(r.onde[0][0]).toMatchObject({ pp: 20, vantagem: 30 });
    expect(r.onde[1][0].vantagem).toBeCloseTo(10);
  });

  it('dado real: 1º turno de Presidente (45,16% e 47,03% dos válidos)', () => {
    const meta = JSON.parse(readFileSync(new URL('../../public/data/meta.json', import.meta.url), 'utf8')) as DatasetMeta;
    const t1 = meta.races.find((r) => r.id === 'pres-t1')!;
    const t2 = meta.races.find((r) => r.id === 'pres')!;
    const votos = t1.candidatos.map((c) => c.primeiroTurno!.votos);
    const r = desdePrimeiroTurno({ race: t2, raceT1: t1, t2: area([0, 0], 0), t1: { votos } });
    expect(r.candidatos.map((c) => Number(c.pct1!.toFixed(2)))).toEqual([45.16, 47.03]);
    expect(r.candidatos.map((c) => c.votos1)).toEqual([53_879_538, 56_104_503]);
  });

  it('agregado pronto (o do servidor) no lugar das subáreas; aceita Map e nomes', () => {
    const r2 = { id: 'pres', candidatos: race.candidatos };
    const r1 = { id: 'pres-t1', candidatos: raceT1.candidatos };
    const areas2 = new Map<string, ContagemT2>([
      ['SP|1', area([300, 200], 10, 10, 9000)],
      ['SP|2', area([10, 10], 3)],
    ]);
    const areas1 = new Map([['SP|1', { votos: [280, 190, 40] }]]);
    const ag = agregarDesdeT1(r2, r1, areas2, areas1, { geradoEm: 7, nome: (k) => (k === 'SP|1' ? 'Lugar (SP)' : undefined) });
    expect(ag).toMatchObject({ race: 'pres', raceT1: 'pres-t1', geradoEm: 7, areasConcluidas: 1, areasTotal: 2, somas: [20, 10] });
    expect(ag.onde[0][0]).toMatchObject({ chave: 'SP|1', nome: 'Lugar (SP)', votos: 20 }); // 13 cresceu mais ali
    const r = desdePrimeiroTurno({ race, raceT1, t2: area([1, 1], 1), t1: { votos: [1, 1, 1] }, agregado: ag });
    expect(r.base).toBe('parcial');
    expect(r.candidatos.map((c) => c.diferenca)).toEqual([20, 10]);
  });
});
