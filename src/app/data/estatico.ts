/**
 * Dados ESTÁTICOS da fase 2 (public/data/**, public/geo/**): carregados uma vez e guardados no cache do
 * React Query (staleTime infinito). Funciona igual em produção e no preview (assetUrl resolve o caminho).
 * Formatos em src/shared/dataset.ts (seção "FASE 2").
 */
import { useQuery } from '@tanstack/react-query';
import type {
  CandidatoFicha,
  CargoDataset,
  FotoPacote,
  GeoBrasilMunicipios,
  LocaisUfDataset,
  MunicipiosBr,
  PerfilUfDataset,
} from '@/shared/dataset';
import type { Candidate, UF } from '@/shared/types';
import { assetUrl } from '@/app/lib/assets';
import { useAnonimizado } from './hooks';

export class DadoIndisponivelError extends Error {
  constructor(public readonly caminho: string, public readonly status: number) {
    super(`Dado indisponível: ${caminho} (${status})`);
    this.name = 'DadoIndisponivelError';
  }
}

async function baixarJson<T>(caminho: string): Promise<T> {
  const r = await fetch(assetUrl(caminho), { credentials: 'omit' });
  if (!r.ok) throw new DadoIndisponivelError(caminho, r.status);
  return (await r.json()) as T;
}

/** Hook genérico: `caminho` relativo a public/ (ex.: 'data/cargos/senado.json'); null = desligado. */
export function useDadoEstatico<T>(caminho: string | null) {
  return useQuery({
    queryKey: ['estatico', caminho],
    queryFn: () => baixarJson<T>(caminho!),
    enabled: !!caminho,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: (n, e) => !(e instanceof DadoIndisponivelError && e.status === 404) && n < 2,
  });
}

const lower = (uf: UF | string) => uf.toLowerCase();

/** 'governador-t1' | 'senado' | 'camara' | 'assembleia' */
export const useCargo = (cargo: string | null) => useDadoEstatico<CargoDataset>(cargo ? `data/cargos/${cargo}.json` : null);
/** grupos: 'segundo-turno' | 'governadores' | 'senado' | 'camara-sp' | 'assembleia-sp' … */
export const useCandidatos = (grupo: string | null) =>
  useDadoEstatico<CandidatoFicha[] | { candidatos: CandidatoFicha[] }>(grupo ? `data/candidatos/${grupo}.json` : null);
export const useFotos = (grupo: string | null) => useDadoEstatico<FotoPacote>(grupo ? `data/fotos/${grupo}.json` : null);
export const useLocais = (uf: UF | null | undefined) => useDadoEstatico<LocaisUfDataset>(uf ? `data/locais/${lower(uf)}.json` : null);
export const usePerfil = (uf: UF | null | undefined) => useDadoEstatico<PerfilUfDataset>(uf ? `data/perfil/${lower(uf)}.json` : null);
export const useMunicipiosBrOrdem = (enabled = true) => useDadoEstatico<MunicipiosBr>(enabled ? 'data/municipios-br.json' : null);
export const useGeoBrMunicipios = (enabled = true) => useDadoEstatico<GeoBrasilMunicipios>(enabled ? 'geo/br-mun.json' : null);

/** Lista de fichas de um arquivo de candidatos (aceita array puro ou { candidatos }). */
export function fichasDe(d: CandidatoFicha[] | { candidatos: CandidatoFicha[] } | undefined): CandidatoFicha[] {
  if (!d) return [];
  return Array.isArray(d) ? d : d.candidatos ?? [];
}

/**
 * Foto oficial (data URI) de um candidato, ou undefined (use o monograma).
 * Regra: na simulação anonimizada NUNCA há foto — exceto quando `real` (ex.: Teste Cego, fichas e cargos do
 * 1º turno, que são dados reais e não números fictícios).
 */
export function useFotoCandidato(
  c: Pick<Candidate, 'sqcand' | 'fotoGrupo' | 'agregado'> | { sqcand?: string; fotoGrupo?: string; agregado?: boolean } | undefined,
  opts: { real?: boolean } = {},
): string | undefined {
  const anonimizado = useAnonimizado();
  const bloqueada = anonimizado && !opts.real;
  const grupo = !bloqueada && c && !c.agregado && c.sqcand && c.fotoGrupo ? c.fotoGrupo : null;
  const { data } = useFotos(grupo);
  return grupo && c?.sqcand ? data?.fotos?.[c.sqcand] : undefined;
}
