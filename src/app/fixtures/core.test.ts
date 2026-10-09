import { describe, expect, it } from 'vitest';
import { coreFixtures, INSTANTES } from './core';
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import type { Tally } from '@/shared/types';

const soma = (ts: Tally[], k: keyof Tally) => ts.reduce((a, t) => a + (t[k] as number), 0);

describe('fixtures do kit (core)', () => {
  for (const i of INSTANTES) {
    describe(`instante ${i}`, () => {
      const f = coreFixtures(i);
      const br = f.nacional.resumo;
      const ufs = Object.values(f.nacional.ufs) as Tally[];

      it('soma das UFs (+ ZZ) = Brasil', () => {
        for (const k of ['secoes', 'secoesTotalizadas', 'eleitorado', 'comparecimento', 'brancos', 'nulos'] as const) {
          expect(soma(ufs, k)).toBe(br[k]);
        }
        expect(ufs.reduce((a, u) => a + u.votos[0], 0)).toBe(br.votos[0]);
        expect(ufs.reduce((a, u) => a + u.votos[1], 0)).toBe(br.votos[1]);
      });

      it('soma dos municípios = UF (RJ) e bate com o nacional', () => {
        const m = f.uf.municipios;
        expect(soma(m, 'comparecimento')).toBe(f.uf.resumo.comparecimento);
        expect(m.reduce((a, x) => a + x.votos[0], 0)).toBe(f.uf.resumo.votos[0]);
        expect(f.nacional.ufs.RJ!.votos).toEqual(f.uf.resumo.votos);
      });

      it('zonas somam o município e seções somam a zona', () => {
        const rio = f.uf.municipios[0];
        expect(soma(f.zonasRio, 'comparecimento')).toBe(rio.comparecimento);
        expect(f.zonasRio.reduce((a, z) => a + z.votos[0] + z.votos[1], 0)).toBe(validos(rio));
        expect(f.zona.secoes.reduce((a, s) => a + s.comparecimento, 0)).toBe(f.zona.resumo.comparecimento);
      });

      it('votos + brancos + nulos = comparecimento; % válidos somam 100', () => {
        for (const t of [br, ...ufs, ...f.uf.municipios]) {
          expect(validos(t) + t.brancos + t.nulos).toBe(t.comparecimento);
        }
        if (validos(br) > 0) expect(pctValidos(br, 0) + pctValidos(br, 1)).toBeCloseTo(100, 9);
      });

      it('% de seções do instante', () => {
        expect(pctTotalizadas(br)).toBeCloseTo(i, 0);
      });
    });
  }

  it('100% tem eleito e status encerrada; 0% aguardando', () => {
    expect(coreFixtures(100).nacional.resumo.eleito).not.toBeNull();
    expect(coreFixtures(100).nacional.resumo.status).toBe('encerrada');
    expect(coreFixtures(0).nacional.resumo.status).toBe('aguardando');
  });
});
