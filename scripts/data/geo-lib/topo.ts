/**
 * Topologia (arcos compartilhados) → projeção → simplificação com preservação → paths SVG.
 *
 * Trabalhamos direto sobre a topologia do IBGE: cada fronteira entre dois polígonos é UM arco, projetado e
 * simplificado uma única vez e usado pelos dois lados. Resultado: nenhuma fresta nem sobreposição entre
 * vizinhos, em qualquer nível de simplificação.
 *
 * Simplificação: Visvalingam (área efetiva do triângulo, `presimplify` do topojson-simplify) em coordenadas
 * JÁ projetadas (px² do viewBox final), com um limiar único por arquivo. Preservação: o maior polígono de
 * cada feição nunca colapsa — se a simplificação derrubar a área abaixo de 70% da original, os pontos mais
 * importantes daquele anel são "travados" (peso ∞) até a forma voltar. Assim nenhum município some, por
 * menor que seja.
 */
import { merge } from 'topojson-client';
import { presimplify, planarTriangleArea } from 'topojson-simplify';
import type { Topology, GeometryCollection, MultiPolygon as TopoMultiPolygon, Polygon as TopoPolygon } from 'topojson-specification';
import { aneisParaPath, areaAssinada, paraDecimos, type AnelInt } from './svgpath';
import { polylabelMulti, type Poligono } from './polylabel';

export type Pt = [number, number];
/** Ponto com peso de simplificação. */
export type PtZ = [number, number, number];
/** Anel como lista de índices de arcos (negativo = arco invertido, ~i). */
export type AnelArcos = number[];
export type PoligonoArcos = AnelArcos[];

export interface Feicao {
  id: string;
  poligonos: PoligonoArcos[];
}

export interface Malha<P = Pt> {
  arcos: P[][];
  feicoes: Feicao[];
}

/** Lê a topologia do IBGE (quantizada, deltas) → arcos absolutos em lon/lat + feições por `codarea`. */
export function lerTopologia(topo: Topology): Malha<Pt> {
  const t = topo.transform;
  const arcos: Pt[][] = topo.arcs.map((arc) => {
    if (!t) return arc.map((p) => [p[0], p[1]] as Pt);
    let x = 0;
    let y = 0;
    return arc.map((p) => {
      x += p[0];
      y += p[1];
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]] as Pt;
    });
  });
  const obj = Object.values(topo.objects)[0] as GeometryCollection<{ codarea: string }>;
  const feicoes: Feicao[] = [];
  for (const g of obj.geometries) {
    const id = String((g.properties as { codarea?: string } | undefined)?.codarea ?? '');
    if (g.type === 'Polygon') feicoes.push({ id, poligonos: [(g as TopoPolygon).arcs] });
    else if (g.type === 'MultiPolygon') feicoes.push({ id, poligonos: (g as TopoMultiPolygon).arcs });
  }
  return { arcos, feicoes };
}

/** Monta as coordenadas de um anel a partir dos arcos (sem repetir os pontos de junção). */
export function montarAnel<P extends Pt | PtZ>(anel: AnelArcos, arcos: P[][]): P[] {
  const out: P[] = [];
  for (const a of anel) {
    const arco = a < 0 ? [...arcos[~a]].reverse() : arcos[a];
    for (let i = out.length ? 1 : 0; i < arco.length; i++) out.push(arco[i]);
  }
  return out;
}

export function areaAbs(anel: Pt[] | PtZ[]): number {
  return Math.abs(areaAssinada(anel as Pt[]));
}

/** Caixa envolvente em lon/lat de um anel. */
export function caixa(pts: Pt[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Distância aproximada (km) entre duas caixas lon/lat (0 se se tocam). */
export function distanciaCaixasKm(a: number[], b: number[]): number {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  const latMedia = ((a[1] + a[3] + b[1] + b[3]) / 4) * (Math.PI / 180);
  return Math.hypot(dx * 111.32 * Math.cos(latMedia), dy * 110.57);
}

export interface ParteRemota {
  feicao: string;
  indice: number;
  caixa: number[];
  distanciaKm: number;
}

/**
 * Classifica as partes (polígonos) em "continente" e "remotas" (ilhas oceânicas). Começa pela maior parte e
 * vai agregando tudo o que estiver a menos de `limiteKm` do conjunto já aceito.
 */
export function separarRemotas(malha: Malha<Pt>, limiteKm: number): { remotas: ParteRemota[]; caixaContinente: number[] } {
  const partes: { feicao: string; indice: number; caixa: number[]; area: number }[] = [];
  for (const f of malha.feicoes) {
    f.poligonos.forEach((p, indice) => {
      const ext = montarAnel(p[0], malha.arcos);
      // área em graus² só para achar a maior parte
      partes.push({ feicao: f.id, indice, caixa: caixa(ext), area: areaAbs(ext) });
    });
  }
  partes.sort((a, b) => b.area - a.area);
  const aceitas = new Set([0]);
  let cx = [...partes[0].caixa];
  let mudou = true;
  while (mudou) {
    mudou = false;
    partes.forEach((p, i) => {
      if (aceitas.has(i)) return;
      if (distanciaCaixasKm(p.caixa, cx) <= limiteKm) {
        aceitas.add(i);
        cx = [Math.min(cx[0], p.caixa[0]), Math.min(cx[1], p.caixa[1]), Math.max(cx[2], p.caixa[2]), Math.max(cx[3], p.caixa[3])];
        mudou = true;
      }
    });
  }
  const remotas = partes
    .filter((_, i) => !aceitas.has(i))
    .map((p) => ({ feicao: p.feicao, indice: p.indice, caixa: p.caixa, distanciaKm: Math.round(distanciaCaixasKm(p.caixa, cx)) }));
  return { remotas, caixaContinente: cx };
}

/** Pontos (lon/lat) de todos os arcos referenciados pelas feições — base para o ajuste da projeção. */
export function pontosUsados(malha: Malha<Pt>): Pt[] {
  const usados = new Set<number>();
  for (const f of malha.feicoes) for (const p of f.poligonos) for (const anel of p) for (const a of anel) usados.add(a < 0 ? ~a : a);
  const pts: Pt[] = [];
  for (const i of usados) pts.push(...malha.arcos[i]);
  return pts;
}

/** Arcos usados por cada feição (para detectar arcos compartilhados). */
function usoDosArcos(malha: Malha<unknown>): Map<number, Set<string>> {
  const uso = new Map<number, Set<string>>();
  for (const f of malha.feicoes)
    for (const p of f.poligonos)
      for (const anel of p)
        for (const a of anel) {
          const i = a < 0 ? ~a : a;
          let s = uso.get(i);
          if (!s) uso.set(i, (s = new Set()));
          s.add(f.id);
        }
  return uso;
}

/** Aplica os pesos de Visvalingam (área efetiva, px²) aos arcos já projetados. */
export function preSimplificar(arcos: Pt[][]): PtZ[][] {
  const topo = { type: 'Topology', arcs: arcos, objects: {} } as unknown as Parameters<typeof presimplify>[0];
  return presimplify(topo, planarTriangleArea).arcs as unknown as PtZ[][];
}

export interface OpcoesSaida {
  /** Limiar de área efetiva (px²): pontos com peso menor são removidos. */
  limiar: number;
  /** Partes secundárias (ilhas) com área simplificada menor que isso (px²) são descartadas. */
  areaMinimaParte: number;
  /** A parte principal de cada feição mantém pelo menos esta fração da área original. */
  fracaoPreservada?: number;
  /** Precisão do polylabel (px). */
  precisaoRotulo?: number;
}

export interface FeicaoSaida {
  d: string;
  cx: number;
  cy: number;
}

export interface ResultadoSimplificacao {
  feicoes: Record<string, FeicaoSaida>;
  /** Polígonos efetivamente desenhados (índices) por feição, para o contorno. */
  mantidos: Map<string, number[]>;
  /** Arcos simplificados (sem peso), para merge/contorno. */
  arcos: Pt[][];
  /** Feições cuja forma precisou de pontos travados para não sumir. */
  preservadas: string[];
  /** Partes (ilhas) descartadas por ficarem menores que `areaMinimaParte`. */
  partesDescartadas: number;
  /** Total de vértices desenhados (contando os dois lados de cada fronteira). */
  vertices: number;
}

function filtrarArco(arco: PtZ[], z: Float64Array, limiar: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < arco.length; i++) if (z[i] >= limiar) out.push([arco[i][0], arco[i][1]]);
  return out;
}

/**
 * Simplifica com limiar único + preservação e gera paths SVG (1 casa decimal) e pontos de rótulo.
 */
export function simplificarEGerar(malha: Malha<PtZ>, op: OpcoesSaida): ResultadoSimplificacao {
  const fracao = op.fracaoPreservada ?? 0.7;
  const zs = malha.arcos.map((arco) => Float64Array.from(arco, (p) => p[2]));
  const filtrados: Pt[][] = malha.arcos.map((arco, i) => filtrarArco(arco, zs[i], op.limiar));
  const uso = usoDosArcos(malha);
  const preservadas: string[] = [];

  // 1) Preservação: a maior parte de cada feição não pode colapsar.
  for (const f of malha.feicoes) {
    const areas = f.poligonos.map((p) => areaAbs(montarAnel(p[0], malha.arcos)));
    const principal = areas.indexOf(Math.max(...areas));
    const anel = f.poligonos[principal][0];
    const a0 = areas[principal];
    let as = areaAbs(montarAnel(anel, filtrados));
    if (as >= fracao * a0) continue;
    // candidatos: pontos internos ainda removidos, por peso decrescente
    const cand: { arco: number; i: number; z: number }[] = [];
    for (const a of new Set(anel.map((x) => (x < 0 ? ~x : x)))) {
      const z = zs[a];
      for (let i = 1; i < z.length - 1; i++) if (z[i] < op.limiar) cand.push({ arco: a, i, z: z[i] });
    }
    cand.sort((x, y) => y.z - x.z);
    let k = 0;
    let passo = 2;
    while (as < fracao * a0 && k < cand.length) {
      const ate = Math.min(cand.length, k + passo);
      const tocados = new Set<number>();
      for (; k < ate; k++) {
        zs[cand[k].arco][cand[k].i] = Infinity;
        tocados.add(cand[k].arco);
      }
      for (const a of tocados) filtrados[a] = filtrarArco(malha.arcos[a], zs[a], op.limiar);
      as = areaAbs(montarAnel(anel, filtrados));
      passo *= 2;
    }
    preservadas.push(f.id);
  }

  // 2) Saída
  const feicoes: Record<string, FeicaoSaida> = {};
  const mantidos = new Map<string, number[]>();
  let partesDescartadas = 0;
  let vertices = 0;
  for (const f of malha.feicoes) {
    const areasOrig = f.poligonos.map((p) => areaAbs(montarAnel(p[0], malha.arcos)));
    const principal = areasOrig.indexOf(Math.max(...areasOrig));
    const aneis: AnelInt[] = [];
    const ext: boolean[] = [];
    const partesRotulo: Poligono[] = [];
    const idx: number[] = [];
    f.poligonos.forEach((p, pi) => {
      const exterior = paraDecimos(montarAnel(p[0], filtrados));
      const areaExt = Math.abs(areaAssinada(exterior)) / 100;
      if (exterior.length < 3 || (pi !== principal && areaExt < op.areaMinimaParte)) {
        partesDescartadas++;
        return;
      }
      idx.push(pi);
      aneis.push(exterior);
      ext.push(true);
      const poligonoRotulo: Poligono = [exterior.map(([x, y]) => [x / 10, y / 10] as [number, number])];
      for (const buraco of p.slice(1)) {
        const b = paraDecimos(montarAnel(buraco, filtrados));
        const compartilhado = buraco.some((a) => (uso.get(a < 0 ? ~a : a)?.size ?? 0) > 1);
        if (b.length < 3) continue;
        if (!compartilhado && Math.abs(areaAssinada(b)) / 100 < op.areaMinimaParte) continue;
        aneis.push(b);
        ext.push(false);
        poligonoRotulo.push(b.map(([x, y]) => [x / 10, y / 10] as [number, number]));
      }
      partesRotulo.push(poligonoRotulo);
    });
    for (const a of aneis) vertices += a.length;
    const [cx, cy] = polylabelMulti(partesRotulo, op.precisaoRotulo ?? 0.5);
    feicoes[f.id] = { d: aneisParaPath(aneis, ext), cx: Math.round(cx * 10) / 10, cy: Math.round(cy * 10) / 10 };
    mantidos.set(f.id, idx);
  }
  return { feicoes, mantidos, arcos: filtrados, preservadas, partesDescartadas, vertices };
}

/** Contorno (união) das feições, sobre os MESMOS arcos simplificados: casa exatamente com as bordas. */
export function contorno(malha: Malha<unknown>, res: ResultadoSimplificacao, areaMinimaBuraco: number): string {
  const geometries = malha.feicoes.map((f) => {
    const idx = res.mantidos.get(f.id) ?? [];
    return { type: 'MultiPolygon' as const, arcs: idx.map((i) => f.poligonos[i]) };
  });
  const topo = {
    type: 'Topology',
    arcs: res.arcos,
    objects: { u: { type: 'GeometryCollection', geometries } },
  } as unknown as Topology<{ u: GeometryCollection }>;
  const m = merge(topo, geometries as unknown as Parameters<typeof merge>[1]);
  const aneis: AnelInt[] = [];
  const ext: boolean[] = [];
  for (const pol of m.coordinates) {
    pol.forEach((anel, k) => {
      const r = paraDecimos(anel as Pt[]);
      if (r.length < 3) return;
      if (k > 0 && Math.abs(areaAssinada(r)) / 100 < areaMinimaBuraco) return;
      aneis.push(r);
      ext.push(k === 0);
    });
  }
  return aneisParaPath(aneis, ext);
}
