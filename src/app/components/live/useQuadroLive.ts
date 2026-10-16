/**
 * Dados de um layout da live: a mesma fonte e o MESMO polling da apuração (useStatus + useNacional — 2,5 s apurando,
 * 15 s fora dela), as mesmas regras de anonimização (useRace) e de fotos (useFotosRace: nunca na simulação nem ao
 * lado de número simulado; tudo ou nada entre os finalistas). Na fase 'pre', o 1º turno oficial e a contagem.
 * Ao perder a conexão, o React Query mantém o último dado na tela e segue tentando (a live nunca fica em branco).
 *
 * Estado fixo (I25, `?uf=pe`, só Presidente): o placar é o do snapshot da UF (useUf — o mesmo que a página da UF e o
 * mapa da live já pedem, então vem do cache), sem "eleito" (o resultado de um estado não elege ninguém) e o QR leva à
 * apuração daquele estado.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LiveStatus, RaceId, UF } from '@/shared/types';
import { useNacional, useRace, useStatus, useUf } from '@/app/data/hooks';
import { sitePublico, urlCompartilhada, urlNoSite } from '@/app/lib/share';
import { useNow } from '@/app/lib/useNow';
import { useFotosRace } from '@/app/components/apuracao/fotos';
import { DOMINIO_PADRAO, lerUfLive } from './opcoes';
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

/** Rota da apuração completa daquela disputa — ou do estado fixo (alvo do QR Code). */
export function rotaApuracao(race: string, uf?: UF | null): string {
  if (race.startsWith('gov-')) return `/apuracao/${race.slice(4)}?race=${race}`;
  return uf ? `/apuracao/${uf.toLowerCase()}` : '/apuracao';
}

/** Endereço do QR Code da live: a apuração da disputa (ou do estado), com `utm_source=live` (I08). Puro (testado). */
export function urlQrLive(site: string, race: string, uf?: UF | null): string {
  return urlCompartilhada(urlNoSite(site, rotaApuracao(race, uf)), 'live');
}

/**
 * Relógio da apuração agora, a partir do último status (também na fase 'pre', para a contagem regressiva andar a cada
 * segundo entre uma consulta e outra). Pausado/congelado: parado. Puro (testado).
 */
export function relogioLive(status: Pick<LiveStatus, 'simNow' | 'pausado' | 'congelado' | 'velocidade'>, recebidoEm: number, agora: number): number {
  if (status.pausado || status.congelado) return status.simNow;
  return status.simNow + Math.max(0, agora - recebidoEm) * (status.velocidade || 1);
}

/**
 * `ufFixa`: estado fixo (I25); sem o argumento, o `?uf=` da URL da /live (a página só passa a disputa).
 */
export function useQuadroLive(race: string, ufFixa?: UF | null): QuadroLive | null {
  const [params] = useSearchParams();
  const ufUrl = lerUfLive(params.get('uf'));
  const statusQ = useStatus();
  const status = statusQ.data;
  const pre = status?.fase === 'pre';
  const raceId = (pre ? `${race}-t1` : race) as RaceId;
  // estado fixo só em Presidente (a disputa de governador já é de uma UF)
  const uf = race === 'pres' ? (ufFixa === undefined ? ufUrl : ufFixa) : null;
  const corrida = useRace(raceId);
  const q = useNacional(raceId);
  const dados = q.data && q.data.race === raceId ? q.data : undefined;
  const ufQ = useUf(raceId, uf ?? undefined);
  const ufSnap = uf && ufQ.data && ufQ.data.race === raceId && ufQ.data.uf === uf ? ufQ.data : undefined;
  const fotos = useFotosRace(corrida, { real: corrida?.turno === 1 });
  const agora = useNow(1000);
  const { site, dominio } = useMemo(siteDaLive, []);
  const urlQr = useMemo(() => urlQrLive(site, race, uf), [site, race, uf]);

  if (!status || !corrida) return null;
  // antes do 1º dado (do Brasil ou do estado fixo): nada
  const resumo = uf ? (ufSnap ? { ...ufSnap.resumo, eleito: null } : undefined) : dados?.resumo;
  if (!resumo) return null;
  const t1 = corrida.turno === 1;
  const relogio = relogioLive(status, statusQ.dataUpdatedAt || agora, agora);
  return {
    race: corrida,
    resumo,
    ufs: uf ? undefined : dados?.ufs,
    uf,
    pre,
    t1,
    simulado: !!status.simulacao && !t1,
    aoVivo: status.fase === 'apurando' && !status.pausado && !status.congelado,
    fotos,
    faltaMs: pre ? status.inicioApuracao - relogio : null,
    atualizadoEm: t1 ? null : resumo.ultimaAtualizacao,
    dominio,
    urlQr,
    pessoasAgora: typeof status.pessoasAgora === 'number' ? status.pessoasAgora : null,
  };
}
