import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RaceId } from '@/shared/types';

export const RACE_PADRAO: RaceId = 'pres';

/**
 * Lê/escreve a corrida atual em `?race=`. Padrão 'pres' (omitido da URL para links mais curtos).
 * Preserva os demais parâmetros da URL.
 */
export function useRaceParam(padrao: RaceId = RACE_PADRAO): [RaceId, (race: RaceId, opts?: { replace?: boolean }) => void] {
  const [params, setParams] = useSearchParams();
  const race = (params.get('race') || padrao).toLowerCase();
  const setRace = useCallback(
    (next: RaceId, opts?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (!next || next === RACE_PADRAO) p.delete('race');
          else p.set('race', next.toLowerCase());
          return p;
        },
        { replace: opts?.replace ?? false, preventScrollReset: true },
      );
    },
    [setParams],
  );
  return [race, setRace];
}
