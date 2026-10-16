/**
 * Freio de carga (I37) e recuo do status (I05), lado do cliente. Puro e sem React: `hooks.ts` usa para os intervalos
 * de consulta; o chat (`components/chat/sala.ts`) e o "desde o 1º turno" (`DesdePrimeiroTurno.tsx`), que consultam
 * fora dos hooks de apuração, leem o freio vigente por `fatorChatVigente()` e `intervaloPesadoVigente()`.
 *
 * - Freio (`LiveStatus.carga`, comando 'freio' no painel): todos os intervalos de consulta (status e placar) são
 *   multiplicados por `fator` (1, 2, 3 ou 5). Com `leve`, as peças pesadas param de se atualizar (mapa municipal e
 *   "desde o 1º turno": o que já está na tela fica) e o chat consulta 2× mais espaçado. Ausente = ritmo normal.
 * - Recuo do status: depois de falhas seguidas, a próxima consulta espera 4, 8, 16… até 30 s, com variação aleatória
 *   (até 25% para menos) para os aparelhos não voltarem todos juntos; o 1º sucesso volta aos 2 s.
 * - Faixa "Conexão instável" (`FaixaConexao`): depois de 3 falhas seguidas, ou quando as respostas chegam mas o relógio
 *   do servidor (`wallNow`) não avança há 60 s pelo relógio deste aparelho — o status velho servido pela borda.
 */
import type { CargaStatus } from '@/shared/types';
import { ehFatorCarga } from '@/shared/chaves-noite';

/** Intervalo normal do status (ms). */
export const STATUS_MS = 2000;
/** Teto do recuo do status (ms). */
export const RECUO_MAX_MS = 30_000;
/** Falhas seguidas do status até a faixa "Conexão instável". */
export const FALHAS_PARA_FAIXA = 3;
/** Relógio do servidor parado por tanto tempo (ms, medido no relógio local) = status velho: mostra a faixa. */
export const RELOGIO_PARADO_MS = 60_000;

type Carga = CargaStatus | null | undefined;

/** Fator do freio (1 = normal). Valor fora do contrato vindo do servidor conta como 1. */
export function fatorDe(carga: Carga): number {
  return carga && ehFatorCarga(carga.fator) ? carga.fator : 1;
}

/** Modo leve do freio. */
export const leveDe = (carga: Carga): boolean => carga?.leve === true;

/** Intervalo de consulta com o freio: `ms × fator` (`false` continua sem consulta). */
export function comFreio(ms: number | false, carga: Carga): number | false {
  return ms === false ? false : ms * fatorDe(carga);
}

/** Peças pesadas (mapa municipal, "desde o 1º turno"): param no modo leve; senão, `ms × fator`. */
export function intervaloPesado(ms: number | false, carga: Carga): number | false {
  return leveDe(carga) ? false : comFreio(ms, carga);
}

/** Chat: 2× mais espaçado no modo leve. O fator não entra: o chat já tem o "modo lento" próprio no painel. */
export const fatorChatDe = (carga: Carga): number => (leveDe(carga) ? 2 : 1);

/**
 * Intervalo até a próxima consulta do status (ms). Sem falhas: 2 s × fator. Depois de `falhas` seguidas:
 * 2 s × fator × 2^falhas (4, 8, 16… s), com teto de 30 s (ou o intervalo normal, se o freio já o põe acima), menos
 * até 25% ao acaso (`aleatorio` em [0, 1)).
 */
export function intervaloStatus(falhas: number, carga: Carga, aleatorio: number): number {
  const base = STATUS_MS * fatorDe(carga);
  if (!(falhas > 0)) return base;
  const teto = Math.max(RECUO_MAX_MS, base);
  const recuo = Math.min(teto, base * 2 ** Math.min(falhas, 10));
  const r = Number.isFinite(aleatorio) ? Math.min(1, Math.max(0, aleatorio)) : 0;
  return Math.round(recuo * (1 - 0.25 * r));
}

/**
 * Espera antes da nova tentativa automática de uma consulta que falhou (`retryDelay` do React Query, main.tsx): 1, 2,
 * 4… s até 30 s, entre 75% e 125% ao acaso — milhares de aparelhos que falharam juntos não tentam de novo juntos.
 */
export function atrasoNovaTentativa(tentativa: number, aleatorio: number): number {
  const base = Math.min(RECUO_MAX_MS, 1000 * 2 ** Math.max(0, Math.min(tentativa, 10)));
  const r = Number.isFinite(aleatorio) ? Math.min(1, Math.max(0, aleatorio)) : 0.5;
  return Math.round(base * (0.75 + 0.5 * r));
}

// ---- saúde da conexão (faixa "Conexão instável") -----------------------------------------------------------------

/** O que o app sabe da conexão com o status. Relógios: `ultimoWallNow` é o do servidor; os outros, deste aparelho. */
export interface EstadoConexao {
  /** consultas do status seguidas que falharam */
  falhas: number;
  /** maior `wallNow` já recebido (relógio do servidor; null = nenhuma resposta ainda) */
  ultimoWallNow: number | null;
  /**
   * Hora dos dados da última resposta boa (`simNow` do status: o relógio real nas fontes Pré e TSE, o simulado na
   * Simulação — o mesmo da pílula "ao vivo"); é a hora que a faixa mostra. null = nenhuma resposta ainda.
   */
  ultimoDado: number | null;
  /** relógio local da resposta em que o `wallNow` avançou pela última vez */
  avancouEm: number | null;
  /** relógio local da última resposta boa */
  respostaEm: number | null;
}

export const CONEXAO_INICIAL: EstadoConexao = Object.freeze({ falhas: 0, ultimoWallNow: null, ultimoDado: null, avancouEm: null, respostaEm: null });

const finito = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Resposta boa do status (`wallNow` e `simNow` dela). `wallNow` inválido é tratado como "não avançou"; sem `simNow`
 * válido, a hora dos dados é o `wallNow`.
 */
export function registrarSucesso(e: EstadoConexao, wallNow: unknown, agoraLocal: number, simNow?: unknown): EstadoConexao {
  const w = finito(wallNow);
  const avancou = w !== null && (e.ultimoWallNow === null || w > e.ultimoWallNow);
  return {
    falhas: 0,
    ultimoWallNow: avancou ? w : e.ultimoWallNow,
    ultimoDado: finito(simNow) ?? w ?? e.ultimoDado,
    avancouEm: avancou || e.avancouEm === null ? agoraLocal : e.avancouEm,
    respostaEm: agoraLocal,
  };
}

/** Consulta do status que falhou (rede, 5xx, resposta inválida). */
export const registrarFalha = (e: EstadoConexao): EstadoConexao => ({ ...e, falhas: e.falhas + 1 });

/**
 * Mostrar a faixa? Depois de `FALHAS_PARA_FAIXA` falhas seguidas, ou quando as respostas chegam com o relógio do
 * servidor parado há `RELOGIO_PARADO_MS` (medido entre respostas, no relógio local: aba em segundo plano não conta,
 * porque não consulta).
 */
export function conexaoInstavel(e: EstadoConexao): boolean {
  if (e.falhas >= FALHAS_PARA_FAIXA) return true;
  return e.respostaEm !== null && e.avancouEm !== null && e.respostaEm - e.avancouEm >= RELOGIO_PARADO_MS;
}

// ---- freio vigente (para quem consulta fora dos hooks de apuração) -----------------------------------------------

let cargaVigente: CargaStatus | undefined;

/** Atualizado pelo `useStatus` a cada resposta boa (hooks.ts). */
export function definirCargaVigente(carga: Carga): void {
  cargaVigente = carga && ehFatorCarga(carga.fator) ? { fator: carga.fator, ...(carga.leve ? { leve: true } : {}) } : undefined;
}

/** Freio vigente (último status recebido nesta aba); undefined = normal. */
export const cargaVigenteAgora = (): CargaStatus | undefined => cargaVigente;

/** Multiplicador do intervalo do chat agora (1 ou 2). */
export const fatorChatVigente = (): number => fatorChatDe(cargaVigente);

/** Intervalo de uma peça pesada agora (`false` = parada pelo modo leve). Para `refetchInterval` em forma de função. */
export const intervaloPesadoVigente = (ms: number): number | false => intervaloPesado(ms, cargaVigente);
