import { describe, expect, it } from 'vitest';
import { AFIRMACOES, calcularSintonia } from '@/app/content/afirmacoes';
import type { Candidate } from '@/shared/types';
import { LIMITE_TEXTO } from '@/app/components/share/textos';
import { pesoPostX, pesoTextoX, LIMITE_X } from '@/app/lib/share';
import { HASHTAGS_TESTE, textoConviteDuelo, textoDesafio, textoDuelo, textoMeuResultado } from './textosTeste';

const CANDS: Candidate[] = [
  { numero: 13, nomeUrna: 'Lula', nome: 'Luiz Inácio Lula da Silva', partido: 'PT', cor: 'a' },
  { numero: 22, nomeUrna: 'Flávio Bolsonaro', nome: 'Flávio Nantes Bolsonaro', partido: 'PL', cor: 'b' },
];
const respostas = Object.fromEntries(AFIRMACOES.map((a, i) => [a.id, ([2, 1, 0, -1, -2] as const)[i % 5]]));
const r = calcularSintonia(respostas);

const PROIBIDAS = /vence|ganh|vitória|derrot|melhor candidato|vote|votar em|esmagador|lidera/i;

describe('textos do Teste Cego', () => {
  const todos = [textoDesafio(24), textoMeuResultado(CANDS, r), textoMeuResultado(CANDS, r, true), textoDuelo(17, 24, 70.8), textoDuelo(0, 0, null), textoConviteDuelo(24), textoConviteDuelo(12)];

  it('cabem no limite do kit e no post do X com link e hashtags', () => {
    for (const t of todos) {
      expect(pesoTextoX(t)).toBeLessThanOrEqual(LIMITE_TEXTO);
      expect(pesoPostX(t, HASHTAGS_TESTE, true)).toBeLessThanOrEqual(LIMITE_X);
      expect(t.endsWith('…')).toBe(false); // nenhum precisou de corte
    }
  });

  it('são neutros: sem torcida, sem "vence", sem pedir voto; sem URL e sem marca de simulação', () => {
    for (const t of todos) {
      expect(t).not.toMatch(PROIBIDAS);
      expect(t).not.toMatch(/https?:\/\//);
      expect(t).not.toMatch(/SIMULAÇÃO/);
    }
  });

  it('desafio não revela resultado nem candidatos', () => {
    const t = textoDesafio(24);
    expect(t).toContain('24 afirmações');
    expect(t).not.toMatch(/Lula|Flávio|13|22|%/);
  });

  it('meu resultado: os dois na ordem da urna e no mesmo formato, com o aviso', () => {
    const t = textoMeuResultado(CANDS, r);
    const i13 = t.indexOf('Lula (13)');
    const i22 = t.indexOf('Flávio Bolsonaro (22)');
    expect(i13).toBeGreaterThan(-1);
    expect(i22).toBeGreaterThan(i13);
    expect(t).toMatch(/Lula \(13\) \d+%/);
    expect(t).toMatch(/Flávio Bolsonaro \(22\) \d+%/);
    expect(t).toContain('Não é pesquisa nem recomendação de voto');
    expect(textoMeuResultado(CANDS, r, true)).toContain('modo rápido');
  });

  it('meu resultado: rótulo provisório (nomes ainda carregando) não repete o número', () => {
    const prov: Candidate[] = [
      { numero: 13, nomeUrna: 'Nº 13', nome: 'Candidatura nº 13', partido: '', cor: 'a' },
      { numero: 22, nomeUrna: 'Nº 22', nome: 'Candidatura nº 22', partido: '', cor: 'b' },
    ];
    const t = textoMeuResultado(prov, r);
    expect(t).toMatch(/Nº 13 \d+% · Nº 22 \d+%/);
    expect(t).not.toContain('(13)');
  });

  it('meu resultado: "sem base" quando não há cálculo', () => {
    const vazio = calcularSintonia({});
    expect(textoMeuResultado(CANDS, vazio)).toContain('Lula (13) sem base');
  });

  it('duelo: só o placar entre as duas pessoas (nada de candidato)', () => {
    const t = textoDuelo(17, 24, 70.8);
    expect(t).toContain('concordamos em 17 de 24 afirmações');
    expect(t).toContain('afinidade de 71%');
    expect(t).not.toMatch(/Lula|Flávio|sintonia com/);
    expect(textoDuelo(1, 1, 100)).toContain('1 de 1 afirmação');
  });
});
