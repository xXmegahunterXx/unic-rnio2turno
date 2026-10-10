import { describe, expect, it } from 'vitest';
import { AFIRMACOES, AFIRMACAO_POR_ID, calcularSintonia, ordemDoTeste, TEMAS, type Resposta } from '@/app/content/afirmacoes';
import { caminhoResultado, decodificar } from './codigo';
import {
  conjuntoRespondido,
  contarPuladas,
  equilibrioDe,
  minutosEstimados,
  N_RAPIDO,
  OPCOES_ESCALA,
  ordemQuiz,
  segundosRestantes,
  selecaoEquilibrada,
  selecaoRapida,
  selecoesRapidas,
  textoRestante,
} from './sintonia';

describe('escala na ordem de exibição', () => {
  it('vai de "Discordo totalmente" (esquerda, tecla 1) a "Concordo totalmente" (direita, tecla 5)', () => {
    expect(OPCOES_ESCALA.map((o) => o.valor)).toEqual([-2, -1, 0, 1, 2]);
    expect(OPCOES_ESCALA[0].rotulo).toBe('Discordo totalmente');
    expect(OPCOES_ESCALA[4].rotulo).toBe('Concordo totalmente');
  });
});

describe('tempo estimado', () => {
  it('24 afirmações ≈ 3 min; 12 ≈ 2 min; mínimo 1', () => {
    expect(minutosEstimados(24)).toBe(3);
    expect(minutosEstimados(12)).toBe(2);
    expect(minutosEstimados(1)).toBe(1);
  });
  it('usa o ritmo da pessoa (mediana, limitada a 3–20 s) a partir de 3 respostas', () => {
    expect(segundosRestantes(10)).toBe(75); // padrão 7,5 s
    expect(segundosRestantes(10, [4000, 4000])).toBe(75); // poucas amostras: padrão
    expect(segundosRestantes(10, [4000, 5000, 60000])).toBe(50); // mediana 5 s (ignora a pausa longa)
    expect(segundosRestantes(10, [500, 600, 700])).toBe(30); // piso de 3 s
    expect(segundosRestantes(2, [90000, 90000, 90000])).toBe(40); // teto de 20 s
    expect(segundosRestantes(0, [5000, 5000, 5000])).toBe(0);
  });
  it('texto honesto', () => {
    expect(textoRestante(0)).toBe('');
    expect(textoRestante(30)).toBe('menos de 1 min');
    expect(textoRestante(75)).toBe('≈ 1 min');
    expect(textoRestante(170)).toBe('≈ 3 min');
  });
});

describe('modo rápido', () => {
  it('há seleções equilibradas e todas cobrem os 12 temas, uma afirmação cada', () => {
    const todas = selecoesRapidas();
    expect(todas.length).toBeGreaterThan(50);
    for (const ids of todas) {
      expect(ids).toHaveLength(N_RAPIDO);
      const temas = new Set(ids.map((id) => AFIRMACAO_POR_ID[id].tema));
      expect(temas.size).toBe(TEMAS.length);
      expect(selecaoEquilibrada(equilibrioDe(ids.map((id) => AFIRMACAO_POR_ID[id])))).toBe(true);
    }
  });

  it('equilíbrio: concordar aproxima dos dois por igual (±1) e os dois têm a mesma base de cálculo (±1)', () => {
    for (const seed of [0, 1, 7, 12345, 60466175, 999999]) {
      const e = equilibrioDe(selecaoRapida(seed).map((id) => AFIRMACAO_POR_ID[id]));
      expect(Math.abs(e.ladoDoConcordo[13] - e.ladoDoConcordo[22])).toBeLessThanOrEqual(1);
      expect(Math.abs(e.comPosicao[13] - e.comPosicao[22])).toBeLessThanOrEqual(1);
      expect(Math.abs(e.opostas[13] - e.opostas[22])).toBeLessThanOrEqual(1);
      expect(e.controles).toBeLessThanOrEqual(1);
    }
  });

  it('é determinístico pela semente e varia entre sementes', () => {
    expect(selecaoRapida(4242)).toEqual(selecaoRapida(4242));
    const distintas = new Set(Array.from({ length: 40 }, (_, i) => selecaoRapida(i * 7919).join(',')));
    expect(distintas.size).toBeGreaterThan(10);
  });

  it('a ordem do quiz rápido é a das 12, embaralhada pela semente; sem ids, as 24', () => {
    const ids = selecaoRapida(777);
    const ordem = ordemQuiz(777, ids);
    expect(ordem.map((a) => a.id).sort()).toEqual([...ids].sort());
    expect(ordemQuiz(777, ids).map((a) => a.id)).toEqual(ordem.map((a) => a.id));
    expect(ordemQuiz(777).map((a) => a.id)).toEqual(ordemDoTeste(777).map((a) => a.id));
    expect(ordemQuiz(777, AFIRMACOES.map((a) => a.id))).toHaveLength(24);
  });

  it('cabe no código atual: as de fora viram "não respondida" e ficam fora da conta (mesma fórmula)', () => {
    const ids = selecaoRapida(31337);
    const escala: Resposta[] = [2, -1, 0, 1, -2, 'pular'];
    const respostas = Object.fromEntries(ids.map((id, i) => [id, escala[i % escala.length]]));
    const d = decodificar(caminhoResultado(31337, respostas, [ids[0]]).split('#')[1])!;
    expect(d.respostas).toEqual(respostas);
    expect(conjuntoRespondido(d.respostas)).toEqual({ rapido: true, ids });
    expect(contarPuladas(d.respostas, ids)).toBe(2);
    // Mesma conta que calcular só com as 12 afirmações.
    const so12 = calcularSintonia(d.respostas, d.importantes, AFIRMACOES.filter((a) => ids.includes(a.id)));
    const r = calcularSintonia(d.respostas, d.importantes);
    expect(r[13]).toBe(so12[13]);
    expect(r[22]).toBe(so12[22]);
    expect(r.consideradas).toEqual(so12.consideradas);
  });

  it('teste completo (todas com resposta ou "pular") não é modo rápido', () => {
    const todas = Object.fromEntries(AFIRMACOES.map((a, i) => [a.id, i % 5 === 0 ? 'pular' : 1])) as Record<string, Resposta>;
    expect(conjuntoRespondido(todas).rapido).toBe(false);
    expect(conjuntoRespondido(todas).ids).toHaveLength(24);
    expect(conjuntoRespondido({}).rapido).toBe(false);
  });
});
