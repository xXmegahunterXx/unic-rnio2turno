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
 *   GET  /api/anuncio/img?h=<hash>                          → logo/peça de um anúncio (cache longo; no /api/status, as
 *                                                             imagens dos anúncios vêm como esta URL)
 *   GET  /api/anuncio/ir/:id?f=<formato>                    → conta o clique (agregado) e redireciona (302) para o
 *                                                             destino com UTM (urlComUtm)
 *   POST /api/anuncio/evento   { id, formato }              → conta uma impressão VISÍVEL (agregada, sem dado pessoal;
 *                                                             204; repetição por pessoa = rede + navegador; limite por rede)
 *   POST /api/anuncie/relatorio { k }                       → RelatorioAnunciante (src/shared/relatorio.ts): relatório de
 *                                                             entrega pelo link privado (/relatorio#k=<token>); token
 *                                                             errado/revogado → 404; no-store, noindex, no-referrer
 *   GET  /api/admin/anuncios/metricas?horas=<1–336>         → MetricasAnunciosResposta (detalhe por hora das últimas
 *                                                             `horas`, padrão 48; + entregue, esgotadoEm e alcance)
 *   GET  /api/admin/relatorios                              → { links: LinkRelatorio[]; ligado: boolean } (ligado false =
 *                                                             RELATORIOS=0 no servidor: o painel esconde os links)
 *   POST /api/admin/relatorios { acao: 'criar', id, rotulo?, mostrarMeta? } → { link: LinkRelatorio; url } (o token só
 *                                                             aparece aqui, uma vez)
 *                              { acao: 'revogar', lid }     → { link: LinkRelatorio }
 *
 *   Leva 3 (rotas novas; quem implementa entre parênteses — a fiação em app.ts é da A2):
 *   GET  /api/texto/placar?race=pres&uf=sp                  → text/plain (≤ 380 caracteres, sempre 200) para bots de chat
 *                                                             (!apuracao); chave 'texto-bots' (G)
 *   POST /api/live/batimento   BatimentoLive                → 204; contagem anônima de lives; chave 'contar-lives' (G)
 *   GET  /api/live/agora                                    → LivesPublico (s-maxage=30; número só com N ≥ 5) (G)
 *   GET  /api/admin/lives                                   → LivesResumo (src/shared/lives.ts) (G)
 *   GET  /api/saude-noite                                   → { noite: 'ok' | 'atencao'; motivo? } (no-store) (B)
 *   GET  /api/og/audiencia.png                              → imagem genérica "N pessoas acompanhando" (s-maxage=60) (F)
 *   GET  /sitemap.xml                                       → índice de sitemaps (páginas, municípios, candidatos, cargos) (E)
 *
 *   POST /api/admin/login            { senha }                → { ok: true } + cookie httpOnly
 *   POST /api/admin/logout
 *   GET  /api/admin/state                                     → AdminSnapshot
 *   POST /api/admin/command          AdminCommand             → AdminSnapshot
 *   GET  /api/admin/presets                                   → PresetInfo[]
 *   GET  /api/admin/tse/test                                  → { ok, detalhe, amostra }
 *
 *   GET  /healthz (vivo) · /readyz (pronto para receber tráfego) · /api/versao → BuildInfo · /sitemap.xml · /robots.txt
 *
 * `:race` = RaceId ('pres', 'gov-df', 'pres-t1', 'gov-df-t1', ...). UF e race em minúsculas na URL.
 */
import type { AjusteImagem, AnuncioConfig, ContatoAnuncie } from './anuncios';
import type { ContatosPublicos } from './contatos';
import type {
  AdminMetrics,
  AdminState,
  Aviso,
  ClockState,
  FatorCarga,
  FonteDados,
  ModoAvisoNacional,
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
  /** Define (ou remove, com null) o patrocínio exibido no site. LEGADO: vira/atualiza o anúncio master. */
  | { tipo: 'patrocinio'; patrocinio: Patrocinio | null }
  /** Cria ou substitui (pelo id) um anúncio — src/shared/anuncios.ts (validaAnuncio). */
  | { tipo: 'anuncio-salvar'; anuncio: AnuncioConfig }
  | { tipo: 'anuncio-remover'; id: string }
  /** Liga/desliga um anúncio sem apagar. */
  | { tipo: 'anuncio-ativo'; id: string; ativo: boolean }
  /** Troca SÓ a logo de um anúncio ("Ajustar agora" e o desfazer). Campo ausente = mantém; null = apaga. */
  | { tipo: 'anuncio-logo'; id: string; logo?: string | null; logoAjuste?: AjusteImagem | null; logoEscuro?: string | null; logoEscuroAjuste?: AjusteImagem | null }
  /** Interruptor geral: tira todos os anúncios do ar sem apagar nada (suspender=true) ou devolve exatamente o que estava. */
  | { tipo: 'anuncios-suspensao'; suspender: boolean; motivo?: string } // motivo ≤ 140
  /** Contato da página /anuncie (null limpa). */
  | { tipo: 'anuncie-contato'; contato: ContatoAnuncie | null }
  /** Contatos públicos (geral, privacidade, imprensa, correções) e responsável pelo site (null limpa). */
  | { tipo: 'contatos'; contatos: ContatosPublicos | null }
  /**
   * Troca automática 'pre' → 'tse' (executada pelo servidor; ver `TrocaAutoEstado`):
   *  - 'ligar' (rearma: vale de novo mesmo se já foi feita) · 'desligar';
   *  - 'adiar' para `para` (epoch ms; null = volta ao horário padrão do servidor; rearma);
   *  - 'agora': tenta já (com a mesma conferência do feed do TSE);
   *  - 'executar' (fonte 'pre' → 'tse' e marca como feita) e 'concluir' (só marca): uso INTERNO do servidor, nunca
   *    aceitos pela rota HTTP do admin.
   */
  | { tipo: 'troca-auto'; acao: 'ligar' | 'desligar' | 'agora' | 'executar' | 'concluir' }
  | { tipo: 'troca-auto'; acao: 'adiar'; para: number | null }
  // ---- Leva 3: "Chaves da noite" (gravadas em AdminState.noite; no servidor NÃO incrementam `versao`) ----------------
  /** I37: freio de carga — o app consulta `fator`× mais espaçado; `leve` (ausente = false) para o mapa municipal e o
   *  "desde o 1º turno" e espaça o chat. `{ fator: 1 }` solta o freio. Vai ao site como `LiveStatus.carga`. */
  | { tipo: 'freio'; fator: FatorCarga; leve?: boolean }
  /** I09: "N pessoas agora" no site (só a partir de PISO_PESSOAS_PUBLICO). */
  | { tipo: 'contador-publico'; ligado: boolean }
  /** I05: HTML guardado na borda (padrão desligado; liga só depois do ensaio). */
  | { tipo: 'html-borda'; ligado: boolean }
  /** I11: contar as impressões visíveis dos anúncios (desligado = 204 sem contar). */
  | { tipo: 'medir-anuncios'; ligado: boolean }
  /** I18: aviso do arquivo nacional do TSE parado. */
  | { tipo: 'aviso-nacional'; modo: ModoAvisoNacional }
  /** I22: texto do placar para bots de chat (desligado = só o endereço do site). */
  | { tipo: 'texto-bots'; ligado: boolean }
  /** I23: contagem anônima de lives (desligado = 204 sem contar). */
  | { tipo: 'contar-lives'; ligado: boolean }
  // ---- Leva 3: ações executadas pelo SERVIDOR (interceptadas em app.ts; o motor recusa: "indisponível nesta versão") ---
  /** I03: retoma já as leituras do TSE pausadas por bloqueio (falso positivo). */
  | { tipo: 'tse-retomar' }
  /** I16: manda uma mensagem de teste aos alertas (Telegram), se configurados. */
  | { tipo: 'alerta-teste' }
  /** I13: pacotes "a partir de" da página /anuncie (até PRECOS_ANUNCIE_LIMITES.itens; [] = some, volta "sob consulta"). */
  | { tipo: 'precos-anuncie'; itens: PrecoAnuncie[] };

/** I13: um pacote de preço "a partir de" da página /anuncie (valor em centavos; exibido com o formatador de real). */
export interface PrecoAnuncie {
  nome: string;
  aPartirDeCentavos: number;
  detalhe?: string;
}

/** Limites de 'precos-anuncie' (validação no servidor). */
export const PRECOS_ANUNCIE_LIMITES = { itens: 6, nome: 60, detalhe: 140, centavosMin: 100, centavosMax: 100_000_000 } as const;

export interface AdminSnapshot {
  state: AdminState;
  status: LiveStatus;
  metrics: AdminMetrics;
  /** Ponto em que a simulação atinge marcos (para a régua de tempo do admin). */
  marcos: { pct: number; t: number }[];
  /** Instante (simNow) do fim previsto da apuração simulada (100%). */
  fimPrevisto: number | null;
  /** Só no servidor (ausente no demo): build, travas de produção, troca automática e métricas do processo. */
  servidor?: ServidorInfo;
}

/** Versão do build em execução (GET /api/versao, /healthz e cabeçalho `x-sintonia-versao`). */
export interface BuildInfo {
  /** commit (curto) do build, ou 'dev' */
  commit: string;
  /** data do build (ISO) se informada no build */
  data: string | null;
  /** versão do package.json */
  versao: string;
  node: string;
}

/** Estado da troca automática 'pre' → 'tse' calculado pelo servidor. */
export interface TrocaAutoInfo {
  /** TSE_AUTO ligado no servidor (padrão: só em produção). Desligado = o painel só mostra. */
  habilitada: boolean;
  /** Escolha do admin (TrocaAutoEstado.ligada). */
  ligada: boolean;
  /**
   * 'desabilitada' (TSE_AUTO=0) · 'desligada' (pelo admin) · 'agendada' (antes do horário) · 'verificando' (conferindo o
   * feed) · 'aguardando-tse' (feed sem resposta: tenta de novo com espera crescente) · 'feita' · 'nao-aplicavel' (no
   * horário a fonte não era 'pre', ex.: simulação).
   */
  estado: 'desabilitada' | 'desligada' | 'agendada' | 'verificando' | 'aguardando-tse' | 'feita' | 'nao-aplicavel';
  /** Horário efetivo da troca (epoch ms). */
  inicio: number;
  /** Horário padrão do servidor (TSE_INICIO ou 17h de 25/10/2026). */
  inicioPadrao: number;
  /** O horário foi mudado no admin. */
  adiada: boolean;
  feitaEm: number | null;
  /** Tentativas desde que o horário chegou. */
  tentativas: number;
  ultimaTentativa: number | null;
  proximaTentativa: number | null;
  ultimoErro: string | null;
  /** Aviso público "aguardando os primeiros dados do TSE" no ar. */
  avisoPublico: boolean;
}

/** Métricas do processo (monitor do admin). */
export interface MetricasServidor {
  /** requisições por segundo (média do último minuto) */
  reqPorSeg: number;
  /** tempo de processamento no último minuto fechado (ms) */
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  /** 5xx e 429 no último minuto fechado */
  erros5xx: number;
  respostas429: number;
  /** acerto do cache de respostas montadas no último minuto fechado (0–1) */
  cacheHit: number;
  /** requisições em andamento agora */
  emAndamento: number;
  /** atraso do event loop (p99, ms) nos últimos ~10 s */
  eventLoopP99Ms: number;
  heapMb: number;
  rssMb: number;
  og: { emMemoria: number; mb: number; naFila: number };
  /** cache de respostas (rotas montadas no segundo atual) */
  respostasEmCache: number;
}

export interface ServidorInfo {
  producao: boolean;
  build: BuildInfo;
  /** A fonte 'simulacao' pode ir ao ar? Em produção, só com ALLOW_SIMULACAO=1. */
  simulacao: { permitida: boolean; motivo: string | null };
  trocaAuto: TrocaAutoInfo;
  metricas: MetricasServidor;
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
 * HTTP: query `?t=<epoch>`. Na fonte TSE, só nacional, UF e o mapa nacional por município têm histórico; município,
 * zona e seção respondem o agora.
 */
export interface Instante {
  t?: number;
}

export type { ClockState };
