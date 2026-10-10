/**
 * Métricas operacionais do servidor (monitor do admin + linha de resumo por minuto no log).
 *
 *  - Requisições por minuto: anel de 60 segundos.
 *  - Latência: amostras do minuto corrente (p50/p95/p99 no resumo).
 *  - Clientes ativos estimados (30 s) SEM guardar IP: cada cliente vira 1 bit num mapa de bits
 *    (hash SHA-256 do IP com sal aleatório do processo, trocado a cada hora). A contagem usa "linear
 *    counting" (n ≈ −m·ln(zeros/m)), que estima milhões de clientes distintos com 128 KB por janela e
 *    não permite recuperar quem acessou. Janela deslizante = 3 baldes de 10 s.
 *    Atrás de CDN, só as requisições que chegam à origem entram na conta.
 *  - "Pessoas agora" (LiveStatus.pessoasAgora): a mesma estimativa, recalculada no máximo a cada 5 s e
 *    ARREDONDADA (< 10 exato; < 1.000 em dezenas; depois em centenas) — a contagem é estimada, e exibir
 *    "1.237" sugeriria uma precisão que ela não tem.
 */
import { createHash, randomBytes } from 'node:crypto';

const BITS = 1 << 20; // 1.048.576 bits = 128 KB por balde
const BALDE_MS = 10_000;
const N_BALDES = 3;

export class ClientesAtivos {
  private baldes: { inicio: number; bits: Uint8Array }[] = [];
  private sal = randomBytes(16);
  private salEm: number;

  constructor(private readonly now: () => number = Date.now) {
    this.salEm = now();
  }

  /** Registra um cliente (IP ou outro identificador). Nada além de 1 bit é guardado. */
  registrar(id: string): void {
    const t = this.now();
    if (t - this.salEm > 3600_000) {
      this.sal = randomBytes(16);
      this.salEm = t;
    }
    const inicio = Math.floor(t / BALDE_MS) * BALDE_MS;
    let b = this.baldes[this.baldes.length - 1];
    if (!b || b.inicio !== inicio) {
      b = { inicio, bits: new Uint8Array(BITS / 8) };
      this.baldes.push(b);
      while (this.baldes.length > N_BALDES) this.baldes.shift();
    }
    const h = createHash('sha256').update(this.sal).update(id).digest();
    const pos = h.readUInt32BE(0) & (BITS - 1);
    b.bits[pos >>> 3] |= 1 << (pos & 7);
  }

  /** Estimativa de clientes distintos nos últimos ~30 s. */
  estimar(): number {
    const t = this.now();
    const vivos = this.baldes.filter((b) => b.inicio > t - N_BALDES * BALDE_MS);
    if (!vivos.length) return 0;
    const uniao = new Uint8Array(BITS / 8);
    for (const b of vivos) for (let i = 0; i < uniao.length; i++) uniao[i] |= b.bits[i];
    let um = 0;
    for (let i = 0; i < uniao.length; i++) um += POPCOUNT[uniao[i]];
    const zeros = BITS - um;
    if (zeros === 0) return BITS; // saturado (> ~10 milhões)
    return Math.round(-BITS * Math.log(zeros / BITS));
  }
}

const POPCOUNT = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = (i & 1) + t[i >> 1];
  return t;
})();

/** Arredonda a estimativa de pessoas: < 10 exato; < 1.000 em dezenas; daí em diante, em centenas. */
export function arredondarPessoas(n: number): number {
  const v = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  if (v < 10) return v;
  if (v < 1000) return Math.round(v / 10) * 10;
  return Math.round(v / 100) * 100;
}

/** Intervalo mínimo entre recálculos de `pessoasAgora` (a união dos baldes percorre 384 KB). */
const PESSOAS_TTL_MS = 5_000;

export interface ResumoMinuto {
  requisicoes: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  erros5xx: number;
  cacheHit: number;
  respostas304: number;
}

export class Metricas {
  private reqSlots = new Int32Array(60);
  private reqSeg = new Float64Array(60).fill(-1);
  private latencias: number[] = [];
  private nMinuto = 0;
  private erros5xx = 0;
  private hits = 0;
  private misses = 0;
  private n304 = 0;
  readonly clientes: ClientesAtivos;
  private pessoas: { em: number; v: number } | null = null;
  /** Tempo da última montagem de resposta não cacheada (snapshot + JSON + compressão), em ms. */
  ultimoCalculoMs = 0;
  readonly iniciadoEm: number;

  constructor(private readonly now: () => number = Date.now) {
    this.clientes = new ClientesAtivos(now);
    this.iniciadoEm = now();
  }

  requisicao(ms: number, status: number): void {
    const s = Math.floor(this.now() / 1000);
    const i = s % 60;
    if (this.reqSeg[i] !== s) {
      this.reqSeg[i] = s;
      this.reqSlots[i] = 0;
    }
    this.reqSlots[i]++;
    this.nMinuto++;
    // amostragem: guarda até 50 mil latências por minuto (reservatório), conta todas
    if (this.latencias.length < 50_000) this.latencias.push(ms);
    else {
      const j = Math.floor(Math.random() * this.nMinuto);
      if (j < 50_000) this.latencias[j] = ms;
    }
    if (status >= 500) this.erros5xx++;
    if (status === 304) this.n304++;
  }

  cache(hit: boolean): void {
    if (hit) this.hits++;
    else this.misses++;
  }

  /** Pessoas agora (clientes ativos estimados nos últimos ~30 s), arredondado e com cache de 5 s. */
  pessoasAgora(): number {
    const t = this.now();
    if (!this.pessoas || t - this.pessoas.em >= PESSOAS_TTL_MS || t < this.pessoas.em) {
      this.pessoas = { em: t, v: arredondarPessoas(this.clientes.estimar()) };
    }
    return this.pessoas.v;
  }

  requisicoesUltimoMinuto(): number {
    const s = Math.floor(this.now() / 1000);
    let n = 0;
    for (let i = 0; i < 60; i++) if (this.reqSeg[i] > s - 60) n += this.reqSlots[i];
    return n;
  }

  /** Fecha o minuto: devolve o resumo e zera as amostras. */
  fecharMinuto(): ResumoMinuto {
    const l = this.latencias.sort((a, b) => a - b);
    const q = (p: number) => (l.length ? l[Math.min(l.length - 1, Math.floor(p * l.length))] : 0);
    const r: ResumoMinuto = {
      requisicoes: this.nMinuto,
      p50: q(0.5),
      p95: q(0.95),
      p99: q(0.99),
      max: l.length ? l[l.length - 1] : 0,
      erros5xx: this.erros5xx,
      cacheHit: this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
      respostas304: this.n304,
    };
    this.latencias = [];
    this.nMinuto = 0;
    this.erros5xx = 0;
    this.hits = 0;
    this.misses = 0;
    this.n304 = 0;
    return r;
  }
}
