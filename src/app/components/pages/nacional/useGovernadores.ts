/**
 * Dados das disputas de governador do 2º turno (ou do 1º turno com `t1`), uma por UF de `UFS_GOV_2T`.
 *
 * Regras de hooks: uma chamada por UF dentro de um `map` sobre `GOV_RACES`, que é uma CONSTANTE do módulo (derivada de
 * `UFS_GOV_2T`) — o número e a ordem das chamadas nunca mudam entre renderizações, só a chave (2º/1º turno). Assim o
 * quadro pode mudar (ex.: o RJ saiu do 2º turno em 10/10/2026) sem reescrever hooks à mão.
 */
import type { UseQueryResult } from '@tanstack/react-query';
import type { NationalSnapshot, RaceId, UF, UfSnapshot } from '@/shared/types';
import { useNacional, useUf } from '@/app/data/hooks';
import { GOV_RACES } from './fase';

export interface GovQuery<T> {
  uf: UF;
  /** Corrida exibida ('gov-df' ou 'gov-df-t1'). */
  id: RaceId;
  /** Corrida do 2º turno (para links). */
  base: RaceId;
  q: UseQueryResult<T>;
}

const ids = (t1: boolean) => GOV_RACES.map((g) => ({ ...g, base: g.id, id: t1 ? `${g.id}-t1` : g.id }));

/** Snapshot "nacional" de cada disputa (leve: resumo, série e eventos; sem municípios). */
export function useGovernadoresNacional(t1: boolean): GovQuery<NationalSnapshot>[] {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- lista constante do módulo (ver o cabeçalho)
  return ids(t1).map((g) => ({ uf: g.uf, id: g.id, base: g.base, q: useNacional(g.id) }));
}

/** Snapshot da UF de cada disputa (inclui municípios, para o mini mapa). */
export function useGovernadoresUf(t1: boolean): GovQuery<UfSnapshot>[] {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- lista constante do módulo (ver o cabeçalho)
  return ids(t1).map((g) => ({ uf: g.uf, id: g.id, base: g.base, q: useUf(g.id, g.uf) }));
}
