import { describe, expect, it } from 'vitest';
import type { Race, Tally } from '@/shared/types';
import { baseFinalistas, legendaModo, rotuloApurado, valorModo } from './mapModes';

const race = {
  candidatos: [
    { numero: 10, nomeUrna: 'A', nome: 'A', partido: 'X', cor: 'a' },
    { numero: 20, nomeUrna: 'B', nome: 'B', partido: 'Y', cor: 'b' },
  ],
} as Pick<Race, 'candidatos'>;

const t = (v0: number, v1: number, tot = 50, sec = 100): Tally => ({
  secoes: sec,
  secoesTotalizadas: tot,
  eleitorado: 1000,
  eleitoradoTotalizado: 500,
  comparecimento: 400,
  abstencao: 100,
  votos: [v0, v1],
  brancos: 0,
  nulos: 0,
});

describe('valorModo', () => {
  it('sem seções totalizadas → pendente em todos os modos', () => {
    for (const m of ['vencedor', 'margem', 'apurado', 'comparecimento', 'variacao'] as const) {
      expect(valorModo(m, t(0, 0, 0), { race }).pendente).toBe(true);
      expect(valorModo(m, undefined, { race }).pendente).toBe(true);
    }
  });

  it('vencedor: cor do líder com intensidade pelo bucket de margem (só tokens, nunca hex)', () => {
    const fraco = valorModo('vencedor', t(51, 49), { race });
    const forte = valorModo('vencedor', t(80, 20), { race });
    expect(fraco.fill).toMatch(/^rgb\(var\(--cand-a\)/);
    expect(forte.fill).toBe('rgb(var(--cand-a))');
    expect(valorModo('vencedor', t(30, 70), { race }).fill).toMatch(/--cand-b/);
    expect(fraco.fill).not.toMatch(/#/);
    expect(fraco.rotulo).toBe('51,0%');
  });

  it('margem e variação são divergentes (sinal escolhe o slot)', () => {
    expect(valorModo('margem', t(40, 60), { race }).fill).toMatch(/--cand-b/);
    expect(valorModo('margem', t(60, 40), { race }).valor).toBeCloseTo(20);
    // 1º turno: A tinha 45% entre os finalistas; agora 50% → +5 p.p.
    const v = valorModo('variacao', t(50, 50), { race, primeiroTurno: { votos: [45, 55, 30] } });
    expect(v.valor).toBeCloseTo(5);
    expect(v.fill).toMatch(/--cand-a/);
    expect(valorModo('variacao', t(50, 50), { race }).pendente).toBe(true);
  });

  it('% apurado nunca arredonda para 100% antes do fim', () => {
    expect(rotuloApurado(99.96)).toBe('99%');
    expect(rotuloApurado(4.27)).toBe('4,2%');
    expect(valorModo('apurado', t(1, 1, 100, 100), { race }).rotulo).toBe('100%');
  });

  it('base do 1º turno usa só os dois finalistas', () => {
    expect(baseFinalistas({ votos: [30, 70, 1000] })).toBeCloseTo(30);
    expect(baseFinalistas(null)).toBeNull();
  });

  it('legendas trazem o nome dos candidatos (identidade nunca só pela cor)', () => {
    const l = legendaModo('vencedor', race);
    expect(l.tipo).toBe('buckets');
    if (l.tipo === 'buckets') expect(l.linhas.map((x) => x.nome)).toEqual(['A', 'B']);
    const m = legendaModo('margem', race);
    if (m.tipo === 'escala') expect(m.polos?.direita.nome).toBe('A');
  });
});
