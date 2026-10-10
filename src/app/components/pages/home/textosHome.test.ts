import { describe, expect, it } from 'vitest';
import { INICIO_APURACAO } from '@/shared/constants';
import { pesoTextoX } from '@/app/lib/share';
import { LIMITE_TEXTO } from '@/app/components/share/textos';
import { AFIRMACOES } from '@/app/content/afirmacoes';
import { minutosEstimados, SEGUNDOS_POR_AFIRMACAO } from '@/app/components/pages/teste/sintonia';
import {
  diasAte,
  MINUTOS_TESTE_HOME,
  momentoApuracao,
  N_AFIRMACOES_TESTE,
  rotuloFaltam,
  SEGUNDOS_POR_AFIRMACAO_TESTE,
  textoConviteSite,
} from './textosHome';

/** Instante em Brasília (UTC−3). */
const brt = (d: number, h: number, m = 0) => Date.UTC(2026, 9, d, h + 3, m);

describe('diasAte / momentoApuracao (dias de calendário de Brasília)', () => {
  it('10/10 → 15 dias', () => {
    expect(diasAte(INICIO_APURACAO, brt(10, 12))).toBe(15);
    expect(diasAte(INICIO_APURACAO, brt(10, 23, 59))).toBe(15);
    expect(diasAte(INICIO_APURACAO, brt(11, 0, 0))).toBe(14);
    expect(momentoApuracao(brt(10, 12))).toBe('dias');
  });
  it('véspera, dia e depois', () => {
    expect(momentoApuracao(brt(24, 22))).toBe('amanha');
    expect(momentoApuracao(brt(25, 8))).toBe('hoje');
    expect(momentoApuracao(brt(25, 16, 59))).toBe('hoje');
    expect(momentoApuracao(brt(25, 17))).toBe('agora');
    expect(momentoApuracao(brt(25, 23, 59))).toBe('agora');
    expect(momentoApuracao(brt(26, 0, 1))).toBe('depois');
  });
  it('rótulos', () => {
    expect(rotuloFaltam(brt(10, 12))).toBe('Faltam 15 dias');
    expect(rotuloFaltam(brt(24, 9))).toBe('É amanhã');
    expect(rotuloFaltam(brt(25, 9))).toBe('É hoje');
    expect(rotuloFaltam(brt(25, 18))).toBe('É agora');
    expect(rotuloFaltam(brt(27, 9))).toBe('');
  });
});

describe('textoConviteSite', () => {
  const instantes = [brt(10, 12), brt(24, 9), brt(25, 9), brt(25, 18), brt(28, 9)];
  it('cabe no limite de peso do X em todos os momentos', () => {
    for (const t of instantes) expect(pesoTextoX(textoConviteSite(t))).toBeLessThanOrEqual(LIMITE_TEXTO);
  });
  it('é neutro: sem candidatos, partidos, números de apuração nem URL', () => {
    for (const t of instantes) {
      const s = textoConviteSite(t);
      expect(s).not.toMatch(/Lula|Bolsonaro|Candidato [AB]|%|https?:\/\//);
      expect(s).not.toMatch(/vai ganhar|vitória|favorito/i);
    }
  });
  it('conta os dias certos', () => {
    expect(textoConviteSite(brt(10, 12))).toMatch(/^Faltam 15 dias para o 2º turno\./);
    expect(textoConviteSite(brt(24, 9))).toMatch(/^É amanhã/);
  });
});

describe('Teste Cego: tempo honesto na Home', () => {
  it('as constantes da Home batem com o conteúdo e a regra do teste', () => {
    expect(N_AFIRMACOES_TESTE).toBe(AFIRMACOES.length);
    expect(SEGUNDOS_POR_AFIRMACAO_TESTE).toBe(SEGUNDOS_POR_AFIRMACAO);
    expect(MINUTOS_TESTE_HOME).toBe(minutosEstimados(AFIRMACOES.length));
  });
});
