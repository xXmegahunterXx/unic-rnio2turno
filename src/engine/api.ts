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
  /** Substitui o estado inteiro (sincronização entre abas no demo / restauração). */
  setState(state: AdminState): void;
  command(cmd: AdminCommand): AdminSnapshot;
  adminSnapshot(extra?: Partial<AdminMetrics>): AdminSnapshot;
  presets(): PresetInfo[];

  /** Snapshots no instante atual (relógio do controller). Lançam `NotFoundError` para escopos inexistentes. */
  nacional(race: RaceId): NationalSnapshot;
  uf(race: RaceId, uf: UF): UfSnapshot;
  municipio(race: RaceId, uf: UF, cod: string): MunicipioSnapshot;
  zona(race: RaceId, uf: UF, cod: string, zona: number): ZonaSnapshot;
  secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number): SecaoDetalhe | null;
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(msg: string) {
    super(msg);
    this.name = 'NotFoundError';
  }
}

// Implementado em controller.ts:
//   export async function loadDataset(load: JsonLoader): Promise<LoadedDataset>
//   export function createController(ds: LoadedDataset, opts: ControllerOptions): Controller
