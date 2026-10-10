/** Barra A | B (| Outros) desenhada só com transform (desempenho na apuração ao vivo): posições e tamanhos. */
import { describe, expect, it } from 'vitest';
import { segmentos } from './VoteSplitBar';

/** Lê "translateX(calc(X% + Ypx)) scaleX(F)" → { x, px, f }. */
function ler(t: string) {
  const m = /translateX\(calc\(([\d.]+)% \+ (\d+)px\)\) scaleX\(([\d.]+)\)/.exec(t);
  if (!m) throw new Error(`transform inesperado: ${t}`);
  return { x: Number(m[1]), px: Number(m[2]), f: Number(m[3]) };
}

describe('segmentos (VoteSplitBar)', () => {
  it('2 candidatos: A da esquerda, B logo depois do vão de 2px, frações somando 1', () => {
    const s = segmentos([0, 1], [48.99, 51.01]);
    expect(s.map((x) => x.i)).toEqual([0, 1]);
    expect(s[0].largura).toBe('calc(100% - 2px)');
    const [a, b] = s.map((x) => ler(x.transform));
    expect(a).toEqual({ x: 0, px: 0, f: 0.4899 });
    expect(b.x).toBeCloseTo(48.99, 5);
    expect(b.px).toBe(2);
    expect(a.f + b.f).toBeCloseTo(1, 6);
  });

  it('1º turno com Outros no meio: três segmentos contíguos, dois vãos', () => {
    // ordem visual [A, Outros, B]
    const s = segmentos([0, 2, 1], [45.16, 47.03, 7.81]);
    expect(s[0].largura).toBe('calc(100% - 4px)');
    const [a, o, b] = s.map((x) => ler(x.transform));
    expect(o.x).toBeCloseTo(a.f * 100, 4);
    expect(o.px).toBe(2);
    expect(b.x).toBeCloseTo((a.f + o.f) * 100, 4);
    expect(b.px).toBe(4);
    expect(o.f).toBeCloseTo(0.0781, 4);
  });

  it('sem votos ou valores inválidos não gera NaN', () => {
    for (const s of [segmentos([0, 1], [0, 0]), segmentos([0, 1], [Number.NaN, -3])]) {
      for (const x of s) expect(x.transform).not.toMatch(/NaN|Infinity/);
    }
    expect(ler(segmentos([0, 1], [0, 0])[1].transform).f).toBeCloseTo(0.5, 6);
  });
});
