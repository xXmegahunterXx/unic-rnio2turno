/**
 * Anúncios no servidor (contrato: src/shared/anuncios.ts; regras: ARCHITECTURE §1.5 e §10.2):
 *
 *  - `TabelaAnuncios`: os anúncios cadastrados (do estado do admin) e as imagens deles, endereçadas pelo hash do
 *    conteúdo. O /api/status e o painel recebem `/api/anuncio/img?h=<hash>` no lugar do data URI (o status é consultado
 *    por todos a cada poucos segundos; a imagem vai uma vez, com cache imutável). Na volta pelo admin, a URL é trocada
 *    de novo pelo conteúdo (`resolverAnuncio`), então editar um anúncio sem trocar a imagem não a perde.
 *  - `MetricasAnuncios`: impressões visíveis e cliques AGREGADOS por anúncio × formato × hora (48 h no detalhe; totais
 *    desde sempre). Sem cookie, sem IP e sem dado pessoal: o visitante só aparece como a chave anonimizada do app
 *    (hash do IP com sal que troca a cada processo), usada para descartar repetições e limitar abusos, e nunca é
 *    guardada nem gravada em disco (só um número de 53 bits derivado dela, dentro de janelas de minutos).
 *  - `ehRobo`: robôs de prévia/busca não contam.
 */
import { createHash } from 'node:crypto';
import {
  FORMATOS_ANUNCIO,
  type AnuncioConfig,
  type AnuncioPublico,
  type FormatoAnuncio,
  type MetricaAnuncio,
} from '../shared/anuncios';

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
      for (const uri of [a.logo, a.imagem]) if (uri) this.registrar(uri, antes.get(uri));
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

  /** Comando 'anuncio-salvar' vindo do painel: URLs de imagem deste servidor viram o conteúdo de novo. */
  resolverAnuncio<T>(a: T): T {
    if (!a || typeof a !== 'object') return a;
    const x = { ...(a as Record<string, unknown>) };
    for (const campo of ['logo', 'imagem'] as const) if (typeof x[campo] === 'string') x[campo] = this.resolver(x[campo] as string);
    return x as T;
  }

  /** Anúncio público com as imagens por URL e o link de clique contado (`/api/anuncio/ir/<id>`). */
  publico(a: AnuncioPublico, origem: string): AnuncioPublico {
    const p: AnuncioPublico = { ...a, formatos: [...a.formatos], href: `${origem}/api/anuncio/ir/${encodeURIComponent(a.id)}` };
    const logo = this.url(a.logo, origem);
    const imagem = this.url(a.imagem, origem);
    if (logo) p.logo = logo;
    else delete p.logo;
    if (imagem) p.imagem = imagem;
    else delete p.imagem;
    return p;
  }

  /** Anúncio cadastrado para o painel (imagens por URL, o resto igual). */
  paraPainel(a: AnuncioConfig, origem: string): AnuncioConfig {
    const p: AnuncioConfig = { ...a, formatos: [...a.formatos] };
    const logo = this.url(a.logo, origem);
    const imagem = this.url(a.imagem, origem);
    if (logo) p.logo = logo;
    else delete p.logo;
    if (imagem) p.imagem = imagem;
    else delete p.imagem;
    return p;
  }
}

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
 * limitada: com `maxChaves` visitantes diferentes na janela, um visitante novo é recusado até a janela virar (é só a
 * contagem dos anúncios: recusar, ali, é não contar — nunca derruba o site).
 */
export class LimiteJanela {
  private contas = new Map<number, number>();
  private fimJanela: number;

  constructor(
    readonly max: number,
    readonly janelaMs: number,
    private readonly now: () => number = Date.now,
    readonly maxChaves = 100_000,
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
    if (antes === undefined && this.contas.size >= this.maxChaves) return false;
    const n = (antes ?? 0) + 1;
    this.contas.set(k, n);
    return n <= this.max;
  }

  get tamanho() {
    return this.contas.size;
  }
}

// ---------------------------------------------------------------------------------------------
// Métricas agregadas
// ---------------------------------------------------------------------------------------------

export const HORA_MS = 3_600_000;
/** Horas guardadas no detalhe (gráfico do painel). */
export const HORAS_DETALHE = 48;
/** Impressão do mesmo visitante, anúncio e formato conta uma vez a cada 5 min. */
export const JANELA_IMPRESSAO_MS = 5 * 60_000;
/**
 * Clique do mesmo visitante, anúncio e formato conta uma vez a cada 30 min (duplo toque, voltar e tocar de novo, e quem
 * tenta inflar o relatório repetindo o clique). O redirecionamento acontece sempre.
 */
export const JANELA_CLIQUE_MS = 30 * 60_000;

interface Contagem {
  impressoes: number;
  cliques: number;
}

interface Serie {
  id: string;
  formato: FormatoAnuncio;
  total: Contagem;
  /** início da hora (epoch ms) → contagem */
  horas: Map<number, Contagem>;
}

/** Formato do arquivo STATE_DIR/anuncios-metricas.json. */
export interface MetricasAnunciosArquivo {
  v: 1;
  desde: number;
  salvoEm: number;
  series: { id: string; f: FormatoAnuncio; i: number; c: number; h: [number, number, number][] }[];
}

const RE_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const inteiro = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const ehFormato = (f: unknown): f is FormatoAnuncio => (FORMATOS_ANUNCIO as readonly unknown[]).includes(f);

export class MetricasAnuncios {
  /** Desde quando as métricas são contadas (epoch ms). */
  desde: number;
  /** Há contagem nova ainda não gravada. */
  sujo = false;
  private readonly series = new Map<string, Serie>();
  private readonly impressoesVistas: Repeticoes;
  private readonly cliquesVistos: Repeticoes;

  constructor(private readonly now: () => number = Date.now) {
    this.desde = now();
    this.impressoesVistas = new Repeticoes(JANELA_IMPRESSAO_MS, now);
    this.cliquesVistos = new Repeticoes(JANELA_CLIQUE_MS, now);
  }

  /** Impressão visível; false = repetida (mesmo visitante, anúncio e formato em 5 min) e não contada. */
  impressao(id: string, formato: FormatoAnuncio, visitante: string): boolean {
    if (this.impressoesVistas.visto(`${visitante}|${id}|${formato}`)) return false;
    this.contar(id, formato, 'impressoes');
    return true;
  }

  /** Clique; false = repetido (mesmo visitante, anúncio e formato em 30 min) e não contado. */
  clique(id: string, formato: FormatoAnuncio, visitante: string): boolean {
    if (this.cliquesVistos.visto(`${visitante}|${id}|${formato}`)) return false;
    this.contar(id, formato, 'cliques');
    return true;
  }

  private serie(id: string, formato: FormatoAnuncio): Serie {
    const k = `${id}|${formato}`;
    let s = this.series.get(k);
    if (!s) {
      s = { id, formato, total: { impressoes: 0, cliques: 0 }, horas: new Map() };
      this.series.set(k, s);
    }
    return s;
  }

  private contar(id: string, formato: FormatoAnuncio, campo: keyof Contagem, n = 1) {
    const s = this.serie(id, formato);
    const hora = Math.floor(this.now() / HORA_MS) * HORA_MS;
    let h = s.horas.get(hora);
    if (!h) {
      h = { impressoes: 0, cliques: 0 };
      s.horas.set(hora, h);
      this.podar(s, hora);
    }
    h[campo] += n;
    s.total[campo] += n;
    this.sujo = true;
  }

  private podar(s: Serie, horaAtual: number) {
    const lim = horaAtual - (HORAS_DETALHE - 1) * HORA_MS;
    for (const k of s.horas.keys()) if (k < lim) s.horas.delete(k);
  }

  /** Métricas para o painel: totais desde sempre e as últimas 48 h por hora (em ordem). */
  lista(): MetricaAnuncio[] {
    const lim = Math.floor(this.now() / HORA_MS) * HORA_MS - (HORAS_DETALHE - 1) * HORA_MS;
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

  toJSON(): MetricasAnunciosArquivo {
    return {
      v: 1,
      desde: this.desde,
      salvoEm: this.now(),
      series: [...this.series.values()].map((s) => ({
        id: s.id,
        f: s.formato,
        i: s.total.impressoes,
        c: s.total.cliques,
        h: [...s.horas.entries()].sort((a, b) => a[0] - b[0]).map(([hora, c]): [number, number, number] => [hora, c.impressoes, c.cliques]),
      })),
    };
  }

  /** Restaura o arquivo gravado (somando ao que já houver). Conteúdo inválido é ignorado; nunca lança. */
  carregar(v: unknown): boolean {
    if (!v || typeof v !== 'object') return false;
    const x = v as Partial<MetricasAnunciosArquivo>;
    if (x.v !== 1 || !Array.isArray(x.series)) return false;
    const desde = inteiro(x.desde);
    if (desde > 0 && desde < this.desde) this.desde = desde;
    const lim = Math.floor(this.now() / HORA_MS) * HORA_MS - (HORAS_DETALHE - 1) * HORA_MS;
    for (const s of x.series) {
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !RE_ID.test(s.id) || !ehFormato(s.f)) continue;
      const serie = this.serie(s.id, s.f);
      serie.total.impressoes += inteiro(s.i);
      serie.total.cliques += inteiro(s.c);
      for (const h of Array.isArray(s.h) ? s.h : []) {
        if (!Array.isArray(h) || h.length < 3) continue;
        const hora = inteiro(h[0]);
        if (!hora || hora % HORA_MS !== 0 || hora < lim) continue;
        const c = serie.horas.get(hora) ?? { impressoes: 0, cliques: 0 };
        c.impressoes += inteiro(h[1]);
        c.cliques += inteiro(h[2]);
        serie.horas.set(hora, c);
      }
    }
    return true;
  }
}
