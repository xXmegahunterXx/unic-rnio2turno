/**
 * Cores dos finalistas na calculadora de cenários. Os nomes são REAIS (números hipotéticos, sem foto), então valem as
 * cores de identificação de Presidente (CORES_IDENTIDADE: Lula vermelho, Flávio Bolsonaro azul), na ordem da urna
 * (índice 0 = menor número). Nunca deduza a cor pela posição: use sempre estas funções.
 */
import type { PresidenteT1Dataset } from '@/shared/cenarios';
import { coresIdentidadePresidente, coresPresidente } from '@/shared/cores';
import type { CorCandidato } from '@/shared/types';

export type CoresCenario = readonly [CorCandidato, CorCandidato];

/** [cor do finalista 0, cor do finalista 1] (ordem da urna), a partir dos números do dataset. */
export function coresCenario(ds?: Pick<PresidenteT1Dataset, 'finalistas'>): CoresCenario {
  return ds ? coresPresidente(ds.finalistas) : coresIdentidadePresidente();
}
