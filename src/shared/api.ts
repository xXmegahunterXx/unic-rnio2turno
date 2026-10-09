/**
 * Contrato da API pública e do admin. O servidor (src/server) implementa via HTTP; no build "demo"
 * o app usa uma implementação local (motor rodando num Web Worker) com a MESMA interface.
 *
 * Rotas HTTP (todas JSON, prefixo /api):
 *   GET  /api/status                                        → LiveStatus              (Cache-Control: s-maxage=1)
 *   GET  /api/meta                                          → PublicMeta              (s-maxage=300)
 *   GET  /api/apuracao/:race/br                             → NationalSnapshot        (s-maxage=2, stale-while-revalidate=10)
 *   GET  /api/apuracao/:race/uf/:uf                         → UfSnapshot
 *   GET  /api/apuracao/:race/uf/:uf/mun/:cod                → MunicipioSnapshot
 *   GET  /api/apuracao/:race/uf/:uf/mun/:cod/zona/:zona     → ZonaSnapshot
 *   GET  /api/apuracao/:race/uf/:uf/mun/:cod/zona/:zona/secao/:secao → SecaoDetalhe
 *   GET  /api/og/apuracao.png?race=pres                     → imagem 1200×630 para link preview
 *
 *   POST /api/admin/login            { senha }                → { ok: true } + cookie httpOnly
 *   POST /api/admin/logout
 *   GET  /api/admin/state                                     → AdminSnapshot
 *   POST /api/admin/command          AdminCommand             → AdminSnapshot
 *   GET  /api/admin/presets                                   → PresetInfo[]
 *   GET  /api/admin/tse/test                                  → { ok, detalhe, amostra }
 *
 * `:race` = RaceId ('pres', 'gov-rj', 'pres-t1', 'gov-rj-t1', ...). UF e race em minúsculas na URL.
 */
import type {
  AdminMetrics,
  AdminState,
  Aviso,
  ClockState,
  FonteDados,
  LiveStatus,
  MunicipioSnapshot,
  NationalSnapshot,
  PresetInfo,
  Race,
  RaceId,
  ScenarioConfig,
  SecaoDetalhe,
  TseConfig,
  UF,
  UfSnapshot,
  ZonaSnapshot,
} from './types';
import type { UfMeta } from './dataset';

/** Metadados públicos (corridas, candidatos, UFs). */
export interface PublicMeta {
  races: Race[];
  ufs: UfMeta[];
  inicioApuracao: number;
}

export type AdminCommand =
  | { tipo: 'relogio'; acao: 'iniciar' | 'pausar' | 'retomar' | 'reiniciar' }
  | { tipo: 'velocidade'; velocidade: number }
  | { tipo: 'saltar-tempo'; simNow: number }
  /** Salta até o instante em que a corrida 'pres' atinge `pct` % de seções totalizadas. */
  | { tipo: 'saltar-pct'; pct: number }
  | { tipo: 'cenario'; cenario: Partial<ScenarioConfig> }
  | { tipo: 'preset'; preset: string }
  | { tipo: 'fonte'; fonte: FonteDados }
  | { tipo: 'aviso'; aviso: Aviso | null }
  | { tipo: 'congelar'; congelado: boolean }
  | { tipo: 'tse'; tse: Partial<TseConfig> };

export interface AdminSnapshot {
  state: AdminState;
  status: LiveStatus;
  metrics: AdminMetrics;
  /** Ponto em que a simulação atinge marcos (para a régua de tempo do admin). */
  marcos: { pct: number; t: number }[];
  /** Instante (simNow) do fim previsto da apuração simulada (100%). */
  fimPrevisto: number | null;
}

/** Interface única de acesso a dados no app (HTTP em produção, Worker local no demo). */
export interface ApuracaoClient {
  status(): Promise<LiveStatus>;
  meta(): Promise<PublicMeta>;
  nacional(race: RaceId): Promise<NationalSnapshot>;
  uf(race: RaceId, uf: UF): Promise<UfSnapshot>;
  municipio(race: RaceId, uf: UF, cod: string): Promise<MunicipioSnapshot>;
  zona(race: RaceId, uf: UF, cod: string, zona: number): Promise<ZonaSnapshot>;
  secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number): Promise<SecaoDetalhe | null>;
  admin: {
    login(senha: string): Promise<boolean>;
    logout(): Promise<void>;
    state(): Promise<AdminSnapshot>;
    command(cmd: AdminCommand): Promise<AdminSnapshot>;
    presets(): Promise<PresetInfo[]>;
    testarTse(): Promise<{ ok: boolean; detalhe: string; amostra?: unknown }>;
  };
}

export type { ClockState };
