/**
 * SimulationController (ARCHITECTURE.md §5.3) — isomórfico: usado pelo servidor e pelo Worker do demo.
 *
 *  - guarda o AdminState (relógio, cenário, fonte, aviso, congelado, versão) e aplica AdminCommand;
 *  - status(): LiveStatus; snapshots no instante atual (ou num instante PASSADO `t`, "reveja a noite"), com
 *    cache por (modelo, nº de seções totalizadas no instante) — o conteúdo só depende disso;
 *  - fonte 'pre': simNow = relógio real; as corridas de 2º turno ficam em "aguardando" (0%) e as telas usam
 *    as corridas -t1 (1º turno real, servidas do dataset);
 *  - fonte 'tse': o controller só guarda a escolha e a config (`state.tse`). O SERVIDOR intercepta as rotas
 *    de apuração e responde com o adaptador do feed oficial (src/tse); se o controller for consultado
 *    mesmo assim, responde como 'pre' (2º turno em 0%), nunca com números simulados;
 *  - fonte 'simulacao': motor determinístico (src/engine/model.ts);
 *  - corridas de 1º turno (-t1): dataset oficial; zona/seção com os números REAIS por seção quando
 *    public/data/secao/{uf}.json existe (senão 404 coerente);
 *  - locais de votação (public/data/locais/{uf}.json) carregados sob demanda por UF, com cache: `local` em cada
 *    seção de `zona`/`secao`;
 *  - mapa nacional por município (`municipiosBr`), alinhado com public/data/municipios-br.json (ou com a ordem
 *    canônica derivada: UFs em ordem alfabética, municípios na ordem do dataset, sem o exterior).
 */
import type { DatasetMeta, LocaisUfDataset, MunicipiosBr, SecaoUfDataset, UfDataset } from '../shared/dataset';
import type { AdminCommand, AdminSnapshot, PublicMeta } from '../shared/api';
import {
  ANUNCIO_LIMITES,
  anuncioNoAr,
  conflitoMaster,
  dominioAnuncio,
  mensagemConflitoMaster,
  urlComUtm,
  validaContatoAnuncie,
  validaLogoAnuncio,
  type AnuncioConfig,
  type AnuncioPublico,
} from '../shared/anuncios';
import { cargaDoFreio, chavesNoite, COMANDO_CHAVE, ehFatorCarga, MODOS_AVISO_NACIONAL, ROTULO_CHAVE } from '../shared/chaves-noite';
import { validaContatosPublicos } from '../shared/contatos';
import { INICIO_APURACAO, TSE_LIMITE_POR_SEG } from '../shared/constants';
import { fmtDataHora, fmtHoraSeg } from '../shared/format';
import { UFS } from '../shared/types';
import type {
  AdminMetrics,
  AdminState,
  Fase,
  LiveStatus,
  LocalResumo,
  MunicipioSnapshot,
  MunicipiosNacionalSnapshot,
  NationalSnapshot,
  Patrocinio,
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
  type LoadOptions,
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
  municipiosBr1t,
  municipiosBr2t,
  nacional1t,
  nacional2t,
  secao1t,
  secao2t,
  t1TemSecao,
  uf1t,
  uf2t,
  zona1t,
  zona2t,
  type Ctx,
  type LocalDe,
  type T1Data,
} from './snapshots';
import {
  anuncioDoPatrocinio,
  estadoPadrao,
  FONTES,
  ID_PATROCINIO,
  imagensDoEstado,
  INICIO_SIMULACAO,
  normalizaAnuncio,
  parseAdminState,
  parseAviso,
  serializeAdminState,
  simNowDe,
  TROCA_AUTO_MAX,
  TROCA_AUTO_MIN,
  trocaAutoPadrao,
  validaPatrocinio,
} from './state';
import { buildStructure, forEachFaixa, type RaceInfo, type Structure } from './structure';

const INI = INICIO_APURACAO;
/** A fase passa a 'encerrada' 5 min (simulados) depois de 100%. */
export const ENCERRAMENTO_MS = 5 * 60_000;
export const MARCOS_PCT = [1, 10, 25, 50, 75, 90, 99, 100];
const MAX_MODELOS = 2;
const MAX_SNAPSHOTS = 96;
const MAX_LOG = 100;

const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** "18:30:00 de 25/10" (horário de Brasília) para o log do monitor do admin. */
const quando = (ms: number) => `${fmtHoraSeg(ms)} de ${fmtDataHora(ms).slice(0, 5)}`;

/**
 * Carrega meta + as 28 UFs e, OPCIONAIS (ausentes/inválidos são ignorados), os 28 arquivos do 1º turno real por
 * seção (`data/secao/{uf}.json`) e a ordem do mapa nacional (`data/municipios-br.json`) — tudo em paralelo.
 * Caminhos relativos: 'data/meta.json', 'data/uf/sp.json'. O leitor fica em `ds.load` para os arquivos sob
 * demanda (locais de votação).
 */
export async function loadDataset(load: JsonLoader, opts: LoadOptions = {}): Promise<LoadedDataset> {
  const meta = (await load('data/meta.json')) as DatasetMeta;
  if (!meta || !Array.isArray(meta.races) || !Array.isArray(meta.ufs)) throw new Error('data/meta.json inválido');
  const opcional = async <T>(path: string, ok: (v: unknown) => boolean): Promise<T | undefined> => {
    try {
      const v = await load(path);
      return ok(v) ? (v as T) : undefined;
    } catch {
      return undefined;
    }
  };
  const [entries, secoes, municipiosBr] = await Promise.all([
    Promise.all(
      meta.ufs.map(async (u) => {
        const d = (await load(`data/uf/${u.uf.toLowerCase()}.json`)) as UfDataset;
        if (!d || !Array.isArray(d.municipios)) throw new Error(`data/uf/${u.uf.toLowerCase()}.json inválido`);
        return [u.uf, d] as const;
      }),
    ),
    opts.secao === false
      ? Promise.resolve([] as (readonly [UF, SecaoUfDataset | undefined])[])
      : Promise.all(
          meta.ufs.map(
            async (u) =>
              [
                u.uf,
                await opcional<SecaoUfDataset>(`data/secao/${u.uf.toLowerCase()}.json`, (v) => {
                  const x = v as SecaoUfDataset | null;
                  return !!x && typeof x === 'object' && typeof x.n === 'number' && typeof x.aptos === 'string' && !!x.pres;
                }),
              ] as const,
          ),
        ),
    opts.municipiosBr === false
      ? Promise.resolve(undefined)
      : opcional<MunicipiosBr>('data/municipios-br.json', (v) => {
          const x = v as MunicipiosBr | null;
          return !!x && Array.isArray(x.ordem) && Array.isArray(x.uf) && x.uf.length === x.ordem.length;
        }),
  ]);
  const ds: LoadedDataset = { meta, ufs: Object.fromEntries(entries) as LoadedDataset['ufs'], municipiosBr: municipiosBr ?? null, load };
  const sec = secoes.filter(([, d]) => d);
  if (sec.length) ds.secao = Object.fromEntries(sec) as LoadedDataset['secao'];
  return ds;
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
  if (st.real) {
    const govs = Array.from(st.real.ufGov).reduce((a, b) => a + b, 0);
    log(`1º turno real por seção: ${st.real.nUfs}/${st.nUf} UFs (governador: ${govs}/${st.govRaces.length})`);
    for (const a of st.real.avisos.slice(0, 20)) log(`Aviso (seções): ${a}`);
  } else log('1º turno real por seção: indisponível (modelo por município + ruído)');

  const padraoCen = cenarioPadrao(st);
  const fallback = estadoPadrao(modo, iniciadoEm, padraoCen, st);
  let state: AdminState = opts.initialState ? parseAdminState(opts.initialState, fallback, st, { aviso: log }) : fallback;

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

  /** "Reveja a noite": t (epoch ms) limitado a [INICIO_SIMULACAO, agora] — nunca futuro; inválido = agora. */
  const limitaT = (agora: number, t?: number): number => {
    const a = Math.floor(agora / 1000) * 1000;
    if (t === undefined || t === null || !Number.isFinite(Number(t))) return a;
    return Math.min(a, Math.max(INICIO_SIMULACAO, Math.floor(Number(t) / 1000) * 1000));
  };

  /**
   * Instante dos DADOS: congelado → congeladoEm; fontes ≠ simulação → antes do início (2º turno em 0%).
   * Com `t`, o instante pedido (≤ agora). `simNow` do snapshot = instante dos dados (bucket de 1 s).
   */
  const instante = (wall: number, t?: number): { simNow: number; tDados: number; k: number } => {
    if (state.fonte !== 'simulacao') {
      const s = limitaT(wall, t);
      return { simNow: s, tDados: Math.min(s, INI - 1000), k: 0 };
    }
    const agora = state.congelado && state.congeladoEm !== null ? state.congeladoEm : simNowDe(state.relogio, wall);
    const tq = limitaT(agora, t);
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
  const t1SemSecao = (r: RaceInfo, u: number) =>
    new NotFoundError(
      `A corrida ${r.id} (1º turno) não tem resultados por zona ou seção em ${st.ufs[u]}: o conjunto de dados ` +
        `traz o 1º turno por município. Consulte o resultado do município.`,
    );
  const secaoOu404 = (m: number, p: number, zona: number, secao: number): number => {
    const n = Number(secao);
    for (let s = st.pairSecStart[p]; s < st.pairSecEnd[p]; s++) if (st.secNum[s] === n) return s;
    throw new NotFoundError(`Seção ${secao} não existe na zona ${zona} de ${st.mun[m].nome} (${st.ufs[st.munUf[m]]}).`);
  };

  const ctx = (wall: number, tPedido?: number): { c: Ctx; key: string } => {
    const inst = instante(wall, tPedido);
    const t = perf();
    const agg = atual.agg.get(inst.k);
    if (perf() - t > 0.05) ultimoCalculoMs = Math.round((perf() - t) * 100) / 100;
    // O conteúdo de um snapshot depende só de k (série e eventos têm o instante de chegada de alguma seção)
    // e de já ter passado das 17h (evento "início"): chave por (modelo, k, início) — no fim da noite, todas
    // as requisições caem na mesma entrada, e um `t` passado ("reveja a noite") reaproveita a mesma entrada
    // de qualquer outro instante com o mesmo k.
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
  /**
   * "Chaves da noite" no SERVIDOR: grava (e sincroniza as instâncias pelo admin.json, que adotam estado de mesma versão
   * com conteúdo diferente) SEM incrementar a versão — uma versão nova invalida o cache de todos os visitantes e as
   * ETags, e puxar o freio no pico não pode gerar uma rajada de consultas. No DEMO a versão sobe como nos outros
   * comandos: as abas se sincronizam pela ordem versão → âncora → JSON (src/engine/sync.ts), que sem versão nova
   * poderia preferir o estado anterior.
   */
  const mudouSemVersao = () => {
    if (modo !== 'servidor') return mudou();
    opts.onStateChange?.(state);
  };
  /** Ações que só o servidor executa (ele as intercepta antes do motor); aqui, recusadas sem mudar nada. */
  const SO_SERVIDOR: Record<string, string> = {
    'tse-retomar': 'Retomar as leituras do TSE',
    'alerta-teste': 'Alerta de teste',
    'precos-anuncie': 'Preços da página Anuncie',
  };

  const relogioAgora = (wall: number) => ({ ...state.relogio, ancoraSim: simNowDe(state.relogio, wall), ancoraWall: wall });

  const command = (cmd: AdminCommand): AdminSnapshot => {
    if (!cmd || typeof cmd !== 'object' || typeof (cmd as { tipo?: unknown }).tipo !== 'string')
      throw new CommandError('Comando inválido.');
    const wall = clock();
    let semVersao = false;
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
        log(`Relógio saltou para ${quando(alvo)}`);
        break;
      }
      case 'saltar-pct': {
        const pct = Number(cmd.pct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new CommandError('saltar-pct: pct deve estar entre 0 e 100.');
        const alvo = Math.ceil(tempoParaPct(pct) / 1000) * 1000;
        state = { ...state, relogio: { ...state.relogio, ancoraWall: wall, ancoraSim: alvo } };
        log(`Relógio saltou para ${pct}% das seções (${quando(alvo)})`);
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
      case 'nomes-reais': {
        const ativo = !!cmd.ativo;
        state = { ...state, nomesReais: ativo };
        log(ativo ? 'Nomes reais exibidos na simulação' : 'Nomes ocultos na simulação (Candidato A/B)');
        break;
      }
      case 'patrocinio': {
        // LEGADO: o patrocínio único vira (ou atualiza) o anúncio master 'patrocinio'
        const lista = state.anuncios ?? [];
        if (cmd.patrocinio === null) {
          state = { ...state, patrocinio: null, anuncios: lista.filter((a) => a.id !== ID_PATROCINIO) };
          log('Patrocínio removido');
          break;
        }
        const v = validaPatrocinio(cmd.patrocinio);
        if ('erro' in v) throw new CommandError(v.erro);
        const anterior = lista.find((a) => a.id === ID_PATROCINIO) ?? null;
        const a = anuncioDoPatrocinio(v.ok, anterior, nomesCandidatos());
        if ('erro' in a) throw new CommandError(a.erro);
        if (!anterior && lista.length >= ANUNCIO_LIMITES.maxAnuncios)
          throw new CommandError(`Limite de ${ANUNCIO_LIMITES.maxAnuncios} anúncios cadastrados: remova um antes de publicar o patrocínio.`);
        const conflito = conflitoMaster(lista, a.ok);
        if (conflito) throw new CommandError(mensagemConflitoMaster(conflito));
        state ={ ...state, patrocinio: null, anuncios: anterior ? lista.map((x) => (x.id === ID_PATROCINIO ? a.ok : x)) : [a.ok, ...lista] };
        log(`Patrocínio publicado como anúncio master (${a.ok.marca})`);
        break;
      }
      case 'anuncio-salvar': {
        const lista = state.anuncios ?? [];
        const bruto = cmd.anuncio as unknown;
        const id = bruto && typeof bruto === 'object' && typeof (bruto as { id?: unknown }).id === 'string' ? (bruto as { id: string }).id.trim().toLowerCase() : '';
        const anterior = lista.find((a) => a.id === id) ?? null;
        const v = normalizaAnuncio(bruto, anterior, nomesCandidatos());
        if ('erro' in v) throw new CommandError(v.erro);
        if (!anterior && lista.length >= ANUNCIO_LIMITES.maxAnuncios)
          throw new CommandError(`Limite de ${ANUNCIO_LIMITES.maxAnuncios} anúncios cadastrados: remova um antes de criar outro.`);
        // venda: dois masters (sem reserva, ativos) no mesmo formato prioritário e com janelas que se cruzam → recusado
        const conflito = conflitoMaster(lista, v.ok);
        if (conflito) throw new CommandError(mensagemConflitoMaster(conflito));
        state = { ...state, anuncios: anterior ? lista.map((x) => (x.id === v.ok.id ? v.ok : x)) : [...lista, v.ok] };
        log(`Anúncio ${anterior ? 'atualizado' : 'criado'}: ${v.ok.marca} (${v.ok.id}${v.ok.ativo ? '' : ', pausado'})`);
        break;
      }
      case 'anuncio-remover': {
        const lista = state.anuncios ?? [];
        const id = String(cmd.id ?? '').trim().toLowerCase();
        const a = lista.find((x) => x.id === id);
        if (!a) throw new CommandError(`Anúncio "${id.slice(0, 40)}" não encontrado.`);
        state = { ...state, anuncios: lista.filter((x) => x.id !== id) };
        log(`Anúncio removido: ${a.marca} (${a.id})`);
        break;
      }
      case 'anuncio-ativo': {
        const lista = state.anuncios ?? [];
        const id = String(cmd.id ?? '').trim().toLowerCase();
        const a = lista.find((x) => x.id === id);
        if (!a) throw new CommandError(`Anúncio "${id.slice(0, 40)}" não encontrado.`);
        if (typeof cmd.ativo !== 'boolean') throw new CommandError('anuncio-ativo: informe "ativo" (true ou false).');
        // reativar um master pausado não pode sobrepor outro master (mesma regra do salvar)
        const conflito = cmd.ativo && !a.ativo ? conflitoMaster(lista, { ...a, ativo: true }) : null;
        if (conflito) throw new CommandError(mensagemConflitoMaster(conflito));
        state = { ...state, anuncios: lista.map((x) => (x.id === id ? { ...x, ativo: cmd.ativo } : x)) };
        log(`Anúncio ${cmd.ativo ? 'ativado' : 'pausado'}: ${a.marca} (${a.id})`);
        break;
      }
      case 'anuncio-logo': {
        // "Ajustar agora" (e o desfazer): troca SÓ a logo e a versão escura (com os ajustes). Campo ausente = mantém;
        // null = apaga (apagar a imagem apaga o ajuste dela). Sem declaração nova: mesma marca, mesmo conteúdo.
        const lista = state.anuncios ?? [];
        const id = String(cmd.id ?? '').trim().toLowerCase();
        const a = lista.find((x) => x.id === id);
        if (!a) throw new CommandError(`Anúncio "${id.slice(0, 40)}" não encontrado.`);
        const junto: Record<string, unknown> = { logo: a.logo, logoAjuste: a.logoAjuste, logoEscuro: a.logoEscuro, logoEscuroAjuste: a.logoEscuroAjuste };
        for (const [campo, campoAjuste] of [
          ['logo', 'logoAjuste'],
          ['logoEscuro', 'logoEscuroAjuste'],
        ] as const) {
          const img = cmd[campo];
          if (img === null) {
            junto[campo] = undefined;
            junto[campoAjuste] = undefined;
          } else if (img !== undefined) {
            if (typeof img !== 'string' || !img.trim()) throw new CommandError(`Anúncio: ${campo === 'logo' ? 'logo' : 'versão para fundo escuro'} inválida.`);
            junto[campo] = img.trim();
          }
          const ajuste = cmd[campoAjuste];
          if (ajuste === null) junto[campoAjuste] = undefined;
          else if (ajuste !== undefined) junto[campoAjuste] = ajuste;
        }
        const v = validaLogoAnuncio(junto);
        if ('erro' in v) throw new CommandError(v.erro);
        const novo: AnuncioConfig = { ...a };
        delete novo.logo;
        delete novo.logoAjuste;
        delete novo.logoEscuro;
        delete novo.logoEscuroAjuste;
        Object.assign(novo, v.ok);
        // a peça e o resto do anúncio seguem como estão; URL do servidor não resolvida mantém a imagem anterior
        imagensDoEstado(novo, a);
        state = { ...state, anuncios: lista.map((x) => (x.id === id ? novo : x)) };
        log(`Logo ajustada: ${a.marca} (${a.id})`);
        break;
      }
      case 'anuncios-suspensao': {
        // interruptor geral: nada é apagado nem pausado; voltar devolve exatamente o que estava no ar
        if (typeof cmd.suspender !== 'boolean') throw new CommandError('anuncios-suspensao: informe "suspender" (true ou false).');
        const motivo = typeof cmd.motivo === 'string' ? cmd.motivo.trim().replace(/\s+/g, ' ') : '';
        if (motivo.length > 140) throw new CommandError('Comando inválido — motivo: máximo de 140 caracteres');
        if (cmd.suspender) {
          const desde = state.anunciosSuspensos?.desde ?? wall;
          state = { ...state, anunciosSuspensos: motivo ? { desde, motivo } : { desde } };
          log(`Anúncios suspensos: todos fora do ar${motivo ? ` (${motivo})` : ''}`);
        } else {
          const estava = !!state.anunciosSuspensos;
          state = { ...state, anunciosSuspensos: null };
          log(estava ? 'Anúncios de volta ao ar (fim da suspensão geral)' : 'Anúncios: suspensão geral já estava desligada');
        }
        break;
      }
      case 'contatos': {
        const v = validaContatosPublicos(cmd.contatos);
        if ('erro' in v) throw new CommandError(v.erro);
        const contatos = Object.keys(v.ok).length ? v.ok : null;
        state = { ...state, contatos };
        log(contatos ? 'Contatos públicos atualizados' : 'Contatos públicos removidos');
        break;
      }
      case 'anuncie-contato': {
        const v = validaContatoAnuncie(cmd.contato);
        if ('erro' in v) throw new CommandError(v.erro);
        const contato = Object.keys(v.ok).length ? v.ok : null;
        state = { ...state, anuncie: contato };
        log(contato ? 'Contato da página Anuncie atualizado' : 'Contato da página Anuncie removido');
        break;
      }
      case 'troca-auto': {
        // Só guarda as escolhas; quem executa no horário é o servidor (src/server/troca-auto.ts).
        const ta = { ...trocaAutoPadrao(), ...state.trocaAuto };
        const quandoTroca = (ms: number) => `${fmtHoraSeg(ms)} de ${fmtDataHora(ms).slice(0, 5)}`;
        if (cmd.acao === 'ligar') {
          ta.ligada = true;
          ta.feitaEm = null;
          log('Troca automática para o TSE: ligada');
        } else if (cmd.acao === 'desligar') {
          ta.ligada = false;
          log('Troca automática para o TSE: desligada');
        } else if (cmd.acao === 'adiar') {
          const para = cmd.para;
          if (para !== null && !(typeof para === 'number' && Number.isFinite(para) && para >= TROCA_AUTO_MIN && para <= TROCA_AUTO_MAX))
            throw new CommandError('troca-auto: horário inválido.');
          ta.adiadaPara = para === null ? null : Math.floor(para);
          ta.feitaEm = null;
          log(para === null ? 'Troca automática para o TSE: horário padrão' : `Troca automática para o TSE: marcada para ${quandoTroca(para)}`);
        } else if (cmd.acao === 'agora') {
          ta.ligada = true;
          ta.adiadaPara = wall;
          ta.feitaEm = null;
          log('Troca automática para o TSE: tentar agora');
        } else if (cmd.acao === 'executar') {
          if (state.fonte !== 'tse') log(`Fonte: ${state.fonte} → tse (troca automática)`);
          state = { ...state, fonte: 'tse' };
          ta.feitaEm = wall;
        } else if (cmd.acao === 'concluir') {
          ta.feitaEm = wall;
          log('Troca automática para o TSE: concluída (fonte já definida no painel)');
        } else throw new CommandError(`troca-auto: ação inválida "${String((cmd as { acao?: unknown }).acao)}".`);
        state = { ...state, trocaAuto: ta };
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
        if (t.intervaloPrioritarioSeg !== undefined) {
          const n = Number(t.intervaloPrioritarioSeg);
          if (!Number.isFinite(n) || n < 3 || n > 600) throw new CommandError('tse.intervaloPrioritarioSeg deve estar entre 3 e 600.');
          next.intervaloPrioritarioSeg = n;
        }
        if (t.limitePorSeg !== undefined) {
          const n = Number(t.limitePorSeg);
          const { min, max } = TSE_LIMITE_POR_SEG;
          if (!Number.isInteger(n) || n < min || n > max) throw new CommandError(`tse.limitePorSeg deve ser um inteiro entre ${min} e ${max}.`);
          next.limitePorSeg = n;
        }
        state = { ...state, tse: next };
        log('Configuração do TSE atualizada');
        break;
      }
      // ---- "Chaves da noite" (leva 3): só gravam a escolha; quem age é o servidor/app (ver ChavesNoite) -------------
      case 'freio': {
        if (!ehFatorCarga(cmd.fator)) throw new CommandError('freio: use o fator 1, 2, 3 ou 5.');
        if (cmd.leve !== undefined && typeof cmd.leve !== 'boolean') throw new CommandError('freio: "leve" deve ser true ou false.');
        const leve = cmd.leve === true;
        state = { ...state, noite: { ...chavesNoite(state), freio: { fator: cmd.fator, leve } } };
        log(cmd.fator === 1 && !leve ? 'Freio solto: consultas no ritmo normal' : `Freio: consultas ${cmd.fator}× mais espaçadas${leve ? ', modo leve' : ''}`);
        semVersao = true;
        break;
      }
      case 'contador-publico':
      case 'html-borda':
      case 'medir-anuncios':
      case 'texto-bots':
      case 'contar-lives': {
        if (typeof cmd.ligado !== 'boolean') throw new CommandError(`${cmd.tipo}: informe "ligado" (true ou false).`);
        state = { ...state, noite: { ...chavesNoite(state), [COMANDO_CHAVE[cmd.tipo]]: cmd.ligado } };
        log(`${ROTULO_CHAVE[cmd.tipo]}: ${cmd.ligado ? 'ligado' : 'desligado'}`);
        semVersao = true;
        break;
      }
      case 'aviso-nacional': {
        if (!MODOS_AVISO_NACIONAL.includes(cmd.modo)) throw new CommandError('aviso-nacional: use o modo "auto" ou "off".');
        state = { ...state, noite: { ...chavesNoite(state), avisoNacional: cmd.modo } };
        log(cmd.modo === 'auto' ? 'Aviso do arquivo nacional parado: automático' : 'Aviso do arquivo nacional parado: desligado');
        semVersao = true;
        break;
      }
      case 'tse-retomar':
      case 'alerta-teste':
      case 'precos-anuncie':
        throw new CommandError(`${SO_SERVIDOR[cmd.tipo]}: comando indisponível nesta versão.`);
      default:
        throw new CommandError(`Comando desconhecido: "${String((cmd as { tipo?: unknown }).tipo)}".`);
    }
    if (semVersao) mudouSemVersao();
    else mudou();
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
    const pub = anunciosPublicos(wall);
    const carga = cargaDoFreio(state.noite?.freio);
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
      anonimizado: sim && !state.nomesReais,
      patrocinio: pub.patrocinio,
      anuncios: pub.anuncios,
      ...(state.anunciosSuspensos ? { anunciosSuspensos: true as const } : {}),
      anuncie: state.anuncie ? { ...state.anuncie } : null,
      contatos: state.contatos ? { ...state.contatos } : null,
      // freio do painel (I37): só quando puxado — ausente = ritmo normal
      ...(carga ? { carga } : {}),
    };
  };

  // ---- anúncios no ar (relógio REAL: a janela de exibição nunca segue o relógio da simulação) ------------
  /**
   * Lista pública memorizada pela lista do estado (trocada a cada comando) e válida até o próximo início/fim de
   * janela: o status é consultado a cada requisição.
   */
  let memoPub: {
    ref: AnuncioConfig[] | undefined;
    suspensos: boolean;
    desde: number;
    ate: number;
    anuncios: AnuncioPublico[];
    patrocinio: Patrocinio | null;
  } | null = null;
  const anunciosPublicos = (wall: number) => {
    const lista = state.anuncios;
    const suspensos = !!state.anunciosSuspensos;
    if (memoPub && memoPub.ref === lista && memoPub.suspensos === suspensos && wall >= memoPub.desde && wall < memoPub.ate) return memoPub;
    // interruptor geral ligado: nenhum anúncio no site, nas lives nem nas imagens (nem o patrocínio legado)
    if (suspensos) {
      memoPub = { ref: lista, suspensos, desde: wall, ate: Infinity, anuncios: [], patrocinio: null };
      return memoPub;
    }
    let ate = Infinity;
    for (const a of lista ?? []) {
      if (a.inicio && a.inicio > wall) ate = Math.min(ate, a.inicio);
      if (a.fim && a.fim > wall) ate = Math.min(ate, a.fim);
    }
    const noAr = (lista ?? []).filter((a) => anuncioNoAr(a, wall));
    memoPub = { ref: lista, suspensos, desde: wall, ate, anuncios: noAr.map(anuncioPublico), patrocinio: patrocinioLegado(noAr) };
    return memoPub;
  };

  const meta = (): PublicMeta => ({ races: ds.meta.races, ufs: ds.meta.ufs, inicioApuracao: INI });
  /** Nomes de urna e completos dos candidatos do dataset: anúncio que os cite é recusado (anuncios-politica.ts). */
  let nomesMemo: string[] | null = null;
  const nomesCandidatos = (): string[] =>
    (nomesMemo ??= [...new Set(ds.meta.races.flatMap((r) => r.candidatos.filter((c) => !c.agregado).flatMap((c) => [c.nomeUrna, c.nome])))].filter(
      (n): n is string => typeof n === 'string' && n.trim().length > 0,
    ));

  // ---- locais de votação (sob demanda por UF, com cache) -----------------------------------------
  interface LocaisUf {
    /** índice do local por seção da UF (posição i − ufSecStart); −1 = desconhecido */
    idx: Int32Array;
    lista: LocalResumo[];
  }
  const locaisUf = new Map<number, LocaisUf | null>();
  const locaisPromessa = new Map<number, Promise<boolean>>();

  const montaLocais = (u: number, d: LocaisUfDataset): LocaisUf | null => {
    if (!d || !Array.isArray(d.locais)) return null;
    const uf = st.ufs[u];
    const s0 = st.ufSecStart[u];
    const idx = new Int32Array(st.ufSecEnd[u] - s0).fill(-1);
    const lista: LocalResumo[] = d.locais.map((l) => {
      const o: LocalResumo = { nome: String(l?.nome ?? ''), endereco: String(l?.endereco ?? '') };
      if (l?.bairro) o.bairro = String(l.bairro);
      if (typeof l?.lat === 'number' && Number.isFinite(l.lat)) o.lat = l.lat;
      if (typeof l?.lon === 'number' && Number.isFinite(l.lon)) o.lon = l.lon;
      return o;
    });
    // Pelas faixas de seções de cada local (o próprio arquivo de locais; cobre 100% das seções em 2026). A coluna
    // `local` de SecaoUfDataset não é usada: um arquivo de locais regenerado em outra ordem apontaria a escola errada.
    const posSecao = new Map<number, number>(); // (par, nº da seção) → índice global
    for (let m = st.ufMunStart[u]; m < st.ufMunEnd[u]; m++)
      for (let p = st.munPairStart[m]; p < st.munPairEnd[m]; p++)
        for (let i = st.pairSecStart[p]; i < st.pairSecEnd[p]; i++) posSecao.set(p * 65536 + st.secNum[i], i);
    d.locais.forEach((l, li) => {
      if (!l || typeof l.secoes !== 'string') return;
      const cod = /^\d+$/.test(String(l.cod)) ? String(l.cod).padStart(5, '0') : String(l.cod);
      const m = st.munKey.get(`${uf}|${cod}`);
      if (m === undefined) return;
      let p = -1;
      for (let q = st.munPairStart[m]; q < st.munPairEnd[m]; q++) if (st.pairZona[q] === Number(l.zona)) p = q;
      if (p < 0) return;
      try {
        forEachFaixa(l.secoes, (n) => {
          const i = posSecao.get(p * 65536 + n);
          if (i !== undefined) idx[i - s0] = li;
        });
      } catch {
        /* faixa inválida: ignora o local */
      }
    });
    return { idx, lista };
  };

  /** Locais já disponíveis (pré-carregados em ds.locais ou carregados por `carregaLocais`). */
  const locaisDe = (u: number): LocaisUf | null => {
    if (locaisUf.has(u)) return locaisUf.get(u) ?? null;
    const pre = ds.locais?.[st.ufs[u]];
    if (pre) {
      const l = montaLocais(u, pre);
      locaisUf.set(u, l);
      return l;
    }
    return null;
  };

  const carregaLocais = (uf: UF | string): Promise<boolean> => {
    const u = st.ufIndex.get(String(uf).toUpperCase());
    if (u === undefined) return Promise.resolve(false);
    if (locaisDe(u)) return Promise.resolve(true);
    if (locaisUf.has(u)) return Promise.resolve(false);
    const em = locaisPromessa.get(u);
    if (em) return em;
    if (!ds.load) return Promise.resolve(false);
    const t0 = perf();
    const pr = ds
      .load(`data/locais/${st.ufs[u].toLowerCase()}.json`)
      .then((d) => montaLocais(u, d as LocaisUfDataset))
      .catch(() => null)
      .then((l) => {
        locaisUf.set(u, l);
        locaisPromessa.delete(u);
        if (l) log(`Locais de votação de ${st.ufs[u]}: ${l.lista.length} locais (${Math.round(perf() - t0)} ms)`);
        return l !== null;
      });
    locaisPromessa.set(u, pr);
    return pr;
  };

  /** Locais já carregados das seções de uma zona (nº da seção → local); null sem locais/município/zona. */
  const locaisDaZona = (uf: UF | string, cod: string, zona: number): Map<number, LocalResumo> | null => {
    const U = String(uf).toUpperCase();
    const u = st.ufIndex.get(U);
    if (u === undefined) return null;
    const l = locaisDe(u);
    if (!l) return null;
    const c = /^\d+$/.test(String(cod)) ? String(cod).padStart(5, '0') : String(cod);
    const m = st.munKey.get(`${U}|${c}`);
    if (m === undefined) return null;
    const z = Number(zona);
    const s0 = st.ufSecStart[u];
    for (let p = st.munPairStart[m]; p < st.munPairEnd[m]; p++) {
      if (st.pairZona[p] !== z) continue;
      const out = new Map<number, LocalResumo>();
      for (let i = st.pairSecStart[p]; i < st.pairSecEnd[p]; i++) {
        const li = l.idx[i - s0];
        if (li >= 0) out.set(st.secNum[i], l.lista[li]);
      }
      return out;
    }
    return null;
  };

  /** Função de local por seção da UF (dispara o carregamento em segundo plano se ainda não houver). */
  const localDe = (u: number): { fn: LocalDe | undefined; tag: string } => {
    const l = locaisDe(u);
    if (!l) {
      if (!locaisUf.has(u) && ds.load) void carregaLocais(st.ufs[u]);
      return { fn: undefined, tag: 'L0' };
    }
    const s0 = st.ufSecStart[u];
    return {
      fn: (i: number) => {
        const li = l.idx[i - s0];
        return li >= 0 ? l.lista[li] : undefined;
      },
      tag: 'L1',
    };
  };

  // ---- mapa nacional por município --------------------------------------------------------------
  let ordemBrCache: Int32Array | null = null;
  /** Índice do município (estrutura) em cada posição de MunicipiosBr.ordem (−1 = sem correspondência). */
  const ordemBr = (): Int32Array => {
    if (ordemBrCache) return ordemBrCache;
    const mb = ds.municipiosBr;
    let ordem: Int32Array;
    if (mb && Array.isArray(mb.ordem) && mb.ordem.length) {
      const porIbge = new Map<string, number>();
      for (let m = 0; m < st.nMun; m++) if (st.mun[m].ibge) porIbge.set(st.mun[m].ibge, m);
      ordem = new Int32Array(mb.ordem.length).fill(-1);
      let faltam = 0;
      for (let j = 0; j < mb.ordem.length; j++) {
        const uf = String(mb.uf?.[j] ?? '').toUpperCase();
        const cod = mb.cod?.[j] !== undefined ? String(mb.cod[j]).padStart(5, '0') : '';
        let m = cod ? st.munKey.get(`${uf}|${cod}`) : undefined;
        if (m === undefined) m = porIbge.get(String(mb.ordem[j]));
        if (m === undefined) faltam++;
        else ordem[j] = m;
      }
      if (faltam) log(`municipios-br.json: ${faltam} posição(ões) sem município correspondente no dataset`);
    } else {
      // ordem canônica derivada: UFs em ordem alfabética, municípios na ordem do dataset, sem o exterior
      const lista: number[] = [];
      for (const uf of UFS) {
        const u = st.ufIndex.get(uf);
        if (u === undefined) continue;
        for (let m = st.ufMunStart[u]; m < st.ufMunEnd[u]; m++) lista.push(m);
      }
      ordem = Int32Array.from(lista);
    }
    ordemBrCache = ordem;
    return ordem;
  };

  const controller: Controller = {
    modo,
    meta,
    status,
    state: () => structuredCloneSafe(state),
    setState(s: AdminState) {
      const next = parseAdminState(s, state, st, { aviso: log });
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
    carregaLocais,
    locaisDaZona,

    nacional(race: RaceId, t?: number): NationalSnapshot {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      if (r.turno === 1) {
        const v = cacheGet(`t1|nac|${r.id}`, () => nacional1t(st, t1(r), wall, wall));
        return fresco(v, wall, Math.floor(simNowAt(wall) / 1000) * 1000);
      }
      const { c, key } = ctx(wall, t);
      return fresco(cacheGet(`${key}|nac|${r.id}`, () => nacional2t(c, r)), wall, c.simNow);
    },
    uf(race: RaceId, uf: UF, t?: number): UfSnapshot {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      const u = ufOu404(r, uf);
      if (r.turno === 1) {
        const v = cacheGet(`t1|uf|${r.id}|${u}`, () => uf1t(st, t1(r), u, wall, wall));
        return fresco(v, wall, Math.floor(simNowAt(wall) / 1000) * 1000);
      }
      const { c, key } = ctx(wall, t);
      return fresco(cacheGet(`${key}|uf|${r.id}|${u}`, () => uf2t(c, r, u)), wall, c.simNow);
    },
    municipio(race: RaceId, uf: UF, cod: string, t?: number): MunicipioSnapshot {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      const m = munOu404(r, uf, cod);
      if (r.turno === 1) {
        const v = cacheGet(`t1|mun|${r.id}|${m}`, () => municipio1t(st, t1(r), m, wall, wall));
        return fresco(v, wall, Math.floor(simNowAt(wall) / 1000) * 1000);
      }
      const { c, key } = ctx(wall, t);
      return fresco(cacheGet(`${key}|mun|${r.id}|${m}`, () => municipio2t(c, r, m)), wall, c.simNow);
    },
    zona(race: RaceId, uf: UF, cod: string, zona: number, t?: number): ZonaSnapshot {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      const m = munOu404(r, uf, cod);
      const p = pairOu404(m, zona);
      const u = st.munUf[m];
      if (r.turno === 1 && !t1TemSecao(st, r, u)) throw t1SemSecao(r, u);
      const loc = localDe(u);
      if (r.turno === 1) {
        const v = cacheGet(`t1|zona|${r.id}|${p}|${loc.tag}`, () => zona1t(st, r, p, wall, wall, loc.fn));
        return fresco(v, wall, Math.floor(simNowAt(wall) / 1000) * 1000);
      }
      const { c, key } = ctx(wall, t);
      return fresco(cacheGet(`${key}|zona|${r.id}|${p}|${loc.tag}`, () => zona2t(c, r, p, loc.fn)), wall, c.simNow);
    },
    secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number, t?: number): SecaoDetalhe | null {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      const m = munOu404(r, uf, cod);
      const p = pairOu404(m, zona);
      const u = st.munUf[m];
      if (r.turno === 1 && !t1TemSecao(st, r, u)) throw t1SemSecao(r, u);
      const i = secaoOu404(m, p, zona, secao);
      const loc = localDe(u);
      if (r.turno === 1) return secao1t(st, r, i, loc.fn);
      const { c } = ctx(wall, t);
      return secao2t(c, r, i, loc.fn);
    },
    municipiosBr(race: RaceId, t?: number): MunicipiosNacionalSnapshot {
      const wall = clock();
      contaReq(wall);
      const r = raceOu404(race);
      const ordem = ordemBr();
      if (r.turno === 1) {
        const v = cacheGet(`t1|mbr|${r.id}`, () => municipiosBr1t(st, t1(r), ordem, wall, wall));
        return fresco(v, wall, Math.floor(simNowAt(wall) / 1000) * 1000);
      }
      const { c, key } = ctx(wall, t);
      return fresco(cacheGet(`${key}|mbr|${r.id}`, () => municipiosBr2t(c, r, ordem)), wall, c.simNow);
    },
  };
  return controller;
}

/**
 * Cópia profunda de dados JSON (objetos e listas) que COMPARTILHA as strings (imutáveis): o estado leva as imagens dos
 * anúncios em data URI (centenas de KB) e é copiado a cada `state()`/snapshot do admin — copiar a string seria caro.
 * Mesma semântica do JSON: `undefined` em objeto some; número não finito vira null.
 */
function structuredCloneSafe<T>(v: T): T {
  return clonar(v) as T;
}

function clonar(v: unknown): unknown {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) return null;
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => (x === undefined || typeof x === 'function' ? null : clonar(x)));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (x === undefined || typeof x === 'function') continue;
    out[k] = clonar(x);
  }
  return out;
}

/** Anúncio como o site recebe (link com UTM no motor; o servidor troca por /api/anuncio/ir/<id>). */
export function anuncioPublico(a: AnuncioConfig): AnuncioPublico {
  const p: AnuncioPublico = {
    id: a.id,
    marca: a.marca,
    titulo: a.titulo,
    texto: a.texto,
    cta: a.cta,
    href: urlComUtm(a.url, a.id, 'link'),
    destino: dominioAnuncio(a.url),
    formatos: [...a.formatos],
    peso: a.peso,
    cota: a.cota,
  };
  if (a.logo) p.logo = a.logo;
  if (a.imagem) p.imagem = a.imagem;
  // contrato v2: como desenhar as imagens, versão escura da logo e a cota Reserva — NUNCA a meta (`limiteImpressoes`)
  if (a.logo && a.logoAjuste) p.logoAjuste = { ...a.logoAjuste };
  if (a.logoEscuro) {
    p.logoEscuro = a.logoEscuro;
    if (a.logoEscuroAjuste) p.logoEscuroAjuste = { ...a.logoEscuroAjuste };
  }
  if (a.imagem && a.imagemAjuste) p.imagemAjuste = { ...a.imagemAjuste };
  if (a.reserva) p.reserva = true;
  return p;
}

/**
 * LEGADO: qual anúncio vira o `LiveStatus.patrocinio` das telas antigas — dos anúncios no ar com o formato 'topo', o
 * master; senão o 1º pago (sem reserva); senão o 1º. O servidor usa a mesma escolha para montar o link de clique.
 */
export function anuncioDoLegado<T extends Pick<AnuncioConfig, 'formatos' | 'cota' | 'reserva'>>(noAr: readonly T[] | null | undefined): T | undefined {
  const topo = (noAr ?? []).filter((a) => a.formatos.includes('topo'));
  return topo.find((x) => x.cota === 'master' && !x.reserva) ?? topo.find((x) => !x.reserva) ?? topo[0];
}

/** LEGADO `LiveStatus.patrocinio`: link com UTM do formato 'topo' (no servidor, /api/anuncio/ir/<id>?f=topo). */
export function patrocinioLegado(noAr: readonly AnuncioConfig[]): Patrocinio | null {
  const a = anuncioDoLegado(noAr);
  if (!a) return null;
  const p: Patrocinio = { marca: a.marca, texto: a.texto || a.titulo, url: urlComUtm(a.url, a.id, 'topo') };
  if (a.logo) p.imagem = a.logo;
  return p;
}
