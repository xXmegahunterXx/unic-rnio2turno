/**
 * Une as malhas municipais das 27 UFs (um TopoJSON do IBGE por UF) numa topologia ÚNICA do Brasil.
 *
 * Por que é preciso: cada arquivo do IBGE tem a própria quantização (transform), então o mesmo vértice de uma
 * divisa estadual aparece em dois arquivos com diferença de alguns metros (≤ ~8 m medidos). Simplificar as
 * duas cópias separadamente abriria frestas e sobreposições na divisa. Aqui:
 *
 *  1. "Soldagem" dos vértices de borda: para cada UF, os pontos dos arcos de uso único (litoral, fronteira e
 *     divisas — os arcos internos à UF já são compartilhados) são casados com o vértice mais próximo de OUTRA
 *     UF já processada, se estiver a menos de `tolMetros`; casou → passa a usar exatamente a mesma
 *     coordenada. Extremos de arcos internos também passam pela soldagem (são junções na divisa).
 *  2. Reconstrução da topologia com topojson-server (`topology`), que detecta as junções e devolve arcos
 *     compartilhados: cada divisa estadual vira UM arco, usado pelos dois municípios vizinhos.
 *
 * Os vértices das divisas nos arquivos de UFs vizinhas são os mesmos (só a quantização difere): no teste
 * SP×MG, 3.627 vértices de um lado têm par do outro, distância máxima 4,6 m.
 */
import { topology } from 'topojson-server';
import type { Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { lerTopologia, montarAnel, type Malha, type Pt } from './topo';

export interface RelatoUniao {
  /** vértices de borda (arcos de uso único) avaliados */
  pontosBorda: number;
  /** vértices que passaram a usar a coordenada de outra UF */
  soldados: number;
  /** maior deslocamento aplicado (m) */
  deslocMaxM: number;
  /** soma dos arcos das entradas → arcos da topologia única */
  arcosEntrada: number;
  arcosSaida: number;
}

const CEL = 1e-4; // célula da grade (graus), ~11 m

function chave(cx: number, cy: number): number {
  return (cx + 1_000_000) * 2_000_000 + (cy + 1_000_000);
}

function distM(ax: number, ay: number, bx: number, by: number): number {
  const kx = 111_320 * Math.cos((ay * Math.PI) / 180);
  return Math.hypot((ax - bx) * kx, (ay - by) * 110_570);
}

/**
 * @param malhas uma malha por UF (lon/lat), com feições identificadas pelo código IBGE
 * @param tolMetros distância máxima para considerar dois vértices o mesmo ponto
 */
export function unirMalhas(malhas: Malha<Pt>[], tolMetros = 12): { malha: Malha<Pt>; relato: RelatoUniao } {
  // grade: chave da célula → [x, y, origem, x, y, origem, ...]
  const grade = new Map<number, number[]>();
  const relato: RelatoUniao = { pontosBorda: 0, soldados: 0, deslocMaxM: 0, arcosEntrada: 0, arcosSaida: 0 };

  const soldar = (p: Pt, origem: number): Pt => {
    const cx = Math.floor(p[0] / CEL);
    const cy = Math.floor(p[1] / CEL);
    let melhor = Infinity;
    let bx = 0;
    let by = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const l = grade.get(chave(cx + dx, cy + dy));
        if (!l) continue;
        for (let i = 0; i < l.length; i += 3) {
          if (l[i + 2] === origem) continue;
          const d = distM(p[0], p[1], l[i], l[i + 1]);
          if (d < melhor) {
            melhor = d;
            bx = l[i];
            by = l[i + 1];
          }
        }
      }
    if (melhor <= tolMetros) {
      if (bx !== p[0] || by !== p[1]) {
        relato.soldados++;
        if (melhor > relato.deslocMaxM) relato.deslocMaxM = melhor;
      }
      return [bx, by];
    }
    return p;
  };

  const features: Feature<Polygon | MultiPolygon, { codarea: string }>[] = [];
  malhas.forEach((m, origem) => {
    relato.arcosEntrada += m.arcos.length;
    const uso = new Uint32Array(m.arcos.length);
    for (const f of m.feicoes) for (const p of f.poligonos) for (const anel of p) for (const a of anel) uso[a < 0 ? ~a : a]++;

    const novos: Pt[][] = m.arcos.map((arco, i) => {
      let out: Pt[];
      if (uso[i] === 1) {
        relato.pontosBorda += arco.length;
        out = arco.map((p) => soldar(p, origem));
      } else {
        out = arco.slice();
        out[0] = soldar(arco[0], origem);
        out[out.length - 1] = soldar(arco[arco.length - 1], origem);
      }
      // sem pontos repetidos em sequência (dois vértices soldados no mesmo ponto)
      return out.filter((p, k) => k === 0 || p[0] !== out[k - 1][0] || p[1] !== out[k - 1][1]);
    });

    // registra os pontos de borda (já soldados) desta UF para as próximas
    const vistos = new Set<string>();
    novos.forEach((arco, i) => {
      if (uso[i] !== 1) return;
      for (const p of arco) {
        const k = `${p[0]},${p[1]}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        const ck = chave(Math.floor(p[0] / CEL), Math.floor(p[1] / CEL));
        let l = grade.get(ck);
        if (!l) grade.set(ck, (l = []));
        l.push(p[0], p[1], origem);
      }
    });

    for (const f of m.feicoes) {
      const coords: Position[][][] = f.poligonos.map((pol) =>
        pol.map((anel) => {
          const r: Position[] = montarAnel(anel, novos);
          r.push(r[0]);
          return r;
        }),
      );
      features.push({
        type: 'Feature',
        properties: { codarea: f.id },
        geometry: coords.length === 1 ? { type: 'Polygon', coordinates: coords[0] } : { type: 'MultiPolygon', coordinates: coords },
      });
    }
  });

  const fc: FeatureCollection<Polygon | MultiPolygon, { codarea: string }> = { type: 'FeatureCollection', features };
  const topo = topology({ mun: fc }) as unknown as Topology;
  const malha = lerTopologia(topo);
  relato.arcosSaida = malha.arcos.length;
  return { malha, relato };
}
