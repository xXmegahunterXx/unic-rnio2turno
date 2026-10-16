import { describe, expect, it } from 'vitest';
import type { LiveStatus } from '@/shared/types';
import { pollMs } from './hooks';

const base = { fase: 'apurando', pausado: false, congelado: false, velocidade: 1 } as unknown as LiveStatus;

describe('pollMs com o freio (I37) e município a 10 s (I04)', () => {
  it('ritmo normal', () => {
    expect(pollMs(base, 'br')).toBe(2500);
    expect(pollMs(base, 'uf')).toBe(4000);
    expect(pollMs(base, 'mun')).toBe(10_000);
    expect(pollMs(base, 'zona')).toBe(8000);
  });

  it('freio multiplica todos os níveis', () => {
    const st = { ...base, carga: { fator: 3 } } as LiveStatus;
    expect(pollMs(st, 'br')).toBe(7500);
    expect(pollMs(st, 'mun')).toBe(30_000);
    expect(pollMs({ ...base, fase: 'pre', carga: { fator: 2 } } as LiveStatus, 'br')).toBe(30_000);
    expect(pollMs({ ...base, frescor: {}, carga: { fator: 5, leve: true } } as LiveStatus, 'br')).toBe(30_000);
  });

  it('sem status não consulta', () => {
    expect(pollMs(undefined, 'br')).toBe(false);
  });
});
