/**
 * Alcance dos anúncios (pessoas diferentes que viram a marca), por ESTIMATIVA — HyperLogLog (ARCHITECTURE §10.2, item
 * 10; anunciantes v2, E15). LGPD: nada de pessoa é guardado; cada impressão contada vira só o "registrador mais alto"
 * de um vetor de 4.096 bytes por anúncio e período, de onde não se recupera nenhuma chave.
 *
 *  - HyperLogLog com p = 12 (4.096 registradores, erro padrão ≈ 1,6%); o hash são os 8 primeiros bytes do sha256 da
 *    chave de pessoa (rede + navegador, E14 — já com o sal do processo);
 *  - por anúncio, um esboço por dia de Brasília ('AAAA-MM-DD') e um da noite da eleição ('noite', só dentro de
 *    `NOITE_ELEICAO`);
 *  - o sal da rede troca a cada processo: a mesma pessoa, depois de um reinício, vira outra chave. Por isso cada
 *    processo grava o seu SEGMENTO, e a estimativa é o MAIOR valor entre os segmentos (conservadora: nunca soma o mesmo
 *    público duas vezes). Campanha = união dos dias do segmento (a partir do dia do início, se houver) e depois o
 *    máximo entre os segmentos;
 *  - segmentos sem atualização há mais de 14 dias são podados; os registradores vão em base64 no
 *    STATE_DIR/anuncios-metricas.json (campo `alcance`).
 */
import { createHash, randomBytes } from 'node:crypto';
import { NOITE_ELEICAO } from '../shared/relatorio';

/** Bits do índice (p) e número de registradores (m = 2^p). */
export const HLL_P = 12;
export const HLL_M = 1 << HLL_P;
/** Segmentos guardados por no máximo 14 dias desde a última atualização. */
export const RETENCAO_SEGMENTO_MS = 14 * 86_400_000;
/** Teto de segmentos guardados (reinícios); acima disso, saem os mais antigos. */
export const MAX_SEGMENTOS = 48;
/** Chave do esboço da noite da eleição. */
export const CHAVE_NOITE = 'noite';

const HORA = 3_600_000;
/** 'AAAA-MM-DD' do dia de Brasília (UTC−3 fixo desde 2019) de um instante. */
export const diaBrasilia = (t: number) => new Date(t - 3 * HORA).toISOString().slice(0, 10);

/** 64 bits de hash da chave (os 8 primeiros bytes do sha256) como dois inteiros de 32 bits. */
function hash64(chave: string): [number, number] {
  const d = createHash('sha256').update(chave).digest();
  return [d.readUInt32BE(0), d.readUInt32BE(4)];
}

/** Acrescenta uma chave a um esboço (registradores de 1 byte). */
export function hllAdicionar(reg: Uint8Array, chave: string): boolean {
  const [a, b] = hash64(chave);
  const idx = a >>> (32 - HLL_P);
  // os 52 bits restantes: 20 de `a` e 32 de `b`; posto = posição do 1º bit 1 (1-based); tudo zero = 53
  const resto = a & ((1 << (32 - HLL_P)) - 1);
  const posto = resto !== 0 ? Math.clz32(resto) - HLL_P + 1 : 32 - HLL_P + Math.clz32(b) + 1;
  if (posto > reg[idx]) {
    reg[idx] = posto;
    return true;
  }
  return false;
}

/** Estimativa de cardinalidade de um esboço (HyperLogLog com a correção de contagem linear para poucos elementos). */
export function hllEstimar(reg: Uint8Array): number {
  const m = reg.length;
  let soma = 0;
  let zeros = 0;
  for (let i = 0; i < m; i++) {
    soma += 2 ** -reg[i];
    if (reg[i] === 0) zeros++;
  }
  const alfa = 0.7213 / (1 + 1.079 / m);
  const e = (alfa * m * m) / soma;
  if (e <= 2.5 * m && zeros > 0) return m * Math.log(m / zeros);
  return e;
}

/** União (registrador a registrador, o maior): idempotente, comutativa. Muda `destino`. */
export function hllUnir(destino: Uint8Array, outro: Uint8Array): Uint8Array {
  for (let i = 0; i < destino.length; i++) if (outro[i] > destino[i]) destino[i] = outro[i];
  return destino;
}

/** Um segmento = os esboços de um processo: anúncio → período ('AAAA-MM-DD' | 'noite') → registradores. */
interface Segmento {
  seg: string;
  criadoEm: number;
  atualizadoEm: number;
  esbocos: Map<string, Map<string, Uint8Array>>;
}

/** Formato gravado (dentro de anuncios-metricas.json, campo `alcance`). */
export interface AlcanceArquivo {
  v: 1;
  segmentos: { seg: string; criadoEm: number; atualizadoEm: number; a: Record<string, Record<string, string>> }[];
}

const RE_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RE_PERIODO = /^(\d{4}-\d{2}-\d{2}|noite)$/;
const inteiroPositivo = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export class AlcanceAnuncios {
  /** o segmento deste processo (o único que recebe chaves) */
  private readonly atual: Segmento;
  /** segmentos de processos anteriores (só leitura) */
  private anteriores: Segmento[] = [];
  /** há chave nova ainda não gravada */
  sujo = false;

  constructor(private readonly now: () => number = Date.now) {
    const t = now();
    this.atual = { seg: randomBytes(6).toString('hex'), criadoEm: t, atualizadoEm: t, esbocos: new Map() };
  }

  /** Pessoa que viu o anúncio `id` agora (só impressões contadas). */
  adicionar(id: string, pessoa: string): void {
    const t = this.now();
    let porPeriodo = this.atual.esbocos.get(id);
    if (!porPeriodo) {
      porPeriodo = new Map();
      this.atual.esbocos.set(id, porPeriodo);
    }
    const periodos = [diaBrasilia(t)];
    if (t >= NOITE_ELEICAO.inicio && t < NOITE_ELEICAO.fim) periodos.push(CHAVE_NOITE);
    for (const p of periodos) {
      let reg = porPeriodo.get(p);
      if (!reg) {
        reg = new Uint8Array(HLL_M);
        porPeriodo.set(p, reg);
      }
      if (hllAdicionar(reg, pessoa)) this.sujo = true;
    }
    this.atual.atualizadoEm = t;
  }

  /** Estimativa num segmento (null = o segmento não tem nada daquele anúncio/período). */
  private estimarNo(s: Segmento, id: string, periodo: 'campanha' | 'noite', desdeDia: string | null): number | null {
    const porPeriodo = s.esbocos.get(id);
    if (!porPeriodo) return null;
    if (periodo === 'noite') {
      const reg = porPeriodo.get(CHAVE_NOITE);
      return reg ? hllEstimar(reg) : null;
    }
    let uniao: Uint8Array | null = null;
    for (const [p, reg] of porPeriodo) {
      if (p === CHAVE_NOITE || (desdeDia && p < desdeDia)) continue;
      uniao = hllUnir(uniao ?? new Uint8Array(HLL_M), reg);
    }
    return uniao ? hllEstimar(uniao) : null;
  }

  /**
   * Pessoas alcançadas (estimativa arredondada): o MAIOR valor entre os segmentos (cada processo tem o seu sal).
   * `inicio` (do anúncio) limita a campanha aos dias a partir do dia dele. null = nenhuma contagem.
   */
  estimar(id: string, periodo: 'campanha' | 'noite', inicio?: number | null): number | null {
    const desdeDia = inicio ? diaBrasilia(inicio) : null;
    let max: number | null = null;
    for (const s of [this.atual, ...this.anteriores]) {
      const e = this.estimarNo(s, id, periodo, desdeDia);
      if (e !== null && (max === null || e > max)) max = e;
    }
    return max === null ? null : Math.round(max);
  }

  /**
   * Quantos segmentos (processos) têm contagem do anúncio no período. Mais de 1 = o servidor reiniciou no meio: o
   * alcance é o MAIOR entre eles, então sai abaixo do real (estimativa conservadora) — a página do relatório avisa.
   */
  segmentosCom(id: string, periodo: 'campanha' | 'noite', inicio?: number | null): number {
    const desdeDia = inicio ? diaBrasilia(inicio) : null;
    let n = 0;
    for (const s of [this.atual, ...this.anteriores]) if (this.estimarNo(s, id, periodo, desdeDia) !== null) n++;
    return n;
  }

  /** Anúncios com alguma contagem de alcance (em qualquer segmento). */
  ids(): string[] {
    const out = new Set<string>();
    for (const s of [this.atual, ...this.anteriores]) for (const id of s.esbocos.keys()) out.add(id);
    return [...out].sort();
  }

  /** Quantos segmentos (este processo + anteriores guardados). */
  get segmentos(): number {
    return 1 + this.anteriores.length;
  }

  /** Tira os segmentos parados há mais de 14 dias (e os excedentes, mais antigos primeiro). */
  podar(): void {
    const lim = this.now() - RETENCAO_SEGMENTO_MS;
    const antes = this.anteriores.length;
    this.anteriores = this.anteriores
      .filter((s) => s.atualizadoEm >= lim)
      .sort((a, b) => b.atualizadoEm - a.atualizadoEm)
      .slice(0, MAX_SEGMENTOS - 1);
    if (this.anteriores.length !== antes) this.sujo = true;
  }

  toJSON(): AlcanceArquivo {
    this.podar();
    const ser = (s: Segmento) => {
      const a: Record<string, Record<string, string>> = {};
      for (const [id, porPeriodo] of s.esbocos) {
        a[id] = {};
        for (const [p, reg] of porPeriodo) a[id][p] = Buffer.from(reg.buffer, reg.byteOffset, reg.byteLength).toString('base64');
      }
      return { seg: s.seg, criadoEm: s.criadoEm, atualizadoEm: s.atualizadoEm, a };
    };
    const atual = this.atual.esbocos.size ? [ser(this.atual)] : [];
    return { v: 1, segmentos: [...atual, ...this.anteriores.map(ser)] };
  }

  /**
   * Restaura os segmentos gravados (de processos anteriores, só leitura; o deste processo continua novo). Conteúdo
   * inválido é ignorado; nunca lança.
   */
  carregar(v: unknown): boolean {
    if (!v || typeof v !== 'object') return false;
    const x = v as Partial<AlcanceArquivo>;
    if (x.v !== 1 || !Array.isArray(x.segmentos)) return false;
    const vistos = new Set([this.atual.seg, ...this.anteriores.map((s) => s.seg)]);
    for (const s of x.segmentos) {
      if (!s || typeof s !== 'object' || typeof s.seg !== 'string' || !/^[a-f0-9]{6,32}$/.test(s.seg) || vistos.has(s.seg)) continue;
      const esbocos = new Map<string, Map<string, Uint8Array>>();
      for (const [id, porPeriodo] of Object.entries(s.a && typeof s.a === 'object' ? s.a : {})) {
        if (!RE_ID.test(id) || !porPeriodo || typeof porPeriodo !== 'object') continue;
        const m = new Map<string, Uint8Array>();
        for (const [p, b64] of Object.entries(porPeriodo)) {
          if (!RE_PERIODO.test(p) || typeof b64 !== 'string') continue;
          const buf = Buffer.from(b64, 'base64');
          if (buf.length !== HLL_M) continue;
          m.set(p, new Uint8Array(buf));
        }
        if (m.size) esbocos.set(id, m);
      }
      vistos.add(s.seg);
      this.anteriores.push({ seg: s.seg, criadoEm: inteiroPositivo(s.criadoEm), atualizadoEm: inteiroPositivo(s.atualizadoEm), esbocos });
    }
    this.podar();
    return true;
  }
}
