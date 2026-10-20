/**
 * Dados da área de pesquisas no app: `GET /api/pesquisas` (servidor: semente + painel, já validadas) ou, no build demo
 * (sem servidor), a semente `data/pesquisas.json` validada aqui com o mesmo contrato (src/shared/pesquisas.ts).
 * A fase da área (lista · dia da votação · resultado · oculta) vem do relógio do SERVIDOR (o do status), como o kit de
 * compartilhar e o Palpite.
 */
import { useQuery } from '@tanstack/react-query';
import { useStatus } from '@/app/data/hooks';
import { assetUrl } from '@/app/lib/assets';
import { useNow } from '@/app/lib/useNow';
import {
  fasePesquisas,
  mesclarPesquisas,
  mostrarBlocoPesquisas,
  validaPesquisa,
  type FasePesquisas,
  type Pesquisa,
  type PesquisasPublicas,
} from '@/shared/pesquisas';
import { diaDeVotacaoAntesDas17 } from '@/shared/diaVotacao';

export const CHAVE_PESQUISAS = ['pesquisas'] as const;

async function baixarPesquisas(): Promise<PesquisasPublicas> {
  if (__DEMO__) {
    const r = await fetch(assetUrl('data/pesquisas.json'), { credentials: 'omit' });
    if (!r.ok) return { pesquisas: [], versao: 'sem-semente' };
    const bruto = (await r.json()) as unknown;
    const itens: unknown[] = Array.isArray(bruto) ? bruto : ((bruto as { pesquisas?: unknown[] })?.pesquisas ?? []);
    const validas: Pesquisa[] = [];
    for (const it of itens) {
      const v = validaPesquisa(it);
      if ('ok' in v) validas.push(v.ok);
    }
    if (diaDeVotacaoAntesDas17(Date.now())) return { pesquisas: [], versao: 'dia-da-votacao', suspensas: true };
    return { pesquisas: mesclarPesquisas(validas, []), versao: 'demo' };
  }
  const r = await fetch('/api/pesquisas', { credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (!r.ok) throw Object.assign(new Error(`Erro ${r.status}`), { status: r.status });
  return (await r.json()) as PesquisasPublicas;
}

/** Lista publicada (mais recente primeiro). `ativo` = false não consulta (ex.: área oculta). */
export function usePesquisas(ativo = true) {
  return useQuery<PesquisasPublicas>({
    queryKey: CHAVE_PESQUISAS,
    queryFn: baixarPesquisas,
    enabled: ativo,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: 3 * 60_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });
}

/** Relógio do servidor (status) agora, revisto a cada `ms`. Sem status, o do aparelho. */
export function useAgoraServidorPesquisas(ms = 30_000): number {
  const q = useStatus();
  const local = useNow(ms);
  const st = q.data;
  return st && q.dataUpdatedAt && Number.isFinite(st.wallNow) ? local + (st.wallNow - q.dataUpdatedAt) : local;
}

/** Fase da área agora + se o bloco da home/apuração aparece. */
export function useFasePesquisas(): { fase: FasePesquisas; bloco: boolean; agora: number; pronto: boolean } {
  const q = useStatus();
  const agora = useAgoraServidorPesquisas();
  const st = q.data;
  const estado = { agora, fonte: st?.fonte, fase: st?.fase, simulacao: st?.simulacao, anonimizado: st?.anonimizado };
  return { fase: fasePesquisas(estado), bloco: !!st && mostrarBlocoPesquisas(estado), agora, pronto: !!st };
}
