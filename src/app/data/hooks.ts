/**
 * Hooks de dados do app (React Query). Toda tela usa estes hooks — nunca fetch direto.
 * O intervalo de atualização acompanha a fase da apuração (LiveStatus).
 *
 * "Reveja a noite" (contrato `Instante`): os hooks de apuração aceitam `t` (epoch ms, opcional) no fim. Ausente =
 * agora (com polling). Com `t`: o instante truncado ao segundo entra na chave e NÃO há polling — o passado não
 * muda; uma mudança de `versao` no admin invalida tudo (useStatus). Instante futuro é limitado ao agora pela fonte.
 *
 * Fonte 'tse' ("mais rápido que a TV"): o status (a cada 2 s, CDN de 1 s) traz a marca dos números de cada disputa
 * (`LiveStatus.frescor`, ver `frescor.ts`); quando ela muda, o placar da disputa é reconsultado NA HORA, com a marca
 * nova no endereço. O polling do placar vira só uma rede de segurança.
 *
 * Freios da noite (leva 3, regras puras em `carga.ts`):
 *  - I37: `LiveStatus.carga` (comando 'freio' do painel) multiplica todos os intervalos (status e placar) por `fator`;
 *    com `leve`, o mapa municipal para de se atualizar (o "desde o 1º turno" e o chat leem o freio vigente de carga.ts).
 *  - I05: o status recua depois de falhas (4, 8, 16… até 30 s, com variação aleatória) e volta a 2 s no 1º sucesso;
 *    enquanto ele falha, o placar também não consulta mais rápido que ele. `useConexaoInstavel` alimenta a faixa
 *    "Conexão instável" (FaixaConexao, no AppShell).
 */
import { useQuery, useQueryClient, keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { FeedEvent, LiveStatus, Race, RaceId, UF } from '@/shared/types';
import type { PublicMeta } from '@/shared/api';
import { anonimizarRace, anonimizarTexto } from '@/shared/anon';

export { anonimizarRace, anonimizarTexto };
import { getClient } from './client';
import {
  CONEXAO_INICIAL,
  STATUS_MS,
  cargaVigenteAgora,
  comFreio,
  conexaoInstavel,
  definirCargaVigente,
  intervaloStatus,
  leveDe,
  registrarFalha,
  registrarSucesso,
  type EstadoConexao,
} from './carga';

/**
 * Prévia da /live dentro da /streamers (`?previa=1`, num iframe): busca os dados uma vez e não fica consultando — cinco
 * cópias do app na mesma página multiplicavam os pedidos ao servidor (e o trabalho do navegador). Na fonte do OBS de
 * verdade (sem `previa`), o polling é o de sempre.
 */
const SEM_POLLING = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const q = window.location.search || window.location.hash.split('?')[1] || '';
    return new URLSearchParams(q).get('previa') === '1';
  } catch {
    return false;
  }
})();

/** Marcas dos números já vistas nesta aba (uma reconsulta por mudança, não uma por componente que lê o status). */
const marcasVistas = new Map<string, string>();

// ---- conexão com o status (I05) e freio (I37) -------------------------------------------------------------------
// Estado de módulo (um por aba), atualizado DENTRO da consulta do status: os intervalos abaixo (`refetchInterval` em
// forma de função) leem daqui e ficam estáveis entre renderizações — a variação aleatória do recuo é sorteada uma vez
// por falha, não a cada render (o React Query reinicia o temporizador quando o valor muda).

let conexao: EstadoConexao = CONEXAO_INICIAL;
/** Espera até a próxima consulta do status (ms): 2 s × fator, ou o recuo depois de falhas. */
let atrasoStatus = STATUS_MS;

/** O que a faixa "Conexão instável" mostra; o objeto só muda quando muda o que aparece (poucas renderizações). */
export interface FaixaConexaoEstado {
  instavel: boolean;
  /** hora dos dados da última resposta boa (`simNow`; null = nenhuma ainda) */
  ultimoDado: number | null;
}
let faixa: FaixaConexaoEstado = { instavel: false, ultimoDado: null };
const ouvintesFaixa = new Set<() => void>();
/** Chave 'faixa-conexao' desligada no painel (`LiveStatus.semFaixaConexao`, do último status recebido): sem faixa. */
let semFaixa = false;
/**
 * Chave 'carimbo-print' desligada no painel (`LiveStatus.semCarimbo`, do último status recebido). Estado de módulo como
 * a faixa: o `CarimboPrint` lê por `useSemCarimbo()` sem depender do QueryClient (renderiza também fora do provedor).
 */
let semCarimbo = false;

function mudarConexao(e: EstadoConexao) {
  conexao = e;
  atrasoStatus = intervaloStatus(e.falhas, cargaVigenteAgora(), Math.random());
  const instavel = !semFaixa && conexaoInstavel(e);
  const ultimoDado = instavel ? e.ultimoDado : null;
  if (instavel !== faixa.instavel || ultimoDado !== faixa.ultimoDado) {
    faixa = { instavel, ultimoDado };
    for (const f of ouvintesFaixa) f();
  }
}

/** Consulta do status (a mesma na pré-carga e no hook): registra sucesso/falha para o recuo, a faixa e o freio. */
async function buscarStatus(): Promise<LiveStatus> {
  let s: LiveStatus;
  try {
    s = await (await getClient()).status();
  } catch (e) {
    mudarConexao(registrarFalha(conexao));
    throw e;
  }
  definirCargaVigente(s.carga);
  semFaixa = s.semFaixaConexao === true;
  // os ouvintes são os da faixa (um conjunto só, menos código no JS inicial): a faixa não muda e não renderiza de novo
  if ((s.semCarimbo === true) !== semCarimbo) {
    semCarimbo = !semCarimbo;
    for (const f of ouvintesFaixa) f();
  }
  mudarConexao(registrarSucesso(conexao, s.wallNow, Date.now(), s.simNow));
  return s;
}

/**
 * Opções da consulta do status. Sem as tentativas automáticas do React Query (o recuo acima faz esse papel) e com
 * `networkMode: 'always'`: sem rede, a consulta falha (e conta para a faixa) em vez de ficar parada em silêncio.
 */
const OPCOES_STATUS = {
  queryKey: ['status'],
  queryFn: buscarStatus,
  staleTime: 1000,
  retry: false,
  networkMode: 'always',
} as const;

/**
 * Versão do estado já vista nesta aba. Uma versão nova (aviso, anúncios, cenário…) invalida todos os dados — UMA vez por
 * aba: antes, cada componente que lê o status (dezenas) invalidava de novo, e cada invalidação cancelava e refazia os
 * pedidos em voo. Em produção a reconsulta sai espalhada em até `ESPALHA_VERSAO_MS` (ao acaso): numa noite com 100 mil
 * pessoas, um aviso publicado não vira uma rajada de todos os placares no mesmo segundo. O status em si não espera.
 */
let versaoVista: number | null = null;
const ESPALHA_VERSAO_MS = 2000;
let invalidacaoAgendada: ReturnType<typeof setTimeout> | null = null;

function agendarInvalidacao(qc: QueryClient) {
  if (invalidacaoAgendada !== null) return;
  const atraso = __DEMO__ ? 0 : Math.round(Math.random() * ESPALHA_VERSAO_MS);
  invalidacaoAgendada = setTimeout(() => {
    invalidacaoAgendada = null;
    void qc.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'status' });
  }, atraso);
}

/** Enquanto o status falha, o placar também espera o recuo (não martela um servidor que caiu). */
const comRecuo = (ms: number | false): number | false => (ms === false || conexao.falhas === 0 ? ms : Math.max(ms, atrasoStatus));

/** Faixa "Conexão instável" (FaixaConexao): 3 falhas seguidas ou relógio do servidor parado há 60 s. */
function ouvirFaixa(f: () => void) {
  ouvintesFaixa.add(f);
  return () => ouvintesFaixa.delete(f);
}

export function useConexaoInstavel(): FaixaConexaoEstado {
  return useSyncExternalStore(ouvirFaixa, () => faixa, () => faixa);
}

/** Chave 'carimbo-print' desligada no painel? (do último status recebido nesta aba; antes dele, false = ligado) */
export function useSemCarimbo(): boolean {
  return useSyncExternalStore(ouvirFaixa, () => semCarimbo, () => semCarimbo);
}

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
    ...OPCOES_STATUS,
    refetchInterval: SEM_POLLING ? false : () => atrasoStatus,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const v = q.data?.versao;
    if (v === undefined) return;
    // uma invalidação por mudança de versão na aba (não uma por componente que lê o status)
    if (versaoVista !== null && versaoVista !== v) agendarInvalidacao(qc);
    versaoVista = v;
  }, [q.data?.versao, qc]);
  // dado novo do TSE: reconsulta o placar da disputa já (cancelRefetch: o pedido em voo levava a marca anterior). As
  // regras (frescor.ts) só são baixadas quando o status traz a marca — fonte TSE —, fora do JS inicial.
  const frescor = q.data?.frescor;
  useEffect(() => {
    if (!frescor) return;
    let vivo = true;
    void import('./frescor').then(({ marcasQueMudaram }) => {
      if (!vivo) return;
      for (const race of marcasQueMudaram(marcasVistas, { frescor })) {
        void qc.invalidateQueries({ queryKey: ['nacional', race], exact: true });
        // governador: o placar da UF é o da disputa (página da UF)
        if (race.startsWith('gov-')) void qc.invalidateQueries({ queryKey: ['uf', race] });
      }
    });
    return () => {
      vivo = false;
    };
  }, [frescor, qc]);
  return q;
}

/**
 * Intervalo de polling por nível de detalhe, conforme a fase, já com o freio (`status.carga.fator`). Município a cada
 * 10 s (I04: a borda guarda o detalhe da fonte TSE por 10 s; consultar mais rápido não trazia nada novo).
 */
export function pollMs(status: LiveStatus | undefined, nivel: 'br' | 'uf' | 'mun' | 'zona'): number | false {
  if (!status || SEM_POLLING) return false;
  return comFreio(pollBase(status, nivel), status.carga);
}

function pollBase(status: LiveStatus, nivel: 'br' | 'uf' | 'mun' | 'zona'): number {
  if (status.fase !== 'apurando' || status.pausado || status.congelado) return nivel === 'br' ? 15000 : 30000;
  // fonte 'tse' com marca no status: o placar é reconsultado quando a marca muda (useStatus); o polling só garante
  if (nivel === 'br' && status.frescor) return 6000;
  const base = { br: 2500, uf: 4000, mun: 10000, zona: 8000 }[nivel];
  return status.velocidade >= 20 ? Math.max(1500, base / 2) : base;
}

/**
 * Pré-carga na entrada do app (main.tsx), antes de o chunk da página chegar: os dados que a rota aberta vai pedir de
 * qualquer jeito. `meta` sempre; o placar nacional do Presidente (2º e 1º turno — antes das 17h a página mostra o 1º)
 * em `/` e `/apuracao` (sem outra disputa na URL). Mesmas chaves e funções dos hooks: a página monta com os dados já em
 * cache, em vez de esperar o próprio chunk para só então pedir. Medido (celular emulado, CPU 4×, 4G lenta): ver relatório.
 */
export function preCarregarDadosDaRota(qc: QueryClient, pathname: string, search = '') {
  void qc.prefetchQuery({ queryKey: ['meta'], queryFn: async () => (await getClient()).meta(), staleTime: Infinity });
  // o status decide fotos, faixa de simulação e anúncios: pedido já, sem esperar o React montar o AppShell
  void qc.prefetchQuery(OPCOES_STATUS);
  const rota = pathname.replace(/\/+$/, '') || '/';
  const race = new URLSearchParams(search).get('race');
  const placarPres = rota === '/' || (rota === '/apuracao' && (!race || race === 'pres' || race === 'pres-t1'));
  if (!placarPres) return;
  for (const id of ['pres', 'pres-t1'] as RaceId[]) {
    void qc.prefetchQuery({ queryKey: ['nacional', id], queryFn: async () => (await getClient()).nacional(id) });
  }
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
    refetchInterval: () => comRecuo(pollOu(tk, pollMs(status, 'br'))),
    placeholderData: keepPreviousData,
    select,
  });
}

/**
 * Mapa nacional por município (5.571 posições, ordem de public/data/municipios-br.json). Sem nomes: não anonimiza.
 * Peça pesada: no modo leve do freio (I37) para de se atualizar — o mapa já carregado continua na tela.
 */
export function useMunicipiosBr(race: RaceId, t?: number, enabled = true) {
  const { data: status } = useStatus();
  const tk = instanteChave(t);
  return useQuery({
    queryKey: chave(['brmun', race], tk),
    queryFn: async () => (await getClient()).municipiosBr(race, tk === undefined ? undefined : { t: tk }),
    enabled,
    refetchInterval: () => comRecuo(pollOu(tk, leveDe(status?.carga) ? false : pollMs(status, 'uf'))),
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
    refetchInterval: () => comRecuo(pollOu(tk, pollMs(status, 'uf'))),
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
    refetchInterval: () => comRecuo(pollOu(tk, pollMs(status, 'mun'))),
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
    refetchInterval: () => comRecuo(pollOu(tk, pollMs(status, 'zona'))),
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
    refetchInterval: () => comRecuo(pollOu(tk, pollMs(status, 'zona'))),
  });
}
