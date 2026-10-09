/**
 * Projeções usadas nos mapas.
 *
 * - Policônica (a projeção dos mapas do Brasil do IBGE, EPSG:5880 usa meridiano central −54°). Não existe no
 *   d3-geo (só no d3-geo-projection, que não é dependência), então implementamos a forma esférica aqui.
 * - Cônica equivalente de Albers "Brasil" (paralelos −2°/−22°, meridiano −54°), alternativa comparada.
 *
 * As projeções só transformam PONTOS (projection([lon, lat])). Não usamos d3.geoPath nos polígonos, então
 * não existe o problema de orientação de anéis do d3 (polígono "do mundo inteiro").
 */
import { geoConicEqualArea, geoProjection, type GeoProjection } from 'd3-geo';

const EPS = 1e-10;

/** Policônica americana (esfera). λ, φ em radianos → coordenadas com y para cima (o d3 inverte). */
export function policonicaRaw(lambda: number, phi: number): [number, number] {
  if (Math.abs(phi) < EPS) return [lambda, 0];
  const tanPhi = Math.tan(phi);
  const k = lambda * Math.sin(phi);
  return [Math.sin(k) / tanPhi, phi + (1 - Math.cos(k)) / tanPhi];
}

/** Policônica com meridiano central `lon0` (graus). */
export function geoPoliconica(lon0 = -54): GeoProjection {
  return geoProjection(policonicaRaw).rotate([-lon0, 0]);
}

/** Albers equivalente com os parâmetros usuais para o Brasil (SIRGAS 2000 / Brazil Albers). */
export function geoAlbersBrasil(): GeoProjection {
  return geoConicEqualArea().parallels([-2, -22]).rotate([54, 0]).center([0, -12]);
}

export type Ponto = [number, number];

/**
 * Ajusta a projeção para caber num retângulo cujo lado maior mede `lado`, com `margem`, mantendo a proporção
 * real. Devolve as dimensões do viewBox. O ajuste usa só os pontos (MultiPoint), imune a orientação de anéis.
 */
export function ajustar(
  proj: GeoProjection,
  pontos: Ponto[],
  lado: number,
  margem: number,
): { largura: number; altura: number } {
  const alvo = { type: 'MultiPoint' as const, coordinates: pontos };
  proj.fitSize([lado, lado], alvo);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pontos) {
    const q = proj(p);
    if (!q) continue;
    if (q[0] < x0) x0 = q[0];
    if (q[0] > x1) x1 = q[0];
    if (q[1] < y0) y0 = q[1];
    if (q[1] > y1) y1 = q[1];
  }
  const aspecto = (x1 - x0) / (y1 - y0);
  const util = lado - 2 * margem;
  const largura = aspecto >= 1 ? lado : Math.ceil(util * aspecto + 2 * margem);
  const altura = aspecto >= 1 ? Math.ceil(util / aspecto + 2 * margem) : lado;
  proj.fitExtent(
    [
      [margem, margem],
      [largura - margem, altura - margem],
    ],
    alvo,
  );
  return { largura, altura };
}
