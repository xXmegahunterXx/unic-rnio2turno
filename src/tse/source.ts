/**
 * TseSource: fonte de dados 'tse' (feed oficial ao vivo) com a MESMA forma dos snapshots do motor.
 *
 *   const tse = new TseSource({ config: state.tse, races: meta.races, log });
 *   tse.start();                       // polling a cada `intervaloSeg` (padrão 15 s)
 *   await tse.nacional('pres');        // NationalSnapshot
 *   await tse.uf('pres', 'SP');        // UfSnapshot (municípios sob demanda, com cache)
 *   await tse.municipio('pres', 'SP', '71072');
 *   await tse.zona('pres', 'SP', '71072', 1);
 *   await tse.secao('pres', 'SP', '71072', 1, 1);  // boletim de urna (bu.dat) decodificado
 *   await tse.nacional('pres', t);     // "reveja a noite": snapshot mais recente com instante ≤ t (nacional/UF)
 *   await tse.municipiosBr('pres', ordem);  // mapa nacional por município (o que já está em cache)
 *   tse.health(); tse.stop();
 *
 * Estratégia (detalhes e URLs em src/tse/README.md):
 *  - Polling: arquivo Brasil + 28 UFs de Presidente e a UF de cada Governador (requisição condicional: o
 *    CDN do TSE responde 304). A cada mudança: ponto de série + eventos por diferença (eventos.ts).
 *  - Arquivo prioritário: o resumo Brasil de Presidente (o menor e o mais olhado) tem um laço próprio, mais curto
 *    (`intervaloPrioritarioSeg`, padrão 5 s), com 1 tentativa por vez, prioridade alta na fila do cliente e backoff
 *    exponencial quando o TSE falha; o laço normal deixa de pedi-lo enquanto o prioritário está em dia. Cópia mais
 *    ANTIGA vinda de outro servidor do CDN do TSE (geração `dg/hg` anterior à que já temos) é descartada: o placar
 *    nunca "volta" por causa do cache deles.
 *  - Marca (`marca()`/`frescor()`): hash do conteúdo de cada corrida, muda quando o TSE publica dado novo; o servidor
 *    publica no /api/status e usa no ETag, e o app reconsulta o placar na hora.
 *  - Não existe arquivo com os votos de todos os municípios de uma UF. O `-ab.json` da UF (1 arquivo) diz
 *    quantas seções cada município já totalizou; só os municípios que mudaram são baixados, por uma fila com
 *    prioridade (UFs consultadas nos últimos minutos primeiro), no máximo 1 vez por `municipioTtlMs`.
 *  - Zona: arquivo por município+zona (`{uf}{mun}-z{zona}-c…-u.json`). Seções: status pelo `-cs.json` da UF
 *    (`da`/`ha` = arquivos da urna publicados); votos de uma seção só sob demanda, pelo BU.
 *  - Histórico ("reveja a noite"): a cada mudança, o Summary completo do Brasil e de cada UF e, a cada
 *    download de município que mudou os números, o do município (eventos.ts, `HistoricoCorrida`). Com `t`
 *    (epoch ms, passado), `nacional`/`uf`/`municipiosBr` respondem o estado mais recente com instante ≤ t;
 *    município, zona e seção sempre respondem o agora (não guardamos zonas nem BUs por instante).
 *  - Erros do TSE nunca derrubam: o último dado bom é mantido e `health()` expõe o problema. Métodos não
 *    lançam por falha de rede; lançam `NotFoundError` só para corrida/UF/município/zona inexistentes.
 *  - I03 (leva 3): o cliente respeita um teto de pedidos por segundo (`limitePorSeg`, balde de fichas com fatia
 *    reservada para os arquivos Brasil/UF das disputas) e reconhece quando o TSE bloqueia (429, 403 da borda dele ou
 *    403 num arquivo já lido): TUDO pausa até o Retry-After ou 11 min (laço prioritário, laço normal, fila de
 *    municípios e consultas de visitantes), com log, `health().bloqueio`/`ok: false`, `frescor().tseBloqueadoAte` e
 *    `retomar()` ("Retomar agora" no painel). `conferidoEm` só avança com 200/304 do arquivo principal (um 404/403 de
 *    "ainda não publicado" não conta como leitura boa). Arquivo de município/zona ainda não publicado: cache negativo de
 *    60 s que dobra até 10 min (zerado quando o acompanhamento da UF mostra o município andando).
 *  - I18 (leva 3): o arquivo NACIONAL de Presidente parado (mesma geração `dg/hg` há mais de 90 s) enquanto a soma das
 *    seções totalizadas das UFs e do exterior passa a dele → `frescor().nacionalParadoDesde` (aviso factual no app; nunca
 *    somamos os estados no lugar do arquivo oficial). Some quando o arquivo nacional volta a mudar.
 *
 * Isomórfico (fetch + timers), mas pensado para o servidor (um poller para todos os clientes).
 */
import type {
  FrescorCorrida,
  ModoPausaTse,
  MunicipioResumo,
  MunicipioSnapshot,
  MunicipiosNacionalSnapshot,
  NationalSnapshot,
  PrimeiroTurnoLocal,
  Race,
  RaceId,
  SecaoDetalhe,
  SecaoResumo,
  Summary,
  TseConfig,
  UF,
  UfSnapshot,
  ZonaMosaico,
  ZonaResumo,
  ZonaSnapshot,
} from '../shared/types';
import { NotFoundError } from '../engine/api';
import {
  MOTIVO_BLOQUEIO_TEXTO,
  TseBloqueioError,
  TseClient,
  type BloqueioTse,
  type FetchLike,
  type Prioridade,
  type TseClientStats,
  type Validadores,
} from './client';
import {
  tsePaths,
  type TseAcompanhamentoArquivo,
  type TseAcompanhamentoItem,
  type TseAuxArquivo,
  type TseConfigGeralArquivo,
  type TseMunicipiosArquivo,
  type TseResultadoArquivo,
  type TseSecoesArquivo,
} from './feed';
import * as map from './map';
import { aplicarCores } from '../shared/cores';
import { fmtHoraSeg } from '../shared/format';
import { type Abr, HistoricoCorrida, type HistoricoSerializado } from './eventos';
import { lerBoletimUrna } from './bu';

// ---------------------------------------------------------------------------------------------
// Opções e saúde
// ---------------------------------------------------------------------------------------------

export interface TseSourceOptions {
  /** baseUrl, ciclo, eleicaoPres, eleicaoGov, pleito, intervaloSeg (AdminState.tse). */
  config: TseConfig;
  /** Corridas do dataset (DatasetMeta.races): ordem dos candidatos, UFs e códigos das corridas '-t1'. */
  races: Race[];
  fetch?: FetchLike;
  /** Cliente pronto (testes); se ausente, um é criado com `fetch` e `concorrencia`. */
  client?: TseClient;
  /** Requisições simultâneas ao TSE (1–8). Padrão 6. */
  concorrencia?: number;
  now?: () => number;
  log?: (msg: string) => void;
  /** Intervalo mínimo entre downloads do mesmo município/zona. Padrão 60 s. */
  municipioTtlMs?: number;
  /** Validade do `-cs.json` (status das seções/mosaico). Padrão 120 s. */
  secoesTtlMs?: number;
  /** Validade dos arquivos das corridas de 1º turno (dados finais). Padrão 10 min. */
  t1TtlMs?: number;
  /** Mantém os municípios das UFs em apuração atualizados em segundo plano. Padrão true. */
  aquecerMunicipios?: boolean;
  /** Downloads simultâneos da fila de municípios (≤ concorrência). Padrão 3. */
  workersMunicipios?: number;
  /** Quanto uma consulta espera o TSE antes de responder com o que tem. Padrão 12 s. */
  esperaMaxMs?: number;
  /** Nome de exibição do município (ex.: do dataset), para coincidir com o resto do app. */
  nomeMunicipio?: (uf: UF, cod: string) => string | undefined;
  /** Histórico salvo por `exportarHistorico()` (sobrevive a reinícios). */
  historico?: HistoricoSerializado[];
  /** Quando pausar por bloqueio do TSE (chave 'pausa-tse'; ver `TseClientOptions.modoPausa`). Padrão 'auto'. */
  modoPausa?: () => ModoPausaTse;
  /** Pausa por bloqueio em curso antes de um reinício (ver `TseClientOptions.bloqueioInicial`). */
  bloqueioInicial?: BloqueioTse | null;
}

export interface TseCorridaHealth {
  race: RaceId;
  /** corrida efetivamente mapeada (≠ race quando códigos de 1º turno são usados numa corrida de 2º) */
  mapeadaComo: RaceId | null;
  eleicao: string;
  status: Summary['status'] | null;
  secoes: number;
  secoesTotalizadas: number;
  ultimaAtualizacao: number | null;
  ultimoPoll: number | null;
  ultimoPollOk: number | null;
  ultimoPollMs: number | null;
  falhasConsecutivas: number;
  erro: string | null;
  /** abrangências cujo arquivo ainda não existe no TSE (404) */
  ausentes: Abr[];
  /** última leitura com 200/304 do arquivo principal (o `conferidoEm` do frescor; um 404 não conta) */
  conferidoEm: number | null;
  /** I18: arquivo nacional parado com os estados andando, desde este instante (ver `TseSource.frescor`) */
  nacionalParadoDesde: number | null;
}

/** Laço do arquivo prioritário (resumo Brasil de Presidente). */
export interface TsePrioritarioHealth {
  race: RaceId;
  /** false quando o intervalo prioritário não é menor que o normal (o laço normal cuida do arquivo) */
  ativo: boolean;
  intervaloSeg: number;
  /** espera atual até a próxima leitura (s), já com o backoff */
  esperaSeg: number;
  ultimaLeitura: number | null;
  ultimaLeituraOk: number | null;
  ultimaLeituraMs: number | null;
  falhasConsecutivas: number;
  erro: string | null;
  /** leituras com dado novo (200), sem mudança (304), cópias antigas descartadas e erros */
  contagem: { novos: number; naoModificados: number; antigosDescartados: number; erros: number };
  /**
   * Atraso entre a geração do arquivo no TSE (`dg/hg`, relógio deles) e a nossa leitura, nas últimas mudanças (ms).
   * Inclui o cache do CDN do TSE (fora do nosso controle) e o intervalo de consulta.
   */
  atrasoMs: { ultimo: number | null; mediana: number | null; max: number | null; amostras: number };
}

export interface TseHealth {
  /**
   * true quando o arquivo principal de todas as corridas de 2º turno foi lido nos últimos 3 intervalos e o TSE não está
   * limitando as leituras
   */
  ok: boolean;
  /** I03: pausa por bloqueio do TSE em curso (null = lendo normalmente) */
  bloqueio: (BloqueioTse & { motivoTexto: string }) | null;
  /** I03: fim da pausa em curso (epoch ms) — o mesmo que `bloqueio.ate`; null sem pausa */
  bloqueadoAte: number | null;
  rodando: boolean;
  intervaloSeg: number;
  /** espera atual do laço normal (s), com o backoff quando todas as corridas falham */
  esperaSeg: number;
  prioritario: TsePrioritarioHealth | null;
  config: TseConfig;
  ultimoCiclo: { inicio: number; ms: number; erros: number } | null;
  corridas: TseCorridaHealth[];
  municipios: { emCache: number; fila: number; baixando: number };
  secoes: { emCache: number };
  http: TseClientStats;
}

// ---------------------------------------------------------------------------------------------
// Estado interno
// ---------------------------------------------------------------------------------------------

interface Codigos {
  ciclo: string;
  eleicao: string;
  cargo: string;
  pleito: string;
}

interface Entrada {
  r: map.ResumoArquivo;
  validadores: Validadores;
  /** último download/confirmação (304) */
  em: number;
}

class Corrida {
  readonly chave: string;
  readonly principal: Abr;
  readonly abrs: Abr[];
  resultados = new Map<Abr, Entrada>();
  ausentes = new Set<Abr>();
  hist: HistoricoCorrida | null = null;
  ultimoPoll: number | null = null;
  ultimoPollOk: number | null = null;
  ultimoPollMs: number | null = null;
  falhas = 0;
  erro: string | null = null;
  /** última leitura com 200/304 do arquivo principal (frescor; o `ultimoPollOk` também conta o "ausente") */
  conferidoEm: number | null = null;
  /** I18: geração (`dg/hg`) do arquivo principal e quando a vimos pela 1ª vez (relógio do servidor) */
  geracao: { geradoEm: number | null; vistaEm: number } | null = null;
  emVoo: Promise<void> | null = null;
  /** hash do conteúdo (ver `TseSource.marca`); recalculado sob demanda quando `sujo` */
  marca: string | null = null;
  sujo = true;

  constructor(
    readonly race: Race,
    readonly cod: Codigos,
  ) {
    this.chave = `${race.id}|${cod.ciclo}|${cod.eleicao}|${cod.cargo}|${cod.pleito}`;
    if (race.abrangencia === 'BR') {
      this.principal = 'BR';
      this.abrs = ['BR', ...race.ufs];
    } else {
      this.principal = race.abrangencia;
      this.abrs = [race.abrangencia];
    }
  }

  /** Corrida usada no mapeamento (a '-t1' quando os códigos apontam para o 1º turno). */
  get mapeada(): Race {
    return this.resultados.get(this.principal)?.r.race ?? this.race;
  }
}

interface MunUf {
  ab: { porMun: Map<string, TseAcompanhamentoItem>; validadores: Validadores; em: number } | null;
  abTentativa: number;
  mun: Map<string, Entrada>;
  zonas: Map<string, Entrada>;
  /**
   * arquivos (município ou `cod|zona`) que o TSE ainda não publicou (404) → instante da verificação e validade do cache
   * negativo (60 s, dobrando a cada novo 404 até 10 min; zerado quando o `ab` mostra o município andando)
   */
  ausentes: Map<string, { em: number; ttl: number }>;
}

interface CacheCm {
  porUf: Map<UF, map.MunicipioInfo[]> | null;
  validadores: Validadores;
  em: number;
}

interface CacheCs {
  secoes: map.SecoesUf | null;
  validadores: Validadores;
  em: number;
}

/** LRU simples (Map preserva a ordem de inserção). */
class Lru<K, V> {
  private m = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(k: K): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  peek(k: K): V | undefined {
    return this.m.get(k);
  }
  set(k: K, v: V) {
    this.m.delete(k);
    this.m.set(k, v);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as K);
  }
  clear() {
    this.m.clear();
  }
  get size() {
    return this.m.size;
  }
}

/** Fila de municípios com 3 níveis de prioridade e sem duplicatas. */
class FilaMunicipios {
  private niveis: string[][] = [[], [], []];
  private jobs = new Map<string, () => Promise<void>>();
  ativos = 0;
  constructor(
    private max: number,
    private readonly limite = 20_000,
  ) {}
  get tamanho() {
    return this.jobs.size;
  }
  /** nivel 0 = mais urgente */
  add(chave: string, nivel: 0 | 1 | 2, job: () => Promise<void>) {
    if (this.jobs.has(chave) || this.jobs.size >= this.limite) return;
    this.jobs.set(chave, job);
    this.niveis[nivel].push(chave);
    this.bombear();
  }
  limpar() {
    this.jobs.clear();
    this.niveis = [[], [], []];
  }
  private proximo(): [string, () => Promise<void>] | null {
    for (const nv of this.niveis) {
      while (nv.length) {
        const k = nv.shift()!;
        const j = this.jobs.get(k);
        if (j) {
          this.jobs.delete(k);
          return [k, j];
        }
      }
    }
    return null;
  }
  private bombear() {
    while (this.ativos < this.max) {
      const p = this.proximo();
      if (!p) return;
      this.ativos++;
      p[1]()
        .catch(() => undefined)
        .finally(() => {
          this.ativos--;
          this.bombear();
        });
    }
  }
}

const QUENTE_MS = 3 * 60_000;
/** Arquivo prioritário: padrão e limites do intervalo (s). */
export const PRIORITARIO_PADRAO_S = 5;
export const PRIORITARIO_MIN_S = 3;
/** Teto do backoff do laço prioritário e do laço normal quando o TSE falha. */
const PRIORITARIO_BACKOFF_MAX_MS = 30_000;
const CICLO_BACKOFF_MAX_MS = 120_000;
/** Tempo-limite de uma leitura do arquivo prioritário (1 tentativa; a próxima vem logo). */
const PRIORITARIO_TIMEOUT_MS = 8_000;
/** Amostras guardadas do atraso TSE → servidor. */
const ATRASO_AMOSTRAS = 30;
const CM_TTL_MS = 60 * 60_000;
const PT_TTL_MS = 6 * 60 * 60_000;
/** Cache negativo de município/zona ainda não publicado: `municipioTtlMs` (60 s), dobrando até 10 min. */
const AUSENTE_TTL_MAX_MS = 10 * 60_000;
/** I18: o arquivo nacional conta como parado depois de tanto tempo na mesma geração, com os estados à frente. */
export const NACIONAL_PARADO_MS = 90_000;
/** Depois de uma pausa por bloqueio, o laço normal volta um pouco depois do prioritário (1 pedido de prova antes). */
const RETOMADA_NORMAL_ATRASO_MS = 2_000;

// ---------------------------------------------------------------------------------------------
// TseSource
// ---------------------------------------------------------------------------------------------

export class TseSource {
  private config: TseConfig;
  private readonly races: Race[];
  private readonly client: TseClient;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private readonly munTtl: number;
  private readonly csTtl: number;
  private readonly t1Ttl: number;
  private readonly aquecer: boolean;
  private readonly esperaMax: number;
  private readonly nomeMunicipio?: (uf: UF, cod: string) => string | undefined;

  private corridas = new Map<RaceId, Corrida>();
  private munUf = new Map<string, MunUf>();
  private quentes = new Map<string, number>();
  private cms = new Map<string, CacheCm>();
  private css = new Map<string, CacheCs>();
  private secoesCache = new Lru<string, { det: SecaoDetalhe | null; em: number; ttl: number }>(2_000);
  private ptCache = new Lru<string, { v: PrimeiroTurnoLocal | null; em: number }>(8_000);
  private voo = new Map<string, Promise<unknown>>();
  private fila: FilaMunicipios;
  private historicoPendente = new Map<RaceId, HistoricoSerializado>();

  private rodando = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ultimoCiclo: TseHealth['ultimoCiclo'] = null;
  /** ciclos seguidos em que TODAS as corridas falharam (backoff do laço normal) */
  private falhasCiclo = 0;
  /** espera do laço normal em vigor (ms), com o backoff */
  private esperaCicloMs = 0;
  /** laço do arquivo prioritário (resumo Brasil de Presidente) */
  private timerPrio: ReturnType<typeof setTimeout> | null = null;
  private prio = {
    ultimaLeitura: null as number | null,
    ultimaLeituraOk: null as number | null,
    ultimaLeituraMs: null as number | null,
    falhas: 0,
    erro: null as string | null,
    esperaMs: 0,
    retryAfterMs: 0,
    contagem: { novos: 0, naoModificados: 0, antigosDescartados: 0, erros: 0 },
  };
  /** atraso (ms) entre a geração do arquivo prioritário no TSE e a nossa leitura, nas últimas mudanças */
  private atrasos: number[] = [];

  constructor(opts: TseSourceOptions) {
    if (!opts.races?.length) throw new Error('TseSource: lista de corridas vazia');
    this.config = { ...opts.config };
    // cores da fonte única (CORES_IDENTIDADE: Presidente vermelho/azul; governador a/b), mesmo se o meta for antigo
    this.races = opts.races.map(aplicarCores);
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => undefined);
    this.client =
      opts.client ??
      new TseClient({
        baseUrl: this.config.baseUrl,
        fetch: opts.fetch,
        concorrencia: opts.concorrencia ?? 6,
        limitePorSeg: this.config.limitePorSeg,
        now: this.now,
        modoPausa: opts.modoPausa,
        bloqueioInicial: opts.bloqueioInicial,
        // User-Agent identificável só no servidor (no navegador o cabeçalho é proibido/gera preflight)
        headers: ehNode() ? { 'User-Agent': 'Sintonia/1.0 (apuracao 2o turno 2026)' } : {},
      });
    this.munTtl = opts.municipioTtlMs ?? 60_000;
    this.csTtl = opts.secoesTtlMs ?? 120_000;
    this.t1Ttl = opts.t1TtlMs ?? 10 * 60_000;
    this.aquecer = opts.aquecerMunicipios ?? true;
    this.esperaMax = opts.esperaMaxMs ?? 12_000;
    this.nomeMunicipio = opts.nomeMunicipio;
    this.fila = new FilaMunicipios(Math.max(1, Math.min(opts.workersMunicipios ?? 3, opts.concorrencia ?? 6)));
    for (const h of opts.historico ?? []) this.historicoPendente.set(h.race, h);
    if (opts.client && this.config.limitePorSeg !== undefined) this.client.setLimitePorSeg(this.config.limitePorSeg);
    this.client.aoMudarBloqueio((b) => this.mudouBloqueio(b));
  }

  // -------------------------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------------------------

  private get intervaloMs() {
    return Math.max(5, this.config.intervaloSeg || 15) * 1000;
  }

  /** Intervalo do arquivo prioritário (resumo Brasil de Presidente). */
  private get intervaloPrioritarioMs() {
    const v = Number(this.config.intervaloPrioritarioSeg);
    return Math.max(PRIORITARIO_MIN_S, Number.isFinite(v) && v > 0 ? v : PRIORITARIO_PADRAO_S) * 1000;
  }

  /** Corrida do arquivo prioritário: Presidente do 2º turno (abrangência Brasil). */
  private get racePrioritaria(): Race | undefined {
    return this.races.find((r) => r.turno === 2 && r.cargo === 'Presidente' && r.abrangencia === 'BR');
  }

  /**
   * TSE falhando (a última leitura prioritária falhou, ou um ciclo normal inteiro falhou): a fila de municípios em
   * segundo plano para (são milhares de arquivos; com o TSE fora, cada um viraria 3 tentativas). Volta sozinha no
   * próximo ciclo bom. Consultas de quem abre uma página continuam (sob demanda, 1 por município por minuto).
   */
  private get tseFalhando() {
    return this.prio.falhas > 0 || this.falhasCiclo > 0 || this.client.bloqueio() !== null;
  }

  /** O laço prioritário só existe se for mais frequente que o normal. */
  private get prioritarioAtivo() {
    return !!this.racePrioritaria && this.intervaloPrioritarioMs < this.intervaloMs;
  }

  start() {
    if (this.rodando) return;
    this.rodando = true;
    this.falhasCiclo = 0;
    this.prio.falhas = 0;
    this.log(
      `TSE: polling iniciado (${this.config.baseUrl}, a cada ${this.intervaloMs / 1000} s` +
        (this.prioritarioAtivo ? `; resumo nacional de Presidente a cada ${this.intervaloPrioritarioMs / 1000} s)` : ')'),
    );
    void this.ciclo();
    // o 1º ciclo normal já lê o arquivo Brasil; o prioritário entra depois de um intervalo
    this.agendarPrioritario(this.intervaloPrioritarioMs);
  }

  stop() {
    this.rodando = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.timerPrio) clearTimeout(this.timerPrio);
    this.timerPrio = null;
    this.fila.limpar();
    this.log('TSE: polling parado');
  }

  get ativo() {
    return this.rodando;
  }

  /** Atualiza a configuração (comando 'tse' do admin). Códigos novos ⇒ corridas recomeçam do zero. */
  setConfig(parcial: Partial<TseConfig>) {
    const antes = this.config;
    this.config = { ...this.config, ...parcial };
    const codigosMudaram = (['ciclo', 'eleicaoPres', 'eleicaoGov', 'pleito'] as const).some((k) => this.config[k] !== antes[k]);
    if (codigosMudaram) {
      // corridas são recriadas sob demanda (chave nova); caches por município/seção da chave antiga saem
      this.munUf.clear();
      this.quentes.clear();
      this.secoesCache.clear();
      this.fila.limpar();
    }
    if (this.rodando && (this.config.intervaloPrioritarioSeg !== antes.intervaloPrioritarioSeg || this.config.intervaloSeg !== antes.intervaloSeg)) {
      // vale já (o timer em curso pode estar num intervalo longo ou em backoff)
      this.prio.falhas = 0;
      this.agendarPrioritario(1_000);
    }
    if (this.config.limitePorSeg !== antes.limitePorSeg && this.config.limitePorSeg !== undefined) {
      this.client.setLimitePorSeg(this.config.limitePorSeg);
    }
    if (this.config.baseUrl !== antes.baseUrl) {
      this.client.setBaseUrl(this.config.baseUrl);
      this.corridas.clear();
      this.munUf.clear();
      this.cms.clear();
      this.css.clear();
      this.secoesCache.clear();
      this.ptCache.clear();
    }
    this.log(`TSE: configuração atualizada (${JSON.stringify(parcial)})`);
  }

  getConfig(): TseConfig {
    return { ...this.config };
  }

  private async ciclo() {
    if (!this.rodando) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const t0 = this.now();
    try {
      await this.pollOnce();
    } catch (err) {
      this.log(`TSE: erro inesperado no ciclo: ${msgDe(err)}`);
    }
    if (!this.rodando) return;
    // backoff do laço normal: com TODAS as corridas falhando, o intervalo dobra (até 2 min); volta ao normal na
    // 1ª leitura boa (ou antes, quando o laço prioritário vê o TSE responder de novo)
    const base = this.falhasCiclo
      ? Math.min(CICLO_BACKOFF_MAX_MS, this.intervaloMs * 2 ** Math.min(this.falhasCiclo, 4)) * (0.9 + 0.2 * Math.random())
      : this.intervaloMs;
    this.esperaCicloMs = Math.round(base);
    let espera = Math.max(1_000, this.esperaCicloMs - (this.now() - t0));
    // TSE limitando: nada até o fim da pausa (o prioritário prova primeiro, com 1 pedido)
    const b = this.client.bloqueio();
    if (b) espera = Math.max(espera, b.ate - this.now() + RETOMADA_NORMAL_ATRASO_MS);
    this.agendarCiclo(espera);
  }

  private agendarCiclo(ms: number) {
    if (!this.rodando) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.ciclo(), Math.max(0, ms));
    (this.timer as { unref?: () => void }).unref?.();
  }

  /**
   * Início (b) ou fim antecipado (null, "Retomar agora") de uma pausa por bloqueio do TSE: log, fila de municípios vazia e
   * os laços reagendados para o fim da pausa (ou já, na retomada).
   */
  private mudouBloqueio(b: BloqueioTse | null) {
    if (b) {
      this.log(
        `TSE: leituras PAUSADAS até ${fmtHoraSeg(b.ate)} — o TSE está limitando (${MOTIVO_BLOQUEIO_TEXTO[b.motivo]} em ${b.arquivo}` +
          `${b.porRetryAfter ? ', prazo do Retry-After' : ', pausa padrão de 11 min'}). Nenhum pedido sai até lá; "Retomar agora" no painel encerra a pausa.`,
      );
      this.fila.limpar();
      if (!this.rodando) return;
      this.agendarPrioritario(Math.max(0, b.ate - this.now()));
      this.agendarCiclo(Math.max(0, b.ate - this.now()) + RETOMADA_NORMAL_ATRASO_MS);
      return;
    }
    if (!this.rodando) return;
    this.prio.falhas = 0;
    this.prio.retryAfterMs = 0;
    this.agendarPrioritario(200);
    this.agendarCiclo(RETOMADA_NORMAL_ATRASO_MS);
  }

  /** Pausa por bloqueio em curso (null = lendo normalmente). */
  bloqueio(): BloqueioTse | null {
    return this.client.bloqueio();
  }

  /** Assina o início (com a pausa) e o fim antecipado (null, "Retomar agora") de uma pausa. Devolve a função para cancelar. */
  aoMudarBloqueio(fn: (b: BloqueioTse | null) => void): () => void {
    return this.client.aoMudarBloqueio(fn);
  }

  /** "Retomar agora" (comando `tse-retomar`): encerra a pausa por bloqueio antes da hora. Devolve a pausa encerrada. */
  retomar(): BloqueioTse | null {
    const b = this.client.retomar();
    if (b) this.log(`TSE: leituras retomadas pelo painel antes do fim da pausa (prevista até ${fmtHoraSeg(b.ate)})`);
    return b;
  }

  /** Um ciclo de polling (público para testes e para o botão "testar" do admin). */
  async pollOnce(): Promise<void> {
    const inicio = this.now();
    const corridas = this.races.filter((r) => r.turno === 2).map((r) => this.corrida(r.id));
    await Promise.all(corridas.map((c) => this.pollCorrida(c, 'normal')));
    const erros = corridas.filter((c) => c.erro).length;
    this.ultimoCiclo = { inicio, ms: this.now() - inicio, erros };
    // todas as disputas falharam: o laço normal se espaça (ver `ciclo`) e a fila de municípios esvazia (`tseFalhando`)
    this.falhasCiclo = erros > 0 && erros >= corridas.length ? this.falhasCiclo + 1 : 0;
    if (this.falhasCiclo === 1) this.fila.limpar();
    if (this.aquecer) this.aquecerMunicipios(corridas);
  }

  // -------------------------------------------------------------------------------------------
  // Arquivo prioritário: resumo Brasil de Presidente
  // -------------------------------------------------------------------------------------------

  private agendarPrioritario(ms: number) {
    if (!this.rodando) return;
    if (this.timerPrio) clearTimeout(this.timerPrio);
    this.prio.esperaMs = Math.round(ms);
    this.timerPrio = setTimeout(() => void this.cicloPrioritario(), Math.max(0, ms));
    (this.timerPrio as { unref?: () => void }).unref?.();
  }

  private async cicloPrioritario() {
    this.timerPrio = null;
    if (!this.rodando) return;
    if (!this.prioritarioAtivo) {
      // desligado pela configuração: confere de novo mais tarde (o admin pode baixar o intervalo)
      this.agendarPrioritario(this.intervaloMs);
      return;
    }
    const t0 = this.now();
    try {
      await this.pollPrioritario();
    } catch (err) {
      this.log(`TSE: erro inesperado no laço prioritário: ${msgDe(err)}`);
    }
    if (!this.rodando || this.timerPrio) return;
    this.agendarPrioritario(Math.max(500, this.esperaPrioritarioMs() - (this.now() - t0)));
  }

  /** Espera até a próxima leitura prioritária: o intervalo, ou o backoff (×2 por falha, até 30 s, ±20%) / Retry-After. */
  private esperaPrioritarioMs(): number {
    const b = this.client.bloqueio();
    if (b) return Math.max(500, b.ate - this.now());
    const base = this.intervaloPrioritarioMs;
    if (!this.prio.falhas) return base;
    const exp = Math.min(PRIORITARIO_BACKOFF_MAX_MS, base * 2 ** this.prio.falhas) * (0.8 + 0.4 * Math.random());
    return Math.max(exp, this.prio.retryAfterMs);
  }

  /**
   * Uma leitura do arquivo prioritário (público para testes). Requisição condicional, 1 tentativa, prioridade alta;
   * se o laço normal estiver baixando o mesmo arquivo agora, não repete o pedido.
   */
  async pollPrioritario(): Promise<'novo' | 'nao-modificado' | 'ausente' | 'antigo' | 'em-andamento' | 'erro' | 'inativo'> {
    const race = this.racePrioritaria;
    if (!race) return 'inativo';
    const c = this.corrida(race.id);
    const chave = this.chaveResultado(c, c.principal);
    if (this.voo.has(chave)) return 'em-andamento';
    const t0 = this.now();
    this.prio.ultimaLeitura = t0;
    try {
      const r = await this.umaVez(chave, () =>
        this.buscarResultado(c, c.principal, 'alta', { tentativas: 1, timeoutMs: PRIORITARIO_TIMEOUT_MS }),
      );
      const agora = this.now();
      this.prio.ultimaLeituraMs = agora - t0;
      // o TSE respondeu; mas só 200/304 do arquivo é leitura boa (o "ausente" não confirma número nenhum)
      c.ultimoPollOk = agora;
      if (r.status !== 'ausente') {
        this.prio.ultimaLeituraOk = agora;
        c.conferidoEm = agora;
      }
      if (this.prio.falhas > 0) {
        this.log(`TSE ${c.race.id}/BR: leitura prioritária normalizada após ${this.prio.falhas} falha(s)`);
        // o TSE voltou: se o laço normal está em backoff, antecipa o próximo ciclo
        if (this.falhasCiclo > 0 && this.timer) {
          clearTimeout(this.timer);
          this.timer = setTimeout(() => void this.ciclo(), 1_000);
          (this.timer as { unref?: () => void }).unref?.();
        }
      }
      this.prio.falhas = 0;
      this.prio.erro = null;
      this.prio.retryAfterMs = 0;
      if (r.status === 'ok' && r.mudou) {
        this.prio.contagem.novos++;
        this.registrarHistorico(c, [c.principal]);
        return 'novo';
      }
      if (r.status === 'antigo') {
        this.prio.contagem.antigosDescartados++;
        return 'antigo';
      }
      if (r.status === 'ausente') return 'ausente';
      this.prio.contagem.naoModificados++;
      return 'nao-modificado';
    } catch (err) {
      this.prio.ultimaLeituraMs = this.now() - t0;
      if (err instanceof TseBloqueioError) {
        // pausa por bloqueio: o cliente já parou tudo e avisou (log); o laço volta no fim da pausa
        this.prio.erro = msgDe(err);
        if (!err.semPedido) this.prio.contagem.erros++;
        return 'erro';
      }
      if (this.prio.falhas === 0) this.log(`TSE ${c.race.id}/BR: falha na leitura prioritária — ${msgDe(err)} (backoff)`);
      this.prio.falhas++;
      if (this.prio.falhas === 1) this.fila.limpar(); // TSE fora: esvazia a fila de municípios (ver `tseFalhando`)
      this.prio.erro = msgDe(err);
      this.prio.contagem.erros++;
      const ra = (err as { retryAfterMs?: number }).retryAfterMs;
      this.prio.retryAfterMs = typeof ra === 'number' && ra > 0 ? ra : 0;
      return 'erro';
    }
  }

  // -------------------------------------------------------------------------------------------
  // Corridas e polling
  // -------------------------------------------------------------------------------------------

  private codigos(race: Race): Codigos {
    if (race.turno === 2) {
      return {
        ciclo: this.config.ciclo || race.tse.ciclo,
        eleicao: (race.cargo === 'Presidente' ? this.config.eleicaoPres : this.config.eleicaoGov) || race.tse.eleicao,
        cargo: race.tse.cargo,
        pleito: this.config.pleito || race.tse.pleito,
      };
    }
    return { ciclo: race.tse.ciclo, eleicao: race.tse.eleicao, cargo: race.tse.cargo, pleito: race.tse.pleito };
  }

  private corrida(raceId: RaceId): Corrida {
    const id = String(raceId).toLowerCase();
    const race = this.races.find((r) => r.id === id);
    if (!race) throw new NotFoundError(`Corrida inexistente: ${raceId}`);
    const cod = this.codigos(race);
    let c = this.corridas.get(id);
    if (!c || c.chave !== `${race.id}|${cod.ciclo}|${cod.eleicao}|${cod.cargo}|${cod.pleito}`) {
      c = new Corrida(race, cod);
      this.corridas.set(id, c);
    }
    return c;
  }

  private ufDaCorrida(c: Corrida, ufIn: string): UF {
    const uf = map.ufDe(ufIn);
    if (!uf || !c.race.ufs.includes(uf)) throw new NotFoundError(`UF ${ufIn} não vota em ${c.race.id}`);
    return uf;
  }

  private chaveResultado(c: Corrida, abr: Abr) {
    return `res|${c.chave}|${abr}`;
  }

  /**
   * O arquivo é do laço prioritário (rodando, ativo e tentando no ritmo dele — inclusive em backoff, quando o TSE
   * falha): o laço normal não pede o mesmo arquivo (nem com as retentativas dele). Se o prioritário parar de tentar
   * por algum motivo, o laço normal volta a ler o arquivo.
   */
  private cobertoPeloPrioritario(c: Corrida, abr: Abr): boolean {
    if (!this.rodando || !this.prioritarioAtivo || abr !== c.principal || c.race.id !== this.racePrioritaria?.id) return false;
    if (this.voo.has(this.chaveResultado(c, abr))) return true;
    const ult = this.prio.ultimaLeitura;
    return ult !== null && this.now() - ult < 2 * Math.max(this.intervaloPrioritarioMs, this.prio.esperaMs) + 1_000;
  }

  private pollCorrida(c: Corrida, prioridade: Prioridade): Promise<void> {
    if (c.emVoo) return c.emVoo;
    c.emVoo = (async () => {
      const t0 = this.now();
      const mudaram: Abr[] = [];
      const erros: string[] = [];
      let principalOk = false;
      let principalLido = false;
      let soPausa = true;
      await Promise.all(
        c.abrs.map(async (abr) => {
          try {
            // o prioritário marca a leitura boa (ultimoPollOk/conferidoEm) por conta própria
            if (this.cobertoPeloPrioritario(c, abr)) return;
            const r = await this.umaVez(this.chaveResultado(c, abr), () => this.buscarResultado(c, abr, prioridade));
            if (r.mudou) mudaram.push(abr);
            if (abr === c.principal) {
              principalOk = true;
              principalLido = r.status !== 'ausente';
            }
          } catch (err) {
            if (!(err instanceof TseBloqueioError && err.semPedido)) soPausa = false;
            erros.push(`${abr}: ${msgDe(err)}`);
          }
        }),
      );
      const agora = this.now();
      c.ultimoPoll = agora;
      c.ultimoPollMs = agora - t0;
      if (principalOk) c.ultimoPollOk = agora;
      if (principalLido) c.conferidoEm = agora;
      if (erros.length && soPausa) {
        // pausa por bloqueio: nada foi pedido ao TSE; não conta como falha da disputa (a pausa aparece no health)
      } else if (erros.length) {
        if (c.falhas === 0) this.log(`TSE ${c.race.id}: falha ao ler ${erros.length} arquivo(s) — ${erros[0]}`);
        c.falhas++;
        c.erro = erros[0];
      } else {
        if (c.falhas > 0) this.log(`TSE ${c.race.id}: leitura normalizada após ${c.falhas} ciclo(s) com falha`);
        c.falhas = 0;
        c.erro = null;
      }
      if (mudaram.length) this.registrarHistorico(c, mudaram);
    })().finally(() => {
      c.emVoo = null;
    });
    return c.emVoo;
  }

  /**
   * Baixa o resultado de uma abrangência. `mudou` = os números mudaram (ponto de série/eventos). `antigo` = o CDN do
   * TSE entregou uma cópia gerada ANTES da que já temos (outro servidor dele, cache atrasado): descartada.
   */
  private async buscarResultado(
    c: Corrida,
    abr: Abr,
    prioridade: Prioridade,
    extra: { tentativas?: number; timeoutMs?: number } = {},
  ): Promise<{ mudou: boolean; status: 'ok' | 'nao-modificado' | 'ausente' | 'antigo' }> {
    const prev = c.resultados.get(abr);
    const path = tsePaths.resultado(c.cod.ciclo, c.cod.eleicao, c.cod.cargo, abr === 'BR' ? 'br' : abr);
    // arquivo das disputas (Brasil/UF): fatia reservada do teto de pedidos por segundo
    const resp = await this.client.getJson<TseResultadoArquivo>(path, { validadores: prev?.validadores, prioridade, reservado: true, ...extra });
    if (resp.status === 'nao-modificado') {
      if (prev) prev.em = this.now();
      return { mudou: false, status: 'nao-modificado' };
    }
    if (resp.status === 'ausente') {
      c.ausentes.add(abr);
      return { mudou: false, status: 'ausente' };
    }
    c.ausentes.delete(abr);
    validarResultado(resp.data, path);
    const r = map.resumoDoResultado(resp.data, c.race, this.races, abr === c.principal, abr);
    if (prev && maisAntigo(r.geradoEm, prev.r.geradoEm)) {
      // mantém o dado mais novo e os validadores dele (o próximo pedido condicional segue valendo)
      prev.em = this.now();
      return { mudou: false, status: 'antigo' };
    }
    this.limitarAoRelogio(r.resumo);
    if (abr === c.principal && (!c.geracao || c.geracao.geradoEm !== r.geradoEm || r.geradoEm === null)) {
      // I18: geração nova do arquivo principal (sem `dg/hg`, cada download conta como nova: nunca acusa parado)
      c.geracao = { geradoEm: r.geradoEm, vistaEm: this.now() };
    }
    const a = prev?.r.resumo;
    const b = r.resumo;
    const mudou =
      !a ||
      prev!.r.race.id !== r.race.id ||
      a.secoesTotalizadas !== b.secoesTotalizadas ||
      a.secoes !== b.secoes ||
      a.status !== b.status ||
      a.eleito !== b.eleito ||
      a.comparecimento !== b.comparecimento ||
      a.votos.join() !== b.votos.join();
    if (a && b.secoesTotalizadas < a.secoesTotalizadas) {
      this.log(`TSE ${c.race.id}/${abr}: seções totalizadas recuaram (${a.secoesTotalizadas} → ${b.secoesTotalizadas}); seguindo o TSE`);
    }
    c.resultados.set(abr, { r, validadores: resp.validadores, em: this.now() });
    c.sujo = true;
    if (mudou && abr === c.principal && c.race.id === this.racePrioritaria?.id && r.geradoEm !== null) {
      // atraso TSE → nós (relógio deles na geração do arquivo; o CDN deles e o intervalo de consulta entram aqui)
      const atraso = this.now() - r.geradoEm;
      if (atraso >= -5_000 && atraso < 6 * 3600_000) {
        this.atrasos.push(Math.max(0, atraso));
        if (this.atrasos.length > ATRASO_AMOSTRAS) this.atrasos.shift();
      }
    }
    return { mudou, status: 'ok' };
  }

  /**
   * Marca dos números de uma corrida (hash do conteúdo de todos os arquivos dela): igual enquanto nada muda e
   * a mesma em qualquer instância/reinício com os mesmos dados. Usada no ETag e no `/api/status` (`frescor`).
   */
  marca(raceId: RaceId): string {
    const c = this.corrida(raceId);
    if (c.sujo || c.marca === null) {
      let txt = c.chave;
      for (const abr of c.abrs) {
        const e = c.resultados.get(abr);
        txt += `|${abr}`;
        if (e) txt += `:${e.r.race.id}:${JSON.stringify(e.r.resumo)}`;
      }
      c.marca = hash53(txt);
      c.sujo = false;
    }
    return c.marca;
  }

  /**
   * Frescor de cada corrida do 2º turno, para o `/api/status`: marca, última leitura BOA do arquivo principal (200/304),
   * a pausa por bloqueio do TSE em curso (`tseBloqueadoAte`, igual em todas: a pausa é global) e o arquivo nacional
   * parado com os estados andando (`nacionalParadoDesde`, I18 — quem decide se o público vê é o servidor, pela chave
   * 'aviso-nacional').
   */
  frescor(): Partial<Record<RaceId, FrescorCorrida>> {
    const out: Partial<Record<RaceId, FrescorCorrida>> = {};
    const b = this.client.bloqueio();
    for (const r of this.races) {
      if (r.turno !== 2) continue;
      const c = this.corrida(r.id);
      const f: FrescorCorrida = { marca: this.marca(r.id), conferidoEm: c.conferidoEm };
      const parado = this.nacionalParadoDesde(c);
      if (parado !== null) f.nacionalParadoDesde = parado;
      if (b) f.tseBloqueadoAte = b.ate;
      out[r.id] = f;
    }
    return out;
  }

  /**
   * I18: o arquivo nacional (Brasil) de uma disputa de abrangência Brasil está na MESMA geração (`dg/hg`) há mais de
   * 90 s — pelo relógio do TSE e pelo nosso — enquanto a soma das seções totalizadas das UFs e do exterior já passa a
   * dele. Devolve desde quando o arquivo nacional não muda (a geração dele, relógio do TSE; sem ela, quando a vimos), ou
   * null. Nunca soma votos: só compara contagens de seções para saber se o arquivo nacional ficou para trás.
   */
  private nacionalParadoDesde(c: Corrida): number | null {
    if (c.race.abrangencia !== 'BR' || c.principal !== 'BR' || !c.geracao) return null;
    const br = c.resultados.get('BR');
    if (!br || br.r.race.id !== c.mapeada.id) return null;
    const agora = this.now();
    const { geradoEm, vistaEm } = c.geracao;
    if (agora - vistaEm <= NACIONAL_PARADO_MS) return null;
    if (geradoEm !== null && agora - geradoEm <= NACIONAL_PARADO_MS) return null;
    let soma = 0;
    let ufs = 0;
    for (const abr of c.abrs) {
      if (abr === 'BR') continue;
      const e = c.resultados.get(abr);
      if (!e || e.r.race.id !== br.r.race.id) continue;
      soma += e.r.resumo.secoesTotalizadas;
      ufs++;
    }
    if (!ufs || soma <= br.r.resumo.secoesTotalizadas) return null;
    return geradoEm !== null ? Math.min(geradoEm, vistaEm) : vistaEm;
  }

  /** Histórico da corrida mapeada (criado sob demanda; restaura o salvo na 1ª vez). */
  private histDe(c: Corrida, race: Race = c.mapeada): HistoricoCorrida {
    if (!c.hist || c.hist.race.id !== race.id) {
      c.hist = new HistoricoCorrida(race, c.chave);
      const salvo = this.historicoPendente.get(race.id);
      if (salvo && c.hist.importar(salvo)) this.log(`TSE ${race.id}: histórico restaurado`);
      this.historicoPendente.delete(race.id);
    }
    return c.hist;
  }

  /** Histórico só se já existir para a corrida mapeada (consultas não criam histórico). */
  private histSe(c: Corrida, race: Race): HistoricoCorrida | null {
    return c.hist && c.hist.race.id === race.id ? c.hist : null;
  }

  private registrarHistorico(c: Corrida, mudaram: Abr[]) {
    const race = c.mapeada;
    const hist = this.histDe(c, race);
    // UFs antes do Brasil: o feed nacional fica na ordem natural (Brasil por último no mesmo instante)
    const ordem = [...mudaram].sort((x, y) => (x === c.principal ? 1 : 0) - (y === c.principal ? 1 : 0));
    for (const abr of ordem) {
      const e = c.resultados.get(abr);
      if (!e || e.r.race.id !== race.id) continue;
      const t = e.r.resumo.ultimaAtualizacao ?? this.now();
      hist.registrar(abr, e.r.resumo, t, abr === c.principal);
    }
  }

  /** Garante dados da corrida: espera o 1º download; depois só renova em segundo plano. */
  private async garantir(c: Corrida) {
    // TSE limitando: ninguém pede nada até o fim da pausa (as consultas respondem com o último dado bom)
    if (this.client.bloqueio()) return;
    // corrida do 2º turno: respeita o intervalo em vigor (com o backoff, se o TSE estiver falhando)
    const ttl = c.race.turno === 1 ? this.t1Ttl : Math.max(this.intervaloMs, this.esperaCicloMs);
    if (c.resultados.size === 0 && (c.ultimoPoll === null || this.now() - c.ultimoPoll > Math.min(ttl, 5_000))) {
      await this.comLimite(this.pollCorrida(c, 'alta'));
      return;
    }
    const idade = c.ultimoPoll === null ? Infinity : this.now() - c.ultimoPoll;
    if (idade > ttl * 1.5) void this.pollCorrida(c, 'normal').catch(() => undefined);
  }

  // -------------------------------------------------------------------------------------------
  // Snapshots
  // -------------------------------------------------------------------------------------------

  /**
   * Snapshot nacional. `t` (epoch ms) no passado = "reveja a noite": Brasil e UFs no estado mais recente
   * registrado com instante ≤ t; série e eventos cortados em t. `t` ausente ou ≥ agora = agora.
   */
  async nacional(raceId: RaceId, t?: number): Promise<NationalSnapshot> {
    const c = this.corrida(raceId);
    await this.garantir(c);
    const agora = this.now();
    const race = c.mapeada;
    if (t !== undefined && t < agora) return this.nacionalEm(c, race, t, agora);
    const resumo = this.resumoAbr(c, c.principal, race);
    const ufs: NationalSnapshot['ufs'] = {};
    for (const abr of c.abrs) if (abr !== 'BR') ufs[abr] = this.resumoAbr(c, abr, race);
    const hist = c.hist && c.hist.race.id === race.id ? c.hist : null;
    return {
      race: race.id,
      geradoEm: agora,
      simNow: agora,
      resumo,
      ufs,
      regioes: map.regioesDe(ufs, race.candidatos),
      serie: hist?.serie(c.principal) ?? [],
      eventos: hist?.eventosNacionais() ?? [],
      restante: map.restanteDe(resumo, race.candidatos),
    };
  }

  /** Snapshot da UF. `t` no passado: UF e municípios no estado mais recente com instante ≤ t (ver `nacional`). */
  async uf(raceId: RaceId, ufIn: string, t?: number): Promise<UfSnapshot> {
    const c = this.corrida(raceId);
    const uf = this.ufDaCorrida(c, ufIn);
    await this.garantir(c);
    this.marcarQuente(c, uf);
    const race = c.mapeada;
    const municipios = await this.municipiosDaUf(c, uf, race);
    const hist = c.hist && c.hist.race.id === race.id ? c.hist : null;
    const agora = this.now();
    if (t !== undefined && t < agora) {
      const resumo = hist?.resumoEm(uf, t) ?? map.resumoZerado(this.resumoAbr(c, uf, race));
      return {
        race: race.id,
        uf,
        geradoEm: agora,
        simNow: t,
        resumo,
        municipios: municipios.map((m) => map.municipioResumo(hist?.municipioEm(uf, m.cod, t) ?? map.resumoZerado(m), m)),
        serie: hist?.serieAte(uf, t) ?? [],
        eventos: hist?.eventosDaUfAte(uf, t) ?? [],
        restante: map.restanteDe(resumo, race.candidatos),
      };
    }
    const resumo = this.resumoAbr(c, uf, race);
    return {
      race: race.id,
      uf,
      geradoEm: agora,
      simNow: agora,
      resumo,
      municipios,
      serie: hist?.serie(uf) ?? [],
      eventos: hist?.eventosDaUf(uf) ?? [],
      restante: map.restanteDe(resumo, race.candidatos),
    };
  }

  async municipio(raceId: RaceId, ufIn: string, cod: string): Promise<MunicipioSnapshot> {
    const c = this.corrida(raceId);
    const uf = this.ufDaCorrida(c, ufIn);
    const info = await this.infoMunicipio(c, uf, cod);
    await this.garantir(c);
    this.marcarQuente(c, uf);
    const { resumo, race } = await this.resumoMunicipio(c, uf, info);
    const [zonas, mosaico, primeiroTurno] = await Promise.all([
      this.zonasDoMunicipio(c, uf, info, resumo, race),
      this.mosaicoDoMunicipio(c, uf, info),
      this.primeiroTurno(c, race, uf, info.cod),
    ]);
    const agora = this.now();
    return {
      race: race.id,
      uf,
      cod: info.cod,
      ibge: info.ibge,
      nome: info.nome,
      capital: info.capital,
      geradoEm: agora,
      simNow: agora,
      resumo,
      zonas,
      mosaico,
      primeiroTurno,
    };
  }

  async zona(raceId: RaceId, ufIn: string, cod: string, zona: number): Promise<ZonaSnapshot> {
    const c = this.corrida(raceId);
    const uf = this.ufDaCorrida(c, ufIn);
    const info = await this.infoMunicipio(c, uf, cod);
    const z = Number(zona);
    if (info.zonas.length && !info.zonas.includes(z)) throw new NotFoundError(`Zona ${zona} inexistente em ${uf}/${info.cod}`);
    await this.garantir(c);
    this.marcarQuente(c, uf);
    const { resumo: resumoMun, race } = await this.resumoMunicipio(c, uf, info);
    const resumo = info.zonas.length <= 1 ? resumoMun : await this.resumoZona(c, uf, info, z, race);
    const cs = await this.secoesUf(c, uf);
    const zcfg = cs?.municipios.get(info.cod)?.get(z);
    const secoes: SecaoResumo[] = (zcfg?.secoes ?? []).map((s) => {
      const det = this.secoesCache.peek(this.chaveSecao(c, uf, info.cod, z, s.ns))?.det;
      if (det && det.totalizada && det.race === race.id) {
        const { secao, totalizada, totalizadaEm, aptos, comparecimento, votos, brancos, nulos } = det;
        return { secao, totalizada, totalizadaEm, aptos, comparecimento, votos, brancos, nulos };
      }
      return map.secaoStatusOnly(s);
    });
    const agora = this.now();
    return {
      race: race.id,
      uf,
      cod: info.cod,
      nomeMunicipio: info.nome,
      zona: z,
      geradoEm: agora,
      simNow: agora,
      resumo,
      secoes,
    };
  }

  /**
   * Boletim de urna da seção (aux.json → bu.dat → BER). null quando indisponível (seção agregada a outra,
   * BU ainda não publicado e sem confirmação de que a seção existe, ou falha de rede sem cache).
   * Seção existente mas não totalizada → SecaoDetalhe com `totalizada: false`.
   */
  async secao(raceId: RaceId, ufIn: string, cod: string, zona: number, secao: number): Promise<SecaoDetalhe | null> {
    const c = this.corrida(raceId);
    const uf = this.ufDaCorrida(c, ufIn);
    const info = await this.infoMunicipio(c, uf, cod);
    const z = Number(zona);
    const s = Number(secao);
    if (info.zonas.length && !info.zonas.includes(z)) throw new NotFoundError(`Zona ${zona} inexistente em ${uf}/${info.cod}`);
    if (!Number.isInteger(s) || s <= 0) throw new NotFoundError(`Seção inválida: ${secao}`);
    const chave = this.chaveSecao(c, uf, info.cod, z, s);
    const cache = this.secoesCache.get(chave);
    if (cache && this.now() - cache.em < cache.ttl) return cache.det;

    await this.garantir(c);
    const race = c.mapeada;
    const cs = await this.secoesUf(c, uf);
    const zcfg = cs?.municipios.get(info.cod)?.get(z);
    let existe: boolean | null = null; // null = não sabemos (cs indisponível)
    if (cs && cs.municipios.has(info.cod)) {
      if (!zcfg) throw new NotFoundError(`Zona ${zona} sem seções em ${uf}/${info.cod}`);
      if (zcfg.agregadas.has(s)) return this.guardarSecao(chave, null, 10 * 60_000);
      if (!zcfg.secoes.some((x) => x.ns === s)) throw new NotFoundError(`Seção ${secao} inexistente na zona ${zona} de ${uf}/${info.cod}`);
      existe = true;
    }
    const pendente = () =>
      existe ? map.secaoPendente({ race, uf, cod: info.cod, nomeMunicipio: info.nome, zona: z, secao: s, totalizadaEm: null }) : null;

    try {
      const aux = await this.client.getJson<TseAuxArquivo>(tsePaths.aux(c.cod.ciclo, c.cod.pleito, uf, info.cod, z, s), {
        prioridade: 'alta',
      });
      if (aux.status !== 'ok') return this.guardarSecao(chave, pendente(), 30_000);
      const h = map.hashVigente(aux.data);
      const nome = h ? map.arquivoBu(h) : null;
      if (!h || !nome) return this.guardarSecao(chave, pendente(), 30_000);
      const bin = await this.client.getBytes(
        tsePaths.arquivoUrna(c.cod.ciclo, c.cod.pleito, uf, info.cod, z, s, h.hash, nome),
        { prioridade: 'alta' },
      );
      if (bin.status !== 'ok') return this.guardarSecao(chave, pendente(), 30_000);
      const bu = lerBoletimUrna(bin.data);
      if (bu.municipio !== map.int(info.cod) || bu.zona !== z || bu.secao !== s) {
        throw new Error(`BU de outra seção (${bu.municipio}/${bu.zona}/${bu.secao})`);
      }
      const numeros = c.resultados.get(c.principal)?.r.numeros;
      const det = map.secaoDoBu(bu, {
        race,
        uf,
        cod: info.cod,
        nomeMunicipio: info.nome,
        zona: z,
        secao: s,
        eleicao: map.int(c.cod.eleicao),
        cargo: map.int(c.cod.cargo),
        totalizadaEm: map.dataHoraBrt(h.dr, h.hr),
        numerosValidos: numeros?.length ? new Set(numeros) : undefined,
      });
      return this.guardarSecao(chave, det ?? pendente(), det ? 15 * 60_000 : 30_000);
    } catch (err) {
      this.logErro(`TSE seção ${uf}/${info.cod}/${z}/${s}`, err);
      return cache?.det ?? pendente();
    }
  }

  /**
   * Mapa nacional por município (ordem de public/data/municipios-br.json), com o que JÁ está em cache:
   * municípios cujo arquivo ainda não foi baixado (ou fora da disputa) saem com apurado 0 e líder −1 —
   * nunca inventamos votos. Durante a noite, o aquecimento (`aquecerMunicipios`) baixa os municípios das
   * UFs em apuração a cada mudança do `-ab.json`, então o mapa se completa em poucos minutos.
   * `t` no passado: estado de cada município registrado até t.
   */
  async municipiosBr(raceId: RaceId, ordem: { uf: readonly string[]; cod: readonly string[] }, t?: number): Promise<MunicipiosNacionalSnapshot> {
    const c = this.corrida(raceId);
    await this.garantir(c);
    const race = c.mapeada;
    const agora = this.now();
    const tq = t !== undefined && t < agora ? t : undefined;
    const hist = this.histSe(c, race);
    const ufs = new Set<string>(race.ufs);
    const n = Math.min(ordem.uf.length, ordem.cod.length);
    const resumos: (Summary | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const uf = String(ordem.uf[i]).toUpperCase() as UF;
      if (!ufs.has(uf)) continue;
      const cod = String(ordem.cod[i]).padStart(5, '0');
      if (tq !== undefined) {
        resumos[i] = hist?.municipioEm(uf, cod, tq) ?? null;
      } else {
        const e = this.munUf.get(`${c.chave}|${uf}`)?.mun.get(cod);
        resumos[i] = e && e.r.race.id === race.id ? e.r.resumo : null;
      }
    }
    return map.municipiosNacionalDe(race.id, race.candidatos.length, resumos, agora, tq ?? agora);
  }

  /**
   * Resumos municipais do 2º turno JÁ EM CACHE (nada é baixado, nenhuma prioridade da fila muda): base do "desde o 1º
   * turno" por município no Brasil (src/server/desde-t1.ts). Município ainda não lido fica de fora.
   */
  resumosMunicipaisEmCache(raceId: RaceId): { uf: UF; cod: string; resumo: Summary }[] {
    const c = this.corridas.get(String(raceId).toLowerCase());
    if (!c) return [];
    const race = c.mapeada;
    const out: { uf: UF; cod: string; resumo: Summary }[] = [];
    for (const uf of race.ufs) {
      const mu = this.munUf.get(`${c.chave}|${uf}`);
      if (!mu) continue;
      for (const [cod, e] of mu.mun) if (e.r.race.id === race.id) out.push({ uf, cod, resumo: e.r.resumo });
    }
    return out;
  }

  /**
   * Acompanhamento municipal do 2º turno JÁ EM CACHE (o `-ab.json` de cada UF, que o aquecimento relê a cada ciclo;
   * nada é baixado, nenhuma prioridade da fila muda): seções e eleitorado totalizados de cada município, SEM votos.
   * Base da "Projeção do Sintonia" (src/server/projecao.ts) para os municípios ainda não lidos. UF cujo acompanhamento
   * ainda não foi lido fica de fora.
   */
  acompanhamentoMunicipalEmCache(
    raceId: RaceId,
  ): { uf: UF; cod: string; secoes: number; secoesTotalizadas: number; eleitorado: number; eleitoradoTotalizado: number }[] {
    const c = this.corridas.get(String(raceId).toLowerCase());
    if (!c) return [];
    const out: ReturnType<TseSource['acompanhamentoMunicipalEmCache']> = [];
    for (const uf of c.mapeada.ufs) {
      const ab = this.munUf.get(`${c.chave}|${uf}`)?.ab;
      if (!ab) continue;
      for (const [cod, it] of ab.porMun) {
        out.push({ uf, cod, secoes: map.int(it.s?.ts), secoesTotalizadas: map.int(it.s?.st), eleitorado: map.int(it.e?.te), eleitoradoTotalizado: map.int(it.e?.est) });
      }
    }
    return out;
  }

  private nacionalEm(c: Corrida, race: Race, t: number, agora: number): NationalSnapshot {
    const hist = this.histSe(c, race);
    const em = (abr: Abr) => hist?.resumoEm(abr, t) ?? map.resumoZerado(this.resumoAbr(c, abr, race));
    const resumo = em(c.principal);
    const ufs: NationalSnapshot['ufs'] = {};
    for (const abr of c.abrs) if (abr !== 'BR') ufs[abr] = em(abr);
    return {
      race: race.id,
      geradoEm: agora,
      simNow: t,
      resumo,
      ufs,
      regioes: map.regioesDe(ufs, race.candidatos),
      serie: hist?.serieAte(c.principal, t) ?? [],
      eventos: hist?.eventosNacionaisAte(t) ?? [],
      restante: map.restanteDe(resumo, race.candidatos),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Peças dos snapshots
  // -------------------------------------------------------------------------------------------

  private resumoAbr(c: Corrida, abr: Abr, race: Race): Summary {
    const e = c.resultados.get(abr);
    return e && e.r.race.id === race.id ? e.r.resumo : map.resumoVazio(race.candidatos.length);
  }

  private limitarAoRelogio(s: Summary) {
    const agora = this.now();
    if (s.ultimaAtualizacao !== null && s.ultimaAtualizacao > agora) s.ultimaAtualizacao = agora;
  }

  private marcarQuente(c: Corrida, uf: UF) {
    this.quentes.set(`${c.chave}|${uf}`, this.now());
  }

  private ehQuente(c: Corrida, uf: UF) {
    const t = this.quentes.get(`${c.chave}|${uf}`);
    return t !== undefined && this.now() - t < QUENTE_MS;
  }

  private estadoMunUf(c: Corrida, uf: UF): MunUf {
    const k = `${c.chave}|${uf}`;
    let m = this.munUf.get(k);
    if (!m) {
      m = { ab: null, abTentativa: 0, mun: new Map(), zonas: new Map(), ausentes: new Map() };
      this.munUf.set(k, m);
    }
    return m;
  }

  /** Municípios da UF (config "cm" da eleição; se a UF ainda não estiver lá, a de Presidente). */
  private async infosMunicipios(c: Corrida, uf: UF): Promise<map.MunicipioInfo[]> {
    const eleicoes = [c.cod.eleicao, this.config.eleicaoPres, ...this.races.filter((r) => r.turno === 1).map((r) => r.tse.eleicao)];
    for (const ele of [...new Set(eleicoes.filter(Boolean))]) {
      const cm = await this.cm(c.cod.ciclo, ele);
      const lista = cm?.get(uf);
      if (lista?.length) return lista;
    }
    return [];
  }

  private async infoMunicipio(c: Corrida, uf: UF, cod: string): Promise<map.MunicipioInfo> {
    const alvo = String(cod).padStart(5, '0');
    const info = (await this.infosMunicipios(c, uf)).find((m) => m.cod === alvo);
    if (!info) throw new NotFoundError(`Município ${cod} inexistente em ${uf}`);
    return info;
  }

  private async cm(ciclo: string, ele: string): Promise<Map<UF, map.MunicipioInfo[]> | null> {
    const k = `${ciclo}|${ele}`;
    const ent = this.cms.get(k);
    const fresco = ent && this.now() - ent.em < (ent.porUf ? CM_TTL_MS : 60_000);
    if (fresco) return ent!.porUf;
    const job = this.umaVez(`cm|${k}`, async () => {
      try {
        const r = await this.client.getJson<TseMunicipiosArquivo>(tsePaths.municipios(ciclo, ele), {
          validadores: ent?.validadores,
          prioridade: 'alta',
        });
        if (r.status === 'ok') {
          this.cms.set(k, { porUf: map.municipiosDoCm(r.data, this.nomeMunicipio), validadores: r.validadores, em: this.now() });
        } else if (r.status === 'nao-modificado' && ent) ent.em = this.now();
        else if (r.status === 'ausente') this.cms.set(k, { porUf: ent?.porUf ?? null, validadores: {}, em: this.now() });
      } catch (err) {
        this.logErro(`TSE: municípios (${ele}) indisponíveis`, err);
      }
    });
    if (ent?.porUf) {
      void job;
      return ent.porUf;
    }
    await this.comLimite(job);
    return this.cms.get(k)?.porUf ?? null;
  }

  /** Acompanhamento da UF (seções por município, sem votos). */
  private async atualizarAb(c: Corrida, uf: UF, mu: MunUf, prioridade: Prioridade): Promise<void> {
    return this.umaVez(`ab|${c.chave}|${uf}`, async () => {
      mu.abTentativa = this.now();
      try {
        const r = await this.client.getJson<TseAcompanhamentoArquivo>(tsePaths.acompanhamento(c.cod.ciclo, c.cod.eleicao, uf), {
          validadores: mu.ab?.validadores,
          prioridade,
        });
        if (r.status === 'ok') {
          const porMun = new Map<string, TseAcompanhamentoItem>();
          for (const [cod, it] of map.acompanhamentoPorMunicipio(r.data.abr ?? [])) {
            const novo = compactarAb(it);
            const antes = mu.ab?.porMun.get(cod);
            if (antes && map.versaoAcompanhamento(antes) !== map.versaoAcompanhamento(novo)) this.esquecerAusentes(mu, cod);
            porMun.set(cod, novo);
          }
          mu.ab = { porMun, validadores: r.validadores, em: this.now() };
        } else if (r.status === 'nao-modificado' && mu.ab) mu.ab.em = this.now();
      } catch (err) {
        this.logErro(`TSE ${c.race.id}/${uf}: acompanhamento indisponível`, err);
      }
    });
  }

  private async municipiosDaUf(c: Corrida, uf: UF, race: Race): Promise<MunicipioResumo[]> {
    const infos = await this.infosMunicipios(c, uf);
    const mu = this.estadoMunUf(c, uf);
    const idadeAb = mu.ab ? this.now() - mu.ab.em : Infinity;
    if (!mu.ab && this.now() - mu.abTentativa > 5_000) await this.comLimite(this.atualizarAb(c, uf, mu, 'alta'));
    else if (idadeAb > this.intervaloMs) void this.atualizarAb(c, uf, mu, 'normal').then(() => this.agendarDefasados(c, uf, mu, 0));
    const n = race.candidatos.length;
    const out: MunicipioResumo[] = [];
    for (const info of infos) {
      const e = mu.mun.get(info.cod);
      const ab = mu.ab?.porMun.get(info.cod);
      let s: Summary;
      if (e && e.r.race.id === race.id) {
        s = e.r.resumo;
        if (ab && map.versaoAcompanhamento(ab) === s.secoesTotalizadas) {
          const t = map.dataHoraLocal(ab.dt, ab.ht, uf);
          if (t !== null) s = { ...s, ultimaAtualizacao: Math.min(t, this.now()) };
        }
      } else if (ab) {
        s = map.resumoDoAcompanhamento(ab, race.candidatos, uf);
        this.limitarAoRelogio(s);
      } else s = map.resumoVazio(n);
      out.push(map.municipioResumo(s, info));
    }
    this.agendarDefasados(c, uf, mu, 0);
    return out;
  }

  /** Enfileira os municípios cujo `ab` mostra mais seções do que o arquivo baixado. */
  private agendarDefasados(c: Corrida, uf: UF, mu: MunUf, nivel: 0 | 1 | 2) {
    if (!mu.ab) return;
    const agora = this.now();
    for (const [cod, ab] of mu.ab.porMun) {
      const st = map.versaoAcompanhamento(ab);
      if (st <= 0) continue; // nada totalizado: o `ab` já é exato (votos zero)
      const e = mu.mun.get(cod);
      if (e && e.r.resumo.secoesTotalizadas === st) continue;
      if (e && agora - e.em < this.munTtl) continue;
      if (this.ausenteRecente(mu, cod)) continue;
      this.fila.add(`${c.chave}|${uf}|${cod}`, nivel, async () => {
        if (this.tseFalhando) return; // reagendado pelo próximo aquecimento, com o TSE de volta
        await this.buscarMunicipio(c, uf, cod, 'baixa');
      });
    }
  }

  private aquecerMunicipios(corridas: Corrida[]) {
    if (this.tseFalhando) return;
    for (const c of corridas) {
      for (const abr of c.abrs) {
        if (abr === 'BR') continue;
        const uf = abr;
        const quente = this.ehQuente(c, uf);
        const st = c.resultados.get(uf)?.r.resumo.secoesTotalizadas ?? 0;
        if (st === 0 && !quente) continue;
        const mu = this.estadoMunUf(c, uf);
        const intervalo = quente ? this.intervaloMs : 2 * this.intervaloMs;
        if (mu.ab && this.now() - mu.ab.em < intervalo) {
          this.agendarDefasados(c, uf, mu, quente ? 1 : 2);
          continue;
        }
        void this.atualizarAb(c, uf, mu, quente ? 'normal' : 'baixa').then(() => this.agendarDefasados(c, uf, mu, quente ? 1 : 2));
      }
    }
  }

  private buscarMunicipio(c: Corrida, uf: UF, cod: string, prioridade: Prioridade): Promise<void> {
    return this.umaVez(`mun|${c.chave}|${uf}|${cod}`, async () => {
      const mu = this.estadoMunUf(c, uf);
      const prev = mu.mun.get(cod);
      try {
        const r = await this.client.getJson<TseResultadoArquivo>(tsePaths.resultado(c.cod.ciclo, c.cod.eleicao, c.cod.cargo, uf, cod), {
          validadores: prev?.validadores,
          prioridade,
        });
        if (r.status === 'ok') {
          validarResultado(r.data, r.url);
          const res = map.resumoDoResultado(r.data, c.race, this.races, false, uf);
          if (prev && maisAntigo(res.geradoEm, prev.r.geradoEm)) {
            prev.em = this.now(); // cópia mais antiga do CDN do TSE: fica a mais nova
            return;
          }
          this.limitarAoRelogio(res.resumo);
          mu.mun.set(cod, { r: res, validadores: r.validadores, em: this.now() });
          mu.ausentes.delete(cod);
          // histórico do município ("reveja a noite"): instante oficial da última totalização do arquivo
          if (res.race.id === c.mapeada.id) this.histDe(c).registrarMunicipio(uf, cod, res.resumo, res.resumo.ultimaAtualizacao ?? this.now());
        } else if (r.status === 'ausente') this.marcarAusente(mu, cod);
        else if (prev) prev.em = this.now();
      } catch (err) {
        this.logErro(`TSE ${c.race.id}/${uf}/${cod}`, err);
      }
    });
  }

  /** Cache negativo do arquivo ainda não publicado: 60 s na 1ª vez, dobrando a cada novo 404 até 10 min. */
  private marcarAusente(mu: MunUf, chave: string) {
    const prev = mu.ausentes.get(chave);
    const ttl = prev ? Math.min(AUSENTE_TTL_MAX_MS, prev.ttl * 2) : Math.min(this.munTtl, AUSENTE_TTL_MAX_MS);
    mu.ausentes.set(chave, { em: this.now(), ttl });
  }

  private ausenteRecente(mu: MunUf, chave: string) {
    const a = mu.ausentes.get(chave);
    return a !== undefined && this.now() - a.em < a.ttl;
  }

  /** O acompanhamento mostrou o município andando: o arquivo dele (e os das zonas) pode ter saído — zera o cache negativo. */
  private esquecerAusentes(mu: MunUf, cod: string) {
    if (!mu.ausentes.size) return;
    mu.ausentes.delete(cod);
    const pref = `${cod}|`;
    for (const k of mu.ausentes.keys()) if (k.startsWith(pref)) mu.ausentes.delete(k);
  }

  /** Erro de consulta no log — menos os da pausa por bloqueio (o início da pausa já foi registrado uma vez). */
  private logErro(contexto: string, err: unknown) {
    if (err instanceof TseBloqueioError) return;
    this.log(`${contexto}: ${msgDe(err)}`);
  }

  private async resumoMunicipio(c: Corrida, uf: UF, info: map.MunicipioInfo): Promise<{ resumo: Summary; race: Race }> {
    const mu = this.estadoMunUf(c, uf);
    let e = mu.mun.get(info.cod);
    if ((!e || this.now() - e.em > this.munTtl) && !this.ausenteRecente(mu, info.cod)) {
      await this.comLimite(this.buscarMunicipio(c, uf, info.cod, 'alta'));
      e = mu.mun.get(info.cod);
    }
    const race = e?.r.race ?? c.mapeada;
    if (e) return { resumo: e.r.resumo, race };
    const ab = mu.ab?.porMun.get(info.cod);
    return { resumo: ab ? map.resumoDoAcompanhamento(ab, race.candidatos, uf) : map.resumoVazio(race.candidatos.length), race };
  }

  private async resumoZona(c: Corrida, uf: UF, info: map.MunicipioInfo, zona: number, race: Race): Promise<Summary> {
    const mu = this.estadoMunUf(c, uf);
    const k = `${info.cod}|${zona}`;
    let e = mu.zonas.get(k);
    if ((!e || this.now() - e.em > this.munTtl) && !this.ausenteRecente(mu, k)) {
      await this.comLimite(
        this.umaVez(`zona|${c.chave}|${uf}|${k}`, async () => {
          try {
            const r = await this.client.getJson<TseResultadoArquivo>(
              tsePaths.resultado(c.cod.ciclo, c.cod.eleicao, c.cod.cargo, uf, info.cod, zona),
              { validadores: e?.validadores, prioridade: 'normal' },
            );
            if (r.status === 'ok') {
              validarResultado(r.data, r.url);
              const res = map.resumoDoResultado(r.data, c.race, this.races, false, uf);
              this.limitarAoRelogio(res.resumo);
              mu.zonas.set(k, { r: res, validadores: r.validadores, em: this.now() });
              mu.ausentes.delete(k);
            } else if (r.status === 'ausente') this.marcarAusente(mu, k);
            else if (e) e.em = this.now();
          } catch (err) {
            this.logErro(`TSE ${c.race.id}/${uf}/${info.cod}/z${zona}`, err);
          }
        }),
      );
      e = mu.zonas.get(k);
    }
    return e && e.r.race.id === race.id ? e.r.resumo : map.resumoVazio(race.candidatos.length);
  }

  private async zonasDoMunicipio(c: Corrida, uf: UF, info: map.MunicipioInfo, resumoMun: Summary, race: Race): Promise<ZonaResumo[]> {
    if (info.zonas.length <= 1) return [{ ...resumoMun, zona: info.zonas[0] ?? 1 }];
    const resumos = await Promise.all(info.zonas.map((z) => this.resumoZona(c, uf, info, z, race)));
    return resumos.map((s, i) => ({ ...s, zona: info.zonas[i] }));
  }

  /** `-cs.json` da UF (status de cada seção), compactado. null se indisponível. */
  private async secoesUf(c: Corrida, uf: UF): Promise<map.SecoesUf | null> {
    const k = `${c.cod.ciclo}|${c.cod.pleito}|${uf}`;
    const ent = this.css.get(k);
    if (ent && this.now() - ent.em < this.csTtl) return ent.secoes;
    const job = this.umaVez(`cs|${k}`, async () => {
      try {
        const r = await this.client.getJson<TseSecoesArquivo>(tsePaths.secoes(c.cod.ciclo, c.cod.pleito, uf), {
          validadores: ent?.validadores,
          prioridade: 'normal',
        });
        if (r.status === 'ok') this.css.set(k, { secoes: map.secoesDoCs(r.data), validadores: r.validadores, em: this.now() });
        else if (r.status === 'nao-modificado' && ent) ent.em = this.now();
        else if (r.status === 'ausente') this.css.set(k, { secoes: null, validadores: {}, em: this.now() });
      } catch (err) {
        this.logErro(`TSE: seções de ${uf} indisponíveis`, err);
      }
    });
    if (ent) {
      void job;
      return ent.secoes;
    }
    await this.comLimite(job);
    return this.css.get(k)?.secoes ?? null;
  }

  private async mosaicoDoMunicipio(c: Corrida, uf: UF, info: map.MunicipioInfo): Promise<ZonaMosaico[]> {
    const cs = await this.secoesUf(c, uf);
    const zonas = cs?.municipios.get(info.cod);
    if (!zonas) return [];
    return [...zonas.values()].sort((a, b) => a.zona - b.zona).map((z) => map.mosaicoStatus(z));
  }

  private async primeiroTurno(c: Corrida, race: Race, uf: UF, cod: string): Promise<PrimeiroTurnoLocal | null> {
    if (race.turno !== 2) return null;
    const t1 = this.races.find((r) => r.id === `${race.id}-t1`);
    if (!t1) return null;
    const k = `${t1.id}|${t1.tse.eleicao}|${uf}|${cod}`;
    const ent = this.ptCache.get(k);
    if (ent && this.now() - ent.em < (ent.v ? PT_TTL_MS : 60_000)) return ent.v;
    const job = this.umaVez(`pt|${k}`, async () => {
      try {
        const r = await this.client.getJson<TseResultadoArquivo>(tsePaths.resultado(t1.tse.ciclo, t1.tse.eleicao, t1.tse.cargo, uf, cod), {
          prioridade: 'baixa',
        });
        this.ptCache.set(k, { v: r.status === 'ok' ? map.primeiroTurnoDoResultado(r.data, t1) : null, em: this.now() });
      } catch (err) {
        this.logErro(`TSE 1º turno ${uf}/${cod}`, err);
      }
    });
    if (ent) {
      void job;
      return ent.v;
    }
    await this.comLimite(job);
    return this.ptCache.peek(k)?.v ?? null;
  }

  private chaveSecao(c: Corrida, uf: UF, cod: string, zona: number, secao: number) {
    return `${c.chave}|${uf}|${cod}|${zona}|${secao}`;
  }

  private guardarSecao(chave: string, det: SecaoDetalhe | null, ttl: number): SecaoDetalhe | null {
    this.secoesCache.set(chave, { det, em: this.now(), ttl });
    return det;
  }

  // -------------------------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------------------------

  private umaVez<T>(chave: string, fn: () => Promise<T>): Promise<T> {
    const atual = this.voo.get(chave) as Promise<T> | undefined;
    if (atual) return atual;
    const p = fn().finally(() => this.voo.delete(chave));
    this.voo.set(chave, p);
    return p;
  }

  /** Espera `p` por até `esperaMax` ms; nunca lança (o erro já foi registrado por quem o produziu). */
  private async comLimite<T>(p: Promise<T>, ms = this.esperaMax): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<undefined>((r) => {
      timer = setTimeout(() => r(undefined), ms);
    });
    try {
      return await Promise.race([p.catch(() => undefined), limite]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Saúde, teste e histórico
  // -------------------------------------------------------------------------------------------

  health(): TseHealth {
    const agora = this.now();
    const corridas: TseCorridaHealth[] = [];
    let ok = true;
    for (const race of this.races) {
      const c = this.corridas.get(race.id);
      if (!c) {
        if (race.turno === 2) ok = false;
        continue;
      }
      const p = c.resultados.get(c.principal);
      const recente = c.ultimoPollOk !== null && agora - c.ultimoPollOk < 3 * (race.turno === 1 ? this.t1Ttl : this.intervaloMs);
      if (race.turno === 2 && !recente) ok = false;
      corridas.push({
        race: race.id,
        mapeadaComo: p ? p.r.race.id : null,
        eleicao: c.cod.eleicao,
        status: p?.r.resumo.status ?? null,
        secoes: p?.r.resumo.secoes ?? 0,
        secoesTotalizadas: p?.r.resumo.secoesTotalizadas ?? 0,
        ultimaAtualizacao: p?.r.resumo.ultimaAtualizacao ?? null,
        ultimoPoll: c.ultimoPoll,
        ultimoPollOk: c.ultimoPollOk,
        ultimoPollMs: c.ultimoPollMs,
        falhasConsecutivas: c.falhas,
        erro: c.erro,
        ausentes: [...c.ausentes],
        conferidoEm: c.conferidoEm,
        nacionalParadoDesde: this.nacionalParadoDesde(c),
      });
    }
    const bloqueio = this.client.bloqueio();
    if (bloqueio) ok = false;
    let munCache = 0;
    for (const m of this.munUf.values()) munCache += m.mun.size + m.zonas.size;
    const rp = this.racePrioritaria;
    const ord = [...this.atrasos].sort((a, b) => a - b);
    const prioritario: TsePrioritarioHealth | null = rp
      ? {
          race: rp.id,
          ativo: this.prioritarioAtivo,
          intervaloSeg: this.intervaloPrioritarioMs / 1000,
          esperaSeg: Math.round(this.prio.esperaMs / 100) / 10,
          ultimaLeitura: this.prio.ultimaLeitura,
          ultimaLeituraOk: this.prio.ultimaLeituraOk,
          ultimaLeituraMs: this.prio.ultimaLeituraMs,
          falhasConsecutivas: this.prio.falhas,
          erro: this.prio.erro,
          contagem: { ...this.prio.contagem },
          atrasoMs: {
            ultimo: this.atrasos.length ? this.atrasos[this.atrasos.length - 1] : null,
            mediana: ord.length ? ord[Math.floor((ord.length - 1) / 2)] : null,
            max: ord.length ? ord[ord.length - 1] : null,
            amostras: ord.length,
          },
        }
      : null;
    return {
      ok,
      bloqueio: bloqueio ? { ...bloqueio, motivoTexto: MOTIVO_BLOQUEIO_TEXTO[bloqueio.motivo] } : null,
      bloqueadoAte: bloqueio?.ate ?? null,
      rodando: this.rodando,
      intervaloSeg: this.intervaloMs / 1000,
      esperaSeg: Math.round((this.esperaCicloMs || this.intervaloMs) / 100) / 10,
      prioritario,
      config: { ...this.config },
      ultimoCiclo: this.ultimoCiclo,
      corridas,
      municipios: { emCache: munCache, fila: this.fila.tamanho, baixando: this.fila.ativos },
      secoes: { emCache: this.secoesCache.size },
      http: this.client.stats(),
    };
  }

  /**
   * Teste rápido de conectividade e códigos (GET /api/admin/tse/test; também a conferência da troca automática). Nunca
   * lança. Quem decide o `ok` é o arquivo Brasil da eleição de Presidente; a configuração geral (`ele-c.json`) só serve
   * para conferir os códigos — fora do ar ou num formato inesperado, vira um "Atenção" e não bloqueia (ensaio geral
   * 12/10/2026: um `ele-c.json` sem `pl` fazia o teste falhar com "Cannot read properties of undefined").
   */
  async testar(): Promise<{ ok: boolean; detalhe: string; amostra?: unknown }> {
    try {
      let pleitos: { pleito: string; data: string; eleicoes: { cd: string; nome: string; turno: string }[] }[] | undefined;
      let conferencia: ReturnType<TseSource['conferirCodigos']> | null = null;
      let avisoCfg: string | null = null;
      try {
        const cfg = await this.client.getJson<TseConfigGeralArquivo>(tsePaths.configGeral(), { prioridade: 'alta', tentativas: 1 });
        if (cfg.status === 'ok' && Array.isArray(cfg.data?.pl)) {
          pleitos = cfg.data.pl
            .filter((p) => p?.c === this.config.ciclo)
            .map((p) => ({ pleito: p.cd, data: p.dt, eleicoes: (p.e ?? []).map((e) => ({ cd: e.cd, nome: e.nm, turno: e.t })) }));
          conferencia = this.conferirCodigos(cfg.data);
        } else if (cfg.status === 'ok') {
          avisoCfg = 'a configuração geral do TSE (ele-c.json) veio num formato inesperado; códigos não conferidos.';
        } else if (cfg.status !== 'nao-modificado') {
          avisoCfg = `a configuração geral do TSE (ele-c.json) está indisponível (HTTP ${cfg.status === 'ausente' ? cfg.httpStatus : '?'}); códigos não conferidos.`;
        }
      } catch (err) {
        avisoCfg = `a configuração geral do TSE (ele-c.json) não pôde ser lida (${msgDe(err)}); códigos não conferidos.`;
      }
      const pres = this.races.find((r) => r.turno === 2 && r.cargo === 'Presidente') ?? this.races[0];
      const cod = this.codigos(pres);
      const br = await this.client.getJson<TseResultadoArquivo>(tsePaths.resultado(cod.ciclo, cod.eleicao, cod.cargo, 'br'), {
        prioridade: 'alta',
        tentativas: 1,
      });
      if (br.status !== 'ok') {
        return {
          ok: false,
          detalhe: `Arquivo Brasil da eleição ${cod.eleicao} indisponível (${br.status === 'ausente' ? `HTTP ${br.httpStatus}` : br.status})`,
          amostra: { pleitos },
        };
      }
      const d = br.data;
      const cands = map.candidatosDoArquivo(d, cod.cargo).map((x) => ({ n: x.n, nmu: x.nmu, vap: x.vap, st: x.st }));
      return {
        ok: true,
        detalhe:
          `Feed ok: eleição ${d.ele} (${d.t}º turno), ${map.int(d.s.st)} de ${map.int(d.s.ts)} seções totalizadas, ` +
          `arquivo gerado ${d.dg} ${d.hg}, latência ${br.ms} ms` +
          (conferencia?.avisos.length || avisoCfg ? `. Atenção: ${[avisoCfg, ...(conferencia?.avisos ?? [])].filter(Boolean).join(' ')}` : ''),
        amostra: {
          pleitos,
          conferencia,
          br: { ele: d.ele, t: d.t, dg: d.dg, hg: d.hg, dt: d.dt, ht: d.ht, tf: d.tf, s: { ts: d.s.ts, st: d.s.st }, cands },
        },
      };
    } catch (err) {
      return { ok: false, detalhe: `Falha ao acessar o TSE: ${msgDe(err)}` };
    }
  }

  /**
   * Confere os códigos configurados contra o `ele-c.json`: o pleito existe, as eleições de Presidente/Governador estão
   * nele como 2º turno (`t: '2'`), e batem com o `cdt2` (código do 2º turno) das eleições do 1º turno do dataset. Também
   * lista as UFs de Governador com 2º turno publicadas pelo TSE × as do dataset. Só informa (nunca bloqueia).
   */
  conferirCodigos(cfg: TseConfigGeralArquivo): {
    esperado: { pleito: string | null; eleicaoPres: string | null; eleicaoGov: string | null };
    ufsGovTse: string[];
    ufsGovDataset: string[];
    avisos: string[];
  } {
    const avisos: string[] = [];
    const c = this.config;
    const doCiclo = cfg.pl.filter((p) => p.c === c.ciclo);
    const t1Pres = this.races.find((r) => r.turno === 1 && r.cargo === 'Presidente')?.tse.eleicao;
    const t1Gov = this.races.find((r) => r.turno === 1 && r.cargo !== 'Presidente')?.tse.eleicao;
    const cdt2 = (ele: string | undefined) => (ele ? (doCiclo.flatMap((p) => p.e).find((e) => e.cd === ele)?.cdt2 ?? null) : null);
    const espPres = cdt2(t1Pres);
    const espGov = cdt2(t1Gov);
    const pleitoDe = (ele: string | null) => (ele ? (doCiclo.find((p) => p.e.some((e) => e.cd === ele))?.cd ?? null) : null);
    const espPleito = pleitoDe(espPres) ?? pleitoDe(espGov);
    const pl = doCiclo.find((p) => p.cd === c.pleito);
    if (!pl) avisos.push(`o pleito ${c.pleito} não aparece no ele-c.json do ciclo ${c.ciclo}${espPleito ? ` (o 2º turno publicado é o ${espPleito})` : ''}.`);
    const govTse = pl?.e.find((e) => e.cd === c.eleicaoGov);
    for (const [rot, cd, esp] of [
      ['Presidente', c.eleicaoPres, espPres],
      ['Governador', c.eleicaoGov, espGov],
    ] as const) {
      const e = pl?.e.find((x) => x.cd === cd);
      if (pl && !e) avisos.push(`a eleição ${cd} (${rot}) não está no pleito ${c.pleito}${esp ? ` (o TSE liga o 1º turno à eleição ${esp})` : ''}.`);
      else if (e && e.t !== '2') avisos.push(`a eleição ${cd} (${rot}) é de ${e.t}º turno (ensaio com dados do 1º turno?).`);
      else if (esp && esp !== cd) avisos.push(`o TSE liga o 1º turno de ${rot} à eleição ${esp}, mas a configuração usa ${cd}.`);
    }
    const ufsGovTse = (govTse?.abr ?? []).map((a) => a.cd.toUpperCase()).sort();
    const ufsGovDataset = this.races.filter((r) => r.turno === 2 && r.cargo !== 'Presidente').flatMap((r) => r.ufs).sort();
    const faltam = ufsGovDataset.filter((u) => !ufsGovTse.includes(u));
    const sobram = ufsGovTse.filter((u) => !ufsGovDataset.includes(u as never));
    if (govTse && t1Gov && govTse.t === '2' && (faltam.length || sobram.length)) {
      avisos.push(
        `2º turno de Governador no TSE: ${ufsGovTse.join(', ') || 'nenhuma UF'}` +
          `${faltam.length ? `; sem arquivo no TSE: ${faltam.join(', ')}` : ''}${sobram.length ? `; fora do site: ${sobram.join(', ')}` : ''}.`,
      );
    }
    return { esperado: { pleito: espPleito, eleicaoPres: espPres, eleicaoGov: espGov }, ufsGovTse, ufsGovDataset, avisos };
  }

  /** Série + eventos de todas as corridas (para persistir; restaure com `historico` nas opções). */
  exportarHistorico(): HistoricoSerializado[] {
    return [...this.corridas.values()].filter((c) => c.hist).map((c) => c.hist!.exportar());
  }
}

// ---------------------------------------------------------------------------------------------

function ehNode() {
  const p = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof p?.versions?.node === 'string';
}

function msgDe(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}


/** O arquivo novo foi gerado ANTES do que já temos (`dg/hg`)? Sem data em algum dos dois: não dá para dizer (false). */
function maisAntigo(novo: number | null, atual: number | null): boolean {
  return novo !== null && atual !== null && novo < atual;
}

/** cyrb53 (domínio público): hash de 53 bits em base 36, para a marca dos dados (não é segurança). */
function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Rejeita arquivo malformado (o último dado bom é mantido). */
function validarResultado(d: TseResultadoArquivo, origem: string) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.carg) || !d.s || !d.e || !d.v) {
    throw new Error(`arquivo de resultado malformado: ${origem}`);
  }
  const ts = map.int(d.s.ts);
  const st = map.int(d.s.st);
  if (st < 0 || ts < 0 || (ts > 0 && st > ts)) throw new Error(`seções incoerentes (${st}/${ts}): ${origem}`);
}

/** Guarda só o que usamos de um item do `ab` (o arquivo de SP tem ~0,5 MB). */
function compactarAb(it: TseAcompanhamentoItem): TseAcompanhamentoItem {
  return {
    tpabr: it.tpabr,
    cdabr: it.cdabr,
    and: it.and,
    dt: it.dt,
    ht: it.ht,
    s: { ts: it.s?.ts ?? '0', st: it.s?.st ?? '0' },
    e: { te: it.e?.te ?? '0', est: it.e?.est ?? '0', c: it.e?.c ?? '0', a: it.e?.a ?? '0' },
  };
}
