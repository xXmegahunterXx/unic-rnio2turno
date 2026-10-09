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
 *   tse.health(); tse.stop();
 *
 * Estratégia (detalhes e URLs em src/tse/README.md):
 *  - Polling: arquivo Brasil + 28 UFs de Presidente e a UF de cada Governador (requisição condicional: o
 *    CDN do TSE responde 304). A cada mudança: ponto de série + eventos por diferença (eventos.ts).
 *  - Não existe arquivo com os votos de todos os municípios de uma UF. O `-ab.json` da UF (1 arquivo) diz
 *    quantas seções cada município já totalizou; só os municípios que mudaram são baixados, por uma fila com
 *    prioridade (UFs consultadas nos últimos minutos primeiro), no máximo 1 vez por `municipioTtlMs`.
 *  - Zona: arquivo por município+zona (`{uf}{mun}-z{zona}-c…-u.json`). Seções: status pelo `-cs.json` da UF
 *    (`da`/`ha` = arquivos da urna publicados); votos de uma seção só sob demanda, pelo BU.
 *  - Erros do TSE nunca derrubam: o último dado bom é mantido e `health()` expõe o problema. Métodos não
 *    lançam por falha de rede; lançam `NotFoundError` só para corrida/UF/município/zona inexistentes.
 *
 * Isomórfico (fetch + timers), mas pensado para o servidor (um poller para todos os clientes).
 */
import type {
  MunicipioResumo,
  MunicipioSnapshot,
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
import { TseClient, type FetchLike, type Prioridade, type TseClientStats, type Validadores } from './client';
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
}

export interface TseHealth {
  /** true quando o arquivo principal de todas as corridas de 2º turno foi lido nos últimos 3 intervalos */
  ok: boolean;
  rodando: boolean;
  intervaloSeg: number;
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
  emVoo: Promise<void> | null = null;

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
  /** arquivos (município ou `cod|zona`) que o TSE ainda não publicou (404) → instante da verificação */
  ausentes: Map<string, number>;
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
const CM_TTL_MS = 60 * 60_000;
const PT_TTL_MS = 6 * 60 * 60_000;

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

  constructor(opts: TseSourceOptions) {
    if (!opts.races?.length) throw new Error('TseSource: lista de corridas vazia');
    this.config = { ...opts.config };
    this.races = opts.races;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => undefined);
    this.client =
      opts.client ??
      new TseClient({
        baseUrl: this.config.baseUrl,
        fetch: opts.fetch,
        concorrencia: opts.concorrencia ?? 6,
        now: this.now,
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
  }

  // -------------------------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------------------------

  private get intervaloMs() {
    return Math.max(5, this.config.intervaloSeg || 15) * 1000;
  }

  start() {
    if (this.rodando) return;
    this.rodando = true;
    this.log(`TSE: polling iniciado (${this.config.baseUrl}, a cada ${this.intervaloMs / 1000} s)`);
    void this.ciclo();
  }

  stop() {
    this.rodando = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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
    const t0 = this.now();
    try {
      await this.pollOnce();
    } catch (err) {
      this.log(`TSE: erro inesperado no ciclo: ${msgDe(err)}`);
    }
    if (!this.rodando) return;
    const espera = Math.max(1_000, this.intervaloMs - (this.now() - t0));
    this.timer = setTimeout(() => void this.ciclo(), espera);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Um ciclo de polling (público para testes e para o botão "testar" do admin). */
  async pollOnce(): Promise<void> {
    const inicio = this.now();
    const corridas = this.races.filter((r) => r.turno === 2).map((r) => this.corrida(r.id));
    await Promise.all(corridas.map((c) => this.pollCorrida(c, 'normal')));
    const erros = corridas.filter((c) => c.erro).length;
    this.ultimoCiclo = { inicio, ms: this.now() - inicio, erros };
    if (this.aquecer) this.aquecerMunicipios(corridas);
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

  private pollCorrida(c: Corrida, prioridade: Prioridade): Promise<void> {
    if (c.emVoo) return c.emVoo;
    c.emVoo = (async () => {
      const t0 = this.now();
      const mudaram: Abr[] = [];
      const erros: string[] = [];
      let principalOk = false;
      await Promise.all(
        c.abrs.map(async (abr) => {
          try {
            if (await this.buscarResultado(c, abr, prioridade)) mudaram.push(abr);
            if (abr === c.principal) principalOk = true;
          } catch (err) {
            erros.push(`${abr}: ${msgDe(err)}`);
          }
        }),
      );
      const agora = this.now();
      c.ultimoPoll = agora;
      c.ultimoPollMs = agora - t0;
      if (principalOk) c.ultimoPollOk = agora;
      if (erros.length) {
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

  /** Baixa o resultado de uma abrangência. true se o conteúdo mudou. */
  private async buscarResultado(c: Corrida, abr: Abr, prioridade: Prioridade): Promise<boolean> {
    const prev = c.resultados.get(abr);
    const path = tsePaths.resultado(c.cod.ciclo, c.cod.eleicao, c.cod.cargo, abr === 'BR' ? 'br' : abr);
    const resp = await this.client.getJson<TseResultadoArquivo>(path, { validadores: prev?.validadores, prioridade });
    if (resp.status === 'nao-modificado') {
      if (prev) prev.em = this.now();
      return false;
    }
    if (resp.status === 'ausente') {
      c.ausentes.add(abr);
      return false;
    }
    c.ausentes.delete(abr);
    validarResultado(resp.data, path);
    const r = map.resumoDoResultado(resp.data, c.race, this.races, abr === c.principal, abr);
    this.limitarAoRelogio(r.resumo);
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
    return mudou;
  }

  private registrarHistorico(c: Corrida, mudaram: Abr[]) {
    const race = c.mapeada;
    if (!c.hist || c.hist.race.id !== race.id) {
      c.hist = new HistoricoCorrida(race, c.chave);
      const salvo = this.historicoPendente.get(race.id);
      if (salvo && c.hist.importar(salvo)) this.log(`TSE ${race.id}: histórico restaurado`);
      this.historicoPendente.delete(race.id);
    }
    // UFs antes do Brasil: o feed nacional fica na ordem natural (Brasil por último no mesmo instante)
    const ordem = [...mudaram].sort((x, y) => (x === c.principal ? 1 : 0) - (y === c.principal ? 1 : 0));
    for (const abr of ordem) {
      const e = c.resultados.get(abr);
      if (!e || e.r.race.id !== race.id) continue;
      const t = e.r.resumo.ultimaAtualizacao ?? this.now();
      c.hist.registrar(abr, e.r.resumo, t, abr === c.principal);
    }
  }

  /** Garante dados da corrida: espera o 1º download; depois só renova em segundo plano. */
  private async garantir(c: Corrida) {
    const ttl = c.race.turno === 1 ? this.t1Ttl : this.intervaloMs;
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

  async nacional(raceId: RaceId): Promise<NationalSnapshot> {
    const c = this.corrida(raceId);
    await this.garantir(c);
    const agora = this.now();
    const race = c.mapeada;
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

  async uf(raceId: RaceId, ufIn: string): Promise<UfSnapshot> {
    const c = this.corrida(raceId);
    const uf = this.ufDaCorrida(c, ufIn);
    await this.garantir(c);
    this.marcarQuente(c, uf);
    const race = c.mapeada;
    const municipios = await this.municipiosDaUf(c, uf, race);
    const resumo = this.resumoAbr(c, uf, race);
    const hist = c.hist && c.hist.race.id === race.id ? c.hist : null;
    const agora = this.now();
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
      this.log(`TSE seção ${uf}/${info.cod}/${z}/${s}: ${msgDe(err)}`);
      return cache?.det ?? pendente();
    }
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
        this.log(`TSE: municípios (${ele}) indisponíveis: ${msgDe(err)}`);
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
          for (const [cod, it] of map.acompanhamentoPorMunicipio(r.data.abr ?? [])) porMun.set(cod, compactarAb(it));
          mu.ab = { porMun, validadores: r.validadores, em: this.now() };
        } else if (r.status === 'nao-modificado' && mu.ab) mu.ab.em = this.now();
      } catch (err) {
        this.log(`TSE ${c.race.id}/${uf}: acompanhamento indisponível: ${msgDe(err)}`);
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
        await this.buscarMunicipio(c, uf, cod, 'baixa');
      });
    }
  }

  private aquecerMunicipios(corridas: Corrida[]) {
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
          this.limitarAoRelogio(res.resumo);
          mu.mun.set(cod, { r: res, validadores: r.validadores, em: this.now() });
          mu.ausentes.delete(cod);
        } else if (r.status === 'ausente') mu.ausentes.set(cod, this.now());
        else if (prev) prev.em = this.now();
      } catch (err) {
        this.log(`TSE ${c.race.id}/${uf}/${cod}: ${msgDe(err)}`);
      }
    });
  }

  private ausenteRecente(mu: MunUf, chave: string) {
    const t = mu.ausentes.get(chave);
    return t !== undefined && this.now() - t < this.munTtl;
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
            } else if (r.status === 'ausente') mu.ausentes.set(k, this.now());
            else if (e) e.em = this.now();
          } catch (err) {
            this.log(`TSE ${c.race.id}/${uf}/${info.cod}/z${zona}: ${msgDe(err)}`);
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
        this.log(`TSE: seções de ${uf} indisponíveis: ${msgDe(err)}`);
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
        this.log(`TSE 1º turno ${uf}/${cod}: ${msgDe(err)}`);
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
      });
    }
    let munCache = 0;
    for (const m of this.munUf.values()) munCache += m.mun.size + m.zonas.size;
    return {
      ok,
      rodando: this.rodando,
      intervaloSeg: this.intervaloMs / 1000,
      config: { ...this.config },
      ultimoCiclo: this.ultimoCiclo,
      corridas,
      municipios: { emCache: munCache, fila: this.fila.tamanho, baixando: this.fila.ativos },
      secoes: { emCache: this.secoesCache.size },
      http: this.client.stats(),
    };
  }

  /** Teste rápido de conectividade e códigos (GET /api/admin/tse/test). Nunca lança. */
  async testar(): Promise<{ ok: boolean; detalhe: string; amostra?: unknown }> {
    try {
      const cfg = await this.client.getJson<TseConfigGeralArquivo>(tsePaths.configGeral(), { prioridade: 'alta', tentativas: 1 });
      if (cfg.status !== 'ok' && cfg.status !== 'nao-modificado') {
        return { ok: false, detalhe: `Configuração geral do TSE indisponível (HTTP ${cfg.status === 'ausente' ? cfg.httpStatus : '?'})` };
      }
      const pleitos =
        cfg.status === 'ok'
          ? cfg.data.pl
              .filter((p) => p.c === this.config.ciclo)
              .map((p) => ({ pleito: p.cd, data: p.dt, eleicoes: p.e.map((e) => ({ cd: e.cd, nome: e.nm, turno: e.t })) }))
          : undefined;
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
          `arquivo gerado ${d.dg} ${d.hg}, latência ${br.ms} ms`,
        amostra: { pleitos, br: { ele: d.ele, t: d.t, dg: d.dg, hg: d.hg, dt: d.dt, ht: d.ht, tf: d.tf, s: { ts: d.s.ts, st: d.s.st }, cands } },
      };
    } catch (err) {
      return { ok: false, detalhe: `Falha ao acessar o TSE: ${msgDe(err)}` };
    }
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
