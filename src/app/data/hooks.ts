/**
 * Hooks de dados do app (React Query). Toda tela usa estes hooks — nunca fetch direto.
 * O intervalo de atualização acompanha a fase da apuração (LiveStatus).
 */
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { RaceId, UF, LiveStatus } from '@/shared/types';
import { getClient } from './client';

const STATUS_MS = 2000;

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

export function useNacional(race: RaceId) {
  const { data: status } = useStatus();
  return useQuery({
    queryKey: ['nacional', race],
    queryFn: async () => (await getClient()).nacional(race),
    refetchInterval: pollMs(status, 'br'),
    placeholderData: keepPreviousData,
  });
}

export function useUf(race: RaceId, uf: UF | undefined) {
  const { data: status } = useStatus();
  return useQuery({
    queryKey: ['uf', race, uf],
    queryFn: async () => (await getClient()).uf(race, uf!),
    enabled: !!uf,
    refetchInterval: pollMs(status, 'uf'),
    placeholderData: keepPreviousData,
  });
}

export function useMunicipio(race: RaceId, uf: UF | undefined, cod: string | undefined) {
  const { data: status } = useStatus();
  return useQuery({
    queryKey: ['mun', race, uf, cod],
    queryFn: async () => (await getClient()).municipio(race, uf!, cod!),
    enabled: !!uf && !!cod,
    refetchInterval: pollMs(status, 'mun'),
    placeholderData: keepPreviousData,
  });
}

export function useZona(race: RaceId, uf: UF | undefined, cod: string | undefined, zona: number | undefined) {
  const { data: status } = useStatus();
  return useQuery({
    queryKey: ['zona', race, uf, cod, zona],
    queryFn: async () => (await getClient()).zona(race, uf!, cod!, zona!),
    enabled: !!uf && !!cod && zona !== undefined,
    refetchInterval: pollMs(status, 'zona'),
    placeholderData: keepPreviousData,
  });
}

export function useSecao(race: RaceId, uf?: UF, cod?: string, zona?: number, secao?: number) {
  const { data: status } = useStatus();
  return useQuery({
    queryKey: ['secao', race, uf, cod, zona, secao],
    queryFn: async () => (await getClient()).secao(race, uf!, cod!, zona!, secao!),
    enabled: !!uf && !!cod && zona !== undefined && secao !== undefined,
    refetchInterval: pollMs(status, 'zona'),
  });
}
