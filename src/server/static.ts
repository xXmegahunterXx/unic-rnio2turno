/**
 * Arquivos do build (dist/) em produção:
 *  - /assets/* (nomes com hash do Vite): cache de 1 ano, `immutable`;
 *  - demais arquivos (favicon, data/**, geo/** — inclusive secao/, locais/, perfil/, fotos/, candidatos/,
 *    cargos/, municipios-br.json, br-mun.json): 1 h no navegador, 1 dia na CDN (+ stale-while-revalidate),
 *    com ETag; os JSONs de dados não têm hash no nome, então o navegador revalida (304) depois de 1 h;
 *  - páginas (SPA): index.html com meta tags da rota, `no-cache`; rota desconhecida → 404 com a SPA;
 *  - compressão br (q10) / gzip (9) calculada UMA vez por arquivo e guardada em memória junto com o bruto
 *    (arquivos ≤ 32 MB; orçamento total de 384 MB com descarte do menos usado). Ex.: locais/sp.json 2,5 MB →
 *    br 0,5 MB. `aquecer()` pré-comprime data/ e geo/ em segundo plano (1 arquivo por vez, para não ocupar o
 *    pool de threads que também comprime as respostas da API).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, normalize, resolve, sep } from 'node:path';
import { type CorpoPronto, corpoCodificado, negociar, casaEtag, COMPRESSIVEL_MIN } from './http-cache';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
};
const COMPRESSIVEIS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt', '.xml', '.webmanifest', '.ico']);
const MAX_EM_MEMORIA = 32 * 1024 * 1024;
const ORCAMENTO_BYTES = 384 * 1024 * 1024;

interface Arquivo extends CorpoPronto {
  tipo: string;
  etag: string;
  mtimeMs: number;
  tamanho: number;
  comprimir: boolean;
}

export interface RespostaEstatica {
  status: number;
  headers: Record<string, string>;
  body: Buffer | Promise<Buffer> | null;
}

export class Estaticos {
  readonly raiz: string;
  private cache = new Map<string, Arquivo>();
  private bytes = 0;

  constructor(raiz: string) {
    this.raiz = resolve(raiz);
  }

  /** Caminho absoluto seguro (dentro da raiz) ou null. */
  resolver(pathname: string): string | null {
    let p: string;
    try {
      p = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    if (p.includes('\0') || p.includes('\\')) return null;
    const abs = resolve(this.raiz, `.${normalize(`/${p}`)}`);
    if (abs !== this.raiz && !abs.startsWith(this.raiz + sep)) return null;
    return abs;
  }

  private carregar(abs: string): Arquivo | null {
    let st;
    try {
      st = statSync(abs);
    } catch {
      return null;
    }
    if (!st.isFile()) return null;
    const hit = this.cache.get(abs);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.tamanho === st.size) {
      this.cache.delete(abs); // LRU: reinsere no fim
      this.cache.set(abs, hit);
      return hit;
    }
    const ext = extname(abs).toLowerCase();
    const arq: Arquivo = {
      bruto: readFileSync(abs),
      tipo: TIPOS[ext] ?? 'application/octet-stream',
      etag: `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`,
      mtimeMs: st.mtimeMs,
      tamanho: st.size,
      comprimir: COMPRESSIVEIS.has(ext) && st.size >= COMPRESSIVEL_MIN,
    };
    if (hit) {
      this.cache.delete(abs);
      this.bytes -= hit.tamanho;
    }
    if (st.size <= MAX_EM_MEMORIA) {
      // descarta os menos usados até caber (o comprimido fica junto do bruto e sai com ele)
      for (const [k, v] of this.cache) {
        if (this.bytes + st.size <= ORCAMENTO_BYTES) break;
        this.cache.delete(k);
        this.bytes -= v.tamanho;
      }
      this.cache.set(abs, arq);
      this.bytes += st.size;
    } else arq.comprimir = false; // grande demais para guardar: comprimir a cada requisição custaria caro
    return arq;
  }

  cacheControl(pathname: string): string {
    if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
    return 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';
  }

  /** Serve um arquivo existente (ou null para seguir para a SPA/404). */
  arquivo(pathname: string, acceptEncoding: string | null, ifNoneMatch: string | null, head = false): RespostaEstatica | null {
    const abs = this.resolver(pathname);
    if (!abs) return { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: Buffer.from('Caminho inválido') };
    if (basename(abs) === 'index.html') return null; // index.html passa pela injeção de meta (rota da SPA)
    let arq = this.carregar(abs);
    if (!arq) {
      // index.html usa caminhos relativos (./favicon.svg) → em rotas aninhadas, cai na raiz
      const raizArq = join(this.raiz, basename(abs));
      if (extname(abs) && basename(abs) !== 'index.html') arq = this.carregar(raizArq);
      if (!arq) return null;
    }
    const headers: Record<string, string> = {
      'content-type': arq.tipo,
      'cache-control': this.cacheControl(pathname),
      etag: arq.etag,
      'x-content-type-options': 'nosniff',
    };
    if (arq.comprimir) headers.vary = 'Accept-Encoding';
    if (casaEtag(ifNoneMatch, arq.etag)) return { status: 304, headers, body: null };
    const cod = arq.comprimir ? negociar(acceptEncoding) : null;
    if (cod) headers['content-encoding'] = cod;
    return { status: 200, headers, body: head ? null : corpoCodificado(arq, cod, true) };
  }

  /**
   * Pré-comprime (br e gzip) os arquivos compressíveis de `subdirs` (ex.: ['data', 'geo']), um por vez.
   * Resolve com a contagem; nunca rejeita.
   */
  async aquecer(subdirs: string[], log?: (msg: string) => void): Promise<{ arquivos: number; bytes: number; comprimidos: number }> {
    const t0 = Date.now();
    let arquivos = 0;
    let bytes = 0;
    let comprimidos = 0;
    const visitar = (dir: string, prof: number): string[] => {
      if (prof > 4) return [];
      let nomes: string[];
      try {
        nomes = readdirSync(dir);
      } catch {
        return [];
      }
      const out: string[] = [];
      for (const n of nomes) {
        const abs = join(dir, n);
        let st;
        try {
          st = statSync(abs);
        } catch {
          continue;
        }
        if (st.isDirectory()) out.push(...visitar(abs, prof + 1));
        else if (st.isFile() && COMPRESSIVEIS.has(extname(n).toLowerCase())) out.push(abs);
      }
      return out;
    };
    for (const sub of subdirs) {
      const raiz = this.resolver(`/${sub}`);
      if (!raiz) continue;
      for (const abs of visitar(raiz, 0)) {
        try {
          const arq = this.carregar(abs);
          if (!arq) continue;
          arquivos++;
          if (!arq.comprimir) continue;
          const [br] = await Promise.all([corpoCodificado(arq, 'br', true), corpoCodificado(arq, 'gzip', true)]);
          bytes += arq.tamanho;
          comprimidos += br.length;
        } catch {
          /* segue com os demais */
        }
      }
    }
    log?.(
      `Estáticos: ${arquivos} arquivo(s) de ${subdirs.join(', ')} pré-comprimidos em ${Math.round((Date.now() - t0) / 1000)} s ` +
        `(${(bytes / 1048576).toFixed(1)} MB → br ${(comprimidos / 1048576).toFixed(1)} MB)`,
    );
    return { arquivos, bytes, comprimidos };
  }

  /** Bytes (brutos) em memória — para testes e o monitor. */
  get emMemoria(): number {
    return this.bytes;
  }

  /** index.html bruto (template das páginas). */
  template(): string | null {
    const arq = this.carregar(join(this.raiz, 'index.html'));
    return arq ? arq.bruto.toString('utf8') : null;
  }
}

/** Caminho com extensão de arquivo (não é rota da SPA)? */
export const pareceArquivo = (pathname: string) => /\.[a-z0-9]{1,12}$/i.test(pathname);
