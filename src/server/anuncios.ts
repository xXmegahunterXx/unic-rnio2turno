/**
 * Anúncios no servidor (contrato: src/shared/anuncios.ts; regras: ARCHITECTURE §1.5 e §10.2):
 *
 *  - `TabelaAnuncios`: os anúncios cadastrados (do estado do admin) e as imagens deles (logo, versão para fundo escuro e
 *    peça), endereçadas pelo hash do conteúdo. O /api/status e o painel recebem `/api/anuncio/img?h=<hash>` no lugar do
 *    data URI (o status é consultado por todos a cada poucos segundos; a imagem vai uma vez, com cache imutável). Na
 *    volta pelo admin, a URL é trocada de novo pelo conteúdo (`resolverAnuncio`), então editar um anúncio sem trocar a
 *    imagem não a perde.
 *  - `PessoasPorRede`: a "pessoa" da contagem é a rede (hash com sal por processo: IPv4 inteiro, IPv6 /64) + um hash de
 *    32 bits do navegador (User-Agent), com teto por rede numa janela de 5 min (400 em IPv4, 8 num /64): acima do teto,
 *    a pessoa nova conta pela rede (conservador). Só em memória.
 *  - `MetricasAnuncios`: impressões visíveis e cliques AGREGADOS por anúncio × formato × hora (14 dias no detalhe),
 *    totais por dia de Brasília (para sempre) e desde sempre, e o alcance estimado (`alcance.ts`). Sem cookie, sem IP e
 *    sem dado pessoal: a pessoa só aparece como a chave anonimizada acima, usada para descartar repetições, limitar
 *    abusos e alimentar o HyperLogLog, e nunca é guardada nem gravada em disco.
 *  - `MetasAnuncios`: meta de impressões (E16) — ao atingir, o anúncio sai do site sozinho.
 *  - `ehRobo`: robôs de prévia/busca não contam.
 */
import { createHash } from 'node:crypto';
import {
  FORMATOS_ANUNCIO,
  FORMATOS_COM_IMPRESSAO,
  type AnuncioConfig,
  type AnuncioPublico,
  type FormatoAnuncio,
  type MetricaAnuncio,
} from '../shared/anuncios';
import type { RelatorioAnunciante } from '../shared/relatorio';
import { AlcanceAnuncios, diaBrasilia } from './alcance';

/** URL de imagem servida por este servidor (absoluta ou relativa), como o painel devolve. */
export const RE_URL_IMG_ANUNCIO = /^(?:https?:\/\/[^\s/]+)?\/api\/anuncio\/img\?h=([a-f0-9]{8,64})$/;
const RE_DATA_URI = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/;

export interface ImagemAnuncio {
  /** hash do conteúdo (16 hex) */
  h: string;
  tipo: string;
  corpo: Buffer;
}

/** Hash do conteúdo de uma imagem em data URI (16 hex = 64 bits). */
export const hashImagem = (uri: string) => createHash('sha256').update(uri).digest('hex').slice(0, 16);

export class TabelaAnuncios {
  private versao: number | null = null;
  private configs = new Map<string, AnuncioConfig>();
  private porHash = new Map<string, ImagemAnuncio & { uri: string }>();
  private porUri = new Map<string, string>();

  /**
   * Atualiza a tabela quando a versão do admin muda (cada comando troca a versão). `ler` só é chamado nessa hora:
   * o estado completo (com as imagens) não é copiado a cada requisição.
   */
  sincronizar(versao: number, ler: () => readonly AnuncioConfig[] | undefined): void {
    if (versao === this.versao) return;
    const lista = ler() ?? [];
    const antes = this.porUri;
    this.configs = new Map(lista.map((a) => [a.id, a]));
    this.porHash = new Map();
    this.porUri = new Map();
    for (const a of lista) {
      for (const uri of [a.logo, a.logoEscuro, a.imagem]) if (uri) this.registrar(uri, antes.get(uri));
    }
    this.versao = versao;
  }

  private registrar(uri: string, hConhecido?: string): string | null {
    const ja = this.porUri.get(uri);
    if (ja) return ja;
    const m = RE_DATA_URI.exec(uri);
    if (!m) return null;
    const h = hConhecido ?? hashImagem(uri);
    this.porUri.set(uri, h);
    this.porHash.set(h, { h, tipo: m[1], corpo: Buffer.from(m[2], 'base64'), uri });
    return h;
  }

  /** Anúncio cadastrado (no ar ou não) pelo id. */
  config(id: string): AnuncioConfig | undefined {
    return this.configs.get(id);
  }

  /** Todos os anúncios cadastrados (na ordem do painel). */
  todos(): AnuncioConfig[] {
    return [...this.configs.values()];
  }

  obter(h: string): ImagemAnuncio | null {
    return this.porHash.get(h) ?? null;
  }

  /** data URI → URL absoluta servida aqui; outra coisa (já URL) segue como está. */
  url(uri: string | undefined, origem: string): string | undefined {
    if (!uri) return undefined;
    if (!uri.startsWith('data:')) return uri;
    const h = this.porUri.get(uri) ?? this.registrar(uri);
    return h ? `${origem}/api/anuncio/img?h=${h}` : undefined;
  }

  /** Imagem que voltou do painel como URL deste servidor → o conteúdo (se o hash for conhecido). */
  resolver(v: string | undefined): string | undefined {
    if (!v) return v;
    const m = RE_URL_IMG_ANUNCIO.exec(v.trim());
    if (!m) return v;
    return this.porHash.get(m[1])?.uri ?? v;
  }

  /**
   * Comandos 'anuncio-salvar' e 'anuncio-logo' vindos do painel: URLs de imagem deste servidor (logo, versão escura e
   * peça) viram o conteúdo de novo. `null` (apagar, no 'anuncio-logo') e campos ausentes seguem como estão.
   */
  resolverAnuncio<T>(a: T): T {
    if (!a || typeof a !== 'object') return a;
    const x = { ...(a as Record<string, unknown>) };
    for (const campo of CAMPOS_IMAGEM) if (typeof x[campo] === 'string') x[campo] = this.resolver(x[campo] as string);
    return x as T;
  }

  /** Troca os data URIs das imagens por URLs servidas aqui (sem imagem válida → o campo e o ajuste dele saem). */
  private comUrls<T extends Partial<Pick<AnuncioConfig, 'logo' | 'logoEscuro' | 'imagem' | 'logoAjuste' | 'logoEscuroAjuste' | 'imagemAjuste'>>>(p: T, origem: string): T {
    for (const campo of CAMPOS_IMAGEM) {
      const u = this.url(p[campo], origem);
      if (u) p[campo] = u;
      else {
        delete p[campo];
        delete p[`${campo}Ajuste`];
      }
    }
    return p;
  }

  /** Anúncio público com as imagens por URL e o link de clique contado (`/api/anuncio/ir/<id>`). Nenhum data URI. */
  publico(a: AnuncioPublico, origem: string): AnuncioPublico {
    return this.comUrls({ ...a, formatos: [...a.formatos], href: `${origem}/api/anuncio/ir/${encodeURIComponent(a.id)}` }, origem);
  }

  /** Anúncio cadastrado para o painel (imagens por URL, o resto igual). */
  paraPainel(a: AnuncioConfig, origem: string): AnuncioConfig {
    return this.comUrls({ ...a, formatos: [...a.formatos] }, origem);
  }
}

/** Campos de imagem de um anúncio (cada um com o ajuste `<campo>Ajuste`). */
const CAMPOS_IMAGEM = ['logo', 'logoEscuro', 'imagem'] as const;

/** Robô de prévia/busca/monitoramento (não conta impressão nem clique; o redirecionamento acontece igual). */
export function ehRobo(ua: string | undefined | null): boolean {
  if (!ua) return true;
  return /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebookcatalog|embedly|preview|whatsapp|telegram|discord|skype|headless|lighthouse|pingdom|uptime|monitor|curl\/|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|httpclient/i.test(
    ua,
  );
}

// ---------------------------------------------------------------------------------------------
// Repetições e limites (memória limitada, sem guardar a chave do visitante em claro)
// ---------------------------------------------------------------------------------------------

/** Número de 53 bits a partir de uma chave (dois FNV-1a de 32 bits). Colisões: desprezíveis nas janelas de minutos. */
export function numeroDe(s: string): number {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
    b ^= b >>> 15;
  }
  return (a >>> 0) * 0x200000 + ((b >>> 0) & 0x1fffff);
}

/**
 * "Já vi esta chave nos últimos `janelaMs`?" Duas gerações de conjuntos trocadas a cada janela: lembra por pelo menos
 * `janelaMs` (e no máximo o dobro). Acima de `max` chaves na geração atual, troca antes (memória ≤ 2 × max números).
 */
export class Repeticoes {
  private atual = new Set<number>();
  private anterior = new Set<number>();
  private trocaEm: number;

  constructor(
    readonly janelaMs: number,
    private readonly now: () => number = Date.now,
    private readonly max = 200_000,
  ) {
    this.trocaEm = now() + janelaMs;
  }

  /** true se a chave já foi vista dentro da janela; senão registra e devolve false. */
  visto(chave: string): boolean {
    const t = this.now();
    if (t >= this.trocaEm) {
      this.anterior = t >= this.trocaEm + this.janelaMs ? new Set() : this.atual;
      this.atual = new Set();
      this.trocaEm = t + this.janelaMs;
    }
    const n = numeroDe(chave);
    if (this.atual.has(n) || this.anterior.has(n)) return true;
    if (this.atual.size >= this.max) {
      this.anterior = this.atual;
      this.atual = new Set();
      this.trocaEm = t + this.janelaMs;
    }
    this.atual.add(n);
    return false;
  }

  get tamanho() {
    return this.atual.size + this.anterior.size;
  }
}

/**
 * No máximo `max` eventos por chave a cada janela fixa de `janelaMs` (contadores zerados a cada janela). Memória
 * limitada: com `maxChaves` visitantes diferentes na janela, um visitante novo é recusado até a janela virar
 * (`lotado: 'recusa'`, o padrão) ou passa sem limite (`'deixa'`: a contagem dos anúncios, onde recusar seria perder a
 * impressão de quem chega no pico — a repetição e o teto de pessoas continuam protegendo).
 */
export class LimiteJanela {
  private contas = new Map<number, number>();
  private fimJanela: number;

  constructor(
    readonly max: number,
    readonly janelaMs: number,
    private readonly now: () => number = Date.now,
    readonly maxChaves = 100_000,
    readonly lotado: 'recusa' | 'deixa' = 'recusa',
  ) {
    this.fimJanela = now() + janelaMs;
  }

  /** true = permitido. */
  tentar(chave: string): boolean {
    const t = this.now();
    if (t >= this.fimJanela) {
      this.contas = new Map();
      this.fimJanela = t + this.janelaMs;
    }
    const k = numeroDe(chave);
    const antes = this.contas.get(k);
    if (antes === undefined && this.contas.size >= this.maxChaves) return this.lotado === 'deixa';
    const n = (antes ?? 0) + 1;
    this.contas.set(k, n);
    return n <= this.max;
  }

  get tamanho() {
    return this.contas.size;
  }
}

/** Hash FNV-1a de 32 bits (o navegador da "pessoa": só um número, nunca o User-Agent guardado). */
export function fnv32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Janela do teto de pessoas por rede (5 min). */
export const JANELA_PESSOAS_MS = 5 * 60_000;
/** Teto de pessoas (navegadores diferentes) por rede numa janela: IPv4 inteiro e IPv6 /64. */
export const TETO_PESSOAS = { v4: 400, v6: 8 } as const;
/** Pares rede × navegador lembrados por janela (memória); acima disso, conta pela rede. */
export const MAX_PARES_PESSOA = 300_000;

/**
 * "Pessoa" da contagem dos anúncios: `<rede>|<hash de 32 bits do User-Agent>`. Atrás de uma mesma rede (CGNAT, Wi-Fi
 * de empresa) várias pessoas deixam de contar como uma — mas com teto por rede numa janela de 5 min (400 navegadores
 * em IPv4, 8 num /64 de IPv6; um /64 é de uma casa só): acima do teto, ou com mais de 300 mil pares na janela, a pessoa
 * nova conta pela REDE (`<rede>`, conservador — quem troca de User-Agent para inflar não passa do teto). Duas gerações
 * de janela: quem já foi contado na janela anterior continua sendo a mesma pessoa. Só em memória (números de 53 bits).
 */
export class PessoasPorRede {
  private pares = new Set<number>();
  private paresAnteriores = new Set<number>();
  private porRede = new Map<number, number>();
  private fimJanela: number;
  /** redes que chegaram ao teto nesta janela (só a contagem vai ao log, nunca a rede) */
  private noTeto = 0;

  constructor(
    private readonly now: () => number = Date.now,
    readonly janelaMs = JANELA_PESSOAS_MS,
    readonly teto: { v4: number; v6: number } = TETO_PESSOAS,
    readonly maxPares = MAX_PARES_PESSOA,
    /** chamado na virada da janela com quantas redes chegaram ao teto nela (> 0): uma linha de log por janela */
    private readonly aoVirar?: (redesNoTeto: number) => void,
  ) {
    this.fimJanela = now() + janelaMs;
  }

  /** Chave da pessoa (rede + navegador) ou só a rede (teto atingido). `rede` já é o hash com sal da rede. */
  pessoa(rede: string, userAgent: string, v6: boolean): string {
    const t = this.now();
    if (t >= this.fimJanela) {
      this.paresAnteriores = t >= this.fimJanela + this.janelaMs ? new Set() : this.pares;
      this.pares = new Set();
      this.porRede = new Map();
      this.fimJanela = t + this.janelaMs;
      if (this.noTeto > 0) this.aoVirar?.(this.noTeto);
      this.noTeto = 0;
    }
    const chave = `${rede}|${fnv32(userAgent).toString(36)}`;
    const n = numeroDe(chave);
    if (this.pares.has(n)) return chave;
    if (this.pares.size >= this.maxPares) return rede;
    const r = numeroDe(rede);
    const na = this.porRede.get(r) ?? 0;
    const teto = v6 ? this.teto.v6 : this.teto.v4;
    if (!this.paresAnteriores.has(n) && na >= teto) {
      if (na === teto) {
        // 1ª vez no teto nesta janela: conta para o log (e não conta de novo)
        this.noTeto++;
        this.porRede.set(r, na + 1);
      }
      return rede;
    }
    this.pares.add(n);
    this.porRede.set(r, na + 1);
    return chave;
  }

  get tamanho() {
    return this.pares.size + this.paresAnteriores.size;
  }
}

/**
 * Pessoas por rede POR ANÚNCIO numa janela de 5 min: 100 em IPv4 e 8 num /64. O teto por rede (`TETO_PESSOAS`, 400)
 * vale para a rede inteira; este limita o que UMA rede soma a UM anúncio. Sem ele, um script num único IPv4 trocando o
 * User-Agent somaria ~400 "pessoas" × 7 formatos ≈ 2.800 impressões a cada 5 min a um anúncio — inflando o relatório
 * e esgotando antes da hora a meta de impressões (E16). Acima do teto, a pessoa nova conta pela REDE (como na leva 2).
 */
export const TETO_PESSOAS_ANUNCIO = { v4: 100, v6: 8 } as const;

export class PessoasPorAnuncio {
  private vistos = new Set<number>();
  private anteriores = new Set<number>();
  private porChave = new Map<number, number>();
  private fimJanela: number;
  private noTeto = 0;

  constructor(
    private readonly now: () => number = Date.now,
    readonly janelaMs = JANELA_PESSOAS_MS,
    readonly teto: { v4: number; v6: number } = TETO_PESSOAS_ANUNCIO,
    readonly maxPares = MAX_PARES_PESSOA,
    /** chamado na virada da janela com quantos pares rede × anúncio chegaram ao teto nela (> 0) */
    private readonly aoVirar?: (noTeto: number) => void,
  ) {
    this.fimJanela = now() + janelaMs;
  }

  /** A pessoa que conta para o anúncio `id`: `k.pessoa` ou, acima do teto da rede neste anúncio, `k.rede`. */
  pessoa(k: { rede: string; pessoa: string; v6: boolean }, id: string): string {
    if (k.pessoa === k.rede) return k.rede;
    const t = this.now();
    if (t >= this.fimJanela) {
      this.anteriores = t >= this.fimJanela + this.janelaMs ? new Set() : this.vistos;
      this.vistos = new Set();
      this.porChave = new Map();
      this.fimJanela = t + this.janelaMs;
      if (this.noTeto > 0) this.aoVirar?.(this.noTeto);
      this.noTeto = 0;
    }
    const n = numeroDe(`${k.pessoa}|${id}`);
    if (this.vistos.has(n)) return k.pessoa;
    if (this.vistos.size >= this.maxPares) return k.rede;
    const r = numeroDe(`${k.rede}|${id}`);
    const na = this.porChave.get(r) ?? 0;
    const teto = k.v6 ? this.teto.v6 : this.teto.v4;
    if (!this.anteriores.has(n) && na >= teto) {
      if (na === teto) {
        this.noTeto++;
        this.porChave.set(r, na + 1);
      }
      return k.rede;
    }
    this.vistos.add(n);
    this.porChave.set(r, na + 1);
    return k.pessoa;
  }
}

// ---------------------------------------------------------------------------------------------
// Métricas agregadas
// ---------------------------------------------------------------------------------------------

export const HORA_MS = 3_600_000;
/** Horas guardadas no detalhe por hora (relatório do anunciante): 14 dias. Antes disso, só os totais por dia. */
export const HORAS_DETALHE = 14 * 24;
/** Horas que o painel recebe por padrão (gráfico de 48 h; `?horas=` vai até `HORAS_DETALHE`). */
export const HORAS_PAINEL = 48;
/** Impressão da mesma pessoa, anúncio e formato conta uma vez a cada 5 min. */
export const JANELA_IMPRESSAO_MS = 5 * 60_000;
/**
 * Clique da mesma pessoa, anúncio e formato conta uma vez a cada 30 min (duplo toque, voltar e tocar de novo, e quem
 * tenta inflar o relatório repetindo o clique). O redirecionamento acontece sempre.
 */
export const JANELA_CLIQUE_MS = 30 * 60_000;
/** Chaves lembradas por geração nas repetições (impressão e clique). */
export const MAX_REPETICOES = 600_000;

interface Contagem {
  impressoes: number;
  cliques: number;
}

interface Serie {
  id: string;
  formato: FormatoAnuncio;
  total: Contagem;
  /** início da hora (epoch ms) → contagem (só os últimos 14 dias) */
  horas: Map<number, Contagem>;
  /** dia de Brasília ('AAAA-MM-DD') → contagem (para sempre) */
  dias: Map<string, Contagem>;
}

/**
 * Formato do arquivo STATE_DIR/anuncios-metricas.json. Continua `v: 1` (com `versao: 2`) de propósito: a versão anterior
 * do servidor só lê `v === 1` e, numa volta de versão (`update.sh --rollback`), assim mantém os totais e as horas em vez
 * de começar do zero. Ela ignora `d`, `alcance` e `esg` — e, no 1º salvamento dela, reescreve o arquivo sem eles: os
 * totais por dia (além do detalhe) e o alcance se perdem de vez (RUNBOOK §3.5). Sem `versao: 2` = arquivo da versão anterior (sem dias nem
 * alcance), também lido.
 */
export interface MetricasAnunciosArquivo {
  v: 1;
  /** formato com os totais por dia, o alcance e as metas atingidas */
  versao: 2;
  desde: number;
  salvoEm: number;
  series: { id: string; f: FormatoAnuncio; i: number; c: number; h: [number, number, number][]; d: [string, number, number][] }[];
  /** alcance estimado (alcance.ts) */
  alcance?: ReturnType<AlcanceAnuncios['toJSON']>;
  /** metas atingidas (E16): id → quando (epoch ms) */
  esg?: Record<string, number>;
}

const RE_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const inteiro = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const ehFormato = (f: unknown): f is FormatoAnuncio => (FORMATOS_ANUNCIO as readonly unknown[]).includes(f);
const horaCheia = (t: number) => Math.floor(t / HORA_MS) * HORA_MS;
/** Início do dia de Brasília (epoch ms) de 'AAAA-MM-DD'. */
const inicioDoDia = (dia: string) => Date.parse(`${dia}T00:00:00-03:00`);

export class MetricasAnuncios {
  /** Desde quando as métricas são contadas (epoch ms). */
  desde: number;
  /** Há contagem nova ainda não gravada. */
  sujo = false;
  /** Alcance estimado (pessoas diferentes) por anúncio, por dia e na noite da eleição. */
  readonly alcance: AlcanceAnuncios;
  /** Metas atingidas (E16): id → quando. O anúncio sai do site (`anunciosParaSite`). */
  readonly esgotadoEm = new Map<string, number>();
  /** Sobe a cada mudança dos esgotados (entra na chave do cache do /api/status). */
  geracaoEsgotados = 0;
  private readonly series = new Map<string, Serie>();
  private readonly impressoesVistas: Repeticoes;
  private readonly cliquesVistos: Repeticoes;

  constructor(private readonly now: () => number = Date.now) {
    this.desde = now();
    this.impressoesVistas = new Repeticoes(JANELA_IMPRESSAO_MS, now, MAX_REPETICOES);
    this.cliquesVistos = new Repeticoes(JANELA_CLIQUE_MS, now, MAX_REPETICOES);
    this.alcance = new AlcanceAnuncios(now);
  }

  /** Impressão visível; false = repetida (mesma pessoa, anúncio e formato em 5 min) e não contada. */
  impressao(id: string, formato: FormatoAnuncio, pessoa: string): boolean {
    if (this.impressoesVistas.visto(`${pessoa}|${id}|${formato}`)) return false;
    this.contar(id, formato, 'impressoes');
    this.alcance.adicionar(id, pessoa);
    return true;
  }

  /** Clique; false = repetido (mesma pessoa, anúncio e formato em 30 min) e não contado. */
  clique(id: string, formato: FormatoAnuncio, pessoa: string): boolean {
    if (this.cliquesVistos.visto(`${pessoa}|${id}|${formato}`)) return false;
    this.contar(id, formato, 'cliques');
    return true;
  }

  private serie(id: string, formato: FormatoAnuncio): Serie {
    const k = `${id}|${formato}`;
    let s = this.series.get(k);
    if (!s) {
      s = { id, formato, total: { impressoes: 0, cliques: 0 }, horas: new Map(), dias: new Map() };
      this.series.set(k, s);
    }
    return s;
  }

  private contar(id: string, formato: FormatoAnuncio, campo: keyof Contagem, n = 1) {
    const s = this.serie(id, formato);
    const t = this.now();
    const hora = horaCheia(t);
    let h = s.horas.get(hora);
    if (!h) {
      h = { impressoes: 0, cliques: 0 };
      s.horas.set(hora, h);
      this.podar(s, hora);
    }
    const dia = diaBrasilia(t);
    let d = s.dias.get(dia);
    if (!d) {
      d = { impressoes: 0, cliques: 0 };
      s.dias.set(dia, d);
    }
    h[campo] += n;
    d[campo] += n;
    s.total[campo] += n;
    this.sujo = true;
  }

  /** Limite de baixo do detalhe por hora (início da hora mais antiga guardada). */
  private limiteDetalhe(horaAtual = horaCheia(this.now())) {
    return horaAtual - (HORAS_DETALHE - 1) * HORA_MS;
  }

  private podar(s: Serie, horaAtual: number) {
    const lim = this.limiteDetalhe(horaAtual);
    for (const k of s.horas.keys()) if (k < lim) s.horas.delete(k);
  }

  /** Poda o detalhe de todas as séries (as que não receberam contagem nova também): antes de ler horas + dias. */
  private podarTodas() {
    const h = horaCheia(this.now());
    for (const s of this.series.values()) this.podar(s, h);
  }

  /** Métricas para o painel: totais desde sempre e as últimas `horas` (1–336; padrão 48) por hora, em ordem. */
  lista(horas = HORAS_PAINEL): MetricaAnuncio[] {
    const n = Math.min(HORAS_DETALHE, Math.max(1, Math.floor(Number.isFinite(horas) ? horas : HORAS_PAINEL)));
    const lim = horaCheia(this.now()) - (n - 1) * HORA_MS;
    return [...this.series.values()]
      .map((s) => ({
        id: s.id,
        formato: s.formato,
        impressoes: s.total.impressoes,
        cliques: s.total.cliques,
        porHora: [...s.horas.entries()]
          .filter(([hora]) => hora >= lim)
          .sort((a, b) => a[0] - b[0])
          .map(([hora, c]) => ({ hora, impressoes: c.impressoes, cliques: c.cliques })),
      }))
      .sort((a, b) => a.id.localeCompare(b.id) || FORMATOS_ANUNCIO.indexOf(a.formato) - FORMATOS_ANUNCIO.indexOf(b.formato));
  }

  /** Séries de um anúncio, com o detalhe por hora já podado (horas + dias nunca contam nada duas vezes). */
  private doAnuncio(id: string): Serie[] {
    const h = horaCheia(this.now());
    const out = [...this.series.values()].filter((s) => s.id === id);
    for (const s of out) this.podar(s, h);
    return out;
  }

  /** Impressões do anúncio desde sempre (todos os formatos). */
  totalImpressoes(id: string): number {
    return this.doAnuncio(id).reduce((n, s) => n + s.total.impressoes, 0);
  }

  /** Impressões do anúncio nas horas do detalhe dentro de [ini, fim). */
  impressoesEntre(id: string, ini: number, fim: number): number {
    let n = 0;
    for (const s of this.doAnuncio(id)) for (const [hora, c] of s.horas) if (hora >= ini && hora < fim) n += c.impressoes;
    return n;
  }

  /**
   * Parte de cada dia que já saiu do detalhe por hora (total do dia − as horas dele ainda guardadas), por série. É o que
   * os totais por dia acrescentam ao detalhe sem contar nada duas vezes.
   */
  private podadoPorDia(s: Serie): Map<string, Contagem> {
    const guardado = new Map<string, Contagem>();
    for (const [hora, c] of s.horas) {
      const dia = diaBrasilia(hora);
      const g = guardado.get(dia) ?? { impressoes: 0, cliques: 0 };
      g.impressoes += c.impressoes;
      g.cliques += c.cliques;
      guardado.set(dia, g);
    }
    const out = new Map<string, Contagem>();
    for (const [dia, c] of s.dias) {
      const g = guardado.get(dia);
      const p = { impressoes: Math.max(0, c.impressoes - (g?.impressoes ?? 0)), cliques: Math.max(0, c.cliques - (g?.cliques ?? 0)) };
      if (p.impressoes || p.cliques) out.set(dia, p);
    }
    return out;
  }

  /**
   * Impressões visíveis do anúncio desde `inicio` (meta de impressões, E16), somando os formatos medidos: as horas do
   * detalhe a partir de `floor(inicio / hora)` e, antes do detalhe (14 dias), os dias inteiros depois do dia do início
   * (o próprio dia do início só conta inteiro se o início for à 0h — senão fica de fora: a conta nunca passa do que foi
   * entregue de verdade).
   */
  entregueDesde(id: string, inicio: number): number {
    const hIni = horaCheia(inicio);
    const diaIni = diaBrasilia(inicio);
    const inteiroDia = inicio <= inicioDoDia(diaIni);
    let n = 0;
    for (const s of this.doAnuncio(id)) {
      if (!FORMATOS_COM_IMPRESSAO.includes(s.formato)) continue;
      for (const [hora, c] of s.horas) if (hora >= hIni) n += c.impressoes;
      for (const [dia, c] of this.podadoPorDia(s)) if (dia > diaIni || (dia === diaIni && inteiroDia)) n += c.impressoes;
    }
    return n;
  }

  /**
   * Dados do relatório do anunciante (E17): cada hora × formato do detalhe com contagem e, antes do detalhe, os totais
   * por dia (só a parte que saiu do detalhe — `horas` + `dias` = a campanha inteira, sem contar duas vezes). Com
   * `inicio` (o da campanha), só o que veio a partir dele, com a mesma regra de `entregueDesde`: um id reaproveitado ou
   * uma campanha renovada não mostram ao anunciante as impressões de antes (o total bate com a meta e com o alcance,
   * que também começam no início).
   */
  paraRelatorio(id: string, inicio?: number | null): Pick<RelatorioAnunciante, 'horas' | 'dias'> {
    const horas: RelatorioAnunciante['horas'] = [];
    const dias = new Map<string, Contagem>();
    const hIni = inicio ? horaCheia(inicio) : -Infinity;
    const diaIni = inicio ? diaBrasilia(inicio) : '';
    const inteiroDia = !inicio || inicio <= inicioDoDia(diaIni);
    for (const s of this.doAnuncio(id)) {
      for (const [hora, c] of s.horas)
        if ((c.impressoes || c.cliques) && hora >= hIni) horas.push({ hora, formato: s.formato, impressoes: c.impressoes, cliques: c.cliques });
      for (const [dia, c] of this.podadoPorDia(s)) {
        if (inicio && !(dia > diaIni || (dia === diaIni && inteiroDia))) continue;
        const d = dias.get(dia) ?? { impressoes: 0, cliques: 0 };
        d.impressoes += c.impressoes;
        d.cliques += c.cliques;
        dias.set(dia, d);
      }
    }
    horas.sort((a, b) => a.hora - b.hora || FORMATOS_ANUNCIO.indexOf(a.formato) - FORMATOS_ANUNCIO.indexOf(b.formato));
    return { horas, dias: [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, c]) => ({ dia, ...c })) };
  }

  /**
   * Meta de impressões (E16): para os anúncios com `limiteImpressoes` e `inicio`, compara o entregue com a meta. Ao
   * atingir, o anúncio entra nos esgotados (com a hora); meta aumentada, retirada ou anúncio removido → sai dos
   * esgotados e volta. true = mudou (a geração sobe).
   */
  verificarMetas(configs: readonly Pick<AnuncioConfig, 'id' | 'inicio' | 'limiteImpressoes'>[]): boolean {
    const t = this.now();
    let mudou = false;
    const comMeta = new Set<string>();
    for (const a of configs) {
      if (!a.limiteImpressoes || !a.inicio) continue;
      comMeta.add(a.id);
      const atingiu = this.entregueDesde(a.id, a.inicio) >= a.limiteImpressoes;
      const ja = this.esgotadoEm.has(a.id);
      if (atingiu && !ja) {
        this.esgotadoEm.set(a.id, t);
        mudou = true;
      } else if (!atingiu && ja) {
        this.esgotadoEm.delete(a.id);
        mudou = true;
      }
    }
    for (const id of [...this.esgotadoEm.keys()]) {
      if (comMeta.has(id)) continue;
      this.esgotadoEm.delete(id);
      mudou = true;
    }
    if (mudou) {
      this.geracaoEsgotados++;
      this.sujo = true;
    }
    return mudou;
  }

  toJSON(): MetricasAnunciosArquivo {
    this.podarTodas();
    const out: MetricasAnunciosArquivo = {
      v: 1,
      versao: 2,
      desde: this.desde,
      salvoEm: this.now(),
      series: [...this.series.values()].map((s) => ({
        id: s.id,
        f: s.formato,
        i: s.total.impressoes,
        c: s.total.cliques,
        h: [...s.horas.entries()].sort((a, b) => a[0] - b[0]).map(([hora, c]): [number, number, number] => [hora, c.impressoes, c.cliques]),
        d: [...s.dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, c]): [string, number, number] => [dia, c.impressoes, c.cliques]),
      })),
      alcance: this.alcance.toJSON(),
    };
    if (this.esgotadoEm.size) out.esg = Object.fromEntries(this.esgotadoEm);
    return out;
  }

  /**
   * Restaura o arquivo gravado (somando ao que já houver). Lê o formato atual (`versao: 2`) e o da versão anterior (sem
   * dias: os dias saem das horas guardadas, e o que o total tinha além delas fica no dia do `desde` do arquivo — a
   * contagem começou nele). Conteúdo inválido é ignorado; nunca lança.
   */
  carregar(v: unknown): boolean {
    if (!v || typeof v !== 'object') return false;
    const bruto = v as Omit<Partial<MetricasAnunciosArquivo>, 'v' | 'versao'> & { v?: unknown; versao?: unknown };
    // `v: 2` também vale (gravado por uma versão de testes desta leva)
    if ((bruto.v !== 1 && bruto.v !== 2) || !Array.isArray(bruto.series)) return false;
    const x = { ...bruto, v: bruto.versao === 2 || bruto.v === 2 ? 2 : 1 };
    const desde = inteiro(x.desde);
    if (desde > 0 && desde < this.desde) this.desde = desde;
    const lim = this.limiteDetalhe();
    const somarDia = (serie: Serie, dia: string, i: number, c: number) => {
      if (!i && !c) return;
      const d = serie.dias.get(dia) ?? { impressoes: 0, cliques: 0 };
      d.impressoes += i;
      d.cliques += c;
      serie.dias.set(dia, d);
    };
    for (const s of x.series as Partial<MetricasAnunciosArquivo['series'][number]>[]) {
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !RE_ID.test(s.id) || !ehFormato(s.f)) continue;
      const serie = this.serie(s.id, s.f);
      const ti = inteiro(s.i);
      const tc = inteiro(s.c);
      serie.total.impressoes += ti;
      serie.total.cliques += tc;
      let si = 0;
      let sc = 0;
      for (const h of Array.isArray(s.h) ? s.h : []) {
        if (!Array.isArray(h) || h.length < 3) continue;
        const hora = inteiro(h[0]);
        if (!hora || hora % HORA_MS !== 0) continue;
        const i = inteiro(h[1]);
        const c = inteiro(h[2]);
        si += i;
        sc += c;
        // v1: os dias saem das horas (todas, mesmo as que já saíram do detalhe)
        if (x.v === 1) somarDia(serie, diaBrasilia(hora), i, c);
        if (hora < lim) continue;
        const ch = serie.horas.get(hora) ?? { impressoes: 0, cliques: 0 };
        ch.impressoes += i;
        ch.cliques += c;
        serie.horas.set(hora, ch);
      }
      if (x.v === 2) {
        for (const d of Array.isArray(s.d) ? s.d : []) {
          if (!Array.isArray(d) || d.length < 3 || typeof d[0] !== 'string' || !RE_DIA.test(d[0])) continue;
          somarDia(serie, d[0], inteiro(d[1]), inteiro(d[2]));
        }
      } else if (desde > 0) somarDia(serie, diaBrasilia(desde), Math.max(0, ti - si), Math.max(0, tc - sc));
    }
    if (x.v === 2) {
      if (x.alcance) this.alcance.carregar(x.alcance);
      if (x.esg && typeof x.esg === 'object')
        for (const [id, em] of Object.entries(x.esg)) if (RE_ID.test(id) && inteiro(em) > 0 && !this.esgotadoEm.has(id)) this.esgotadoEm.set(id, inteiro(em));
    }
    return true;
  }
}
