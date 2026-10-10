/**
 * Atribuição de cor aos candidatos (isomórfico: dados, motor, servidor e app).
 *
 *  - Presidente ('pres' e 'pres-t1'): cores de identificação de `CORES_IDENTIDADE` (Lula vermelho, Flávio azul).
 *  - Demais corridas (governador): slots neutros pela ordem do número na urna ('a' = menor número, turquesa; 'b' âmbar).
 *  - Simulação com nomes ocultos: `neutralizarCores` (usado por `anonimizarRace`) devolve 'a'/'b' pela ordem.
 *
 * Nunca deduza a ORDEM de um candidato pela cor; use o índice em `Race.candidatos`.
 */
import { CORES_IDENTIDADE } from './constants';
import type { Candidate, CorCandidato, Race, RaceId } from './types';

/** Família da corrida para fins de cor: 'pres-t1' → 'pres'; 'gov-rj-t1' → 'gov-rj'. */
export const familiaCor = (raceId: RaceId): string => raceId.replace(/-t1$/, '');

/** Slot neutro pela posição na urna entre os candidatos reais: 0 → 'a', 1 → 'b'. */
export const corNeutra = (indice: number): CorCandidato => (indice === 0 ? 'a' : 'b');

/** true para as cores de identificação ('vermelho' | 'azul'). */
export const ehCorIdentidade = (cor: CorCandidato): cor is 'vermelho' | 'azul' => cor === 'vermelho' || cor === 'azul';

/**
 * Cor de um candidato real numa corrida: a de identificação quando `CORES_IDENTIDADE` define (família 'pres'),
 * senão o slot neutro pela posição na urna (`indice` = posição entre os candidatos reais, ordenados pelo número).
 */
export function corCandidato(raceId: RaceId, numero: number, indice: number): CorCandidato {
  return CORES_IDENTIDADE[familiaCor(raceId)]?.[numero] ?? corNeutra(indice);
}

/** Aplica `corCandidato` a todos os candidatos reais da corrida ("Outros" continua 'outros'). Puro. */
export function aplicarCores<R extends Pick<Race, 'id' | 'candidatos'>>(race: R): R {
  let k = 0;
  return {
    ...race,
    candidatos: race.candidatos.map((c) => (c.agregado ? c : { ...c, cor: corCandidato(race.id, c.numero, k++) })),
  };
}

/** Troca as cores de identificação por slots neutros pela ordem da urna (simulação com nomes ocultos). Puro. */
export function neutralizarCores(candidatos: Candidate[]): Candidate[] {
  let k = 0;
  return candidatos.map((c) => (c.agregado ? c : { ...c, cor: corNeutra(k++) }));
}

/** Cores dos dois finalistas de Presidente pela ordem da urna (ex.: cenários, curiosidades, Teste Cego). */
export function coresPresidente(numeros: readonly [number, number]): [CorCandidato, CorCandidato] {
  const ord = [...numeros].sort((x, y) => x - y);
  const cor = (n: number) => corCandidato('pres', n, ord.indexOf(n));
  return [cor(numeros[0]), cor(numeros[1])];
}

/** As duas cores de identificação de Presidente na ordem da urna (ex.: ilustrações sem dados de uma corrida). */
export function coresIdentidadePresidente(): [CorCandidato, CorCandidato] {
  const nums = Object.keys(CORES_IDENTIDADE.pres ?? {})
    .map(Number)
    .sort((x, y) => x - y);
  return nums.length >= 2 ? coresPresidente([nums[0], nums[1]]) : ['a', 'b'];
}

/** A regra de cores em uma frase (Metodologia, Sobre). Decisão do dono do produto. */
export const REGRA_CORES =
  'Presidente: Lula em vermelho e Flávio Bolsonaro em azul (cores de identificação). Disputas de governador e a simulação com nomes ocultos usam cores neutras (turquesa e âmbar), pela ordem do número na urna.';

/** Versão curta (rodapé, cartões de confiança). */
export const REGRA_CORES_CURTA =
  'Cores: Lula em vermelho e Flávio Bolsonaro em azul; governadores e simulação com nomes ocultos em turquesa e âmbar, pela ordem do número na urna.';
