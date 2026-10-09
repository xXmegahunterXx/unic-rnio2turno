/**
 * Compila o dataset da apuração a partir do feed oficial do TSE já baixado em `data-raw/tse/`
 * (rode antes `npx tsx scripts/data/fetch-tse.ts`).
 *
 *   npx tsx scripts/data/build-data.ts
 *
 * Saídas (tipos em src/shared/dataset.ts):
 *   public/data/meta.json        DatasetMeta (corridas, candidatos, UFs, totais nacionais do 1º turno)
 *   public/data/uf/{uf}.json     UfDataset, 27 UFs + 'zz' (exterior), JSON minificado
 *   scripts/data/lib/oficial-t1.json  totais OFICIAIS por UF (arquivos agregados do TSE), usados pelo validate.ts
 *                                     quando data-raw/ não está disponível
 *
 * Convenções (ver também ARCHITECTURE.md §1 e §4):
 *  - Candidatos ordenados pelo número na urna; cor 'a' = menor número, 'b' = maior.
 *  - Corridas de 2º turno ('pres', 'gov-xx'): exatamente os 2 finalistas.
 *  - Corridas de 1º turno ('pres-t1', 'gov-xx-t1'): [finalista de menor nº (cor 'a'), finalista de maior nº
 *    (cor 'b'), pseudo-candidato { nomeUrna: 'Outros', numero: 0, cor: 'outros', agregado: true }].
 *    "Outros" vem SEMPRE por último (apesar do número 0) e soma os votos válidos de todos os demais candidatos.
 *    Assim o índice 0/1 de um candidato é o mesmo no 1º e no 2º turno.
 *  - `primeiroTurno.pct` = votos ÷ válidos computados (`vvc`) × 100 com 2 casas — exatamente o `pvap` publicado
 *    pelo TSE (conferido). Votos "Anulado sub judice" entram em `votos` (ver scripts/data/lib/resultado.ts).
 *  - Nomes de municípios: grafia oficial do IBGE quando é o mesmo nome do TSE a menos de acentos/caixa/separadores
 *    (lib/nomes.ts → nomeMunicipio); nomes realmente diferentes ficam como no TSE e são listados no relatório.
 *  - Exterior: o feed não traz o país das cidades; `pais` vem da tabela editorial lib/exterior.ts (conferida contra o
 *    nome do feed; o build para se surgir cidade nova).
 *  - Seções: só as ativas, isto é, as que NÃO têm `nsp` (agregadas a outra seção). Seções sem `da` (não
 *    instaladas no 1º turno — 41 seções, todas no exterior) CONTAM: o TSE as inclui em `s.ts` e o eleitorado delas
 *    está em `e.te`. Com isso, seções ativas por município = `s.ts` exatamente.
 *  - Nada é ajustado para "fechar": qualquer divergência entre o feed e as somas interrompe o build.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DatasetMeta, MunicipioDataset, UfDataset, UfMeta } from '../../src/shared/dataset';
import type { Candidate, Race, UF } from '../../src/shared/types';
import { UFS } from '../../src/shared/types';
import { UF_NOMES, UF_REGIAO, UFS_GOV_2T } from '../../src/shared/constants';
import { encodeFaixas } from '../../src/shared/calc';
import { ROOT, readRaw, readRawOpcional } from './lib/cache';
import {
  CARGO_GOV,
  CARGO_PRES,
  CICLO,
  ELE_GOV_T1,
  ELE_GOV_T2,
  ELE_PRES_T1,
  ELE_PRES_T2,
  PLEITO_T1,
  PLEITO_T2,
  TSE_BASE,
  ibgeMunicipios,
  paths,
  resGovMun,
  resGovUf,
  resGovUfT2,
  resPresBr,
  resPresBrT2,
  resPresMun,
  resPresUf,
} from './lib/tse-feed';
import {
  candidatosDe,
  int,
  type TseAbrangencia,
  type TseMunicipiosConfig,
  type TseResultado,
  type TseSecoesConfig,
} from './lib/tse-types';
import { lerResultado, paraDataset, pct2, Totais, type ResultadoLido } from './lib/resultado';
import { composicao, nomeColigacao, nomeLugar, nomeMunicipio, nomePessoa, sigla } from './lib/nomes';
import { paisExterior } from './lib/exterior';

const OUT_DIR = path.join(ROOT, 'public', 'data');
const OUT_UF = path.join(OUT_DIR, 'uf');
const OFICIAL_FILE = path.join(ROOT, 'scripts', 'data', 'lib', 'oficial-t1.json');
const DATASET_VERSAO = 1;

/** Ordem canônica: 27 UFs (ordem de src/shared/types.ts) + exterior. */
const TODAS: UF[] = [...UFS, 'ZZ'];
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

const fail = (msg: string): never => {
  throw new Error(msg);
};

interface UfBuild {
  uf: UF;
  dataset: UfDataset;
  meta: UfMeta;
  pres: Totais;
  gov: Totais | null;
}

/** Totais oficiais de uma abrangência, direto do arquivo agregado do TSE (não da soma). */
function oficial(r: ResultadoLido) {
  return {
    secoes: r.secoes,
    eleitorado: r.eleitorado,
    comparecimento: r.comparecimento,
    validos: r.validos,
    ...(r.subJudice ? { anuladosSubJudice: r.subJudice } : {}),
    brancos: r.brancos,
    nulos: r.nulos,
    votos: r.votos,
  };
}

/** Nomes que o build ajustou pela grafia do IBGE e nomes TSE × IBGE realmente diferentes (para o relatório). */
const nomesAjustados: string[] = [];
const nomesDivergentes: string[] = [];

async function construirUf(
  ufLower: string,
  cmUf: TseMunicipiosConfig['abr'][number],
  oficiais: Record<string, unknown>,
  nomesIbge: Map<string, string>,
) {
  const uf = ufLower.toUpperCase() as UF;
  const temGov = UFS_GOV_2T.includes(uf);

  const cs = await readRaw<TseSecoesConfig>(paths.secoes(ufLower));
  const ab = await readRaw<TseAbrangencia>(paths.abrangencia(ufLower));
  if (cs.abr.length !== 1 || cs.abr[0].cd !== ufLower) fail(`[${uf}] arquivo de seções inesperado`);
  const csMun = new Map(cs.abr[0].mu.map((m) => [m.cd, m]));
  const abMun = new Map(ab.abr.filter((x) => x.tpabr === 'mun').map((x) => [x.cdabr, x]));
  const abUf = ab.abr.find((x) => x.tpabr === 'uf') ?? fail(`[${uf}] ab sem total da UF`);
  if (csMun.size !== cmUf.mu.length || abMun.size !== cmUf.mu.length) {
    fail(`[${uf}] nº de municípios difere: cm ${cmUf.mu.length}, cs ${csMun.size}, ab ${abMun.size}`);
  }

  const pres = new Totais();
  const gov = temGov ? new Totais() : null;
  const zonasUf = new Set<number>();
  const municipios: MunicipioDataset[] = [];
  let capitais = 0;
  let capitalCod: string | null = null;
  let semInstalacao = 0;
  let semVotos = 0;

  for (const m of cmUf.mu) {
    const ctx = `${uf} ${m.cd} ${m.nm}`;
    const csm = csMun.get(m.cd) ?? fail(`[${ctx}] ausente do arquivo de seções`);
    const abm = abMun.get(m.cd) ?? fail(`[${ctx}] ausente do arquivo de abrangência`);

    // Seções ativas por zona (sem as agregadas `nsp`).
    const zonas: { z: number; s: string }[] = [];
    let secoesAtivas = 0;
    let naoInstaladas = 0;
    for (const zon of csm.zon) {
      const z = int(zon.cd, 'zona');
      const ativas: number[] = [];
      const vistos = new Set<number>();
      for (const sec of zon.sec) {
        const ns = int(sec.ns, 'seção');
        if (vistos.has(ns)) fail(`[${ctx}] seção ${z}/${ns} repetida`);
        vistos.add(ns);
        if (sec.nsp !== undefined) {
          if (sec.da) fail(`[${ctx}] seção agregada ${z}/${ns} com data de instalação`);
          continue;
        }
        if (!sec.da) naoInstaladas++;
        ativas.push(ns);
      }
      if (ativas.length === 0) continue; // zona só com seções agregadas (não ocorre em 2026, mas é tratado)
      ativas.sort((a, b) => a - b);
      zonas.push({ z, s: encodeFaixas(ativas) });
      secoesAtivas += ativas.length;
      zonasUf.add(z);
    }
    zonas.sort((a, b) => a.z - b.z);
    const zonasCm = m.z.map((z) => int(z, 'zona cm')).sort((a, b) => a - b);
    if (zonasCm.join() !== zonas.map((x) => x.z).join()) {
      fail(`[${ctx}] zonas do cm (${zonasCm}) ≠ zonas com seções ativas (${zonas.map((x) => x.z)})`);
    }

    // Resultado de Presidente (1º turno) no município.
    const u = await readRaw<TseResultado>(resPresMun(ufLower, m.cd));
    if (u.cdabr !== m.cd || u.ele !== ELE_PRES_T1) fail(`[${ctx}] arquivo de resultado não corresponde`);
    const t1 = lerResultado(u, `${ctx} Presidente`);
    if (t1.secoes !== secoesAtivas) fail(`[${ctx}] seções ativas ${secoesAtivas} ≠ s.ts ${t1.secoes}`);
    if (int(u.s.sni, 's.sni') !== naoInstaladas) fail(`[${ctx}] não instaladas ${naoInstaladas} ≠ s.sni ${u.s.sni}`);
    if (int(abm.s.ts, 'ab ts') !== t1.secoes || int(abm.e.te, 'ab te') !== t1.eleitorado || int(abm.e.c, 'ab c') !== t1.comparecimento) {
      fail(`[${ctx}] arquivo de abrangência diverge do resultado`);
    }
    if (naoInstaladas === secoesAtivas) semInstalacao++;
    else if (t1.comparecimento === 0) semVotos++;
    pres.add(t1);

    let nome: string;
    let pais: string | undefined;
    if (uf === 'ZZ') {
      if (m.cdi !== '') fail(`[${ctx}] cidade do exterior com código IBGE`);
      nome = nomeLugar(m.nm);
      pais = paisExterior(m.cd, m.nm);
    } else {
      if (!/^\d{7}$/.test(m.cdi) || m.cdi.slice(0, 2) === '00') fail(`[${ctx}] código IBGE inválido: ${m.cdi}`);
      const nomeIbge = nomesIbge.get(m.cdi) ?? fail(`[${ctx}] código IBGE ${m.cdi} ausente da lista de municípios do IBGE`);
      const r = nomeMunicipio(m.nm, nomeIbge);
      nome = r.nome;
      if (r.origem === 'tse-divergente') nomesDivergentes.push(`${uf} ${m.cdi} TSE "${nome}" × IBGE "${nomeIbge}"`);
      else if (nome !== nomeLugar(m.nm)) nomesAjustados.push(`${uf} "${nomeLugar(m.nm)}" → "${nome}"`);
    }
    const mun: MunicipioDataset = {
      cod: m.cd,
      ibge: m.cdi,
      nome,
      capital: m.c === 's',
      ...(pais ? { pais } : {}),
      eleitorado: t1.eleitorado,
      zonas,
      t1: paraDataset(t1),
    };
    if (!/^\d{5}$/.test(m.cd)) fail(`[${ctx}] código TSE inválido`);
    if (mun.capital) {
      capitais++;
      capitalCod = m.cd;
    }

    if (gov) {
      const ug = await readRaw<TseResultado>(resGovMun(ufLower, m.cd));
      if (ug.cdabr !== m.cd || ug.ele !== ELE_GOV_T1) fail(`[${ctx}] arquivo de Governador não corresponde`);
      const tg = lerResultado(ug, `${ctx} Governador`);
      if (tg.secoes !== t1.secoes) fail(`[${ctx}] seções Governador ${tg.secoes} ≠ Presidente ${t1.secoes}`);
      // Eleitores em trânsito fora da UF votam só para Presidente: eleitorado/comparecimento de Governador ≤ Presidente.
      if (tg.eleitorado > t1.eleitorado || tg.comparecimento > t1.comparecimento) {
        fail(`[${ctx}] Governador com eleitorado/comparecimento maior que Presidente`);
      }
      gov.add(tg);
      mun.t1gov = paraDataset(tg);
    }
    municipios.push(mun);
  }

  if (uf === 'ZZ' ? capitais !== 0 : capitais !== 1) fail(`[${uf}] ${capitais} capitais`);
  municipios.sort((a, b) => collator.compare(a.nome, b.nome) || a.cod.localeCompare(b.cod));

  // Soma dos municípios = arquivos agregados oficiais da UF (resultado e abrangência).
  const ufRes = lerResultado(await readRaw<TseResultado>(resPresUf(ufLower)), `${uf} Presidente (UF)`);
  const d = pres.diff(ufRes);
  if (d.length) fail(`[${uf}] Σ municípios ≠ arquivo da UF (Presidente): ${d.join('; ')}`);
  if (int(abUf.s.ts, 'ab uf ts') !== pres.secoes || int(abUf.e.te, 'ab uf te') !== pres.eleitorado) {
    fail(`[${uf}] Σ municípios ≠ abrangência da UF`);
  }
  oficiais[uf] = { presidente: oficial(ufRes) };
  let govUfRes: ResultadoLido | null = null;
  if (gov) {
    govUfRes = lerResultado(await readRaw<TseResultado>(resGovUf(ufLower)), `${uf} Governador (UF)`);
    const dg = gov.diff(govUfRes);
    if (dg.length) fail(`[${uf}] Σ municípios ≠ arquivo da UF (Governador): ${dg.join('; ')}`);
    (oficiais[uf] as Record<string, unknown>).governador = oficial(govUfRes);
  }

  const meta: UfMeta = {
    uf,
    nome: UF_NOMES[uf],
    regiao: UF_REGIAO[uf],
    capitalCod,
    eleitorado: pres.eleitorado,
    secoes: pres.secoes,
    municipios: municipios.length,
    zonas: zonasUf.size,
  };
  return { build: { uf, dataset: { uf, municipios }, meta, pres, gov } as UfBuild, semInstalacao, semVotos };
}

// ---------------------------------------------------------------------------------------------
// Corridas e candidatos
// ---------------------------------------------------------------------------------------------

interface Finalista {
  numero: number;
  nomeUrna: string;
  nome: string;
  partido: string;
  coligacao?: string;
  composicao?: string;
  vice?: string;
}

/** Finalistas a partir de um arquivo do 1º turno (st = "2º turno") ou do 2º turno (todos os candidatos). */
function finalistas(r: TseResultado, de2oTurno: boolean, ctx: string): Finalista[] {
  const lista = candidatosDe(r).filter(({ cand }) => (de2oTurno ? true : cand.st === '2º turno'));
  if (lista.length !== 2) fail(`[${ctx}] esperados 2 finalistas, encontrados ${lista.length}`);
  return lista
    .map(({ cand, par, agr }) => {
      const f: Finalista = {
        numero: int(cand.n, 'número'),
        nomeUrna: nomePessoa(cand.nmu),
        nome: nomePessoa(cand.nm),
        partido: sigla(par.sg),
      };
      if (agr.tp !== 'i') {
        // Coligação ('c') ou federação: nome e composição; partido isolado ('i') não tem coligação.
        f.coligacao = nomeColigacao(agr.nm);
        f.composicao = composicao(agr.com);
      }
      const vice = cand.vs?.find((v) => v.tp === 'v') ?? cand.vs?.[0];
      if (vice) f.vice = nomePessoa(vice.nmu);
      return f;
    })
    .sort((a, b) => a.numero - b.numero);
}

function candidatosDaCorrida(fin: Finalista[], tot: Totais, comOutros: boolean): Candidate[] {
  const cands: Candidate[] = fin.map((f, i) => {
    const votos = tot.votos[String(f.numero)] ?? fail(`candidato ${f.numero} sem votos no 1º turno`);
    return { ...f, cor: i === 0 ? 'a' : 'b', primeiroTurno: { votos, pct: pct2(votos, tot.validos) } };
  });
  if (comOutros) {
    const outros = tot.validos - cands[0].primeiroTurno!.votos - cands[1].primeiroTurno!.votos;
    cands.push({
      numero: 0,
      nomeUrna: 'Outros',
      nome: 'Demais candidatos do 1º turno',
      partido: '',
      cor: 'outros',
      agregado: true,
      primeiroTurno: { votos: outros, pct: pct2(outros, tot.validos) },
    });
  }
  return cands;
}

/** Confere o pct calculado com o `pvap` publicado pelo TSE no arquivo agregado. */
function conferirPct(cands: Candidate[], r: TseResultado, ctx: string) {
  const pvap = new Map(candidatosDe(r).map(({ cand }) => [int(cand.n, 'n'), Number(cand.pvap.replace(',', '.'))]));
  for (const c of cands) {
    if (c.agregado) continue;
    if (pvap.get(c.numero) !== c.primeiroTurno!.pct) {
      fail(`[${ctx}] pct de ${c.numero}: calculado ${c.primeiroTurno!.pct} ≠ TSE ${pvap.get(c.numero)}`);
    }
  }
}

async function main() {
  const t0 = Date.now();
  const cm = await readRaw<TseMunicipiosConfig>(paths.municipios());
  const porUf = new Map(cm.abr.map((a) => [a.cd, a]));
  if (porUf.size !== 28) fail(`esperadas 28 abrangências no cm, há ${porUf.size}`);

  // Nomes oficiais do IBGE (referência de grafia): código de 7 dígitos → nome.
  const listaIbge = await readRaw<{ id: number; nome: string }[]>(ibgeMunicipios());
  const nomesIbge = new Map(listaIbge.map((x) => [String(x.id), x.nome]));
  if (nomesIbge.size < 5570) fail(`lista de municípios do IBGE incompleta (${nomesIbge.size})`);

  const oficiais: Record<string, unknown> = {};
  const builds: UfBuild[] = [];
  let semInstalacao = 0;
  let semVotos = 0;
  for (const uf of TODAS) {
    const a = porUf.get(uf.toLowerCase()) ?? fail(`UF ${uf} ausente do cm`);
    const r = await construirUf(uf.toLowerCase(), a, oficiais, nomesIbge);
    builds.push(r.build);
    semInstalacao += r.semInstalacao;
    semVotos += r.semVotos;
  }

  // Brasil (27 UFs + exterior) = arquivo nacional oficial.
  const br = new Totais();
  for (const b of builds) br.add(b.pres);
  const brFile = await readRaw<TseResultado>(resPresBr());
  const brRes = lerResultado(brFile, 'BR Presidente');
  const dbr = br.diff(brRes);
  if (dbr.length) fail(`Σ UFs + ZZ ≠ arquivo nacional: ${dbr.join('; ')}`);
  oficiais.BR = { presidente: oficial(brRes) };

  // ----- Corridas -----
  const races2t: Race[] = [];
  const races1t: Race[] = [];
  const avisos: string[] = [];

  // Presidente: candidatos do arquivo do 2º turno (já publicado), conferidos com os finalistas do 1º turno.
  const fin1Pres = finalistas(brFile, false, 'Presidente 1T');
  const pres2tFile = await readRawOpcional<TseResultado>(resPresBrT2());
  let finPres = fin1Pres;
  if (pres2tFile) {
    finPres = finalistas(pres2tFile, true, 'Presidente 2T');
    if (finPres.map((f) => f.numero).join() !== fin1Pres.map((f) => f.numero).join()) {
      fail(`finalistas do 2º turno (${finPres.map((f) => f.numero)}) ≠ 1º turno (${fin1Pres.map((f) => f.numero)})`);
    }
  } else {
    avisos.push('Arquivo do 2º turno de Presidente ausente; candidatos derivados do 1º turno.');
  }
  const presCands = candidatosDaCorrida(finPres, br, false);
  const presCandsT1 = candidatosDaCorrida(fin1Pres, br, true);
  conferirPct(presCands, brFile, 'Presidente');
  races2t.push({
    id: 'pres',
    cargo: 'Presidente',
    turno: 2,
    abrangencia: 'BR',
    titulo: 'Presidente',
    candidatos: presCands,
    ufs: TODAS,
    tse: { ciclo: CICLO, eleicao: ELE_PRES_T2, cargo: CARGO_PRES, pleito: PLEITO_T2 },
  });
  races1t.push({
    id: 'pres-t1',
    cargo: 'Presidente',
    turno: 1,
    abrangencia: 'BR',
    titulo: 'Presidente · 1º turno',
    candidatos: presCandsT1,
    ufs: TODAS,
    tse: { ciclo: CICLO, eleicao: ELE_PRES_T1, cargo: CARGO_PRES, pleito: PLEITO_T1 },
  });

  // Governadores (7 UFs com 2º turno).
  for (const uf of UFS_GOV_2T) {
    const ufLower = uf.toLowerCase();
    const b = builds.find((x) => x.uf === uf)!;
    const govFile = await readRaw<TseResultado>(resGovUf(ufLower));
    const fin1 = finalistas(govFile, false, `Governador ${uf} 1T`);
    const gov2tFile = await readRawOpcional<TseResultado>(resGovUfT2(ufLower));
    let fin = fin1;
    let origem = '1º turno (st = "2º turno")';
    if (gov2tFile) {
      fin = finalistas(gov2tFile, true, `Governador ${uf} 2T`);
      if (fin.map((f) => f.numero).join() !== fin1.map((f) => f.numero).join()) {
        fail(`[${uf}] finalistas do 2º turno ≠ 1º turno`);
      }
      origem = `arquivo do 2º turno (${ELE_GOV_T2})`;
    }
    const cands = candidatosDaCorrida(fin, b.gov!, false);
    const candsT1 = candidatosDaCorrida(fin1, b.gov!, true);
    conferirPct(cands, govFile, `Governador ${uf}`);
    console.log(`  gov-${ufLower}: ${cands.map((c) => `${c.numero} ${c.nomeUrna} (${c.partido})`).join(' × ')} · candidatos de: ${origem}`);
    races2t.push({
      id: `gov-${ufLower}`,
      cargo: 'Governador',
      turno: 2,
      abrangencia: uf,
      titulo: `Governador · ${UF_NOMES[uf]}`,
      candidatos: cands,
      ufs: [uf],
      tse: { ciclo: CICLO, eleicao: ELE_GOV_T2, cargo: CARGO_GOV, pleito: PLEITO_T2 },
    });
    races1t.push({
      id: `gov-${ufLower}-t1`,
      cargo: 'Governador',
      turno: 1,
      abrangencia: uf,
      titulo: `Governador · ${UF_NOMES[uf]} · 1º turno`,
      candidatos: candsT1,
      ufs: [uf],
      tse: { ciclo: CICLO, eleicao: ELE_GOV_T1, cargo: CARGO_GOV, pleito: PLEITO_T1 },
    });
  }

  const meta: DatasetMeta = {
    versao: DATASET_VERSAO,
    geradoEm: new Date().toISOString(),
    fonte:
      'TSE — resultados oficiais do 1º turno das Eleições Gerais de 04/10/2026 (pleito 3220): ' +
      `Presidente (eleição ${ELE_PRES_T1}) e Governador (eleição ${ELE_GOV_T1}) por município; ` +
      `estrutura de zonas e seções do arquivo de urnas (${PLEITO_T1}); candidatos do 2º turno de 25/10/2026 ` +
      `(eleições ${ELE_PRES_T2} e ${ELE_GOV_T2}). ` +
      `URLs: ${TSE_BASE}/${paths.municipios()} · ${TSE_BASE}/${CICLO}/arquivo-urna/${PLEITO_T1}/config/{uf}/{uf}-p00${PLEITO_T1}-cs.json · ` +
      `${TSE_BASE}/${CICLO}/${ELE_PRES_T1}/dados/{uf}/{uf}{mun}-c0001-e00${ELE_PRES_T1}-u.json · ` +
      `${TSE_BASE}/${CICLO}/${ELE_GOV_T1}/dados/{uf}/{uf}{mun}-c0003-e00${ELE_GOV_T1}-u.json · ` +
      `${TSE_BASE}/${resPresBrT2()}. ` +
      'Malhas municipais e grafia oficial dos nomes dos municípios: IBGE (servicodados.ibge.gov.br/api/v4/malhas e ' +
      'api/v1/localidades/municipios).',
    races: [...races2t, ...races1t],
    ufs: builds.map((b) => b.meta),
    totaisPrimeiroTurno: {
      secoes: br.secoes,
      eleitorado: br.eleitorado,
      comparecimento: br.comparecimento,
      brancos: br.brancos,
      nulos: br.nulos,
      validos: br.validos,
    },
  };

  // ----- Gravação -----
  await mkdir(OUT_UF, { recursive: true });
  // Mantém `geradoEm` se nada mudou (rebuild idempotente → sem diff no git).
  const metaPath = path.join(OUT_DIR, 'meta.json');
  if (existsSync(metaPath)) {
    try {
      const antigo = JSON.parse(await readFile(metaPath, 'utf8')) as DatasetMeta;
      const semData = (m: DatasetMeta) => JSON.stringify({ ...m, geradoEm: '' });
      const ufsIguais = await Promise.all(
        builds.map(async (b) => {
          const f = path.join(OUT_UF, `${b.uf.toLowerCase()}.json`);
          return existsSync(f) && (await readFile(f, 'utf8')) === JSON.stringify(b.dataset);
        }),
      );
      if (semData(antigo) === semData(meta) && ufsIguais.every(Boolean)) meta.geradoEm = antigo.geradoEm;
    } catch {
      /* meta antigo ilegível: regrava */
    }
  }
  await writeFile(metaPath, `${JSON.stringify(meta, null, 1)}\n`);
  const esperados = new Set(builds.map((b) => `${b.uf.toLowerCase()}.json`));
  for (const f of await readdir(OUT_UF)) {
    if (f.endsWith('.json') && !esperados.has(f)) await rm(path.join(OUT_UF, f));
  }
  for (const b of builds) await writeFile(path.join(OUT_UF, `${b.uf.toLowerCase()}.json`), JSON.stringify(b.dataset));
  await writeFile(
    OFICIAL_FILE,
    `${JSON.stringify(
      {
        descricao:
          'Totais OFICIAIS do 1º turno 2026 lidos dos arquivos agregados do TSE (UF e Brasil), ' +
          'independentes da soma dos municípios. Gerado por scripts/data/build-data.ts; usado por validate.ts.',
        feed: { dg: brFile.dg, hg: brFile.hg },
        totais: oficiais,
      },
      null,
      1,
    )}\n`,
  );

  // ----- Relatório -----
  console.log('\nUF  municípios  zonas   seções   eleitorado    arquivo');
  let bytes = 0;
  for (const b of builds) {
    const f = path.join(OUT_UF, `${b.uf.toLowerCase()}.json`);
    const sz = (await stat(f)).size;
    bytes += sz;
    console.log(
      `${b.uf}  ${String(b.meta.municipios).padStart(10)} ${String(b.meta.zonas).padStart(6)} ${String(b.meta.secoes).padStart(8)} ` +
        `${String(b.meta.eleitorado).padStart(12)}  ${(sz / 1024).toFixed(1).padStart(7)} KB`,
    );
  }
  const metaSz = (await stat(metaPath)).size;
  console.log(
    `\nBrasil + exterior: ${builds.reduce((s, b) => s + b.meta.municipios, 0)} municípios/cidades · ` +
      `${br.secoes} seções · ${semInstalacao} município(s)/cidade(s) sem seção instalada no 1º turno e ` +
      `${semVotos} instalado(s) sem nenhum voto (comparecimento 0) · ` +
      `eleitorado ${br.eleitorado} · comparecimento ${br.comparecimento} · válidos ${br.validos}`,
  );
  console.log(`Arquivos: meta.json ${(metaSz / 1024).toFixed(1)} KB · uf/*.json ${(bytes / 1024 / 1024).toFixed(2)} MB (28 arquivos)`);
  console.log(`\nNomes ajustados pela grafia oficial do IBGE (${nomesAjustados.length}):`);
  for (const n of nomesAjustados) console.log(`  ${n}`);
  console.log(`Nomes TSE × IBGE diferentes, mantido o do TSE (${nomesDivergentes.length}):`);
  for (const n of nomesDivergentes) console.log(`  ${n}`);
  for (const a of avisos) console.log(`aviso: ${a}`);
  console.log(`✓ build-data em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error(`\n✗ build-data falhou: ${(err as Error).message}`);
  process.exit(1);
});
