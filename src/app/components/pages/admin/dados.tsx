/**
 * Camada de dados do admin: snapshot do painel (poll de ~1 s), execução de comandos com estado de
 * carregamento por ação, toasts e confirmação. Funciona igual com o cliente HTTP (produção) e o local (demo):
 * só usa a interface `ApuracaoClient`.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCommand, AdminSnapshot } from '@/shared/api';
import type { NationalSnapshot, PresetInfo, Race } from '@/shared/types';
import { getClient } from '@/app/data/client';
import { anonimizarTexto, useAnonimizado, useMeta } from '@/app/data/hooks';
import { toast } from '@/app/ui';
import { mensagemErro, naoAutorizado, type SecaoId } from './rotulos';

export const CHAVE_SNAPSHOT = ['admin', 'snapshot'] as const;

export interface SnapshotRecebido {
  snap: AdminSnapshot;
  /** Instante local (Date.now) em que chegou — base da interpolação do relógio. */
  recebidoEm: number;
  /** Ida e volta da chamada (ms). */
  latenciaMs: number;
}

/** Histórico curto (lado do cliente) para as mini-séries do monitor. */
export interface AmostraMonitor {
  t: number;
  latenciaMs: number;
  req: number;
  calcMs: number;
}
const amostras: AmostraMonitor[] = [];
const MAX_AMOSTRAS = 120;

/** Snapshot do painel, atualizado a cada ~1 s enquanto logado. */
export function useSnapshotAdmin(ativo: boolean) {
  const qc = useQueryClient();
  return useQuery<SnapshotRecebido>({
    queryKey: CHAVE_SNAPSHOT,
    enabled: ativo,
    queryFn: async () => {
      const c = await getClient();
      const t0 = performance.now();
      const snap = await c.admin.state();
      const latenciaMs = performance.now() - t0;
      const atual = qc.getQueryData<SnapshotRecebido>(CHAVE_SNAPSHOT);
      // Resposta atrasada (ex.: chegou depois do resultado de um comando): mantém o estado mais novo.
      if (atual && snap.state.versao < atual.snap.state.versao) return atual;
      amostras.push({
        t: Date.now(),
        latenciaMs,
        req: snap.metrics.requisicoesUltimoMinuto,
        calcMs: snap.metrics.ultimoCalculoMs,
      });
      if (amostras.length > MAX_AMOSTRAS) amostras.splice(0, amostras.length - MAX_AMOSTRAS);
      return { snap, recebidoEm: Date.now(), latenciaMs };
    },
    refetchInterval: (q) => (q.state.error && naoAutorizado(q.state.error) ? false : 1000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: (n, e) => !naoAutorizado(e) && n < 1,
    retryDelay: 800,
    staleTime: 0,
    gcTime: 0,
  });
}

export const amostrasMonitor = () => amostras;

/**
 * Snapshot nacional de uma corrida, com poll de 1 s (mesma chave de cache de `useNacional`).
 * Como `useNacional`, troca os nomes reais por "Candidato A/B" nos eventos quando a simulação está anonimizada.
 */
export function useNacionalAdmin(race: string, ativo = true, intervalo = 1000) {
  const anon = useAnonimizado();
  const { data: meta } = useMeta();
  const select = useCallback(
    (d: NationalSnapshot): NationalSnapshot =>
      anon && meta
        ? {
            ...d,
            eventos: d.eventos.map((e) => ({
              ...e,
              titulo: anonimizarTexto(e.titulo, meta.races),
              detalhe: e.detalhe ? anonimizarTexto(e.detalhe, meta.races) : e.detalhe,
            })),
          }
        : d,
    [anon, meta],
  );
  return useQuery<NationalSnapshot, Error, NationalSnapshot>({
    queryKey: ['nacional', race],
    queryFn: async () => (await getClient()).nacional(race),
    enabled: ativo,
    refetchInterval: intervalo,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    select,
  });
}

export function usePresets(ativo: boolean, seed: number | undefined) {
  return useQuery<PresetInfo[]>({
    queryKey: ['admin', 'presets', seed],
    queryFn: async () => (await getClient()).admin.presets(),
    enabled: ativo && seed !== undefined,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

// ---- contexto do painel ------------------------------------------------------------------------------

export interface ConfirmOpts {
  titulo: string;
  descricao?: ReactNode;
  corpo?: ReactNode;
  confirmar?: string;
  /** Ação destrutiva (botão de confirmação em tom de alerta). */
  perigo?: boolean;
}

export interface RunOpts {
  /** Chave do estado de carregamento (padrão: o tipo do comando). */
  chave?: string;
  /** Toast de sucesso (texto ou função do resultado). */
  sucesso?: string | ((snap: AdminSnapshot, ms: number) => string);
}

export interface AdminCtx {
  dados: SnapshotRecebido;
  snap: AdminSnapshot;
  /** Corridas para exibição (useRaces: "Candidato A/B" quando a simulação está anonimizada). */
  races: Race[] | undefined;
  pres: Race | undefined;
  /** Nomes ocultos na simulação (LiveStatus.anonimizado). */
  anon: boolean;
  /** Snapshot nacional de Presidente (2º turno). */
  nacional: NationalSnapshot | undefined;
  /** Último poll falhou (servidor fora do ar): os dados exibidos são os últimos conhecidos. */
  offline: boolean;
  run: (cmd: AdminCommand, opts?: RunOpts) => Promise<AdminSnapshot | null>;
  pendente: (chave: string) => boolean;
  /** Desde quando (performance.now) a ação está pendente; null se não está. */
  pendenteDesde: (chave: string) => number | null;
  confirmar: (o: ConfirmOpts) => Promise<boolean>;
  secao: SecaoId;
  irPara: (s: SecaoId) => void;
  sair: () => void;
  abrirAtalhos: () => void;
}

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdmin fora do AdminProvider');
  return c;
}

export const AdminProvider = Ctx.Provider;

/** Executor de comandos com carregamento por chave, toasts e tratamento de sessão expirada. */
export function useExecutor(onSessaoExpirada: () => void) {
  const qc = useQueryClient();
  const [pend, setPend] = useState<Record<string, number>>({});
  const expirou = useRef(onSessaoExpirada);
  expirou.current = onSessaoExpirada;

  const run = useCallback(
    async (cmd: AdminCommand, opts: RunOpts = {}): Promise<AdminSnapshot | null> => {
      const chave = opts.chave ?? cmd.tipo;
      setPend((p) => ({ ...p, [chave]: performance.now() }));
      try {
        await qc.cancelQueries({ queryKey: CHAVE_SNAPSHOT });
        const c = await getClient();
        const t0 = performance.now();
        const snap = await c.admin.command(cmd);
        const ms = performance.now() - t0;
        qc.setQueryData<SnapshotRecebido>(CHAVE_SNAPSHOT, { snap, recebidoEm: Date.now(), latenciaMs: ms });
        // as telas públicas (prévia, placar) refazem as consultas já
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'admin' && q.queryKey[0] !== 'meta' });
        if (opts.sucesso) {
          toast(typeof opts.sucesso === 'function' ? opts.sucesso(snap, ms) : opts.sucesso, { tone: 'ok' });
        }
        return snap;
      } catch (e) {
        if (naoAutorizado(e)) {
          toast('Sua sessão expirou. Entre de novo.', { tone: 'alert' });
          expirou.current();
        } else {
          toast(mensagemErro(e), { tone: 'alert', duracao: 5000 });
        }
        return null;
      } finally {
        setPend((p) => {
          const n = { ...p };
          delete n[chave];
          return n;
        });
      }
    },
    [qc],
  );

  const pendente = useCallback((chave: string) => chave in pend, [pend]);
  const pendenteDesde = useCallback((chave: string) => pend[chave] ?? null, [pend]);
  return useMemo(() => ({ run, pendente, pendenteDesde }), [run, pendente, pendenteDesde]);
}
