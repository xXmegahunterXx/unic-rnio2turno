/**
 * Mapa nacional por município + ordem canônica dos municípios (fase 2).
 *
 *   public/geo/br-mun.json          → GeoBrasilMunicipios (5.571 municípios + contornos das 27 UFs)
 *   public/data/municipios-br.json  → MunicipiosBr (ordem canônica: UF por sigla, depois a ordem de uf/{uf}.json)
 *
 * Entradas (cache bruto, rode antes `npx tsx scripts/data/fetch-ibge.ts` e o build-data da fase 1):
 *   data-raw/ibge/br-uf.topo.json, data-raw/ibge/mun/{uf}.topo.json (IBGE malhas v4, qualidade máxima),
 *   data-raw/ibge/tse-mun-e006257-cm.json (cadastro do TSE, conferência) e public/data/uf/{uf}.json.
 *
 * Decisões:
 *  - MESMA projeção e MESMO enquadramento de public/geo/br.json (policônica −54°, fit nas UFs sem ilhas
 *    oceânicas, lado 1000, margem 8: geo-lib/projecao-brasil.ts). O script confere que o viewBox é idêntico e
 *    que todo vértice do br.json cai num vértice projetado por esta projeção.
 *  - Topologia única do Brasil (geo-lib/unir.ts): as 27 malhas por UF são soldadas nas divisas e reconstruídas
 *    com arcos compartilhados → simplificação sem frestas também ENTRE estados.
 *  - Simplificação de Visvalingam em px² do viewBox (geo-lib/topo.ts) com preservação: nenhum município some
 *    (a parte principal mantém ≥ 70% da área). O limiar é buscado (bisseção em escala log) para o arquivo
 *    ficar perto de ORCAMENTO sem passar.
 *  - Paths com 1 casa decimal (comandos relativos). Inteiros não servem: 1 px do viewBox ≈ 4,4 km e centenas
 *    de municípios têm menos de 2 px de lado.
 *  - Contornos das UFs = união dos municípios sobre os MESMOS arcos simplificados (casam exatamente com as
 *    bordas dos municípios).
 *  - Ilhas oceânicas: mesmo tratamento do br.json — Trindade e Martim Vaz (Vitória-ES), Atol das Rocas e São
 *    Pedro e São Paulo ficam fora. Fernando de Noronha (PE), município inteiramente oceânico, não pode sumir:
 *    entra como ENCARTE ampliado no vão de oceano mais perto da sua posição real (campo extra `encartes`,
 *    igual ao de public/geo/mun/pe.json), e o anel dele também entra no contorno de PE.
 *
 * Uso: npx tsx scripts/data/build-geo-br-mun.ts [--orcamento=1.85 (MB)] [--limiar=0.036 (px², pula a busca)]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Topology } from 'topojson-specification';
import type { GeoBrasil, GeoBrasilMunicipios, GeoUf, MunicipiosBr, UfDataset } from '../../src/shared/dataset';
import { UFS, type UFBr } from '../../src/shared/types';
import { posicionarEncarte } from './geo-lib/encarte';
import { areaPath, distSegmento, lerPath } from './geo-lib/lerpath';
import { LIMITE_REMOTA_KM, MARGEM_BR, projecaoBrasil } from './geo-lib/projecao-brasil';
import {
  caixa,
  contorno,
  distanciaCaixasKm,
  lerTopologia,
  montarAnel,
  preSimplificar,
  separarRemotas,
  simplificarEGerar,
  type Feicao,
  type Malha,
  type Pt,
  type PtZ,
  type ResultadoSimplificacao,
} from './geo-lib/topo';
import { unirMalhas } from './geo-lib/unir';
import { IBGE_UF, UF_IBGE } from './geo-lib/ufs';

const RAIZ = join(import.meta.dirname, '..', '..');
const DIR_IBGE = join(RAIZ, 'data-raw', 'ibge');
const ARQ_BR_UF = join(DIR_IBGE, 'br-uf.topo.json');
const ARQ_TSE_MUN = join(DIR_IBGE, 'tse-mun-e006257-cm.json');
const ARQ_BR = join(RAIZ, 'public', 'geo', 'br.json');
const ARQ_SAIDA_GEO = join(RAIZ, 'public', 'geo', 'br-mun.json');
const ARQ_SAIDA_MUN = join(RAIZ, 'public', 'data', 'municipios-br.json');
const DIR_UF = join(RAIZ, 'public', 'data', 'uf');

const MB = 1024 * 1024;
/**
 * Orçamento padrão (bytes, JSON minificado). Teto da tarefa: 2,5 MB; ideal ~1,8 MB. `--orcamento=1.05` gera uma
 * versão mais leve (limiar ~0,15 px², ~35% mais rápida de desenhar, sem diferença visível na escala nacional).
 */
const ORCAMENTO_PADRAO = 1.85 * MB;
/** Ilhas (partes secundárias) menores que isso (px²) somem; a parte principal nunca some. 1 px² ≈ 19 km². */
const AREA_MINIMA_PARTE = 0.5;
/** Buracos do contorno das UFs menores que isso (px²) somem. */
const AREA_MINIMA_BURACO_UF = 2;
const LIMIAR_INICIAL = 0.6;
const TOLERANCIA_SOLDA_M = 12;

/** Encarte: município 100% oceânico desenhado ampliado num vão de oceano do mapa. */
export interface EncarteBr {
  cod: string; // IBGE
  nome: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** ampliação em relação à escala do mapa */
  escala: number;
}

const NOMES_ENCARTE: Record<string, string> = { '2605459': 'Fernando de Noronha' };

function r1(v: number) {
  return Math.round(v * 10) / 10;
}

function lerJson<T>(arquivo: string): T {
  if (!existsSync(arquivo)) throw new Error(`Falta ${arquivo}`);
  return JSON.parse(readFileSync(arquivo, 'utf8')) as T;
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

// ───────────────────────────── 1. Topologia única ─────────────────────────────

function carregarMalhaBrasil(): Malha<Pt> {
  const t0 = Date.now();
  const malhas: Malha<Pt>[] = [];
  for (const uf of [...UFS].sort()) {
    const arq = join(DIR_IBGE, 'mun', `${uf.toLowerCase()}.topo.json`);
    const m = lerTopologia(lerJson<Topology>(arq));
    for (const f of m.feicoes) if (f.id.slice(0, 2) !== UF_IBGE[uf]) throw new Error(`${arq}: feição ${f.id} fora da UF`);
    malhas.push(m);
  }
  const { malha, relato } = unirMalhas(malhas, TOLERANCIA_SOLDA_M);
  console.log(
    `Topologia única: ${malha.feicoes.length} municípios · ${relato.arcosEntrada} arcos (27 arquivos) → ${relato.arcosSaida} · ` +
      `${relato.soldados} de ${relato.pontosBorda} vértices de borda soldados (desloc. máx. ${relato.deslocMaxM.toFixed(1)} m) · ` +
      `${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  return malha;
}

/** Arcos de uso único que NÃO estão no contorno externo do país = possíveis frestas entre UFs. */
function diagnosticarDivisas(malha: Malha<Pt>) {
  const uso = new Map<number, Set<string>>();
  for (const f of malha.feicoes)
    for (const p of f.poligonos)
      for (const anel of p)
        for (const a of anel) {
          const i = a < 0 ? ~a : a;
          if (!uso.has(i)) uso.set(i, new Set());
          uso.get(i)!.add(f.id.slice(0, 2));
        }
  let interUf = 0;
  for (const s of uso.values()) if (s.size > 1) interUf++;
  return { arcosEntreUfs: interUf };
}

// ───────────────────────────── 2. Recorte das ilhas oceânicas + encarte ─────────────────────────────

interface Preparo {
  malha: Malha<Pt>;
  omitidas: string[];
  encarteFeicao: Feicao | null;
}

function separarIlhas(malha: Malha<Pt>): Preparo {
  const { remotas } = separarRemotas(malha, LIMITE_REMOTA_KM);
  const porFeicao = new Map<string, Set<number>>();
  for (const r of remotas) {
    if (!porFeicao.has(r.feicao)) porFeicao.set(r.feicao, new Set());
    porFeicao.get(r.feicao)!.add(r.indice);
  }
  const omitidas: string[] = [];
  let encarteFeicao: Feicao | null = null;
  const feicoes: Feicao[] = [];
  for (const f of malha.feicoes) {
    const r = porFeicao.get(f.id);
    if (!r) {
      feicoes.push(f);
      continue;
    }
    if (r.size < f.poligonos.length) {
      for (const i of r) omitidas.push(`${f.id} ${nomeRemota(caixa(montarAnel(f.poligonos[i][0], malha.arcos)))}`);
      feicoes.push({ id: f.id, poligonos: f.poligonos.filter((_, i) => !r.has(i)) });
      continue;
    }
    // município inteiramente oceânico → encarte com as partes a até 50 km da maior
    if (encarteFeicao) throw new Error('mais de um município oceânico: o encarte só prevê um');
    const caixas = f.poligonos.map((p) => caixa(montarAnel(p[0], malha.arcos)));
    const areas = caixas.map((c) => (c[2] - c[0]) * (c[3] - c[1]));
    const maior = areas.indexOf(Math.max(...areas));
    const perto = (i: number) => distanciaCaixasKm(caixas[i], caixas[maior]) <= 50;
    f.poligonos.forEach((_, i) => {
      if (!perto(i)) omitidas.push(`${f.id} ${nomeRemota(caixas[i])}`);
    });
    encarteFeicao = { id: f.id, poligonos: f.poligonos.filter((_, i) => perto(i)) };
    feicoes.push(encarteFeicao);
  }
  return { malha: { arcos: malha.arcos, feicoes }, omitidas, encarteFeicao };
}

function arcosDe(feicoes: Feicao[]): Set<number> {
  const s = new Set<number>();
  for (const f of feicoes) for (const p of f.poligonos) for (const anel of p) for (const a of anel) s.add(a < 0 ? ~a : a);
  return s;
}

/** Amplia o município oceânico e o leva ao vão de oceano mais perto da posição real. Altera `arcosProj`. */
function aplicarEncarte(arcosProj: Pt[][], feicoes: Feicao[], enc: Feicao, largura: number, altura: number): EncarteBr {
  const ALVO_W = 30; // largura do município no encarte (px do viewBox)
  const PAD = 6;
  const usados = arcosDe([enc]);
  const continente = arcosDe(feicoes.filter((f) => f.id !== enc.id));
  for (const i of usados) if (continente.has(i)) throw new Error('arco do encarte compartilhado com o continente');
  const [x0, y0, x1, y1] = caixa([...usados].flatMap((i) => arcosProj[i]));
  const escala = ALVO_W / (x1 - x0);
  const w = (x1 - x0) * escala + 2 * PAD;
  const h = (y1 - y0) * escala + 2 * PAD;
  const vao = posicionarEncarte({
    linhas: [...continente].map((i) => arcosProj[i]),
    aneis: feicoes.filter((f) => f.id !== enc.id).flatMap((g) => g.poligonos.map((p) => montarAnel(p[0], arcosProj))),
    largura,
    altura,
    w,
    h,
    margem: MARGEM_BR,
    folga: 10,
    alvo: [(x0 + x1) / 2, (y0 + y1) / 2],
  });
  if (!vao) throw new Error('sem vão para o encarte de Fernando de Noronha');
  for (const i of usados)
    arcosProj[i] = arcosProj[i].map(([x, y]) => [vao.x + PAD + (x - x0) * escala, vao.y + PAD + (y - y0) * escala] as Pt);
  return { cod: enc.id, nome: NOMES_ENCARTE[enc.id] ?? enc.id, x: r1(vao.x), y: r1(vao.y), w: r1(w), h: r1(h), escala: Math.round(escala * 10) / 10 };
}

// ───────────────────────────── 3. Simplificação no orçamento ─────────────────────────────

interface Saida {
  json: string;
  bytes: number;
  limiar: number;
  res: ResultadoSimplificacao;
  geo: GeoBrasilMunicipios & { encartes: EncarteBr[] };
}

function gerar(malhaZ: Malha<PtZ>, viewBox: string, encartes: EncarteBr[], limiar: number): Saida {
  const res = simplificarEGerar(malhaZ, { limiar, areaMinimaParte: AREA_MINIMA_PARTE, precisaoRotulo: 2 });
  for (const f of malhaZ.feicoes) {
    const s = res.feicoes[f.id];
    if (!s || s.d.length < 10) throw new Error(`município ${f.id} sumiu na simplificação`);
  }
  const municipios: Record<string, string> = {};
  for (const id of Object.keys(res.feicoes).sort()) municipios[id] = res.feicoes[id].d;
  const porUf = new Map<UFBr, Feicao[]>();
  for (const f of malhaZ.feicoes) {
    const uf = IBGE_UF[f.id.slice(0, 2)];
    if (!porUf.has(uf)) porUf.set(uf, []);
    porUf.get(uf)!.push(f);
  }
  const ufs: Record<string, string> = {};
  for (const uf of [...porUf.keys()].sort()) ufs[uf] = contorno({ arcos: [], feicoes: porUf.get(uf)! }, res, AREA_MINIMA_BURACO_UF);
  const geo = { viewBox, municipios, ufs, encartes };
  const json = JSON.stringify(geo);
  return { json, bytes: Buffer.byteLength(json), limiar, res, geo };
}

function buscarLimiar(malhaZ: Malha<PtZ>, viewBox: string, encartes: EncarteBr[], ORCAMENTO: number): Saida {
  const cache = new Map<number, Saida>();
  const avaliar = (l: number) => {
    let s = cache.get(l);
    if (!s) {
      const t = Date.now();
      s = gerar(malhaZ, viewBox, encartes, l);
      cache.set(l, s);
      console.log(`  limiar ${l.toFixed(3)} px² → ${(s.bytes / MB).toFixed(3)} MB (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    }
    return s;
  };
  // 1) acha um intervalo [cabe, nãoCabe] em passos ×1,6
  let l = LIMIAR_INICIAL;
  let s = avaliar(l);
  let cabe: number | null = s.bytes <= ORCAMENTO ? l : null;
  let naoCabe: number | null = s.bytes > ORCAMENTO ? l : null;
  for (let k = 0; k < 20 && (cabe === null || naoCabe === null); k++) {
    l = cabe === null ? l * 1.6 : l / 1.6;
    if (l < 0.02) break;
    s = avaliar(l);
    if (s.bytes <= ORCAMENTO) cabe = l;
    else naoCabe = l;
  }
  if (cabe === null) throw new Error('não coube no orçamento');
  // 2) bisseção (escala log) para chegar perto do orçamento sem passar
  if (naoCabe !== null)
    for (let k = 0; k < 6; k++) {
      const m = Math.sqrt(cabe * naoCabe);
      if (avaliar(m).bytes <= ORCAMENTO) cabe = m;
      else naoCabe = m;
      if (Math.max(cabe, naoCabe) / Math.min(cabe, naoCabe) < 1.03) break;
    }
  return avaliar(cabe);
}

// ───────────────────────────── 4. Conferências ─────────────────────────────

/** Todo vértice do br.json tem de cair num vértice das UFs projetado pela nossa projeção (mesmo arredondamento). */
function conferirProjecao(proj: (p: Pt) => [number, number] | null, br: GeoBrasil) {
  const topo = lerTopologia(lerJson<Topology>(ARQ_BR_UF));
  const pontos = new Set<number>();
  for (const arco of topo.arcos)
    for (const p of arco) {
      const q = proj(p);
      if (q) pontos.add(Math.round(q[0] * 10) * 100_000 + Math.round(q[1] * 10));
    }
  let total = 0;
  let ok = 0;
  for (const { d } of Object.values(br.ufs))
    for (const anel of lerPath(d))
      for (const [x, y] of anel) {
        total++;
        if (pontos.has(Math.round(x * 10) * 100_000 + Math.round(y * 10))) ok++;
      }
  return { total, ok };
}

/** Índice de segmentos em grade, para distância ponto → polilinha. */
class IndiceSegmentos {
  private grade = new Map<number, [Pt, Pt][]>();
  constructor(
    aneis: Pt[][],
    private cel = 4,
  ) {
    for (const anel of aneis)
      for (let i = 0; i < anel.length; i++) {
        const a = anel[i];
        const b = anel[(i + 1) % anel.length];
        const x0 = Math.floor(Math.min(a[0], b[0]) / cel);
        const x1 = Math.floor(Math.max(a[0], b[0]) / cel);
        const y0 = Math.floor(Math.min(a[1], b[1]) / cel);
        const y1 = Math.floor(Math.max(a[1], b[1]) / cel);
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            const k = x * 10_000 + y;
            if (!this.grade.has(k)) this.grade.set(k, []);
            this.grade.get(k)!.push([a, b]);
          }
      }
  }
  dist(p: Pt): number {
    const cx = Math.floor(p[0] / this.cel);
    const cy = Math.floor(p[1] / this.cel);
    let melhor = Infinity;
    for (let r = 0; r < 50; r++) {
      for (let x = cx - r; x <= cx + r; x++)
        for (let y = cy - r; y <= cy + r; y++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          for (const [a, b] of this.grade.get(x * 10_000 + y) ?? []) melhor = Math.min(melhor, distSegmento(p, a, b));
        }
      if (melhor <= r * this.cel) break;
    }
    return melhor;
  }
}

/** Pontos ao longo dos anéis, a cada `passo` px (inclui os vértices). */
function amostrar(aneis: Pt[][], passo = 0.5): Pt[] {
  const out: Pt[] = [];
  for (const anel of aneis)
    for (let i = 0; i < anel.length; i++) {
      const a = anel[i];
      const b = anel[(i + 1) % anel.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / passo));
      for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  return out;
}

function quantil(v: number[], q: number) {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

/**
 * Distância (px) entre os contornos das UFs no br-mun.json e no br.json, nos dois sentidos. Para separar
 * desalinhamento de simplificação, mede também o quanto CADA arquivo se afasta da malha original das UFs
 * (br-uf.topo.json projetado, sem simplificar): `desvioBr` e `desvioMun` (máximo, px).
 */
function conferirAlinhamento(
  geo: GeoBrasilMunicipios,
  br: GeoBrasil,
  encartes: EncarteBr[],
  proj: (p: Pt) => [number, number] | null,
  largura: number,
  altura: number,
) {
  const topo = lerTopologia(lerJson<Topology>(ARQ_BR_UF));
  const original = new Map<string, Pt[][]>();
  for (const f of topo.feicoes) {
    const aneis: Pt[][] = [];
    for (const p of f.poligonos)
      for (const anel of p) {
        const pts = montarAnel(anel, topo.arcos).map((q) => proj(q) as Pt);
        if (pts.every(([x, y]) => x >= 0 && x <= largura && y >= 0 && y <= altura)) aneis.push(pts);
      }
    original.set(IBGE_UF[f.id], aneis);
  }
  let desvioBr = 0;
  let desvioMun = 0;
  const discordaBr: number[] = [];
  const discordaMun: number[] = [];
  const dentroEncarte = (anel: Pt[]) =>
    encartes.some((e) => anel.every(([x, y]) => x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h));
  const todas: number[] = [];
  const porUf: { uf: string; p99: number; max: number }[] = [];
  for (const uf of Object.keys(br.ufs).sort()) {
    const a = lerPath(geo.ufs[uf]).filter((anel) => !dentroEncarte(anel));
    const b = lerPath(br.ufs[uf].d);
    const ia = new IndiceSegmentos(a);
    const ib = new IndiceSegmentos(b);
    const ds = [...amostrar(a).map((p) => ib.dist(p)), ...amostrar(b).map((p) => ia.dist(p))];
    todas.push(...ds);
    // Onde os dois arquivos discordam (> 1 px), qual deles se afasta da malha original?
    const io = new IndiceSegmentos(original.get(uf)!);
    for (const p of amostrar(b)) {
      const dOrig = io.dist(p);
      desvioBr = Math.max(desvioBr, dOrig);
      if (ia.dist(p) > 1) discordaBr.push(dOrig);
    }
    for (const p of amostrar(a)) {
      const dOrig = io.dist(p);
      desvioMun = Math.max(desvioMun, dOrig);
      if (ib.dist(p) > 1) discordaMun.push(dOrig);
    }
    porUf.push({ uf, p99: quantil(ds, 0.99), max: Math.max(...ds) });
  }
  const ate1 = todas.filter((d) => d <= 1).length / todas.length;
  return {
    amostras: todas.length,
    p50: quantil(todas, 0.5),
    p95: quantil(todas, 0.95),
    p99: quantil(todas, 0.99),
    p999: quantil(todas, 0.999),
    max: Math.max(...todas),
    ate1,
    desvioBr,
    desvioMun,
    discordaBr: discordaBr.length ? quantil(discordaBr, 0.5) : 0,
    discordaMun: discordaMun.length ? quantil(discordaMun, 0.5) : 0,
    nDiscorda: discordaBr.length + discordaMun.length,
    piores: porUf.sort((x, y) => y.max - x.max).slice(0, 5),
  };
}

// ───────────────────────────── 5. Ordem canônica ─────────────────────────────

function construirMunicipiosBr(): MunicipiosBr {
  const out: MunicipiosBr = { ordem: [], uf: [], cod: [], nome: [] };
  for (const uf of [...UFS].sort()) {
    const ds = lerJson<UfDataset>(join(DIR_UF, `${uf.toLowerCase()}.json`));
    if (ds.uf !== uf) throw new Error(`uf/${uf.toLowerCase()}.json traz uf=${ds.uf}`);
    for (const m of ds.municipios) {
      if (!/^\d{7}$/.test(m.ibge)) throw new Error(`${uf} ${m.cod} ${m.nome}: IBGE inválido "${m.ibge}"`);
      if (m.ibge.slice(0, 2) !== UF_IBGE[uf]) throw new Error(`${uf} ${m.cod} ${m.nome}: IBGE ${m.ibge} de outra UF`);
      out.ordem.push(m.ibge);
      out.uf.push(uf);
      out.cod.push(m.cod);
      out.nome.push(m.nome);
    }
  }
  return out;
}

// ───────────────────────────── main ─────────────────────────────

function main() {
  const t0 = Date.now();
  const argLimiar = process.argv.find((a) => a.startsWith('--limiar='));
  const argOrcamento = process.argv.find((a) => a.startsWith('--orcamento='));
  const orcamento = argOrcamento ? Number(argOrcamento.slice(12)) * MB : ORCAMENTO_PADRAO;
  if (!(orcamento > 0.3 * MB && orcamento <= 2.5 * MB)) throw new Error('--orcamento fora de (0,3; 2,5] MB');
  const br = lerJson<GeoBrasil>(ARQ_BR);

  // Projeção do br.json
  const { proj, largura, altura, viewBox } = projecaoBrasil(ARQ_BR_UF);
  if (viewBox !== br.viewBox) throw new Error(`viewBox ${viewBox} ≠ br.json ${br.viewBox}`);
  const cp = conferirProjecao((p) => proj(p) as [number, number] | null, br);
  console.log(`Projeção = br.json: viewBox ${viewBox} idêntico · ${cp.ok}/${cp.total} vértices do br.json reproduzidos`);
  if (cp.ok !== cp.total) throw new Error('a projeção não reproduz o br.json');

  // Topologia única, ilhas, projeção, encarte
  const unida = carregarMalhaBrasil();
  console.log(`Arcos compartilhados entre UFs (divisas): ${diagnosticarDivisas(unida).arcosEntreUfs}`);
  const { malha, omitidas, encarteFeicao } = separarIlhas(unida);
  const arcosProj: Pt[][] = malha.arcos.map((arco) => arco.map((p) => proj(p) as Pt));
  const encartes: EncarteBr[] = [];
  if (encarteFeicao) encartes.push(aplicarEncarte(arcosProj, malha.feicoes, encarteFeicao, largura, altura));
  const malhaZ: Malha<PtZ> = { arcos: preSimplificar(arcosProj), feicoes: malha.feicoes };
  console.log(`Ilhas omitidas: ${omitidas.join('; ')}`);
  if (encartes.length) console.log(`Encarte: ${JSON.stringify(encartes)}`);

  // Simplificação
  const saida = argLimiar ? gerar(malhaZ, viewBox, encartes, Number(argLimiar.slice(9))) : buscarLimiar(malhaZ, viewBox, encartes, orcamento);
  mkdirSync(join(RAIZ, 'public', 'geo'), { recursive: true });
  writeFileSync(ARQ_SAIDA_GEO, saida.json);
  const nVert = saida.res.vertices;
  console.log(
    `br-mun.json: ${(saida.bytes / MB).toFixed(3)} MB (${saida.bytes} B) · limiar ${saida.limiar.toFixed(3)} px² · ` +
      `${Object.keys(saida.geo.municipios).length} municípios · ${Object.keys(saida.geo.ufs).length} UFs · ${nVert} vértices · ` +
      `${saida.res.preservadas.length} preservados · ${saida.res.partesDescartadas} ilhotas descartadas`,
  );

  // Área mínima
  const areas = Object.entries(saida.geo.municipios).map(([id, d]) => ({ id, a: areaPath(d) }));
  areas.sort((x, y) => x.a - y.a);
  const negativos = areas.filter((x) => x.a <= 0);
  console.log(
    `Área (px²): menor ${areas
      .slice(0, 5)
      .map((x) => `${x.id}=${x.a.toFixed(2)}`)
      .join(', ')} · < 0,5 px²: ${areas.filter((x) => x.a < 0.5).length} · não positivas: ${negativos.length}`,
  );
  if (negativos.length) throw new Error(`municípios com área ≤ 0: ${negativos.map((x) => x.id).join(', ')}`);

  // Alinhamento com br.json
  const al = conferirAlinhamento(saida.geo, br, encartes, (p) => proj(p) as [number, number] | null, largura, altura);
  console.log(
    `Alinhamento contornos UF br-mun × br.json (px, ${al.amostras} amostras a cada 0,5 px, nos dois sentidos): ` +
      `p50 ${al.p50.toFixed(2)} · p95 ${al.p95.toFixed(2)} · p99 ${al.p99.toFixed(2)} · p99,9 ${al.p999.toFixed(2)} · máx ${al.max.toFixed(2)} · ` +
      `≤ 1 px: ${(al.ate1 * 100).toFixed(2)}% · piores UFs: ${al.piores.map((p) => `${p.uf} máx ${p.max.toFixed(2)} (p99 ${p.p99.toFixed(2)})`).join(', ')}\n` +
      `  distância máxima de cada arquivo à malha original das UFs (br-uf.topo.json sem simplificar): br.json ${al.desvioBr.toFixed(2)} px · ` +
      `br-mun.json ${al.desvioMun.toFixed(2)} px · nas ${al.nDiscorda} amostras em que discordam > 1 px, distância mediana à original: ` +
      `br.json ${al.discordaBr.toFixed(2)} px · br-mun.json ${al.discordaMun.toFixed(2)} px`,
  );

  // Ordem canônica
  const mb = construirMunicipiosBr();
  const unicos = new Set(mb.ordem);
  if (mb.ordem.length !== 5571) throw new Error(`municipios-br: ${mb.ordem.length} entradas (esperado 5.571)`);
  if (unicos.size !== mb.ordem.length) throw new Error('municipios-br: IBGE repetido');
  const semPath = mb.ordem.filter((c) => !saida.geo.municipios[c]);
  const semMun = Object.keys(saida.geo.municipios).filter((c) => !unicos.has(c));
  if (semPath.length || semMun.length) throw new Error(`sem path: ${semPath.join(',')} · path sem município: ${semMun.join(',')}`);
  // cadastro do TSE (cdi) = mesma lista
  const tse = lerJson<{ abr: { cd: string; mu: { cd: string; cdi: string }[] }[] }>(ARQ_TSE_MUN);
  const tsePar = new Set(tse.abr.filter((a) => a.cd !== 'zz').flatMap((a) => a.mu.map((m) => `${m.cdi}/${m.cd}`)));
  const divergentes = mb.ordem.filter((c, i) => !tsePar.has(`${c}/${mb.cod[i]}`));
  if (tsePar.size !== 5571 || divergentes.length) throw new Error(`cadastro TSE diverge: ${tsePar.size} · ${divergentes.join(',')}`);
  // mesmas chaves dos mapas por UF da fase 1 (public/geo/mun/{uf}.json)
  for (const uf of UFS) {
    const geoUf = lerJson<GeoUf>(join(RAIZ, 'public', 'geo', 'mun', `${uf.toLowerCase()}.json`));
    const a = Object.keys(geoUf.municipios).sort().join();
    const b = Object.keys(saida.geo.municipios).filter((c) => c.slice(0, 2) === UF_IBGE[uf]).sort().join();
    if (a !== b) throw new Error(`${uf}: municípios de geo/mun/${uf.toLowerCase()}.json ≠ br-mun.json`);
  }
  const jsonMun = JSON.stringify(mb);
  writeFileSync(ARQ_SAIDA_MUN, jsonMun);
  console.log(
    `municipios-br.json: ${(Buffer.byteLength(jsonMun) / 1024).toFixed(1)} KB · ${mb.ordem.length} municípios (IBGE únicos, todos com path; ` +
      `pares IBGE/TSE = cadastro do TSE; chaves = geo/mun/{uf}.json) · primeiro ${mb.uf[0]} ${mb.nome[0]} · último ${mb.uf.at(-1)} ${mb.nome.at(-1)}`,
  );
  console.log(`Pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
}

main();
