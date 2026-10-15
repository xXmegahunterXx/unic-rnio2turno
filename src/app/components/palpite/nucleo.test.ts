import { describe, expect, it } from 'vitest';
import { INICIO_APURACAO } from '@/shared/constants';
import type { Candidate, Race, Summary } from '@/shared/types';
import { pesoTextoX } from '@/app/lib/share';
import { LIMITE_TEXTO } from '@/app/components/share/textos';
import {
  CHAVE_PALPITE,
  FIM_PALPITES,
  FIM_VOTACAO,
  PALPITE_INICIAL,
  PALPITE_MAX,
  PALPITE_MIN,
  avaliarPalpite,
  caminhoPalpite,
  codificarPalpite,
  decodificarPalpite,
  deslocamentoRelogio,
  distanciaPalpites,
  fasePalpite,
  gravarPalpite,
  hashInvalido,
  indiceMenorNumero,
  lerPalpiteSalvo,
  normalizarPalpite,
  palpiteDoHash,
  pctsDoPalpite,
  prazoPalpite,
  resultadoOficial,
  type Armazenamento,
} from './nucleo';
import { mancheteResultado, placarDoPalpite, textoMeuPalpite, textoResultadoPalpite, type Finalistas } from './textos';

const mem = (): Armazenamento & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

const cand = (numero: number, nomeUrna: string, cor: Candidate['cor']): Candidate => ({ numero, nomeUrna, nome: nomeUrna, partido: 'P', cor });
const pres: Pick<Race, 'id' | 'turno' | 'candidatos'> = { id: 'pres', turno: 2, candidatos: [cand(13, 'Lula', 'vermelho'), cand(22, 'Flávio Bolsonaro', 'azul')] };
const resumo = (votos: number[], secoesTotalizadas = 100, secoes = 100): Pick<Summary, 'votos' | 'secoes' | 'secoesTotalizadas'> => ({ votos, secoes, secoesTotalizadas });
const oficial = { fonte: 'tse' as const, fase: 'apurando' as const, simulacao: false };
const F: Finalistas = [
  { numero: 13, nomeUrna: 'Lula' },
  { numero: 22, nomeUrna: 'Flávio Bolsonaro' },
];

describe('código do link (vai depois do #)', () => {
  it('ida e volta em todo o intervalo, com 3 caracteres', () => {
    for (let a = PALPITE_MIN; a <= PALPITE_MAX; a++) {
      const c = codificarPalpite(a);
      expect(c).toMatch(/^1[0-9a-z]{2}$/);
      expect(decodificarPalpite(c)).toBe(a);
      expect(palpiteDoHash(`#${c}`)).toBe(a);
      expect(palpiteDoHash(`#p=${c}`)).toBe(a);
    }
    expect(codificarPalpite(504)).toBe('1e0');
  });
  it('recusa lixo, outra versão e valores fora dos limites', () => {
    for (const x of ['', '#', 'abc', '2e0', '1e', '1e00', '1zz', '1!0', '18b' /* 299 */, '1jh' /* 701 */, null, undefined]) {
      expect(decodificarPalpite(x as string)).toBeNull();
    }
    expect(palpiteDoHash('')).toBeNull();
    expect(hashInvalido('')).toBe(false);
    expect(hashInvalido('#1e0')).toBe(false);
    expect(hashInvalido('#xyz')).toBe(true);
  });
  it('caminho: sem palpite, /palpite; com palpite, o código só depois do #', () => {
    expect(caminhoPalpite()).toBe('/palpite');
    expect(caminhoPalpite(null)).toBe('/palpite');
    expect(caminhoPalpite(504)).toBe('/palpite#1e0');
    expect(caminhoPalpite(504).split('#')[0]).toBe('/palpite');
  });
});

describe('valores', () => {
  it('normaliza para décimos inteiros dentro dos limites; os dois lados somam 100', () => {
    expect(normalizarPalpite(504.4)).toBe(504);
    expect(normalizarPalpite(1)).toBe(PALPITE_MIN);
    expect(normalizarPalpite(5000)).toBe(PALPITE_MAX);
    expect(normalizarPalpite(Number.NaN)).toBe(PALPITE_INICIAL);
    for (const a of [300, 437, 500, 501, 700]) {
      const [x, y] = pctsDoPalpite(a);
      expect(Math.round((x + y) * 10)).toBe(1000);
    }
    // limites simétricos em torno de 50%
    expect(PALPITE_MIN + PALPITE_MAX).toBe(1000);
    expect(PALPITE_INICIAL).toBe(500);
  });
});

describe('armazenamento (só no aparelho)', () => {
  it('grava e lê; ignora formato desconhecido e valores inválidos', () => {
    const arm = mem();
    expect(lerPalpiteSalvo(arm)).toBeNull();
    expect(gravarPalpite({ a: 512, em: 1_700_000_000_000 }, arm)).toBe(true);
    expect(lerPalpiteSalvo(arm)).toEqual({ a: 512, em: 1_700_000_000_000 });
    // o que fica guardado: só o número e a hora (nada de identificador)
    expect(Object.keys(JSON.parse(arm.m.get(CHAVE_PALPITE)!)).sort()).toEqual(['a', 'em', 'v']);
    arm.setItem(CHAVE_PALPITE, '{"v":2,"a":512}');
    expect(lerPalpiteSalvo(arm)).toBeNull();
    arm.setItem(CHAVE_PALPITE, '{"v":1,"a":999}');
    expect(lerPalpiteSalvo(arm)).toBeNull();
    arm.setItem(CHAVE_PALPITE, 'não é json');
    expect(lerPalpiteSalvo(arm)).toBeNull();
    expect(gravarPalpite({ a: 10, em: 1 }, arm)).toBe(false);
  });
  it('armazenamento bloqueado não quebra', () => {
    const quebrado: Armazenamento = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cota');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(lerPalpiteSalvo(quebrado)).toBeNull();
    expect(gravarPalpite({ a: 500, em: 1 }, quebrado)).toBe(false);
    expect(lerPalpiteSalvo(null)).toBeNull();
  });
});

describe('prazo (relógio do servidor)', () => {
  it('aberto até 0h de 25/10 (exclusive); no dia da votação, até as 17h, travado e sem compartilhar', () => {
    const zeroH = Date.UTC(2026, 9, 25, 3, 0, 0); // 0h de Brasília
    expect(FIM_PALPITES).toBe(zeroH);
    expect(FIM_VOTACAO).toBe(INICIO_APURACAO);
    expect(prazoPalpite(zeroH - 1)).toBe('aberto');
    expect(prazoPalpite(zeroH)).toBe('fechado');
    expect(prazoPalpite(INICIO_APURACAO + 3_600_000)).toBe('fechado');
    expect(fasePalpite(zeroH - 1)).toBe('aberto');
    expect(fasePalpite(zeroH)).toBe('votacao');
    expect(fasePalpite(INICIO_APURACAO - 1)).toBe('votacao');
    expect(fasePalpite(INICIO_APURACAO)).toBe('fechado');
  });
  it('deslocamento do relógio pelo status; valores absurdos ignorados', () => {
    expect(deslocamentoRelogio(1_000_500, 1_000_000)).toBe(500);
    expect(deslocamentoRelogio(undefined, 1_000_000)).toBe(0);
    expect(deslocamentoRelogio(1_000_000, 0)).toBe(0);
    expect(deslocamentoRelogio(Date.UTC(2030, 0, 1), Date.UTC(2026, 0, 1))).toBe(0);
  });
});

describe('comparação com o resultado oficial', () => {
  it('só com dado oficial do 2º turno (nunca simulação, nunca antes do início)', () => {
    const r = resumo([5040, 4960]);
    expect(resultadoOficial(oficial, pres, r)).toMatchObject({ pct0: 50.4, final: true, pctSecoes: 100 });
    expect(resultadoOficial({ ...oficial, simulacao: true }, pres, r)).toBeNull();
    expect(resultadoOficial({ ...oficial, fonte: 'simulacao' }, pres, r)).toBeNull();
    expect(resultadoOficial({ ...oficial, fonte: 'pre' }, pres, r)).toBeNull();
    expect(resultadoOficial({ ...oficial, fase: 'pre' }, pres, r)).toBeNull();
    expect(resultadoOficial(oficial, { ...pres, id: 'pres-t1', turno: 1 }, r)).toBeNull();
    expect(resultadoOficial(oficial, pres, resumo([0, 0], 0))).toBeNull();
    expect(resultadoOficial(undefined, pres, r)).toBeNull();
  });
  it('parcial x final', () => {
    expect(resultadoOficial(oficial, pres, resumo([5040, 4960], 63, 100))).toMatchObject({ final: false, pctSecoes: 63 });
    expect(resultadoOficial({ ...oficial, fase: 'encerrada' }, pres, resumo([5040, 4960], 99, 100))).toMatchObject({ final: true });
  });
  it('usa o candidato de MENOR número, mesmo fora de ordem', () => {
    const invertida = { ...pres, candidatos: [pres.candidatos[1], pres.candidatos[0]] };
    expect(indiceMenorNumero(invertida.candidatos)).toBe(1);
    expect(resultadoOficial(oficial, invertida, resumo([4960, 5040]))!.pct0).toBeCloseTo(50.4, 10);
    expect(indiceMenorNumero([pres.candidatos[0]])).toBe(-1);
  });
  it('diferença em p.p. (1 casa) e "na mosca" abaixo de 0,5', () => {
    expect(avaliarPalpite(520, 50.43)).toEqual({ erro: 1.6, naMosca: false });
    expect(avaliarPalpite(480, 50.43)).toEqual({ erro: 2.4, naMosca: false });
    expect(avaliarPalpite(504, 50.43)).toEqual({ erro: 0, naMosca: true });
    expect(avaliarPalpite(508, 50.43)).toEqual({ erro: 0.4, naMosca: true });
    expect(avaliarPalpite(509, 50.43)).toEqual({ erro: 0.5, naMosca: false });
    // simétrico: o erro de um lado é o do outro
    expect(avaliarPalpite(1000 - 520, 100 - 50.43).erro).toBe(1.6);
    expect(distanciaPalpites(520, 490)).toBe(3);
  });
});

describe('textos (neutros, ordem da urna, cabem no X)', () => {
  it('meu palpite', () => {
    const t = textoMeuPalpite(F, 520, true);
    expect(t).toContain('Lula 52,0% × Flávio Bolsonaro 48,0%');
    expect(t).toContain('até 24/10');
    // sem número de urna no texto que circula (nome + número = santinho)
    expect(t).not.toMatch(/\b(13|22)\b/);
    expect(pesoTextoX(t)).toBeLessThanOrEqual(LIMITE_TEXTO);
    expect(textoMeuPalpite(F, 480, false)).not.toContain('Faça o seu');
    // simétrico: inverter o palpite só troca os números de lugar, nunca a ordem dos nomes
    expect(textoMeuPalpite(F, 480, true).indexOf('Lula')).toBeLessThan(textoMeuPalpite(F, 480, true).indexOf('Flávio'));
  });
  it('resultado', () => {
    const t = textoResultadoPalpite(F, 520, { erro: 1.6, naMosca: false });
    expect(t).toContain('Errei o palpite do 2º turno por 1,6 p.p.');
    expect(pesoTextoX(t)).toBeLessThanOrEqual(LIMITE_TEXTO);
    expect(textoResultadoPalpite(F, 504, { erro: 0.3, naMosca: true })).toMatch(/^Na mosca: .*0,3 p\.p\./);
    expect(mancheteResultado({ erro: 1.6, naMosca: false }, 'eu')).toBe('Errei por 1,6 p.p.');
    expect(mancheteResultado({ erro: 0, naMosca: true }, 'voce')).toBe('Na mosca');
  });
  it('sem adjetivos nem torcida', () => {
    const todos = [textoMeuPalpite(F, 520, true), textoMeuPalpite(F, 480, false), textoResultadoPalpite(F, 520, { erro: 1.6, naMosca: false })].join(' ');
    expect(todos).not.toMatch(/vit[óo]ria|vence|ganh|derrot|esmag|lavada|favorito/i);
    expect(placarDoPalpite(F, 500, true)).toBe('50,0% × 50,0%');
    expect(todos).not.toMatch(/\((13|22)\)/);
  });
});
