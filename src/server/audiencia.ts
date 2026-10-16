/**
 * Audiência real, só AGREGADA e sem dado pessoal (contrato: src/shared/audiencia.ts; ARCHITECTURE §11.12).
 *
 * O que é medido (e o que fica em STATE_DIR/audiencia.json, gravado de forma atômica):
 *  - páginas vistas por dia, por grupo de rota e por hora (últimas 48 h) — o app manda um sinal a cada troca de página,
 *    só com o GRUPO (nunca o caminho nem a query string);
 *  - entradas por origem (família da rede social/buscador ou domínio registrável; nunca a URL de origem);
 *  - visitantes únicos estimados por dia: conjunto em memória de chaves de 32 bits = hash(sal DIÁRIO, rede, navegador).
 *    O sal nasce aleatório, nunca é gravado e é trocado à meia-noite de Brasília junto com o conjunto: só a CONTAGEM
 *    sobrevive. Reinício no meio do dia = conjunto novo; os únicos do dia ficam no MAIOR trecho (conservador);
 *  - pico de pessoas ao mesmo tempo, com data e hora: amostrado a cada 10 s SÓ do sinal de presença das páginas (abas
 *    VISÍVEIS que mandaram sinal na janela = intervalo + 60 s), que atravessa a CDN e exige JavaScript, User-Agent de
 *    navegador e `Sec-Fetch-Site: same-origin`. A estimativa que o servidor já tinha ("pessoas agora": clientes que
 *    chegaram à origem em ~30 s, qualquer pedido a /api/*) fica só como referência no painel: um único host consegue
 *    inflá-la com pedidos que furam o cache, e ela não pode ir para material de venda (CDC, art. 37).
 *
 * Pessoa = rede LARGA (IPv4 inteiro, IPv6 /56 — já com hash) + navegador (User-Agent): várias pessoas atrás do mesmo
 * CGNAT (ou da mesma casa) com o mesmo modelo de navegador contam como uma — a estimativa é conservadora. Robôs não
 * contam. Nada de IP, User-Agent, caminho ou referrer é guardado; nada vai para o log.
 *
 * Abuso: limite de sinais por rede por minuto, de páginas por pessoa por minuto e de "pessoas" novas por rede (50 por
 * dia nos únicos, 10 por janela de 30 s na presença) — trocar o User-Agent a cada pedido não infla os números. O painel
 * mostra a CONCENTRAÇÃO (quanto as 10 maiores redes somam) agora e no pico, para conferir antes de vender.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  AUDIENCIA,
  GRUPOS_FORA_DE_PESSOAS,
  diaBrasilia,
  ehGrupoRota,
  intervaloPresenca,
  normalizarOrigem,
  type AudienciaAdmin,
  type AudienciaPublica,
  type DiaAudiencia,
  type HoraAudiencia,
  type PicoAudiencia,
} from '../shared/audiencia';
import { LimiteJanela, numeroDe } from './anuncios';
import { arredondarPessoas } from './metrics';
import type { JsonStore } from './state-store';

export const HORA_MS = 3_600_000;
/** Amostragem do pico. */
export const AMOSTRA_MS = 10_000;
/** Balde da presença. */
const BALDE_MS = 30_000;
/** Baldes guardados: cobre a maior janela (240 s + 60 s) com folga. */
const N_BALDES = 12;
/** Bits por balde de presença (128 KB): estima até ~10 milhões de abas distintas. */
const BITS = 1 << 20;

/** Sinais (páginas + presença) aceitos por rede por minuto: acima disso, não contam. */
export const SINAIS_REDE_MIN = 600;
/** Páginas contadas por pessoa (rede + navegador) por minuto. */
export const PAGINAS_PESSOA_MIN = 20;
/** "Pessoas" novas aceitas por rede (IPv6 /56) por dia (únicos) — trocar o User-Agent não multiplica um visitante. */
export const PESSOAS_REDE_DIA = 50;
/** "Pessoas" novas aceitas por rede (IPv6 /56) por balde de 30 s (presença). */
export const PESSOAS_REDE_BALDE = 10;
/** Redes listadas na concentração (as maiores). */
const TOP_REDES = 10;
/** Teto do conjunto de únicos do dia (32 bits × 2^24 posições = 64 MB): acima disso a contagem para de subir. */
const MAX_SLOTS_UNICOS = 1 << 24;

/** Robôs e automação (o sinal vem de JavaScript: robôs de prévia nem chegam aqui). Sem User-Agent = robô. */
export function ehRoboAudiencia(ua: string | undefined | null): boolean {
  if (!ua || ua.length < 12) return true;
  return /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptime|phantomjs|puppeteer|playwright|selenium|webdriver|curl\/|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|httpclient|postman|insomnia/i.test(
    ua,
  );
}

/** 32 bits de um hash (nunca 0: 0 marca posição vazia no conjunto). */
function chave32(sal: Buffer, ...partes: string[]): number {
  const h = createHash('sha256').update(sal);
  for (const p of partes) h.update('\n').update(p);
  return h.digest().readUInt32BE(0) || 1;
}

/**
 * Conjunto de inteiros de 32 bits (endereçamento aberto, sondagem linear, carga ≤ 0,5; ≤ 0,75 no teto). Guarda só a
 * chave anonimizada; é descartado inteiro na virada do dia.
 */
export class ConjuntoU32 {
  private t = new Uint32Array(1 << 16);
  private n = 0;
  saturado = false;

  get tamanho(): number {
    return this.n;
  }

  /** true se a chave é nova. */
  adicionar(k: number): boolean {
    const x = k >>> 0 || 1;
    if (this.inserir(this.t, x)) {
      this.n++;
      const lim = this.t.length >= MAX_SLOTS_UNICOS ? 0.75 : 0.5;
      if (this.n > this.t.length * lim) this.crescer();
      return true;
    }
    return false;
  }

  tem(k: number): boolean {
    const x = k >>> 0 || 1;
    const m = this.t.length - 1;
    for (let i = Math.imul(x, 0x9e3779b1) >>> 0 & m; ; i = (i + 1) & m) {
      const v = this.t[i];
      if (v === 0) return false;
      if (v === x) return true;
    }
  }

  private inserir(t: Uint32Array, x: number): boolean {
    const m = t.length - 1;
    for (let i = Math.imul(x, 0x9e3779b1) >>> 0 & m; ; i = (i + 1) & m) {
      const v = t[i];
      if (v === x) return false;
      if (v === 0) {
        if (this.saturado && t === this.t) return false;
        t[i] = x;
        return true;
      }
    }
  }

  private crescer() {
    if (this.t.length >= MAX_SLOTS_UNICOS) {
      this.saturado = true;
      return;
    }
    const novo = new Uint32Array(this.t.length * 2);
    for (const v of this.t) if (v !== 0) this.inserir(novo, v);
    this.t = novo;
  }
}

const POPCOUNT = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = (i & 1) + t[i >> 1];
  return t;
})();

interface Balde {
  inicio: number;
  bits: Uint8Array;
  /** rede (32 bits) → pessoas novas neste balde */
  porRede: Map<number, number>;
}

/** Abas visíveis que mandaram sinal na janela (linear counting sobre a união dos baldes; ~1% de erro). */
export class Presenca {
  private baldes: Balde[] = [];

  constructor(private readonly now: () => number) {}

  marcar(chave: number, rede: number): void {
    const t = this.now();
    const inicio = Math.floor(t / BALDE_MS) * BALDE_MS;
    let b = this.baldes[this.baldes.length - 1];
    if (!b || b.inicio !== inicio) {
      b = { inicio, bits: new Uint8Array(BITS / 8), porRede: new Map() };
      this.baldes.push(b);
      while (this.baldes.length > N_BALDES) this.baldes.shift();
    }
    const pos = (chave >>> 0) & (BITS - 1);
    const byte = pos >>> 3;
    const bit = 1 << (pos & 7);
    if (b.bits[byte] & bit) {
      // mesma pessoa de novo (ou colisão no mapa de bits): não soma pessoa, mas a rede conta como presente na
      // concentração — senão uma colisão some com a rede do "quantas redes" (o pico de 300 redes virava 299)
      if (!b.porRede.has(rede)) b.porRede.set(rede, 0);
      return;
    }
    const n = b.porRede.get(rede) ?? 0;
    if (n >= PESSOAS_REDE_BALDE) return;
    b.porRede.set(rede, n + 1);
    b.bits[byte] |= bit;
  }

  /**
   * Concentração nos últimos `janelaMs`: quantas redes mandaram sinal e a fração das marcas que veio de cada uma das
   * maiores (as 10 primeiras). Uma rede só com muita gente = sinal de inflação (ou de um CGNAT grande).
   */
  concentracao(janelaMs: number): { redes: number; top: number[] } {
    const t = this.now();
    const soma = new Map<number, number>();
    let total = 0;
    for (const b of this.baldes) {
      if (b.inicio <= t - janelaMs - BALDE_MS || b.inicio > t) continue;
      for (const [r, n] of b.porRede) {
        soma.set(r, (soma.get(r) ?? 0) + n);
        total += n;
      }
    }
    if (!total) return { redes: 0, top: [] };
    const maiores: number[] = [];
    for (const n of soma.values()) {
      if (maiores.length < TOP_REDES) maiores.push(n);
      else if (n > maiores[maiores.length - 1]) maiores[maiores.length - 1] = n;
      else continue;
      maiores.sort((a, b) => b - a);
    }
    return { redes: soma.size, top: maiores.map((n) => Math.round((n / total) * 1000) / 1000) };
  }

  /** Estimativa de pessoas distintas nos últimos `janelaMs`. */
  estimar(janelaMs: number): number {
    const t = this.now();
    const vivos = this.baldes.filter((b) => b.inicio > t - janelaMs - BALDE_MS && b.inicio <= t);
    if (!vivos.length) return 0;
    const uniao = new Uint8Array(BITS / 8);
    for (const b of vivos) for (let i = 0; i < uniao.length; i++) uniao[i] |= b.bits[i];
    let um = 0;
    for (let i = 0; i < uniao.length; i++) um += POPCOUNT[uniao[i]];
    const zeros = BITS - um;
    return zeros === 0 ? BITS : Math.round(-BITS * Math.log(zeros / BITS));
  }
}

/** Formato do arquivo (versão 1). */
export interface AudienciaArquivo {
  v: 1;
  desde: number | null;
  pico: PicoAudiencia | null;
  dias: DiaAudiencia[];
  horas: HoraAudiencia[];
}

export interface OpcoesAudiencia {
  now?: () => number;
  /** estimativa que o servidor já tinha (Metricas.pessoasAgora, arredondada) */
  pessoasServidor?: () => number;
  store?: JsonStore | null;
}

const ehNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
/**
 * Pico válido do arquivo. Picos com `fonte: 'servidor'` (versão anterior, que usava o "pessoas agora" do servidor) são
 * descartados: esse número pode ser inflado por um único host e não serve para material de venda.
 */
const ehPico = (v: unknown): v is PicoAudiencia =>
  !!v && typeof v === 'object' && ehNum((v as PicoAudiencia).valor) && ehNum((v as PicoAudiencia).em) && (v as PicoAudiencia).fonte === 'sinal';
const lerPico = (v: PicoAudiencia): PicoAudiencia => {
  const c = v.concentracao;
  const conc =
    c && typeof c === 'object' && ehNum(c.redes) && Array.isArray(c.top) && c.top.every((x) => ehNum(x) && x <= 1)
      ? { redes: Math.round(c.redes), top: c.top.slice(0, TOP_REDES) }
      : undefined;
  return { valor: v.valor, em: v.em, fonte: 'sinal', ...(conc ? { concentracao: conc } : {}) };
};

function contagens(v: unknown, chaveValida: (k: string) => boolean, max = Infinity): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  let n = 0;
  for (const [k, x] of Object.entries(v)) {
    if (n >= max) break;
    if (chaveValida(k) && ehNum(x)) {
      out[k] = Math.round(x);
      n++;
    }
  }
  return out;
}

export class Audiencia {
  private readonly now: () => number;
  private readonly pessoasServidor: () => number;
  private readonly store: JsonStore | null;

  // ---- o que é gravado ----
  private desde: number | null = null;
  private pico: PicoAudiencia | null = null;
  private dias: DiaAudiencia[] = [];
  private horas = new Map<number, HoraAudiencia>();

  // ---- só memória (nunca gravado) ----
  private diaAtual = '';
  private salDia: Buffer = randomBytes(16);
  private readonly salPresenca: Buffer = randomBytes(16);
  private unicos = new ConjuntoU32();
  /** únicos do dia contados antes de um reinício (o conjunto daquele trecho se perdeu) */
  private unicosAntes = 0;
  /** pessoas novas por rede no dia (índice = 20 bits do hash da rede) */
  private pessoasPorRede = new Uint16Array(1 << 20);
  private readonly presenca: Presenca;
  private readonly limiteRede: LimiteJanela;
  private readonly limitePaginas: LimiteJanela;
  private ultimo: { em: number; sinal: number; servidor: number; intervaloS: number; concentracao: { redes: number; top: number[] } } = {
    em: 0,
    sinal: 0,
    servidor: 0,
    intervaloS: AUDIENCIA.intervalos[0].s,
    concentracao: { redes: 0, top: [] },
  };
  /** há contagem nova a gravar */
  sujo = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(o: OpcoesAudiencia = {}) {
    this.now = o.now ?? Date.now;
    this.pessoasServidor = o.pessoasServidor ?? (() => 0);
    this.store = o.store ?? null;
    this.presenca = new Presenca(this.now);
    this.limiteRede = new LimiteJanela(SINAIS_REDE_MIN, 60_000, this.now, 300_000);
    this.limitePaginas = new LimiteJanela(PAGINAS_PESSOA_MIN, 60_000, this.now, 300_000);
    const salvo = this.store?.ler();
    if (salvo) this.carregar(salvo);
    this.virarDia();
  }

  // ---- sinal do app ------------------------------------------------------------------------------------------

  /**
   * Sinal do app (`POST /api/audiencia`). `rede` = chave anonimizada da rede LARGA (IPv4 inteiro, IPv6 /56), `ua` =
   * User-Agent (usado só para o hash, nunca guardado). Corpo: página vista `{ g, o? }` ou presença `{ p: 1, g }` (o
   * grupo da página aberta). Devolve o intervalo do próximo sinal de presença (s). Corpo inválido → null.
   */
  sinal(rede: string, ua: string | undefined, corpo: unknown): { s: number } | null {
    const c = (corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : null) as Record<string, unknown> | null;
    if (!c) return null;
    const g = ehGrupoRota(c.g) ? c.g : null;
    const presenca = c.p === 1;
    if (!g) return null;
    const resposta = { s: this.ultimo.intervaloS };
    if (ehRoboAudiencia(ua) || !this.limiteRede.tentar(rede)) return resposta;
    this.virarDia();
    const agora = this.now();
    if (GRUPOS_FORA_DE_PESSOAS.includes(g)) {
      // widget em outro site / fonte do OBS: só a contagem do grupo (a página vista); presença deles não conta nunca —
      // um widget num portal faria cada leitor do portal virar "pessoa no Sintonia"
      if (presenca) return resposta;
      const d = this.hoje();
      d.porGrupo[g] = (d.porGrupo[g] ?? 0) + 1;
      this.marcarInicio(agora);
      return resposta;
    }
    const uaS = ua ?? '';
    const r32 = numeroDe(rede) >>> 0;
    this.presenca.marcar(chave32(this.salPresenca, rede, uaS), r32);
    const kDia = chave32(this.salDia, rede, uaS);
    if (!this.unicos.tem(kDia)) {
      const i = r32 & (this.pessoasPorRede.length - 1);
      if (this.pessoasPorRede[i] < PESSOAS_REDE_DIA && this.unicos.adicionar(kDia)) this.pessoasPorRede[i]++;
    }
    if (!presenca && this.limitePaginas.tentar(`${rede}|${uaS}`)) {
      const d = this.hoje();
      d.paginas++;
      d.porGrupo[g] = (d.porGrupo[g] ?? 0) + 1;
      const o = c.o === undefined ? null : normalizarOrigem(c.o);
      if (o) {
        d.entradas++;
        if (o in d.origens || Object.keys(d.origens).length < AUDIENCIA.maxOrigensDia) d.origens[o] = (d.origens[o] ?? 0) + 1;
        else d.origens.outros = (d.origens.outros ?? 0) + 1;
      }
      this.hora(agora).paginas++;
    }
    this.marcarInicio(agora);
    return resposta;
  }

  /**
   * Amostra do pico (timer de 10 s): SÓ o sinal das páginas (o número que pode ir para material de venda). A estimativa
   * do servidor entra só na referência do painel e na escolha do intervalo (carga).
   */
  amostrar(): void {
    this.virarDia();
    const agora = this.now();
    const intervalo = this.ultimo.intervaloS;
    const janela = (intervalo + AUDIENCIA.folgaS) * 1000;
    const sinal = arredondarPessoas(this.presenca.estimar(janela));
    const servidor = arredondarPessoas(this.pessoasServidor());
    const concentracao = this.presenca.concentracao(janela);
    const valor = sinal;
    this.ultimo = { em: agora, sinal, servidor, intervaloS: intervaloPresenca(Math.max(sinal, servidor)), concentracao };
    if (valor <= 0) return;
    if (this.desde === null) {
      this.desde = agora;
      this.sujo = true;
    }
    const p: PicoAudiencia = { valor, em: agora, fonte: 'sinal', concentracao };
    if (!this.pico || valor > this.pico.valor) {
      this.pico = p;
      this.sujo = true;
    }
    const d = this.hoje();
    if (!d.pico || valor > d.pico.valor) {
      d.pico = p;
      this.sujo = true;
    }
    const h = this.hora(agora);
    if (valor > h.pico) {
      h.pico = valor;
      this.sujo = true;
    }
  }

  /**
   * Pessoas com o site aberto agora pelo SINAL das páginas (última amostra de 10 s, arredondada): atravessa a CDN e não
   * cai pela metade quando o intervalo da presença sobe (a janela acompanha o intervalo). É a "pílula" pública.
   */
  get presencaAgora(): number {
    return this.ultimo.sinal;
  }

  /** Intervalo atual do sinal de presença (s). */
  get intervaloS(): number {
    return this.ultimo.intervaloS;
  }

  // ---- leitura ----------------------------------------------------------------------------------------------------

  /** Os números para a página /anuncie (null = nada medido ainda). Sempre o que foi medido: nada é estimado à parte. */
  publico(): AudienciaPublica | null {
    if (this.desde === null) return null;
    const dias = this.diasComHoje();
    let maior: { dia: string; unicos: number } | null = null;
    for (const d of dias) if (d.unicos > 0 && (!maior || d.unicos > maior.unicos)) maior = { dia: d.dia, unicos: d.unicos };
    return {
      desde: this.desde,
      pico: this.pico ? { valor: this.pico.valor, em: this.pico.em } : null,
      maiorDia: maior,
      paginas: dias.reduce((s, d) => s + d.paginas, 0),
    };
  }

  paraAdmin(): AudienciaAdmin {
    this.virarDia();
    const agora = this.now();
    const h0 = Math.floor(agora / HORA_MS) * HORA_MS - (AUDIENCIA.horas - 1) * HORA_MS;
    const horas: HoraAudiencia[] = [];
    for (let i = 0; i < AUDIENCIA.horas; i++) {
      const hora = h0 + i * HORA_MS;
      const h = this.horas.get(hora);
      horas.push({ hora, paginas: h?.paginas ?? 0, pico: h?.pico ?? 0 });
    }
    return {
      agora: {
        pessoas: this.ultimo.sinal,
        sinal: this.ultimo.sinal,
        servidor: this.ultimo.servidor,
        intervaloS: this.ultimo.intervaloS,
        em: this.ultimo.em,
        concentracao: this.ultimo.concentracao,
      },
      desde: this.desde,
      pico: this.pico,
      dias: this.diasComHoje().map((d) => ({ ...d, porGrupo: { ...d.porGrupo }, origens: { ...d.origens } })),
      horas,
      publico: this.publico(),
    };
  }

  /** Apaga toda a medição (testes antes do lançamento). */
  zerar(): void {
    this.desde = null;
    this.pico = null;
    this.dias = [];
    this.horas.clear();
    this.unicos = new ConjuntoU32();
    this.unicosAntes = 0;
    this.pessoasPorRede.fill(0);
    this.salDia = randomBytes(16);
    this.diaAtual = '';
    this.virarDia();
    this.sujo = true;
  }

  // ---- persistência --------------------------------------------------------------------------------------------

  toJSON(): AudienciaArquivo {
    this.podarHoras();
    return { v: 1, desde: this.desde, pico: this.pico, dias: this.diasComHoje(), horas: [...this.horas.values()].sort((a, b) => a.hora - b.hora) };
  }

  /** Restaura o arquivo (valores inválidos são ignorados). Mesmo dia = reinício: os únicos já contados ficam como piso. */
  carregar(v: unknown): boolean {
    if (!v || typeof v !== 'object' || (v as AudienciaArquivo).v !== 1) return false;
    const a = v as AudienciaArquivo;
    this.desde = ehNum(a.desde) ? a.desde : null;
    this.pico = ehPico(a.pico) ? lerPico(a.pico) : null;
    const dias: DiaAudiencia[] = [];
    for (const d of Array.isArray(a.dias) ? a.dias : []) {
      if (!d || typeof d !== 'object' || typeof d.dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.dia)) continue;
      dias.push({
        dia: d.dia,
        unicos: ehNum(d.unicos) ? Math.round(d.unicos) : 0,
        paginas: ehNum(d.paginas) ? Math.round(d.paginas) : 0,
        entradas: ehNum(d.entradas) ? Math.round(d.entradas) : 0,
        porGrupo: contagens(d.porGrupo, ehGrupoRota),
        origens: contagens(d.origens, (k) => normalizarOrigem(k) === k || k === 'outros', AUDIENCIA.maxOrigensDia + 1),
        pico: ehPico(d.pico) ? lerPico(d.pico) : null,
        reinicios: ehNum(d.reinicios) ? Math.round(d.reinicios) : 0,
      });
    }
    dias.sort((x, y) => x.dia.localeCompare(y.dia));
    this.dias = dias.slice(-AUDIENCIA.maxDias);
    this.horas.clear();
    for (const h of Array.isArray(a.horas) ? a.horas : []) {
      if (h && ehNum(h.hora) && h.hora % HORA_MS === 0) this.horas.set(h.hora, { hora: h.hora, paginas: ehNum(h.paginas) ? Math.round(h.paginas) : 0, pico: ehNum(h.pico) ? Math.round(h.pico) : 0 });
    }
    this.podarHoras();
    const hoje = diaBrasilia(this.now());
    const d = this.dias[this.dias.length - 1];
    if (d && d.dia === hoje) {
      this.unicosAntes = d.unicos;
      d.reinicios++;
      this.diaAtual = hoje;
      this.sujo = true;
    }
    return true;
  }

  /** Grava (se houver contagem nova) e espera terminar. */
  async persistir(): Promise<void> {
    if (!this.store) return;
    if (this.sujo) {
      this.sujo = false;
      this.store.salvar(this.toJSON());
    }
    await this.store.flush();
  }

  /** Liga a amostragem do pico (main.ts). */
  iniciar(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.amostrar(), AMOSTRA_MS);
    (this.timer as { unref?: () => void }).unref?.();
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---- internos ---------------------------------------------------------------------------------------------------

  private marcarInicio(t: number) {
    if (this.desde === null) this.desde = t;
    this.sujo = true;
  }

  /** Virada do dia (Brasília): o conjunto e o sal do dia anterior são descartados; fica só a contagem. */
  private virarDia() {
    const hoje = diaBrasilia(this.now());
    if (hoje === this.diaAtual) return;
    if (this.diaAtual) this.fecharDia();
    this.diaAtual = hoje;
    this.salDia = randomBytes(16);
    this.unicos = new ConjuntoU32();
    this.pessoasPorRede.fill(0);
    if (this.dias[this.dias.length - 1]?.dia !== hoje) this.unicosAntes = 0;
  }

  /** Grava os únicos do dia que está terminando no registro dele. */
  private fecharDia() {
    const d = this.dias.find((x) => x.dia === this.diaAtual);
    if (d) d.unicos = Math.max(this.unicosAntes, this.unicos.tamanho);
    this.unicosAntes = 0;
    this.sujo = true;
  }

  private hoje(): DiaAudiencia {
    let d = this.dias[this.dias.length - 1];
    if (!d || d.dia !== this.diaAtual) {
      d = { dia: this.diaAtual, unicos: 0, paginas: 0, entradas: 0, porGrupo: {}, origens: {}, pico: null, reinicios: 0 };
      this.dias.push(d);
      if (this.dias.length > AUDIENCIA.maxDias) this.dias.splice(0, this.dias.length - AUDIENCIA.maxDias);
    }
    return d;
  }

  /** Dias com os únicos de hoje atualizados (o conjunto vivo ou o piso de antes de um reinício). */
  private diasComHoje(): DiaAudiencia[] {
    const ultimo = this.dias[this.dias.length - 1];
    if (ultimo && ultimo.dia === this.diaAtual) ultimo.unicos = Math.max(this.unicosAntes, this.unicos.tamanho);
    return this.dias;
  }

  private hora(t: number): HoraAudiencia {
    const hora = Math.floor(t / HORA_MS) * HORA_MS;
    let h = this.horas.get(hora);
    if (!h) {
      h = { hora, paginas: 0, pico: 0 };
      this.horas.set(hora, h);
      this.podarHoras();
    }
    return h;
  }

  private podarHoras() {
    const lim = Math.floor(this.now() / HORA_MS) * HORA_MS - (AUDIENCIA.horas - 1) * HORA_MS;
    for (const k of this.horas.keys()) if (k < lim) this.horas.delete(k);
  }
}
