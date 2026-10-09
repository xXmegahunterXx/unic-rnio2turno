/**
 * Candidatos da corrida 'pres' (2º turno) para revelar a autoria das propostas.
 * Vêm do useMeta() — nunca digitados à mão. Ordem SEMPRE a da urna (menor número primeiro).
 */
import { useMemo } from 'react';
import { useMeta } from '@/app/data/hooks';
import type { Candidate } from '@/shared/types';
import { AUTORES, type Autor } from './sintonia';

export interface CandidatosTeste {
  /** Na ordem da urna. */
  lista: Candidate[];
  porNumero: Record<Autor, Candidate>;
  carregando: boolean;
}

/** Enquanto o meta não chega (ou se falhar): rótulos neutros só com o número, cores pela ordem da urna. */
function provisorio(numero: Autor): Candidate {
  return { numero, nomeUrna: `Nº ${numero}`, nome: `Candidatura nº ${numero}`, partido: '', cor: numero === 13 ? 'a' : 'b' };
}

export function useCandidatosTeste(): CandidatosTeste {
  const { data, isLoading } = useMeta();
  return useMemo(() => {
    const race = data?.races.find((r) => r.id === 'pres');
    const porNumero = {} as Record<Autor, Candidate>;
    for (const n of AUTORES) porNumero[n] = race?.candidatos.find((c) => c.numero === n) ?? provisorio(n);
    const lista = [...AUTORES].sort((a, b) => a - b).map((n) => porNumero[n]);
    return { lista, porNumero, carregando: isLoading && !race };
  }, [data, isLoading]);
}
