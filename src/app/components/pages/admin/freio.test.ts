import { describe, expect, it } from 'vitest';
import { fracao5xx, sinaisDeAperto } from './freio';

describe('sinais de aperto (Monitor → Freio de carga)', () => {
  const calmo = { p99Ms: 40, erros5xx: 0, reqPorSeg: 300, eventLoopP99Ms: 12 };

  it('servidor calmo: nenhum sinal', () => {
    expect(sinaisDeAperto(calmo).some((s) => s.apertado)).toBe(false);
  });

  it('p99 acima de 1 s, 5xx acima de 1% e event loop acima de 300 ms', () => {
    const s = sinaisDeAperto({ p99Ms: 1200, erros5xx: 200, reqPorSeg: 100, eventLoopP99Ms: 450 });
    expect(s.map((x) => [x.id, x.apertado])).toEqual([
      ['p99', true],
      ['5xx', true],
      ['eventLoop', true],
    ]);
  });

  it('limites exatos ainda não contam', () => {
    const s = sinaisDeAperto({ p99Ms: 1000, erros5xx: 60, reqPorSeg: 100, eventLoopP99Ms: 300 });
    expect(s.every((x) => !x.apertado)).toBe(true);
  });

  it('5xx sem tráfego = 0; valores inválidos viram 0', () => {
    expect(fracao5xx({ erros5xx: 5, reqPorSeg: 0 })).toBe(0);
    expect(fracao5xx({ erros5xx: 6, reqPorSeg: 10 })).toBeCloseTo(0.01);
    const s = sinaisDeAperto({ p99Ms: Number.NaN, erros5xx: -1, reqPorSeg: Number.POSITIVE_INFINITY, eventLoopP99Ms: -5 });
    expect(s.every((x) => x.valor === 0 && !x.apertado)).toBe(true);
  });
});
