/**
 * Arquivos do build (dist/) em produção:
 *  - /assets/* (nomes com hash do Vite): cache de 1 ano, `immutable`;
 *  - demais arquivos (favicon, data/, geo/): 1 h no navegador, 1 dia na CDN, com ETag;
 *  - páginas (SPA): index.html com meta tags da rota, `no-cache`; rota desconhecida → 404 com a SPA;
 *  - compressão br/gzip calculada uma vez por arquivo e guardada em memória (arquivos ≤ 8 MB).
 */
import { readFileSync, statSync } from 'node:fs';
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
const MAX_EM_MEMORIA = 8 * 1024 * 1024;

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
    if (hit && hit.mtimeMs === st.mtimeMs && hit.tamanho === st.size) return hit;
    const ext = extname(abs).toLowerCase();
    const arq: Arquivo = {
      bruto: readFileSync(abs),
      tipo: TIPOS[ext] ?? 'application/octet-stream',
      etag: `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`,
      mtimeMs: st.mtimeMs,
      tamanho: st.size,
      comprimir: COMPRESSIVEIS.has(ext) && st.size >= COMPRESSIVEL_MIN,
    };
    if (st.size <= MAX_EM_MEMORIA && this.bytes + st.size < 256 * 1024 * 1024) {
      if (hit) this.bytes -= hit.tamanho;
      this.cache.set(abs, arq);
      this.bytes += st.size;
    }
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

  /** index.html bruto (template das páginas). */
  template(): string | null {
    const arq = this.carregar(join(this.raiz, 'index.html'));
    return arq ? arq.bruto.toString('utf8') : null;
  }
}

/** Caminho com extensão de arquivo (não é rota da SPA)? */
export const pareceArquivo = (pathname: string) => /\.[a-z0-9]{1,12}$/i.test(pathname);
