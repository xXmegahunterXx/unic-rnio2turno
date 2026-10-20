import { describe, expect, it } from 'vitest';
import { pesoTextoX } from '@/app/lib/share';
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
  it('nunca corta informação obrigatória: com nomes longos, sai só o aviso final', () => {
    const t = textoPesquisa(p({ contratante: 'Associação Fictícia de Veículos de Comunicação de Algum Lugar Muito Distante' }), cands);
    expect(t).toContain('Associação Fictícia de Veículos de Comunicação de Algum Lugar Muito Distante');
    expect(t).toContain('confiança 95%');
    expect(t).not.toContain('…');
  });
});
