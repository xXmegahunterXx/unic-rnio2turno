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
 * Fase 2:
 *   - `loadDataset` carrega, OPCIONAIS, data/secao/{uf}.json (1º turno real por seção → o modelo do 2º turno parte
 *     da seção real; zona/seção do 1º turno com números reais) e data/municipios-br.json (`ctrl.municipiosBr`);
 *   - todos os snapshots aceitam `t` (epoch ms, "reveja a noite"), limitado a [16:59:30, agora];
 *   - `await ctrl.carregaLocais(uf)` antes de zona/seção traz `local` (escola/endereço) em cada seção; sem ele, a
 *     1ª consulta da UF dispara o carregamento em segundo plano;
 *   - anúncios (src/shared/anuncios.ts): comandos 'anuncio-salvar' | 'anuncio-remover' | 'anuncio-ativo' |
 *     'anuncio-logo' (troca só a logo: "Ajustar agora") | 'anuncios-suspensao' (interruptor geral) | 'anuncie-contato';
 *     `status().anuncios` = anúncios no ar pelo relógio REAL (`anuncioNoAr`), com o link já com UTM;
 *     o comando legado 'patrocinio' vira o anúncio master 'patrocinio' e `status().patrocinio` é derivado dele.
 *
 * Leva 3 ("Chaves da noite", src/shared/chaves-noite.ts): 'freio' | 'contador-publico' | 'html-borda' |
 *   'medir-anuncios' | 'aviso-nacional' | 'texto-bots' | 'contar-lives' só gravam a escolha em `state.noite` (no servidor
 *   sem incrementar a versão: não invalidam o cache dos visitantes); `status().carga` = o freio, só quando puxado. Quem age
 *   é o servidor/app. 'tse-retomar' | 'alerta-teste' | 'precos-anuncie' são do servidor (ele os intercepta): aqui são
 *   recusados com CommandError ("indisponível nesta versão"), sem mudar nada. `tse.limitePorSeg` (5–90, padrão 40).
 *
 * Fonte 'tse': o controller só guarda a escolha e `state.tse`; o servidor intercepta as rotas de apuração.
 * Nas fontes 'pre'/'tse' o controller responde o 2º turno em 0% ("aguardando") e o 1º turno (-t1) normal.
 * Mudança de cenário/preset reconstrói o modelo de forma síncrona (~0,5 s) mantendo o simNow.
 */
export * from './api';
export { loadDataset, createController, anuncioPublico, anuncioDoLegado, patrocinioLegado, ENCERRAMENTO_MS, MARCOS_PCT } from './controller';
export {
  buildStructure,
  forEachFaixa,
  temSecaoReal,
  votosFinalistas,
  type Structure,
  type RaceInfo,
  type SecaoReal,
  type ColunasT1,
} from './structure';
export { buildModel, MODELO, viesLogit, type Model, type Calibragem } from './model';
export { Aggregator, camposPar, F as CAMPOS_AGREGADO, type Agg } from './aggregate';
export { buildTimeline, MARCOS_BR, MARCOS_GOV, type Timeline, type SerieBuf } from './series';
export { textos as textosEventos, placar, pctPar, pctSecoes, emUf } from './events';
export {
  montaSummary,
  montaRestante,
  estadoMosaico,
  codigoIdentificacao,
  eventosAte,
  serieAte,
  type TallyInput,
  type LocalDe,
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
  validaPatrocinio,
  PATROCINIO_LIMITES,
  anuncioDoPatrocinio,
  normalizaAnuncio,
  parseAnunciosSalvos,
  ID_PATROCINIO,
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
