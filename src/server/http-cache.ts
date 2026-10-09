/**
 * Cache HTTP pensado para CDN + cache de respostas prontas na origem.
 *
 *  - ETag fraco por (versão do admin, balde do instante dos dados, rota): `W/"v12-s1792961160-3fa2c1"`.
 *    O corpo traz `geradoEm`/`simNow` de parede, mas dois corpos com o mesmo ETag fraco são
 *    semanticamente iguais (mesmos números) — por isso fraco.
 *  - If-None-Match → 304 sem corpo.
 *  - Respostas montadas (JSON + gzip + brotli) ficam em memória por segundo de parede: sob carga, cada rota é
 *    calculada/serializada/comprimida no máximo 1×/s, e requisições simultâneas esperam a mesma promessa.
 */
import { brotliCompress, constants as zc, gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipP = promisify(gzip);
const brotliP = promisify(brotliCompress);

export type Codificacao = 'br' | 'gzip' | null;

/** Escolhe a compressão pelo Accept-Encoding (br > gzip; respeita q=0). */
export function negociar(acceptEncoding: string | null | undefined): Codificacao {
  if (!acceptEncoding) return null;
  let br = false;
  let gz = false;
  for (const parte of acceptEncoding.toLowerCase().split(',')) {
    const [nome, ...params] = parte.trim().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    if (q && Number(q.slice(2)) === 0) continue;
    if (nome === 'br') br = true;
    else if (nome === 'gzip' || nome === 'x-gzip' || nome === '*') gz = true;
  }
  return br ? 'br' : gz ? 'gzip' : null;
}

/** FNV-1a 32 bits em hex (identifica a rota no ETag). */
export function hashCurto(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

export function etagFraco(...partes: (string | number)[]): string {
  return `W/"${partes.join('-')}"`;
}

/** If-None-Match casa com o ETag (comparação fraca, aceita lista e `*`)? */
export function casaEtag(ifNoneMatch: string | null | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const alvo = etag.replace(/^W\//, '');
  for (const t of ifNoneMatch.split(',')) {
    const v = t.trim();
    if (v === '*' || v.replace(/^W\//, '') === alvo) return true;
  }
  return false;
}

export const COMPRESSIVEL_MIN = 1024;

export interface CorpoPronto {
  bruto: Buffer;
  gz?: Promise<Buffer>;
  br?: Promise<Buffer>;
}

/** Comprime sob demanda e memoiza no próprio corpo (brotli rápido para conteúdo dinâmico). */
export function corpoCodificado(c: CorpoPronto, cod: Codificacao, estatico = false): Promise<Buffer> | Buffer {
  if (!cod || c.bruto.length < COMPRESSIVEL_MIN) return c.bruto;
  if (cod === 'gzip') {
    c.gz ??= gzipP(c.bruto, { level: estatico ? 9 : 6 });
    return c.gz;
  }
  c.br ??= brotliP(c.bruto, {
    params: {
      [zc.BROTLI_PARAM_QUALITY]: estatico ? 10 : 5,
      [zc.BROTLI_PARAM_SIZE_HINT]: c.bruto.length,
      [zc.BROTLI_PARAM_MODE]: zc.BROTLI_MODE_TEXT,
    },
  });
  return c.br;
}

interface Entrada {
  seg: number;
  p: Promise<CorpoPronto>;
}

/** Cache de respostas por (chave, segundo de parede), com deduplicação de requisições simultâneas. */
export class CacheRespostas {
  private m = new Map<string, Entrada>();
  private ultimoSeg = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntradas = 1_000,
  ) {}

  get tamanho() {
    return this.m.size;
  }

  /**
   * Devolve o corpo da chave no segundo atual, montando-o com `montar` se preciso.
   * `hit` diz se veio do cache. Falhas não ficam no cache.
   */
  obter(chave: string, montar: () => Promise<CorpoPronto> | CorpoPronto): { p: Promise<CorpoPronto>; hit: boolean } {
    const seg = Math.floor(this.now() / 1000);
    if (seg !== this.ultimoSeg) {
      // virou o segundo: corpos antigos não servem mais (libera memória já)
      this.ultimoSeg = seg;
      this.podar(seg);
    }
    const e = this.m.get(chave);
    if (e && e.seg === seg) return { p: e.p, hit: true };
    const p = Promise.resolve().then(montar);
    this.m.set(chave, { seg, p });
    p.catch(() => {
      if (this.m.get(chave)?.p === p) this.m.delete(chave);
    });
    if (this.m.size > this.maxEntradas) this.podar(seg);
    return { p, hit: false };
  }

  private podar(seg: number) {
    for (const [k, e] of this.m) if (e.seg < seg) this.m.delete(k);
    // ainda cheio (muitas rotas distintas no mesmo segundo): descarta as mais antigas
    while (this.m.size > this.maxEntradas) this.m.delete(this.m.keys().next().value as string);
  }

  limpar() {
    this.m.clear();
  }
}
