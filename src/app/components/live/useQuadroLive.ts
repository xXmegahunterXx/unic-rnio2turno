/**
 * Dados de um layout da live: a mesma fonte e o MESMO polling da apuração (useStatus + useNacional — 2,5 s apurando,
 * 15 s fora dela), as mesmas regras de anonimização (useRace) e de fotos (useFotosRace: nunca na simulação nem ao
 * lado de número simulado; tudo ou nada entre os finalistas). Na fase 'pre', o 1º turno oficial e a contagem.
 * Ao perder a conexão, o React Query mantém o último dado na tela e segue tentando (a live nunca fica em branco).
 */
import { useMemo } from 'react';
import type { LiveStatus, RaceId } from '@/shared/types';
import { useNacional, useRace, useStatus } from '@/app/data/hooks';
import { sitePublico, urlNoSite } from '@/app/lib/share';
import { useNow } from '@/app/lib/useNow';
import { useFotosRace } from '@/app/components/apuracao/fotos';
import { DOMINIO_PADRAO } from './opcoes';
import type { QuadroLive } from './pecas';

/** Site público exibido na live (VITE_SITE_URL; sem ela, o endereço do produto). */
export function siteDaLive(): { site: string; dominio: string } {
  const site = sitePublico() || `https://${DOMINIO_PADRAO}`;
  let dominio = DOMINIO_PADRAO;
  try {
    dominio = new URL(site.replace(/#$/, '')).host.replace(/^www\./, '') || DOMINIO_PADRAO;
  } catch {
    /* fica o padrão */
  }
  return { site, dominio };
}

/** Rota da apuração completa daquela disputa (alvo do QR Code). */
export function rotaApuracao(race: string): string {
  return race.startsWith('gov-') ? `/apuracao/${race.slice(4)}?race=${race}` : '/apuracao';
}

/**
 * Relógio da apuração agora, a partir do último status (também na fase 'pre', para a contagem regressiva andar a cada
 * segundo entre uma consulta e outra). Pausado/congelado: parado. Puro (testado).
 */
export function relogioLive(status: Pick<LiveStatus, 'simNow' | 'pausado' | 'congelado' | 'velocidade'>, recebidoEm: number, agora: number): number {
  if (status.pausado || status.congelado) return status.simNow;
  return status.simNow + Math.max(0, agora - recebidoEm) * (status.velocidade || 1);
}

export function useQuadroLive(race: string): QuadroLive | null {
  const statusQ = useStatus();
  const status = statusQ.data;
  const pre = status?.fase === 'pre';
  const raceId = (pre ? `${race}-t1` : race) as RaceId;
  const corrida = useRace(raceId);
  const q = useNacional(raceId);
  const dados = q.data && q.data.race === raceId ? q.data : undefined;
  const fotos = useFotosRace(corrida, { real: corrida?.turno === 1 });
  const agora = useNow(1000);
  const { site, dominio } = useMemo(siteDaLive, []);
  const urlQr = useMemo(() => urlNoSite(site, rotaApuracao(race)), [site, race]);

  if (!status || !corrida || !dados) return null;
  const t1 = corrida.turno === 1;
  const relogio = relogioLive(status, statusQ.dataUpdatedAt || agora, agora);
  return {
    race: corrida,
    resumo: dados.resumo,
    ufs: dados.ufs,
    pre,
    t1,
    simulado: !!status.simulacao && !t1,
    aoVivo: status.fase === 'apurando' && !status.pausado && !status.congelado,
    fotos,
    faltaMs: pre ? status.inicioApuracao - relogio : null,
    atualizadoEm: t1 ? null : dados.resumo.ultimaAtualizacao,
    dominio,
    urlQr,
  };
}
