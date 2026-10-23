import { describe, expect, it } from 'vitest';
import { pesoPostX, pesoTextoX } from '@/app/lib/share';
import { validaPesquisa, type Pesquisa } from '@/shared/pesquisas';
import { textoPesquisa } from './textos';

// Dados de TESTE (fictícios).
const p = (o: Record<string, unknown> = {}): Pesquisa => {
  const r = validaPesquisa({
    cargo: 'pres',
    instituto: 'Instituto Fictício',
    contratante: 'Veículo Fictício',
    registro: 'BR-09001/2026',
    coletaInicio: '2026-10-14',
    coletaFim: '2026-10-16',
    divulgadaEm: '2026-10-17',
    entrevistas: 2004,
    margemPp: 2,
    confiancaPct: 95,
    totais: { '13': 45.5, '22': 44, brancosNulos: 6, indecisos: 4 },
    fontes: ['https://exemplo.com.br/x'],
    ...o,
  });
  if (!('ok' in r)) throw new Error(r.erro);
  return r.ok;
};
const cands = [
  { numero: 13, nome: 'Ana' },
  { numero: 22, nome: 'Bia' },
];

describe('texto de compartilhar da pesquisa', () => {
  it('leva o placar na ordem da urna e TODAS as informações obrigatórias', () => {
    const t = textoPesquisa(p(), cands);
    expect(t).toMatch(/^Pesquisa Instituto Fictício \(Presidente, 2º turno\), votos totais: Ana 45,5% × Bia 44%\./);
    for (const x of ['Registro BR-09001/2026', 'contratante: Veículo Fictício', 'coleta 14 a 16/10', '2.004 entrevistas', 'margem ±2 p.p.', 'confiança 95%']) expect(t).toContain(x);
    expect(pesoTextoX(t)).toBeLessThanOrEqual(250);
    expect(t).toContain('Pesquisa não é resultado.');
  });
  it('aviso exigido pela Justiça Eleitoral vai junto dos números', () => {
    const t = textoPesquisa(p({ aviso: 'Todas as perguntas aplicadas foram estimuladas.' }), cands);
    expect(t).toContain('confiança 95%. Todas as perguntas aplicadas foram estimuladas.');
    expect(pesoPostX(t, [], true)).toBeLessThanOrEqual(280);
  });
  it('nunca corta informação obrigatória: com nomes longos, sai só o aviso final', () => {
    const t = textoPesquisa(p({ contratante: 'Associação Fictícia de Veículos de Comunicação de Algum Lugar Muito Distante' }), cands);
    expect(t).toContain('Associação Fictícia de Veículos de Comunicação de Algum Lugar Muito Distante');
    expect(t).toContain('confiança 95%');
    expect(t).not.toContain('…');
    expect(pesoPostX(t, [], true)).toBeLessThanOrEqual(280);
  });
  it('sempre cabe no X com o link (a intenção do X nunca corta a informação obrigatória)', () => {
    const longo = 'Federação Fictícia das Indústrias e do Comércio de Algum Estado Muito Distante Ltda.';
    const nomes = [
      { numero: 13, nome: 'Professora Fictícia de Tal' },
      { numero: 22, nome: 'Vicentinho Fictício Júnior' },
    ];
    for (const contratante of ['Veículo', 'Federação Fictícia das Indústrias do Estado', longo, `${longo} ${longo}`.slice(0, 160)]) {
      const t = textoPesquisa(p({ contratante, totais: { '13': 40.45, '22': 52.55, brancosNulos: 4.1, indecisos: 2.9 }, margemPp: 2.83, confiancaPct: 95.45 }), nomes);
      expect(pesoPostX(t, [], true), t).toBeLessThanOrEqual(280);
      expect(t).not.toContain('…');
      // com número, sempre TODAS as informações; sem caber, nenhum número (remete ao link)
      if (t.includes('40,45%')) {
        for (const x of ['BR-09001/2026', contratante, 'coleta 14 a 16/10', '2.004 entrev', '±2,83 p.p.', 'confiança 95,45%']) expect(t, t).toContain(x);
      } else {
        expect(t).toMatch(/registro BR-09001\/2026: os números e todas as informações exigidas pelo TSE estão no link\.$/);
        expect(t).not.toMatch(/\d%/);
      }
    }
  });
});
