import { describe, expect, it } from 'vitest';
import { valorNoTrilho } from './trilho';

describe('valorNoTrilho', () => {
  it('mapeia a posição do dedo para 0–100 (esquerda → direita)', () => {
    expect(valorNoTrilho(100, 100, 200)).toBe(0);
    expect(valorNoTrilho(200, 100, 200)).toBe(50);
    expect(valorNoTrilho(300, 100, 200)).toBe(100);
    expect(valorNoTrilho(270, 100, 200)).toBe(85);
  });
  it('limita fora da trilha', () => {
    expect(valorNoTrilho(-50, 100, 200)).toBe(0);
    expect(valorNoTrilho(999, 100, 200)).toBe(100);
  });
  it('respeita min, max e passo (ex.: comparecimento −10…+10 de 1 em 1, ou de 5 em 5)', () => {
    expect(valorNoTrilho(150, 100, 100, -10, 10, 1)).toBe(0);
    expect(valorNoTrilho(100, 100, 100, -10, 10, 1)).toBe(-10);
    expect(valorNoTrilho(187, 100, 100, -10, 10, 5)).toBe(5);
    expect(valorNoTrilho(199, 100, 100, -10, 10, 5)).toBe(10);
  });
  it('trilha sem largura ou ponto inválido não quebra', () => {
    expect(valorNoTrilho(10, 0, 0, 0, 100)).toBe(0);
    expect(valorNoTrilho(Number.NaN, 0, 100, 0, 100)).toBe(0);
    expect(valorNoTrilho(50, 0, 100, 0, 100, 0)).toBe(50);
  });
});
