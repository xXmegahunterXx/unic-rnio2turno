/**
 * Hooks de dados do app (React Query). Toda tela usa estes hooks — nunca fetch direto.
 * O intervalo de atualização acompanha a fase da apuração (LiveStatus).
 *
 * "Reveja a noite" (contrato `Instante`): os hooks de apuração aceitam `t` (epoch ms, opcional) no fim. Ausente =
 * agora (com polling). Com `t`: o instante truncado ao segundo entra na chave e NÃO há polling — o passado não
 * muda; uma mudança de `versao` no admin invalida tudo (useStatus). Instante futuro é limitado ao agora pela fonte.
 */
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FeedEvent, LiveStatus, Race, RaceId, UF } from '@/shared/types';
import type { PublicMeta } from '@/shared/api';
import { anonimizarRace, anonimizarTexto } from '@/shared/anon';

export { anonimizarRace, anonimizarTexto };
import { getClient } from './client';

const STATUS_MS = 2000;

/** Instante pedido, truncado ao segundo (chave estável, igual ao `?t=` do cliente HTTP), ou undefined (agora). */
export function instanteChave(t?: number | null): number | undefined {
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? Math.floor(t / 1000) * 1000 : undefined;
}

/** Chave de consulta: sem `t`, a mesma de sempre; com `t`, o instante no fim. */
const chave = (base: unknown[], t: number | undefined) => (t === undefined ? base : [...base, t]);
/** Com instante passado, sem polling. */
const pollOu = (t: number | undefined, ms: number | false) => (t === undefined ? ms : false);

/** Estado ao vivo (fonte, fase, relógio, aviso, versão). Invalida todo o cache quando `versao` muda. */
export function useStatus() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['status'],
    queryFn: async () => (await getClient()).status(),
    refetchInterval: STATUS_MS,
    refetchIntervalInBackground: false,
    staleTime: 1000,
  });
  const versao = useRef<number | null>(null);
  useEffect(() => {
    const v = q.data?.versao;
    if (v === undefined) return;
    if (versao.current !== null && versao.current !== v) {
      qc.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'status' });
    }
    versao.current = v;
  }, [q.data?.versao, qc]);
  return q;
}

/** Intervalo de polling por nível de detalhe, conforme a fase. */
export function pollMs(status: LiveStatus | undefined, nivel: 'br' | 'uf' | 'mun' | 'zona'): number | false {
  if (!status) return false;
  if (status.fase !== 'apurando' || status.pausado || status.congelado) return nivel === 'br' ? 15000 : 30000;
  const base = { br: 2500, uf: 4000, mun: 6000, zona: 8000 }[nivel];
  return status.velocidade >= 20 ? Math.max(1500, base / 2) : base;
}

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: async () => (await getClient()).meta(),
    staleTime: Infinity,
  });
}

// ---------------------------------------------------------------------------------------------
// Anonimização da SIMULAÇÃO
// Na fonte 'simulacao', por padrão (LiveStatus.anonimizado), os candidatos aparecem como "Candidato A/B":
// números fictícios nunca circulam (em prints) associados a candidatos reais. O admin pode exibir os nomes
// reais para demonstrações internas (comando 'nomes-reais'). TODA tela de apuração deve obter as corridas
// por `useRace`/`useRaces` (nunca direto de `useMeta`) e os eventos já chegam com os nomes trocados.
// O Teste Cego usa propostas reais e NÃO passa por aqui (usa os candidatos reais de `useMeta`).
// ---------------------------------------------------------------------------------------------

const anonimizarEventos = (eventos: FeedEvent[], races: Race[]) =>
  eventos.map((e) => ({
    ...e,
    titulo: anonimizarTexto(e.titulo, races),
    detalhe: e.detalhe ? anonimizarTexto(e.detalhe, races) : e.detalhe,
  }));

/** true quando a simulação está com nomes ocultos. */
export function useAnonimizado(): boolean {
  const { data } = useStatus();
  return !!data?.anonimizado;
}

/** Corridas para exibição na apuração (anônimas quando `status.anonimizado`). */
export function useRaces(): Race[] | undefined {
  const { data: meta } = useMeta();
  const anon = useAnonimizado();
  return useMemo(() => (meta ? (anon ? meta.races.map(anonimizarRace) : meta.races) : undefined), [meta, anon]);
}

/** Uma corrida para exibição (anônima quando `status.anonimizado`). */
export function useRace(id: RaceId | undefined): Race | undefined {
  const races = useRaces();
  return useMemo(() => races?.find((r) => r.id === id), [races, id]);
}

/** `select` do React Query que troca nomes nos eventos quando anonimizado. */
function useSelectEventos<T extends { eventos: FeedEvent[] }>() {
  const anon = useAnonimizado();
  const { data: meta } = useMeta();
  return useCallback(
    (d: T): T => (anon && meta ? { ...d, eventos: anonimizarEventos(d.eventos, (meta as PublicMeta).races) } : d),
    [anon, meta],
  );
}

export function useNacional(race: RaceId, t?: number) {
  const { data: status } = useStatus();
  const select = useSelectEventos<Awaited<ReturnType<Awaited<ReturnType<typeof getClient>>['nacional']>>>();
  const tk = instanteChave(t);
  return useQuery({
    queryKey: chave(['nacional', race], tk),
    queryFn: async () => (await getClient()).nacional(race, tk === undefined ? undefined : { t: tk }),
    refetchInterval: pollOu(tk, pollMs(status, 'br')),
    placeholderData: keepPreviousData,
    select,
  });
}

/** Mapa nacional por município (5.571 posições, ordem de public/data/municipios-br.json). Sem nomes: não anonimiza. */
export function useMunicipiosBr(race: RaceId, t?: number, enabled = true) {
  const { data: status } = useStatus();
  const tk = instanteChave(t);
  return useQuery({
    queryKey: chave(['brmun', race], tk),
    queryFn: async () => (await getClient()).municipiosBr(race, tk === undefined ? undefined : { t: tk }),
    enabled,
    refetchInterval: pollOu(tk, pollMs(status, 'uf')),
    placeholderData: keepPreviousData,
  });
}

export function useUf(race: RaceId, uf: UF | undefined, t?: number) {
  const { data: status } = useStatus();
  const select = useSelectEventos<Awaited<ReturnType<Awaited<ReturnType<typeof getClient>>['uf']>>>();
  const tk = instanteChave(t);
  return useQuery({
    queryKey: chave(['uf', race, uf], tk),
    queryFn: async () => (await getClient()).uf(race, uf!, tk === undefined ? undefined : { t: tk }),
    enabled: !!uf,
    refetchInterval: pollOu(tk, pollMs(status, 'uf')),
    placeholderData: keepPreviousData,
    select,
  });
}

export function useMunicipio(race: RaceId, uf: UF | undefined, cod: string | undefined, t?: number) {
  const { data: status } = useStatus();
  const tk = instanteChave(t);
  return useQuery({
    queryKey: chave(['mun', race, uf, cod], tk),
    queryFn: async () => (await getClient()).municipio(race, uf!, cod!, tk === undefined ? undefined : { t: tk }),
    enabled: !!uf && !!cod,
    refetchInterval: pollOu(tk, pollMs(status, 'mun')),
    placeholderData: keepPreviousData,
  });
}

export function useZona(race: RaceId, uf: UF | undefined, cod: string | undefined, zona: number | undefined, t?: number) {
  const { data: status } = useStatus();
  const tk = instanteChave(t);
  return useQuery({
    queryKey: chave(['zona', race, uf, cod, zona], tk),
    queryFn: async () => (await getClient()).zona(race, uf!, cod!, zona!, tk === undefined ? undefined : { t: tk }),
    enabled: !!uf && !!cod && zona !== undefined,
    refetchInterval: pollOu(tk, pollMs(status, 'zona')),
    placeholderData: keepPreviousData,
  });
}

export function useSecao(race: RaceId, uf?: UF, cod?: string, zona?: number, secao?: number, t?: number) {
  const { data: status } = useStatus();
  const tk = instanteChave(t);
  return useQuery({
    queryKey: chave(['secao', race, uf, cod, zona, secao], tk),
    queryFn: async () => (await getClient()).secao(race, uf!, cod!, zona!, secao!, tk === undefined ? undefined : { t: tk }),
    enabled: !!uf && !!cod && zona !== undefined && secao !== undefined,
    refetchInterval: pollOu(tk, pollMs(status, 'zona')),
  });
}
