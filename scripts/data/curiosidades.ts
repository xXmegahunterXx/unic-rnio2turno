/**
 * Curiosidades do 1º turno → public/data/curiosidades.json (CuriosidadesDataset, src/shared/curiosidades.ts).
 *
 *   npx tsx scripts/data/curiosidades.ts            # grava public/data/curiosidades.json
 *   npx tsx scripts/data/curiosidades.ts --stdout   # só imprime (não grava)
 *   DATA_DIR=dist/data npx tsx scripts/data/curiosidades.ts
 *
 * Lê SÓ o dataset compilado (public/data/**), que já confere com o TSE (scripts/data/validate*.ts):
 *  - uf/{uf}.json      municípios, eleitorado e votos do 1º turno para Presidente por número
 *  - secao/{uf}.json   1º turno real por seção (colunas Uint16 em base64, ordem canônica município → zona → seção)
 *  - locais/{uf}.json  locais de votação (seções por local)
 *  - perfil/{uf}.json  perfil do eleitorado (idade, gênero, escolaridade)
 *  - cargos/*.json e candidatos/*.json   Câmara, Senado e Governador no 1º turno
 *  - meta.json         finalistas do 2º turno (slot a = menor número na urna) e totais oficiais
 *
 * Regras editoriais: linguagem de almanaque, descritiva, sem adjetivos; fatos dos finalistas SEMPRE em par (a e b
 * com o mesmo critério). Percentuais eleitorais vêm de src/shared/calc.ts; números formatados com src/shared/format.ts.
 * Pisos (documentados em cada fato e no JSON):
 *  - recordes de taxa por município (comparecimento, brancos, nulos, % de cada finalista, menor diferença):
 *    municípios com pelo menos PISO_MUNICIPIO eleitores aptos, para não premiar oscilações de cidades muito pequenas;
 *  - seções com 100% dos válidos: pelo menos PISO_SECAO_VALIDOS votos válidos (evita seções minúsculas e o sigilo
 *    de quem votou em seções com pouquíssimos eleitores).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  CargoDataset,
  CandidatoFicha,
  DatasetMeta,
  LocaisUfDataset,
  PerfilAgregado,
  PerfilUfDataset,
  SecaoUfDataset,
  UfDataset,
} from '../../src/shared/dataset';
import type { Curiosidade, CuriosidadesDataset, FinalistaCuriosidade, LugarCuriosidade } from '../../src/shared/curiosidades';
import { rotaCuriosidade as rota } from '../../src/shared/curiosidades';
import type { UF, UFBr } from '../../src/shared/types';
import { UFS } from '../../src/shared/types';
import { UF_NOMES } from '../../src/shared/constants';
import { decodeFaixas, pctAbstencao, pctBrancos, pctComparecimento, pctNulos, pctValidos } from '../../src/shared/calc';
import { fmtCompact, fmtInt, fmtPct } from '../../src/shared/format';
import { decodeU16 } from '../../src/shared/u16';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DATA = path.resolve(ROOT, process.env.DATA_DIR ?? 'public/data');
const SAIDA = path.join(DATA, 'curiosidades.json');

export const PISO_MUNICIPIO = 5000;
export const PISO_SECAO_VALIDOS = 20;

const FONTE_RESULTADO = 'TSE · resultado oficial do 1º turno (04/10/2026) para Presidente, por município';
const FONTE_SECAO = 'TSE · votação por seção eleitoral do 1º turno (dados abertos)';
const FONTE_LOCAIS = 'TSE · eleitorado por local de votação 2026 (dados abertos)';
const FONTE_PERFIL = 'TSE · perfil do eleitorado 2026 (dados abertos)';
const FONTE_CARGOS = 'TSE · resultado oficial do 1º turno (04/10/2026)';

const TODAS: UF[] = [...UFS, 'ZZ'];

function lerJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(DATA, rel), 'utf8')) as T;
}

// ---------------------------------------------------------------------------------------------
// Modelos internos
// ---------------------------------------------------------------------------------------------

interface Mun {
  uf: UF;
  cod: string;
  nome: string;
  capital: boolean;
  pais?: string;
  eleitorado: number;
  comparecimento: number;
  brancos: number;
  nulos: number;
  a: number;
  b: number;
  validos: number;
}

interface Secoes {
  uf: UF;
  n: number;
  cod: string[];
  zona: number[];
  secao: number[];
  aptos: Uint16Array;
  comp: Uint16Array;
  a: Uint16Array;
  b: Uint16Array;
  outros: Uint16Array;
}

/** Totais no formato de Tally (para usar as funções de src/shared/calc.ts). */
const tally = (x: { eleitorado: number; comparecimento: number; brancos: number; nulos: number; a: number; b: number; validos: number }) => ({
  votos: [x.a, x.b, x.validos - x.a - x.b],
  comparecimento: x.comparecimento,
  eleitoradoTotalizado: x.eleitorado,
  abstencao: x.eleitorado - x.comparecimento,
  brancos: x.brancos,
  nulos: x.nulos,
});
const pctA = (x: Parameters<typeof tally>[0]) => pctValidos(tally(x), 0);
const pctB = (x: Parameters<typeof tally>[0]) => pctValidos(tally(x), 1);
const pctComp = (x: Parameters<typeof tally>[0]) => pctComparecimento(tally(x));

/** Proporção simples (perfil do eleitorado, que não é votação): 0–100. */
const proporcao = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);
/** Arredonda como exibido (2 casas), para o JSON ficar legível e idêntico ao que a UI mostra. */
const r2 = (x: number) => Math.round(x * 100) / 100;

const siglaOuPais = (m: Pick<Mun, 'uf' | 'pais'>) => (m.uf === 'ZZ' ? m.pais ?? 'exterior' : m.uf);
const nomeMun = (m: Pick<Mun, 'uf' | 'pais' | 'nome'>) => `${m.nome} (${siglaOuPais(m)})`;
const lugarMun = (m: Mun): LugarCuriosidade => ({ nome: nomeMun(m), uf: m.uf, cod: m.cod, rota: rota.municipio(m.uf, m.cod) });
const lugarUf = (uf: UF): LugarCuriosidade => ({ nome: UF_NOMES[uf], uf, rota: rota.uf(uf) });

/** "do Piauí", "de Roraima", "da Bahia" … (preposição + artigo do nome da UF). */
const PREP_UF: Record<UF, string> = {
  AC: 'no', AL: 'em', AM: 'no', AP: 'no', BA: 'na', CE: 'no', DF: 'no', ES: 'no', GO: 'em', MA: 'no', MG: 'em',
  MS: 'em', MT: 'em', PA: 'no', PB: 'na', PE: 'em', PI: 'no', PR: 'no', RJ: 'no', RN: 'no', RO: 'em', RR: 'em',
  RS: 'no', SC: 'em', SE: 'em', SP: 'em', TO: 'no', ZZ: 'no',
};
const emUf = (uf: UF) => `${PREP_UF[uf]} ${UF_NOMES[uf]}`;
/** "o Amazonas", "a Bahia", "Minas Gerais" (artigo do nome da UF). */
const artigoUf = (uf: UF) => `${({ no: 'o ', na: 'a ', em: '' } as Record<string, string>)[PREP_UF[uf]] ?? ''}${UF_NOMES[uf]}`;

/** Ordena desc por `f`, desempatando por eleitorado (maior primeiro) e código (estável). */
function maiores<T extends { eleitorado?: number; cod?: string }>(arr: T[], f: (x: T) => number): T[] {
  return [...arr].sort((x, y) => f(y) - f(x) || (y.eleitorado ?? 0) - (x.eleitorado ?? 0) || String(x.cod).localeCompare(String(y.cod)));
}
const maior = <T extends { eleitorado?: number; cod?: string }>(arr: T[], f: (x: T) => number) => maiores(arr, f)[0];
const menor = <T extends { eleitorado?: number; cod?: string }>(arr: T[], f: (x: T) => number) => maiores(arr, (x) => -f(x))[0];

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * Percentual de uma contagem conhecida só por um intervalo [lo, hi] (perfil do eleitorado: quem não tem gênero
 * informado ou tem idade inválida no cadastro fica em `naoInformado`, fora das faixas de gênero × idade).
 * Usa 2 casas quando os dois extremos dão o mesmo número exibido; senão 1 casa; senão 0; senão falha (nunca
 * exibe um número que pode estar errado).
 */
function pctSeguro(lo: number, hi: number, todo: number, id: string): { valor: number; casas: 0 | 1 | 2; txt: string } {
  for (const casas of [2, 1, 0] as const) {
    const a = fmtPct(proporcao(lo, todo), casas);
    if (a === fmtPct(proporcao(hi, todo), casas)) {
      const f = 10 ** casas;
      const valor = Math.round(proporcao(lo, todo) * f) / f;
      exigir(fmtPct(valor, casas) === a, `${id}: arredondamento divergente (${a})`);
      return { valor, casas, txt: a };
    }
  }
  throw new Error(`curiosidades: ${id}: percentual ambíguo entre ${proporcao(lo, todo)} e ${proporcao(hi, todo)}`);
}

/** "mais de 17,2 milhões" — piso em décimos de milhão (verdadeiro para qualquer valor ≥ lo). */
function maisDeMilhoes(lo: number, id: string): string {
  const piso = Math.floor(lo / 1e5) * 1e5;
  exigir(lo > piso && piso >= 1e6, `${id}: valor fora da faixa para "mais de … milhões" (${lo})`);
  return `mais de ${fmtCompact(piso).replace(/\s?mi$/, piso < 2e6 ? ' milhão' : ' milhões')}`;
}

/** "cerca de 9 milhões" — só quando os dois extremos do intervalo arredondam para o mesmo milhão. */
function cercaDeMilhoes(lo: number, hi: number, id: string): string {
  const a = Math.round(lo / 1e6);
  exigir(a === Math.round(hi / 1e6) && a >= 2, `${id}: "cerca de … milhões" ambíguo (${lo} a ${hi})`);
  return `cerca de ${fmtInt(a)} milhões`;
}

function exigir(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`curiosidades: ${msg}`);
}

// ---------------------------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------------------------

export interface Entrada {
  meta: DatasetMeta;
  muns: Mun[];
  secoes: Secoes[];
  locais: Record<string, LocaisUfDataset>;
  perfil: Record<string, PerfilUfDataset>;
  camara: CargoDataset;
  senado: CargoDataset;
  governador: CargoDataset;
  fichas: Map<string, CandidatoFicha>;
  finalistas: { a: FinalistaCuriosidade; b: FinalistaCuriosidade };
}

function carregar(): Entrada {
  const meta = lerJson<DatasetMeta>('meta.json');
  const pres = meta.races.find((r) => r.id === 'pres');
  exigir(pres && pres.candidatos.length === 2, 'meta.json sem os 2 finalistas de Presidente');
  const ord = [...pres.candidatos].sort((x, y) => x.numero - y.numero);
  const fin = (i: 0 | 1): FinalistaCuriosidade => ({
    slot: i === 0 ? 'a' : 'b',
    numero: ord[i].numero,
    nomeUrna: ord[i].nomeUrna,
    partido: ord[i].partido,
  });
  const finalistas = { a: fin(0), b: fin(1) };
  const na = String(finalistas.a.numero);
  const nb = String(finalistas.b.numero);

  const muns: Mun[] = [];
  const secoes: Secoes[] = [];
  const locais: Record<string, LocaisUfDataset> = {};
  const perfil: Record<string, PerfilUfDataset> = {};
  for (const uf of TODAS) {
    const ufl = uf.toLowerCase();
    const d = lerJson<UfDataset>(`uf/${ufl}.json`);
    const cod: string[] = [];
    const zona: number[] = [];
    const secao: number[] = [];
    for (const m of d.municipios) {
      const validos = Object.values(m.t1.votos).reduce((p, q) => p + q, 0);
      muns.push({
        uf,
        cod: m.cod,
        nome: m.nome,
        capital: m.capital,
        pais: m.pais,
        eleitorado: m.eleitorado,
        comparecimento: m.t1.comparecimento,
        brancos: m.t1.brancos,
        nulos: m.t1.nulos,
        a: m.t1.votos[na] ?? 0,
        b: m.t1.votos[nb] ?? 0,
        validos,
      });
      for (const z of m.zonas)
        for (const s of decodeFaixas(z.s)) {
          cod.push(m.cod);
          zona.push(z.z);
          secao.push(s);
        }
    }
    const sd = lerJson<SecaoUfDataset>(`secao/${ufl}.json`);
    exigir(sd.n === cod.length, `secao/${ufl}.json com n=${sd.n}, ordem canônica ${cod.length}`);
    secoes.push({
      uf,
      n: sd.n,
      cod,
      zona,
      secao,
      aptos: decodeU16(sd.aptos),
      comp: decodeU16(sd.pres.comp),
      a: decodeU16(sd.pres.a),
      b: decodeU16(sd.pres.b),
      outros: decodeU16(sd.pres.outros),
    });
    locais[uf] = lerJson<LocaisUfDataset>(`locais/${ufl}.json`);
    perfil[uf] = lerJson<PerfilUfDataset>(`perfil/${ufl}.json`);
  }

  const fichas = new Map<string, CandidatoFicha>();
  const grupos = ['senado', 'governadores', ...UFS.map((u) => `camara-${u.toLowerCase()}`)];
  for (const g of grupos) {
    const arq = lerJson<CandidatoFicha[] | { candidatos: CandidatoFicha[] }>(`candidatos/${g}.json`);
    for (const f of Array.isArray(arq) ? arq : arq.candidatos) fichas.set(f.sqcand, f);
  }

  return {
    meta,
    muns,
    secoes,
    locais,
    perfil,
    camara: lerJson<CargoDataset>('cargos/camara.json'),
    senado: lerJson<CargoDataset>('cargos/senado.json'),
    governador: lerJson<CargoDataset>('cargos/governador-t1.json'),
    fichas,
    finalistas,
  };
}

// ---------------------------------------------------------------------------------------------
// Fatos
// ---------------------------------------------------------------------------------------------

export function calcular(e: Entrada): Curiosidade[] {
  const { finalistas: F } = e;
  const nomeA = F.a.nomeUrna;
  const nomeB = F.b.nomeUrna;
  const br = e.muns.filter((m) => m.uf !== 'ZZ');
  const ex = e.muns.filter((m) => m.uf === 'ZZ');
  const comPiso = br.filter((m) => m.eleitorado >= PISO_MUNICIPIO);
  const capitais = br.filter((m) => m.capital);
  const pisoTxt = `${fmtInt(PISO_MUNICIPIO)} eleitores`;
  const criterioPiso = `Entre os municípios com pelo menos ${fmtInt(PISO_MUNICIPIO)} eleitores aptos (${fmtInt(comPiso.length)} de ${fmtInt(br.length)}), para não destacar oscilações de cidades muito pequenas.`;

  const soma = (arr: Mun[]) =>
    arr.reduce(
      (p, m) => ({
        eleitorado: p.eleitorado + m.eleitorado,
        comparecimento: p.comparecimento + m.comparecimento,
        brancos: p.brancos + m.brancos,
        nulos: p.nulos + m.nulos,
        a: p.a + m.a,
        b: p.b + m.b,
        validos: p.validos + m.validos,
      }),
      { eleitorado: 0, comparecimento: 0, brancos: 0, nulos: 0, a: 0, b: 0, validos: 0 },
    );
  const nac = soma(e.muns);
  const nacBr = soma(br);
  const nacEx = soma(ex);
  const totalSecoes = e.secoes.reduce((p, s) => p + s.n, 0);
  const t = e.meta.totaisPrimeiroTurno;
  exigir(nac.eleitorado === t.eleitorado && nac.comparecimento === t.comparecimento && totalSecoes === t.secoes, 'totais não batem com meta.totaisPrimeiroTurno');

  const fatos: Curiosidade[] = [];
  const add = (f: Curiosidade) => fatos.push(f);

  // ── Brasil em números ──────────────────────────────────────────────────────────────────────
  add({
    id: 'brasil-eleitorado',
    tema: 'brasil',
    titulo: 'O tamanho da eleição',
    destaque: { valor: nac.eleitorado, formato: 'int', unidade: 'eleitores aptos' },
    contexto: `Eles estavam distribuídos em ${fmtInt(totalSecoes)} seções eleitorais: ${fmtInt(br.length)} municípios no Brasil e ${fmtInt(ex.length)} cidades no exterior.`,
    texto: `${fmtInt(nac.eleitorado)} eleitores estavam aptos a votar no 1º turno de 2026, em ${fmtInt(totalSecoes)} seções de ${fmtInt(br.length)} municípios e ${fmtInt(ex.length)} cidades no exterior.`,
    lugares: [{ nome: 'Brasil', rota: rota.brasil() }],
    rota: rota.brasil(),
    rotuloRota: 'Ver no mapa',
    fonte: FONTE_RESULTADO,
    dados: { eleitorado: nac.eleitorado, secoes: totalSecoes, municipios: br.length, cidadesExterior: ex.length },
  });

  const abst = nac.eleitorado - nac.comparecimento;
  add({
    id: 'brasil-abstencao',
    tema: 'brasil',
    titulo: 'Quem não foi votar',
    destaque: { valor: abst, formato: 'int', unidade: 'eleitores não compareceram' },
    contexto: `São ${fmtPct(pctAbstencao(tally(nac)))} do eleitorado. Compareceram ${fmtInt(nac.comparecimento)} pessoas (${fmtPct(pctComp(nac))}). O voto é facultativo para quem tem 16 ou 17 anos ou mais de 70.`,
    texto: `No 1º turno de 2026, ${fmtInt(abst)} eleitores (${fmtPct(pctAbstencao(tally(nac)))}) não foram votar. Compareceram ${fmtInt(nac.comparecimento)} (${fmtPct(pctComp(nac))}).`,
    lugares: [{ nome: 'Brasil', rota: rota.brasil() }],
    rota: rota.brasil(),
    rotuloRota: 'Ver no mapa',
    fonte: FONTE_RESULTADO,
    dados: { eleitorado: nac.eleitorado, comparecimento: nac.comparecimento, abstencao: abst, pctAbstencao: r2(pctAbstencao(tally(nac))) },
  });

  {
    const maiorMun = maior(br, (m) => m.eleitorado);
    const ufs = e.meta.ufs.filter((u) => u.uf !== 'ZZ');
    const menores = ufs.filter((u) => u.eleitorado < maiorMun.eleitorado);
    const maioresUfs = ufs.filter((u) => u.eleitorado >= maiorMun.eleitorado).sort((x, y) => y.eleitorado - x.eleitorado);
    const asc = [...ufs].sort((x, y) => x.eleitorado - y.eleitorado);
    const somados: string[] = [];
    let acc = 0;
    for (const u of asc) {
      if (acc + u.eleitorado >= maiorMun.eleitorado) break;
      acc += u.eleitorado;
      somados.push(u.uf);
    }
    const temDf = menores.some((u) => u.uf === 'DF');
    const nEstados = menores.length - (temDf ? 1 : 0);
    const lista = (ufsL: string[]) => {
      const nomes = ufsL.map((u) => UF_NOMES[u as UF]);
      return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];
    };
    add({
      id: 'brasil-cidade-maior-que-estados',
      tema: 'brasil',
      titulo: temDf ? `Mais eleitores que ${nEstados} estados e o DF` : `Mais eleitores que ${nEstados} estados`,
      destaque: { valor: maiorMun.eleitorado, formato: 'int', unidade: `eleitores na cidade de ${maiorMun.nome}` },
      contexto: `Só ${maioresUfs.map((u) => u.uf).join(', ').replace(/, ([^,]*)$/, ' e $1')} têm mais. A capital tem mais eleitores que ${lista(somados)} somados (${fmtInt(acc)}).`,
      texto: `A cidade de ${maiorMun.nome} tem ${fmtInt(maiorMun.eleitorado)} eleitores: mais que ${menores.length} das 27 unidades da federação. Só ${maioresUfs.map((u) => u.uf).join(', ').replace(/, ([^,]*)$/, ' e $1')} têm mais.`,
      lugares: [lugarMun(maiorMun)],
      rota: rota.municipio(maiorMun.uf, maiorMun.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: 'Eleitores aptos no 1º turno de 2026: o município contra cada unidade da federação (27, com o DF).',
      dados: {
        municipio: maiorMun.nome,
        eleitoradoMunicipio: maiorMun.eleitorado,
        ufsMenores: menores.map((u) => u.uf),
        ufsMaiores: maioresUfs.map((u) => u.uf),
        ufsSomadas: somados,
        eleitoradoSomado: acc,
      },
    });

    const menorMun = menor(br, (m) => m.eleitorado);
    const vezes = Math.round(maiorMun.eleitorado / menorMun.eleitorado);
    add({
      id: 'brasil-menor-municipio',
      tema: 'brasil',
      titulo: 'O menor colégio eleitoral',
      destaque: { valor: menorMun.eleitorado, formato: 'int', unidade: 'eleitores aptos' },
      contexto: `${nomeMun(menorMun)} é o município com menos eleitores do país; ${fmtPct(pctComp(menorMun))} deles votaram no 1º turno. O eleitorado de ${maiorMun.nome}, o maior, é ${fmtInt(vezes)} vezes o de ${menorMun.nome}.`,
      texto: `${nomeMun(menorMun)} é o menor colégio eleitoral do Brasil: ${fmtInt(menorMun.eleitorado)} eleitores aptos. O eleitorado de ${maiorMun.nome}, o maior, é ${fmtInt(vezes)} vezes o de ${menorMun.nome}.`,
      lugares: [lugarMun(menorMun)],
      rota: rota.municipio(menorMun.uf, menorMun.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      dados: {
        municipio: menorMun.nome,
        uf: menorMun.uf,
        eleitorado: menorMun.eleitorado,
        comparecimento: menorMun.comparecimento,
        maiorMunicipio: maiorMun.nome,
        eleitoradoMaior: maiorMun.eleitorado,
        vezes,
      },
    });
  }

  // ── Os dois finalistas ─────────────────────────────────────────────────────────────────────
  {
    const empates = maiores(
      br.filter((m) => m.a === m.b && m.a > 0),
      (m) => m.a,
    );
    const empEx = maiores(
      ex.filter((m) => m.a === m.b && m.a > 0),
      (m) => m.a,
    );
    if (empates.length) {
      const desc = empates.map((m) => `${nomeMun(m)}, ${fmtInt(m.a)} a ${fmtInt(m.b)}`);
      const lista = desc.length > 1 ? `${desc.slice(0, -1).join('; ')}, e ${desc[desc.length - 1]}` : desc[0];
      const ext = empEx.length
        ? ` No exterior, ${empEx.map((m) => `${nomeMun(m)} também empatou: ${fmtInt(m.a)} a ${fmtInt(m.b)}`).join('; ')}.`
        : '';
      add({
        id: 'finalistas-empate-municipio',
        tema: 'finalistas',
        titulo: 'Empate voto a voto',
        destaque: { valor: empates.length, formato: 'int', unidade: plural(empates.length, 'município com empate exato', 'municípios com empate exato') },
        contexto: `Os dois finalistas tiveram exatamente o mesmo número de votos em ${lista}.${ext}`,
        texto: `No 1º turno, os dois finalistas à Presidência empataram voto a voto em ${empates.length} ${plural(empates.length, 'município', 'municípios')}: ${lista}.`,
        lugares: [...empates.map(lugarMun), ...empEx.map(lugarMun)],
        rota: rota.municipio(empates[0].uf, empates[0].cod),
        rotuloRota: 'Ver no mapa',
        fonte: FONTE_RESULTADO,
        criterio: `Votos de ${nomeA} (${F.a.numero}) = votos de ${nomeB} (${F.b.numero}), com pelo menos 1 voto.`,
        dados: {
          municipios: empates.map((m) => `${m.uf}:${m.cod}:${m.nome}:${m.a}`),
          exterior: empEx.map((m) => `${m.cod}:${m.nome}:${m.a}`),
        },
      });
    }

    const cands = comPiso.filter((m) => m.a !== m.b && m.validos > 0);
    const dif = (m: Mun) => Math.abs(pctA(m) - pctB(m));
    const md = [...cands].sort((x, y) => dif(x) - dif(y) || Math.abs(x.a - x.b) - Math.abs(y.a - y.b) || y.eleitorado - x.eleitorado)[0];
    const dv = Math.abs(md.a - md.b);
    const votosTxt = `${fmtInt(dv)} ${plural(dv, 'voto', 'votos')}`;
    // Outros municípios (acima do piso) com a MESMA diferença em votos: citados juntos, para não destacar só o
    // caso em que um dos finalistas fica à frente (em 2026: um com cada finalista à frente por 1 voto).
    const mesmos = maiores(
      cands.filter((m) => m !== md && Math.abs(m.a - m.b) === dv),
      (m) => m.eleitorado,
    );
    const placar = (m: Mun) => `${fmtInt(m.a)} a ${fmtInt(m.b)}`;
    const listaMesmos = mesmos.map((m) => `${nomeMun(m)}, ${placar(m)}`);
    const textoMesmos =
      mesmos.length === 1
        ? `Em ${nomeMun(md)} e em ${nomeMun(mesmos[0])}, os dois finalistas à Presidência ficaram separados por ${votosTxt} no 1º turno: ${placar(md)} e ${placar(mesmos[0])}.`
        : `Em ${fmtInt(mesmos.length + 1)} municípios, os dois finalistas à Presidência ficaram separados por ${votosTxt} no 1º turno. Em ${nomeMun(md)}: ${placar(md)}.`;
    add({
      id: 'finalistas-menor-diferenca',
      tema: 'finalistas',
      titulo: `Separados por ${votosTxt}`,
      destaque: { valor: dv, formato: 'int', unidade: plural(dv, 'voto de diferença', 'votos de diferença') },
      par: {
        a: { valor: { valor: md.a, formato: 'int', unidade: 'votos' }, rotulo: `${fmtPct(pctA(md))} dos válidos`, lugar: lugarMun(md) },
        b: { valor: { valor: md.b, formato: 'int', unidade: 'votos' }, rotulo: `${fmtPct(pctB(md))} dos válidos`, lugar: lugarMun(md) },
      },
      // curto: o cartão de imagem corta o contexto longo (o placar de md já está no par)
      contexto: mesmos.length
        ? `${nomeMun(md)}, com ${fmtInt(md.eleitorado)} eleitores, tem a menor diferença proporcional entre os municípios com ${pisoTxt} ou mais. ${
            mesmos.length === 1 ? `Em ${nomeMun(mesmos[0])}, também ${votosTxt}: ${placar(mesmos[0])}.` : `Também por ${votosTxt}: ${listaMesmos.join('; ')}.`
          }`
        : `Em ${nomeMun(md)}, com ${fmtInt(md.eleitorado)} eleitores, os dois finalistas ficaram a ${votosTxt} de distância: ${placar(md)}. É a menor diferença entre os municípios com pelo menos ${pisoTxt}.`,
      texto: mesmos.length ? textoMesmos : `Em ${nomeMun(md)}, os dois finalistas à Presidência ficaram separados por ${votosTxt} no 1º turno: ${placar(md)}.`,
      lugares: [lugarMun(md), ...mesmos.map(lugarMun)],
      rota: rota.municipio(md.uf, md.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: `Menor diferença em pontos percentuais dos votos válidos entre os dois finalistas, sem contar empates exatos; os municípios com a mesma diferença em votos são citados juntos. ${criterioPiso}`,
      dados: {
        uf: md.uf, cod: md.cod, municipio: md.nome, eleitorado: md.eleitorado, votosA: md.a, votosB: md.b, validos: md.validos, piso: PISO_MUNICIPIO,
        mesmaDiferenca: mesmos.map((m) => `${m.uf}:${m.cod}:${m.nome}:${m.a}:${m.b}`),
      },
    });
  }

  {
    // seções com empate exato (Brasil + exterior)
    let n = 0;
    let best: { s: Secoes; i: number } | null = null;
    for (const s of e.secoes)
      for (let i = 0; i < s.n; i++) {
        if (s.a[i] !== s.b[i] || s.a[i] === 0) continue;
        n++;
        if (!best || s.a[i] > best.s.a[best.i] || (s.a[i] === best.s.a[best.i] && s.comp[i] > best.s.comp[best.i])) best = { s, i };
      }
    exigir(best, 'nenhuma seção com empate');
    const { s, i } = best;
    const m = e.muns.find((x) => x.uf === s.uf && x.cod === s.cod[i])!;
    const lugar: LugarCuriosidade = {
      nome: `${nomeMun(m)} · zona ${s.zona[i]}, seção ${s.secao[i]}`,
      uf: s.uf,
      cod: s.cod[i],
      zona: s.zona[i],
      secao: s.secao[i],
      rota: rota.secao(s.uf, s.cod[i], s.zona[i], s.secao[i]),
    };
    add({
      id: 'finalistas-empate-secoes',
      tema: 'finalistas',
      titulo: 'Empates na urna',
      destaque: { valor: n, formato: 'int', unidade: 'seções com empate exato' },
      contexto: `Nessas seções, os dois finalistas tiveram exatamente o mesmo número de votos. O maior empate foi em ${nomeMun(m)}, na seção ${s.secao[i]} da zona ${s.zona[i]}: ${fmtInt(s.a[i])} a ${fmtInt(s.b[i])}.`,
      texto: `Em ${fmtInt(n)} seções eleitorais, os dois finalistas à Presidência empataram no 1º turno. O maior empate: ${fmtInt(s.a[i])} a ${fmtInt(s.b[i])}, em ${nomeMun(m)}.`,
      lugares: [lugar],
      rota: lugar.rota!,
      rotuloRota: 'Ver o boletim',
      fonte: FONTE_SECAO,
      criterio: 'Votos iguais e maiores que zero para os dois finalistas na seção (Brasil e exterior).',
      dados: { secoes: n, uf: s.uf, cod: s.cod[i], zona: s.zona[i], secao: s.secao[i], votosCada: s.a[i], comparecimento: s.comp[i] },
    });
  }

  {
    const la = br.filter((m) => m.a > m.b).length;
    const lb = br.filter((m) => m.b > m.a).length;
    const le = br.length - la - lb;
    const porUf = new Map<UF, Mun[]>();
    for (const m of br) porUf.set(m.uf, [...(porUf.get(m.uf) ?? []), m]);
    const ufs = [...porUf.entries()].map(([uf, ms]) => ({ uf, cod: uf, ...soma(ms) }));
    const ua = ufs.filter((u) => u.a > u.b).length;
    const ub = ufs.filter((u) => u.b > u.a).length;
    add({
      id: 'finalistas-municipios',
      tema: 'finalistas',
      titulo: 'Municípios em que cada um ficou à frente',
      par: {
        a: { valor: { valor: la, formato: 'int', unidade: 'municípios' }, rotulo: `e em ${ua} ${plural(ua, 'UF', 'UFs')}` },
        b: { valor: { valor: lb, formato: 'int', unidade: 'municípios' }, rotulo: `e em ${ub} ${plural(ub, 'UF', 'UFs')}` },
      },
      contexto: `No 1º turno, ${nomeA} (${F.a.numero}) teve mais votos que ${nomeB} (${F.b.numero}) em ${fmtInt(la)} municípios, e ${nomeB} teve mais que ${nomeA} em ${fmtInt(lb)}${le ? `; houve empate em ${fmtInt(le)}` : ''}. Entre as 27 unidades da federação: ${ua} e ${ub}.`,
      texto: `No 1º turno, ${nomeA} teve mais votos que ${nomeB} em ${fmtInt(la)} municípios; ${nomeB}, mais que ${nomeA} em ${fmtInt(lb)}${le ? `. Empate em ${fmtInt(le)}` : ''}.`,
      lugares: [{ nome: 'Brasil', rota: rota.brasil() }],
      rota: rota.brasil(),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: 'Comparação direta entre os votos dos dois finalistas em cada município (os demais candidatos não entram).',
      dados: { municipiosA: la, municipiosB: lb, municipiosEmpate: le, ufsA: ua, ufsB: ub, municipios: br.length },
    });

    const ua1 = maior(ufs, (u) => pctA(u));
    const ub1 = maior(ufs, (u) => pctB(u));
    const ua0 = menor(ufs, (u) => pctA(u));
    const ub0 = menor(ufs, (u) => pctB(u));
    add({
      id: 'finalistas-maior-uf',
      tema: 'finalistas',
      titulo: 'O estado de maior votação de cada um',
      par: {
        a: { valor: { valor: r2(pctA(ua1)), formato: 'pct', unidade: 'dos válidos' }, rotulo: UF_NOMES[ua1.uf], lugar: lugarUf(ua1.uf) },
        b: { valor: { valor: r2(pctB(ub1)), formato: 'pct', unidade: 'dos válidos' }, rotulo: UF_NOMES[ub1.uf], lugar: lugarUf(ub1.uf) },
      },
      contexto: `${nomeA} teve ${fmtPct(pctA(ua1))} dos votos válidos ${emUf(ua1.uf)}; ${nomeB}, ${fmtPct(pctB(ub1))} ${emUf(ub1.uf)}. Os menores percentuais de cada um: ${fmtPct(pctA(ua0))} ${emUf(ua0.uf)} e ${fmtPct(pctB(ub0))} ${emUf(ub0.uf)}.`,
      texto: `Maior votação de cada finalista num estado, no 1º turno: ${nomeA}, ${fmtPct(pctA(ua1))} dos válidos ${emUf(ua1.uf)}; ${nomeB}, ${fmtPct(pctB(ub1))} ${emUf(ub1.uf)}.`,
      lugares: [lugarUf(ua1.uf), lugarUf(ub1.uf)],
      rota: rota.brasil(),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: 'Percentual dos votos válidos (sem brancos e nulos) de cada finalista, por unidade da federação.',
      dados: {
        ufA: ua1.uf, pctA: r2(pctA(ua1)), votosA: ua1.a, validosUfA: ua1.validos,
        ufB: ub1.uf, pctB: r2(pctB(ub1)), votosB: ub1.b, validosUfB: ub1.validos,
        ufMenorA: ua0.uf, pctMenorA: r2(pctA(ua0)), ufMenorB: ub0.uf, pctMenorB: r2(pctB(ub0)),
      },
    });
  }

  {
    const ma = maior(comPiso, pctA);
    const mb = maior(comPiso, pctB);
    const ma0 = maior(br, pctA);
    const mb0 = maior(br, pctB);
    const semPiso = ma0.cod !== ma.cod || mb0.cod !== mb.cod;
    add({
      id: 'finalistas-maior-municipio',
      tema: 'finalistas',
      titulo: 'A maior votação de cada um num município',
      par: {
        a: { valor: { valor: r2(pctA(ma)), formato: 'pct', unidade: 'dos válidos' }, rotulo: nomeMun(ma), lugar: lugarMun(ma) },
        b: { valor: { valor: r2(pctB(mb)), formato: 'pct', unidade: 'dos válidos' }, rotulo: nomeMun(mb), lugar: lugarMun(mb) },
      },
      contexto: `${nomeA} teve ${fmtPct(pctA(ma))} dos votos válidos em ${nomeMun(ma)}; ${nomeB}, ${fmtPct(pctB(mb))} em ${nomeMun(mb)}. Valem os municípios com pelo menos ${pisoTxt}${
        semPiso ? `; sem esse piso, ${nomeMun(ma0)}, ${fmtPct(pctA(ma0))}, e ${nomeMun(mb0)}, ${fmtPct(pctB(mb0))}` : ''
      }.`,
      texto: `Maior votação de cada finalista num município, no 1º turno: ${nomeA}, ${fmtPct(pctA(ma))} em ${nomeMun(ma)}; ${nomeB}, ${fmtPct(pctB(mb))} em ${nomeMun(mb)}.`,
      lugares: [lugarMun(ma), lugarMun(mb)],
      rota: rota.municipio(ma.uf, ma.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: `Percentual dos votos válidos de cada finalista. ${criterioPiso}`,
      dados: {
        codA: `${ma.uf}:${ma.cod}`, pctA: r2(pctA(ma)), votosA: ma.a, validosA: ma.validos,
        codB: `${mb.uf}:${mb.cod}`, pctB: r2(pctB(mb)), votosB: mb.b, validosB: mb.validos,
        semPisoA: `${ma0.uf}:${ma0.cod}`, semPisoPctA: r2(pctA(ma0)), semPisoB: `${mb0.uf}:${mb0.cod}`, semPisoPctB: r2(pctB(mb0)),
        piso: PISO_MUNICIPIO,
      },
    });

    const ca = maior(capitais, pctA);
    const cb = maior(capitais, pctB);
    const nca = capitais.filter((m) => m.a > m.b).length;
    const ncb = capitais.filter((m) => m.b > m.a).length;
    add({
      id: 'finalistas-maior-capital',
      tema: 'finalistas',
      titulo: 'A capital de maior votação de cada um',
      par: {
        a: { valor: { valor: r2(pctA(ca)), formato: 'pct', unidade: 'dos válidos' }, rotulo: nomeMun(ca), lugar: lugarMun(ca) },
        b: { valor: { valor: r2(pctB(cb)), formato: 'pct', unidade: 'dos válidos' }, rotulo: nomeMun(cb), lugar: lugarMun(cb) },
      },
      contexto: `Entre as ${capitais.length} capitais, ${nomeA} teve mais votos que ${nomeB} em ${nca} e ${nomeB}, mais que ${nomeA} em ${ncb}. Os maiores percentuais: ${fmtPct(pctA(ca))} em ${ca.nome} e ${fmtPct(pctB(cb))} em ${cb.nome}.`,
      texto: `Capital com maior votação de cada finalista no 1º turno: ${nomeA}, ${fmtPct(pctA(ca))} dos válidos em ${nomeMun(ca)}; ${nomeB}, ${fmtPct(pctB(cb))} em ${nomeMun(cb)}.`,
      lugares: [lugarMun(ca), lugarMun(cb)],
      rota: rota.municipio(ca.uf, ca.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: 'Percentual dos votos válidos nas 26 capitais estaduais e em Brasília.',
      dados: {
        capitalA: `${ca.uf}:${ca.cod}`, pctA: r2(pctA(ca)), capitalB: `${cb.uf}:${cb.cod}`, pctB: r2(pctB(cb)),
        capitaisA: nca, capitaisB: ncb, capitais: capitais.length,
      },
    });
  }

  // Sem o fato "seções com 100% dos válidos para um finalista" (revisão de QA da fase 3): numa seção unânime, o voto
  // de cada eleitor que votou num candidato fica conhecido (sigilo do voto), e a contagem por finalista
  // (34 × 2 no 1º turno de 2026) é um gatilho conhecido de desinformação sobre as urnas. Não volte a incluir.

  // ── Comparecimento ─────────────────────────────────────────────────────────────────────────
  {
    const cmax = maior(comPiso, pctComp);
    const cmin = menor(comPiso, pctComp);
    const capMax = maior(capitais, pctComp);
    const capMin = menor(capitais, pctComp);
    add({
      id: 'comparecimento-maior',
      tema: 'comparecimento',
      titulo: 'Onde mais se votou',
      destaque: { valor: r2(pctComp(cmax)), formato: 'pct', unidade: 'de comparecimento' },
      contexto: `Em ${nomeMun(cmax)}, ${fmtInt(cmax.comparecimento)} dos ${fmtInt(cmax.eleitorado)} eleitores votaram. No país, o comparecimento foi de ${fmtPct(pctComp(nac))}. Maior entre as capitais: ${nomeMun(capMax)}, com ${fmtPct(pctComp(capMax))}.`,
      texto: `${nomeMun(cmax)} teve o maior comparecimento do 1º turno entre os municípios com ${pisoTxt} ou mais: ${fmtPct(pctComp(cmax))}. No país: ${fmtPct(pctComp(nac))}.`,
      lugares: [lugarMun(cmax), lugarMun(capMax)],
      rota: rota.municipio(cmax.uf, cmax.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: `Comparecimento ÷ eleitores aptos. ${criterioPiso}`,
      dados: { cod: `${cmax.uf}:${cmax.cod}`, eleitorado: cmax.eleitorado, comparecimento: cmax.comparecimento, capital: `${capMax.uf}:${capMax.cod}`, pctCapital: r2(pctComp(capMax)), piso: PISO_MUNICIPIO },
    });
    add({
      id: 'comparecimento-menor',
      tema: 'comparecimento',
      titulo: 'Onde menos se votou',
      destaque: { valor: r2(pctComp(cmin)), formato: 'pct', unidade: 'de comparecimento' },
      contexto: `Em ${nomeMun(cmin)}, ${fmtInt(cmin.comparecimento)} dos ${fmtInt(cmin.eleitorado)} eleitores votaram. No país, o comparecimento foi de ${fmtPct(pctComp(nac))}. Menor entre as capitais: ${nomeMun(capMin)}, com ${fmtPct(pctComp(capMin))}.`,
      texto: `${nomeMun(cmin)} teve o menor comparecimento do 1º turno entre os municípios com ${pisoTxt} ou mais: ${fmtPct(pctComp(cmin))}. No país: ${fmtPct(pctComp(nac))}.`,
      lugares: [lugarMun(cmin), lugarMun(capMin)],
      rota: rota.municipio(cmin.uf, cmin.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: `Comparecimento ÷ eleitores aptos. ${criterioPiso}`,
      dados: { cod: `${cmin.uf}:${cmin.cod}`, eleitorado: cmin.eleitorado, comparecimento: cmin.comparecimento, capital: `${capMin.uf}:${capMin.cod}`, pctCapital: r2(pctComp(capMin)), piso: PISO_MUNICIPIO },
    });

    const bmax = maior(comPiso, (m) => pctBrancos(tally(m)));
    const nmax = maior(comPiso, (m) => pctNulos(tally(m)));
    add({
      id: 'comparecimento-brancos',
      tema: 'comparecimento',
      titulo: 'Recorde de votos em branco',
      destaque: { valor: r2(pctBrancos(tally(bmax))), formato: 'pct', unidade: 'dos votos em branco' },
      contexto: `Em ${nomeMun(bmax)}, ${fmtInt(bmax.brancos)} dos ${fmtInt(bmax.comparecimento)} votos para presidente foram em branco. No país, foram ${fmtPct(pctBrancos(tally(nac)))}.`,
      texto: `${nomeMun(bmax)} teve a maior proporção de votos em branco para presidente no 1º turno (municípios com ${pisoTxt} ou mais): ${fmtPct(pctBrancos(tally(bmax)))}. No país: ${fmtPct(pctBrancos(tally(nac)))}.`,
      lugares: [lugarMun(bmax)],
      rota: rota.municipio(bmax.uf, bmax.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: `Brancos ÷ comparecimento (regra do TSE). ${criterioPiso}`,
      dados: { cod: `${bmax.uf}:${bmax.cod}`, brancos: bmax.brancos, comparecimento: bmax.comparecimento, pctNacional: r2(pctBrancos(tally(nac))), piso: PISO_MUNICIPIO },
    });
    add({
      id: 'comparecimento-nulos',
      tema: 'comparecimento',
      titulo: 'Recorde de votos nulos',
      destaque: { valor: r2(pctNulos(tally(nmax))), formato: 'pct', unidade: 'dos votos nulos' },
      contexto: `Em ${nomeMun(nmax)}, ${fmtInt(nmax.nulos)} dos ${fmtInt(nmax.comparecimento)} votos para presidente foram nulos. No país, foram ${fmtPct(pctNulos(tally(nac)))}.`,
      texto: `${nomeMun(nmax)} teve a maior proporção de votos nulos para presidente no 1º turno (municípios com ${pisoTxt} ou mais): ${fmtPct(pctNulos(tally(nmax)))}. No país: ${fmtPct(pctNulos(tally(nac)))}.`,
      lugares: [lugarMun(nmax)],
      rota: rota.municipio(nmax.uf, nmax.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: `Nulos ÷ comparecimento (regra do TSE). ${criterioPiso}`,
      dados: { cod: `${nmax.uf}:${nmax.cod}`, nulos: nmax.nulos, comparecimento: nmax.comparecimento, pctNacional: r2(pctNulos(tally(nac))), piso: PISO_MUNICIPIO },
    });
  }

  // ── Seções e locais ────────────────────────────────────────────────────────────────────────
  {
    const top = (filtro: (uf: UF) => boolean) => {
      let best: { s: Secoes; i: number } | null = null;
      for (const s of e.secoes) {
        if (!filtro(s.uf)) continue;
        for (let i = 0; i < s.n; i++) if (!best || s.aptos[i] > best.s.aptos[best.i]) best = { s, i };
      }
      return best!;
    };
    const geral = top(() => true);
    const nobr = top((uf) => uf !== 'ZZ');
    const lugarDe = ({ s, i }: { s: Secoes; i: number }): LugarCuriosidade => {
      const m = e.muns.find((x) => x.uf === s.uf && x.cod === s.cod[i])!;
      return {
        nome: `${nomeMun(m)} · zona ${s.zona[i]}, seção ${s.secao[i]}`,
        uf: s.uf,
        cod: s.cod[i],
        zona: s.zona[i],
        secao: s.secao[i],
        rota: rota.secao(s.uf, s.cod[i], s.zona[i], s.secao[i]),
      };
    };
    const lg = lugarDe(geral);
    const lb = lugarDe(nobr);
    const media = Math.round(nac.eleitorado / totalSecoes);
    const noExterior = geral.s.uf === 'ZZ';
    add({
      id: 'secoes-maior',
      tema: 'secoes',
      titulo: 'A maior seção eleitoral',
      destaque: { valor: geral.s.aptos[geral.i], formato: 'int', unidade: 'eleitores numa só seção' },
      contexto: noExterior
        ? `Fica em ${lg.nome.split(' · ')[0]}. No Brasil, a maior é a seção ${nobr.s.secao[nobr.i]} da zona ${nobr.s.zona[nobr.i]} de ${lb.nome.split(' · ')[0]}, com ${fmtInt(nobr.s.aptos[nobr.i])}. A média nacional é de ${fmtInt(media)} eleitores por seção.`
        : `É a seção ${geral.s.secao[geral.i]} da zona ${geral.s.zona[geral.i]} de ${lg.nome.split(' · ')[0]}. A média nacional é de ${fmtInt(media)} eleitores por seção.`,
      texto: `A maior seção eleitoral do 1º turno tinha ${fmtInt(geral.s.aptos[geral.i])} eleitores aptos, em ${lg.nome.split(' · ')[0]}.${noExterior ? ` No Brasil, a maior tinha ${fmtInt(nobr.s.aptos[nobr.i])}, em ${lb.nome.split(' · ')[0]}.` : ''}`,
      lugares: noExterior ? [lg, lb] : [lg],
      rota: lg.rota!,
      rotuloRota: 'Ver o boletim',
      fonte: FONTE_SECAO,
      criterio: 'Eleitores aptos por seção (seções agregadas já somadas à principal, como no TSE).',
      dados: {
        secao: `${geral.s.uf}:${geral.s.cod[geral.i]}:${geral.s.zona[geral.i]}:${geral.s.secao[geral.i]}`,
        aptos: geral.s.aptos[geral.i],
        secaoBrasil: `${nobr.s.uf}:${nobr.s.cod[nobr.i]}:${nobr.s.zona[nobr.i]}:${nobr.s.secao[nobr.i]}`,
        aptosBrasil: nobr.s.aptos[nobr.i],
        media,
      },
    });

    type Loc = { uf: UF; cod: string; zona: number; nome: string; n: number; aptos: number };
    const locs: Loc[] = [];
    for (const uf of TODAS)
      for (const l of e.locais[uf].locais) locs.push({ uf, cod: l.cod, zona: l.zona, nome: l.nome, n: decodeFaixas(l.secoes).length, aptos: l.aptos });
    const ord = (arr: Loc[]) => [...arr].sort((x, y) => y.n - x.n || y.aptos - x.aptos)[0];
    const lgeral = ord(locs);
    const lbr = ord(locs.filter((l) => l.uf !== 'ZZ'));
    /** Nome curto do local: sem parênteses nem complemento após " - "; siglas curtas em caixa alta ("Isep" → "ISEP"). */
    const curto = (nome: string) => {
      const c = nome.replace(/\s*\([^)]*\)/g, '').split(' - ')[0].trim();
      return c.length <= 5 && !c.includes(' ') ? c.toUpperCase() : c;
    };
    const ondeLoc = (m: Mun) => (m.uf === 'ZZ' ? `${m.nome}, ${m.pais ?? 'exterior'}` : `${m.nome}, ${m.uf}`);
    const munDeLoc = (l: Loc) => e.muns.find((m) => m.uf === l.uf && m.cod === l.cod)!;
    const mg = munDeLoc(lgeral);
    const mb = munDeLoc(lbr);
    const exterior = lgeral.uf === 'ZZ';
    add({
      id: 'secoes-maior-local',
      tema: 'secoes',
      titulo: 'O local de votação com mais seções',
      destaque: { valor: lgeral.n, formato: 'int', unidade: 'seções num só local' },
      contexto: exterior
        ? `${curto(lgeral.nome)} (${ondeLoc(mg)}) reuniu ${fmtInt(lgeral.n)} seções e ${fmtInt(lgeral.aptos)} eleitores. No Brasil, o recorde: ${curto(lbr.nome)} (${ondeLoc(mb)}), com ${fmtInt(lbr.n)} seções e ${fmtInt(lbr.aptos)} eleitores.`
        : `${curto(lgeral.nome)} (${ondeLoc(mg)}) reuniu ${fmtInt(lgeral.n)} seções e ${fmtInt(lgeral.aptos)} eleitores.`,
      texto: `O local de votação com mais seções no 1º turno: ${curto(lgeral.nome)} (${ondeLoc(mg)}), com ${fmtInt(lgeral.n)}.${exterior ? ` No Brasil: ${curto(lbr.nome)} (${ondeLoc(mb)}), com ${fmtInt(lbr.n)}.` : ''}`,
      lugares: exterior ? [lugarMun(mg), lugarMun(mb)] : [lugarMun(mg)],
      rota: rota.municipio(mg.uf, mg.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_LOCAIS,
      criterio: 'Seções em funcionamento por local de votação, como o TSE cadastra (um local por zona eleitoral). Seções agregadas a outra contam uma vez, junto com a principal.',
      dados: {
        local: lgeral.nome, municipio: `${lgeral.uf}:${lgeral.cod}`, zona: lgeral.zona, secoes: lgeral.n, aptos: lgeral.aptos,
        localBrasil: lbr.nome, municipioBrasil: `${lbr.uf}:${lbr.cod}`, zonaBrasil: lbr.zona, secoesBrasil: lbr.n, aptosBrasil: lbr.aptos,
      },
    });
  }

  // ── Exterior ───────────────────────────────────────────────────────────────────────────────
  {
    const paises = new Map<string, { eleitorado: number; cidades: number }>();
    let semPais = 0;
    for (const m of ex) {
      if (!m.pais) {
        semPais++;
        continue;
      }
      const p = paises.get(m.pais) ?? { eleitorado: 0, cidades: 0 };
      p.eleitorado += m.eleitorado;
      p.cidades++;
      paises.set(m.pais, p);
    }
    add({
      id: 'exterior-eleitorado',
      tema: 'exterior',
      titulo: 'Brasileiros que votam fora',
      destaque: { valor: nacEx.eleitorado, formato: 'int', unidade: 'eleitores no exterior' },
      contexto: `Em ${fmtInt(ex.length)} cidades de ${fmtInt(paises.size + semPais)} países e territórios. Compareceram ${fmtInt(nacEx.comparecimento)} (${fmtPct(pctComp(nacEx))}), contra ${fmtPct(pctComp(nacBr))} no Brasil. No exterior, só se vota para presidente.`,
      texto: `${fmtInt(nacEx.eleitorado)} brasileiros estavam aptos a votar no exterior, em ${fmtInt(ex.length)} cidades. No 1º turno, ${fmtPct(pctComp(nacEx))} compareceram (no Brasil, ${fmtPct(pctComp(nacBr))}).`,
      lugares: [{ nome: 'Exterior', uf: 'ZZ', rota: rota.uf('ZZ') }],
      rota: rota.uf('ZZ'),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      criterio: 'Países pela tabela editorial do pipeline (o feed do TSE não traz o país); Taipé e Ramallah contam como territórios, sem país atribuído.',
      dados: { eleitorado: nacEx.eleitorado, comparecimento: nacEx.comparecimento, cidades: ex.length, paises: paises.size, territoriosSemPais: semPais, pctBrasil: r2(pctComp(nacBr)) },
    });

    const [c1, c2] = maiores(ex, (m) => m.eleitorado);
    const [[p1, d1]] = [...paises.entries()].sort((x, y) => y[1].eleitorado - x[1].eleitorado);
    add({
      id: 'exterior-maior-cidade',
      tema: 'exterior',
      titulo: 'A maior cidade eleitoral fora do Brasil',
      destaque: { valor: c1.eleitorado, formato: 'int', unidade: `eleitores em ${c1.nome}` },
      contexto: `${nomeMun(c1)} é a cidade com mais eleitores brasileiros no exterior, seguida de ${nomeMun(c2)}, com ${fmtInt(c2.eleitorado)}. Por país, ${p1 === 'Estados Unidos' ? 'os Estados Unidos lideram' : `${p1} lidera`}: ${fmtInt(d1.eleitorado)} eleitores em ${fmtInt(d1.cidades)} cidades.`,
      texto: `${nomeMun(c1)} é a cidade do exterior com mais eleitores brasileiros: ${fmtInt(c1.eleitorado)}. Por país, ${p1 === 'Estados Unidos' ? 'os Estados Unidos lideram' : `${p1} lidera`}, com ${fmtInt(d1.eleitorado)}.`,
      lugares: [lugarMun(c1), lugarMun(c2)],
      rota: rota.municipio(c1.uf, c1.cod),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      dados: { cidade: c1.nome, eleitorado: c1.eleitorado, segunda: c2.nome, eleitoradoSegunda: c2.eleitorado, pais: p1, eleitoradoPais: d1.eleitorado, cidadesPais: d1.cidades },
    });

    const xa = ex.filter((m) => m.a > m.b).length;
    const xb = ex.filter((m) => m.b > m.a).length;
    const xe = ex.length - xa - xb;
    const xEmp = ex.filter((m) => m.a === m.b && m.a > 0);
    const xSemComp = ex.filter((m) => m.comparecimento === 0).length;
    const xSemVoto = xe - xEmp.length - xSemComp; // compareceu alguém, mas nenhum voto nos dois finalistas
    exigir(xSemVoto >= 0, 'exterior: contagem de cidades inconsistente');
    const partesOutras = [
      xEmp.length ? `houve empate em ${xEmp.length === 1 ? `1 (${xEmp[0].nome}, ${fmtInt(xEmp[0].a)} a ${fmtInt(xEmp[0].b)})` : fmtInt(xEmp.length)}` : '',
      xSemComp ? `em ${fmtInt(xSemComp)} nenhum eleitor compareceu` : '',
      xSemVoto ? `em ${fmtInt(xSemVoto)} nenhum voto foi para os dois` : '',
    ].filter(Boolean);
    const outrasTxt = partesOutras.length
      ? ` Das outras ${fmtInt(xe)} cidades, ${partesOutras.length > 1 ? `${partesOutras.slice(0, -1).join(', ')} e ${partesOutras[partesOutras.length - 1]}` : partesOutras[0]}.`
      : '';
    add({
      id: 'exterior-finalistas',
      tema: 'exterior',
      titulo: 'O voto no exterior',
      par: {
        a: { valor: { valor: r2(pctA(nacEx)), formato: 'pct', unidade: 'dos válidos' }, rotulo: `à frente em ${xa} cidades` },
        b: { valor: { valor: r2(pctB(nacEx)), formato: 'pct', unidade: 'dos válidos' }, rotulo: `à frente em ${xb} cidades` },
      },
      contexto: `Percentual dos votos válidos nas ${fmtInt(ex.length)} cidades do exterior: ${fmtInt(nacEx.a)} votos para ${nomeA} e ${fmtInt(nacEx.b)} para ${nomeB}.${outrasTxt}`,
      texto: `No exterior, no 1º turno, ${nomeA} teve ${fmtPct(pctA(nacEx))} dos votos válidos e ${nomeB}, ${fmtPct(pctB(nacEx))}. Cidades à frente: ${xa} e ${xb}.`,
      lugares: [{ nome: 'Exterior', uf: 'ZZ', rota: rota.uf('ZZ') }],
      rota: rota.uf('ZZ'),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_RESULTADO,
      dados: {
        votosA: nacEx.a, votosB: nacEx.b, validos: nacEx.validos, cidadesA: xa, cidadesB: xb, cidadesOutras: xe,
        cidadesEmpate: xEmp.length, cidadesSemComparecimento: xSemComp, cidadesSemVotoNosDois: xSemVoto,
      },
    });
  }

  // ── Perfil do eleitorado ───────────────────────────────────────────────────────────────────
  {
    const faixas = e.perfil.SP.faixas;
    const escol = e.perfil.SP.escolaridade;
    // 16 e 17 anos: contagem EXATA — no perfil bruto do TSE não há eleitor de 16/17 anos sem gênero informado, e a
    // faixa "Inválida" não cai em 16/17 (conferido em 10/10/2026: 1.634.244 nos dois). Já mulheres e 70+ usam intervalo.
    const iJovem = faixas.map((f, i) => [f, i] as const).filter(([f]) => /^1[67] anos$/.test(f)).map(([, i]) => i);
    const i70 = faixas.map((f, i) => [f, i] as const).filter(([f]) => /^(7\d|8\d|9\d|1\d\d)/.test(f)).map(([, i]) => i);
    exigir(iJovem.length === 2 && i70.length >= 6, `faixas etárias inesperadas: ${faixas.join(', ')}`);
    const iSup = escol.indexOf('Superior completo');
    exigir(iSup >= 0, 'escolaridade sem "Superior completo"');
    const somaIdx = (p: PerfilAgregado, idx: number[]) => idx.reduce((s, i) => s + p.idade[0][i] + p.idade[1][i], 0);
    const fem = (p: PerfilAgregado) => p.idade[0].reduce((a, b) => a + b, 0);
    const masc = (p: PerfilAgregado) => p.idade[1].reduce((a, b) => a + b, 0);
    const ufsBr = UFS as readonly UFBr[];
    const linhas = ufsBr.map((uf) => {
      const p = e.perfil[uf].total;
      return {
        uf,
        cod: uf,
        eleitorado: p.eleitores,
        jovens: proporcao(somaIdx(p, iJovem), p.eleitores),
        idosos: proporcao(somaIdx(p, i70), p.eleitores),
        fem: proporcao(fem(p), p.eleitores),
        sup: proporcao(p.escolaridade[iSup], p.eleitores),
        // limites superiores: quem está em `naoInformado` (sem gênero ou com idade inválida) pode pertencer ao grupo
        idososMax: proporcao(somaIdx(p, i70) + p.naoInformado, p.eleitores),
        femMax: proporcao(fem(p) + p.naoInformado, p.eleitores),
        v: somaIdx(p, i70),
        f: fem(p),
        ni: p.naoInformado,
      };
    });
    /** O recorde por UF só vale se o mínimo do primeiro superar o máximo de todos os outros (e vice-versa). */
    const recordeSeguro = (l: (typeof linhas)[number], lo: (x: (typeof linhas)[number]) => number, hi: (x: (typeof linhas)[number]) => number, maiorQue: boolean, id: string) =>
      exigir(
        linhas.every((o) => o === l || (maiorQue ? lo(l) > hi(o) : hi(l) < lo(o))),
        `${id}: recorde por UF ambíguo por causa de eleitores sem gênero/idade no perfil`,
      );
    const tot = TODAS.reduce(
      (s, uf) => {
        const p = e.perfil[uf].total;
        s.el += p.eleitores;
        s.j += somaIdx(p, iJovem);
        s.v += somaIdx(p, i70);
        s.f += fem(p);
        s.m += masc(p);
        s.ni += p.naoInformado;
        p.escolaridade.forEach((x, i) => (s.esc[i] = (s.esc[i] ?? 0) + x));
        return s;
      },
      { el: 0, j: 0, v: 0, f: 0, m: 0, ni: 0, esc: [] as number[] },
    );
    const iModa = tot.esc.indexOf(Math.max(...tot.esc));
    const rotUf = (uf: UF) => lugarUf(uf);

    // Perfil agregado: eleitores sem gênero informado ou com idade inválida ficam em `naoInformado` (fora de
    // gênero × idade). Mulheres e 70+ são conhecidos só por intervalo [contado, contado + naoInformado]:
    // os números saem com a precisão que o intervalo garante (pctSeguro, "mais de", "cerca de").
    const fMax = maior(linhas, (l) => l.fem);
    recordeSeguro(fMax, (l) => l.fem, (l) => l.femMax, true, 'eleitorado-mulheres');
    const pctMulheres = pctSeguro(tot.f, tot.f + tot.ni, tot.el, 'eleitorado-mulheres');
    const pctFMax = pctSeguro(fMax.f, fMax.f + fMax.ni, fMax.eleitorado, 'eleitorado-mulheres/UF');
    const eleitoras = maisDeMilhoes(tot.f, 'eleitorado-mulheres');
    const aMais = cercaDeMilhoes(tot.f - (tot.m + tot.ni), tot.f + tot.ni - tot.m, 'eleitorado-mulheres/diferença');
    add({
      id: 'eleitorado-mulheres',
      tema: 'eleitorado',
      titulo: 'Elas são a maioria',
      destaque: { valor: pctMulheres.valor, formato: 'pct', casas: pctMulheres.casas, unidade: 'do eleitorado são mulheres' },
      contexto: `São ${eleitoras} de eleitoras, ${aMais} a mais que os homens. A maior proporção feminina está ${emUf(fMax.uf)}: ${pctFMax.txt}.`,
      texto: `As mulheres são ${pctMulheres.txt} do eleitorado brasileiro em 2026: ${eleitoras} de eleitoras, ${aMais} a mais que os homens.`,
      lugares: [rotUf(fMax.uf)],
      rota: rota.uf(fMax.uf),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_PERFIL,
      criterio: `Gênero declarado no cadastro eleitoral; inclui o exterior. ${fmtInt(tot.ni)} eleitores sem gênero informado ou com idade inválida ficam fora das faixas do perfil agregado, por isso os números saem arredondados ("mais de", "cerca de").`,
      dados: {
        eleitores: tot.el, mulheres: tot.f, homens: tot.m, naoInformado: tot.ni,
        pct: pctMulheres.valor, ufMaior: fMax.uf, pctUfMaior: pctFMax.valor,
      },
    });

    const jMax = maior(linhas, (l) => l.jovens);
    const jMin = menor(linhas, (l) => l.jovens);
    add({
      id: 'eleitorado-jovens',
      tema: 'eleitorado',
      titulo: 'Votando aos 16 e 17 anos',
      destaque: { valor: tot.j, formato: 'int', unidade: 'eleitores de 16 e 17 anos' },
      contexto: `São ${fmtPct(proporcao(tot.j, tot.el))} do eleitorado, e o voto é facultativo nessa idade. A maior proporção está ${emUf(jMax.uf)} (${fmtPct(jMax.jovens)}); a menor, ${emUf(jMin.uf)} (${fmtPct(jMin.jovens)}).`,
      texto: `${fmtInt(tot.j)} jovens de 16 e 17 anos tiraram o título para 2026, quando o voto é facultativo. A maior proporção está ${emUf(jMax.uf)}: ${fmtPct(jMax.jovens)} do eleitorado.`,
      lugares: [rotUf(jMax.uf)],
      rota: rota.uf(jMax.uf),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_PERFIL,
      criterio: 'Idade na data da eleição, conforme o perfil do eleitorado do TSE. Inclui o exterior no total.',
      dados: { jovens: tot.j, eleitores: tot.el, ufMaior: jMax.uf, pctUfMaior: r2(jMax.jovens), ufMenor: jMin.uf, pctUfMenor: r2(jMin.jovens) },
    });

    const vMax = maior(linhas, (l) => l.idosos);
    const vMin = menor(linhas, (l) => l.idosos);
    recordeSeguro(vMax, (l) => l.idosos, (l) => l.idososMax, true, 'eleitorado-70-mais');
    recordeSeguro(vMin, (l) => l.idosos, (l) => l.idososMax, false, 'eleitorado-70-mais');
    const pctV = pctSeguro(tot.v, tot.v + tot.ni, tot.el, 'eleitorado-70-mais');
    const pctVMax = pctSeguro(vMax.v, vMax.v + vMax.ni, vMax.eleitorado, 'eleitorado-70-mais/max');
    const pctVMin = pctSeguro(vMin.v, vMin.v + vMin.ni, vMin.eleitorado, 'eleitorado-70-mais/min');
    const idosos = maisDeMilhoes(tot.v, 'eleitorado-70-mais');
    add({
      id: 'eleitorado-70-mais',
      tema: 'eleitorado',
      titulo: 'Com 70 anos ou mais',
      destaque: { valor: pctV.valor, formato: 'pct', casas: pctV.casas, unidade: 'do eleitorado tem 70 anos ou mais' },
      contexto: `São ${idosos} de eleitores, e o voto também é facultativo para eles. A maior proporção está ${emUf(vMax.uf)} (${pctVMax.txt}); a menor, ${emUf(vMin.uf)} (${pctVMin.txt}).`,
      texto: `${pctV.txt} do eleitorado brasileiro tem 70 anos ou mais: ${idosos} de pessoas, para quem o voto é facultativo. A maior proporção está ${emUf(vMax.uf)}: ${pctVMax.txt}.`,
      lugares: [rotUf(vMax.uf)],
      rota: rota.uf(vMax.uf),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_PERFIL,
      criterio: `Faixas etárias de 70 anos em diante do perfil do eleitorado do TSE; inclui o exterior. ${fmtInt(tot.ni)} eleitores sem gênero informado ou com idade inválida ficam fora das faixas do perfil agregado, por isso os números saem arredondados ("mais de").`,
      dados: {
        idososContados: tot.v, idososMax: tot.v + tot.ni, eleitores: tot.el, pct: pctV.valor,
        ufMaior: vMax.uf, pctUfMaior: pctVMax.valor, ufMenor: vMin.uf, pctUfMenor: pctVMin.valor,
      },
    });

    const sMax = maior(linhas, (l) => l.sup);
    add({
      id: 'eleitorado-superior',
      tema: 'eleitorado',
      titulo: 'Eleitores com curso superior',
      destaque: { valor: r2(proporcao(tot.esc[iSup], tot.el)), formato: 'pct', unidade: 'têm ensino superior completo' },
      contexto: `São ${fmtInt(tot.esc[iSup])} eleitores. A escolaridade mais comum é "${escol[iModa].toLowerCase()}" (${fmtPct(proporcao(tot.esc[iModa], tot.el))}). A maior proporção com superior completo está ${emUf(sMax.uf)}: ${fmtPct(sMax.sup)}.`,
      texto: `${fmtPct(proporcao(tot.esc[iSup], tot.el))} dos eleitores brasileiros têm ensino superior completo. A maior proporção está ${emUf(sMax.uf)}: ${fmtPct(sMax.sup)}.`,
      lugares: [rotUf(sMax.uf)],
      rota: rota.uf(sMax.uf),
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_PERFIL,
      criterio: 'Escolaridade declarada no cadastro eleitoral. Inclui o exterior no total.',
      dados: { superior: tot.esc[iSup], eleitores: tot.el, maisComum: escol[iModa], qtdMaisComum: tot.esc[iModa], ufMaior: sMax.uf, pctUfMaior: r2(sMax.sup) },
    });
  }

  // ── Outros cargos ──────────────────────────────────────────────────────────────────────────
  {
    const genero = (sq: string, masc: string, femi: string) => (e.fichas.get(sq)?.genero === 'Feminino' ? femi : masc);
    const deps = e.camara.ufs.flatMap((u) => u.candidatos.map((c) => ({ ...c, uf: u.uf as UF })));
    const [d1, d2] = [...deps].sort((x, y) => y.votos - x.votos);
    const dPct = [...deps].sort((x, y) => y.pct - x.pct)[0];
    const mesmo = dPct.sqcand === d1.sqcand;
    const cargoD1 = genero(d1.sqcand, 'deputado federal', 'deputada federal');
    add({
      id: 'cargos-deputado-mais-votado',
      tema: 'cargos',
      titulo: `${genero(d1.sqcand, 'Deputado federal mais votado', 'Deputada federal mais votada')}`,
      destaque: { valor: d1.votos, formato: 'int', unidade: `votos para ${d1.nomeUrna}` },
      contexto: `${d1.nomeUrna} (${d1.partido}-${d1.uf}) teve ${fmtPct(d1.pct)} dos votos válidos para a Câmara ${emUf(d1.uf)}${mesmo ? ', também o maior percentual do país' : ''}. ${mesmo ? 'Em seguida' : 'Em votos, em seguida'} vem ${d2.nomeUrna} (${d2.partido}-${d2.uf}), com ${fmtInt(d2.votos)}.${
        mesmo ? '' : ` Em percentual, o recorde é de ${dPct.nomeUrna} (${dPct.partido}-${dPct.uf}): ${fmtPct(dPct.pct)}.`
      }`,
      texto: `${d1.nomeUrna} (${d1.partido}-${d1.uf}) foi ${genero(d1.sqcand, 'o', 'a')} ${cargoD1} ${genero(d1.sqcand, 'mais votado', 'mais votada')} do país em 2026: ${fmtInt(d1.votos)} votos, ${fmtPct(d1.pct)} dos válidos ${emUf(d1.uf)}.`,
      lugares: [{ nome: `${d1.nomeUrna} (${d1.partido}-${d1.uf})`, uf: d1.uf, rota: rota.candidato(d1.sqcand) }],
      rota: e.fichas.has(d1.sqcand) ? rota.candidato(d1.sqcand) : rota.camara(d1.uf),
      rotuloRota: e.fichas.has(d1.sqcand) ? 'Ver a ficha' : 'Ver a Câmara',
      fonte: FONTE_CARGOS,
      criterio: 'Votos nominais para deputado federal; percentual sobre os votos válidos para a Câmara na UF.',
      dados: { sqcand: d1.sqcand, nome: d1.nomeUrna, partido: d1.partido, uf: d1.uf, votos: d1.votos, pct: d1.pct, segundo: d2.nomeUrna, votosSegundo: d2.votos, maiorPct: dPct.nomeUrna, maiorPctValor: dPct.pct },
    });

    const sens = e.senado.ufs.flatMap((u) => u.candidatos.map((c) => ({ ...c, uf: u.uf as UF })));
    const [s1, s2] = [...sens].sort((x, y) => y.votos - x.votos);
    const vagasS1 = e.senado.ufs.find((u) => u.uf === s1.uf)?.vagas ?? 0;
    add({
      id: 'cargos-senador-mais-votado',
      tema: 'cargos',
      titulo: genero(s1.sqcand, 'Senador mais votado', 'Senadora mais votada'),
      destaque: { valor: s1.votos, formato: 'int', unidade: `votos para ${s1.nomeUrna}` },
      contexto: `${s1.nomeUrna} (${s1.partido}-${s1.uf}) teve a maior votação para o Senado no país. ${emUf(s1.uf).replace(/^./, (c) => c.toUpperCase())}, cada eleitor podia votar em ${vagasS1} candidatos, para ${vagasS1} vagas. Em seguida vem ${s2.nomeUrna} (${s2.partido}-${s2.uf}), com ${fmtInt(s2.votos)}.`,
      texto: `${s1.nomeUrna} (${s1.partido}-${s1.uf}) foi ${genero(s1.sqcand, 'o candidato', 'a candidata')} ao Senado com mais votos em 2026: ${fmtInt(s1.votos)}.`,
      lugares: [{ nome: `${s1.nomeUrna} (${s1.partido}-${s1.uf})`, uf: s1.uf, rota: rota.candidato(s1.sqcand) }],
      rota: e.fichas.has(s1.sqcand) ? rota.candidato(s1.sqcand) : rota.senado(s1.uf),
      rotuloRota: e.fichas.has(s1.sqcand) ? 'Ver a ficha' : 'Ver o Senado',
      fonte: FONTE_CARGOS,
      dados: { sqcand: s1.sqcand, nome: s1.nomeUrna, partido: s1.partido, uf: s1.uf, votos: s1.votos, vagas: vagasS1, segundo: s2.nomeUrna, votosSegundo: s2.votos },
    });

    const govs = e.governador.ufs.map((u) => {
      const c = [...u.candidatos].sort((x, y) => y.votos - x.votos);
      return { uf: u.uf as UF, c1: c[0], c2: c[1], validos: u.validos };
    });
    const eleitos = govs.filter((g) => g.c1.situacao === 'eleito');
    const [g1, g2, g3] = [...eleitos].sort((x, y) => y.c1.pct - x.c1.pct);
    add({
      id: 'cargos-governador-maior',
      tema: 'cargos',
      titulo: 'A maior votação para governador',
      destaque: { valor: g1.c1.pct, formato: 'pct', unidade: 'dos votos válidos' },
      contexto: `${g1.c1.nomeUrna} (${g1.c1.partido}) foi ${genero(g1.c1.sqcand, 'eleito', 'eleita')} ${emUf(g1.uf)} com ${fmtPct(g1.c1.pct)} dos válidos (${fmtInt(g1.c1.votos)} votos), o maior percentual entre os ${eleitos.length} governadores eleitos no 1º turno. Em seguida: ${g2.c1.nomeUrna} (${g2.c1.partido}-${g2.uf}), ${fmtPct(g2.c1.pct)}, e ${g3.c1.nomeUrna} (${g3.c1.partido}-${g3.uf}), ${fmtPct(g3.c1.pct)}.`,
      texto: `${g1.c1.nomeUrna} (${g1.c1.partido}-${g1.uf}) teve ${fmtPct(g1.c1.pct)} dos votos válidos, o maior percentual entre os ${eleitos.length} governadores eleitos no 1º turno de 2026.`,
      lugares: [{ nome: `${g1.c1.nomeUrna} (${g1.c1.partido}-${g1.uf})`, uf: g1.uf, rota: rota.candidato(g1.c1.sqcand) }],
      rota: e.fichas.has(g1.c1.sqcand) ? rota.candidato(g1.c1.sqcand) : '/governadores',
      rotuloRota: e.fichas.has(g1.c1.sqcand) ? 'Ver a ficha' : 'Ver os governadores',
      fonte: FONTE_CARGOS,
      dados: { sqcand: g1.c1.sqcand, nome: g1.c1.nomeUrna, uf: g1.uf, votos: g1.c1.votos, pct: g1.c1.pct, eleitosPrimeiroTurno: eleitos.length },
    });

    const ap = [...govs].sort((x, y) => x.c1.pct - x.c2.pct - (y.c1.pct - y.c2.pct))[0];
    const [p1, p2] = [ap.c1, ap.c2].sort((x, y) => x.numero - y.numero);
    const pp = Math.abs(ap.c1.pct - ap.c2.pct);
    const segundoTurno = ap.c1.situacao === 'segundo-turno';
    const rotaGovAp = segundoTurno ? `/apuracao/${ap.uf.toLowerCase()}?race=gov-${ap.uf.toLowerCase()}-t1` : '/governadores';
    add({
      id: 'cargos-governador-apertada',
      tema: 'cargos',
      titulo: 'A disputa de governador mais apertada',
      destaque: { valor: r2(pp), formato: 'pp', unidade: 'de diferença' },
      contexto: `${emUf(ap.uf).replace(/^./, (c) => c.toUpperCase())}, ${p1.nomeUrna} (${p1.partido}) teve ${fmtPct(p1.pct)} e ${p2.nomeUrna} (${p2.partido}), ${fmtPct(p2.pct)}: ${fmtInt(Math.abs(p1.votos - p2.votos))} votos de diferença.${segundoTurno ? ' Os dois disputam o 2º turno em 25 de outubro.' : ''}`,
      texto: `A disputa de governador mais apertada do 1º turno foi ${emUf(ap.uf)}: ${p1.nomeUrna} (${p1.partido}), ${fmtPct(p1.pct)}, e ${p2.nomeUrna} (${p2.partido}), ${fmtPct(p2.pct)}.`,
      // o lugar leva à disputa de governador (não ao mapa de Presidente da UF)
      lugares: [{ ...lugarUf(ap.uf), rota: rotaGovAp }],
      rota: rotaGovAp,
      rotuloRota: 'Ver no mapa',
      fonte: FONTE_CARGOS,
      criterio: 'Menor diferença, em pontos percentuais dos votos válidos, entre o 1º e o 2º colocados nas 27 disputas.',
      dados: { uf: ap.uf, primeiro: ap.c1.nomeUrna, pctPrimeiro: ap.c1.pct, votosPrimeiro: ap.c1.votos, segundo: ap.c2.nomeUrna, pctSegundo: ap.c2.pct, votosSegundo: ap.c2.votos },
    });

    // mulheres eleitas
    const depEleitos = deps.filter((c) => c.situacao.startsWith('eleito'));
    const depMulheres = depEleitos.filter((c) => e.fichas.get(c.sqcand)?.genero === 'Feminino');
    const semFicha = depEleitos.filter((c) => !e.fichas.get(c.sqcand)?.genero);
    exigir(semFicha.length === 0, `${semFicha.length} deputados eleitos sem gênero na ficha`);
    const pendentes = e.camara.ufs.filter((u) => u.candidatos.filter((c) => c.situacao.startsWith('eleito')).length < u.vagas);
    const vagasPend = pendentes.reduce((s, u) => s + u.vagas, 0);
    const senEleitos = sens.filter((c) => c.situacao.startsWith('eleito'));
    const senMulheres = senEleitos.filter((c) => e.fichas.get(c.sqcand)?.genero === 'Feminino');
    const govMulheres = eleitos.filter((g) => e.fichas.get(g.c1.sqcand)?.genero === 'Feminino');
    const pctDep = proporcao(depMulheres.length, depEleitos.length);
    const perfilTot = TODAS.reduce(
      (s, uf) => ({ el: s.el + e.perfil[uf].total.eleitores, f: s.f + e.perfil[uf].total.idade[0].reduce((a, b) => a + b, 0), ni: s.ni + e.perfil[uf].total.naoInformado }),
      { el: 0, f: 0, ni: 0 },
    );
    const pctEleitoras = pctSeguro(perfilTot.f, perfilTot.f + perfilTot.ni, perfilTot.el, 'cargos-mulheres-eleitas');
    const govTxt =
      govMulheres.length === 0
        ? `nenhum dos ${eleitos.length} governadores eleitos no 1º turno é mulher`
        : govMulheres.length === 1
          ? `entre os ${eleitos.length} governadores eleitos no 1º turno, 1 mulher: ${govMulheres[0].c1.nomeUrna} (${govMulheres[0].uf})`
          : `entre os ${eleitos.length} governadores eleitos no 1º turno, ${govMulheres.length} mulheres`;
    add({
      id: 'cargos-mulheres-eleitas',
      tema: 'cargos',
      titulo: 'Mulheres eleitas',
      destaque: { valor: depMulheres.length, formato: 'int', unidade: 'deputadas federais eleitas' },
      contexto: `São ${fmtPct(pctDep)} dos ${fmtInt(depEleitos.length)} deputados federais eleitos${pendentes.length ? ` já divulgados (${pendentes.length === 1 ? `falta ${artigoUf(pendentes[0].uf as UF)}` : `faltam ${pendentes.map((u) => u.uf).join(', ')}`}, com ${vagasPend} vagas)` : ''}. No Senado, ${senMulheres.length} das ${senEleitos.length} vagas; ${govTxt}. As mulheres são ${pctEleitoras.txt} do eleitorado.`,
      texto: `${depMulheres.length} mulheres foram eleitas deputadas federais em 4 de outubro de 2026 (${fmtPct(pctDep)} dos eleitos já divulgados). No Senado, ${senMulheres.length} das ${senEleitos.length} vagas.`,
      lugares: [{ nome: 'Câmara dos Deputados', rota: rota.camara() }],
      rota: rota.camara(),
      rotuloRota: 'Ver a Câmara',
      fonte: `${FONTE_CARGOS} · gênero: TSE, candidaturas 2026`,
      criterio: pendentes.length
        ? `Eleitos já divulgados pelo TSE. ${pendentes.map((u) => u.uf).join(', ')}: eleitos ainda não divulgados (${vagasPend} vagas).`
        : 'Eleitos divulgados pelo TSE.',
      dados: {
        deputadasEleitas: depMulheres.length,
        deputadosEleitos: depEleitos.length,
        ufsPendentes: pendentes.map((u) => u.uf),
        vagasPendentes: vagasPend,
        senadorasEleitas: senMulheres.length,
        senadoresEleitos: senEleitos.length,
        governadorasEleitas: govMulheres.length,
        governadoresEleitos: eleitos.length,
      },
    });
  }

  return fatos;
}

// ---------------------------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------------------------

function validar(fatos: Curiosidade[]) {
  const ids = new Set<string>();
  for (const f of fatos) {
    exigir(!ids.has(f.id), `id repetido: ${f.id}`);
    ids.add(f.id);
    exigir(f.destaque || f.par, `${f.id}: sem destaque nem par`);
    exigir(f.titulo.length <= 48, `${f.id}: título com ${f.titulo.length} caracteres (máx. 48)`);
    exigir(f.texto.length <= 200, `${f.id}: texto com ${f.texto.length} caracteres (máx. 200): ${f.texto}`);
    const tudo = JSON.stringify(f);
    exigir(!/NaN|undefined|Infinity/.test(tudo), `${f.id}: NaN/undefined no fato`);
  }
}

function main() {
  const t0 = Date.now();
  const e = carregar();
  const fatos = calcular(e);
  validar(fatos);
  const out: CuriosidadesDataset = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    fonte:
      'Calculado pelo Sintonia a partir dos dados oficiais do TSE do 1º turno de 04/10/2026 (resultado por município e por seção, ' +
      'locais de votação, perfil do eleitorado, candidaturas e resultados de Câmara, Senado e Governador). Script: scripts/data/curiosidades.ts.',
    finalistas: e.finalistas,
    pisos: { eleitoradoMunicipio: PISO_MUNICIPIO, secaoValidos: PISO_SECAO_VALIDOS },
    fatos,
  };
  const json = JSON.stringify(out, null, 1);
  if (process.argv.includes('--stdout')) {
    console.log(json);
    return;
  }
  writeFileSync(SAIDA, json + '\n');
  console.log(`curiosidades: ${fatos.length} fatos → ${path.relative(ROOT, SAIDA)} (${(json.length / 1024).toFixed(1)} KB, ${Date.now() - t0} ms)`);
  for (const f of fatos) console.log(`  · [${f.tema}] ${f.titulo} — ${f.texto}`);
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (executadoDireto) main();

export { carregar };
