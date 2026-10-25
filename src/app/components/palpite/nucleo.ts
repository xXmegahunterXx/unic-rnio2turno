/**
 * Palpite do 2º turno (motor viral INDIVIDUAL): regras puras, sem React nem DOM — testadas em nucleo.test.ts.
 *
 * Até as 23h59 de 24/10 (Brasília) a pessoa crava o % dos votos válidos de cada finalista de Presidente (um divisor só:
 * os dois somam 100%). No dia da votação (25/10, de 0h ao fim da votação, 19h — prorrogada; eram 17h) o palpite fica
 * travado e NÃO é compartilhado nem divulgado (Lei 9.504/97, art. 39, § 5º — a sala do chat também fecha nesse horário).
 * Depois do resultado oficial do TSE, a página mostra a diferença em pontos percentuais ("Errei por Z p.p." ou "Na mosca").
 *
 * LGPD e lei eleitoral (ARCHITECTURE §1): o palpite NUNCA vai ao servidor e nunca é somado ao de outras pessoas (um
 * agregado de palpites seria enquete — Lei 9.504/97, art. 33, § 5º). Fica no aparelho (localStorage, só conveniência) e
 * só sai no link ou na imagem que a pessoa decidir compartilhar. No link ele vai DEPOIS do "#" (`/palpite#1e0`): o
 * navegador não envia essa parte a servidor algum — como as respostas do Duelo do Teste Cego.
 *
 * Unidade: DÉCIMOS de ponto percentual do candidato de MENOR número na urna (o 1º da corrida 'pres', ordem da urna).
 * 504 = 50,4% para ele e 49,6% para o outro. Inteiros: nada de erro de arredondamento entre os dois lados.
 */
import { pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { FIM_VOTACAO } from '@/shared/diaVotacao';
import type { Candidate, LiveStatus, Race, Summary } from '@/shared/types';

/** Limites do divisor (décimos): 30,0% a 70,0% para cada lado — simétrico em torno de 50%. */
export const PALPITE_MIN = 300;
export const PALPITE_MAX = 700;
/** Ponto de partida neutro: metade para cada. */
export const PALPITE_INICIAL = 500;
/**
 * Palpites aceitos até este instante (relógio do servidor): 0h de 25/10 em Brasília (UTC−3), o início do dia da votação.
 * Antes eram as 17h; no dia da eleição, imagem com nome e percentual de candidato circulando de manhã pode ser lida como
 * propaganda (art. 39, § 5º) — consulte o advogado antes de mudar.
 */
export const FIM_PALPITES = Date.UTC(2026, 9, 25, 3, 0, 0);
/**
 * Fim da votação (19h de Brasília em 25/10; a votação foi prorrogada, eram 17h): entre FIM_PALPITES e ele, o palpite não
 * é compartilhado nem divulgado. Fonte única em src/shared/diaVotacao.ts (reexportado aqui por compatibilidade).
 */
export { FIM_VOTACAO };
/** Prazo por extenso (o mesmo em toda a interface). */
export const PRAZO_PALPITES_TEXTO = 'as 23h59 de 24/10';
/** Diferença (arredondada a 1 casa) abaixo da qual o palpite é "na mosca". */
export const NA_MOSCA_PP = 0.5;

/** Versão do código no link. */
export const VERSAO_PALPITE = '1';
const RE_CODIGO = /^1[0-9a-z]{2}$/;

/** Palpite guardado no aparelho. */
export interface Palpite {
  /** décimos de p.p. do candidato de menor número (PALPITE_MIN–PALPITE_MAX) */
  a: number;
  /** quando foi cravado (epoch ms, relógio do servidor estimado) */
  em: number;
}

/** Dentro dos limites e inteiro? */
export const palpiteValido = (a: unknown): a is number => typeof a === 'number' && Number.isInteger(a) && a >= PALPITE_MIN && a <= PALPITE_MAX;

/** Arredonda para décimos inteiros e limita a [PALPITE_MIN, PALPITE_MAX]. */
export function normalizarPalpite(v: number): number {
  if (!Number.isFinite(v)) return PALPITE_INICIAL;
  return Math.min(PALPITE_MAX, Math.max(PALPITE_MIN, Math.round(v)));
}

/** [% do menor número, % do maior número] (0–100, uma casa). */
export const pctsDoPalpite = (a: number): [number, number] => [a / 10, (1000 - a) / 10];

// ---- código do link --------------------------------------------------------------------------------------------------

/** "1" + décimos em base 36 (2 dígitos): 504 → "1e0". */
export function codificarPalpite(a: number): string {
  return `${VERSAO_PALPITE}${normalizarPalpite(a).toString(36).padStart(2, '0')}`;
}

/** Décimos a partir do código (null = inválido, de outra versão ou fora dos limites). */
export function decodificarPalpite(codigo: string | null | undefined): number | null {
  const t = (codigo ?? '').trim().toLowerCase();
  if (!RE_CODIGO.test(t)) return null;
  const a = parseInt(t.slice(1), 36);
  return palpiteValido(a) ? a : null;
}

/** Palpite recebido no hash da rota ("#1e0" ou "#p=1e0"); null sem hash ou inválido. */
export function palpiteDoHash(hash: string | null | undefined): number | null {
  const t = (hash ?? '').replace(/^#/, '').trim();
  if (!t) return null;
  const m = /^(?:p=)?([0-9a-z]+)$/i.exec(t);
  return m ? decodificarPalpite(m[1]) : null;
}

/** true quando o hash traz ALGO que não é um palpite válido (link quebrado → aviso). */
export const hashInvalido = (hash: string | null | undefined): boolean => {
  const t = (hash ?? '').replace(/^#/, '').trim();
  return t.length > 0 && palpiteDoHash(t) === null;
};

/** Rota do app: sem palpite, `/palpite`; com palpite, o código vai depois do "#". */
export const caminhoPalpite = (a?: number | null): string => (a === undefined || a === null ? '/palpite' : `/palpite#${codificarPalpite(a)}`);

// ---- armazenamento (só no aparelho) ----------------------------------------------------------------------------------

export const CHAVE_PALPITE = 'sintonia:palpite';

/** Armazenamento mínimo (localStorage; nos testes, um Map). */
export interface Armazenamento {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function armazenamentoPadrao(): Armazenamento | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Palpite guardado (null: nenhum, inválido ou armazenamento bloqueado). */
export function lerPalpiteSalvo(arm: Armazenamento | null = armazenamentoPadrao()): Palpite | null {
  try {
    const bruto = arm?.getItem(CHAVE_PALPITE);
    if (!bruto) return null;
    const o = JSON.parse(bruto) as { v?: unknown; a?: unknown; em?: unknown };
    if (o?.v !== 1 || !palpiteValido(o.a)) return null;
    const em = typeof o.em === 'number' && Number.isFinite(o.em) && o.em > 0 ? o.em : 0;
    return { a: o.a, em };
  } catch {
    return null;
  }
}

/** Guarda o palpite; false se o armazenamento recusar (modo privado, cota) — a página segue sem lembrar. */
export function gravarPalpite(p: Palpite, arm: Armazenamento | null = armazenamentoPadrao()): boolean {
  if (!palpiteValido(p.a) || !arm) return false;
  try {
    arm.setItem(CHAVE_PALPITE, JSON.stringify({ v: 1, a: p.a, em: Math.round(p.em) }));
    return true;
  } catch {
    return false;
  }
}

export function apagarPalpite(arm: Armazenamento | null = armazenamentoPadrao()): void {
  try {
    arm?.removeItem(CHAVE_PALPITE);
  } catch {
    /* nada a fazer */
  }
}

// ---- relógio e fases -------------------------------------------------------------------------------------------------

/**
 * Diferença entre o relógio do servidor e o do aparelho (ms), a partir do último status (`wallNow`) e do instante local
 * em que ele chegou. O prazo (0h de 25/10) segue o servidor: um aparelho com a hora errada não abre nem fecha antes.
 * Valores absurdos (mais de 1 ano) são ignorados.
 */
export function deslocamentoRelogio(wallNow: number | undefined, recebidoEm: number | undefined): number {
  if (!wallNow || !recebidoEm || !Number.isFinite(wallNow) || !Number.isFinite(recebidoEm)) return 0;
  const d = wallNow - recebidoEm;
  return Math.abs(d) > 366 * 86_400_000 ? 0 : d;
}

/** 'aberto' até o prazo (exclusive); 'fechado' depois. */
export const prazoPalpite = (agora: number, fim = FIM_PALPITES): 'aberto' | 'fechado' => (agora < fim ? 'aberto' : 'fechado');

/**
 * Fase: 'aberto' (dá para cravar e compartilhar), 'votacao' (25/10 de 0h ao fim da votação, 19h: travado, sem
 * compartilhar e sem chamada na home/apuração) ou 'fechado' (depois do fim da votação: comparar e compartilhar o palpite
 * e o resultado).
 */
export function fasePalpite(agora: number): 'aberto' | 'votacao' | 'fechado' {
  if (agora < FIM_PALPITES) return 'aberto';
  return agora < FIM_VOTACAO ? 'votacao' : 'fechado';
}

// ---- comparação com o resultado OFICIAL --------------------------------------------------------------------------------

/** Índice do candidato de menor número (não agregado) na corrida; -1 se não houver dois finalistas. */
export function indiceMenorNumero(candidatos: readonly Pick<Candidate, 'numero' | 'agregado'>[]): number {
  const reais = candidatos.map((c, i) => ({ c, i })).filter((x) => !x.c.agregado);
  if (reais.length !== 2) return -1;
  return reais[0].c.numero <= reais[1].c.numero ? reais[0].i : reais[1].i;
}

export interface ResultadoOficial {
  /** % dos votos válidos do candidato de menor número (0–100) */
  pct0: number;
  /** % de seções totalizadas (truncado, como o TSE) */
  pctSecoes: number;
  /** apuração concluída (100% das seções, ou o servidor já publicou 'encerrada') */
  final: boolean;
}

/**
 * Resultado para comparar: SÓ dado oficial do 2º turno (fonte 'tse', sem simulação, depois do início, com votos).
 * Números simulados nunca entram na comparação: um "errei por" contra números fictícios circularia como se fosse real.
 */
export function resultadoOficial(
  status: Pick<LiveStatus, 'fonte' | 'fase' | 'simulacao'> | undefined,
  race: Pick<Race, 'id' | 'turno' | 'candidatos'> | undefined,
  resumo: Pick<Summary, 'votos' | 'secoes' | 'secoesTotalizadas'> | undefined,
): ResultadoOficial | null {
  if (!status || !race || !resumo) return null;
  if (status.simulacao || status.fonte !== 'tse' || status.fase === 'pre') return null;
  if (race.id !== 'pres' || race.turno !== 2) return null;
  const i = indiceMenorNumero(race.candidatos);
  if (i < 0 || resumo.secoesTotalizadas <= 0 || validos(resumo) <= 0) return null;
  const pctSecoes = pctTotalizadas(resumo);
  return { pct0: pctValidos(resumo, i), pctSecoes, final: pctSecoes >= 100 || status.fase === 'encerrada' };
}

export interface Avaliacao {
  /** diferença em p.p., arredondada a 1 casa (é o número exibido) */
  erro: number;
  naMosca: boolean;
}

/** Diferença entre o palpite e o resultado (em p.p. do candidato de menor número — a mesma para o outro). */
export function avaliarPalpite(a: number, pct0: number): Avaliacao {
  const erro = Math.round(Math.abs(a / 10 - pct0) * 10) / 10;
  return { erro, naMosca: erro < NA_MOSCA_PP };
}

/** Distância entre dois palpites (p.p.). */
export const distanciaPalpites = (a: number, b: number): number => Math.abs(a - b) / 10;
