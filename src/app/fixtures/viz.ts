/**
 * Fixtures FICTÍCIAS para os componentes de visualização (kit /kit/viz, testes visuais e de desempenho).
 *
 * Tudo é determinístico (hash/PRNG com semente) e coerente com as geometrias REAIS de public/geo:
 *  - `fixtureNacional(pct)`   → resumo do Brasil, as 27 UFs (+ ZZ), série da apuração e 1º turno por UF,
 *                               no instante em que o país tem `pct`% das seções totalizadas. O padrão de
 *                               chegada (Sul/Sudeste antes, Norte/Nordeste depois) produz uma virada.
 *  - `municipiosBase(geo, ds?)` + `fixtureMunicipios(...)` → municípios de qualquer UF a partir das chaves
 *                               IBGE do GeoUf (nomes/códigos TSE reais quando o UfDataset é passado).
 *  - `carregarBaseUf(uf)`     → atalho que busca geo + dataset (public/data/uf) para nomes reais.
 *  - `zonasSinteticas()` + `mosaicoFixture(...)` → mosaico grande (~26,7 mil seções em 57 zonas, como a
 *                               capital paulista) em qualquer % de apuração.
 *
 * Os candidatos são fictícios ("Alfa" e "Beta") — nunca use estes dados fora de páginas de desenvolvimento.
 */
import type {
  MunicipioResumo,
  Race,
  SeriePoint,
  Summary,
  Tally,
  UF,
  UFBr,
  ZonaMosaico,
} from '@/shared/types';
import { UFS } from '@/shared/types';
import type { GeoUf, UfDataset } from '@/shared/dataset';
import { INICIO_APURACAO, UF_REGIAO } from '@/shared/constants';
import { bucketMargem, decodeFaixas, encodeFaixas, margem } from '@/shared/calc';
import { assetUrl } from '@/app/lib/assets';
import { loadGeoUf } from '@/app/components/apuracao/geo';

// ---------------------------------------------------------------------------------------------
// Corridas fictícias
// ---------------------------------------------------------------------------------------------

export const FIX_RACE: Race = {
  id: 'pres',
  cargo: 'Presidente',
  turno: 2,
  abrangencia: 'BR',
  titulo: 'Presidente',
  candidatos: [
    { numero: 10, nomeUrna: 'Candidata Alfa', nome: 'Candidata Alfa (fictícia)', partido: 'PFA', cor: 'a' },
    { numero: 20, nomeUrna: 'Candidato Beta', nome: 'Candidato Beta (fictício)', partido: 'PFB', cor: 'b' },
  ],
  ufs: [...UFS, 'ZZ'],
  tse: { ciclo: 'ele2026', eleicao: '0000', cargo: '1', pleito: '0000' },
};

export const FIX_RACE_T1: Race = {
  ...FIX_RACE,
  id: 'pres-t1',
  turno: 1,
  candidatos: [...FIX_RACE.candidatos, { numero: 0, nomeUrna: 'Outros', nome: 'Demais candidatos', partido: '', cor: 'outros', agregado: true }],
};

// ---------------------------------------------------------------------------------------------
// Aleatoriedade determinística
// ---------------------------------------------------------------------------------------------

/** FNV-1a → [0, 1). */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export function prng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Aproximação de normal padrão a partir de dois uniformes. */
const normal = (u1: number, u2: number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, u1))) * Math.cos(2 * Math.PI * u2);
const clamp = (n: number, a: number, b: number) => (n < a ? a : n > b ? b : n);

// ---------------------------------------------------------------------------------------------
// Brasil e UFs
// ---------------------------------------------------------------------------------------------

/** Eleitorado e seções reais (1º turno 2026, public/data/meta.json). */
const UF_BASE: Record<UF, [number, number]> = {
  AC: [613742, 2270], AL: [2442126, 7101], AM: [2798611, 8157], AP: [576988, 1914], BA: [11312752, 35476],
  CE: [6996545, 23765], DF: [2258320, 6969], ES: [2991650, 9844], GO: [5080590, 15686], MA: [5183115, 18093],
  MG: [16372372, 52062], MS: [2024430, 7106], MT: [2637801, 8287], PA: [6262397, 20827], PB: [3248531, 10712],
  PE: [7223450, 21418], PI: [2704758, 10225], PR: [8613657, 27142], RJ: [12857648, 37675], RN: [2659825, 8115],
  RO: [1265893, 4698], RR: [401521, 1519], RS: [8522545, 27547], SC: [5734651, 17326], SE: [1740135, 5923],
  SP: [34122892, 103656], TO: [1182023, 4384], ZZ: [916534, 1351],
};

/** Mediana de chegada por região (fração da noite) e tendência fictícia de cada região. */
const REG_CHEGADA: Record<string, number> = { S: 0.17, SE: 0.22, CO: 0.27, NE: 0.36, N: 0.44, EX: 0.55 };
const REG_TENDENCIA: Record<string, number> = { S: 42, SE: 48.2, CO: 45, NE: 60, N: 53, EX: 50 };

interface UfParams {
  lean: number;
  drift: number;
  m: number;
  w: number;
  comp: number;
  t1: number;
}

const UF_TODAS: UF[] = [...UFS, 'ZZ'];
const PARAMS: Record<UF, UfParams> = Object.fromEntries(
  UF_TODAS.map((uf) => {
    const r = UF_REGIAO[uf];
    const lean = REG_TENDENCIA[r] + (hash01(uf + ':lean') - 0.5) * 12;
    return [
      uf,
      {
        lean,
        drift: -1.2 + (hash01(uf + ':drift') - 0.5) * 5,
        m: REG_CHEGADA[r] + (hash01(uf + ':m') - 0.5) * 0.08,
        w: 0.035 + hash01(uf + ':w') * 0.025,
        comp: uf === 'ZZ' ? 0.38 : 0.76 + hash01(uf + ':comp') * 0.08,
        t1: lean - 1.5 + (hash01(uf + ':t1') - 0.5) * 7,
      },
    ];
  }),
) as Record<UF, UfParams>;

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** Fração de seções totalizadas na UF no instante s ∈ [0, 1] (0 = 17h, 1 = fim). */
function fracUf(uf: UF, s: number): number {
  const p = PARAMS[uf];
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  const l0 = logistic((0 - p.m) / p.w);
  const l1 = logistic((1 - p.m) / p.w);
  return clamp((logistic((s - p.m) / p.w) - l0) / (l1 - l0), 0, 1);
}

/** % médio do candidato 0 entre as seções que chegaram até a fração f. */
function pctAcumulado(lean: number, drift: number, f: number): number {
  if (f <= 0) return lean + drift;
  return lean + (drift * (1 - Math.pow(1 - f, 2.5))) / (2.5 * f);
}

const SIM_DURACAO_MS = 3 * 60 * 60 * 1000;
const tDe = (s: number) => INICIO_APURACAO + Math.round(s * SIM_DURACAO_MS);

function tallyDe(eleitorado: number, secoes: number, f: number, pctA: number, comp: number): Tally {
  const secoesTotalizadas = Math.round(f * secoes);
  const fe = secoes > 0 ? secoesTotalizadas / secoes : 0;
  const eleitoradoTotalizado = Math.round(fe * eleitorado);
  const comparecimento = Math.round(eleitoradoTotalizado * comp);
  const brancos = Math.round(comparecimento * 0.021);
  const nulos = Math.round(comparecimento * 0.034);
  const val = comparecimento - brancos - nulos;
  const v0 = Math.round((val * clamp(pctA, 0, 100)) / 100);
  return {
    secoes,
    secoesTotalizadas,
    eleitorado,
    eleitoradoTotalizado,
    comparecimento,
    abstencao: eleitoradoTotalizado - comparecimento,
    votos: [v0, val - v0],
    brancos,
    nulos,
  };
}

/** Completa um Tally com status/líder/eleito. */
export function resumir(t: Tally, simNow: number | null): Summary {
  const m = margem(t);
  const restante = t.eleitorado - t.eleitoradoTotalizado;
  const encerrada = t.secoes > 0 && t.secoesTotalizadas >= t.secoes;
  return {
    ...t,
    status: t.secoesTotalizadas <= 0 ? 'aguardando' : encerrada ? 'encerrada' : 'apurando',
    lider: m.lider,
    eleito: m.lider !== null && (encerrada || m.votos > restante) ? m.lider : null,
    ultimaAtualizacao: t.secoesTotalizadas > 0 ? simNow : null,
  };
}

/** Soma contagens (UF/Brasil a partir das partes). */
export function somar(partes: Tally[]): Tally {
  const out: Tally = {
    secoes: 0, secoesTotalizadas: 0, eleitorado: 0, eleitoradoTotalizado: 0, comparecimento: 0, abstencao: 0,
    votos: [0, 0], brancos: 0, nulos: 0,
  };
  for (const p of partes) {
    out.secoes += p.secoes;
    out.secoesTotalizadas += p.secoesTotalizadas;
    out.eleitorado += p.eleitorado;
    out.eleitoradoTotalizado += p.eleitoradoTotalizado;
    out.comparecimento += p.comparecimento;
    out.abstencao += p.abstencao;
    out.brancos += p.brancos;
    out.nulos += p.nulos;
    p.votos.forEach((v, i) => (out.votos[i] = (out.votos[i] ?? 0) + v));
  }
  return out;
}

function ufsNoInstante(s: number): Record<UF, Tally> {
  const out = {} as Record<UF, Tally>;
  for (const uf of UF_TODAS) {
    const [el, sec] = UF_BASE[uf];
    const p = PARAMS[uf];
    const f = fracUf(uf, s);
    out[uf] = tallyDe(el, sec, f, pctAcumulado(p.lean, p.drift, f), p.comp);
  }
  return out;
}

const TOTAL_SECOES = UF_TODAS.reduce((s, uf) => s + UF_BASE[uf][1], 0);

function pctNacional(s: number): number {
  let tot = 0;
  for (const uf of UF_TODAS) tot += Math.round(fracUf(uf, s) * UF_BASE[uf][1]);
  return (tot / TOTAL_SECOES) * 100;
}

/** Instante s em que o país atinge `pct`% das seções (bisseção). */
export function instanteDoPct(pct: number): number {
  if (pct <= 0) return 0;
  if (pct >= 100) return 1;
  let a = 0;
  let b = 1;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (pctNacional(m) < pct) a = m;
    else b = m;
  }
  return b;
}

let serieCompleta: SeriePoint[] | null = null;
/** Série inteira da noite (um ponto a cada ~0,25% de seções ou 0,4% do tempo). */
function serieInteira(): SeriePoint[] {
  if (serieCompleta) return serieCompleta;
  const pts: SeriePoint[] = [];
  let ultimoPst = -1;
  for (let i = 1; i <= 2500; i++) {
    const s = i / 2500;
    const br = somar(Object.values(ufsNoInstante(s)));
    const pst = (br.secoesTotalizadas / br.secoes) * 100;
    if (br.secoesTotalizadas === 0) continue;
    if (pst - ultimoPst < 0.25 && i % 10 !== 0 && i !== 2500) continue;
    const v = br.votos[0] + br.votos[1];
    const pv0 = v > 0 ? (br.votos[0] / v) * 100 : 50;
    pts.push({ t: tDe(s), pst, pv: [pv0, 100 - pv0] });
    ultimoPst = pst;
    if (pst >= 100) break;
  }
  serieCompleta = pts;
  return pts;
}

export interface FixtureNacional {
  simNow: number;
  /** Instante normalizado (0 = 17h, 1 = fim). */
  s: number;
  resumo: Summary;
  ufs: Record<UF, Summary>;
  serie: SeriePoint[];
  /** 1º turno fictício por UF: votos [candidato 0, candidato 1, outros] (mesma ordem de FIX_RACE_T1). */
  primeiroTurno: Record<UF, Pick<Tally, 'votos'>>;
  /** Fração (0–1) de seções totalizadas por UF — use em `fixtureMunicipios`. */
  fracoes: Record<UF, number>;
}

let t1Cache: Record<UF, Pick<Tally, 'votos'>> | null = null;
function primeiroTurnoUfs(): Record<UF, Pick<Tally, 'votos'>> {
  if (t1Cache) return t1Cache;
  const out = {} as Record<UF, Pick<Tally, 'votos'>>;
  for (const uf of UF_TODAS) {
    const [el] = UF_BASE[uf];
    const p = PARAMS[uf];
    const val = Math.round(el * p.comp * 0.94);
    const outros = Math.round(val * (0.06 + hash01(uf + ':outros') * 0.06));
    const v0 = Math.round(((val - outros) * clamp(p.t1, 5, 95)) / 100);
    out[uf] = { votos: [v0, val - outros - v0, outros] };
  }
  t1Cache = out;
  return out;
}

/** Estado nacional fictício quando o país tem `pct`% das seções totalizadas. */
export function fixtureNacional(pct: number): FixtureNacional {
  const s = instanteDoPct(pct);
  const tallies = ufsNoInstante(s);
  const simNow = tDe(s);
  const ufs = {} as Record<UF, Summary>;
  const fracoes = {} as Record<UF, number>;
  for (const uf of UF_TODAS) {
    ufs[uf] = resumir(tallies[uf], simNow);
    fracoes[uf] = fracUf(uf, s);
  }
  const resumo = resumir(somar(Object.values(tallies)), simNow);
  const pst = (resumo.secoesTotalizadas / resumo.secoes) * 100;
  const serie = serieInteira().filter((p) => p.pst <= pst + 1e-9);
  return { simNow, s, resumo, ufs, serie, primeiroTurno: primeiroTurnoUfs(), fracoes };
}

// ---------------------------------------------------------------------------------------------
// Municípios (qualquer UF, a partir das chaves IBGE do GeoUf)
// ---------------------------------------------------------------------------------------------

export interface MunBase {
  cod: string;
  ibge: string;
  nome: string;
  capital: boolean;
  eleitorado: number;
  secoes: number;
  zonas: { z: number; s: string }[];
  cx: number;
  cy: number;
}

/**
 * Lista de municípios da UF a partir da geometria (chaves IBGE). Com o `UfDataset` (public/data/uf),
 * usa nome, código TSE, capital, eleitorado e zonas reais; sem ele, gera valores plausíveis.
 */
export function municipiosBase(geo: GeoUf, ds?: UfDataset | null): MunBase[] {
  const porIbge = new Map((ds?.municipios ?? []).map((m) => [m.ibge, m]));
  return Object.entries(geo.municipios).map(([ibge, f], i) => {
    const m = porIbge.get(ibge);
    if (m) {
      const secoes = m.zonas.reduce((s, z) => s + decodeFaixas(z.s).length, 0);
      return { cod: m.cod, ibge, nome: m.nome, capital: m.capital, eleitorado: m.eleitorado, secoes, zonas: m.zonas, cx: f.cx, cy: f.cy };
    }
    const r = hash01(ibge);
    const eleitorado = Math.round(3000 + Math.pow(r, 6) * 400000);
    const secoes = Math.max(4, Math.round(eleitorado / 320));
    return {
      cod: String(10000 + i).padStart(5, '0'),
      ibge,
      nome: `Município ${ibge}`,
      capital: false,
      eleitorado,
      secoes,
      zonas: [{ z: 1 + (i % 40), s: `1-${secoes}` }],
      cx: f.cx,
      cy: f.cy,
    };
  });
}

/**
 * Resultados fictícios por município quando a UF tem `frac` (0–1) das seções totalizadas.
 * Campo espacialmente coerente (ondas suaves pela geometria) para o mapa parecer real.
 */
export function fixtureMunicipios(uf: UF, base: MunBase[], frac: number, simNow: number | null = null): MunicipioResumo[] {
  const p = PARAMS[uf];
  const fase1 = hash01(uf + ':f1') * 6.28;
  const fase2 = hash01(uf + ':f2') * 6.28;
  return base.map((m) => {
    const h = hash01(m.ibge + ':o');
    // Ordem de chegada: capital cedo; onda espacial (de um lado do mapa para o outro) + ruído.
    const onda = (Math.sin(m.cx / 260 + fase2) + 1) / 2;
    const o = m.capital ? 0.05 : clamp(0.08 + 0.55 * onda * 0.6 + h * 0.5, 0, 0.9);
    const f = clamp((frac * 1.25 - o) / 0.35, 0, 1);
    const campo = 13 * Math.sin(m.cx / 170 + fase1) * Math.cos(m.cy / 210 + fase2);
    const ruido = normal(hash01(m.ibge + ':a'), hash01(m.ibge + ':b')) * 5;
    const lean = clamp(p.lean + campo + ruido + (m.capital ? -7 : 0), 12, 88);
    const pctA = pctAcumulado(lean, p.drift * 1.5, f);
    const t = tallyDe(m.eleitorado, m.secoes, f, pctA, clamp(p.comp + (hash01(m.ibge + ':c') - 0.5) * 0.08, 0.6, 0.92));
    return { ...resumir(t, simNow), cod: m.cod, ibge: m.ibge, nome: m.nome, capital: m.capital };
  });
}

/** 1º turno fictício por município (chave IBGE) para o modo 'variacao'. */
export function primeiroTurnoMunicipios(uf: UF, base: MunBase[]): Record<string, Pick<Tally, 'votos'>> {
  const p = PARAMS[uf];
  const fase1 = hash01(uf + ':f1') * 6.28;
  const fase2 = hash01(uf + ':f2') * 6.28;
  const out: Record<string, Pick<Tally, 'votos'>> = {};
  for (const m of base) {
    const campo = 13 * Math.sin(m.cx / 170 + fase1) * Math.cos(m.cy / 210 + fase2);
    const ruido = normal(hash01(m.ibge + ':a'), hash01(m.ibge + ':b')) * 5;
    const lean = clamp(p.lean + campo + ruido + (m.capital ? -7 : 0), 12, 88);
    const t1 = clamp(lean - 1.5 + normal(hash01(m.ibge + ':t1a'), hash01(m.ibge + ':t1b')) * 3, 5, 95);
    const val = Math.round(m.eleitorado * 0.74);
    const outros = Math.round(val * 0.09);
    const v0 = Math.round(((val - outros) * t1) / 100);
    out[m.ibge] = { votos: [v0, val - outros - v0, outros] };
  }
  return out;
}

/** Busca geometria + dataset da UF (nomes reais). O dataset é opcional: se falhar, usa nomes genéricos. */
export async function carregarBaseUf(uf: UFBr): Promise<MunBase[]> {
  const [geo, ds] = await Promise.all([
    loadGeoUf(uf),
    fetch(assetUrl(`data/uf/${uf.toLowerCase()}.json`))
      .then((r) => (r.ok ? (r.json() as Promise<UfDataset>) : null))
      .catch(() => null),
  ]);
  return municipiosBase(geo, ds);
}

// ---------------------------------------------------------------------------------------------
// Mosaico de seções
// ---------------------------------------------------------------------------------------------

/** Estrutura de zonas sintética: `total` seções em `nZonas` zonas, numeração com lacunas realistas. */
export function zonasSinteticas(total = 26683, nZonas = 57, seed = 2026): { z: number; s: string }[] {
  const rnd = prng(seed);
  const pesos = Array.from({ length: nZonas }, () => 0.45 + rnd() * 1.1);
  const soma = pesos.reduce((a, b) => a + b, 0);
  const tamanhos = pesos.map((p) => Math.max(20, Math.round((p / soma) * total)));
  tamanhos[0] += total - tamanhos.reduce((a, b) => a + b, 0);
  const zonasNum: number[] = [];
  let z = 1;
  for (let i = 0; i < nZonas; i++) {
    zonasNum.push(z);
    z += rnd() < 0.15 ? 2 + Math.floor(rnd() * 40) : 1;
  }
  return tamanhos.map((n, i) => {
    const nums: number[] = [];
    let s = 1;
    while (nums.length < n) {
      nums.push(s);
      s += rnd() < 0.03 ? 2 + Math.floor(rnd() * 6) : 1;
    }
    return { z: zonasNum[i], s: encodeFaixas(nums) };
  });
}

interface MosaicoBase {
  zonas: number[];
  faixas: string[];
  /** Por seção (concatenado): chave de chegada [0, 1) e % do candidato 0. */
  chegada: Float32Array[];
  pct: Float32Array[];
}

const baseCache = new WeakMap<object, Map<string, MosaicoBase>>();

function mosaicoBase(zonas: { z: number; s: string }[], seed: string, lean: number): MosaicoBase {
  let porSeed = baseCache.get(zonas);
  if (!porSeed) baseCache.set(zonas, (porSeed = new Map()));
  const chave = `${seed}|${lean}`;
  const hit = porSeed.get(chave);
  if (hit) return hit;
  const base: MosaicoBase = { zonas: [], faixas: [], chegada: [], pct: [] };
  for (const z of zonas) {
    const nums = decodeFaixas(z.s);
    const rnd = prng(Math.floor(hash01(`${seed}:${z.z}`) * 2 ** 31));
    const zonaChegada = hash01(`${seed}:${z.z}:c`);
    const zonaLean = lean + normal(hash01(`${seed}:${z.z}:l1`), hash01(`${seed}:${z.z}:l2`)) * 9;
    const ch = new Float32Array(nums.length);
    const pc = new Float32Array(nums.length);
    for (let i = 0; i < nums.length; i++) {
      // Rajadas por zona + ruído por seção; mapeado para [0, 1).
      ch[i] = clamp(0.55 * zonaChegada + 0.45 * rnd() + (rnd() < 0.004 ? 0.4 : 0), 0, 0.9999);
      pc[i] = clamp(zonaLean + normal(rnd(), rnd()) * 11, 0, 100);
    }
    base.zonas.push(z.z);
    base.faixas.push(z.s);
    base.chegada.push(ch);
    base.pct.push(pc);
  }
  porSeed.set(chave, base);
  return base;
}

const CHARS_A = ['a', 'b', 'c', 'd'];
const CHARS_B = ['e', 'f', 'g', 'h'];

/**
 * Mosaico fictício: seções com chave de chegada < `frac` estão totalizadas.
 * `tse: true` simula a fonte TSE ao vivo (só o status: 't').
 */
export function mosaicoFixture(
  zonas: { z: number; s: string }[],
  frac: number,
  opts: { seed?: string; lean?: number; tse?: boolean } = {},
): ZonaMosaico[] {
  const base = mosaicoBase(zonas, opts.seed ?? 'mosaico', opts.lean ?? 48);
  const out: ZonaMosaico[] = [];
  for (let zi = 0; zi < base.zonas.length; zi++) {
    const ch = base.chegada[zi];
    const pc = base.pct[zi];
    const chars = new Array<string>(ch.length);
    for (let i = 0; i < ch.length; i++) {
      if (ch[i] >= frac) chars[i] = '0';
      else if (opts.tse) chars[i] = 't';
      else {
        const p = pc[i];
        if (p <= 0.05 && i % 97 === 0) chars[i] = 'z';
        else if (Math.abs(p - 50) < 0.12) chars[i] = 'x';
        else {
          const b = bucketMargem(Math.abs(2 * p - 100));
          chars[i] = p > 50 ? CHARS_A[b] : CHARS_B[b];
        }
      }
    }
    out.push({ zona: base.zonas[zi], faixas: base.faixas[zi], estado: chars.join('') });
  }
  return out;
}

/** Mosaico grande pronto (~26,7 mil seções, 57 zonas) — teste de desempenho. */
let zonasGrandes: { z: number; s: string }[] | null = null;
export function mosaicoGrande(frac: number, tse = false): ZonaMosaico[] {
  zonasGrandes ??= zonasSinteticas();
  return mosaicoFixture(zonasGrandes, frac, { seed: 'sp-capital', lean: 46, tse });
}
