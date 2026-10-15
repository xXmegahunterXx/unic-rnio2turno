/**
 * Contas do cartão do confronto (puras, testadas em fotosHero.test.ts). Percentuais sempre por `calc.ts`.
 */
import type { Race } from '@/shared/types';

/**
 * Votos do 1º turno de cada candidato da corrida (oficiais, do dataset: `Candidate.primeiroTurno`), na ordem de
 * `race.candidatos` — os dois finalistas e "Outros" na corrida 'pres-t1', que somam os votos válidos. undefined se
 * faltar o número de algum candidato (o cartão então mostra só fotos e nomes, sem inventar nada).
 */
export function votosPrimeiroTurno(race: Pick<Race, 'candidatos'> | undefined): number[] | undefined {
  if (!race || race.candidatos.length === 0) return undefined;
  const v = race.candidatos.map((c) => c.primeiroTurno?.votos);
  return v.every((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0) ? v : undefined;
}
