/**
 * Cálculo da "sintonia" do Teste Cego (puro, sem DOM). Roda só no navegador da pessoa.
 *
 * Regra (explicada na página de resultado e em /metodologia):
 *  - cada um dos 12 temas vale 1 ponto;
 *  - escolher uma proposta dá o ponto inteiro ao autor dela;
 *  - "Tanto faz" divide o ponto: meio para cada;
 *  - "Nenhuma das duas" não pontua ninguém.
 *  sintonia(candidato) = pontos / 12 × 100. Os dois números são independentes (não somam 100%).
 */
import { rodadas, TEMAS, type Proposta, type Rodada, type Tema, type TemaInfo } from '@/app/content/propostas';
import { N_RODADAS, NENHUMA, TANTO_FAZ, type Escolha } from './codigo';

export type Autor = 13 | 22;
export const AUTORES: readonly Autor[] = [13, 22];
export type Opcao = Autor | 'nenhuma' | 'tanto-faz';

export interface TemaResultado {
  rodada: Rodada;
  escolha: Escolha;
  opcao: Opcao;
  /** Proposta escolhida (null em "nenhuma"/"tanto faz"). */
  escolhida: Proposta | null;
}

export interface Sintonia {
  seed: number;
  /** Na ordem das rodadas (a ordem em que a pessoa respondeu). */
  temas: TemaResultado[];
  escolhas: Record<Autor, number>;
  nenhuma: number;
  tantoFaz: number;
  pontos: Record<Autor, number>;
  /** 0–100 */
  pct: Record<Autor, number>;
}

export function opcaoDe(rodada: Rodada, escolha: Escolha): Opcao {
  if (escolha === 0 || escolha === 1) return rodada.opcoes[escolha].autor;
  return escolha === TANTO_FAZ ? 'tanto-faz' : 'nenhuma';
}

export function calcularSintonia(seed: number, respostas: readonly Escolha[]): Sintonia {
  const rs = rodadas(seed);
  const escolhas: Record<Autor, number> = { 13: 0, 22: 0 };
  let nenhuma = 0;
  let tantoFaz = 0;
  const temas = rs.map((rodada, i) => {
    const escolha = respostas[i] ?? NENHUMA;
    const opcao = opcaoDe(rodada, escolha);
    if (opcao === 'nenhuma') nenhuma++;
    else if (opcao === 'tanto-faz') tantoFaz++;
    else escolhas[opcao]++;
    return { rodada, escolha, opcao, escolhida: escolha === 0 || escolha === 1 ? rodada.opcoes[escolha] : null };
  });
  const pontos: Record<Autor, number> = { 13: escolhas[13] + tantoFaz / 2, 22: escolhas[22] + tantoFaz / 2 };
  const total = rs.length || N_RODADAS;
  const pct: Record<Autor, number> = { 13: (pontos[13] / total) * 100, 22: (pontos[22] / total) * 100 };
  return { seed, temas, escolhas, nenhuma, tantoFaz, pontos, pct };
}

export interface TemaComparado {
  tema: TemaInfo;
  minha: Opcao;
  outra: Opcao;
  igual: boolean;
}

export interface Comparacao {
  iguais: number;
  total: number;
  /** Na ordem das rodadas de `a`. */
  temas: TemaComparado[];
}

/** Compara duas pessoas tema a tema (casando pelo tema, então funciona mesmo com sementes diferentes). */
export function comparar(a: Sintonia, b: Sintonia): Comparacao {
  const porTema = new Map<Tema, Opcao>(b.temas.map((t) => [t.rodada.tema.id, t.opcao]));
  const temas = a.temas.map((t) => {
    const outra = porTema.get(t.rodada.tema.id) ?? 'nenhuma';
    return { tema: t.rodada.tema, minha: t.opcao, outra, igual: t.opcao === outra };
  });
  return { iguais: temas.filter((t) => t.igual).length, total: temas.length, temas };
}

/** Ordem fixa dos temas (para listas que não dependem da semente). */
export const ORDEM_TEMAS: readonly Tema[] = TEMAS.map((t) => t.id);
