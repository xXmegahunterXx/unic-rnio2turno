/**
 * Audiência própria e "Siga o Sintonia" — contrato isomórfico (servidor, app e admin). ARCHITECTURE §11.12.
 *
 * Medição só AGREGADA e sem dado pessoal (LGPD):
 *  - o app manda um sinal leve (`POST /api/audiencia`) a cada página vista — só o GRUPO da rota (nunca o caminho, a query
 *    string ou o código de um Duelo) e, na 1ª página da aba, a ORIGEM resumida (família da rede social, buscador ou o
 *    domínio registrável de quem mandou o link; nunca a URL de origem) — e um sinal de presença enquanto a aba está
 *    visível (intervalo decidido pelo servidor conforme a carga);
 *  - o servidor guarda só contagens: páginas por dia, grupo e hora, entradas por origem, visitantes únicos estimados por
 *    dia (chave = hash da rede + navegador com um sal DIÁRIO que nunca é gravado e é trocado à meia-noite; só a contagem
 *    sobrevive) e o pico de pessoas ao mesmo tempo, com data e hora.
 *
 * Nada de opinião política: o Teste Cego continua 100% no aparelho; o sinal diz só "alguém viu uma página do grupo X".
 */

// ---- grupos de rota -----------------------------------------------------------------------------------------------

export const GRUPOS_ROTA = [
  'inicio',
  'apuracao',
  'consulta',
  'governadores',
  'teste',
  'duelo',
  'curiosidades',
  'cenarios',
  'cargos',
  'ao-vivo',
  'tv',
  'streamers',
  'anuncie',
  'institucional',
  'outras',
  'widgets',
  'live',
] as const;
export type GrupoRota = (typeof GRUPOS_ROTA)[number];

export const ROTULO_GRUPO: Record<GrupoRota, string> = {
  inicio: 'Página inicial',
  apuracao: 'Apuração',
  consulta: 'Consulte sua seção',
  governadores: 'Governadores',
  teste: 'Teste Cego',
  duelo: 'Duelo',
  curiosidades: 'Curiosidades',
  cenarios: 'E se…? (cenários)',
  cargos: 'Cargos do 1º turno',
  'ao-vivo': 'Sala da apuração',
  tv: 'Modo TV',
  streamers: 'Para streamers',
  anuncie: 'Anuncie',
  institucional: 'Institucionais',
  outras: 'Outras páginas',
  widgets: 'Widgets em outros sites',
  live: 'Modo streamer (OBS)',
};

/**
 * Grupos que não são uma pessoa no Sintonia: o widget aparece dentro de outro site e a /live é uma fonte do OBS. Contam
 * como visualização do grupo, mas ficam FORA das páginas vistas, dos visitantes únicos e das pessoas ao mesmo tempo.
 */
export const GRUPOS_FORA_DE_PESSOAS: readonly GrupoRota[] = ['widgets', 'live'];

export const ehGrupoRota = (v: unknown): v is GrupoRota => typeof v === 'string' && (GRUPOS_ROTA as readonly string[]).includes(v);

/** Grupo de um caminho do app; `null` = não conta (painel, vitrine /kit). Só o caminho (query e hash são ignorados). */
export function grupoDaRota(pathname: string): GrupoRota | null {
  const p = (pathname.split(/[?#]/)[0] || '/').toLowerCase().replace(/\/+$/, '') || '/';
  if (/^\/(admin|kit)(\/|$)/.test(p)) return null;
  if (p === '/') return 'inicio';
  if (p === '/apuracao/consulta') return 'consulta';
  if (p === '/apuracao' || p.startsWith('/apuracao/')) return 'apuracao';
  if (p === '/governadores') return 'governadores';
  if (p === '/teste' || p.startsWith('/teste/')) return 'teste';
  if (p === '/duelo' || p.startsWith('/duelo/')) return 'duelo';
  if (p === '/curiosidades') return 'curiosidades';
  if (p === '/cenarios') return 'cenarios';
  if (/^\/(senado|camara|assembleias|candidato)(\/|$)/.test(p)) return 'cargos';
  if (p === '/ao-vivo') return 'ao-vivo';
  if (p === '/tv') return 'tv';
  if (p === '/streamers') return 'streamers';
  if (p === '/anuncie') return 'anuncie';
  if (/^\/(metodologia|privacidade|sobre)$/.test(p)) return 'institucional';
  if (p.startsWith('/embed/')) return 'widgets';
  if (p === '/live') return 'live';
  return 'outras';
}

// ---- origens ------------------------------------------------------------------------------------------------------

export const ORIGENS = [
  'direto',
  'x',
  'whatsapp',
  'instagram',
  'facebook',
  'threads',
  'tiktok',
  'youtube',
  'twitch',
  'kick',
  'telegram',
  'discord',
  'reddit',
  'linkedin',
  'bluesky',
  'google',
  'bing',
  'outras-buscas',
  'outros',
] as const;
export type OrigemConhecida = (typeof ORIGENS)[number];

export const ROTULO_ORIGEM: Record<OrigemConhecida, string> = {
  direto: 'Direto ou app sem origem',
  x: 'X (Twitter)',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  threads: 'Threads',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitch: 'Twitch',
  kick: 'Kick',
  telegram: 'Telegram',
  discord: 'Discord',
  reddit: 'Reddit',
  linkedin: 'LinkedIn',
  bluesky: 'Bluesky',
  google: 'Google',
  bing: 'Bing',
  'outras-buscas': 'Outros buscadores',
  outros: 'Outros sites',
};

/** Domínio (sem www) → família conhecida. */
const FAMILIAS: [RegExp, OrigemConhecida][] = [
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, 'x'],
  [/(^|\.)(whatsapp\.com|whatsapp\.net|wa\.me)$/, 'whatsapp'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, 'youtube'],
  [/(^|\.)twitch\.tv$/, 'twitch'],
  [/(^|\.)kick\.com$/, 'kick'],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, 'telegram'],
  [/(^|\.)(discord\.com|discordapp\.com|discord\.gg)$/, 'discord'],
  [/(^|\.)(reddit\.com|redd\.it)$/, 'reddit'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
  [/(^|\.)bsky\.app$/, 'bluesky'],
  [/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)(duckduckgo\.com|yahoo\.com|search\.brave\.com|ecosia\.org|yandex\.[a-z]{2,3}|baidu\.com|qwant\.com)$/, 'outras-buscas'],
];

/** Pacote de app Android (referrer `android-app://…`) → família. */
const APPS: [RegExp, OrigemConhecida][] = [
  [/^com\.twitter\.android/, 'x'],
  [/^com\.whatsapp/, 'whatsapp'],
  [/^com\.instagram\./, 'instagram'],
  [/^com\.facebook\./, 'facebook'],
  [/^com\.zhiliaoapp\.musically|^com\.ss\.android\.ugc/, 'tiktok'],
  [/^com\.google\.android\.youtube/, 'youtube'],
  [/^tv\.twitch\./, 'twitch'],
  [/^org\.telegram\./, 'telegram'],
  [/^com\.discord/, 'discord'],
  [/^com\.reddit\./, 'reddit'],
  [/^com\.linkedin\./, 'linkedin'],
  [/^com\.google\.android\.(googlequicksearchbox|gm)|^com\.android\.chrome/, 'google'],
];

/** `utm_source` comum → família. */
const UTM: [RegExp, OrigemConhecida][] = [
  [/^(x|twitter|tw|x\.com|t\.co)$/, 'x'],
  [/^(whatsapp|wa|zap|wpp|whats)$/, 'whatsapp'],
  [/^(instagram|ig|insta)$/, 'instagram'],
  [/^(facebook|fb|meta)$/, 'facebook'],
  [/^threads$/, 'threads'],
  [/^(tiktok|tt)$/, 'tiktok'],
  [/^(youtube|yt)$/, 'youtube'],
  [/^twitch$/, 'twitch'],
  [/^kick$/, 'kick'],
  [/^(telegram|tg)$/, 'telegram'],
  [/^discord$/, 'discord'],
  [/^reddit$/, 'reddit'],
  [/^linkedin$/, 'linkedin'],
  [/^(bluesky|bsky)$/, 'bluesky'],
  [/^google$/, 'google'],
];

/** Sufixos de 2º nível comuns (com.br, gov.br, co.uk…): o domínio registrável tem 3 rótulos. */
const SEGUNDO_NIVEL = /^(com|net|org|gov|edu|art|blog|jus|leg|mil|mp|tv|eco|nom|coop|ind|inf|srv|tur|wiki|co|ac|ne|or|go)$/;

/** "noticias.exemplo.com.br" → "exemplo.com.br"; "joao.blogspot.com" → "blogspot.com". `null` se não parece domínio. */
export function dominioRegistravel(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  if (!h || h.length > 253 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) return null;
  if (/^\d+(\.\d+){3}$/.test(h)) return null; // IP
  const r = h.split('.');
  const tld = r[r.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld)) return null;
  const n = r.length >= 3 && tld.length === 2 && SEGUNDO_NIVEL.test(r[r.length - 2]) ? 3 : 2;
  const d = r.slice(-n).join('.');
  return d.length <= 60 ? d : null;
}

/** Família conhecida de um domínio, ou o domínio registrável; `outros` quando nem isso. */
export function origemDoHost(host: string): string {
  const h = host.trim().toLowerCase().replace(/^www\./, '');
  for (const [re, o] of FAMILIAS) if (re.test(h)) return o;
  return dominioRegistravel(h) ?? 'outros';
}

/** `utm_source` → família conhecida ou "utm:<valor>" (minúsculas, até 30 de [a-z0-9._-]); null se vazio/inválido. */
export function origemDoUtm(v: string | null | undefined): string | null {
  const s = (v ?? '').trim().toLowerCase();
  if (!s) return null;
  for (const [re, o] of UTM) if (re.test(s)) return o;
  return /^[a-z0-9._-]{1,30}$/.test(s) ? `utm:${s}` : null;
}

/**
 * Origem da ENTRADA (1ª página da aba): `utm_source` do endereço, se houver; senão a família/domínio do referrer;
 * 'direto' sem referrer. `null` = veio do próprio site (não é entrada). Só o domínio sai daqui, nunca a URL.
 */
export function origemDaEntrada(referrer: string | null | undefined, utmSource: string | null | undefined, hostAtual: string): string | null {
  const utm = origemDoUtm(utmSource);
  if (utm) return utm;
  if (!referrer) return 'direto';
  let u: URL;
  try {
    u = new URL(referrer);
  } catch {
    return 'direto';
  }
  if (u.protocol === 'android-app:') {
    const pkg = u.hostname.toLowerCase();
    for (const [re, o] of APPS) if (re.test(pkg)) return o;
    return 'outros';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'direto';
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === hostAtual.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')) return null;
  return origemDoHost(host);
}

/** Origem recebida do app, revalidada no servidor: família conhecida, "utm:x" ou domínio (reclassificado). */
export function normalizarOrigem(v: unknown): string | null {
  if (typeof v !== 'string' || !v || v.length > 64) return null;
  const s = v.toLowerCase();
  if ((ORIGENS as readonly string[]).includes(s)) return s;
  if (s.startsWith('utm:')) return /^utm:[a-z0-9._-]{1,30}$/.test(s) ? s : null;
  const d = dominioRegistravel(s);
  return d ? origemDoHost(d) : null;
}

/** Rótulo de uma origem para o painel. */
export function rotuloOrigem(o: string): string {
  if ((ORIGENS as readonly string[]).includes(o)) return ROTULO_ORIGEM[o as OrigemConhecida];
  if (o.startsWith('utm:')) return `Campanha “${o.slice(4)}”`;
  return o;
}

// ---- sinal (beacon) ------------------------------------------------------------------------------------------------

/** Corpo do `POST /api/audiencia`: página vista (`g`, + `o` na entrada) ou presença (`p: 1` + `g` da página aberta). */
export interface SinalAudiencia {
  g?: GrupoRota;
  o?: string;
  p?: 1;
}

/** Resposta: próximo sinal de presença em `s` segundos (o servidor aumenta com a carga). */
export interface RespostaSinal {
  s: number;
}

export const AUDIENCIA = {
  /** intervalo do sinal de presença (s), por faixa de pessoas ao mesmo tempo */
  intervalos: [
    { ate: 15_000, s: 60 },
    { ate: 50_000, s: 120 },
    { ate: 100_000, s: 180 },
    { ate: Infinity, s: 240 },
  ],
  /** folga da janela de presença além do intervalo (s) */
  folgaS: 60,
  /** dias guardados no arquivo */
  maxDias: 400,
  /** horas no detalhe */
  horas: 48,
  /** origens distintas guardadas por dia (o resto vai para "outros") */
  maxOrigensDia: 300,
} as const;

export const intervaloPresenca = (pessoas: number): number => AUDIENCIA.intervalos.find((f) => pessoas < f.ate)?.s ?? 240;

// ---- números ------------------------------------------------------------------------------------------------------

/** Concentração da presença: redes distintas e a fração das marcas de cada uma das 10 maiores (0–1, decrescente). */
export interface ConcentracaoAudiencia {
  redes: number;
  top: number[];
}

export interface PicoAudiencia {
  valor: number;
  em: number;
  /**
   * De onde veio o valor. Desde out/2026 só 'sinal' (presença das páginas: atravessa a CDN e exige navegador); 'servidor'
   * (o "pessoas agora" da origem, inflável por um único host) não entra mais no pico e é descartado ao ler o arquivo.
   */
  fonte: 'sinal' | 'servidor';
  /** concentração no instante do pico (para conferir antes de vender) */
  concentracao?: ConcentracaoAudiencia;
}

export interface DiaAudiencia {
  /** "2026-10-25" (Brasília) */
  dia: string;
  /** visitantes únicos estimados (pessoas = rede + navegador; conservador) */
  unicos: number;
  /** páginas vistas por pessoas (sem widgets e /live) */
  paginas: number;
  /** entradas (1ª página da aba) com origem conhecida ou "direto" */
  entradas: number;
  porGrupo: Partial<Record<GrupoRota, number>>;
  origens: Record<string, number>;
  pico: PicoAudiencia | null;
  /** reinícios do servidor no dia (únicos contados pelo maior trecho) */
  reinicios: number;
}

export interface HoraAudiencia {
  /** epoch ms do início da hora */
  hora: number;
  paginas: number;
  pico: number;
}

/** O que a página /anuncie mostra (só com o interruptor do painel ligado). */
export interface AudienciaPublica {
  /** início da medição (epoch ms) */
  desde: number;
  pico: { valor: number; em: number } | null;
  maiorDia: { dia: string; unicos: number } | null;
  /** páginas vistas por pessoas desde `desde` */
  paginas: number;
}

export interface AudienciaAdmin {
  /**
   * `pessoas` = `sinal` (o número comercial); `servidor` = estimativa da origem (só referência: inflável e cega atrás da
   * CDN); `concentracao` = as redes agora.
   */
  agora: { pessoas: number; sinal: number; servidor: number; intervaloS: number; em: number; concentracao?: ConcentracaoAudiencia };
  desde: number | null;
  pico: PicoAudiencia | null;
  /** mais recente por último */
  dias: DiaAudiencia[];
  /** últimas 48 h, da mais antiga para a mais recente (horas sem nada = zeros) */
  horas: HoraAudiencia[];
  /** o que /anuncie mostraria agora (null = sem dados) */
  publico: AudienciaPublica | null;
}

/** "2026-10-25" em Brasília (UTC−3, sem horário de verão). */
export function diaBrasilia(ms: number): string {
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);
}

/** "25/10/2026" a partir de "2026-10-25". */
export function fmtDia(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

// ---- "Siga o Sintonia" -------------------------------------------------------------------------------------------

export const REDES = ['x', 'instagram', 'tiktok', 'whatsapp', 'telegram', 'youtube'] as const;
export type RedeSintonia = (typeof REDES)[number];
export type RedesSintonia = Partial<Record<RedeSintonia, string>>;

export const ROTULO_REDE: Record<RedeSintonia, string> = {
  x: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'Canal no WhatsApp',
  telegram: 'Telegram',
  youtube: 'YouTube',
};

export const EXEMPLO_REDE: Record<RedeSintonia, string> = {
  x: 'https://x.com/sintonia',
  instagram: 'https://instagram.com/sintonia',
  tiktok: 'https://tiktok.com/@sintonia',
  whatsapp: 'https://whatsapp.com/channel/…',
  telegram: 'https://t.me/sintonia',
  youtube: 'https://youtube.com/@sintonia',
};

/** Domínios aceitos em cada rede (com ou sem subdomínio, ex.: www., m.). */
const HOSTS_REDE: Record<RedeSintonia, RegExp> = {
  x: /(^|\.)(x\.com|twitter\.com)$/,
  instagram: /(^|\.)instagram\.com$/,
  tiktok: /(^|\.)tiktok\.com$/,
  whatsapp: /(^|\.)(whatsapp\.com|wa\.me)$/,
  telegram: /(^|\.)(t\.me|telegram\.me)$/,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/,
};

export const MAX_URL_REDE = 200;

/** Link de uma rede: https, sem usuário/senha, no domínio da própria rede e com um caminho (o perfil). */
export function urlRedeValida(rede: RedeSintonia, v: string): boolean {
  if (!v || v.length > MAX_URL_REDE || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && HOSTS_REDE[rede].test(u.hostname.toLowerCase()) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Valida as redes do painel (todas opcionais; vazio = não aparece). */
export function validaRedes(v: unknown): { ok: RedesSintonia } | { erro: string; rede?: RedeSintonia } {
  if (v === null || v === undefined) return { ok: {} };
  if (typeof v !== 'object' || Array.isArray(v)) return { erro: 'Redes inválidas.' };
  const o = v as Record<string, unknown>;
  const out: RedesSintonia = {};
  for (const r of REDES) {
    const x = o[r];
    if (x === undefined || x === null || x === '') continue;
    if (typeof x !== 'string') return { erro: `${ROTULO_REDE[r]}: endereço inválido.`, rede: r };
    const s = x.trim();
    if (!s) continue;
    if (!urlRedeValida(r, s)) return { erro: `${ROTULO_REDE[r]}: use um endereço https:// do próprio ${ROTULO_REDE[r].replace('Canal no ', '')} (ex.: ${EXEMPLO_REDE[r]}).`, rede: r };
    out[r] = s;
  }
  return { ok: out };
}

/** Redes configuradas, na ordem de exibição. */
export const redesAtivas = (r: RedesSintonia | null | undefined): [RedeSintonia, string][] =>
  REDES.filter((k) => !!r?.[k]).map((k) => [k, r![k]!]);

// ---- configuração e resposta pública -------------------------------------------------------------------------------

/** Configuração do painel (STATE_DIR/divulgacao.json). */
export interface DivulgacaoConfig {
  redes: RedesSintonia;
  /** Mostrar os números medidos na página /anuncie (padrão: desligado). */
  mostrarAudiencia: boolean;
}

/** `GET /api/divulgacao`: redes do Sintonia e, se o painel permitir, os números medidos. */
export interface DivulgacaoPublica {
  redes: RedesSintonia;
  audiencia: AudienciaPublica | null;
}
