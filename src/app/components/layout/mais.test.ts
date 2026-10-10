import { describe, expect, it } from 'vitest';
import { MAIS } from './mais';
import { NAV, NAV_TAB, PREFIXOS_MAIS, ativoNoMais } from './nav';
import { caminhoDe, carregadorDe } from './prefetch';

describe('menu "Mais" e navegação', () => {
  const rotas = MAIS.flatMap((g) => g.itens.map((i) => i.to).filter((t): t is string => !!t));
  it('toda rota com destaque ativo no menu marca a aba "Mais" (PREFIXOS_MAIS em sincronia)', () => {
    for (const g of MAIS) for (const i of g.itens) if (i.to && i.match) expect(ativoNoMais(i.to)).toBe(true);
    for (const p of PREFIXOS_MAIS) expect(rotas).toContain(p);
  });
  it('rotas da tab bar não estão no "Mais"', () => {
    for (const n of NAV_TAB) expect(ativoNoMais(n.to)).toBe(false);
    expect(ativoNoMais('/')).toBe(false);
    expect(ativoNoMais('/apuracao/sp')).toBe(false);
  });
  it('Curiosidades e Cenários estão na navegação (header) e no "Mais"', () => {
    expect(NAV.some((n) => n.to === '/curiosidades')).toBe(true);
    expect(NAV.some((n) => n.to === '/cenarios')).toBe(true);
    expect(rotas).toEqual(expect.arrayContaining(['/curiosidades', '/cenarios', '/tv']));
  });
  it('ações de compartilhar e incorporar', () => {
    const acoes = MAIS.flatMap((g) => g.itens.map((i) => i.acao).filter(Boolean));
    expect(acoes).toEqual(expect.arrayContaining(['compartilhar', 'incorporar']));
  });
});

describe('prefetch', () => {
  it('normaliza o caminho', () => {
    expect(caminhoDe('/teste?s=abc')).toBe('/teste');
    expect(caminhoDe('/apuracao/sp/')).toBe('/apuracao/sp');
    expect(caminhoDe('')).toBe('/');
  });
  it('acha a página de cada rota da navegação, do "Mais" e das rotas de apuração', () => {
    for (const to of [...NAV.map((n) => n.to), ...MAIS.flatMap((g) => g.itens.map((i) => i.to).filter((t): t is string => !!t))]) {
      expect(carregadorDe(to), to).not.toBeNull();
    }
    for (const to of ['/', '/apuracao/sp', '/apuracao/sp/71072', '/apuracao/sp/71072/1/123', '/duelo/abc', '/teste/resultado']) {
      expect(carregadorDe(to), to).not.toBeNull();
    }
    expect(carregadorDe('/admin')).toBeNull();
  });
});
