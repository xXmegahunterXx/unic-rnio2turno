/**
 * Regras de fase das páginas Nacional e Governadores (puras, sem React).
 *
 * - Fase 'pre' (antes das 17h de 25/10, ou fonte 'pre'): as páginas mostram o 1º TURNO REAL (corridas
 *   '-t1') com a contagem regressiva — é o conteúdo que gera tráfego antes da eleição.
 * - O usuário pode pedir o 1º turno explicitamente (`?race=pres-t1`) a qualquer momento.
 */
import type { LiveStatus, Race, RaceId, UF } from '@/shared/types';
import { UFS_GOV_2T } from '@/shared/constants';
import { comInstante } from '@/app/components/apuracao/LinhaDoTempo';

export const ehT1 = (id: RaceId) => id.endsWith('-t1');
/** 'gov-rj-t1' → 'gov-rj'. */
export const semT1 = (id: RaceId) => id.replace(/-t1$/, '');

/** Corrida que a página realmente exibe: na fase 'pre', a do 1º turno. */
export function raceExibida(pedida: RaceId, status: LiveStatus | undefined): RaceId {
  if (status?.fase === 'pre' && !ehT1(pedida)) return `${pedida}-t1`;
  return pedida;
}

/** `?race=…` para links (omitido quando é o padrão 'pres'). */
export const qsRace = (id: RaceId) => (id === 'pres' ? '' : `?race=${id}`);

/** Link da página da UF numa disputa (com `t`, o instante do "reveja a noite": `?t=18h42`). */
export const linkUf = (uf: UF, race: RaceId, t?: number) => comInstante(`/apuracao/${uf.toLowerCase()}${qsRace(race)}`, t);

/** 'gov-rj' / 'gov-rj-t1' → 'RJ' (null se não for corrida de governador). */
export function ufDaRace(id: RaceId): UF | null {
  const m = /^gov-([a-z]{2})(?:-t1)?$/.exec(id);
  return m ? (m[1].toUpperCase() as UF) : null;
}

/** As 7 disputas de governador no 2º turno, na ordem alfabética da sigla. */
export const GOV_RACES: { uf: UF; id: RaceId }[] = UFS_GOV_2T.map((uf) => ({ uf, id: `gov-${uf.toLowerCase()}` }));

/** Simulação só marca números simulados: o 1º turno é sempre o resultado oficial (real) do TSE. */
export const ehSimulado = (status: LiveStatus | undefined, race: Pick<Race, 'turno'> | RaceId) =>
  !!status?.simulacao && (typeof race === 'string' ? !ehT1(race) : race.turno === 2);
