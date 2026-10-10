/**
 * Textos prontos para postar do Teste Cego (X, WhatsApp, Web Share). Puro (testado em textosTeste.test.ts).
 *
 * Regras (além das do kit, em components/share/textos.ts):
 *  - NUNCA diz em quem a pessoa vota nem "quem ganhou": fala de sintonia com o que está escrito nos programas;
 *  - "Desafio" (padrão) não revela nada do resultado; "Meu resultado" só existe por escolha explícita da pessoa e
 *    lista os dois candidatos SEMPRE na ordem da urna, com o mesmo formato;
 *  - Duelo: só o placar entre as duas pessoas ("concordamos em N de M") — nunca a sintonia da outra pessoa com
 *    candidatos (ela não autorizou publicar isso);
 *  - sem número simulado (o teste não usa a simulação), então sem "[SIMULAÇÃO]";
 *  - até `LIMITE_TEXTO` (peso do X) antes do link e das hashtags.
 */
import type { ResultadoSintonia } from '@/app/content/afirmacoes';
import type { Candidate } from '@/shared/types';
import { fmtInt, fmtPct } from '@/shared/format';
import { LIMITE_TEXTO, limitarTexto } from '@/app/components/share/textos';
import type { Autor } from './sintonia';

/** Hashtags neutras do teste (sem '#'). */
export const HASHTAGS_TESTE = ['TesteCego', 'Eleições2026'];

const afirmacoes = (n: number) => `${fmtInt(n)} ${n === 1 ? 'afirmação' : 'afirmações'}`;

/** Convite sem resultado (o padrão). `n` = afirmações do teste completo. */
export function textoDesafio(n: number): string {
  return limitarTexto(
    `Fiz o Teste Cego do 2º turno: ${afirmacoes(n)} sobre o país, sem nomes nem partidos. Só no fim você descobre com qual programa de governo tem mais sintonia. Acha que já sabe o seu? Faz e me conta.`,
    LIMITE_TEXTO,
  );
}

/** Sintonia por extenso para o texto ("62%" ou "sem base"). */
const pctTexto = (v: number | null) => (v === null ? 'sem base' : fmtPct(v, 0));

/** "Meu resultado" (opt-in): os dois na ordem da urna, mesmo formato. `rapido` = feito no modo rápido. */
export function textoMeuResultado(candidatos: readonly Candidate[], r: ResultadoSintonia, rapido = false): string {
  // "Lula (13)"; enquanto os nomes não chegam o rótulo provisório já é "Nº 13" (sem repetir o número).
  const rotulo = (c: Candidate) => (c.nomeUrna.includes(String(c.numero)) ? c.nomeUrna : `${c.nomeUrna} (${c.numero})`);
  const placar = candidatos.map((c) => `${rotulo(c)} ${pctTexto(r[c.numero as Autor])}`).join(' · ');
  const modo = rapido ? ' (modo rápido)' : '';
  return limitarTexto(
    `Fiz o Teste Cego do 2º turno${modo}. Minha sintonia com os programas de governo: ${placar}. Não é pesquisa nem recomendação de voto. E a sua?`,
    LIMITE_TEXTO,
  );
}

/** Resultado do Duelo: só o placar entre as duas pessoas. */
export function textoDuelo(iguais: number, emComum: number, afinidade: number | null): string {
  const af = afinidade === null ? '' : ` (afinidade de ${fmtPct(afinidade, 0)})`;
  const base =
    emComum === 0
      ? 'Fiz o Duelo do Teste Cego do 2º turno: não respondemos nenhuma afirmação em comum.'
      : `Fiz o Duelo do Teste Cego do 2º turno: concordamos em ${fmtInt(iguais)} de ${afirmacoes(emComum)}${af}.`;
  return limitarTexto(`${base} Sem nomes, sem partidos: só ideias. Faça o seu e desafie alguém.`, LIMITE_TEXTO);
}

/** Convite para um Duelo (o link leva as respostas de quem convida, depois do "#"). */
export function textoConviteDuelo(n: number): string {
  return limitarTexto(
    `Quanto você concorda comigo? Responda às mesmas ${afirmacoes(n)} do Teste Cego do 2º turno, sem saber de quem são as ideias, e veja em quantas a gente fica do mesmo lado.`,
    LIMITE_TEXTO,
  );
}
