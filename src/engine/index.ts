/**
 * Motor de simulação + Controller (isomórfico: servidor e Web Worker do demo).
 * Ponto de entrada público: `loadDataset` + `createController` (interface em ./api).
 * Para Node (servidor/testes), o leitor de arquivos fica em './node' (não reexportado aqui).
 */
export * from './api';
export { loadDataset, createController, ENCERRAMENTO_MS, MARCOS_PCT } from './controller';
export { buildStructure, forEachFaixa, type Structure, type RaceInfo } from './structure';
export { buildModel, MODELO, viesLogit, type Model, type Calibragem } from './model';
export { Aggregator, F as CAMPOS_AGREGADO, type Agg } from './aggregate';
export { buildTimeline, MARCOS_BR, MARCOS_GOV, type Timeline, type SerieBuf } from './series';
export { textos as textosEventos, placar, pctPar, emUf } from './events';
export {
  montaSummary,
  montaRestante,
  estadoMosaico,
  codigoIdentificacao,
  eventosAte,
  serieAte,
  type TallyInput,
} from './snapshots';
export { presetList, cenarioDoPreset, PRESET_IDS } from './presets';
export {
  alvoNeutro,
  alvosNeutros,
  cenarioPadrao,
  normalizaCenario,
  mesclaCenario,
  cenarioKey,
  SEED_PADRAO,
  PRESET_PADRAO,
  PRESET_PERSONALIZADO,
} from './scenario';
export {
  estadoPadrao,
  parseAdminState,
  serializeAdminState,
  simNowDe,
  tsePadrao,
  INICIO_SIMULACAO,
  VELOCIDADE_DEMO,
} from './state';
export { TIMING, CURVA_ALVO, MEDIANAS, RITMO_FATOR, calculaChegadas, minutosCurva } from './timing';
export { dexp, dlog, sigmoid, logit, invNorm } from './mathx';
export { seedKey, triple32, hashStr } from './rng';
export { createEngineHost, fetchJsonLoader, serializaErro, type HostIn, type HostOut, type HostMethod, type HostError } from './host';
