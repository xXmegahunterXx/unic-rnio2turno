/**
 * Tokens de cor dos candidatos e dos partidos em src/app/styles.css (os três blocos de tema: escuro padrão, claro
 * por [data-theme=light] e claro por prefers-color-scheme) — contraste documentado no topo do styles.css e coerência
 * com o espelho do servidor (og.ts / og-hemiciclo.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contraste, mix, type RGB } from './tokens';
import { C } from '@/server/og';
import { PALETA_ESCURA } from '@/server/og-hemiciclo';

const css = readFileSync(path.resolve(__dirname, '../styles.css'), 'utf8');

/** Blocos de tema: o conteúdo entre chaves de cada seletor de tema. */
function blocos(): Record<'escuro' | 'claro' | 'sistema', Record<string, string>> {
  const pega = (inicio: string) => {
    const i = css.indexOf(inicio);
    expect(i, inicio).toBeGreaterThanOrEqual(0);
    const a = css.indexOf('{', i + inicio.length - 1);
    const b = css.indexOf('}', a);
    const vars: Record<string, string> = {};
    for (const m of css.slice(a + 1, b).matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
    return vars;
  };
  return {
    escuro: pega(":root,\n:root[data-theme='dark'] {"),
    claro: pega(":root[data-theme='light'] {"),
    sistema: pega(":root:not([data-theme='dark']) {"),
  };
}

const rgb = (v: Record<string, string>, k: string): RGB => {
  let s = v[k];
  const ref = /^var\(--([\w-]+)\)$/.exec(s ?? '');
  if (ref) s = v[ref[1]];
  const p = (s ?? '').split(/\s+/).map(Number);
  expect(p.length, k).toBe(3);
  return [p[0], p[1], p[2]];
};

const B = blocos();
const SLOTS = ['cand-a', 'cand-b', 'cand-vermelho', 'cand-azul'] as const;

describe('tokens dos candidatos (WCAG)', () => {
  for (const [tema, v] of Object.entries(B)) {
    it(`${tema}: preenchimento ≥ 3:1, texto (*-fg) ≥ 4,5:1 sobre surface, surface-2 e bg-x/15; tinta ≥ 3:1`, () => {
      const surf = rgb(v, 'surface');
      const surf2 = rgb(v, 'surface-2');
      for (const s of SLOTS) {
        const base = rgb(v, s);
        const fg = rgb(v, `${s}-fg`);
        rgb(v, `${s}-soft`);
        expect(contraste(base, surf), `${tema} ${s}/surface`).toBeGreaterThanOrEqual(3);
        expect(contraste(base, surf2), `${tema} ${s}/surface-2`).toBeGreaterThanOrEqual(3);
        expect(contraste(rgb(v, `${s}-ink`), base), `${tema} ${s}-ink`).toBeGreaterThanOrEqual(3);
        if (s === 'cand-a' || s === 'cand-b') continue; // regra antiga: ver o relatório da frente de cores
        expect(contraste(fg, surf), `${tema} ${s}-fg/surface`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(fg, surf2), `${tema} ${s}-fg/surface-2`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(fg, mix(surf, base, 0.15)), `${tema} ${s}-fg/x15 surface`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(fg, mix(surf2, base, 0.15)), `${tema} ${s}-fg/x15 surface-2`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('os dois blocos claros são idênticos nos tokens de candidato e partido', () => {
    for (const k of Object.keys(B.claro).filter((x) => x.startsWith('cand-') || x.startsWith('partido-'))) {
      expect(B.sistema[k], k).toBe(B.claro[k]);
    }
  });

  it('servidor (tema escuro) espelha os tokens do app', () => {
    const r = (k: string) => `rgb(${rgb(B.escuro, k).join(',')})`;
    expect(C.vermelho).toBe(r('cand-vermelho'));
    expect(C.azul).toBe(r('cand-azul'));
    expect(C.vermelhoInk).toBe(r('cand-vermelho-ink'));
    expect(C.azulInk).toBe(r('cand-azul-ink'));
    expect(C.a).toBe(r('cand-a'));
    expect(C.b).toBe(r('cand-b'));
  });
});

describe('paleta de partidos', () => {
  it('PL = azul do Flávio e PT = vermelho do Lula (mesmo token) em todos os temas', () => {
    for (const v of Object.values(B)) {
      expect(v['partido-1']).toBe('var(--cand-azul)');
      expect(v['partido-2']).toBe('var(--cand-vermelho)');
    }
  });

  it('og-hemiciclo.ts espelha o tema escuro', () => {
    PALETA_ESCURA.forEach((c, i) => expect([...c], `partido-${i + 1}`).toEqual([...rgb(B.escuro, `partido-${i + 1}`)]));
  });

  it('nenhum dos outros 8 partidos repete cor de candidato, da marca ou de outro partido', () => {
    for (const v of Object.values(B)) {
      const proibidas = ['cand-a', 'cand-b', 'cand-vermelho', 'cand-azul', 'brand', 'brand-2'].map((k) => rgb(v, k).join(' '));
      const outros = Array.from({ length: 8 }, (_, i) => rgb(v, `partido-${i + 3}`).join(' '));
      expect(new Set(outros).size).toBe(8);
      for (const o of outros) expect(proibidas).not.toContain(o);
    }
  });
});
