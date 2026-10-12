/**
 * Fotos oficiais (TSE) dos candidatos de uma corrida, com as regras de neutralidade:
 *
 *  - Só as fotos dos pacotes oficiais (public/data/fotos/{grupo}.json), sem edição além do recorte circular.
 *  - Simulação anonimizada (`status.anonimizado`) → NUNCA foto (monograma), salvo `real` (dados reais do 1º turno).
 *    As corridas anônimas (`anonimizarRace`) também já chegam sem `sqcand`/`fotoGrupo`: dupla proteção.
 *  - Números SIMULADOS (fonte 'simulacao', corrida do 2º turno, fora da fase 'pre') → NUNCA foto, mesmo com os nomes
 *    reais ligados no admin: foto oficial ao lado de número fictício é o que um print levaria adiante (ARCHITECTURE
 *    §11). Continuam com foto: 1º turno oficial, fase 'pre' (ainda sem números), fichas/cargos e a fonte 'tse'.
 *  - "Tudo ou nada": se faltar a foto de UM dos finalistas, nenhum aparece com foto — os dois recebem o mesmo
 *    tratamento (nunca um rosto contra um monograma).
 *
 * Devolve um array alinhado com `race.candidatos` (undefined = use o monograma). "Outros" nunca tem foto.
 */
import { useMemo } from 'react';
import type { Candidate, LiveStatus, Race } from '@/shared/types';
import { useStatus } from '@/app/data/hooks';
import { useFotos } from '@/app/data/estatico';

const VAZIO: (string | undefined)[] = [];

export interface FotosOpts {
  /** Dados reais (1º turno, fichas): permite foto mesmo com a simulação anonimizada. */
  real?: boolean;
  /** Desliga (ex.: imagem de compartilhamento simulada). */
  desligado?: boolean;
}

/**
 * true quando os números desta corrida são simulados e já existem (fonte 'simulacao', 2º turno, fora da fase 'pre').
 * Corrida sem `turno` conhecido conta como simulada (na dúvida, sem foto).
 */
export function numerosSimulados(status: Pick<LiveStatus, 'simulacao' | 'fase'> | undefined, race: Partial<Pick<Race, 'turno'>> | undefined | null): boolean {
  return !!status?.simulacao && status.fase !== 'pre' && race?.turno !== 1;
}

/** Fotos dos candidatos de uma corrida (mesma ordem de `race.candidatos`). */
export function useFotosRace(race: (Pick<Race, 'candidatos'> & Partial<Pick<Race, 'turno'>>) | undefined | null, opts: FotosOpts = {}): (string | undefined)[] {
  const { data: status } = useStatus();
  const anonimizado = !!status?.anonimizado;
  // Sem o status ainda (1ª carga) não dá para saber se os números são simulados: espera, em vez de arriscar um
  // rosto ao lado de número fictício por um instante.
  const simulado = !opts.real && (!status || numerosSimulados(status, race));
  const bloqueado = opts.desligado || (anonimizado && !opts.real) || simulado || !race;
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
