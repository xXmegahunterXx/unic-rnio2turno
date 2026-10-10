import { describe, expect, it } from 'vitest';
import { anonimizarRace } from '@/shared/anon';
import { coreFixtures, RACE_PRES, RACE_PRES_T1, RESUMO_T1 } from '@/app/fixtures/core';
import { pesoPostX, pesoTextoX, xIntentUrl } from '@/app/lib/share';
import {
  HASHTAGS,
  LIMITE_TEXTO,
  PREFIXO_SIMULACAO,
  comPrefixoSimulacao,
  limitarTexto,
  placarEmTexto,
  textoCandidato,
  textoComposicao,
  textoGovernadores,
  textoInstante,
  textoMomento,
  textoMunicipioT1,
  textoPlacar,
  textoSecao,
  textoSenadoUf,
} from './textos';

const ANON = anonimizarRace(RACE_PRES);
const f35 = coreFixtures(35);
const f100 = coreFixtures(100);
const f0 = coreFixtures(0);

/** Palavras que não cabem num texto neutro. */
const PROIBIDAS = /vai ganhar|vitória|esmagador|derrota|virou o jogo|lavada|surra|favorito|torcida|imbat/i;

function conferir(t: string) {
  expect(pesoTextoX(t)).toBeLessThanOrEqual(LIMITE_TEXTO);
  expect(t).not.toMatch(/https?:\/\//);
  expect(t).not.toMatch(PROIBIDAS);
  expect(t).not.toMatch(/undefined|NaN|null/);
  // Cabe no X com o link (23) e as hashtags mais longas do kit.
  for (const tags of Object.values(HASHTAGS)) expect(pesoPostX(t, tags, true)).toBeLessThanOrEqual(280);
}

describe('prefixo e limite', () => {
  it('prefixa [SIMULAÇÃO] uma vez só', () => {
    expect(comPrefixoSimulacao('Placar', true)).toBe('[SIMULAÇÃO] Placar');
    expect(comPrefixoSimulacao('[SIMULAÇÃO] Placar', true)).toBe('[SIMULAÇÃO] Placar');
    expect(comPrefixoSimulacao('Placar', false)).toBe('Placar');
  });
  it('corta em palavra inteira', () => {
    const t = limitarTexto('palavra '.repeat(60));
    expect(pesoTextoX(t)).toBeLessThanOrEqual(LIMITE_TEXTO);
    expect(t.endsWith('palavra…')).toBe(true);
  });
});

describe('placar', () => {
  it('2º turno simulado e anônimo: prefixo, nomes do slot e % das seções', () => {
    const t = textoPlacar(ANON, f35.nacional.resumo, { simulado: true });
    conferir(t);
    expect(t.startsWith(PREFIXO_SIMULACAO)).toBe(true);
    expect(t).toContain('Candidato A');
    expect(t).toContain('Candidato B');
    expect(t).toContain(' × ');
    expect(t).toContain('das seções totalizadas');
    expect(t).not.toContain('Lula');
  });
  it('sem votos: convite neutro', () => {
    const t = textoPlacar(ANON, f0.nacional.resumo, { simulado: true });
    conferir(t);
    expect(t).toContain('acompanhe ao vivo');
  });
  it('encerrada e com eleito', () => {
    const t = textoPlacar(RACE_PRES, f100.nacional.resumo, { simulado: true });
    conferir(t);
    expect(t).toMatch(/apuração encerrada|matematicamente definido/);
  });
  it('1º turno oficial: sem prefixo de simulação e com os demais candidatos', () => {
    const t = textoPlacar(RACE_PRES_T1, RESUMO_T1, { simulado: true });
    conferir(t);
    expect(t.startsWith('Resultado oficial do 1º turno')).toBe(true);
    expect(t).toContain('demais candidatos');
    expect(t).not.toContain('SIMULAÇÃO');
  });
  it('município', () => {
    const t = textoPlacar(ANON, f35.nacional.resumo, { simulado: true, local: 'São José do Rio Preto (SP)' });
    conferir(t);
    expect(t).toContain('Presidente · São José do Rio Preto (SP)');
  });
  it('placar em texto: simétrico, na ordem da urna', () => {
    const p = placarEmTexto(ANON, { votos: [500, 500] });
    expect(p).toBe('Candidato A 50,00% × Candidato B 50,00%');
  });
});

describe('momentos', () => {
  it('evento do feed', () => {
    const e = f35.nacional.eventos[0];
    const t = textoMomento(e, true);
    conferir(t);
    expect(t.startsWith(PREFIXO_SIMULACAO)).toBe(true);
    expect(t).toContain('Reveja este momento');
  });
  it('instante da linha do tempo', () => {
    const t = textoInstante(ANON, f35.nacional.resumo, f35.nacional.simNow, { simulado: true });
    conferir(t);
    expect(t).toMatch(/^\[SIMULAÇÃO\] Às \d\d:\d\d/);
  });
});

describe('seção', () => {
  const t1Votos = { votos: [120, 110, 20] };
  it('2º turno simulado + 1º turno oficial', () => {
    const t = textoSecao({
      secao: 123,
      zona: 45,
      municipio: 'Campinas',
      uf: 'SP',
      t1: { race: anonimizarRace(RACE_PRES_T1), t: t1Votos },
      t2: { race: ANON, t: { votos: [130, 120] } },
      simulado: true,
    });
    conferir(t);
    expect(t.startsWith(PREFIXO_SIMULACAO)).toBe(true);
    expect(t).toContain('seção 0123, zona 0045 · Campinas (SP)');
    expect(t).toContain('2º turno (simulação)');
    expect(t).toContain('1º turno (oficial)');
  });
  it('só o 1º turno (antes do dia 25): sem prefixo', () => {
    const t = textoSecao({ secao: 7, zona: 1, municipio: 'Rio Branco', uf: 'AC', t1: { race: RACE_PRES_T1, t: t1Votos }, t2: null, simulado: false });
    conferir(t);
    expect(t).not.toContain('SIMULAÇÃO');
    expect(t).toContain('Lula');
  });
  it('nomes longos continuam no limite', () => {
    const longa = { ...RACE_PRES_T1, candidatos: RACE_PRES_T1.candidatos.map((c) => ({ ...c, nomeUrna: `${c.nomeUrna} da Silva Santos Oliveira Pereira` })) };
    const t = textoSecao({ secao: 1, zona: 1, municipio: 'Vila Bela da Santíssima Trindade', uf: 'MT', t1: { race: longa, t: t1Votos }, t2: { race: longa, t: { votos: [1, 2, 0] } }, simulado: true });
    conferir(t);
  });
});

describe('outros cartões', () => {
  it('município no 1º turno', () => {
    const t = textoMunicipioT1('Campinas', 'SP', RACE_PRES_T1, RESUMO_T1);
    conferir(t);
    expect(t).toContain('Minha cidade no 1º turno: Campinas (SP)');
    expect(t).toContain('Resultado oficial do TSE');
  });
  it('governadores (ao vivo e antes do dia)', () => {
    const itens = [
      { uf: 'AC' as const, dif: 3.2, definida: false },
      { uf: 'RJ' as const, dif: 0.8, definida: false },
      { uf: 'DF' as const, dif: 12, definida: true },
    ];
    const vivo = textoGovernadores(itens, { simulado: true, pst: 42.17 });
    conferir(vivo);
    expect(vivo).toContain('no Rio de Janeiro');
    expect(vivo).toContain('0,8 p.p.');
    expect(vivo.startsWith(PREFIXO_SIMULACAO)).toBe(true);
    const pre = textoGovernadores(itens, { t1: true });
    conferir(pre);
    expect(pre).toContain('AC, RJ e DF');
  });
  it('ficha do candidato', () => {
    const t = textoCandidato({ nomeUrna: 'Fulana de Tal', partido: 'PSD', numero: 555, cargo: 'Senadora', uf: 'SP', resultado: { votos: 3038438, pct: 25.31 }, situacao: 'Eleita' });
    conferir(t);
    expect(t).toContain('3.038.438 votos (25,31% dos válidos), eleita');
    expect(textoCandidato({ nomeUrna: 'X', partido: 'Y', numero: 1, cargo: 'Presidente', uf: 'BR' })).toContain('ficha com os dados públicos');
    const t2 = textoCandidato({ nomeUrna: 'Y', partido: 'Z', numero: 22, cargo: 'Presidente', uf: 'BR', resultado: { votos: 56104503, pct: 47.03 }, situacao: '2º turno' });
    conferir(t2);
    expect(t2).toContain('47,03% dos válidos), disputa o 2º turno.');
  });
  it('composição e Senado por UF', () => {
    const b = [
      { sigla: 'PL', eleitos: 14 },
      { sigla: 'PT', eleitos: 9 },
      { sigla: 'MDB', eleitos: 7 },
      { sigla: 'PSD', eleitos: 6 },
      { sigla: 'PP', eleitos: 5 },
      { sigla: 'UNIÃO', eleitos: 4 },
      { sigla: 'PSB', eleitos: 2 },
    ];
    const t = textoComposicao('Senado', 54, b, 'vagas');
    conferir(t);
    expect(t).toContain('as 54 vagas por partido — PL 14, PT 9, MDB 7, PSD 6, PP 5 e mais 2 partidos');
    const s = textoSenadoUf('SP', [
      { nomeUrna: 'Fulano', partido: 'PL', pct: 25.3 },
      { nomeUrna: 'Beltrana', partido: 'PT', pct: 20.1 },
    ]);
    conferir(s);
    expect(s).toContain('Senado em São Paulo: eleitos Fulano (PL, 25,3%) e Beltrana (PT, 20,1%)');
  });
  it('a intenção do X com qualquer texto do kit é válida e cabe', () => {
    const t = textoPlacar(ANON, f35.nacional.resumo, { simulado: true });
    const u = new URL(xIntentUrl(t, 'https://sintonia.app/apuracao', [...HASHTAGS.apuracao]));
    expect(u.searchParams.get('text')).toBe(t);
  });
});
