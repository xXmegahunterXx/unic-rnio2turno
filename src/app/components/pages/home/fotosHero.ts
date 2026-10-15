/**
 * Fotos do HERO (Home e topo da apuração antes das 17h), onde o retrato aparece grande.
 *
 * Regras: as MESMAS de `useFotosRace` (src/app/components/apuracao/fotos.ts) — nunca na simulação anonimizada (salvo
 * `real`), nunca ao lado de número simulado (`numerosSimulados`), espera o status antes de decidir, e tudo ou nada entre
 * os finalistas. A diferença é o pacote: para Presidente lê `presidente-hd` (os arquivos originais do TSE, 161×225,
 * ~18 KB no total, baixados sob demanda), em vez do pacote do 2º turno inteiro (120×160, ~170 KB com os governadores).
 * Se o pacote HD faltar (dataset antigo) ou não tiver os dois finalistas, cai em `useFotosRace` (pacote normal).
 *
 * Devolve as fotos alinhadas com `race.candidatos` e o estado — 'carregando' enquanto ainda podem chegar (o retrato
 * mostra um quadro neutro, sem o monograma piscar antes da foto), 'fotos' ou 'sem' (use o monograma).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FotoPacote } from '@/shared/dataset';
import type { LiveStatus, Race } from '@/shared/types';
import { useStatus } from '@/app/data/hooks';
import { DadoIndisponivelError, useFotos } from '@/app/data/estatico';
import { assetUrl } from '@/app/lib/assets';
import { numerosSimulados, useFotosRace, type FotosOpts } from '@/app/components/apuracao/fotos';

/** Pacote em resolução original dos finalistas a Presidente (scripts/data/py/fotos_build.py → public/data/fotos). */
export const GRUPO_FOTOS_HD = 'presidente-hd';
const CAMINHO_HD = `data/fotos/${GRUPO_FOTOS_HD}.json`;

let antecipado: Promise<FotoPacote> | null = null;

/**
 * Baixa o pacote HD uma vez só (a promessa fica guardada; uma falha libera nova tentativa). A Home chama isto na
 * avaliação do próprio chunk — em paralelo com meta/status, antes do 1º render —, porque a foto é o maior elemento
 * da 1ª dobra (LCP). Baixar não é exibir: quem decide se a foto aparece é `useFotosHero`.
 */
export function anteciparFotosHd(): Promise<FotoPacote> {
  if (!antecipado) {
    antecipado = fetch(assetUrl(CAMINHO_HD), { credentials: 'omit' })
      .then(async (r) => {
        if (!r.ok) throw new DadoIndisponivelError(CAMINHO_HD, r.status);
        return (await r.json()) as FotoPacote;
      })
      .catch((e) => {
        antecipado = null;
        throw e;
      });
  }
  return antecipado;
}

/** O pacote HD no cache do React Query (mesma chave de `useFotos`/`useDadoEstatico`: um download só). */
function useFotosHd(ligado: boolean) {
  return useQuery({
    queryKey: ['estatico', ligado ? CAMINHO_HD : null],
    queryFn: anteciparFotosHd,
    enabled: ligado,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: (n, e) => !(e instanceof DadoIndisponivelError && e.status === 404) && n < 2,
  });
}

export type EstadoFotos = 'carregando' | 'fotos' | 'sem';

export interface FotosHero {
  fotos: (string | undefined)[];
  estado: EstadoFotos;
}

const SEM: FotosHero = { fotos: [], estado: 'sem' };
const CARREGANDO: FotosHero = { fotos: [], estado: 'carregando' };

/** Decide se a corrida pode ter foto agora (mesma regra de `useFotosRace`). Pura (testada). */
export function regraFotos(
  status: (Pick<LiveStatus, 'simulacao' | 'fase'> & { anonimizado?: boolean }) | undefined,
  race: (Pick<Race, 'candidatos'> & Partial<Pick<Race, 'turno'>>) | undefined | null,
  opts: FotosOpts = {},
): 'esperar' | 'liberada' | 'bloqueada' {
  if (opts.desligado) return 'bloqueada';
  if (!race) return 'esperar';
  if (opts.real) return 'liberada';
  if (!status) return 'esperar';
  if (status.anonimizado) return 'bloqueada';
  if (numerosSimulados(status, race)) return 'bloqueada';
  return 'liberada';
}

export function useFotosHero(race: Race | undefined, opts: FotosOpts = {}): FotosHero {
  const { data: status } = useStatus();
  const regra = regraFotos(status, race, opts);
  const finalistas = race ? race.candidatos.filter((c) => !c.agregado) : [];
  const elegivelHd = regra === 'liberada' && race?.cargo === 'Presidente' && finalistas.length > 0 && finalistas.every((c) => !!c.sqcand);
  const hd = useFotosHd(!!elegivelHd);
  const hdCompleto = !!hd.data?.fotos && finalistas.every((c) => !!hd.data!.fotos[c.sqcand!]);
  // Pacote normal só quando o HD não serve (corrida de governador, pacote ausente ou incompleto).
  const precisaNormal = regra === 'liberada' && (!elegivelHd || hd.isError || (!!hd.data && !hdCompleto));
  const normal = useFotosRace(race, { real: opts.real, desligado: !precisaNormal });
  const grupoNormal = precisaNormal ? (finalistas.find((c) => c.fotoGrupo)?.fotoGrupo ?? null) : null;
  const normalQ = useFotos(grupoNormal); // mesma chave de `useFotosRace`: só lê o estado, sem baixar de novo
  const d = hd.data;

  return useMemo<FotosHero>(() => {
    if (regra === 'esperar') return CARREGANDO;
    if (regra === 'bloqueada' || !race) return SEM;
    if (elegivelHd && !precisaNormal) {
      if (!d) return CARREGANDO;
      return { fotos: race.candidatos.map((c) => (c.agregado || !c.sqcand ? undefined : d.fotos[c.sqcand])), estado: 'fotos' };
    }
    if (normal.length) return { fotos: normal, estado: 'fotos' };
    if (grupoNormal && normalQ.isPending) return CARREGANDO;
    return SEM;
  }, [regra, race, elegivelHd, precisaNormal, d, normal, grupoNormal, normalQ.isPending]);
}
