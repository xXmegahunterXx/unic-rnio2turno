/**
 * Interface pública do motor/controller. O servidor (src/server) e o worker do demo (src/app/data/worker.ts)
 * dependem SOMENTE desta interface. A implementação fica em src/engine/controller.ts.
 */
import type { DatasetMeta, LocaisUfDataset, MunicipiosBr, SecaoUfDataset, UfDataset } from '../shared/dataset';
import type { AdminCommand, AdminSnapshot, PublicMeta } from '../shared/api';
import type {
  AdminMetrics,
  AdminState,
  LiveStatus,
  MunicipioSnapshot,
  MunicipiosNacionalSnapshot,
  NationalSnapshot,
  PresetInfo,
  RaceId,
  SecaoDetalhe,
  UF,
  UfSnapshot,
  ZonaSnapshot,
} from '../shared/types';

export interface LoadedDataset {
  meta: DatasetMeta;
  ufs: Partial<Record<UF, UfDataset>>;
  /**
   * 1º turno REAL por seção (public/data/secao/{uf}.json), OPCIONAL: UFs ausentes (ou com `n` diferente do
   * número de seções da UF) usam o modelo por município + ruído (comportamento da fase 1).
   */
  secao?: Partial<Record<UF, SecaoUfDataset>>;
  /** Ordem canônica do mapa nacional (public/data/municipios-br.json), OPCIONAL (derivada se ausente). */
  municipiosBr?: MunicipiosBr | null;
  /** Locais de votação já carregados (opcional; normalmente carregados sob demanda por `load`). */
  locais?: Partial<Record<UF, LocaisUfDataset | null>>;
  /** Leitor usado no carregamento (o controller o reaproveita para arquivos sob demanda, ex.: locais). */
  load?: JsonLoader;
}

/** Carrega o dataset a partir de um leitor de JSON (fs no servidor, fetch no navegador). Caminhos: 'data/meta.json', 'data/uf/sp.json'. */
export type JsonLoader = (path: string) => Promise<unknown>;

/** Opções de `loadDataset` (todos os arquivos opcionais são carregados por padrão; ausentes são ignorados). */
export interface LoadOptions {
  /** Carregar public/data/secao/{uf}.json (1º turno real por seção). Padrão true. */
  secao?: boolean;
  /** Carregar public/data/municipios-br.json. Padrão true. */
  municipiosBr?: boolean;
}

export interface ControllerOptions {
  modo: 'servidor' | 'demo';
  /** Estado restaurado (persistido). Se ausente, usa o padrão do modo. */
  initialState?: AdminState;
  /** Relógio de parede injetável (testes). Padrão: Date.now. */
  now?: () => number;
  /** Chamado após cada mudança de estado (para persistir/sincronizar). */
  onStateChange?: (state: AdminState) => void;
  /** Log de eventos operacionais (aparece no monitor do admin). */
  log?: (msg: string) => void;
}

export interface Controller {
  readonly modo: 'servidor' | 'demo';
  meta(): PublicMeta;
  status(): LiveStatus;
  state(): AdminState;
  /**
   * Substitui o estado inteiro (sincronização entre abas no demo / restauração). Valida e completa campos
   * ausentes; reconstrói o modelo se o cenário mudou. NÃO chama `onStateChange` (evita laços de broadcast).
   */
  setState(state: AdminState): void;
  /** Aplica um comando do admin (lança `CommandError` (400) se inválido). `versao` incrementa a cada mudança. */
  command(cmd: AdminCommand): AdminSnapshot;
  adminSnapshot(extra?: Partial<AdminMetrics>): AdminSnapshot;
  presets(): PresetInfo[];

  /**
   * Snapshots no instante atual (relógio do controller). Lançam `NotFoundError` para escopos inexistentes.
   * Os objetos devolvidos vêm do cache interno (compartilhados entre chamadas): trate-os como IMUTÁVEIS —
   * alterar um campo (ex.: `snap.zonas.length = 0`) corrompe as respostas seguintes do mesmo instante.
   */
  nacional(race: RaceId, t?: number): NationalSnapshot;
  uf(race: RaceId, uf: UF, t?: number): UfSnapshot;
  municipio(race: RaceId, uf: UF, cod: string, t?: number): MunicipioSnapshot;
  zona(race: RaceId, uf: UF, cod: string, zona: number, t?: number): ZonaSnapshot;
  secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number, t?: number): SecaoDetalhe | null;
  /** Mapa nacional por município (ordem de public/data/municipios-br.json). */
  municipiosBr(race: RaceId, t?: number): MunicipiosNacionalSnapshot;
  /**
   * Carrega (uma vez, com cache) os locais de votação da UF (public/data/locais/{uf}.json) pelo leitor do
   * dataset. Resolve true se há locais. Depois disso, `zona`/`secao` da UF trazem `local` em cada seção.
   * Sem esta chamada, a primeira consulta de zona/seção da UF dispara o carregamento em segundo plano (as
   * respostas seguintes já vêm com `local`). Nunca rejeita (arquivo ausente/inválido → false).
   */
  carregaLocais?(uf: UF | string): Promise<boolean>;

  // `t` (opcional, epoch ms) = "reveja a noite": estado da apuração num instante PASSADO; limitado ao simNow atual
  // (nunca futuro). Ausente = agora.

  // --- extensões (retrocompatíveis) -------------------------------------------------------------
  /** Relógio da apuração agora (simulado; = wallNow nas fontes 'pre' e 'tse'). */
  simNow(): number;
  /** Instantes (simNow) em que 'pres' atinge 1, 10, 25, 50, 75, 90, 99 e 100% das seções. */
  marcos(): { pct: number; t: number }[];
  /** simNow em que a simulação atinge 100% ('pres'). */
  fimPrevisto(): number | null;
  /** Métricas operacionais (o servidor completa requisições/clientes via `extra`). */
  metrics(extra?: Partial<AdminMetrics>): AdminMetrics;
  /** Estado serializado (JSON) para persistir; restaure com `parseAdminState` + `initialState`/`setState`. */
  toJSON(): string;
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(msg: string) {
    super(msg);
    this.name = 'NotFoundError';
  }
}

/** Comando/cenário inválido (o servidor responde 400 com `message`). */
export class CommandError extends Error {
  readonly status = 400;
  constructor(msg: string) {
    super(msg);
    this.name = 'CommandError';
  }
}

// Implementado em controller.ts:
//   export async function loadDataset(load: JsonLoader, opts?: LoadOptions): Promise<LoadedDataset>
//   export function createController(ds: LoadedDataset, opts: ControllerOptions): Controller
