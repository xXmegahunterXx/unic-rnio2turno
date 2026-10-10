/**
 * Projeção do mapa nacional (public/geo/br.json), reproduzida de forma idêntica fora do build-geo.ts.
 *
 * O br.json usa a policônica com meridiano central −54°, ajustada (fitExtent) aos pontos das UFs SEM as ilhas
 * oceânicas (partes a mais de 150 km do continente), num retângulo de lado maior 1000 com margem 8. Qualquer
 * outra camada que precise sobrepor exatamente o mapa de estados (ex.: br-mun.json, municípios do Brasil
 * inteiro) tem de usar esta mesma função; os números abaixo são os mesmos de build-geo.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { GeoProjection } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { ajustar, geoPoliconica } from './projecao';
import { lerTopologia, pontosUsados, separarRemotas, type Feicao, type Malha, type Pt } from './topo';

export const LADO_BR = 1000;
export const MARGEM_BR = 8;
export const MERIDIANO_BR = -54;
/** Ilhas a mais de 150 km do continente são "oceânicas" (mesmo critério de build-geo.ts). */
export const LIMITE_REMOTA_KM = 150;

export interface ProjecaoBrasil {
  proj: GeoProjection;
  largura: number;
  altura: number;
  viewBox: string;
}

/** Monta a projeção do br.json a partir do TopoJSON das UFs (data-raw/ibge/br-uf.topo.json). */
export function projecaoBrasil(arquivoBrUf: string): ProjecaoBrasil {
  if (!existsSync(arquivoBrUf)) throw new Error(`Falta ${arquivoBrUf}. Rode antes: npx tsx scripts/data/fetch-ibge.ts`);
  const malha = lerTopologia(JSON.parse(readFileSync(arquivoBrUf, 'utf8')) as Topology);
  const { remotas } = separarRemotas(malha, LIMITE_REMOTA_KM);
  const remover = new Map<string, Set<number>>();
  for (const r of remotas) {
    if (!remover.has(r.feicao)) remover.set(r.feicao, new Set());
    remover.get(r.feicao)!.add(r.indice);
  }
  const feicoes: Feicao[] = malha.feicoes
    .map((f) => {
      const r = remover.get(f.id);
      return r ? { id: f.id, poligonos: f.poligonos.filter((_, i) => !r.has(i)) } : f;
    })
    .filter((f) => f.poligonos.length > 0);
  const cont: Malha<Pt> = { arcos: malha.arcos, feicoes };
  const proj = geoPoliconica(MERIDIANO_BR);
  const { largura, altura } = ajustar(proj, pontosUsados(cont), LADO_BR, MARGEM_BR);
  return { proj, largura, altura, viewBox: `0 0 ${largura} ${altura}` };
}
