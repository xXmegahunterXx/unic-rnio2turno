/** Títulos por fase das páginas de apuração (I07): os do plano, sem nome de candidato, iguais no servidor e no app. */
import { describe, expect, it } from 'vitest';
import { momentoTitulo, ondeMunicipio, tituloApuracao, tituloNacional } from './titulos';

describe('títulos por fase', () => {
  it('município: os três textos do plano (e o 1º turno pedido na URL)', () => {
    const onde = ondeMunicipio('Campinas', 'SP');
    expect(onde).toBe('em Campinas (SP)');
    expect(tituloApuracao(onde, 'pre')).toBe('Eleição 2026 em Campinas (SP): 1º turno e apuração do 2º turno · Sintonia');
    expect(tituloApuracao(onde, 'apurando')).toBe('Apuração ao vivo em Campinas (SP) · 2º turno 2026 · Sintonia');
    expect(tituloApuracao(onde, 'encerrada')).toBe('Resultado do 2º turno 2026 em Campinas (SP) · Sintonia');
    expect(tituloApuracao(onde, 't1')).toBe('1º turno 2026 em Campinas (SP): resultado oficial · Sintonia');
  });

  it('artigo do Rio de Janeiro, exterior, cargo só fora de Presidente', () => {
    expect(ondeMunicipio('Rio de Janeiro', 'RJ')).toBe('no Rio de Janeiro (RJ)');
    expect(ondeMunicipio('Abidjã', 'ZZ')).toBe('em Abidjã (Exterior)');
    expect(tituloApuracao('no Amazonas', 'apurando', 'Governador')).toBe('Apuração ao vivo no Amazonas · 2º turno 2026 · Governador · Sintonia');
    expect(tituloApuracao('no Amazonas', 'apurando', 'Presidente')).toBe('Apuração ao vivo no Amazonas · 2º turno 2026 · Sintonia');
  });

  it('nacional', () => {
    expect(tituloNacional('Presidente', 'pre')).toBe('Eleição 2026 para Presidente: 1º turno e apuração do 2º turno · Sintonia');
    expect(tituloNacional('Presidente', 'apurando')).toBe('Apuração ao vivo · Presidente · 2º turno 2026 · Sintonia');
    expect(tituloNacional('Presidente', 'encerrada')).toBe('Resultado do 2º turno 2026 · Presidente · Sintonia');
    expect(tituloNacional('Presidente · 1º turno', 't1')).toBe('Resultado do 1º turno 2026 · Presidente · Sintonia');
  });

  it('momento pela corrida PEDIDA (antes da apuração a página mostra o 1º turno sozinha: continua "pre")', () => {
    expect(momentoTitulo(false, 'pre')).toBe('pre');
    expect(momentoTitulo(true, 'apurando')).toBe('t1');
    expect(momentoTitulo(false, undefined)).toBe('pre');
    expect(momentoTitulo(false, 'encerrada')).toBe('encerrada');
  });
});
