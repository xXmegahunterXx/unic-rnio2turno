/**
 * Fixtures FALSAS (porém consistentes) para a vitrine /kit e testes visuais dos componentes de dados.
 *
 * - Determinísticas: mesmo instante ⇒ mesmos números.
 * - Consistentes: soma dos municípios = UF; soma das UFs (+ ZZ) = Brasil; soma das seções = zona;
 *   v0 + v1 + brancos + nulos = comparecimento; % válidos dos dois somam 100.
 * - Instantes: 0% (aguardando), ~35%, ~70% e 100% (encerrada, com eleito). O padrão regional
 *   (Sul/Sudeste chegam antes, Nordeste/Norte depois) produz uma virada entre 35% e 70%.
 *
 * NÃO use em produção: os números são fictícios. Os candidatos são os reais (para testar o layout
 * com nomes reais), e tudo o que é exibido com estes dados leva a marca SIMULAÇÃO.
 */
import type {
  FeedEvent,
  LiveStatus,
  MunicipioResumo,
  NationalSnapshot,
  Race,
  Regiao,
  Restante,
  SecaoDetalhe,
  SecaoResumo,
  SeriePoint,
  Summary,
  Tally,
  UF,
  UfSnapshot,
  ZonaResumo,
  ZonaSnapshot,
} from '@/shared/types';
import { UFS } from '@/shared/types';
import { INICIO_APURACAO, UF_NOMES, UF_REGIAO, UFS_GOV_2T } from '@/shared/constants';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';

// ---------------------------------------------------------------------------------------------
// Corridas (dados públicos de candidatura, iguais ao dataset)
// ---------------------------------------------------------------------------------------------

const tseStub = (eleicao: string, cargo: string) => ({ ciclo: 'ele2026', eleicao, cargo, pleito: '3221' });

export const RACE_PRES: Race = {
  id: 'pres',
  cargo: 'Presidente',
  turno: 2,
  abrangencia: 'BR',
  titulo: 'Presidente',
  candidatos: [
    { numero: 13, nomeUrna: 'Lula', nome: 'Luiz Inácio Lula da Silva', partido: 'PT', coligacao: 'Brasil Pronto pra Mais', vice: 'Geraldo Alckmin', cor: 'a', primeiroTurno: { votos: 53879538, pct: 45.16 } },
    { numero: 22, nomeUrna: 'Flávio Bolsonaro', nome: 'Flávio Nantes Bolsonaro', partido: 'PL', vice: 'Alfredo Gaspar', cor: 'b', primeiroTurno: { votos: 56104503, pct: 47.03 } },
  ],
  ufs: [...UFS, 'ZZ'],
  tse: tseStub('6258', '1'),
};

export const RACE_PRES_T1: Race = {
  ...RACE_PRES,
  id: 'pres-t1',
  turno: 1,
  titulo: 'Presidente · 1º turno',
  candidatos: [
    ...RACE_PRES.candidatos,
    { numero: 0, nomeUrna: 'Outros', nome: 'Demais candidatos', partido: '', cor: 'outros', agregado: true },
  ],
  tse: { ciclo: 'ele2026', eleicao: '6257', cargo: '1', pleito: '3220' },
};

type CandGov = [number, string, string, string];
const GOV: Record<string, [CandGov, CandGov]> = {
  AC: [[10, 'Alan Rick', 'REPUBLICANOS', 'Ricardo Leite'], [11, 'Mailza Assis', 'PP', 'Jéssica Sales']],
  AM: [[22, 'Professora Maria do Carmo', 'PL', 'Coronel Aníbal'], [55, 'Omar Aziz', 'PSD', 'Alessandra Campelo']],
  DF: [[11, 'Celina Leão', 'PP', 'Gustavo Rocha'], [13, 'Leandro Grass', 'PT', 'Dora Gomes']],
  ES: [[10, 'Lorenzo Pazolini', 'REPUBLICANOS', 'Eliane Leal'], [15, 'Ricardo Ferraço', 'MDB', 'Camillo Neves']],
  RJ: [[22, 'Douglas Ruas', 'PL', 'Fernanda Louback'], [55, 'Eduardo Paes', 'PSD', 'Jane Reis']],
  RN: [[13, 'Cadu de Lula', 'PT', 'Larissa'], [44, 'Allyson', 'UNIÃO', 'Hermano']],
  TO: [[44, 'Professora Dorinha', 'UNIÃO', 'Atos Gomes'], [45, 'Vicentinho Júnior', 'PSDB', 'Amélio Cayres']],
};

export const RACES_GOV: Race[] = UFS_GOV_2T.map((uf) => ({
  id: `gov-${uf.toLowerCase()}`,
  cargo: 'Governador',
  turno: 2,
  abrangencia: uf,
  titulo: `Governador · ${UF_NOMES[uf]}`,
  candidatos: GOV[uf].map(([numero, nomeUrna, partido, vice], i) => ({
    numero,
    nomeUrna,
    nome: nomeUrna,
    partido,
    vice,
    cor: i === 0 ? ('a' as const) : ('b' as const),
  })),
  ufs: [uf],
  tse: tseStub('6260', '3'),
}));

export const RACES: Race[] = [RACE_PRES, ...RACES_GOV, RACE_PRES_T1];

// ---------------------------------------------------------------------------------------------
// Base: UFs (eleitorado e seções reais do 1º turno de 2026)
// ---------------------------------------------------------------------------------------------

const UF_BASE: Record<UF, [eleitorado: number, secoes: number]> = {
  AC: [613742, 2270], AL: [2442126, 7101], AM: [2798611, 8157], AP: [576988, 1914], BA: [11312752, 35476],
  CE: [6996545, 23765], DF: [2258320, 6969], ES: [2991650, 9844], GO: [5080590, 15686], MA: [5183115, 18093],
  MG: [16372372, 52062], MS: [2024430, 7106], MT: [2637801, 8287], PA: [6262397, 20827], PB: [3248531, 10712],
  PE: [7223450, 21418], PI: [2704758, 10225], PR: [8613657, 27142], RJ: [12857648, 37675], RN: [2659825, 8115],
  RO: [1265893, 4698], RR: [401521, 1519], RS: [8522545, 27547], SC: [5734651, 17326], SE: [1740135, 5923],
  SP: [34122892, 103656], TO: [1182023, 4384], ZZ: [916534, 1351],
};

const TODAS_UFS: UF[] = [...UFS, 'ZZ'];

/** Preferência final (fração dos válidos) do candidato 0 por região. */
const P0_REGIAO: Record<Regiao, number> = { NE: 0.69, N: 0.53, SE: 0.48, S: 0.425, CO: 0.43, EX: 0.49 };
/** Mediana de chegada (min após 17h) por região — padrão "realista" do motor. */
const MEDIANA: Record<Regiao, number> = { S: 34, SE: 38, CO: 42, NE: 50, N: 62, EX: 75 };
const SIGMA = 0.55;
const FIM_MIN = 300;

// ---------------------------------------------------------------------------------------------
// Utilitários determinísticos
// ---------------------------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Valor pseudoaleatório estável em [-1, 1]. */
const jit = (s: string) => (hash(s) / 4294967295) * 2 - 1;

function erf(x: number) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const cdfLogNormal = (t: number, mediana: number, sigma = SIGMA) => (t <= 0 ? 0 : 0.5 * (1 + erf(Math.log(t / mediana) / (sigma * Math.SQRT2))));

const minToMs = (m: number) => INICIO_APURACAO + Math.round(m * 60_000);

/** Distribui `total` proporcionalmente a `pesos` (maior resto: soma exata). */
function repartir(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  const brutos = pesos.map((p) => (p / soma) * total);
  const base = brutos.map(Math.floor);
  let resto = total - base.reduce((a, b) => a + b, 0);
  const ordem = brutos.map((b, i) => [b - Math.floor(b), i] as const).sort((x, y) => y[0] - x[0]);
  for (let k = 0; resto > 0; k = (k + 1) % ordem.length, resto--) base[ordem[k][1]]++;
  return base;
}

function tallyVazio(secoes: number, eleitorado: number, n = 2): Tally {
  return { secoes, secoesTotalizadas: 0, eleitorado, eleitoradoTotalizado: 0, comparecimento: 0, abstencao: 0, votos: new Array(n).fill(0), brancos: 0, nulos: 0 };
}

function somar(ts: Tally[], n = 2): Tally {
  const out = tallyVazio(0, 0, n);
  for (const t of ts) {
    out.secoes += t.secoes;
    out.secoesTotalizadas += t.secoesTotalizadas;
    out.eleitorado += t.eleitorado;
    out.eleitoradoTotalizado += t.eleitoradoTotalizado;
    out.comparecimento += t.comparecimento;
    out.abstencao += t.abstencao;
    out.brancos += t.brancos;
    out.nulos += t.nulos;
    t.votos.forEach((v, i) => (out.votos[i] += v));
  }
  return out;
}

/** Contagem de uma área com fração `f` totalizada e preferência `p0` para o candidato 0. */
function tallyArea(secoes: number, eleitorado: number, f: number, p0: number, seed: string): Tally {
  const st = f >= 0.9995 ? secoes : Math.round(secoes * f);
  const fr = secoes > 0 ? st / secoes : 0;
  const et = Math.round(eleitorado * fr);
  const comp = Math.round(et * (0.79 + 0.04 * jit(`${seed}:c`)));
  const brancos = Math.round(comp * (0.019 + 0.004 * jit(`${seed}:b`)));
  const nulos = Math.round(comp * (0.03 + 0.006 * jit(`${seed}:n`)));
  const val = comp - brancos - nulos;
  const v0 = Math.round(val * Math.min(0.97, Math.max(0.03, p0)));
  return { secoes, secoesTotalizadas: st, eleitorado, eleitoradoTotalizado: et, comparecimento: comp, abstencao: et - comp, votos: [v0, val - v0], brancos, nulos };
}

function resumir(t: Tally, simNow: number): Summary {
  const m = margem(t);
  const status = t.secoesTotalizadas === 0 ? 'aguardando' : t.secoesTotalizadas >= t.secoes ? 'encerrada' : 'apurando';
  const restante = t.eleitorado - t.eleitoradoTotalizado;
  const eleito = m.lider !== null && (status === 'encerrada' || m.votos > restante) ? m.lider : null;
  return { ...t, status, lider: m.lider, eleito, ultimaAtualizacao: t.secoesTotalizadas > 0 ? simNow : null };
}

function restanteDe(r: Summary): Restante {
  const eleitorado = r.eleitorado - r.eleitoradoTotalizado;
  const taxa = r.eleitoradoTotalizado > 0 ? validos(r) / r.eleitoradoTotalizado : 0.75;
  const validosEstimados = Math.round(eleitorado * taxa);
  let necessarioParaVirar: number | null = null;
  const m = margem(r);
  if (r.eleito === null && m.lider !== null && validosEstimados > 0) {
    necessarioParaVirar = Math.min(100, Math.max(0, ((m.votos / validosEstimados + 1) / 2) * 100));
  }
  return { eleitorado, validosEstimados, necessarioParaVirar };
}

// ---------------------------------------------------------------------------------------------
// Modelo por UF
// ---------------------------------------------------------------------------------------------

/** Fração totalizada da UF no minuto t. */
function fracaoUf(uf: UF, t: number): number {
  if (t >= FIM_MIN) return 1;
  const med = MEDIANA[UF_REGIAO[uf]] * (1 + 0.12 * jit(`med:${uf}`));
  return cdfLogNormal(t, med);
}

/** Preferência do candidato 0 na UF com fração f apurada (capitais chegam antes e puxam a média). */
function p0Uf(uf: UF, f: number): number {
  const base = P0_REGIAO[UF_REGIAO[uf]] + 0.05 * jit(`p0:${uf}`);
  const deriva = 0.035 * jit(`drift:${uf}`);
  return base + deriva * (1 - f);
}

function p0Gov(uf: UF, f: number): number {
  const base = 0.5 + 0.09 * jit(`gov:${uf}`);
  return base + 0.04 * jit(`govd:${uf}`) * (1 - f);
}

// ---------------------------------------------------------------------------------------------
// Rio de Janeiro: municípios (40 maiores, nomes reais; números fictícios)
// ---------------------------------------------------------------------------------------------

const MUN_RJ: [nome: string, peso: number][] = [
  ['Rio de Janeiro', 100], ['São Gonçalo', 15.5], ['Duque de Caxias', 13.4], ['Nova Iguaçu', 12.6], ['Niterói', 9.4],
  ['Belford Roxo', 8.4], ['Campos dos Goytacazes', 8.2], ['São João de Meriti', 8.0], ['Petrópolis', 6.1],
  ['Volta Redonda', 5.4], ['Magé', 4.8], ['Itaboraí', 4.6], ['Macaé', 4.4], ['Mesquita', 3.6], ['Nova Friburgo', 3.6],
  ['Barra Mansa', 3.5], ['Cabo Frio', 3.4], ['Nilópolis', 3.1], ['Teresópolis', 3.1], ['Queimados', 2.8],
  ['Maricá', 3.0], ['Angra dos Reis', 2.9], ['Resende', 2.4], ['Rio das Ostras', 2.3], ['Itaguaí', 2.2], ['Japeri', 1.9],
  ['Araruama', 2.2], ['Barra do Piraí', 1.8], ['Seropédica', 1.6], ['Saquarema', 1.6], ['Três Rios', 1.5],
  ['Valença', 1.4], ['Guapimirim', 1.1], ['Rio Bonito', 1.1], ['Paracambi', 0.9], ['Itaperuna', 1.9],
  ['Cachoeiras de Macacu', 1.1], ['Paraíba do Sul', 0.8], ['Santo Antônio de Pádua', 0.8], ['Paraty', 0.8],
];

function municipiosRj(t: number, simNow: number, race: 'pres' | 'gov'): MunicipioResumo[] {
  const [eleitorado, secoes] = UF_BASE.RJ;
  const pesos = MUN_RJ.map(([, p]) => p);
  const els = repartir(eleitorado, pesos);
  const secs = repartir(secoes, pesos);
  const medUf = MEDIANA.SE * (1 + 0.12 * jit('med:RJ'));
  return MUN_RJ.map(([nome], i) => {
    const capital = i === 0;
    const med = medUf * (capital ? 0.95 : 1 + 0.25 * jit(`mmed:${nome}`));
    const f = t >= FIM_MIN ? 1 : cdfLogNormal(t, med);
    const pBase = race === 'pres' ? p0Uf('RJ', f) : p0Gov('RJ', f);
    const p0 = pBase + 0.08 * jit(`mp:${race}:${nome}`) + (capital ? 0.03 : 0);
    const tally = tallyArea(secs[i], els[i], f, p0, `rj:${race}:${nome}`);
    return {
      ...resumir(tally, simNow),
      cod: capital ? '60011' : String(58000 + i * 37).padStart(5, '0'),
      ibge: capital ? '3304557' : `33${String(10000 + i * 211).padStart(5, '0')}`,
      nome,
      capital,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Zona e seções (Rio de Janeiro, 4ª zona)
// ---------------------------------------------------------------------------------------------

const ZONA_NUM = 4;
const ZONA_SECOES = 168;

function secoesZona(t: number): SecaoResumo[] {
  const r = rng('zona-rio-4');
  const out: SecaoResumo[] = [];
  for (let k = 0; k < ZONA_SECOES; k++) {
    const secao = k < 120 ? k + 1 : k + 31; // lacuna (seções agregadas)
    const aptos = Math.round(300 + r() * 120);
    // chegada lognormal com efeito de "rajada" a cada bloco de 24 seções
    const bloco = Math.floor(k / 24);
    const u = Math.max(1e-6, Math.min(1 - 1e-6, r()));
    const z = Math.sqrt(2) * erfinv(2 * u - 1);
    const chegada = 36 * Math.exp(0.5 * z + 0.15 * jit(`bloco:${bloco}`));
    const totalizada = t >= FIM_MIN || chegada <= t;
    const comp = Math.round(aptos * (0.76 + r() * 0.1));
    const brancos = Math.round(comp * (0.012 + r() * 0.015));
    const nulos = Math.round(comp * (0.02 + r() * 0.02));
    const val = comp - brancos - nulos;
    const p0 = 0.48 + 0.16 * (r() - 0.5) + 0.06 * jit(`sp:${bloco}`);
    const v0 = Math.round(val * p0);
    out.push({
      secao,
      totalizada,
      totalizadaEm: totalizada ? minToMs(Math.min(chegada, FIM_MIN - 1)) : null,
      aptos,
      comparecimento: totalizada ? comp : 0,
      votos: totalizada ? [v0, val - v0] : [0, 0],
      brancos: totalizada ? brancos : 0,
      nulos: totalizada ? nulos : 0,
    });
  }
  return out;
}

function erfinv(x: number) {
  const a = 0.147;
  const ln = Math.log(1 - x * x);
  const t = 2 / (Math.PI * a) + ln / 2;
  return Math.sign(x) * Math.sqrt(Math.sqrt(t * t - ln / a) - t);
}

function codigoIdent(seed: string): string {
  const r = rng(seed);
  const hex = () => Math.floor(r() * 65536).toString(16).toUpperCase().padStart(4, '0');
  return `${hex()}.${hex()}.${hex()}.${hex()}`;
}

// ---------------------------------------------------------------------------------------------
// Snapshots por instante
// ---------------------------------------------------------------------------------------------

export type Instante = 0 | 35 | 70 | 100;
export const INSTANTES: Instante[] = [0, 35, 70, 100];
export const INSTANTE_ROTULO: Record<Instante, string> = { 0: 'Aguardando', 35: '35%', 70: '70%', 100: '100% · eleito' };

function nacionalNoMinuto(t: number, simNow: number) {
  const rj = municipiosRj(t, simNow, 'pres');
  const ufTally: Partial<Record<UF, Tally>> = {};
  for (const uf of TODAS_UFS) {
    if (uf === 'RJ') {
      ufTally.RJ = somar(rj);
      continue;
    }
    const f = fracaoUf(uf, t);
    const [el, sec] = UF_BASE[uf];
    ufTally[uf] = tallyArea(sec, el, f, p0Uf(uf, f), `uf:${uf}`);
  }
  const br = somar(TODAS_UFS.map((u) => ufTally[u]!));
  return { ufTally, br, rj };
}

/** Minuto (após 17h) em que o Brasil atinge `pct` % das seções. */
function minutoParaPct(pct: number): number {
  if (pct <= 0) return 0;
  if (pct >= 100) return FIM_MIN;
  let lo = 1;
  let hi = FIM_MIN - 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const p = pctTotalizadas(nacionalNoMinuto(mid, 0).br);
    if (p < pct) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function serieAte(tFim: number): SeriePoint[] {
  const pts: SeriePoint[] = [];
  if (tFim <= 0) return pts;
  const passo = tFim > 120 ? 3 : 1.5;
  for (let t = 1; t <= tFim + 1e-9; t += passo) {
    const { br } = nacionalNoMinuto(t, 0);
    if (br.secoesTotalizadas === 0) continue;
    pts.push({ t: minToMs(t), pst: pctTotalizadas(br), pv: [pctValidos(br, 0), pctValidos(br, 1)] });
  }
  const { br } = nacionalNoMinuto(tFim, 0);
  if (br.secoesTotalizadas > 0) pts.push({ t: minToMs(tFim), pst: pctTotalizadas(br), pv: [pctValidos(br, 0), pctValidos(br, 1)] });
  return pts;
}

function eventosAte(tFim: number): FeedEvent[] {
  const ev: FeedEvent[] = [];
  const nomes = RACE_PRES.candidatos.map((c) => c.nomeUrna);
  if (tFim <= 0) return ev;
  ev.push({ id: 'inicio', t: INICIO_APURACAO, tipo: 'inicio', abrangencia: 'BR', race: 'pres', titulo: 'Começa a divulgação dos resultados', detalhe: 'As primeiras seções totalizadas entram no placar.' });
  const marcos = [1, 5, 10, 25, 50, 75, 90, 95, 99, 100];
  let mi = 0;
  let lider: number | null = null;
  let eleito: number | null = null;
  const encerradas = new Set<UF>();
  const passo = 0.5;
  for (let t = passo; t <= tFim + 1e-9; t += passo) {
    const { br, ufTally } = nacionalNoMinuto(t, 0);
    const pst = pctTotalizadas(br);
    const r = resumir(br, minToMs(t));
    while (mi < marcos.length && pst >= marcos[mi]) {
      const m = marcos[mi];
      const l = r.lider;
      ev.push({
        id: `marco-${m}`,
        t: minToMs(t),
        tipo: 'marco',
        abrangencia: 'BR',
        race: 'pres',
        titulo: m === 100 ? 'Todas as seções foram totalizadas' : `${m}% das seções totalizadas`,
        detalhe: l !== null ? `${nomes[0]} ${fmtPct(pctValidos(br, 0))} · ${nomes[1]} ${fmtPct(pctValidos(br, 1))}` : undefined,
      });
      mi++;
    }
    if (pst >= 0.5 && r.lider !== null && r.lider !== lider) {
      ev.push({
        id: `lider-${t}`,
        t: minToMs(t),
        tipo: lider === null || pst <= 5 ? 'lideranca' : 'virada',
        abrangencia: 'BR',
        race: 'pres',
        titulo: `Com ${fmtPct(pst, pst < 1 ? 2 : 1)} das seções, ${nomes[r.lider]} passa à frente`,
        detalhe: `${fmtPct(pctValidos(br, r.lider))} dos votos válidos`,
        candidato: r.lider,
      });
      lider = r.lider;
    }
    for (const uf of TODAS_UFS) {
      const u = ufTally[uf]!;
      if (!encerradas.has(uf) && u.secoesTotalizadas >= u.secoes && (uf === 'DF' || uf === 'AC' || uf === 'SC' || uf === 'RR' || uf === 'AP')) {
        encerradas.add(uf);
        ev.push({ id: `enc-${uf}`, t: minToMs(t), tipo: 'uf-encerrada', abrangencia: uf, race: 'pres', titulo: `${UF_NOMES[uf]} conclui a totalização` });
      }
    }
    if (r.eleito !== null && eleito === null) {
      eleito = r.eleito;
      ev.push({
        id: 'eleito',
        t: minToMs(t),
        tipo: 'eleito',
        abrangencia: 'BR',
        race: 'pres',
        titulo: `${nomes[r.eleito]} está matematicamente eleito`,
        detalhe: 'A diferença supera o número de eleitores das seções ainda não totalizadas.',
        candidato: r.eleito,
      });
    }
  }
  return ev.sort((a, b) => b.t - a.t).slice(0, 60);
}

export interface GovernadorFixture {
  race: Race;
  resumo: Summary;
}

export interface CoreFixtures {
  instante: Instante;
  simNow: number;
  status: LiveStatus;
  races: Race[];
  race: Race;
  raceT1: Race;
  nacional: NationalSnapshot;
  /** Placar do 1º turno (final, real). */
  resumoT1: Summary;
  /** UF de exemplo: Rio de Janeiro (40 municípios). */
  uf: UfSnapshot;
  governadores: GovernadorFixture[];
  /** Zonas do município do Rio (somam o município). */
  zonasRio: ZonaResumo[];
  /** 4ª zona do Rio: 168 seções. */
  zona: ZonaSnapshot;
  /** Boletim de uma seção totalizada (ou pendente no instante 0). */
  secao: SecaoDetalhe;
  /** Boletim de uma seção ainda não totalizada. */
  secaoPendente: SecaoDetalhe;
}

const cache = new Map<Instante, CoreFixtures>();

/** Monta (e memoriza) as fixtures de um instante. */
export function coreFixtures(instante: Instante): CoreFixtures {
  const hit = cache.get(instante);
  if (hit) return hit;
  const t = minutoParaPct(instante);
  const simNow = instante === 0 ? INICIO_APURACAO - 20 * 60_000 : minToMs(t);
  const { ufTally, br, rj } = nacionalNoMinuto(t, simNow);

  const ufs: Partial<Record<UF, Summary>> = {};
  for (const uf of TODAS_UFS) ufs[uf] = resumir(ufTally[uf]!, simNow);
  const regioes: Partial<Record<Regiao, Summary>> = {};
  for (const reg of ['N', 'NE', 'CO', 'SE', 'S', 'EX'] as Regiao[]) {
    regioes[reg] = resumir(somar(TODAS_UFS.filter((u) => UF_REGIAO[u] === reg).map((u) => ufTally[u]!)), simNow);
  }
  const resumo = resumir(br, simNow);
  const nacional: NationalSnapshot = {
    race: 'pres',
    geradoEm: Date.now(),
    simNow,
    resumo,
    ufs,
    regioes,
    serie: serieAte(t),
    eventos: eventosAte(t),
    restante: restanteDe(resumo),
  };

  const ufResumo = resumir(somar(rj), simNow);
  const uf: UfSnapshot = {
    race: 'pres',
    uf: 'RJ',
    geradoEm: Date.now(),
    simNow,
    resumo: ufResumo,
    municipios: rj,
    serie: [],
    eventos: nacional.eventos.filter((e) => e.abrangencia === 'BR').slice(0, 8),
    restante: restanteDe(ufResumo),
  };

  const governadores = RACES_GOV.map((race) => {
    const u = race.abrangencia as UF;
    const f = fracaoUf(u, t);
    const [el, sec] = UF_BASE[u];
    return { race, resumo: resumir(tallyArea(sec, el, f, p0Gov(u, f), `gov:${u}`), simNow) };
  });

  // Zonas do município do Rio: reparte o total do município em 25 zonas (soma exata).
  const rio = rj[0];
  const nZ = 25;
  const pesosZ = Array.from({ length: nZ }, (_, i) => 1 + 0.45 * jit(`z:${i}`));
  const fz = Array.from({ length: nZ }, (_, i) => Math.min(1, Math.max(0, pctTotalizadas(rio) / 100 + 0.25 * jit(`zf:${i}:${instante}`))));
  const zonasRio: ZonaResumo[] = repartirZonas(rio, pesosZ, fz, simNow);

  const secoes = secoesZona(t);
  const zonaResumo = resumir(somar(secoes.map(secaoComoTally)), simNow);
  const zona: ZonaSnapshot = {
    race: 'pres',
    uf: 'RJ',
    cod: rio.cod,
    nomeMunicipio: rio.nome,
    zona: ZONA_NUM,
    geradoEm: Date.now(),
    simNow,
    resumo: zonaResumo,
    secoes,
  };

  const tot = secoes.find((s) => s.totalizada) ?? secoes[0];
  const pend = secoes.find((s) => !s.totalizada) ?? { ...secoes[secoes.length - 1], totalizada: false, totalizadaEm: null, comparecimento: 0, votos: [0, 0], brancos: 0, nulos: 0 };
  const det = (s: SecaoResumo): SecaoDetalhe => ({
    ...s,
    race: 'pres',
    uf: 'RJ',
    cod: rio.cod,
    nomeMunicipio: rio.nome,
    zona: ZONA_NUM,
    abstencao: s.totalizada ? s.aptos - s.comparecimento : 0,
    codigoIdentificacao: codigoIdent(`bu:${ZONA_NUM}:${s.secao}`),
    simulado: true,
  });

  const fx: CoreFixtures = {
    instante,
    simNow,
    status: {
      fonte: 'simulacao',
      fase: instante === 0 ? 'pre' : instante === 100 ? 'encerrada' : 'apurando',
      simNow,
      wallNow: Date.now(),
      inicioApuracao: INICIO_APURACAO,
      velocidade: 20,
      pausado: false,
      aviso: null,
      versao: 1,
      races: RACES.map((r) => r.id),
      simulacao: true,
      congelado: false,
    },
    races: RACES,
    race: RACE_PRES,
    raceT1: RACE_PRES_T1,
    nacional,
    resumoT1: RESUMO_T1,
    uf,
    governadores,
    zonasRio,
    zona,
    secao: det(tot),
    secaoPendente: det(pend),
  };
  cache.set(instante, fx);
  return fx;
}

function secaoComoTally(s: SecaoResumo): Tally {
  return {
    secoes: 1,
    secoesTotalizadas: s.totalizada ? 1 : 0,
    eleitorado: s.aptos,
    eleitoradoTotalizado: s.totalizada ? s.aptos : 0,
    comparecimento: s.comparecimento,
    abstencao: s.totalizada ? s.aptos - s.comparecimento : 0,
    votos: s.votos,
    brancos: s.brancos,
    nulos: s.nulos,
  };
}

function repartirZonas(m: MunicipioResumo, pesos: number[], fr: number[], simNow: number): ZonaResumo[] {
  const secs = repartir(m.secoes, pesos);
  const els = repartir(m.eleitorado, pesos);
  // Distribui as seções totalizadas do município entre zonas respeitando a capacidade de cada uma.
  const alvo = m.secoesTotalizadas;
  const desejo = secs.map((s, i) => s * fr[i]);
  const st = repartir(alvo, desejo.some((d) => d > 0) ? desejo : secs).map((v, i) => Math.min(v, secs[i]));
  let falta = alvo - st.reduce((a, b) => a + b, 0);
  for (let i = 0; falta > 0 && i < st.length * 2; i++) {
    const k = i % st.length;
    const add = Math.min(falta, secs[k] - st[k]);
    st[k] += add;
    falta -= add;
  }
  const pesoTot = st.map((s, i) => (secs[i] > 0 ? (s / secs[i]) * els[i] : 0));
  const pes = pesoTot.map((p, i) => p * (1 + 0.12 * jit(`zp:${i}`)));
  const et = repartir(m.eleitoradoTotalizado, pesoTot);
  const comp = repartir(m.comparecimento, pesoTot);
  const br = repartir(m.brancos, pesoTot);
  const nu = repartir(m.nulos, pesoTot);
  const v0 = repartir(m.votos[0], pes);
  return secs.map((s, i) => {
    // ajusta para manter v0+v1+b+n = comp em cada zona
    const val = comp[i] - br[i] - nu[i];
    const a = Math.min(val, Math.max(0, v0[i]));
    const tally: Tally = {
      secoes: s,
      secoesTotalizadas: st[i],
      eleitorado: els[i],
      eleitoradoTotalizado: et[i],
      comparecimento: comp[i],
      abstencao: et[i] - comp[i],
      votos: [a, val - a],
      brancos: br[i],
      nulos: nu[i],
    };
    return { ...resumir(tally, simNow), zona: i + 1 };
  });
}

/** 1º turno real (Presidente, Brasil + exterior), conforme totais oficiais do TSE. */
export const RESUMO_T1: Summary = {
  secoes: 499248,
  secoesTotalizadas: 499248,
  eleitorado: 158745502,
  eleitoradoTotalizado: 158745502,
  comparecimento: 125275835,
  abstencao: 158745502 - 125275835,
  votos: [53879538, 56104503, 119300788 - 53879538 - 56104503],
  brancos: 2300798,
  nulos: 3674249,
  status: 'encerrada',
  lider: 1,
  eleito: null,
  ultimaAtualizacao: Date.UTC(2026, 9, 4, 23, 41, 0),
};
