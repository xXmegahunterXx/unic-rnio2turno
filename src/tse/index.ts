/**
 * Adaptador do feed oficial do TSE (fonte 'tse'). Ver src/tse/README.md.
 *
 *  - `TseSource`: polling + snapshots no formato do motor (uso no servidor).
 *  - `TseClient`: HTTP com concorrência limitada, teto de pedidos por segundo (balde de fichas), pausa quando o TSE
 *    bloqueia (`TseBloqueioError`), retry/backoff e requisição condicional.
 *  - `map`: funções puras feed → contratos; `eventos`: série/eventos por diferença; `bu`: boletim de urna.
 */
export { TseSource, type TseSourceOptions, type TseHealth, type TseCorridaHealth } from './source';
export {
  TseClient,
  TseHttpError,
  TseBloqueioError,
  MAX_CONCORRENCIA,
  MOTIVO_BLOQUEIO_TEXTO,
  limitePorSegValido,
  type BloqueioTse,
  type MotivoBloqueio,
  type FetchLike,
  type TseClientOptions,
  type TseClientStats,
} from './client';
export { tsePaths } from './feed';
export type * from './feed';
export * as tseMap from './map';
export { HistoricoCorrida, eventosEntre, MARCOS, type HistoricoSerializado } from './eventos';
export { lerBoletimUrna, votosDoCargo, BuFormatoError, type BoletimUrna } from './bu';
