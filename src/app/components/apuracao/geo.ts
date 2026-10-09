/**
 * Geometrias projetadas (public/geo): carregamento com cache em memória + hooks.
 *
 *  - `loadGeoBrasil()` / `loadGeoUf(uf)` → Promise cacheada (uma requisição por arquivo por sessão).
 *  - `useGeo()` → Brasil (27 UFs); `useGeo(uf)` → municípios da UF. Devolvem `{ data, error, loading }`.
 *  - `prefetchGeo(uf?)` para aquecer o cache (ex.: ao passar o mouse numa UF).
 *
 * Os caminhos passam SEMPRE por `assetUrl` (o build demo é servido de subcaminho, com caminhos relativos).
 */
import { useEffect, useState } from 'react';
import type { GeoBrasil, GeoUf } from '@/shared/dataset';
import type { UF } from '@/shared/types';
import { assetUrl } from '@/app/lib/assets';

/**
 * Encarte (ilha fora de escala) gravado pelo pipeline de geo em alguns arquivos de UF
 * (ex.: Fernando de Noronha em `mun/pe.json`). Extensão opcional do contrato `GeoUf`.
 */
export interface GeoEncarte {
  /** Código IBGE do município desenhado no encarte. */
  cod: string;
  nome: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fator de ampliação em relação ao resto do mapa. */
  escala: number;
}

export type GeoUfExt = GeoUf & { encartes?: GeoEncarte[] };

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const cache = new Map<string, Promise<unknown>>();
const resolved = new Map<string, unknown>();

function load<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(assetUrl(path))
      .then((r) => {
        if (!r.ok) throw new Error(`Falha ao carregar ${path} (${r.status})`);
        return r.json() as Promise<T>;
      })
      .then((data) => {
        resolved.set(path, data);
        return data;
      });
    // Em caso de erro, libera o cache para uma nova tentativa.
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

const pathUf = (uf: UF) => `geo/mun/${uf.toLowerCase()}.json`;
const PATH_BR = 'geo/br.json';

export const loadGeoBrasil = () => load<GeoBrasil>(PATH_BR);
export const loadGeoUf = (uf: UF) => load<GeoUfExt>(pathUf(uf));

/** Aquece o cache (não bloqueia; erros são ignorados). */
export function prefetchGeo(uf?: UF) {
  (uf ? loadGeoUf(uf) : loadGeoBrasil()).catch(() => undefined);
}

export interface GeoState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

/** Brasil (sem argumento) ou municípios de uma UF. `uf` nulo/'ZZ' → nada a carregar. */
export function useGeo(): GeoState<GeoBrasil>;
export function useGeo(uf: UF | null | undefined): GeoState<GeoUfExt>;
export function useGeo(...args: [UF | null | undefined] | []): GeoState<GeoBrasil | GeoUfExt> {
  const brasil = args.length === 0;
  const uf = args[0];
  const path = brasil ? PATH_BR : uf && uf !== 'ZZ' ? pathUf(uf) : null;
  const [state, setState] = useState<{ path: string | null; data?: unknown; error?: Error }>(() => ({
    path,
    data: path ? resolved.get(path) : undefined,
  }));

  useEffect(() => {
    if (!path) return;
    if (resolved.has(path)) {
      setState((s) => (s.path === path && s.data ? s : { path, data: resolved.get(path) }));
      return;
    }
    let vivo = true;
    setState({ path });
    load<unknown>(path).then(
      (data) => vivo && setState({ path, data }),
      (error: Error) => vivo && setState({ path, error }),
    );
    return () => {
      vivo = false;
    };
  }, [path]);

  const atual = state.path === path;
  const data = (atual ? state.data : path ? resolved.get(path) : undefined) as GeoBrasil | GeoUfExt | undefined;
  return { data, error: atual ? state.error : undefined, loading: !!path && !data && !(atual && state.error) };
}

// ---------------------------------------------------------------------------------------------
// Utilitários geométricos (os paths do pipeline usam só M, l e z)
// ---------------------------------------------------------------------------------------------

const RE_TOK = /[MmLlHhVvZz]|-?\d*\.?\d+(?:e-?\d+)?/g;

/** Percorre os vértices de um path SVG (comandos M/m/L/l/H/h/V/v/Z), em coordenadas absolutas. */
export function forEachVertex(d: string, cb: (x: number, y: number) => void) {
  const toks = d.match(RE_TOK) ?? [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = 'M';
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const c0 = t.charCodeAt(0);
    if ((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122)) {
      cmd = t;
      i++;
      if (cmd === 'z' || cmd === 'Z') {
        x = sx;
        y = sy;
      }
      continue;
    }
    switch (cmd) {
      case 'M':
        x = +toks[i];
        y = +toks[i + 1];
        sx = x;
        sy = y;
        cmd = 'L';
        i += 2;
        break;
      case 'm':
        x += +toks[i];
        y += +toks[i + 1];
        sx = x;
        sy = y;
        cmd = 'l';
        i += 2;
        break;
      case 'L':
        x = +toks[i];
        y = +toks[i + 1];
        i += 2;
        break;
      case 'l':
        x += +toks[i];
        y += +toks[i + 1];
        i += 2;
        break;
      case 'H':
        x = +toks[i++];
        break;
      case 'h':
        x += +toks[i++];
        break;
      case 'V':
        y = +toks[i++];
        break;
      case 'v':
        y += +toks[i++];
        break;
      default:
        i++;
        continue;
    }
    cb(x, y);
  }
}

/** Caixa envolvente de um path SVG. */
export function pathBBox(d: string): BBox {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  forEachVertex(d, (x, y) => {
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  });
  if (!Number.isFinite(minx)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
}

/** Vértice mais a leste dentro de uma faixa horizontal (âncora de rótulos fora do mapa). */
export function pontoMaisLeste(d: string, yMin: number, yMax: number): [number, number] | null {
  let best: [number, number] | null = null;
  forEachVertex(d, (x, y) => {
    if (y >= yMin && y <= yMax && (!best || x > best[0])) best = [x, y];
  });
  return best;
}

const bboxCache = new WeakMap<object, Map<string, BBox>>();

/** BBoxes de todas as feições (memo por objeto de geometria). */
export function bboxes(feats: Record<string, { d: string }>): Map<string, BBox> {
  let m = bboxCache.get(feats);
  if (!m) {
    m = new Map();
    for (const [k, v] of Object.entries(feats)) m.set(k, pathBBox(v.d));
    bboxCache.set(feats, m);
  }
  return m;
}

export function parseViewBox(vb: string): ViewBox {
  const [x, y, w, h] = vb.split(/[\s,]+/).map(Number);
  return { x: x || 0, y: y || 0, w: w || 1000, h: h || 1000 };
}
