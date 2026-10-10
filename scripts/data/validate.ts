/**
 * Valida o dataset compilado (public/data) contra invariantes e contra os totais OFICIAIS do TSE.
 *
 *   npx tsx scripts/data/validate.ts
 *   DATA_DIR=dist/data npx tsx scripts/data/validate.ts   # valida outra cópia do dataset
 *
 * Fontes de conferência, da mais forte para a mais fraca:
 *  1. Totais nacionais oficiais do 1º turno (Presidente, Brasil + exterior), fixos abaixo.
 *  2. Arquivos agregados oficiais de cada UF (resultado `-u` e abrangência `-ab`) em data-raw/tse/, quando
 *     presentes; senão, o instantâneo scripts/data/lib/oficial-t1.json (gerado dos mesmos arquivos).
 *  3. Invariantes internas: Σ municípios = UF, Σ UFs + ZZ = Brasil, votos + brancos + nulos = comparecimento,
 *     faixas de seções canônicas e sem repetição, candidatos/cores/ordem das corridas etc.
 *  4. (Aviso, não falha) Cobertura das malhas em public/geo/mun/{uf}.json, se já geradas.
 *  5. Conferência MUNICÍPIO A MUNICÍPIO contra os arquivos brutos do TSE (quando data-raw/ existe), lendo os campos
 *     do feed diretamente (sem lib/resultado.ts): eleitorado, comparecimento, brancos, nulos e votos de cada candidato
 *     (Presidente e Governador) e o conjunto exato de seções ativas (zona, seção) do arquivo de urnas. As somas por UF
 *     não detectam, por exemplo, resultados trocados entre dois municípios; esta conferência detecta.
 *  6. Nomes: estilo (sem CAIXA ALTA, numerais romanos, partícula d' minúscula), grafia oficial do IBGE quando é o mesmo
 *     nome (se data-raw/ tiver a lista do IBGE) e país das cidades do exterior conforme lib/exterior.ts.
 *  7. Candidatos das corridas × feed (com data-raw/): finalistas, partido, e nome de urna/nome/vice/coligação iguais
 *     aos do feed a menos de acentos e caixa.
 *
 * Sai com código 1 se qualquer verificação falhar.
 */
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DatasetMeta, ResultadoPrimeiroTurno, UfDataset } from '../../src/shared/dataset';
import type { Race, UF } from '../../src/shared/types';
import { UFS } from '../../src/shared/types';
import { UF_NOMES, UF_REGIAO, UFS_GOV_2T } from '../../src/shared/constants';
import { decodeFaixas, encodeFaixas } from '../../src/shared/calc';
import { corCandidato } from '../../src/shared/cores';
import { ROOT, rawPath, readRaw } from './lib/cache';
import { lerResultado, pct2 } from './lib/resultado';
import { ibgeMunicipios, paths, resGovMun, resGovUf, resPresBr, resPresMun, resPresUf } from './lib/tse-feed';
import { candidatosDe, type TseAbrangencia, type TseResultado, type TseSecoesConfig } from './lib/tse-types';
import { chaveGrafia } from './lib/nomes';
import { PAIS_EXTERIOR } from './lib/exterior';

/** Totais oficiais do 1º turno de 2026 — Presidente, Brasil + exterior (TSE, divulgação final de 05/10/2026). */
const OFICIAL_BR = {
  secoes: 499_248,
  eleitorado: 158_745_502,
  comparecimento: 125_275_835,
  validos: 119_300_788,
  brancos: 2_300_798,
  nulos: 3_674_249,
  votos: { '22': 56_104_503, '13': 53_879_538 } as Record<string, number>,
};

/** Prefixo IBGE (2 dígitos) de cada UF — confere o código IBGE de 7 dígitos dos municípios. */
const IBGE_UF: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24',
  PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42',
  RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};

/** Diretório do dataset (padrão public/data; `DATA_DIR=...` para validar outra cópia, ex.: dist/data). */
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'public', 'data');
const GEO_DIR = path.join(ROOT, 'public', 'geo', 'mun');
const OFICIAL_FILE = path.join(ROOT, 'scripts', 'data', 'lib', 'oficial-t1.json');
const TODAS: UF[] = [...UFS, 'ZZ'];
/** Palavra que é numeral romano (ex.: "Pio XII"): deve estar em maiúsculas. */
const ROMANO = /^(?=[ivx]{2,}$)x{0,3}(?:ix|iv|v?i{0,3})$/i;

let verificacoes = 0;
const falhas: string[] = [];
const avisos: string[] = [];
function check(ok: boolean, msg: string) {
  verificacoes++;
  if (!ok) falhas.push(msg);
  return ok;
}
const fmt = (n: number) => n.toLocaleString('pt-BR');

interface Soma {
  secoes: number;
  eleitorado: number;
  comparecimento: number;
  brancos: number;
  nulos: number;
  validos: number;
  votos: Record<string, number>;
}
const novaSoma = (): Soma => ({ secoes: 0, eleitorado: 0, comparecimento: 0, brancos: 0, nulos: 0, validos: 0, votos: {} });
function somar(s: Soma, r: ResultadoPrimeiroTurno, secoes: number) {
  s.secoes += secoes;
  s.eleitorado += r.eleitorado;
  s.comparecimento += r.comparecimento;
  s.brancos += r.brancos;
  s.nulos += r.nulos;
  for (const [n, v] of Object.entries(r.votos)) {
    s.votos[n] = (s.votos[n] ?? 0) + v;
    s.validos += v;
  }
}

interface Oficial {
  secoes: number;
  eleitorado: number;
  comparecimento: number;
  validos: number;
  brancos: number;
  nulos: number;
  votos: Record<string, number>;
}

/** Compara uma soma com totais oficiais; retorna true se tudo bate. */
function comparar(ctx: string, s: Soma, o: Oficial, comSecoes = true): boolean {
  let ok = true;
  const campos = ['eleitorado', 'comparecimento', 'validos', 'brancos', 'nulos'] as const;
  if (comSecoes) ok = check(s.secoes === o.secoes, `${ctx}: seções ${fmt(s.secoes)} ≠ oficial ${fmt(o.secoes)}`) && ok;
  for (const c of campos) ok = check(s[c] === o[c], `${ctx}: ${c} ${fmt(s[c])} ≠ oficial ${fmt(o[c])}`) && ok;
  for (const n of new Set([...Object.keys(s.votos), ...Object.keys(o.votos)])) {
    ok = check((s.votos[n] ?? 0) === (o.votos[n] ?? 0), `${ctx}: votos ${n} ${fmt(s.votos[n] ?? 0)} ≠ oficial ${fmt(o.votos[n] ?? 0)}`) && ok;
  }
  return ok;
}

function checkResultado(ctx: string, r: ResultadoPrimeiroTurno, numeros: string) {
  const nums = Object.keys(r.votos);
  check(nums.slice().sort((a, b) => +a - +b).join() === numeros, `${ctx}: candidatos ${nums} ≠ esperados ${numeros}`);
  const campos: (keyof ResultadoPrimeiroTurno)[] = ['eleitorado', 'comparecimento', 'brancos', 'nulos'];
  for (const c of campos) check(Number.isInteger(r[c]) && (r[c] as number) >= 0, `${ctx}: ${c} inválido`);
  let v = 0;
  for (const x of Object.values(r.votos)) {
    check(Number.isInteger(x) && x >= 0, `${ctx}: voto inválido ${x}`);
    v += x;
  }
  check(v + r.brancos + r.nulos === r.comparecimento, `${ctx}: votos ${v} + brancos ${r.brancos} + nulos ${r.nulos} ≠ comparecimento ${r.comparecimento}`);
  check(r.comparecimento <= r.eleitorado, `${ctx}: comparecimento > eleitorado`);
}

function checkRace(r: Race, idEsperado: string, turno: 1 | 2, abr: 'BR' | UF) {
  const ctx = `corrida ${r.id}`;
  check(r.id === idEsperado, `${ctx}: id inesperado (esperado ${idEsperado})`);
  check(r.turno === turno, `${ctx}: turno ${r.turno}`);
  check(r.abrangencia === abr, `${ctx}: abrangência ${r.abrangencia}`);
  check(r.cargo === (abr === 'BR' ? 'Presidente' : 'Governador'), `${ctx}: cargo ${r.cargo}`);
  const ufsEsperadas = abr === 'BR' ? TODAS : [abr];
  check(r.ufs.join() === ufsEsperadas.join(), `${ctx}: ufs ${r.ufs}`);
  const ele = abr === 'BR' ? (turno === 1 ? '6257' : '6258') : turno === 1 ? '6259' : '6260';
  check(
    r.tse.ciclo === 'ele2026' && r.tse.eleicao === ele && r.tse.cargo === (abr === 'BR' ? '1' : '3') &&
      r.tse.pleito === (turno === 1 ? '3220' : '3221'),
    `${ctx}: códigos TSE ${JSON.stringify(r.tse)}`,
  );
  const reais = r.candidatos.filter((c) => !c.agregado);
  check(reais.length === 2, `${ctx}: ${reais.length} finalistas`);
  check(reais[0].numero < reais[1].numero, `${ctx}: finalistas fora de ordem de número`);
  // cores da fonte única: Presidente com as de identificação (CORES_IDENTIDADE), governador com 'a'/'b' pela ordem
  check(
    reais[0].cor === corCandidato(r.id, reais[0].numero, 0) && reais[1].cor === corCandidato(r.id, reais[1].numero, 1),
    `${ctx}: cores dos finalistas (${reais.map((c) => c.cor).join('/')})`,
  );
  if (turno === 2) check(r.candidatos.length === 2, `${ctx}: 2º turno com ${r.candidatos.length} candidatos`);
  else {
    const o = r.candidatos[2];
    check(
      r.candidatos.length === 3 && o?.agregado === true && o.numero === 0 && o.cor === 'outros' && o.nomeUrna === 'Outros',
      `${ctx}: 1º turno deve ser [finalista, finalista, Outros]`,
    );
  }
  for (const c of r.candidatos) {
    check(!!c.primeiroTurno, `${ctx}: ${c.numero} sem primeiroTurno`);
    if (c.agregado) continue;
    check(c.nomeUrna !== c.nomeUrna.toUpperCase(), `${ctx}: nome de urna em CAIXA ALTA (${c.nomeUrna})`);
    check(!!c.partido && !!c.nome && !!c.vice, `${ctx}: ${c.numero} sem partido/nome/vice`);
  }
}

/** Um resultado do dataset × o arquivo bruto do TSE, lendo os campos do feed diretamente. */
function conferirResultado(ctx: string, r: ResultadoPrimeiroTurno, u: TseResultado, cod: string) {
  check(u.cdabr === cod && u.tf === 's', `${ctx}: arquivo bruto não corresponde (cdabr ${u.cdabr}, tf ${u.tf})`);
  check(r.eleitorado === +u.e.te, `${ctx}: eleitorado ${r.eleitorado} ≠ TSE e.te ${u.e.te}`);
  check(r.comparecimento === +u.e.c, `${ctx}: comparecimento ${r.comparecimento} ≠ TSE e.c ${u.e.c}`);
  check(r.brancos === +u.v.vb, `${ctx}: brancos ${r.brancos} ≠ TSE v.vb ${u.v.vb}`);
  check(r.nulos === +u.v.tvn, `${ctx}: nulos ${r.nulos} ≠ TSE v.tvn ${u.v.tvn}`);
  const tse = new Map(candidatosDe(u).map(({ cand }) => [String(+cand.n), +cand.vap]));
  check(Object.keys(r.votos).length === tse.size, `${ctx}: ${Object.keys(r.votos).length} candidatos ≠ TSE ${tse.size}`);
  for (const [n, v] of tse) check(r.votos[n] === v, `${ctx}: votos ${n} ${r.votos[n]} ≠ TSE ${v}`);
}

/**
 * Candidatos das corridas × feed do 1º turno (st = "2º turno"): número, partido e os MESMOS nomes do feed a menos de
 * acentos/caixa/separadores (nome de urna, nome completo, vice, coligação). Pega troca de candidato, vice ou partido.
 */
async function conferirCandidatos(race: Map<string, Race>) {
  const arquivos: [string, string][] = [
    ['pres', resPresBr()],
    ...UFS_GOV_2T.map((uf): [string, string] => [`gov-${uf.toLowerCase()}`, resGovUf(uf.toLowerCase())]),
  ];
  for (const [id, arq] of arquivos) {
    const feed = candidatosDe(await readRaw<TseResultado>(arq));
    for (const r of [race.get(id)!, race.get(`${id}-t1`)!]) {
      for (const c of r.candidatos.filter((x) => !x.agregado)) {
        const ctx = `${r.id} ${c.numero}`;
        const f = feed.find((x) => +x.cand.n === c.numero);
        if (!check(!!f && f.cand.st === '2º turno', `${ctx}: não é finalista no feed`)) continue;
        const { cand, par, agr } = f!;
        check(chaveGrafia(c.nomeUrna) === chaveGrafia(cand.nmu), `${ctx}: nome de urna "${c.nomeUrna}" ≠ feed "${cand.nmu}"`);
        check(chaveGrafia(c.nome) === chaveGrafia(cand.nm), `${ctx}: nome "${c.nome}" ≠ feed "${cand.nm}"`);
        check(chaveGrafia(c.partido) === chaveGrafia(par.sg), `${ctx}: partido ${c.partido} ≠ feed ${par.sg}`);
        const vice = cand.vs?.find((v) => v.tp === 'v') ?? cand.vs?.[0];
        check(!!vice && chaveGrafia(c.vice ?? '') === chaveGrafia(vice.nmu), `${ctx}: vice "${c.vice}" ≠ feed "${vice?.nmu}"`);
        check(
          agr.tp === 'i' ? c.coligacao === undefined : chaveGrafia(c.coligacao ?? '') === chaveGrafia(agr.nm),
          `${ctx}: coligação "${c.coligacao}" ≠ feed "${agr.nm}"`,
        );
      }
    }
  }
}

/** Conferência município a município contra data-raw/ (resultados, seções e nomes oficiais do IBGE). */
async function conferirMunicipios(datasets: Map<UF, UfDataset>) {
  const ibgeFile = rawPath(ibgeMunicipios());
  const ibge = existsSync(ibgeFile)
    ? new Map((await lerJson<{ id: number; nome: string }[]>(ibgeFile)).map((x) => [String(x.id), x.nome]))
    : null;
  if (!ibge) avisos.push('lista de municípios do IBGE ausente em data-raw/: grafia × IBGE não conferida');
  let municipios = 0;
  let divergentes = 0;
  for (const [uf, ds] of datasets) {
    const ufl = uf.toLowerCase();
    const cs = await readRaw<TseSecoesConfig>(paths.secoes(ufl));
    const csMun = new Map(cs.abr[0].mu.map((m) => [m.cd, m]));
    for (const m of ds.municipios) {
      const ctx = `[${uf} ${m.cod} ${m.nome}] bruto`;
      municipios++;
      conferirResultado(`${ctx} Presidente`, m.t1, await readRaw<TseResultado>(resPresMun(ufl, m.cod)), m.cod);
      if (m.t1gov) conferirResultado(`${ctx} Governador`, m.t1gov, await readRaw<TseResultado>(resGovMun(ufl, m.cod)), m.cod);
      // Seções ativas (sem as agregadas `nsp`), como conjunto exato de (zona, seção).
      const csm = csMun.get(m.cod);
      if (!check(!!csm, `${ctx}: ausente do arquivo de seções`)) continue;
      const tse = new Set<string>();
      for (const z of csm!.zon) for (const sec of z.sec) if (sec.nsp === undefined) tse.add(`${+z.cd}/${+sec.ns}`);
      const nosso = m.zonas.flatMap((z) => decodeFaixas(z.s).map((n) => `${z.z}/${n}`));
      check(nosso.length === tse.size && nosso.every((k) => tse.has(k)), `${ctx}: seções ≠ arquivo de urnas (${nosso.length} × ${tse.size})`);
      // Grafia: se o IBGE tem o mesmo nome (a menos de acentos/caixa/separadores), a exibição usa a grafia do IBGE.
      if (ibge && uf !== 'ZZ') {
        const oficial = ibge.get(m.ibge);
        if (!check(!!oficial, `${ctx}: código IBGE ${m.ibge} ausente da lista do IBGE`)) continue;
        if (chaveGrafia(oficial!) === chaveGrafia(m.nome)) {
          const esperado = oficial!.replace(/([\s-])D'(\p{L})/gu, (_, a: string, c: string) => `${a}d'${c}`);
          check(m.nome === esperado, `${ctx}: nome "${m.nome}" ≠ grafia oficial do IBGE "${esperado}"`);
        } else divergentes++;
      }
    }
  }
  console.log(
    `Município a município × data-raw/: ${fmt(municipios)} municípios/cidades (resultados de Presidente e Governador, ` +
      `seções)${ibge ? ` · nomes × IBGE: ${divergentes} nome(s) do TSE diferentes do IBGE mantidos (ver build-data)` : ''}`,
  );
}

async function lerJson<T>(f: string): Promise<T> {
  return JSON.parse(await readFile(f, 'utf8')) as T;
}

async function main() {
  const meta = await lerJson<DatasetMeta>(path.join(DATA_DIR, 'meta.json'));

  // ---------- Corridas ----------
  const ids = meta.races.map((r) => r.id);
  const govIds = UFS_GOV_2T.map((u) => `gov-${u.toLowerCase()}`);
  const esperadas = ['pres', ...govIds, 'pres-t1', ...govIds.map((g) => `${g}-t1`)];
  check(ids.join() === esperadas.join(), `corridas ${ids} ≠ esperadas ${esperadas}`);
  const race = new Map(meta.races.map((r) => [r.id, r]));
  checkRace(race.get('pres')!, 'pres', 2, 'BR');
  checkRace(race.get('pres-t1')!, 'pres-t1', 1, 'BR');
  for (const uf of UFS_GOV_2T) {
    const id = `gov-${uf.toLowerCase()}`;
    checkRace(race.get(id)!, id, 2, uf);
    checkRace(race.get(`${id}-t1`)!, `${id}-t1`, 1, uf);
    const [a, b] = [race.get(id)!, race.get(`${id}-t1`)!].map((r) => r.candidatos.slice(0, 2).map((c) => c.numero).join());
    check(a === b, `${id}: finalistas do 2º turno ≠ da corrida -t1`);
  }
  const pa = race.get('pres')!.candidatos.map((c) => c.numero).join();
  check(pa === race.get('pres-t1')!.candidatos.slice(0, 2).map((c) => c.numero).join(), 'pres: finalistas ≠ pres-t1');

  // ---------- UFs ----------
  check(meta.ufs.map((u) => u.uf).join() === TODAS.join(), 'meta.ufs fora da ordem canônica (27 UFs + ZZ)');
  const numerosPres = Object.keys(
    (await lerJson<UfDataset>(path.join(DATA_DIR, 'uf', 'df.json'))).municipios[0].t1.votos,
  )
    .sort((a, b) => +a - +b)
    .join();

  const br = novaSoma();
  const datasets = new Map<UF, UfDataset>();
  const somasUf = new Map<UF, { pres: Soma; gov: Soma | null }>();
  const tabela: string[] = [];
  let totalMun = 0;
  let totalZonas = 0;
  let bytes = 0;

  for (const um of meta.ufs) {
    const uf = um.uf;
    const ctx = `[${uf}]`;
    const file = path.join(DATA_DIR, 'uf', `${uf.toLowerCase()}.json`);
    if (!check(existsSync(file), `${ctx} arquivo ausente: ${file}`)) continue;
    const txt = await readFile(file, 'utf8');
    bytes += (await stat(file)).size;
    check(!txt.includes('\n'), `${ctx} JSON não minificado`);
    const ds = JSON.parse(txt) as UfDataset;
    datasets.set(uf, ds);
    check(ds.uf === uf, `${ctx} campo uf = ${ds.uf}`);
    check(um.nome === UF_NOMES[uf] && um.regiao === UF_REGIAO[uf], `${ctx} nome/região`);
    check(ds.municipios.length === um.municipios, `${ctx} municípios ${ds.municipios.length} ≠ meta ${um.municipios}`);

    const temGov = UFS_GOV_2T.includes(uf);
    const govRace = temGov ? race.get(`gov-${uf.toLowerCase()}-t1`)! : null;
    let numerosGov: string | null = null;
    const pres = novaSoma();
    const gov = temGov ? novaSoma() : null;
    const cods = new Set<string>();
    const ibges = new Set<string>();
    const zonasUf = new Set<number>();
    const secoesVistas = new Set<string>();
    let capitais = 0;

    for (const m of ds.municipios) {
      const mctx = `${ctx} ${m.cod} ${m.nome}`;
      check(/^\d{5}$/.test(m.cod) && !cods.has(m.cod), `${mctx}: código TSE inválido/repetido`);
      cods.add(m.cod);
      if (uf === 'ZZ') check(m.ibge === '', `${mctx}: exterior com IBGE`);
      else {
        check(/^\d{7}$/.test(m.ibge) && m.ibge.startsWith(IBGE_UF[uf]) && !ibges.has(m.ibge), `${mctx}: IBGE ${m.ibge} inválido/repetido`);
        ibges.add(m.ibge);
      }
      check(m.nome.trim() !== '' && m.nome !== m.nome.toUpperCase(), `${mctx}: nome vazio ou em CAIXA ALTA`);
      check(m.nome === m.nome.trim().replace(/\s+/g, ' '), `${mctx}: espaços sobrando no nome`);
      check(
        m.nome.split(/[\s-]/).every((w) => !ROMANO.test(w) || w === w.toUpperCase()),
        `${mctx}: numeral romano fora de maiúsculas`,
      );
      check(!/[\s-]D'/.test(m.nome), `${mctx}: partícula D' maiúscula no meio do nome`);
      if (uf === 'ZZ') {
        const esperado = PAIS_EXTERIOR[m.cod]?.[1] ?? undefined;
        check(!!PAIS_EXTERIOR[m.cod] && m.pais === esperado, `${mctx}: país ${m.pais} ≠ tabela ${esperado}`);
      } else check(m.pais === undefined, `${mctx}: país fora do exterior`);
      if (m.capital) {
        capitais++;
        check(um.capitalCod === m.cod, `${mctx}: capital ≠ meta.capitalCod ${um.capitalCod}`);
      }
      check(m.eleitorado === m.t1.eleitorado, `${mctx}: eleitorado ≠ t1.eleitorado`);

      // Zonas e seções.
      check(m.zonas.length > 0, `${mctx}: sem zonas`);
      let secoes = 0;
      let zAnterior = 0;
      for (const z of m.zonas) {
        check(Number.isInteger(z.z) && z.z > zAnterior, `${mctx}: zonas fora de ordem/repetidas`);
        zAnterior = z.z;
        zonasUf.add(z.z);
        const nums = decodeFaixas(z.s);
        check(nums.length > 0, `${mctx} z${z.z}: zona sem seções`);
        check(encodeFaixas(nums) === z.s, `${mctx} z${z.z}: faixas não canônicas`);
        for (let i = 0; i < nums.length; i++) {
          check(Number.isInteger(nums[i]) && nums[i] > 0 && (i === 0 || nums[i] > nums[i - 1]), `${mctx} z${z.z}: seção inválida ${nums[i]}`);
          const k = `${z.z}/${nums[i]}`;
          // (zona, seção) identifica a seção na UF: zonas podem abranger vários municípios.
          if (secoesVistas.has(k)) check(false, `${ctx}: seção ${k} repetida entre municípios`);
          secoesVistas.add(k);
        }
        secoes += nums.length;
      }

      checkResultado(`${mctx} t1`, m.t1, numerosPres);
      somar(pres, m.t1, secoes);
      if (gov) {
        if (!check(!!m.t1gov, `${mctx}: falta t1gov`)) continue;
        numerosGov ??= Object.keys(m.t1gov!.votos).sort((a, b) => +a - +b).join();
        checkResultado(`${mctx} t1gov`, m.t1gov!, numerosGov);
        check(m.t1gov!.eleitorado <= m.t1.eleitorado, `${mctx}: eleitorado Governador > Presidente`);
        somar(gov, m.t1gov!, secoes);
      } else check(m.t1gov === undefined, `${mctx}: t1gov fora das UFs com 2º turno`);
    }

    check(uf === 'ZZ' ? capitais === 0 && um.capitalCod === null : capitais === 1, `${ctx} ${capitais} capitais`);
    check(pres.secoes === um.secoes, `${ctx} Σ seções ${pres.secoes} ≠ meta ${um.secoes}`);
    check(pres.eleitorado === um.eleitorado, `${ctx} Σ eleitorado ≠ meta`);
    check(zonasUf.size === um.zonas, `${ctx} zonas ${zonasUf.size} ≠ meta ${um.zonas}`);
    if (govRace && gov) {
      for (const c of govRace.candidatos.filter((x) => !x.agregado)) {
        const v = gov.votos[String(c.numero)] ?? -1;
        check(c.primeiroTurno?.votos === v, `${ctx} ${c.nomeUrna}: primeiroTurno ${c.primeiroTurno?.votos} ≠ Σ municípios ${v}`);
        check(c.primeiroTurno?.pct === pct2(v, gov.validos), `${ctx} ${c.nomeUrna}: pct`);
      }
      const outros = govRace.candidatos[2].primeiroTurno!.votos;
      check(outros === gov.validos - govRace.candidatos[0].primeiroTurno!.votos - govRace.candidatos[1].primeiroTurno!.votos, `${ctx} Outros`);
      for (const r of [race.get(`gov-${uf.toLowerCase()}`)!]) {
        for (const c of r.candidatos) check(c.primeiroTurno?.votos === gov.votos[String(c.numero)], `${ctx} ${r.id} ${c.numero}: primeiroTurno`);
      }
    }
    somasUf.set(uf, { pres, gov });
    br.secoes += pres.secoes;
    br.eleitorado += pres.eleitorado;
    br.comparecimento += pres.comparecimento;
    br.brancos += pres.brancos;
    br.nulos += pres.nulos;
    br.validos += pres.validos;
    for (const [n, v] of Object.entries(pres.votos)) br.votos[n] = (br.votos[n] ?? 0) + v;
    totalMun += ds.municipios.length;
    totalZonas += zonasUf.size;
    tabela.push(
      `${uf}  ${String(ds.municipios.length).padStart(5)} ${String(zonasUf.size).padStart(5)} ${String(pres.secoes).padStart(8)} ` +
        `${fmt(pres.eleitorado).padStart(12)} ${fmt(pres.comparecimento).padStart(12)} ${gov ? 'gov' : '   '}`,
    );

    // Cobertura das malhas (outro agente gera public/geo): só aviso.
    if (uf !== 'ZZ') {
      const geoFile = path.join(GEO_DIR, `${uf.toLowerCase()}.json`);
      if (existsSync(geoFile)) {
        try {
          const geo = await lerJson<{ municipios: Record<string, unknown> }>(geoFile);
          const chaves = new Set(Object.keys(geo.municipios ?? {}));
          const semGeo = [...ibges].filter((c) => !chaves.has(c));
          const semDado = [...chaves].filter((c) => !ibges.has(c));
          if (semGeo.length || semDado.length) {
            avisos.push(`${ctx} malha: ${semGeo.length} município(s) sem geometria (${semGeo.slice(0, 5)}), ${semDado.length} geometria(s) sem dado (${semDado.slice(0, 5)})`);
          }
        } catch (err) {
          avisos.push(`${ctx} malha ilegível: ${(err as Error).message}`);
        }
      } else avisos.push(`${ctx} malha ainda não gerada (public/geo/mun/${uf.toLowerCase()}.json)`);
    }
  }

  // ---------- Totais nacionais oficiais ----------
  const okBr = comparar('Brasil + exterior', br, { ...OFICIAL_BR, votos: { ...br.votos, ...OFICIAL_BR.votos } });
  const t = meta.totaisPrimeiroTurno;
  check(
    t.secoes === OFICIAL_BR.secoes && t.eleitorado === OFICIAL_BR.eleitorado && t.comparecimento === OFICIAL_BR.comparecimento &&
      t.validos === OFICIAL_BR.validos && t.brancos === OFICIAL_BR.brancos && t.nulos === OFICIAL_BR.nulos,
    'meta.totaisPrimeiroTurno ≠ totais oficiais',
  );
  for (const id of ['pres', 'pres-t1']) {
    const r = race.get(id)!;
    for (const c of r.candidatos) {
      const v = c.agregado ? br.validos - r.candidatos[0].primeiroTurno!.votos - r.candidatos[1].primeiroTurno!.votos : br.votos[String(c.numero)];
      check(c.primeiroTurno?.votos === v && c.primeiroTurno?.pct === pct2(v, br.validos), `${id} ${c.nomeUrna}: primeiroTurno ≠ Σ nacional`);
    }
  }
  check(totalMun === 5757, `municípios + cidades do exterior: ${totalMun} ≠ 5.757`);
  check(meta.ufs.reduce((s, u) => s + u.secoes, 0) === OFICIAL_BR.secoes, 'Σ meta.ufs.secoes ≠ oficial');

  // ---------- Totais oficiais por UF ----------
  const temRaw = existsSync(rawPath(resPresBr()));
  const snapshot = existsSync(OFICIAL_FILE)
    ? (await lerJson<{ totais: Record<string, { presidente: Oficial; governador?: Oficial }> }>(OFICIAL_FILE)).totais
    : null;
  let fonteUf = '';
  if (temRaw) {
    fonteUf = 'arquivos agregados do TSE em data-raw/';
    const brRes = lerResultado(await readRaw<TseResultado>(resPresBr()), 'BR');
    comparar('Brasil (arquivo nacional)', br, brRes);
    if (snapshot) comparar('instantâneo oficial-t1.json (BR)', br, snapshot.BR.presidente);
    for (const [uf, s] of somasUf) {
      const ufl = uf.toLowerCase();
      const res = lerResultado(await readRaw<TseResultado>(resPresUf(ufl)), `${uf} UF`);
      comparar(`[${uf}] Presidente: Σ municípios × arquivo da UF`, s.pres, res);
      const ab = await readRaw<TseAbrangencia>(paths.abrangencia(ufl));
      const abUf = ab.abr.find((x) => x.tpabr === 'uf');
      check(
        !!abUf && +abUf.s.ts === s.pres.secoes && +abUf.e.te === s.pres.eleitorado && +abUf.e.c === s.pres.comparecimento,
        `[${uf}] Σ municípios × abrangência da UF (seções/eleitorado/comparecimento)`,
      );
      if (snapshot) comparar(`[${uf}] instantâneo oficial-t1.json`, s.pres, snapshot[uf].presidente);
      if (s.gov) {
        const g = lerResultado(await readRaw<TseResultado>(resGovUf(ufl)), `${uf} Gov UF`);
        comparar(`[${uf}] Governador: Σ municípios × arquivo da UF`, s.gov, g);
        if (snapshot) comparar(`[${uf}] instantâneo oficial-t1.json (Gov)`, s.gov, snapshot[uf].governador!);
      }
    }
    await conferirMunicipios(datasets);
    await conferirCandidatos(race);
  } else if (snapshot) {
    fonteUf = 'instantâneo scripts/data/lib/oficial-t1.json (data-raw/ ausente)';
    comparar('Brasil (instantâneo)', br, snapshot.BR.presidente);
    for (const [uf, s] of somasUf) {
      comparar(`[${uf}] Presidente: Σ municípios × oficial`, s.pres, snapshot[uf].presidente);
      if (s.gov) comparar(`[${uf}] Governador: Σ municípios × oficial`, s.gov, snapshot[uf].governador!);
    }
  } else {
    check(false, 'sem fonte oficial por UF: nem data-raw/ nem scripts/data/lib/oficial-t1.json');
  }

  if (!temRaw) avisos.push('data-raw/ ausente: conferência município a município e de nomes × IBGE não executada');

  // ---------- Relatório ----------
  console.log('UF  mun. zonas   seções   eleitorado  comparecim.');
  console.log(tabela.join('\n'));
  console.log(
    `\nTotal: ${fmt(totalMun)} municípios/cidades · ${fmt(totalZonas)} zonas (por UF) · ${fmt(br.secoes)} seções · ` +
      `eleitorado ${fmt(br.eleitorado)} · comparecimento ${fmt(br.comparecimento)} · válidos ${fmt(br.validos)} · ` +
      `brancos ${fmt(br.brancos)} · nulos ${fmt(br.nulos)}`,
  );
  console.log(
    `Presidente 1T: ${race.get('pres')!.candidatos.map((c) => `${c.nomeUrna} ${fmt(br.votos[String(c.numero)])} (${c.primeiroTurno!.pct.toFixed(2).replace('.', ',')}%)`).join(' · ')}`,
  );
  console.log(`Dataset: ${(bytes / 1024 / 1024).toFixed(2)} MB em 28 arquivos de UF · totais por UF conferidos com: ${fonteUf}`);
  console.log(`Totais nacionais oficiais: ${okBr ? 'OK' : 'DIVERGENTES'}`);
  for (const a of avisos) console.log(`aviso: ${a}`);
  if (falhas.length) {
    console.error(`\n✗ ${falhas.length} de ${verificacoes} verificações falharam:`);
    for (const f of falhas.slice(0, 50)) console.error(`  - ${f}`);
    if (falhas.length > 50) console.error(`  … e mais ${falhas.length - 50}`);
    process.exit(1);
  }
  console.log(`\n✓ ${fmt(verificacoes)} verificações, 100% OK`);
}

main().catch((err) => {
  console.error(`✗ validate falhou: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
