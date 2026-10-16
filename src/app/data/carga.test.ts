import { describe, expect, it } from 'vitest';
import {
  CONEXAO_INICIAL,
  RECUO_MAX_MS,
  STATUS_MS,
  atrasoNovaTentativa,
  cargaVigenteAgora,
  comFreio,
  conexaoInstavel,
  definirCargaVigente,
  fatorChatDe,
  fatorChatVigente,
  fatorDe,
  intervaloPesado,
  intervaloPesadoVigente,
  intervaloStatus,
  registrarFalha,
  registrarSucesso,
  type EstadoConexao,
} from './carga';
import type { CargaStatus } from '@/shared/types';

describe('freio de carga (I37)', () => {
  it('fator: ausente ou fora do contrato = 1', () => {
    expect(fatorDe(undefined)).toBe(1);
    expect(fatorDe(null)).toBe(1);
    expect(fatorDe({ fator: 1 })).toBe(1);
    expect(fatorDe({ fator: 2 })).toBe(2);
    expect(fatorDe({ fator: 3, leve: true })).toBe(3);
    expect(fatorDe({ fator: 5 })).toBe(5);
    expect(fatorDe({ fator: 4 } as unknown as CargaStatus)).toBe(1);
    expect(fatorDe({ fator: '5' } as unknown as CargaStatus)).toBe(1);
  });

  it('comFreio multiplica e mantém false', () => {
    expect(comFreio(2500, undefined)).toBe(2500);
    expect(comFreio(2500, { fator: 2 })).toBe(5000);
    expect(comFreio(10_000, { fator: 5 })).toBe(50_000);
    expect(comFreio(false, { fator: 5 })).toBe(false);
  });

  it('peças pesadas param no modo leve; fora dele, × fator', () => {
    expect(intervaloPesado(10_000, undefined)).toBe(10_000);
    expect(intervaloPesado(10_000, { fator: 3 })).toBe(30_000);
    expect(intervaloPesado(10_000, { fator: 1, leve: true })).toBe(false);
    expect(intervaloPesado(10_000, { fator: 5, leve: true })).toBe(false);
  });

  it('chat: 2× só no modo leve', () => {
    expect(fatorChatDe(undefined)).toBe(1);
    expect(fatorChatDe({ fator: 5 })).toBe(1);
    expect(fatorChatDe({ fator: 2, leve: true })).toBe(2);
  });

  it('freio vigente (chat e "desde o 1º turno")', () => {
    definirCargaVigente({ fator: 3, leve: true });
    expect(cargaVigenteAgora()).toEqual({ fator: 3, leve: true });
    expect(fatorChatVigente()).toBe(2);
    expect(intervaloPesadoVigente(10_000)).toBe(false);
    definirCargaVigente({ fator: 2 });
    expect(fatorChatVigente()).toBe(1);
    expect(intervaloPesadoVigente(10_000)).toBe(20_000);
    definirCargaVigente({ fator: 7 } as unknown as CargaStatus);
    expect(cargaVigenteAgora()).toBeUndefined();
    definirCargaVigente(undefined);
    expect(intervaloPesadoVigente(10_000)).toBe(10_000);
  });
});

describe('recuo do status (I05)', () => {
  it('sem falhas: 2 s × fator', () => {
    expect(intervaloStatus(0, undefined, 0.5)).toBe(STATUS_MS);
    expect(intervaloStatus(0, { fator: 2 }, 0.9)).toBe(4000);
    expect(intervaloStatus(0, { fator: 5 }, 0)).toBe(10_000);
  });

  it('4, 8, 16… até 30 s, sem variação com aleatorio = 0', () => {
    expect([1, 2, 3, 4, 5, 9, 50].map((f) => intervaloStatus(f, undefined, 0))).toEqual([4000, 8000, 16_000, RECUO_MAX_MS, RECUO_MAX_MS, RECUO_MAX_MS, RECUO_MAX_MS]);
  });

  it('variação aleatória de até 25% para menos, nunca acima do teto', () => {
    for (let i = 0; i <= 20; i++) {
      const r = i / 20;
      for (const f of [1, 2, 3, 4, 8]) {
        const v = intervaloStatus(f, undefined, r);
        const semVar = intervaloStatus(f, undefined, 0);
        expect(v).toBeLessThanOrEqual(semVar);
        expect(v).toBeGreaterThanOrEqual(Math.round(semVar * 0.75));
        expect(v).toBeLessThanOrEqual(RECUO_MAX_MS);
      }
    }
    expect(intervaloStatus(4, undefined, 1)).toBe(22_500);
    expect(intervaloStatus(1, undefined, Number.NaN)).toBe(4000);
  });

  it('com o freio, o recuo parte do intervalo freado', () => {
    expect(intervaloStatus(1, { fator: 5 }, 0)).toBe(20_000);
    expect(intervaloStatus(2, { fator: 5 }, 0)).toBe(RECUO_MAX_MS);
    expect(intervaloStatus(1, { fator: 3 }, 0)).toBe(12_000);
  });

  it('nova tentativa automática: 1, 2, 4… s ±25%, teto 30 s', () => {
    expect(atrasoNovaTentativa(0, 0.5)).toBe(1000);
    expect(atrasoNovaTentativa(1, 0.5)).toBe(2000);
    expect(atrasoNovaTentativa(0, 0)).toBe(750);
    expect(atrasoNovaTentativa(0, 1)).toBe(1250);
    expect(atrasoNovaTentativa(20, 0.5)).toBe(RECUO_MAX_MS);
  });
});

describe('faixa "Conexão instável" (I05)', () => {
  const ok = (e: EstadoConexao, wall: number, local: number) => registrarSucesso(e, wall, local);

  it('3 falhas seguidas mostram; o 1º sucesso esconde', () => {
    let e = ok(CONEXAO_INICIAL, 1_000_000, 5000);
    e = registrarFalha(e);
    e = registrarFalha(e);
    expect(conexaoInstavel(e)).toBe(false);
    e = registrarFalha(e);
    expect(conexaoInstavel(e)).toBe(true);
    expect(e.ultimoWallNow).toBe(1_000_000);
    e = ok(e, 1_030_000, 35_000);
    expect(e.falhas).toBe(0);
    expect(conexaoInstavel(e)).toBe(false);
  });

  it('sem nenhuma resposta ainda, 3 falhas também mostram (sem hora)', () => {
    const e = registrarFalha(registrarFalha(registrarFalha(CONEXAO_INICIAL)));
    expect(conexaoInstavel(e)).toBe(true);
    expect(e.ultimoWallNow).toBeNull();
  });

  it('relógio do servidor parado por 60 s enquanto as respostas chegam (status velho na borda)', () => {
    let e = ok(CONEXAO_INICIAL, 1_000_000, 0);
    for (let local = 2000; local < 60_000; local += 2000) {
      e = ok(e, 1_000_000, local);
      expect(conexaoInstavel(e)).toBe(false);
    }
    e = ok(e, 1_000_000, 60_000);
    expect(conexaoInstavel(e)).toBe(true);
    expect(e.ultimoWallNow).toBe(1_000_000);
    // o relógio volta a andar: some
    e = ok(e, 1_062_000, 62_000);
    expect(conexaoInstavel(e)).toBe(false);
  });

  it('aba em segundo plano (sem consultas) não conta como relógio parado', () => {
    let e = ok(CONEXAO_INICIAL, 1_000_000, 0);
    // 5 min sem consultar; a 1ª resposta na volta já traz o relógio novo
    e = ok(e, 1_300_000, 300_000);
    expect(conexaoInstavel(e)).toBe(false);
  });

  it('relógio que volta um pouco (outra instância) não reinicia a contagem nem esconde o último dado', () => {
    let e = ok(CONEXAO_INICIAL, 1_000_000, 0);
    e = ok(e, 999_000, 61_000);
    expect(e.ultimoWallNow).toBe(1_000_000);
    expect(conexaoInstavel(e)).toBe(true);
  });

  it('a hora mostrada é a dos dados (simNow), com o wallNow como reserva', () => {
    let e = registrarSucesso(CONEXAO_INICIAL, 1_000_000, 0, 5_000_000);
    expect(e.ultimoDado).toBe(5_000_000);
    e = registrarSucesso(e, 1_002_000, 2000);
    expect(e.ultimoDado).toBe(1_002_000);
    e = registrarFalha(e);
    expect(e.ultimoDado).toBe(1_002_000);
    e = registrarSucesso(e, Number.NaN, 4000, 'x');
    expect(e.ultimoDado).toBe(1_002_000);
  });

  it('wallNow inválido conta como "não avançou"', () => {
    let e = ok(CONEXAO_INICIAL, 1_000_000, 0);
    e = registrarSucesso(e, undefined, 70_000);
    expect(e.ultimoWallNow).toBe(1_000_000);
    expect(conexaoInstavel(e)).toBe(true);
  });
});
