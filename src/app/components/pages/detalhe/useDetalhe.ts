/**
 * Contexto comum das páginas de detalhe (UF, município, seção): corrida efetiva, fase da apuração,
 * relógio e utilitários de URL/erros.
 *
 * Regras da corrida exibida:
 *  - `?race=` é validado contra o meta e contra a UF (governador só na própria UF; exterior só Presidente).
 *  - Na fase 'pre' (antes das 17h de 25/10 ou fonte 'pre') mostramos o 1º TURNO REAL (`-t1`)
 *    automaticamente; a URL continua com a "família" (pres, gov-rj) para que, quando a apuração começar,
 *    a página passe sozinha ao 2º turno.
 *  - Um link explícito para `-t1` durante a apuração é respeitado (com aviso e atalho para o 2º turno).
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Fase, LiveStatus, Race, RaceId, UF } from '@/shared/types';
import { UFS } from '@/shared/types';
import type { PublicMeta } from '@/shared/api';
import { useMeta, useStatus } from '@/app/data/hooks';
import { useRaceParam } from '@/app/lib/useRaceParam';
import { useSimNow } from '@/app/lib/useNow';

export const familia = (id: RaceId) => id.replace(/-t1$/, '');
export const ehT1 = (id: RaceId) => id.endsWith('-t1');

/** 'sp' → 'SP'; 'zz' → 'ZZ'; inválida → null. */
export function parseUf(raw: string | undefined): UF | null {
  if (!raw) return null;
  const U = raw.toUpperCase();
  if (U === 'ZZ') return 'ZZ';
  return (UFS as readonly string[]).includes(U) ? (U as UF) : null;
}

/** Erro de escopo inexistente (NotFoundError do motor/cliente HTTP, ou status 404). */
export function ehNaoEncontrado(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as { name?: string; status?: number };
  return x.name === 'NotFoundError' || x.status === 404;
}

/** Monta `?race=` (omitido para 'pres') + outros parâmetros. */
export function qs(race: RaceId, extra?: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  if (race && race !== 'pres') p.set('race', race);
  for (const [k, v] of Object.entries(extra ?? {})) if (v !== null && v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const rotaUf = (uf: UF, race: RaceId) => `/apuracao/${uf.toLowerCase()}${qs(race)}`;
export const rotaMun = (uf: UF, cod: string, race: RaceId, zona?: number | null) =>
  `/apuracao/${uf.toLowerCase()}/${cod}${qs(race, { zona: zona ?? undefined })}`;
export const rotaSecao = (uf: UF, cod: string, zona: number, secao: number, race: RaceId) =>
  `/apuracao/${uf.toLowerCase()}/${cod}/${zona}/${secao}${qs(race)}`;
/** Página nacional (governador não tem visão nacional: volta para Presidente). */
export const rotaBrasil = (race: RaceId) => `/apuracao${familia(race) === 'pres' ? qs(race) : ''}`;

export interface DetalheRace {
  meta: PublicMeta | undefined;
  status: LiveStatus | undefined;
  fase: Fase | undefined;
  /** Relógio da apuração interpolado (para contagens regressivas). */
  simNow: number | null;
  /** Corrida pedida (validada), como está/estará na URL. */
  pedida: RaceId;
  /** Corrida exibida (pode ser a de 1º turno na fase 'pre'). */
  id: RaceId;
  race: Race | undefined;
  /** A corrida exibida é de 1º turno. */
  t1: boolean;
  /** 1º turno forçado pela fase 'pre'. */
  autoT1: boolean;
  /** Ids das duas versões da disputa. */
  idT1: RaceId;
  idT2: RaceId;
  raceT1: Race | undefined;
  raceT2: Race | undefined;
  /** Governador desta UF no 2º turno (se houver). */
  temGov: boolean;
  /** Números simulados (marca SIMULAÇÃO). O 1º turno é dado oficial: nunca simulado. */
  simulado: boolean;
  /** Troca a corrida (grava a família na URL durante a fase 'pre'). */
  setRace: (id: RaceId) => void;
}

export function useDetalheRace(uf: UF | null): DetalheRace {
  const [param, setParam] = useRaceParam();
  const { data: meta } = useMeta();
  const statusQ = useStatus();
  const status = statusQ.data;
  const simNow = useSimNow(status, statusQ.dataUpdatedAt);
  const fase = status?.fase;

  const pedida = useMemo(() => {
    let id = param || 'pres';
    if (meta) {
      const r = meta.races.find((x) => x.id === id);
      const ok = !!r && (r.abrangencia === 'BR' || (!!uf && r.abrangencia === uf)) && (!uf || r.ufs.includes(uf));
      if (!ok) id = ehT1(id) ? 'pres-t1' : 'pres';
    }
    return id;
  }, [param, meta, uf]);

  const autoT1 = fase === 'pre' && !ehT1(pedida);
  const id = autoT1 ? `${pedida}-t1` : pedida;
  const idT2 = familia(id);
  const idT1 = `${idT2}-t1`;
  const race = meta?.races.find((x) => x.id === id);
  const raceT1 = meta?.races.find((x) => x.id === idT1);
  const raceT2 = meta?.races.find((x) => x.id === idT2);
  const temGov = !!uf && !!meta?.races.some((x) => x.cargo === 'Governador' && x.turno === 2 && x.abrangencia === uf);
  const t1 = ehT1(id);

  const setRace = useCallback(
    (next: RaceId) => {
      // Na fase 'pre' a página já soma "-t1"; a URL guarda só a família.
      setParam(fase === 'pre' ? familia(next) : next);
    },
    [setParam, fase],
  );

  return {
    meta,
    status,
    fase,
    simNow,
    pedida,
    id,
    race,
    t1,
    autoT1,
    idT1,
    idT2,
    raceT1,
    raceT2,
    temGov,
    simulado: !!status?.simulacao && !t1,
    setRace,
  };
}

/** Lê `?zona=` como número (ou null). */
export function useZonaParam(): [number | null, (z: number | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('zona');
  const z = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const set = useCallback(
    (next: number | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === null) p.delete('zona');
          else p.set('zona', String(next));
          return p;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );
  return [z, set];
}

/** "Presidente" / "Governador" + local: título do placar nas páginas de detalhe. */
export function tituloPlacar(race: Race, local: string): string {
  return race.cargo === 'Presidente' ? `Presidente · ${local}` : `Governador · ${local}`;
}
