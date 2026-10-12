/**
 * Regra das fotos oficiais (ARCHITECTURE §1.1 e §11): nunca foto ao lado de número SIMULADO — nem com os nomes reais
 * ligados no admin. Continuam com foto o 1º turno oficial, a fase 'pre' (ainda sem números) e a fonte 'tse'.
 */
import { describe, expect, it } from 'vitest';
import type { Fase, FonteDados } from '@/shared/types';
import { numerosSimulados } from './fotos';

const st = (fonte: FonteDados, fase: Fase) => ({ simulacao: fonte === 'simulacao', fase });

describe('numerosSimulados (bloqueio de foto)', () => {
  it('simulação apurando ou encerrada, 2º turno: sem foto', () => {
    expect(numerosSimulados(st('simulacao', 'apurando'), { turno: 2 })).toBe(true);
    expect(numerosSimulados(st('simulacao', 'encerrada'), { turno: 2 })).toBe(true);
  });

  it('1º turno oficial: foto liberada mesmo durante a simulação', () => {
    expect(numerosSimulados(st('simulacao', 'apurando'), { turno: 1 })).toBe(false);
  });

  it("fase 'pre' (ainda sem números): foto liberada", () => {
    expect(numerosSimulados(st('simulacao', 'pre'), { turno: 2 })).toBe(false);
    expect(numerosSimulados(st('pre', 'pre'), { turno: 2 })).toBe(false);
  });

  it("fonte 'tse' (dado oficial): foto liberada", () => {
    expect(numerosSimulados(st('tse', 'apurando'), { turno: 2 })).toBe(false);
    expect(numerosSimulados(st('tse', 'encerrada'), { turno: 2 })).toBe(false);
  });

  it('na dúvida (turno ausente) durante a simulação: sem foto', () => {
    expect(numerosSimulados(st('simulacao', 'apurando'), {})).toBe(true);
    expect(numerosSimulados(st('simulacao', 'apurando'), null)).toBe(true);
  });

  it('status ainda não carregado: a função pura não decide (useFotosRace espera o status antes de mostrar foto)', () => {
    expect(numerosSimulados(undefined, { turno: 2 })).toBe(false);
  });
});
