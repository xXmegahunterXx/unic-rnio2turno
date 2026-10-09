import { describe, expect, it } from 'vitest';
import { dexp, dlog, invNorm, logit, radixArgsort, sigmoid, upperBound } from '../mathx';
import { hashStr, seedKey, triple32, uni } from '../rng';
import { forEachFaixa } from '../structure';
import { decodeFaixas } from '../../shared/calc';

describe('matemática determinística', () => {
  it('dexp/dlog têm erro relativo ≤ 1e-15 frente ao Math nativo', () => {
    let maxE = 0;
    let maxL = 0;
    for (let i = 0; i < 20000; i++) {
      const x = -60 + (120 * i) / 20000 + 1e-7 * i;
      maxE = Math.max(maxE, Math.abs(dexp(x) / Math.exp(x) - 1));
      const y = Math.exp(-200 + (400 * i) / 20000);
      maxL = Math.max(maxL, Math.abs(dlog(y) - Math.log(y)) / Math.max(1, Math.abs(Math.log(y))));
    }
    expect(maxE).toBeLessThan(1e-15);
    expect(maxL).toBeLessThan(1e-15);
    expect(dexp(0)).toBe(1);
    expect(dlog(1)).toBe(0);
    expect(dexp(-1000)).toBe(0);
    expect(dexp(1000)).toBe(Infinity);
    expect(dlog(0)).toBe(-Infinity);
    expect(Number.isNaN(dlog(-1))).toBe(true);
    expect(dlog(1e-310)).toBeCloseTo(Math.log(1e-310), 10);
  });

  it('invNorm, sigmoid e logit', () => {
    expect(invNorm(0.5)).toBe(0);
    expect(invNorm(0.975)).toBeCloseTo(1.959964, 5);
    expect(invNorm(0.001)).toBeCloseTo(-3.090232, 5);
    expect(invNorm(0.3)).toBeCloseTo(-invNorm(0.7), 9);
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(logit(0.37))).toBeCloseTo(0.37, 12);
  });

  it('radixArgsort é estável e ordena chaves de 32 bits', () => {
    const n = 50000;
    const keys = new Uint32Array(n);
    for (let i = 0; i < n; i++) keys[i] = i % 7 === 0 ? 12345 : triple32(i) % (i % 3 === 0 ? 1000 : 4294967295);
    const ord = radixArgsort(keys);
    const ref = Array.from({ length: n }, (_, i) => i).sort((a, b) => keys[a] - keys[b] || a - b);
    expect(Array.from(ord)).toEqual(ref);
  });

  it('upperBound conta elementos ≤ x', () => {
    const a = Int32Array.from([1, 2, 2, 2, 5, 9]);
    expect(upperBound(a, 0)).toBe(0);
    expect(upperBound(a, 2)).toBe(4);
    expect(upperBound(a, 9)).toBe(6);
    expect(upperBound(a, 100)).toBe(6);
  });

  it('hashes são estáveis (mudar isto muda TODOS os números da simulação)', () => {
    expect(triple32(0)).toBe(0);
    // valores de referência fixos
    expect(triple32(123456789)).toBe(REF.t);
    expect(hashStr('mun:SP:71072')).toBe(REF.h);
    expect(seedKey(20261025)).toBe(REF.s);
    const u = uni(seedKey(1), triple32(42));
    expect(u > 0 && u < 1).toBe(true);
  });

  it('forEachFaixa decodifica igual a decodeFaixas', () => {
    for (const f of ['1', '1-3', '1-110,113-180,210', '5,7,9-12', '']) {
      const out: number[] = [];
      forEachFaixa(f, (n) => out.push(n));
      expect(out).toEqual(decodeFaixas(f));
    }
    expect(() => forEachFaixa('1;2', () => undefined)).toThrow();
  });
});

const REF = { t: 162129505, h: 521816766, s: 3478817873 };
