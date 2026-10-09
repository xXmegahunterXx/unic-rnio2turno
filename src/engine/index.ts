/**
 * Motor de simulação + Controller (isomórfico: servidor e Web Worker do demo). Interface em ./api.
 *
 * Uso no servidor (Node):
 *   import { loadDataset, createController, CommandError, NotFoundError } from '@/engine';
 *   import { fsJsonLoader } from '@/engine/node';            // só Node (não reexportado aqui)
 *   const ds = await loadDataset(fsJsonLoader(DATA_ROOT));    // DATA_ROOT contém data/meta.json
 *   const ctrl = createController(ds, {                       // síncrono: ~0,6 s (estrutura + modelo)
 *     modo: 'servidor',
 *     initialState: salvo ? JSON.parse(salvo) : undefined,    // validado/completado internamente
 *     onStateChange: (s) => persistir(JSON.stringify(s)),     // ou ctrl.toJSON()
 *     log: (msg) => console.log('[motor]', msg),
 *   });
 *   ctrl.status(); ctrl.nacional('pres'); ctrl.command(cmd) // erros: NotFoundError (404), CommandError (400)
 *
 * Fonte 'tse': o controller só guarda a escolha e `state.tse`; o servidor intercepta as rotas de apuração.
 * Nas fontes 'pre'/'tse' o controller responde o 2º turno em 0% ("aguardando") e o 1º turno (-t1) normal.
 * Mudança de cenário/preset reconstrói o modelo de forma síncrona (~0,5 s) mantendo o simNow.
 */
export * from './api';
export { loadDataset, createController, ENCERRAMENTO_MS, MARCOS_PCT } from './controller';
export { buildStructure, forEachFaixa, type Structure, type RaceInfo } from './structure';
export { buildModel, MODELO, viesLogit, type Model, type Calibragem } from './model';
export { Aggregator, camposPar, F as CAMPOS_AGREGADO, type Agg } from './aggregate';
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
export { estadoMaisNovo } from './sync';
