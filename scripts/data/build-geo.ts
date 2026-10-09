/**
 * Compila as geometrias dos mapas a partir do cache bruto do IBGE (rode antes `tsx scripts/data/fetch-ibge.ts`).
 *
 *   public/geo/br.json         → GeoBrasil (27 UFs, policônica, viewBox "0 0 1000 H")
 *   public/geo/mun/{uf}.json   → GeoUf     (municípios por UF, projeção reajustada a cada UF)
 *
 * Decisões (detalhes em scripts/data/geo-lib/*):
 *  - Projeção policônica (a dos mapas do IBGE). Brasil: meridiano central −54°. UF: meridiano central no
 *    centro da UF (distorção mínima), ajustada ao viewBox com margem.
 *  - Paths já projetados, 1 casa decimal, comandos relativos; anéis exteriores em sentido horário e buracos
 *    anti-horário (funciona com fill-rule nonzero ou evenodd).
 *  - Simplificação topológica (arcos compartilhados → sem frestas) com limiar em px² e preservação: nenhum
 *    município some. O limiar sobe automaticamente até o arquivo caber no orçamento de tamanho.
 *  - cx/cy = polo de inacessibilidade (sempre dentro do polígono).
 *  - Ilhas oceânicas (Trindade e Martim Vaz, São Pedro e São Paulo, Fernando de Noronha) ficam fora do mapa
 *    nacional; no mapa de PE, Fernando de Noronha entra como encarte ampliado (campo extra `encartes`).
 *
 * Uso: tsx scripts/data/build-geo.ts [--uf=pe,mg]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Topology } from 'topojson-specification';
import type { GeoBrasil, GeoUf } from '../../src/shared/dataset';
import { UFS, type UFBr } from '../../src/shared/types';
import { fontes } from './fetch-ibge';
import { posicionarEncarte } from './geo-lib/encarte';
import { ajustar, geoPoliconica } from './geo-lib/projecao';
import {
  caixa,
  contorno,
  distanciaCaixasKm,
  lerTopologia,
  montarAnel,
  pontosUsados,
  preSimplificar,
  separarRemotas,
  simplificarEGerar,
  type Feicao,
  type Malha,
  type Pt,
  type PtZ,
  type ResultadoSimplificacao,
} from './geo-lib/topo';
import { IBGE_UF, UF_IBGE } from './geo-lib/ufs';

const RAIZ = join(import.meta.dirname, '..', '..');
const DIR_GEO = join(RAIZ, 'public', 'geo');

const KB = 1024;
/** Orçamentos de tamanho (bytes, JSON sem espaços). Metas da arquitetura: 120 KB e 450 KB. */
const ORCAMENTO_BR = 112 * KB;
const ORCAMENTO_UF = 440 * KB;
/** Limiar inicial de área efetiva (px² do viewBox). ~0,35 px² é imperceptível num viewBox de 1000 px. */
const LIMIAR_BASE_BR = 0.35;
const LIMIAR_BASE_UF = 0.35;
/** Ilhas a mais de 150 km do continente são "oceânicas". */
const LIMITE_REMOTA_KM = 150;
const LADO = 1000;
const MARGEM = 8;

/** Encarte: município 100% oceânico (Fernando de Noronha) desenhado ampliado num canto do mapa da UF. */
export interface Encarte {
  cod: string;
  nome: string;
  /** Moldura do encarte no viewBox. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fator de ampliação em relação à escala do mapa. */
  escala: number;
}

interface Relato {
  arquivo: string;
  bytes: number;
  limiar: number;
  feicoes: number;
  vertices: number;
  preservadas: number;
  partesDescartadas: number;
  remotasOmitidas: string[];
  viewBox: string;
}

const relatos: Relato[] = [];

function lerTopo(arquivo: string): Topology {
  if (!existsSync(arquivo)) throw new Error(`Falta ${arquivo}. Rode antes: npx tsx scripts/data/fetch-ibge.ts`);
  return JSON.parse(readFileSync(arquivo, 'utf8')) as Topology;
}

/** Remove partes de feições (índices por feição) e feições que ficarem vazias. */
function semPartes(feicoes: Feicao[], remover: Map<string, Set<number>>): Feicao[] {
  return feicoes
    .map((f) => {
      const r = remover.get(f.id);
      return r ? { id: f.id, poligonos: f.poligonos.filter((_, i) => !r.has(i)) } : f;
    })
    .filter((f) => f.poligonos.length > 0);
}

function nomeRemota(c: number[]): string {
  const lon = (c[0] + c[2]) / 2;
  const lat = (c[1] + c[3]) / 2;
  if (lon > -30 && lat < -15) return 'Trindade e Martim Vaz';
  if (lon > -30 && lat > 0) return 'São Pedro e São Paulo';
  if (lon > -33 && lon < -32 && lat > -4.2 && lat < -3.6) return 'Fernando de Noronha';
  if (lon > -34 && lon < -33.6 && lat > -4 && lat < -3.7) return 'Atol das Rocas';
  return `ilha em ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

/** Busca o limiar: começa no base e sobe 20% por vez até caber no orçamento. */
function simplificarNoOrcamento(
  malha: Malha<PtZ>,
  base: number,
  orcamento: number,
  areaMinimaParte: number,
  serializar: (r: ResultadoSimplificacao) => string,
): { res: ResultadoSimplificacao; json: string; limiar: number } {
  let limiar = base;
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    const res = simplificarEGerar(malha, { limiar, areaMinimaParte });
    // Garantia: toda feição de entrada sai com path desenhável.
    for (const f of malha.feicoes) {
      const s = res.feicoes[f.id];
      if (!s || s.d.length < 10 || !Number.isFinite(s.cx) || !Number.isFinite(s.cy)) throw new Error(`feição ${f.id} sumiu na simplificação`);
    }
    const json = serializar(res);
    if (Buffer.byteLength(json) <= orcamento) return { res, json, limiar };
    limiar *= 1.2;
  }
  throw new Error('não coube no orçamento');
}

function ordenarChaves<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

// ───────────────────────────── Brasil ─────────────────────────────

function construirBrasil() {
  const malha = lerTopologia(lerTopo(fontes.brUf.dest));
  const { remotas } = separarRemotas(malha, LIMITE_REMOTA_KM);
  const remover = new Map<string, Set<number>>();
  for (const r of remotas) {
    if (!remover.has(r.feicao)) remover.set(r.feicao, new Set());
    remover.get(r.feicao)!.add(r.indice);
  }
  const cont: Malha<Pt> = { arcos: malha.arcos, feicoes: semPartes(malha.feicoes, remover) };

  const proj = geoPoliconica(-54);
  const { largura, altura } = ajustar(proj, pontosUsados(cont), LADO, MARGEM);
  const arcosZ = preSimplificar(cont.arcos.map((arco) => arco.map((p) => proj(p) as Pt)));
  const malhaZ: Malha<PtZ> = { arcos: arcosZ, feicoes: cont.feicoes };
  const viewBox = `0 0 ${largura} ${altura}`;

  const serializar = (r: ResultadoSimplificacao) => {
    const ufs: GeoBrasil['ufs'] = {};
    for (const [cod, f] of Object.entries(r.feicoes)) ufs[IBGE_UF[cod]] = f;
    const geo: GeoBrasil = { viewBox, ufs: ordenarChaves(ufs) };
    return JSON.stringify(geo);
  };
  const { res, json, limiar } = simplificarNoOrcamento(malhaZ, LIMIAR_BASE_BR, ORCAMENTO_BR, 2, serializar);
  writeFileSync(join(DIR_GEO, 'br.json'), json);
  relatos.push({
    arquivo: 'br.json',
    bytes: Buffer.byteLength(json),
    limiar,
    feicoes: Object.keys(res.feicoes).length,
    vertices: res.vertices,
    preservadas: res.preservadas.length,
    partesDescartadas: res.partesDescartadas,
    remotasOmitidas: remotas.map((r) => `${IBGE_UF[r.feicao]}: ${nomeRemota(r.caixa)} (${r.distanciaKm} km)`),
    viewBox,
  });
}

// ───────────────────────────── UFs ─────────────────────────────

const NOMES_ENCARTE: Record<string, string> = { '2605459': 'Fernando de Noronha' };

function construirUf(uf: UFBr): { geo: GeoUf; codigos: string[] } {
  const malha = lerTopologia(lerTopo(fontes.mun(uf).dest));
  const { remotas, caixaContinente } = separarRemotas(malha, LIMITE_REMOTA_KM);

  // Partes remotas: se o município tem parte continental, a ilha sai (ex.: Trindade, de Vitória-ES);
  // se é todo oceânico (Fernando de Noronha), vira encarte (só as partes perto da maior: sem São Pedro e São Paulo).
  const remotasPorFeicao = new Map<string, Set<number>>();
  for (const r of remotas) {
    if (!remotasPorFeicao.has(r.feicao)) remotasPorFeicao.set(r.feicao, new Set());
    remotasPorFeicao.get(r.feicao)!.add(r.indice);
  }
  const remover = new Map<string, Set<number>>();
  const encartes: Feicao[] = [];
  const omitidas: string[] = [];
  for (const f of malha.feicoes) {
    const r = remotasPorFeicao.get(f.id);
    if (!r) continue;
    if (r.size < f.poligonos.length) {
      remover.set(f.id, r);
      for (const i of r) omitidas.push(`${f.id}: ${nomeRemota(caixa(montarAnel(f.poligonos[i][0], malha.arcos)))}`);
      continue;
    }
    // município inteiramente oceânico → encarte com as partes a até 50 km da maior
    const caixas = f.poligonos.map((p) => caixa(montarAnel(p[0], malha.arcos)));
    const areas = caixas.map((c) => (c[2] - c[0]) * (c[3] - c[1]));
    const maior = areas.indexOf(Math.max(...areas));
    const partes = f.poligonos.filter((_, i) => distanciaCaixasKm(caixas[i], caixas[maior]) <= 50);
    f.poligonos.forEach((_, i) => {
      if (distanciaCaixasKm(caixas[i], caixas[maior]) > 50) omitidas.push(`${f.id}: ${nomeRemota(caixas[i])}`);
    });
    encartes.push({ id: f.id, poligonos: partes });
    remover.set(f.id, new Set(f.poligonos.map((_, i) => i)));
  }
  const cont: Malha<Pt> = { arcos: malha.arcos, feicoes: semPartes(malha.feicoes, remover) };

  const lon0 = (caixaContinente[0] + caixaContinente[2]) / 2;
  const proj = geoPoliconica(lon0);
  let { largura, altura } = ajustar(proj, pontosUsados(cont), LADO, MARGEM);
  const arcosProj = malha.arcos.map((arco) => arco.map((p) => proj(p) as Pt));

  // Encartes: o município oceânico é ampliado e posto num vão do mapa, o mais perto possível da sua direção
  // real; se não houver vão, abre-se uma faixa no topo do viewBox.
  const encartesSaida: Encarte[] = [];
  let deslocY = 0;
  if (encartes.length) {
    const ALVO_W = 84; // largura do município no encarte (px do viewBox)
    const PAD = 10;
    const f = encartes[0];
    const usados = new Set<number>();
    for (const p of f.poligonos) for (const anel of p) for (const a of anel) usados.add(a < 0 ? ~a : a);
    const pts = [...usados].flatMap((i) => arcosProj[i]);
    const [x0, y0, x1, y1] = caixa(pts);
    const escala = ALVO_W / (x1 - x0);
    const w = (x1 - x0) * escala + 2 * PAD;
    const h = (y1 - y0) * escala + 2 * PAD;
    const usadosCont = new Set<number>();
    for (const g of cont.feicoes) for (const p of g.poligonos) for (const anel of p) for (const a of anel) usadosCont.add(a < 0 ? ~a : a);
    const vao = posicionarEncarte({
      linhas: [...usadosCont].map((i) => arcosProj[i]),
      aneis: cont.feicoes.flatMap((g) => g.poligonos.map((p) => montarAnel(p[0], arcosProj))),
      largura,
      altura,
      w,
      h,
      margem: MARGEM,
      folga: 10,
      alvo: [(x0 + x1) / 2, (y0 + y1) / 2],
    });
    let fx: number;
    let fy: number;
    if (vao) {
      fx = vao.x;
      fy = vao.y;
    } else {
      deslocY = Math.ceil(h + MARGEM); // faixa extra no topo para o encarte não cobrir o mapa
      fx = largura - MARGEM - w;
      fy = MARGEM - deslocY; // o deslocamento geral abaixo o traz para a faixa
    }
    for (const i of usados) arcosProj[i] = arcosProj[i].map(([x, y]) => [fx + PAD + (x - x0) * escala, fy + PAD + (y - y0) * escala] as Pt);
    encartesSaida.push({
      cod: f.id,
      nome: NOMES_ENCARTE[f.id] ?? f.id,
      x: r1(fx),
      y: r1(fy + deslocY),
      w: r1(w),
      h: r1(h),
      escala: Math.round(escala * 10) / 10,
    });
    cont.feicoes.push(f);
  }
  if (deslocY) {
    // empurra tudo para baixo para abrir a faixa do encarte
    for (let i = 0; i < arcosProj.length; i++) arcosProj[i] = arcosProj[i].map(([x, y]) => [x, y + deslocY] as Pt);
    altura += deslocY;
  }

  const malhaZ: Malha<PtZ> = { arcos: preSimplificar(arcosProj), feicoes: cont.feicoes };
  const viewBox = `0 0 ${largura} ${altura}`;
  const serializar = (r: ResultadoSimplificacao) => {
    const geo: GeoUf & { encartes?: Encarte[] } = {
      uf,
      viewBox,
      contorno: contorno(malhaZ, r, 4),
      municipios: ordenarChaves(r.feicoes),
    };
    if (encartesSaida.length) geo.encartes = encartesSaida;
    return JSON.stringify(geo);
  };
  const { res, json, limiar } = simplificarNoOrcamento(malhaZ, LIMIAR_BASE_UF, ORCAMENTO_UF, 1, serializar);
  writeFileSync(join(DIR_GEO, 'mun', `${uf.toLowerCase()}.json`), json);
  relatos.push({
    arquivo: `mun/${uf.toLowerCase()}.json`,
    bytes: Buffer.byteLength(json),
    limiar,
    feicoes: Object.keys(res.feicoes).length,
    vertices: res.vertices,
    preservadas: res.preservadas.length,
    partesDescartadas: res.partesDescartadas,
    remotasOmitidas: omitidas,
    viewBox,
  });
  return { geo: JSON.parse(json) as GeoUf, codigos: Object.keys(res.feicoes) };
}

/** "a; a; b" → "a (×2); b" */
function contar(itens: string[]): string {
  const m = new Map<string, number>();
  for (const i of itens) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m].map(([k, n]) => (n > 1 ? `${k} (×${n} partes)` : k)).join('; ');
}

function r1(v: number) {
  return Math.round(v * 10) / 10;
}

// ───────────────────────────── Cobertura TSE ─────────────────────────────

interface MunTse {
  cd: string;
  cdi: string;
  nm: string;
}

function conferirCobertura(codigosPorUf: Map<UFBr, string[]>) {
  const tse = JSON.parse(readFileSync(fontes.tseMun.dest, 'utf8')) as { abr: { cd: string; mu: MunTse[] }[] };
  const faltantes: string[] = [];
  const sobrando: string[] = [];
  let total = 0;
  for (const abr of tse.abr) {
    const uf = abr.cd.toUpperCase() as UFBr;
    if (abr.cd === 'zz') continue;
    const geo = new Set(codigosPorUf.get(uf) ?? []);
    if (!codigosPorUf.has(uf)) continue; // UF não reconstruída nesta execução (--uf)
    const tseCods = new Set(abr.mu.map((m) => m.cdi));
    for (const m of abr.mu) {
      total++;
      if (!geo.has(m.cdi)) faltantes.push(`${uf} ${m.cdi} ${m.nm} (TSE ${m.cd})`);
    }
    for (const c of geo) if (!tseCods.has(c)) sobrando.push(`${uf} ${c}`);
    // prefixo IBGE coerente com a UF
    for (const c of geo) if (c.slice(0, 2) !== UF_IBGE[uf]) sobrando.push(`${uf} ${c} (prefixo de outra UF)`);
  }
  return { total, faltantes, sobrando };
}

// ───────────────────────────── main ─────────────────────────────

function main() {
  const t0 = Date.now();
  mkdirSync(join(DIR_GEO, 'mun'), { recursive: true });
  const argUf = process.argv.find((a) => a.startsWith('--uf='));
  const lista = argUf ? (argUf.slice(5).toUpperCase().split(',') as UFBr[]) : [...UFS];
  if (!argUf) construirBrasil();
  const codigos = new Map<UFBr, string[]>();
  for (const uf of lista) codigos.set(uf, construirUf(uf).codigos);
  const cob = conferirCobertura(codigos);

  console.log('arquivo'.padEnd(16), 'KB'.padStart(6), 'feições'.padStart(8), 'vértices'.padStart(9), 'limiar'.padStart(7), 'preserv.'.padStart(8), ' viewBox');
  for (const r of relatos) {
    console.log(
      r.arquivo.padEnd(16),
      (r.bytes / KB).toFixed(1).padStart(6),
      String(r.feicoes).padStart(8),
      String(r.vertices).padStart(9),
      r.limiar.toFixed(2).padStart(7),
      String(r.preservadas).padStart(8),
      ` ${r.viewBox}`,
      r.remotasOmitidas.length ? ` · omitidas: ${contar(r.remotasOmitidas)}` : '',
    );
  }
  const totalKb = relatos.reduce((s, r) => s + r.bytes, 0) / KB;
  console.log(`Total ${totalKb.toFixed(0)} KB · municípios do TSE conferidos: ${cob.total}`);
  console.log(cob.faltantes.length ? `FALTANTES (${cob.faltantes.length}): ${cob.faltantes.join('; ')}` : 'Cobertura TSE: 100% (nenhum município sem geometria)');
  if (cob.sobrando.length) console.log(`Geometrias sem município no TSE: ${cob.sobrando.join('; ')}`);
  console.log(`Pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  if (cob.faltantes.length) process.exitCode = 1;
}

main();
