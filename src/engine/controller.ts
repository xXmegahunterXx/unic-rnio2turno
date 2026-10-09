/**
 * SimulationController (ARCHITECTURE.md §5.3) — isomórfico: usado pelo servidor e pelo Worker do demo.
 *
 *  - guarda o AdminState (relógio, cenário, fonte, aviso, congelado, versão) e aplica AdminCommand;
 *  - status(): LiveStatus; snapshots no instante atual, com cache por bucket de 1 s de simNow;
 *  - fonte 'pre': simNow = relógio real; as corridas de 2º turno ficam em "aguardando" (0%) e as telas usam
 *    as corridas -t1 (1º turno real, servidas do dataset);
 *  - fonte 'tse': o controller só guarda a escolha e a config (`state.tse`). O SERVIDOR intercepta as rotas
 *    de apuração e responde com o adaptador do feed oficial (src/tse); se o controller for consultado
 *    mesmo assim, responde como 'pre' (2º turno em 0%), nunca com números simulados;
 *  - fonte 'simulacao': motor determinístico (src/engine/model.ts).
 */
import type { DatasetMeta, UfDataset } from '../shared/dataset';
import type { AdminCommand, AdminSnapshot, PublicMeta } from '../shared/api';
import { INICIO_APURACAO } from '../shared/constants';
import type {
  AdminMetrics,
  AdminState,
  Fase,
  LiveStatus,
  MunicipioSnapshot,
  NationalSnapshot,
  PresetInfo,
  RaceId,
  SecaoDetalhe,
  UF,
  UfSnapshot,
  ZonaSnapshot,
} from '../shared/types';
import {
  CommandError,
  NotFoundError,
  type Controller,
  type ControllerOptions,
  type JsonLoader,
  type LoadedDataset,
} from './api';
import { Aggregator } from './aggregate';
import { upperBound } from './mathx';
import { buildModel, type Model } from './model';
import { cenarioDoPreset, presetList } from './presets';
import { cenarioKey, cenarioPadrao, mesclaCenario } from './scenario';
import {
  buildT1,
  municipio1t,
  municipio2t,
  nacional1t,
  nacional2t,
  secao2t,
  uf1t,
  uf2t,
  zona2t,
  type Ctx,
  type T1Data,
} from './snapshots';
import {
  estadoPadrao,
  FONTES,
  INICIO_SIMULACAO,
  parseAdminState,
  parseAviso,
  serializeAdminState,
  simNowDe,
} from './state';
import { buildStructure, type RaceInfo, type Structure } from './structure';

const INI = INICIO_APURACAO;
/** A fase passa a 'encerrada' 5 min (simulados) depois de 100%. */
export const ENCERRAMENTO_MS = 5 * 60_000;
export const MARCOS_PCT = [1, 10, 25, 50, 75, 90, 99, 100];
const MAX_MODELOS = 2;
const MAX_SNAPSHOTS = 96;
const MAX_LOG = 100;

const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Carrega meta + as 28 UFs (paralelo). Caminhos relativos: 'data/meta.json', 'data/uf/sp.json'. */
export async function loadDataset(load: JsonLoader): Promise<LoadedDataset> {
  const meta = (await load('data/meta.json')) as DatasetMeta;
  if (!meta || !Array.isArray(meta.races) || !Array.isArray(meta.ufs)) throw new Error('data/meta.json inválido');
  const entries = await Promise.all(
    meta.ufs.map(async (u) => {
      const d = (await load(`data/uf/${u.uf.toLowerCase()}.json`)) as UfDataset;
      if (!d || !Array.isArray(d.municipios)) throw new Error(`data/uf/${u.uf.toLowerCase()}.json inválido`);
      return [u.uf, d] as const;
    }),
  );
  return { meta, ufs: Object.fromEntries(entries) as LoadedDataset['ufs'] };
}

interface ModeloEntry {
  model: Model;
  agg: Aggregator;
}

function memoriaMb(): number {
  const g = globalThis as unknown as {
    process?: { memoryUsage?: () => { rss: number } };
    performance?: { memory?: { usedJSHeapSize: number } };
  };
  try {
    if (g.process?.memoryUsage) return Math.round(g.process.memoryUsage().rss / 1048576);
    if (g.performance?.memory) return Math.round(g.performance.memory.usedJSHeapSize / 1048576);
  } catch {
    /* ignora */
  }
  return 0;
}

export function createController(ds: LoadedDataset, opts: ControllerOptions): Controller {
  const clock = opts.now ?? Date.now;
  const modo = opts.modo;
  const iniciadoEm = clock();
  const logs: { t: number; msg: string }[] = [];
  const log = (msg: string) => {
    logs.push({ t: clock(), msg });
    if (logs.length > MAX_LOG) logs.splice(0, logs.length - MAX_LOG);
    opts.log?.(msg);
  };

  const t0 = perf();
  const st: Structure = buildStructure(ds);
  const estruturaMs = Math.round(perf() - t0);
  log(`Estrutura: ${st.nUf} UFs, ${st.nMun} municípios, ${st.nPair} zonas×município, ${st.nSec} seções (${estruturaMs} ms)`);

  const padraoCen = cenarioPadrao(st);
  const fallback = estadoPadrao(modo, iniciadoEm, padraoCen, st);
  let state: AdminState = opts.initialState ? parseAdminState(opts.initialState, fallback, st) : fallback;

  const modelos = new Map<string, ModeloEntry>();
  const obterModelo = (cen: AdminState['cenario']): ModeloEntry => {
    const key = cenarioKey(cen);
    const hit = modelos.get(key);
    if (hit) {
      modelos.delete(key);
      modelos.set(key, hit);
      return hit;
    }
    const model = buildModel(st, cen, clock);
    const e: ModeloEntry = { model, agg: new Aggregator(model) };
    modelos.set(key, e);
    while (modelos.size > MAX_MODELOS) modelos.delete(modelos.keys().next().value as string);
    const cp = model.calib.pres;
    log(
      `Modelo construído em ${model.buildMs} ms (preset ${cen.preset}, semente ${cen.seed}` +
        (cp ? `, Presidente: alvo ${cp.alvo.toFixed(2)}% → ${cp.resultado.toFixed(3)}%` : '') +
        ')',
    );
    return e;
  };
  let atual = obterModelo(state.cenario);

  const t1Cache = new Map<RaceId, T1Data>();
  const t1 = (r: RaceInfo) => {
    let d = t1Cache.get(r.id);
    if (!d) {
      d = buildT1(st, r);
      t1Cache.set(r.id, d);
    }
    return d;
  };

  // ---- métricas ---------------------------------------------------------------------------------
  const reqSlots = new Int32Array(60);
  const reqSeg = new Float64Array(60).fill(-1);
  const contaReq = (wall: number) => {
    const s = Math.floor(wall / 1000);
    const i = s % 60;
    if (reqSeg[i] !== s) {
      reqSeg[i] = s;
      reqSlots[i] = 0;
    }
    reqSlots[i]++;
  };
  let ultimoCalculoMs = 0;

  // ---- cache de snapshots ------------------------------------------------------------------------
  const snaps = new Map<string, unknown>();
  const cacheGet = <T>(key: string, build: () => T): T => {
    const hit = snaps.get(key) as T | undefined;
    if (hit !== undefined) {
      snaps.delete(key);
      snaps.set(key, hit);
      return hit;
    }
    const t = perf();
    const v = build();
    ultimoCalculoMs = Math.round((perf() - t) * 100) / 100;
    snaps.set(key, v);
    while (snaps.size > MAX_SNAPSHOTS) snaps.delete(snaps.keys().next().value as string);
    return v;
  };

  // ---- relógio / instante -----------------------------------------------------------------------
  const simNowAt = (wall: number) => (state.fonte === 'simulacao' ? simNowDe(state.relogio, wall) : wall);
  const fim = () => INI + atual.model.chegadaOrd[atual.model.chegadaOrd.length - 1];

  /** Instante dos DADOS: congelado → congeladoEm; fontes ≠ simulação → antes do início (2º turno em 0%). */
  const instante = (wall: number): { simNow: number; tDados: number; k: number } => {
    if (state.fonte !== 'simulacao') {
      const s = Math.floor(wall / 1000) * 1000;
      return { simNow: s, tDados: Math.min(s, INI - 1000), k: 0 };
    }
    const s = state.congelado && state.congeladoEm !== null ? state.congeladoEm : simNowDe(state.relogio, wall);
    const tq = Math.floor(s / 1000) * 1000;
    return { simNow: tq, tDados: tq, k: upperBound(atual.model.chegadaOrd, tq - INI) };
  };

  const fase = (wall: number): Fase => {
    if (state.fonte === 'pre') return 'pre';
    if (state.fonte === 'tse') return wall < INI ? 'pre' : 'apurando';
    const s = state.congelado && state.congeladoEm !== null ? state.congeladoEm : simNowDe(state.relogio, wall);
    if (s < INI) return 'pre';
    if (s >= fim() + ENCERRAMENTO_MS) return 'encerrada';
    return 'apurando';
  };

  const tempoParaPct = (pct: number): number => {
    const ch = atual.model.chegadaOrd;
    const N = ch.length;
    if (!(pct > 0)) return INI;
    const k = Math.min(N, Math.max(1, Math.ceil((Math.min(pct, 100) / 100) * N - 1e-9)));
    return INI + ch[k - 1];
  };

  // ---- resolução de escopos ---------------------------------------------------------------------
  const raceOu404 = (race: RaceId): RaceInfo => {
    const r = st.raceMap.get(String(race).toLowerCase());
    if (!r) throw new NotFoundError(`Corrida desconhecida: "${race}". Disponíveis: ${st.races.map((x) => x.id).join(', ')}.`);
    return r;
  };
  const ufOu404 = (r: RaceInfo, uf: UF | string): number => {
    const U = String(uf).toUpperCase();
    const u = st.ufIndex.get(U);
    if (u === undefined) throw new NotFoundError(`UF desconhecida: "${uf}".`);
    if (!r.race.ufs.includes(U as UF)) throw new NotFoundError(`A UF ${U} não participa da corrida ${r.id}.`);
    return u;
  };
  const munOu404 = (r: RaceInfo, uf: UF | string, cod: string): number => {
    const u = ufOu404(r, uf);
    const c = /^\d+$/.test(String(cod)) ? String(cod).padStart(5, '0') : String(cod);
    const m = st.munKey.get(`${st.ufs[u]}|${c}`);
    if (m === undefined) throw new NotFoundError(`Município ${cod} não encontrado em ${st.ufs[u]}.`);
    return m;
  };
  const pairOu404 = (m: number, zona: number): number => {
    const z = Number(zona);
    for (let p = st.munPairStart[m]; p < st.munPairEnd[m]; p++) if (st.pairZona[p] === z) return p;
    throw new NotFoundError(`Zona ${zona} não existe em ${st.mun[m].nome} (${st.ufs[st.munUf[m]]}).`);
  };
  const t1SemSecao = (r: RaceInfo) =>
    new NotFoundError(
      `A corrida ${r.id} (1º turno) não tem resultados por zona ou seção: o conjunto de dados traz o 1º turno ` +
        `por município. Consulte o resultado do município.`,
    );

  const ctx = (wall: number): { c: Ctx; key: string } => {
    const inst = instante(wall);
    const t = perf();
    const agg = atual.agg.get(inst.k);
    if (perf() - t > 0.05) ultimoCalculoMs = Math.round((perf() - t) * 100) / 100;
    // O conteúdo de um snapshot depende só de k (série e eventos têm o instante de chegada de alguma seção)
    // e de já ter passado das 17h (evento "início"): chave por (modelo, k, início) — no fim da noite, todas
    // as requisições caem na mesma entrada.
    return {
      c: { model: atual.model, agg, tq: inst.tDados, simNow: inst.simNow, geradoEm: wall },
      key: `${atual.model.id}|${inst.k}|${inst.tDados >= INI ? 1 : 0}`,
    };
  };
  const fresco = <T extends { geradoEm: number; simNow: number }>(v: T, wall: number, simNow: number): T =>
    v.geradoEm === wall && v.simNow === simNow ? v : { ...v, geradoEm: wall, simNow };

  // ---- estado / comandos ------------------------------------------------------------------------
  const aplicaCenario = (cen: AdminState['cenario']) => {
    const antes = atual.model.id;
    atual = obterModelo(cen);
    if (atual.model.id !== antes) snaps.clear();
  };

  const mudou = () => {
    state = { ...state, versao: state.versao + 1 };
    opts.onStateChange?.(state);
  };

  const relogioAgora = (wall: number) => ({ ...state.relogio, ancoraSim: simNowDe(state.relogio, wall), ancoraWall: wall });

  const command = (cmd: AdminCommand): AdminSnapshot => {
    if (!cmd || typeof cmd !== 'object' || typeof (cmd as { tipo?: unknown }).tipo !== 'string')
      throw new CommandError('Comando inválido.');
    const wall = clock();
    switch (cmd.tipo) {
      case 'relogio': {
        const r = state.relogio;
        if (cmd.acao === 'iniciar') {
          const fonte = state.fonte === 'pre' ? 'simulacao' : state.fonte;
          if (fonte !== state.fonte) log('Fonte: pre → simulacao (iniciar simulação)');
          state = {
            ...state,
            fonte,
            congelado: false,
            congeladoEm: null,
            relogio: { rodando: true, velocidade: r.velocidade, ancoraWall: wall, ancoraSim: INICIO_SIMULACAO },
          };
          log(`Simulação iniciada às 16:59:30 (velocidade ${r.velocidade}×)`);
        } else if (cmd.acao === 'pausar') {
          state = { ...state, relogio: { ...relogioAgora(wall), rodando: false } };
          log('Relógio pausado');
        } else if (cmd.acao === 'retomar') {
          state = { ...state, relogio: { ...state.relogio, ancoraSim: simNowDe(r, wall), ancoraWall: wall, rodando: true } };
          log('Relógio retomado');
        } else if (cmd.acao === 'reiniciar') {
          state = {
            ...state,
            congelado: false,
            congeladoEm: null,
            relogio: { rodando: false, velocidade: r.velocidade, ancoraWall: wall, ancoraSim: INICIO_SIMULACAO },
          };
          log('Relógio reiniciado em 16:59:30 (pausado)');
        } else throw new CommandError(`Ação de relógio inválida: "${String((cmd as { acao?: unknown }).acao)}".`);
        break;
      }
      case 'velocidade': {
        const v = Number(cmd.velocidade);
        if (!Number.isFinite(v) || v <= 0 || v > 10000) throw new CommandError('Velocidade deve estar entre 0 e 10000.');
        state = { ...state, relogio: { ...relogioAgora(wall), velocidade: v } };
        log(`Velocidade: ${v}×`);
        break;
      }
      case 'saltar-tempo': {
        const s = Number(cmd.simNow);
        if (!Number.isFinite(s)) throw new CommandError('saltar-tempo: simNow inválido.');
        const alvo = Math.min(INI + 36 * 3600_000, Math.max(INI - 7 * 86400_000, s));
        state = { ...state, relogio: { ...state.relogio, ancoraWall: wall, ancoraSim: alvo } };
        log(`Relógio saltou para ${new Date(alvo).toISOString()}`);
        break;
      }
      case 'saltar-pct': {
        const pct = Number(cmd.pct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new CommandError('saltar-pct: pct deve estar entre 0 e 100.');
        const alvo = Math.ceil(tempoParaPct(pct) / 1000) * 1000;
        state = { ...state, relogio: { ...state.relogio, ancoraWall: wall, ancoraSim: alvo } };
        log(`Relógio saltou para ${pct}% das seções (${new Date(alvo).toISOString()})`);
        break;
      }
      case 'cenario': {
        const cen = mesclaCenario(state.cenario, cmd.cenario, st);
        aplicaCenario(cen);
        state = { ...state, cenario: cen };
        log(`Cenário alterado (${Object.keys(cmd.cenario ?? {}).join(', ') || 'sem campos'})`);
        break;
      }
      case 'preset': {
        const cen = cenarioDoPreset(st, String(cmd.preset), state.cenario.seed);
        aplicaCenario(cen);
        state = { ...state, cenario: cen };
        log(`Preset aplicado: ${cen.preset}`);
        break;
      }
      case 'fonte': {
        if (!FONTES.includes(cmd.fonte)) throw new CommandError(`Fonte inválida: "${String(cmd.fonte)}".`);
        log(`Fonte: ${state.fonte} → ${cmd.fonte}`);
        state = { ...state, fonte: cmd.fonte };
        break;
      }
      case 'aviso': {
        const aviso = cmd.aviso === null ? null : parseAviso(cmd.aviso);
        if (cmd.aviso !== null && !aviso) throw new CommandError('Aviso inválido: informe { nivel, texto }.');
        state = { ...state, aviso };
        log(aviso ? `Aviso publicado (${aviso.nivel})` : 'Aviso removido');
        break;
      }
      case 'congelar': {
        const c = !!cmd.congelado;
        state = { ...state, congelado: c, congeladoEm: c ? (state.congeladoEm ?? simNowAt(wall)) : null };
        log(c ? 'Dados congelados' : 'Dados descongelados');
        break;
      }
      case 'tse': {
        const t = cmd.tse ?? {};
        const next = { ...state.tse };
        for (const k of ['baseUrl', 'ciclo', 'eleicaoPres', 'eleicaoGov', 'pleito'] as const) {
          if (t[k] !== undefined) {
            if (typeof t[k] !== 'string' || !String(t[k]).trim()) throw new CommandError(`tse.${k} inválido.`);
            next[k] = String(t[k]).trim();
          }
        }
        if (t.intervaloSeg !== undefined) {
          const n = Number(t.intervaloSeg);
          if (!Number.isFinite(n) || n < 5 || n > 600) throw new CommandError('tse.intervaloSeg deve estar entre 5 e 600.');
          next.intervaloSeg = n;
        }
        state = { ...state, tse: next };
        log('Configuração do TSE atualizada');
        break;
      }
      default:
        throw new CommandError(`Comando desconhecido: "${String((cmd as { tipo?: unknown }).tipo)}".`);
    }
    mudou();
    return adminSnapshot();
  };

  const metrics = (extra?: Partial<AdminMetrics>): AdminMetrics => {
    const wall = clock();
    const s = Math.floor(wall / 1000);
    let req = 0;
    for (let i = 0; i < 60; i++) if (reqSeg[i] > s - 60) req += reqSlots[i];
    return {
      uptimeSeg: Math.round((wall - iniciadoEm) / 1000),
      requisicoesUltimoMinuto: req,
      clientesAtivosEstimados: 0,
      ultimoCalculoMs,
      modeloConstruidoEm: atual.model.builtAt,
      modeloMs: atual.model.buildMs,
      secoesModeladas: st.nSec,
      memoriaMb: memoriaMb(),
      log: logs.slice(-50),
      ...extra,
    };
  };

  const marcos = () => MARCOS_PCT.map((pct) => ({ pct, t: tempoParaPct(pct) }));

  const adminSnapshot = (extra?: Partial<AdminMetrics>): AdminSnapshot => ({
    state: structuredCloneSafe(state),
    status: status(),
    metrics: metrics(extra),
    marcos: marcos(),
    fimPrevisto: fim(),
  });

  const status = (): LiveStatus => {
    const wall = clock();
    const sim = state.fonte === 'simulacao';
    return {
      fonte: state.fonte,
      fase: fase(wall),
      simNow: simNowAt(wall),
      wallNow: wall,
      inicioApuracao: INI,
      velocidade: sim ? state.relogio.velocidade : 1,
      pausado: sim ? !state.relogio.rodando : false,
      aviso: state.aviso,
      versao: state.versao,
      races: st.races.map((r) => r.id),
      simulacao: sim,
      congelado: state.congelado,
    };
  };

  const meta = (): PublicMeta => ({ races: ds.meta.races, ufs: ds.meta.ufs, inicioApuracao: INI });

  const controller: Controller = {
    modo,
    meta,
    status,
    state: () => structuredCloneSafe(state),
    setState(s: AdminState) {
      const next = parseAdminState(s, state, st);
      if (cenarioKey(next.cenario) !== cenarioKey(state.cenario)) aplicaCenario(next.cenario);
      state = next;
    },
    command,
    adminSnapshot,
    presets: (): PresetInfo[] => presetList(st, state.cenario.seed),
    simNow: () => simNowAt(clock()),
    marcos,
    fimPrevisto: fim,
    metrics,
    toJSON: () => serializeAdminState(state),

    nacional(race: RaceId): NationalSnapshot {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      if (r.turno === 1) {
        const v = cacheGet(`t1|nac|${r.id}`, () => nacional1t(st, t1(r), wall, wall));
        return fresco(v, wall, Math.floor(simNowAt(wall) / 1000) * 1000);
      }
      const { c, key } = ctx(wall);
      return fresco(cacheGet(`${key}|nac|${r.id}`, () => nacional2t(c, r)), wall, c.simNow);
    },
    uf(race: RaceId, uf: UF): UfSnapshot {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      const u = ufOu404(r, uf);
      if (r.turno === 1) {
        const v = cacheGet(`t1|uf|${r.id}|${u}`, () => uf1t(st, t1(r), u, wall, wall));
        return fresco(v, wall, Math.floor(simNowAt(wall) / 1000) * 1000);
      }
      const { c, key } = ctx(wall);
      return fresco(cacheGet(`${key}|uf|${r.id}|${u}`, () => uf2t(c, r, u)), wall, c.simNow);
    },
    municipio(race: RaceId, uf: UF, cod: string): MunicipioSnapshot {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      const m = munOu404(r, uf, cod);
      if (r.turno === 1) {
        const v = cacheGet(`t1|mun|${r.id}|${m}`, () => municipio1t(st, t1(r), m, wall, wall));
        return fresco(v, wall, Math.floor(simNowAt(wall) / 1000) * 1000);
      }
      const { c, key } = ctx(wall);
      return fresco(cacheGet(`${key}|mun|${r.id}|${m}`, () => municipio2t(c, r, m)), wall, c.simNow);
    },
    zona(race: RaceId, uf: UF, cod: string, zona: number): ZonaSnapshot {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      const m = munOu404(r, uf, cod);
      const p = pairOu404(m, zona);
      if (r.turno === 1) throw t1SemSecao(r);
      const { c, key } = ctx(wall);
      return fresco(cacheGet(`${key}|zona|${r.id}|${p}`, () => zona2t(c, r, p)), wall, c.simNow);
    },
    secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number): SecaoDetalhe | null {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      const m = munOu404(r, uf, cod);
      const p = pairOu404(m, zona);
      if (r.turno === 1) throw t1SemSecao(r);
      const n = Number(secao);
      let i = -1;
      for (let s = st.pairSecStart[p]; s < st.pairSecEnd[p]; s++)
        if (st.secNum[s] === n) {
          i = s;
          break;
        }
      if (i < 0) throw new NotFoundError(`Seção ${secao} não existe na zona ${zona} de ${st.mun[m].nome} (${st.ufs[st.munUf[m]]}).`);
      const { c } = ctx(wall);
      return secao2t(c, r, i);
    },
  };
  return controller;
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
