import { describe, expect, it } from 'vitest';
import { PROPOSTAS, TEMAS, embaralhar, rodadas, validarPropostas } from './propostas';

describe('conteúdo do Teste Cego', () => {
  it('passa na autoverificação editorial (sem pistas de autoria, 12 × 12, fontes https)', () => {
    expect(validarPropostas()).toEqual([]);
  });

  it('tem 24 propostas, uma de cada candidato por tema', () => {
    expect(PROPOSTAS).toHaveLength(24);
    for (const t of TEMAS) {
      const doTema = PROPOSTAS.filter((p) => p.tema === t.id);
      expect(doTema.map((p) => p.autor).sort()).toEqual([13, 22]);
    }
  });

  it('ids neutros: não contêm o número do candidato', () => {
    for (const p of PROPOSTAS) expect(p.id).not.toMatch(/13|22/);
  });

  it('a fonte aponta para uma página do PDF e traz o trecho literal', () => {
    for (const p of PROPOSTAS) {
      expect(p.fonte.url).toMatch(/#page=\d+$/);
      expect(p.fonte.trecho.length).toBeGreaterThan(20);
      expect(p.fonte.pagina).toMatch(/^p\. \d+/);
    }
  });

  it('validarPropostas detecta pista de autoria', () => {
    const ruim = PROPOSTAS.map((p, i) => (i === 0 ? { ...p, texto: 'Ampliar o Bolsa Família para todas as famílias.' } : p));
    expect(validarPropostas(ruim).some((e) => e.includes('pista de autoria'))).toBe(true);
  });

  it('embaralhar e rodadas são determinísticos pela semente', () => {
    expect(embaralhar(42).map((p) => p.id)).toEqual(embaralhar(42).map((p) => p.id));
    expect(embaralhar('abc').map((p) => p.id)).not.toEqual(embaralhar('abd').map((p) => p.id));
    const a = rodadas(123456);
    const b = rodadas(123456);
    expect(a.map((r) => [r.tema.id, r.opcoes[0].id, r.opcoes[1].id])).toEqual(b.map((r) => [r.tema.id, r.opcoes[0].id, r.opcoes[1].id]));
    expect(new Set(a.map((r) => r.tema.id)).size).toBe(12);
    for (const r of a) expect(r.opcoes.map((p) => p.autor).sort()).toEqual([13, 22]);
  });

  it('o lado de cada candidato varia entre as rodadas (sem padrão fixo de posição)', () => {
    let primeiro13 = 0;
    let total = 0;
    for (let s = 0; s < 200; s++) {
      for (const r of rodadas(s)) {
        total++;
        if (r.opcoes[0].autor === 13) primeiro13++;
      }
    }
    const frac = primeiro13 / total;
    expect(frac).toBeGreaterThan(0.45);
    expect(frac).toBeLessThan(0.55);
  });
});
