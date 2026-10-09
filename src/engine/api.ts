/**
 * Interface pública do motor/controller. O servidor (src/server) e o worker do demo (src/app/data/worker.ts)
 * dependem SOMENTE desta interface. A implementação fica em src/engine/controller.ts.
 */
import type { DatasetMeta, UfDataset } from '../shared/dataset';
import type { AdminCommand, AdminSnapshot, PublicMeta } from '../shared/api';
import type {
  AdminMetrics,
  AdminState,
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

export interface LoadedDataset {
  meta: DatasetMeta;
  ufs: Partial<Record<UF, UfDataset>>;
}

/** Carrega o dataset a partir de um leitor de JSON (fs no servidor, fetch no navegador). Caminhos: 'data/meta.json', 'data/uf/sp.json'. */
export type JsonLoader = (path: string) => Promise<unknown>;

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

  /** Snapshots no instante atual (relógio do controller). Lançam `NotFoundError` para escopos inexistentes. */
  nacional(race: RaceId): NationalSnapshot;
  uf(race: RaceId, uf: UF): UfSnapshot;
  municipio(race: RaceId, uf: UF, cod: string): MunicipioSnapshot;
  zona(race: RaceId, uf: UF, cod: string, zona: number): ZonaSnapshot;
  secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number): SecaoDetalhe | null;

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
//   export async function loadDataset(load: JsonLoader): Promise<LoadedDataset>
//   export function createController(ds: LoadedDataset, opts: ControllerOptions): Controller
