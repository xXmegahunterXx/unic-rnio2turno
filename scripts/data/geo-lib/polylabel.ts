/**
 * Polo de inacessibilidade (ponto interno mais distante da borda), para rótulos e alvos de toque.
 * Implementação própria do algoritmo de busca por células com fila de prioridade (Garcia-Castellanos &
 * Lombardo; popularizado pelo "polylabel" da Mapbox). Ao contrário do centróide, o ponto cai sempre DENTRO
 * do polígono, mesmo em formas côncavas (ex.: municípios em "C", estados com recortes).
 */
type Pt = [number, number];
type Anel = Pt[];
/** Polígono = [exterior, ...buracos] em coordenadas planas. */
export type Poligono = Anel[];

interface Celula {
  x: number;
  y: number;
  h: number; // meia aresta
  d: number; // distância do centro à borda (negativa fora)
  max: number; // distância máxima possível dentro da célula
}

function distSegmento2(px: number, py: number, a: Pt, b: Pt): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** Distância com sinal do ponto à borda do polígono (positiva dentro). */
export function distanciaPoligono(x: number, y: number, poligono: Poligono): number {
  let dentro = false;
  let min = Infinity;
  for (const anel of poligono) {
    for (let i = 0, n = anel.length, j = n - 1; i < n; j = i++) {
      const a = anel[i];
      const b = anel[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) dentro = !dentro;
      const d = distSegmento2(x, y, a, b);
      if (d < min) min = d;
    }
  }
  return (dentro ? 1 : -1) * Math.sqrt(min);
}

function celula(x: number, y: number, h: number, p: Poligono): Celula {
  const d = distanciaPoligono(x, y, p);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

/** Heap máximo por `max`. */
class Heap {
  private a: Celula[] = [];
  get size() {
    return this.a.length;
  }
  push(c: Celula) {
    const a = this.a;
    a.push(c);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].max >= a[i].max) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Celula | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const topo = a[0];
    const ult = a.pop()!;
    if (a.length) {
      a[0] = ult;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].max > a[m].max) m = l;
        if (r < a.length && a[r].max > a[m].max) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return topo;
  }
}

function centroideAnel(anel: Anel): Pt {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, n = anel.length, j = n - 1; i < n; j = i++) {
    const a = anel[i];
    const b = anel[j];
    const f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f;
    y += (a[1] + b[1]) * f;
    area += f * 3;
  }
  return area === 0 ? anel[0] : [x / area, y / area];
}

/** Ponto de rótulo de um polígono; `precisao` na unidade das coordenadas. Devolve [x, y, distância]. */
export function polylabel(poligono: Poligono, precisao = 0.5): [number, number, number] {
  const ext = poligono[0];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ext) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const w = x1 - x0;
  const hgt = y1 - y0;
  const tam = Math.min(w, hgt);
  if (tam === 0) return [x0, y0, 0];
  let h = tam / 2;

  const fila = new Heap();
  for (let x = x0; x < x1; x += tam) for (let y = y0; y < y1; y += tam) fila.push(celula(x + h, y + h, h, poligono));

  const c = centroideAnel(ext);
  let melhor = celula(c[0], c[1], 0, poligono);
  const caixa = celula(x0 + w / 2, y0 + hgt / 2, 0, poligono);
  if (caixa.d > melhor.d) melhor = caixa;

  let it = 0;
  while (fila.size) {
    const cel = fila.pop()!;
    if (cel.d > melhor.d) melhor = cel;
    if (cel.max - melhor.d <= precisao) continue;
    if (++it > 200_000) break; // salvaguarda
    h = cel.h / 2;
    fila.push(celula(cel.x - h, cel.y - h, h, poligono));
    fila.push(celula(cel.x + h, cel.y - h, h, poligono));
    fila.push(celula(cel.x - h, cel.y + h, h, poligono));
    fila.push(celula(cel.x + h, cel.y + h, h, poligono));
  }
  return [melhor.x, melhor.y, melhor.d];
}

/** Melhor ponto de rótulo entre as partes de um multipolígono (maior círculo inscrito). */
export function polylabelMulti(partes: Poligono[], precisao = 0.5): [number, number] {
  let melhor: [number, number, number] | null = null;
  for (const p of partes) {
    const r = polylabel(p, precisao);
    if (!melhor || r[2] > melhor[2]) melhor = r;
  }
  return melhor ? [melhor[0], melhor[1]] : [0, 0];
}
