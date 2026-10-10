/**
 * Serviço das imagens de compartilhamento (OG): cache LRU dos PNGs prontos + fila serial de renderização.
 *
 *  - Chave = rota normalizada (ex.: `mun|pres-t1|SP|71072`); cada entrada guarda o `sub` com que foi gerada:
 *    "versão|modo". Versão = versão do admin (imagens ao vivo) ou versão dos arquivos de dados (imagens estáticas);
 *    modo = fonte + anonimização (ou 'estatico').
 *  - Fresca (mesmo `sub`, dentro do TTL) → servida da memória. Vencida do MESMO modo (dentro de `staleMs`) →
 *    servida na hora e renovada em segundo plano. Troca de modo (real ↔ simulação, nomes reais ↔ anonimizado)
 *    sempre espera a imagem nova: a marca "SIMULAÇÃO" nunca pode faltar nem sobrar, e nome/foto real nunca
 *    acompanha número fictício.
 *  - Renderização serial (satori ocupa a thread principal ~0,2–0,4 s por imagem): uma por vez e no máximo
 *    `filaMax` esperando; além disso → 503 com Retry-After (a CDN/o robô tenta de novo).
 *  - LRU por número de entradas e por bytes (as entradas com renderização em curso nunca são descartadas).
 */

export interface OgPronta {
  png: Buffer;
  /** "versão|modo" do estado com que a imagem foi gerada. */
  sub: string;
  /** Cabeçalhos extras da resposta (ex.: x-og-fotos). */
  headers?: Record<string, string>;
}

interface Entrada {
  png: Buffer | null;
  headers: Record<string, string>;
  em: number;
  sub: string;
  pendente: Promise<OgPronta> | null;
}

/** Fila cheia (o app responde 503 com Retry-After). */
export class FilaOgCheia extends Error {
  readonly status = 503;
  readonly headers = { 'retry-after': '10' };
  constructor() {
    super('Gerando muitas imagens agora; tente de novo em instantes.');
  }
}

export interface ServicoOgOpcoes {
  now?: () => number;
  /** Erros de renderização (o chamador recebe a rejeição; aqui só registra). */
  aoFalhar?: (chave: string, err: unknown) => void;
  maxEntradas?: number;
  maxBytes?: number;
  filaMax?: number;
}

export interface PedidoOg {
  chave: string;
  /** "versão|modo" do estado atual. */
  sub: string;
  /** Imagem fresca por até `ttlMs` (Infinity = enquanto o `sub` não mudar). */
  ttlMs: number;
  /** Vencida do mesmo modo ainda serve (enquanto a nova é gerada) por até `staleMs` desde a geração. */
  staleMs: number;
  montar: () => Promise<OgPronta>;
  /** Modo atual no fim da geração (para refazer se mudou durante a espera). Padrão: o do `sub` pedido. */
  modoAtual?: () => string;
}

export interface OgServida {
  png: Buffer;
  sub: string;
  /** Quando foi gerada (entra no ETag). */
  em: number;
  headers: Record<string, string>;
  /** veio da memória (fresca ou vencida) */
  hit: boolean;
}

export const modoDoSub = (sub: string) => sub.slice(sub.indexOf('|') + 1);

export class ServicoOg {
  private readonly lru = new Map<string, Entrada>();
  private bytes = 0;
  private fila: Promise<unknown> = Promise.resolve();
  private naFila = 0;
  private readonly now: () => number;
  private readonly maxEntradas: number;
  private readonly maxBytes: number;
  private readonly filaMax: number;

  constructor(private readonly opts: ServicoOgOpcoes = {}) {
    this.now = opts.now ?? Date.now;
    this.maxEntradas = opts.maxEntradas ?? 256;
    this.maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
    this.filaMax = opts.filaMax ?? 16;
  }

  get tamanho() {
    return this.lru.size;
  }

  get emMemoria() {
    return this.bytes;
  }

  get pendentes() {
    return this.naFila;
  }

  /** Entrada sem mexer na ordem do LRU (testes/monitor). */
  espiar(chave: string): { sub: string; em: number; bytes: number } | null {
    const e = this.lru.get(chave);
    return e?.png ? { sub: e.sub, em: e.em, bytes: e.png.length } : null;
  }

  private tocar(chave: string): Entrada | undefined {
    const e = this.lru.get(chave);
    if (e) {
      this.lru.delete(chave);
      this.lru.set(chave, e);
    }
    return e;
  }

  private podar() {
    if (this.lru.size <= this.maxEntradas && this.bytes <= this.maxBytes) return;
    for (const [k, e] of this.lru) {
      if (this.lru.size <= this.maxEntradas && this.bytes <= this.maxBytes) break;
      if (e.pendente) continue;
      this.lru.delete(k);
      this.bytes -= e.png?.length ?? 0;
    }
  }

  /** Gera (ou junta-se à geração em curso de) uma chave. Lança FilaOgCheia se a fila estiver cheia. */
  renderizar(chave: string, montar: () => Promise<OgPronta>): Promise<OgPronta> {
    let e = this.tocar(chave);
    if (!e) {
      e = { png: null, headers: {}, em: 0, sub: '', pendente: null };
      this.lru.set(chave, e);
    }
    if (e.pendente) return e.pendente;
    if (this.naFila >= this.filaMax) throw new FilaOgCheia();
    const ent = e;
    this.naFila++;
    const p: Promise<OgPronta> = this.fila
      .catch(() => undefined)
      .then(async () => {
        try {
          const pronta = await montar();
          // a entrada pode ter saído do LRU enquanto esperava (não sai: pendentes nunca são podados)
          this.bytes += pronta.png.length - (ent.png?.length ?? 0);
          Object.assign(ent, { png: pronta.png, headers: pronta.headers ?? {}, em: this.now(), sub: pronta.sub });
          return pronta;
        } finally {
          this.naFila--;
          ent.pendente = null;
          this.podar();
        }
      });
    this.fila = p;
    ent.pendente = p;
    p.catch((err) => {
      if (!ent.png && !ent.pendente && this.lru.get(chave) === ent) this.lru.delete(chave);
      this.opts.aoFalhar?.(chave, err);
    });
    this.podar();
    return p;
  }

  /** Imagem para o pedido conforme as regras de frescor (ver o cabeçalho do arquivo). */
  async obter(pd: PedidoOg): Promise<OgServida> {
    const modo = modoDoSub(pd.sub);
    const e = this.tocar(pd.chave);
    const agora = this.now();
    if (e?.png && e.sub === pd.sub && agora - e.em < pd.ttlMs) {
      return { png: e.png, sub: e.sub, em: e.em, headers: e.headers, hit: true };
    }
    if (e?.png && modoDoSub(e.sub) === modo && agora - e.em < pd.staleMs) {
      const servida = { png: e.png, sub: e.sub, em: e.em, headers: e.headers, hit: true };
      try {
        void this.renderizar(pd.chave, pd.montar).catch(() => undefined);
      } catch {
        /* fila cheia: segue com a vencida */
      }
      return servida;
    }
    let pronta = await this.renderizar(pd.chave, pd.montar);
    // a geração em andamento podia ser do modo anterior (ex.: nomes reais → anonimizado): gera de novo
    const atual = pd.modoAtual ? pd.modoAtual() : modo;
    if (modoDoSub(pronta.sub) !== atual) pronta = await this.renderizar(pd.chave, pd.montar);
    const em = this.lru.get(pd.chave)?.em ?? agora;
    return { png: pronta.png, sub: pronta.sub, em, headers: pronta.headers ?? {}, hit: false };
  }

  limpar() {
    for (const [k, e] of this.lru) {
      if (e.pendente) continue;
      this.lru.delete(k);
      this.bytes -= e.png?.length ?? 0;
    }
  }
}
