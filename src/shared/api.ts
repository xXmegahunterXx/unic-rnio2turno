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
 *   GET  /api/apuracao/:race/br/municipios                  → MunicipiosNacionalSnapshot (mapa nacional por município)
 *   (todas as rotas de apuração aceitam ?t=<epoch> para "reveja a noite" — ver Instante)
 *   GET  /api/og/apuracao.png?race=pres                     → imagem 1200×630 para link preview
 *   GET  /api/patrocinio/logo?h=<hash>                      → logo do patrocínio enviada em data URI (no /api/status,
 *                                                             `patrocinio.imagem` vem como esta URL absoluta)
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
  MunicipiosNacionalSnapshot,
  Patrocinio,
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
  | { tipo: 'tse'; tse: Partial<TseConfig> }
  /** Mostra (true) ou oculta (false, padrão) os nomes reais dos candidatos na fonte 'simulacao'. */
  | { tipo: 'nomes-reais'; ativo: boolean }
  /** Define (ou remove, com null) o patrocínio exibido no site. */
  | { tipo: 'patrocinio'; patrocinio: Patrocinio | null };

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
  nacional(race: RaceId, opts?: Instante): Promise<NationalSnapshot>;
  uf(race: RaceId, uf: UF, opts?: Instante): Promise<UfSnapshot>;
  municipio(race: RaceId, uf: UF, cod: string, opts?: Instante): Promise<MunicipioSnapshot>;
  zona(race: RaceId, uf: UF, cod: string, zona: number, opts?: Instante): Promise<ZonaSnapshot>;
  secao(race: RaceId, uf: UF, cod: string, zona: number, secao: number, opts?: Instante): Promise<SecaoDetalhe | null>;
  /** Mapa nacional por município (5.571), alinhado com public/data/municipios-br.json. */
  municipiosBr(race: RaceId, opts?: Instante): Promise<MunicipiosNacionalSnapshot>;
  admin: {
    login(senha: string): Promise<boolean>;
    logout(): Promise<void>;
    state(): Promise<AdminSnapshot>;
    command(cmd: AdminCommand): Promise<AdminSnapshot>;
    presets(): Promise<PresetInfo[]>;
    testarTse(): Promise<{ ok: boolean; detalhe: string; amostra?: unknown }>;
  };
}

/**
 * "Reveja a noite": pedir o estado da apuração num instante PASSADO (epoch ms, ≤ simNow atual).
 * Ausente = agora. Instantes futuros são limitados ao agora (nunca adiantar resultado).
 * HTTP: query `?t=<epoch>`. Na fonte TSE, só nacional/UF têm histórico; demais níveis respondem o agora.
 */
export interface Instante {
  t?: number;
}

export type { ClockState };
