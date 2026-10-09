/**
 * Dados das 7 disputas de governador (2º turno, ou o 1º turno com `t1`).
 * As chamadas de hook são fixas e em ordem constante (7 UFs), como exigem as regras de hooks.
 */
import type { UseQueryResult } from '@tanstack/react-query';
import type { NationalSnapshot, RaceId, UF, UfSnapshot } from '@/shared/types';
import { useNacional, useUf } from '@/app/data/hooks';
import { GOV_RACES } from './fase';

export interface GovQuery<T> {
  uf: UF;
  /** Corrida exibida ('gov-rj' ou 'gov-rj-t1'). */
  id: RaceId;
  /** Corrida do 2º turno (para links). */
  base: RaceId;
  q: UseQueryResult<T>;
}

const ids = (t1: boolean) => GOV_RACES.map((g) => ({ ...g, base: g.id, id: t1 ? `${g.id}-t1` : g.id }));

/** Snapshot "nacional" de cada disputa (leve: resumo, série e eventos; sem municípios). */
export function useGovernadoresNacional(t1: boolean): GovQuery<NationalSnapshot>[] {
  const l = ids(t1);
  const q0 = useNacional(l[0].id);
  const q1 = useNacional(l[1].id);
  const q2 = useNacional(l[2].id);
  const q3 = useNacional(l[3].id);
  const q4 = useNacional(l[4].id);
  const q5 = useNacional(l[5].id);
  const q6 = useNacional(l[6].id);
  const qs = [q0, q1, q2, q3, q4, q5, q6];
  return l.map((g, i) => ({ uf: g.uf, id: g.id, base: g.base, q: qs[i] }));
}

/** Snapshot da UF de cada disputa (inclui municípios, para o mini mapa). */
export function useGovernadoresUf(t1: boolean): GovQuery<UfSnapshot>[] {
  const l = ids(t1);
  const q0 = useUf(l[0].id, l[0].uf);
  const q1 = useUf(l[1].id, l[1].uf);
  const q2 = useUf(l[2].id, l[2].uf);
  const q3 = useUf(l[3].id, l[3].uf);
  const q4 = useUf(l[4].id, l[4].uf);
  const q5 = useUf(l[5].id, l[5].uf);
  const q6 = useUf(l[6].id, l[6].uf);
  const qs = [q0, q1, q2, q3, q4, q5, q6];
  return l.map((g, i) => ({ uf: g.uf, id: g.id, base: g.base, q: qs[i] }));
}
