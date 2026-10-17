/**
 * Rótulo da capital no mapa da UF (UfMap): nunca sai pela borda do quadro (visto na /tv?uf=pe em 390 px: "Recif" cortado).
 */
import { describe, expect, it } from 'vitest';
import { deslocarRotulo } from './UfMap';

describe('deslocarRotulo', () => {
  const W = 360;
  const meia = (t: string) => (t.length * 11.5 * 0.58) / 2 + 4;

  it('longe das bordas: não desloca', () => {
    expect(deslocarRotulo(180, 'Recife', 11.5, W)).toBe(0);
  });

  it('perto da borda direita: puxa para dentro até caber', () => {
    const dx = deslocarRotulo(355, 'Recife', 11.5, W);
    expect(dx).toBeLessThan(0);
    expect(355 + dx + meia('Recife')).toBeCloseTo(W, 5);
  });

  it('perto da borda esquerda: empurra para dentro', () => {
    const dx = deslocarRotulo(3, 'Rio Branco', 11.5, W);
    expect(dx).toBeGreaterThan(0);
    expect(3 + dx - meia('Rio Branco')).toBeCloseTo(0, 5);
  });

  it('quadro mais estreito que o rótulo: centraliza', () => {
    expect(deslocarRotulo(10, 'Fernando de Noronha', 11.5, 60)).toBe(30 - 10);
  });
});
