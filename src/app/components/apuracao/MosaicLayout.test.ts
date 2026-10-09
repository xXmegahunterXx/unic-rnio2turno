import { describe, expect, it } from 'vitest';
import { cellPos, hitMosaico, layoutMosaico } from './MosaicLayout';

const zonasGrandes = Array.from({ length: 57 }, (_, i) => ({ zona: i + 1, n: 300 + ((i * 97) % 420) }));

describe('layoutMosaico', () => {
  it('coloca todas as seções sem sobreposição de blocos', () => {
    const l = layoutMosaico(zonasGrandes, 1100, { alturaAlvo: 800 });
    expect(l.blocks).toHaveLength(57);
    for (const b of l.blocks) {
      expect(b.cols * Math.ceil(b.n / b.cols)).toBeGreaterThanOrEqual(b.n);
      expect(b.x + b.w).toBeLessThanOrEqual(l.width + 0.5);
    }
    for (let i = 0; i < l.blocks.length; i++)
      for (let j = i + 1; j < l.blocks.length; j++) {
        const a = l.blocks[i];
        const c = l.blocks[j];
        const sobrepoe = a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
        expect(sobrepoe).toBe(false);
      }
  });

  it('mantém a ordem de leitura das zonas (esquerda → direita, cima → baixo)', () => {
    for (const largura of [358, 720, 1100]) {
      const l = layoutMosaico(zonasGrandes, largura, { alturaAlvo: 800 });
      for (let i = 1; i < l.blocks.length; i++) {
        const a = l.blocks[i - 1];
        const b = l.blocks[i];
        expect(b.zona).toBeGreaterThan(a.zona);
        expect(b.y > a.y || (b.y === a.y && b.x > a.x)).toBe(true);
      }
    }
  });

  it('usa células grandes para municípios pequenos e o mínimo legível para ~26 mil seções', () => {
    const pequeno = layoutMosaico([{ zona: 31, n: 30 }], 358);
    expect(pequeno.pitch).toBeGreaterThanOrEqual(14);
    const grande = layoutMosaico(zonasGrandes, 358, { alturaAlvo: 700 });
    expect(grande.pitch).toBe(3);
    expect(grande.cell).toBeGreaterThanOrEqual(2);
  });

  it('hitMosaico e cellPos são inversos', () => {
    const l = layoutMosaico(zonasGrandes.slice(0, 6), 600);
    const b = l.blocks[3];
    for (const i of [0, 1, b.cols, b.n - 1]) {
      const p = cellPos(l, b, i);
      const h = hitMosaico(l, p.x + l.cell / 2, p.y + l.cell / 2);
      expect(h?.block.zona).toBe(b.zona);
      expect(h?.i).toBe(i);
    }
    // rótulo da zona não é seção
    expect(hitMosaico(l, b.x + 2, b.y + 2)).toBeNull();
  });
});
