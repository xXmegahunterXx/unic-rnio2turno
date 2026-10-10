/**
 * Fotos oficiais (TSE) dos candidatos de uma corrida, com as regras de neutralidade:
 *
 *  - Só as fotos dos pacotes oficiais (public/data/fotos/{grupo}.json), sem edição além do recorte circular.
 *  - Simulação anonimizada (`status.anonimizado`) → NUNCA foto (monograma), salvo `real` (dados reais do 1º turno).
 *    As corridas anônimas (`anonimizarRace`) também já chegam sem `sqcand`/`fotoGrupo`: dupla proteção.
 *  - "Tudo ou nada": se faltar a foto de UM dos finalistas, nenhum aparece com foto — os dois recebem o mesmo
 *    tratamento (nunca um rosto contra um monograma).
 *
 * Devolve um array alinhado com `race.candidatos` (undefined = use o monograma). "Outros" nunca tem foto.
 */
import { useMemo } from 'react';
import type { Candidate, Race } from '@/shared/types';
import { useAnonimizado } from '@/app/data/hooks';
import { useFotos } from '@/app/data/estatico';

const VAZIO: (string | undefined)[] = [];

export interface FotosOpts {
  /** Dados reais (1º turno, fichas): permite foto mesmo com a simulação anonimizada. */
  real?: boolean;
  /** Desliga (ex.: imagem de compartilhamento simulada). */
  desligado?: boolean;
}

/** Fotos dos candidatos de uma corrida (mesma ordem de `race.candidatos`). */
export function useFotosRace(race: Pick<Race, 'candidatos'> | undefined | null, opts: FotosOpts = {}): (string | undefined)[] {
  const anonimizado = useAnonimizado();
  const bloqueado = opts.desligado || (anonimizado && !opts.real) || !race;
  const finalistas: Candidate[] = race ? race.candidatos.filter((c) => !c.agregado) : [];
  const grupos = bloqueado ? [] : [...new Set(finalistas.map((c) => c.fotoGrupo).filter((g): g is string => !!g))];
  // Número fixo de chamadas de hook (as corridas usam 1 grupo; até 2 cobre casos mistos).
  const g0 = useFotos(grupos[0] ?? null);
  const g1 = useFotos(grupos[1] ?? null);
  const d0 = g0.data;
  const d1 = g1.data;
  return useMemo(() => {
    if (bloqueado || !race || finalistas.length === 0) return VAZIO;
    const pacotes = new Map<string, Record<string, string>>();
    if (grupos[0] && d0?.fotos) pacotes.set(grupos[0], d0.fotos);
    if (grupos[1] && d1?.fotos) pacotes.set(grupos[1], d1.fotos);
    const out = race.candidatos.map((c) => (c.agregado || !c.sqcand || !c.fotoGrupo ? undefined : pacotes.get(c.fotoGrupo)?.[c.sqcand]));
    // Tudo ou nada entre os finalistas.
    const todos = race.candidatos.every((c, i) => c.agregado || !!out[i]);
    return todos ? out : VAZIO;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueado, race, d0, d1, grupos[0], grupos[1]]);
}
