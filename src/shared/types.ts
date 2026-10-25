/**
 * Contratos compartilhados (isomórficos) entre dados, motor, servidor e app.
 *
 * Regras:
 *  - Este arquivo NÃO importa nada de Node nem do DOM.
 *  - Tempos são sempre epoch ms (UTC). Exibição sempre em horário de Brasília (UTC-3, sem horário de verão).
 *  - Arrays de votos (`votos: number[]`) seguem SEMPRE a ordem de `Race.candidatos` (ordenados pelo número na urna).
 *  - Percentuais seguem a regra do TSE: % de votos válidos = votos do candidato / soma dos votos nominais
 *    (brancos e nulos não entram). Brancos/nulos são % do comparecimento. Abstenção é % do eleitorado.
 */

import type { AnuncioConfig, AnuncioPublico, ContatoAnuncie } from './anuncios';
import type { ContatosPublicos } from './contatos';

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR',
  'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;
/** 27 unidades da federação. */
export type UFBr = (typeof UFS)[number];
/** UF + 'ZZ' (votos no exterior, só para Presidente). */
export type UF = UFBr | 'ZZ';
export type Regiao = 'N' | 'NE' | 'CO' | 'SE' | 'S' | 'EX';

/** 'pres' (Presidente 2º turno), 'gov-df' etc. (Governador 2º turno, UFs de UFS_GOV_2T), 'pres-t1' / 'gov-df-t1' (1º turno, final). */
export type RaceId = string;

/**
 * Cor do candidato na interface.
 *  - 'a' | 'b': slots NEUTROS pela ordem do número na urna (menor número = 'a', turquesa; maior = 'b', âmbar).
 *    Usados nas disputas de governador e na simulação com nomes ocultos (`LiveStatus.anonimizado`).
 *  - 'vermelho' | 'azul': cores de IDENTIFICAÇÃO dos dois candidatos a Presidente (decisão do dono do produto:
 *    Lula em vermelho, Flávio Bolsonaro em azul). Atribuídas SÓ por `CORES_IDENTIDADE` (constants.ts / cores.ts).
 *  - 'outros': cinza neutro do agregado "Outros".
 * A ORDEM dos candidatos nunca se deduz da cor: use o índice em `Race.candidatos` (ordem do número na urna).
 */
export type CorCandidato = 'a' | 'b' | 'vermelho' | 'azul' | 'outros';

export interface Candidate {
  numero: number; // 13
  nomeUrna: string; // "Lula" (capitalização de exibição, não CAIXA ALTA)
  nome: string; // nome completo
  partido: string; // sigla "PT"
  coligacao?: string; // "Brasil Pronto pra Mais"
  composicao?: string; // "PSB / PDT / PCdoB / PT / PV / PSOL / REDE"
  vice?: string; // nome de urna do vice
  cor: CorCandidato;
  /** Resultado no 1º turno na abrangência da disputa (quando disponível). */
  primeiroTurno?: { votos: number; pct: number };
  /** true para o pseudo-candidato "Outros" agregado (só em corridas de 1º turno). */
  agregado?: boolean;
  /** Sequencial do candidato no TSE (ex.: "280002542548"): chave da foto oficial e da ficha (/candidato/:sqcand). */
  sqcand?: string;
  /** Grupo do pacote de fotos em public/data/fotos/{grupo}.json (ver FotoPacote em dataset.ts). */
  fotoGrupo?: string;
}

export interface Race {
  id: RaceId;
  cargo: 'Presidente' | 'Governador';
  turno: 1 | 2;
  /** 'BR' para Presidente; a UF para Governador. */
  abrangencia: 'BR' | UF;
  titulo: string; // "Presidente" | "Governador · Distrito Federal"
  /** Ordenados pelo número na urna (asc). 2º turno: exatamente 2. 1º turno: os 2 que foram ao 2º turno + "Outros". */
  candidatos: Candidate[];
  /** UFs que votam nesta disputa (Presidente: 27 + ZZ). */
  ufs: UF[];
  /** Códigos do feed oficial do TSE. */
  tse: { ciclo: string; eleicao: string; cargo: string; pleito: string };
}

/** Contagem bruta numa abrangência (país, região, UF, município, zona ou seção). */
export interface Tally {
  secoes: number;
  secoesTotalizadas: number;
  /** Eleitores aptos em toda a abrangência. */
  eleitorado: number;
  /** Eleitores aptos apenas nas seções já totalizadas. */
  eleitoradoTotalizado: number;
  /** Comparecimento nas seções totalizadas. */
  comparecimento: number;
  /** Abstenção nas seções totalizadas (= eleitoradoTotalizado - comparecimento). */
  abstencao: number;
  votos: number[];
  brancos: number;
  nulos: number;
}

export type ApuracaoStatus = 'aguardando' | 'apurando' | 'encerrada';

export interface Summary extends Tally {
  status: ApuracaoStatus;
  /** Índice do candidato à frente em votos (null sem votos ou empate exato). */
  lider: number | null;
  /**
   * Índice do candidato eleito/vencedor quando matematicamente definido:
   * diferença entre 1º e 2º > eleitorado ainda não totalizado (regra conservadora, igual à comunicação do TSE),
   * ou apuração encerrada. null caso contrário.
   */
  eleito: number | null;
  /** epoch ms (tempo simulado/oficial) da última seção totalizada nesta abrangência. */
  ultimaAtualizacao: number | null;
}

export interface SeriePoint {
  /** epoch ms */
  t: number;
  /** % de seções totalizadas (0–100) */
  pst: number;
  /** % de votos válidos por candidato (0–100) */
  pv: number[];
}

export type TipoEvento = 'inicio' | 'marco' | 'lideranca' | 'virada' | 'uf-encerrada' | 'eleito' | 'aviso';

export interface FeedEvent {
  id: string;
  /** epoch ms */
  t: number;
  tipo: TipoEvento;
  abrangencia: 'BR' | UF;
  race: RaceId;
  titulo: string; // texto neutro, ex.: "Com 63,2% das seções, Lula passa à frente"
  detalhe?: string;
  /** índice do candidato relacionado, se houver */
  candidato?: number;
}

/** Análise do que falta apurar (neutra, só matemática). */
export interface Restante {
  /** Eleitores aptos em seções não totalizadas. */
  eleitorado: number;
  /** Estimativa de votos válidos restantes (eleitorado restante × taxa de válidos observada). */
  validosEstimados: number;
  /** % dos válidos restantes de que quem está atrás precisa para virar (null se impossível estimar ou já eleito). */
  necessarioParaVirar: number | null;
}

export interface NationalSnapshot {
  race: RaceId;
  geradoEm: number; // relógio de parede
  simNow: number; // relógio da apuração (simulado ou oficial)
  resumo: Summary;
  ufs: Partial<Record<UF, Summary>>;
  regioes: Partial<Record<Regiao, Summary>>;
  serie: SeriePoint[];
  eventos: FeedEvent[]; // mais recentes primeiro (máx. 60)
  restante: Restante;
}

export interface MunicipioResumo extends Summary {
  cod: string; // código TSE (5 dígitos, string com zeros à esquerda)
  ibge: string; // código IBGE (7 dígitos); '' no exterior
  nome: string; // capitalização de exibição ("São Paulo")
  capital: boolean;
}

export interface UfSnapshot {
  race: RaceId;
  uf: UF;
  geradoEm: number;
  simNow: number;
  resumo: Summary;
  municipios: MunicipioResumo[];
  serie: SeriePoint[];
  eventos: FeedEvent[];
  restante: Restante;
}

export interface ZonaResumo extends Summary {
  zona: number;
}

/**
 * Mosaico compacto das seções de uma zona.
 * `faixas`: números das seções em ordem, codificados em faixas: "1-120,135,140-160".
 * `estado`: 1 caractere por seção, na mesma ordem:
 *   '0' = não totalizada
 *   'a'..'d' = candidato 0 vence a seção, margem em buckets (<5pp, 5–15, 15–30, ≥30)
 *   'e'..'h' = candidato 1 vence, mesmos buckets
 *   'x' = empate · 'z' = totalizada sem votos válidos
 *   't' = totalizada, vencedor não informado (fonte TSE ao vivo: só o status da seção é conhecido)
 */
export interface ZonaMosaico {
  zona: number;
  faixas: string;
  estado: string;
}

export interface PrimeiroTurnoLocal {
  /** Votos por candidato da corrida de 1º turno correspondente (mesma ordem de `Race.candidatos` da corrida -t1). */
  votos: number[];
  brancos: number;
  nulos: number;
  comparecimento: number;
  eleitorado: number;
}

export interface MunicipioSnapshot {
  race: RaceId;
  uf: UF;
  cod: string;
  ibge: string;
  nome: string;
  capital: boolean;
  geradoEm: number;
  simNow: number;
  resumo: Summary;
  zonas: ZonaResumo[];
  mosaico: ZonaMosaico[];
  /** Resultado do 1º turno neste município (mesma disputa: pres → pres-t1; gov-xx → gov-xx-t1). */
  primeiroTurno: PrimeiroTurnoLocal | null;
}

/** Local de votação de uma seção (public/data/locais/{uf}.json — ver LocalVotacao em dataset.ts). */
export interface LocalResumo {
  nome: string; // "Escola Estadual Fulano de Tal"
  endereco: string;
  bairro?: string;
  lat?: number;
  lon?: number;
}

export interface SecaoResumo {
  secao: number;
  totalizada: boolean;
  totalizadaEm: number | null;
  aptos: number;
  comparecimento: number;
  votos: number[];
  brancos: number;
  nulos: number;
  /** Local de votação (quando o arquivo de locais da UF está disponível). Opcional, retrocompatível. */
  local?: LocalResumo;
}

export interface ZonaSnapshot {
  race: RaceId;
  uf: UF;
  cod: string;
  nomeMunicipio: string;
  zona: number;
  geradoEm: number;
  simNow: number;
  resumo: Summary;
  secoes: SecaoResumo[];
}

/** "Boletim de Urna" de uma seção. */
export interface SecaoDetalhe extends SecaoResumo {
  race: RaceId;
  uf: UF;
  cod: string;
  nomeMunicipio: string;
  zona: number;
  abstencao: number;
  /** Código de identificação exibido no cartão (determinístico; na simulação é fictício). */
  codigoIdentificacao: string;
  simulado: boolean;
}

export type FonteDados = 'pre' | 'simulacao' | 'tse';
export type Fase = 'pre' | 'apurando' | 'encerrada';

export interface Aviso {
  nivel: 'info' | 'alerta';
  texto: string;
}

/** Estado público e leve, consultado a cada poucos segundos por todos os clientes. */
export interface LiveStatus {
  fonte: FonteDados;
  fase: Fase;
  simNow: number;
  wallNow: number;
  /** Início oficial da divulgação (17h de Brasília em 25/10/2026). */
  inicioApuracao: number;
  velocidade: number;
  pausado: boolean;
  aviso: Aviso | null;
  /** Incrementa a cada mudança de configuração feita no admin → clientes invalidam caches. */
  versao: number;
  races: RaceId[];
  /** true quando os números exibidos são simulados (o app mostra a faixa "SIMULAÇÃO"). */
  simulacao: boolean;
  /** Dados congelados (simula instabilidade do TSE: números param de atualizar). */
  congelado: boolean;
  /**
   * true quando a simulação está com os nomes dos candidatos ocultos ("Candidato A/B"). Padrão na simulação,
   * para que prints de números fictícios nunca circulem associados a candidatos reais. Ver `useRace()`.
   */
  anonimizado?: boolean;
  /** Visitantes ativos estimados agora (só no servidor; ausente no demo — nunca inventar número). */
  pessoasAgora?: number;
  /** Patrocínio exibido no site (anunciante NÃO político), configurado no admin. LEGADO: derivado do anúncio master. */
  patrocinio?: Patrocinio | null;
  /** Anúncios no ar (ativos e dentro da janela), com os formatos de cada um — src/shared/anuncios.ts. */
  anuncios?: AnuncioPublico[];
  /** Interruptor geral do painel ligado: nenhum anúncio no ar (nem o "Anuncie no Sintonia"). */
  anunciosSuspensos?: true;
  /** Contato da página /anuncie (configurado no admin). */
  anuncie?: ContatoAnuncie | null;
  /**
   * Contatos públicos (geral, privacidade, imprensa, correções) e o responsável pelo site — painel → Comunicação.
   * Opcional: ausente/null = nenhum contato configurado (o site não mostra e-mail nenhum).
   */
  contatos?: ContatosPublicos | null;
  /**
   * Frescor do feed oficial por disputa do 2º turno (só na fonte 'tse', no servidor; ausente no demo e nas outras fontes).
   * O app reconsulta o placar assim que a `marca` muda, sem esperar o próximo ciclo de consulta.
   */
  frescor?: Partial<Record<RaceId, FrescorCorrida>>;
  /**
   * Freio de carga do painel (I37, "Chaves da noite" → comando 'freio'): o app multiplica os intervalos de consulta
   * (placar e status) por `fator`; com `leve`, para o mapa municipal e o "desde o 1º turno" e espaça o chat.
   * AUSENTE = normal (fator 1, sem leve): o motor só manda quando o freio está puxado. Cliente antigo ignora.
   */
  carga?: CargaStatus;
  /**
   * Chave 'faixa-conexao' DESLIGADA no painel (leva 3): o app não mostra a faixa "Conexão instável" (o recuo do status
   * continua). AUSENTE = ligada (padrão). Cliente antigo ignora.
   */
  semFaixaConexao?: true;
  /**
   * Chave 'carimbo-print' DESLIGADA no painel (I10): mapas e placar sem o carimbo "domínio · % apurado · hora".
   * AUSENTE = ligado (padrão). Cliente antigo ignora.
   */
  semCarimbo?: true;
}

/** Frescor dos números de uma disputa na fonte 'tse' (ver `LiveStatus.frescor`). */
export interface FrescorCorrida {
  /** Identifica os números atuais da disputa (hash do conteúdo): muda quando o TSE publica dado novo. */
  marca: string;
  /** Última leitura bem-sucedida (200 ou 304) do arquivo principal da disputa no TSE (epoch ms, relógio do servidor). */
  conferidoEm: number | null;
  /**
   * I18: o arquivo NACIONAL desta disputa não muda desde este instante (epoch ms) enquanto os estados avançam — o app
   * mostra o aviso factual "o arquivo nacional do TSE não atualiza desde HH:MM · veja os estados". Ausente = normal, ou
   * chave 'aviso-nacional' em 'off'. Opcional (leva 3).
   */
  nacionalParadoDesde?: number;
  /**
   * I03: o TSE está limitando as leituras (429, 403 da borda dele, ou 403 num arquivo que já deu 200); o servidor pausou
   * e tenta de novo neste instante (epoch ms). Ausente = sem bloqueio. Opcional (leva 3).
   */
  tseBloqueadoAte?: number;
  /**
   * I36 (reserva): instante (epoch ms) em que o TSE gerou os números atuais (data/hora de geração do arquivo), para o selo
   * "chegou X s depois do TSE". Ausente = desconhecido. Opcional (leva 3).
   */
  geradoEm?: number;
}

/** Freio de carga (I37): por quanto o app multiplica os intervalos de consulta. 1 = normal. */
export type FatorCarga = 1 | 2 | 3 | 5;

/** Carga pedida pelo painel, como vai ao site (`LiveStatus.carga`). */
export interface CargaStatus {
  fator: FatorCarga;
  /** modo leve: o mapa municipal e o "desde o 1º turno" param; o chat fica 2× mais espaçado */
  leve?: boolean;
}

/** Aviso do arquivo nacional parado (I18): 'auto' = o servidor detecta e o app avisa; 'off' = nunca avisa. */
export type ModoAvisoNacional = 'auto' | 'off';

/**
 * Pausa das leituras quando o TSE limita (I03, chave 'pausa-tse'):
 *  - 'auto' (padrão): pausa com 429, 403 da borda do TSE (Akamai / "Access Denied") ou 403 num arquivo que já deu 200;
 *  - 'restrita': só com sinal claro (429 ou 403 da borda do TSE) — o "403 num arquivo já lido" volta a ser "ausente";
 *  - 'off': nunca pausa (como antes da leva 3): 429 vira erro comum e 403 vira "ausente". Risco maior de bloqueio.
 */
export type ModoPausaTse = 'auto' | 'restrita' | 'off';

/**
 * "Chaves da noite" (painel → Controle e `deploy/painel.sh`): interruptores operacionais da noite, gravados no
 * AdminState — valem para todas as instâncias (admin.json) e sobrevivem a reinícios. No servidor, mudar uma chave NÃO
 * incrementa `AdminState.versao` (não invalida o cache dos visitantes nem as ETags; no demo incrementa). Padrões em `CHAVES_NOITE_PADRAO`
 * (src/shared/chaves-noite.ts); leia sempre por `chavesNoite(state)` (estado antigo sem o campo = padrões).
 */
export interface ChavesNoite {
  /** I37 ('freio'): fator 1 e leve false = normal. Vai ao site como `LiveStatus.carga` (só quando puxado). */
  freio: { fator: FatorCarga; leve: boolean };
  /** I09 ('contador-publico'): "N pessoas agora" no site (só a partir de PISO_PESSOAS_PUBLICO). O painel vê sempre. */
  contadorPublico: boolean;
  /** I05 ('html-borda'): HTML guardado na borda (Cloudflare-CDN-Cache-Control). Liga só depois do ensaio. */
  htmlBorda: boolean;
  /** I11 ('medir-anuncios'): contar impressões visíveis (POST /api/anuncio/evento). false = 204 sem contar. */
  medirAnuncios: boolean;
  /** I18 ('aviso-nacional'): aviso do arquivo nacional parado (`FrescorCorrida.nacionalParadoDesde`). */
  avisoNacional: ModoAvisoNacional;
  /** I22 ('texto-bots'): texto do placar para bots de chat (/api/texto/placar). false = só o endereço do site. */
  textoBots: boolean;
  /** I23 ('contar-lives'): contagem anônima de lives (POST /api/live/batimento). false = 204 sem contar. */
  contarLives: boolean;
  /**
   * I05 cliente ('faixa-conexao'): faixa "Conexão instável — mostrando o último dado recebido às HH:MM:SS". false = o app
   * não mostra a faixa (vai ao site como `LiveStatus.semFaixaConexao`; o recuo do status continua). Leva 3, integração.
   */
  faixaConexao: boolean;
  /** I10 ('carimbo-print'): carimbo do print nos mapas e no placar. false = `LiveStatus.semCarimbo` (sem carimbo). */
  carimboPrint: boolean;
  /** I07a ('meta-placar'): placar da fonte TSE na descrição das prévias de link. false = descrições sem placar. */
  metaPlacar: boolean;
  /**
   * I14 ('medir-local'): contar páginas por estado, país e aparelho (cabeçalhos da Cloudflare). false = não conta
   * (curva, horas de tela e o resto da audiência seguem). `AUDIENCIA_LOCAL=0` no ambiente também desliga.
   */
  medirLocal: boolean;
  /** I03 ('pausa-tse'): quando o servidor pausa as leituras do TSE por bloqueio (ver `ModoPausaTse`). */
  pausaTse: ModoPausaTse;
  /**
   * 'projecao': "Projeção do Sintonia" (src/shared/projecao.ts; GET /api/apuracao/:race/(br|:uf)/projecao). false = o
   * servidor responde `disponivel: false, motivo: 'desligada'` e o app não mostra nada. Estado salvo sem o campo = ligada.
   */
  projecao: boolean;
}

/** Patrocínio/anúncio institucional (nunca político — ARCHITECTURE §1.5). */
export interface Patrocinio {
  marca: string;
  texto: string;
  url: string;
  /** data URI ou URL https da logo (opcional) */
  imagem?: string;
}

// ---------------------------------------------------------------------------------------------
// Configuração da simulação / admin
// ---------------------------------------------------------------------------------------------

export type Ritmo = 'rapido' | 'normal' | 'lento';
export type OrdemRegional = 'realista' | 'aleatoria' | 'norte-primeiro' | 'sul-primeiro';

export interface ScenarioConfig {
  preset: string;
  seed: number;
  /** Alvo nacional: % de votos válidos do candidato índice 0 da corrida 'pres' (ex.: 50.6). */
  alvoPres: number;
  /** Alvo por corrida de governador: % de válidos do candidato índice 0. Ex.: { 'gov-df': 48.2 } */
  alvoGov: Record<RaceId, number>;
  /** 0–1: fração dos eleitores dos demais candidatos do 1º turno que migra para o candidato 0 (antes da calibragem). */
  transferenciaOutros: number;
  /** 0–1.5: quanto da geografia do 1º turno se mantém (1 = igual ao 1º turno; 0 = país uniforme). */
  intensidadeRegional: number;
  /** Desvio (em logit) do ruído por seção. 0.05–0.6 */
  ruidoSecao: number;
  /** Variação do comparecimento vs 1º turno, em pontos percentuais (ex.: -1.5). */
  comparecimentoDelta: number;
  /** Multiplicadores das taxas de brancos/nulos vs 1º turno. */
  brancosFator: number;
  nulosFator: number;
  ritmo: Ritmo;
  ordemRegional: OrdemRegional;
  /** Viés em pontos percentuais a favor do candidato 0 (positivo) ou 1 (negativo), por UF, na corrida 'pres'. */
  ufVies: Partial<Record<UF, number>>;
  /** Atraso extra (minutos) na totalização de uma UF. */
  ufAtraso: Partial<Record<UF, number>>;
}

/** simNow = ancoraSim + (rodando ? (wallNow - ancoraWall) * velocidade : 0) */
export interface ClockState {
  rodando: boolean;
  velocidade: number;
  ancoraWall: number;
  ancoraSim: number;
}

export interface TseConfig {
  baseUrl: string; // https://resultados.tse.jus.br/oficial
  ciclo: string; // ele2026
  eleicaoPres: string; // 6258
  eleicaoGov: string; // 6260
  pleito: string; // 3221
  intervaloSeg: number; // 15
  /**
   * Intervalo (s) do arquivo prioritário: o resumo nacional de Presidente (o menor e o mais olhado), consultado à parte
   * com requisição condicional. Padrão 5 (3–600). Igual ou maior que `intervaloSeg` = sem consulta à parte.
   * Opcional por compatibilidade com estados salvos antes (ausente = padrão).
   */
  intervaloPrioritarioSeg?: number; // 5
  /**
   * I03: teto de pedidos por segundo ao TSE (balde de fichas global, com fatia reservada para BR e UF). Padrão e faixa em
   * `TSE_LIMITE_POR_SEG` (constants.ts: 40; 5–90). Opcional por compatibilidade com estados salvos antes (ausente =
   * padrão).
   */
  limitePorSeg?: number; // 40
}

export interface AdminState {
  fonte: FonteDados;
  relogio: ClockState;
  cenario: ScenarioConfig;
  aviso: Aviso | null;
  congelado: boolean;
  /** simNow congelado quando `congelado` = true */
  congeladoEm: number | null;
  versao: number;
  tse: TseConfig;
  /** Mostrar os nomes reais dos candidatos durante a SIMULAÇÃO (padrão false = "Candidato A/B"). Uso interno. */
  nomesReais?: boolean;
  /** Patrocínio ativo (null/ausente = nenhum). LEGADO: no carregamento vira um anúncio (ver `anuncios`). */
  patrocinio?: Patrocinio | null;
  /** Anunciantes cadastrados (src/shared/anuncios.ts). */
  anuncios?: AnuncioConfig[];
  /** Interruptor geral: desde quando e por quê. null/ausente = anúncios normais. */
  anunciosSuspensos?: { desde: number; motivo?: string } | null;
  /** Contato da página /anuncie. */
  anuncie?: ContatoAnuncie | null;
  /** Contatos públicos e responsável pelo site (src/shared/contatos.ts). Ausente = nenhum. */
  contatos?: ContatosPublicos | null;
  /** Troca automática 'pre' → 'tse' no início da apuração (ausente = padrão: ligada, horário do servidor). */
  trocaAuto?: TrocaAutoEstado;
  /** "Chaves da noite" (leva 3). Ausente (estado salvo antes) = `CHAVES_NOITE_PADRAO`; leia por `chavesNoite(state)`. */
  noite?: ChavesNoite;
}

/**
 * Troca automática da fonte 'pre' → 'tse' no início da apuração. O SERVIDOR executa (TSE_AUTO, TSE_INICIO; ver
 * src/server/troca-auto.ts); o estado guarda só as escolhas do admin, para valer em todas as instâncias e depois de
 * reinícios. O demo ignora.
 */
export interface TrocaAutoEstado {
  /** false = desligada pelo admin. */
  ligada: boolean;
  /** Horário escolhido no admin (epoch ms) no lugar do padrão do servidor; null = padrão (TSE_INICIO ou 17h de 25/10). */
  adiadaPara: number | null;
  /** Quando a troca foi feita (automática, ou a fonte mudada à mão depois do horário); null = ainda não. */
  feitaEm: number | null;
}

/**
 * Mapa nacional por município (5.571 municípios) — arrays alinhados com `MunicipiosBr.ordem`
 * (public/data/municipios-br.json). Inteiros para payload compacto.
 */
export interface MunicipiosNacionalSnapshot {
  race: RaceId;
  geradoEm: number;
  simNow: number;
  /** -1 sem votos válidos · 0/1 índice do candidato à frente · 2 empate */
  lider: number[];
  /** diferença entre os dois primeiros em p.p. × 10 */
  margem: number[];
  /** % de seções totalizadas × 10 */
  apurado: number[];
  /** % de comparecimento (sobre o eleitorado apurado) × 10 */
  comparecimento: number[];
  /** % de votos válidos do candidato 0 × 100 */
  pct0: number[];
  /** nº de municípios em que cada candidato está à frente (índice = candidato) */
  municipiosLiderados: number[];
}

export interface PresetInfo {
  id: string;
  nome: string;
  descricao: string;
  cenario: Partial<ScenarioConfig>;
}

export interface AdminMetrics {
  uptimeSeg: number;
  requisicoesUltimoMinuto: number;
  clientesAtivosEstimados: number;
  ultimoCalculoMs: number;
  modeloConstruidoEm: number | null;
  modeloMs: number | null;
  secoesModeladas: number;
  memoriaMb: number;
  log: { t: number; msg: string }[];
}
