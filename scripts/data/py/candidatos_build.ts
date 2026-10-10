/**
 * Fichas públicas dos candidatos (CandidatoFicha em src/shared/dataset.ts), a partir de:
 *   - feed oficial do TSE (nome, nome de urna, número, partido, coligação, vice/suplentes, votos e situação no 1º turno)
 *     — mesmo cache de cargos_build.ts (data-raw/tse/);
 *   - dados abertos consulta_cand_2026.zip (gênero, cor/raça, nascimento, ocupação, grau de instrução, estado civil,
 *     UF de nascimento, federação) e bem_candidato_2026.zip (bens declarados) — cache em data-raw/tse-abertos/.
 *
 *   npx tsx scripts/data/py/candidatos_build.ts            # baixa o que falta e gera os JSON
 *   npx tsx scripts/data/py/candidatos_build.ts --offline  # só o cache
 *
 * Saídas (JSON minificado):
 *   public/data/candidatos/{grupo}.json   { grupo, candidatos: CandidatoFicha[], aviso? }
 *     segundo-turno    Presidente e Governador (7 UFs) que disputam o 2º turno, cada um seguido do seu vice
 *     governadores     Governadores eleitos no 1º turno (20)
 *     senado           todos os candidatos ao Senado que estavam na urna (27 UFs)
 *     camara-{uf}      Deputados Federais ELEITOS na UF
 *     assembleia-{uf}  Deputados Estaduais (Distritais no DF) ELEITOS na UF
 *   public/data/candidatos/index.json     índice para busca e para a rota /candidato/:sqcand:
 *     { colunas: ['sqcand','nomeUrna','numero','partido','cargo','uf','grupo'], linhas: [...] }
 *
 * Regras:
 *  - Mesmos campos para todos (quando o TSE divulga o dado); nada de adjetivos; nenhum dado pessoal além do que o TSE
 *    publica na ficha do candidato (CPF, título e e-mail NÃO entram). Nome = `nm` do feed, que já traz o nome social
 *    quando há (o nome civil do CSV nunca é usado).
 *  - Grafia: finalistas do 2º turno e vices com lib/nomes.ts › nomePessoa (igual a meta.json); demais com nomeSimples.
 *  - Patrimônio = soma dos bens declarados (R$, centavos exatos) e nº de itens; sem bens → { total: 0, itens: 0 }.
 *    A soma por candidato é conferida contra os arquivos por UF (bem_candidato_2026_{UF}.csv), independentes do BRASIL.
 *  - Idade completa na data da eleição (04/10/2026). Naturalidade: o arquivo de 2026 só traz a UF de nascimento
 *    (não há município), então `naturalidade` = nome da UF ("Exterior" para ZZ).
 *  - `resultado`: votos, % dos válidos computados (= `pvap` do TSE) e situação no 1º turno, na UF (ou Brasil).
 *    Vices não têm `resultado`.
 *  - AM, deputados: a totalização foi reaberta pelo TSE ("Aguarde reprocessamento da eleição"); sem eleitos
 *    definidos, camara-am e assembleia-am saem vazios com `aviso`. Rode de novo quando o TSE concluir.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CandidatoFicha } from '../../../src/shared/dataset';
import { UFS, type UFBr } from '../../../src/shared/types';
import { UF_NOMES, UFS_GOV_2T } from '../../../src/shared/constants';
import { composicao as composicaoNomes, nomeColigacao, nomePessoa } from '../lib/nomes';
import {
  CARGO,
  PUBLIC_DATA,
  arqPresBr,
  arqPresBrT2,
  baixarAberto,
  cargoAssembleia,
  centavos,
  dataIso,
  ehEleito,
  fail,
  finalistasSq,
  garantirFeed,
  idadeEm,
  lerCargo,
  lerCargoUf,
  lerCsvZip,
  nomeFederacao,
  nomeSimples,
  readRaw,
  rotulo,
  siglaPartido,
  type CandLido,
  type CargoLido,
  type TseResultadoX,
  type TseViceX,
} from './candidatos_comum';

const OFFLINE = process.argv.includes('--offline');
const OUT = path.join(PUBLIC_DATA, 'candidatos');
const DATA_ELEICAO = '2026-10-04';
const ZIP_CAND = 'consulta_cand/consulta_cand_2026.zip';
const ZIP_BENS = 'bem_candidato/bem_candidato_2026.zip';

// ------------------------------------------------------------------------------------------------ dados abertos

interface LinhaCand {
  sq: string;
  cargo: string;
  uf: string;
  numero: string;
  partido: string;
  nascimento: string;
  ufNascimento: string;
  genero: string;
  corRaca: string;
  escolaridade: string;
  estadoCivil: string;
  ocupacao: string;
  nmFederacao: string;
}

async function lerConsultaCand(zip: string): Promise<Map<string, LinhaCand>> {
  const m = new Map<string, LinhaCand>();
  let linhas = 0;
  for await (const r of lerCsvZip(zip, 'consulta_cand_2026_BRASIL.csv')) {
    linhas++;
    const sq = r.SQ_CANDIDATO;
    if (!sq) fail(`consulta_cand: linha sem SQ_CANDIDATO`);
    // Finalistas aparecem 2× (1º e 2º turno) com os mesmos dados pessoais; fica a linha do 1º turno.
    if (m.has(sq) && r.NR_TURNO !== '1') continue;
    m.set(sq, {
      sq,
      cargo: r.DS_CARGO,
      uf: r.SG_UF,
      numero: r.NR_CANDIDATO,
      partido: r.SG_PARTIDO,
      nascimento: r.DT_NASCIMENTO,
      ufNascimento: r.SG_UF_NASCIMENTO,
      genero: r.DS_GENERO,
      corRaca: r.DS_COR_RACA,
      escolaridade: r.DS_GRAU_INSTRUCAO,
      estadoCivil: r.DS_ESTADO_CIVIL,
      ocupacao: r.DS_OCUPACAO,
      nmFederacao: r.NM_FEDERACAO,
    });
  }
  console.log(`✓ consulta_cand: ${linhas.toLocaleString('pt-BR')} linhas, ${m.size.toLocaleString('pt-BR')} candidaturas`);
  return m;
}

interface Bens {
  centavos: number;
  itens: number;
}

async function somarBens(zip: string, membro: string, alvo: Map<string, Bens>): Promise<{ linhas: number; centavos: number }> {
  let linhas = 0;
  let total = 0;
  const ordens = new Set<string>();
  for await (const r of lerCsvZip(zip, membro)) {
    linhas++;
    const chave = `${r.SQ_CANDIDATO}#${r.NR_ORDEM_BEM_CANDIDATO}`;
    if (ordens.has(chave)) fail(`${membro}: bem repetido ${chave}`);
    ordens.add(chave);
    const c = centavos(r.VR_BEM_CANDIDATO, `${membro} ${chave}`);
    total += c;
    const b = alvo.get(r.SQ_CANDIDATO) ?? { centavos: 0, itens: 0 };
    b.centavos += c;
    b.itens++;
    alvo.set(r.SQ_CANDIDATO, b);
  }
  return { linhas, centavos: total };
}

/** Bens do arquivo BRASIL, conferidos candidato a candidato contra a soma dos arquivos por UF + BR. */
async function lerBens(zip: string): Promise<{ bens: Map<string, Bens>; linhas: number; centavos: number }> {
  const bens = new Map<string, Bens>();
  const br = await somarBens(zip, 'bem_candidato_2026_BRASIL.csv', bens);
  const porUf = new Map<string, Bens>();
  let linhasUf = 0;
  let centUf = 0;
  for (const uf of ['BR', ...UFS]) {
    const r = await somarBens(zip, `bem_candidato_2026_${uf}.csv`, porUf);
    linhasUf += r.linhas;
    centUf += r.centavos;
  }
  if (linhasUf !== br.linhas || centUf !== br.centavos || porUf.size !== bens.size) {
    fail(`bem_candidato: BRASIL (${br.linhas} linhas) ≠ Σ UFs + BR (${linhasUf} linhas)`);
  }
  for (const [sq, b] of bens) {
    const u = porUf.get(sq);
    if (!u || u.centavos !== b.centavos || u.itens !== b.itens) fail(`bem_candidato: ${sq} diverge entre BRASIL e arquivo da UF`);
  }
  console.log(
    `✓ bem_candidato: ${br.linhas.toLocaleString('pt-BR')} bens de ${bens.size.toLocaleString('pt-BR')} candidaturas; ` +
      `soma por candidato idêntica no arquivo BRASIL e nos 28 arquivos por UF`,
  );
  return { bens, linhas: br.linhas, centavos: br.centavos };
}

// ------------------------------------------------------------------------------------------------ fichas

interface Ctx {
  cand: Map<string, LinhaCand>;
  bens: Map<string, Bens>;
  verificados: Set<string>;
  semBens: number;
}

const nomeDe = (ctx: Ctx, sq: string | undefined, nm: string) => (sq && ctx.verificados.has(sq) ? nomePessoa(nm) : nomeSimples(nm));

/** Campos pessoais (consulta_cand) + patrimônio (bem_candidato), conferindo número/partido/nascimento com o feed. */
function pessoais(ctx: Ctx, sq: string, feed: { numero?: number; partido: string; dt?: string }, onde: string) {
  const l = ctx.cand.get(sq) ?? fail(`[${onde}] sqcand ${sq} ausente de consulta_cand`);
  if (feed.numero !== undefined && Number(l.numero) !== feed.numero) fail(`[${onde}] número ${feed.numero} ≠ consulta_cand ${l.numero}`);
  if (siglaPartido(l.partido) !== siglaPartido(feed.partido)) fail(`[${onde}] partido ${feed.partido} ≠ consulta_cand ${l.partido}`);
  const nascimento = dataIso(l.nascimento);
  if (feed.dt && dataIso(feed.dt) !== nascimento) fail(`[${onde}] nascimento ${feed.dt} ≠ consulta_cand ${l.nascimento}`);
  const b = ctx.bens.get(sq);
  if (!b) ctx.semBens++;
  const ufNasc = l.ufNascimento.toUpperCase();
  const o: Partial<CandidatoFicha> = {
    genero: rotulo(l.genero),
    corRaca: rotulo(l.corRaca),
    idade: nascimento ? idadeEm(nascimento, DATA_ELEICAO) : undefined,
    nascimento,
    ocupacao: rotulo(l.ocupacao),
    escolaridade: rotulo(l.escolaridade),
    estadoCivil: rotulo(l.estadoCivil),
    naturalidade: ufNasc in UF_NOMES ? UF_NOMES[ufNasc as keyof typeof UF_NOMES] : undefined,
    patrimonio: { total: (b?.centavos ?? 0) / 100, itens: b?.itens ?? 0 },
  };
  return { o, linha: l };
}

/** Remove chaves undefined (JSON menor e estável). */
function limpo<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

function fichaTitular(ctx: Ctx, r: CargoLido, c: CandLido, uf: 'BR' | UFBr, grupo: string): CandidatoFicha {
  const onde = `${r.ctx} ${c.numero}`;
  const majoritario = r.cargo === CARGO.presidente || r.cargo === CARGO.governador || r.cargo === CARGO.senador;
  const fed = c.partido.nfed ? r.federacoes.find((f) => f.n === c.partido.nfed) ?? fail(`[${onde}] federação ${c.partido.nfed}`) : undefined;
  const { o } = pessoais(ctx, c.sqcand, { numero: c.numero, partido: c.partido.sg, dt: c.dt }, onde);
  const f: CandidatoFicha = {
    sqcand: c.sqcand,
    numero: c.numero,
    nomeUrna: nomeDe(ctx, c.sqcand, c.nmu),
    nome: nomeDe(ctx, c.sqcand, c.nm),
    partido: siglaPartido(c.partido.sg),
    federacao: fed ? nomeFederacao(fed.nm) : undefined,
    coligacao: majoritario && c.agr.tp === 'c' ? nomeColigacao(c.agr.nm) : undefined,
    composicao: majoritario && c.agr.tp !== 'i' ? composicaoNomes(c.agr.com) : undefined,
    cargo: r.nomeCargo,
    uf,
  };
  if (r.cargo === CARGO.presidente || r.cargo === CARGO.governador) {
    const v = c.vs.find((x) => x.tp === 'v') ?? fail(`[${onde}] sem vice no feed`);
    f.vice = { nome: nomeDe(ctx, v.sqcand, v.nmu), partido: siglaPartido(v.sgp), sqcand: v.sqcand };
  }
  if (r.cargo === CARGO.senador) {
    const sup = c.vs.filter((x) => x.tp === 's1' || x.tp === 's2').sort((a, b) => a.tp.localeCompare(b.tp));
    if (sup.length !== 2) fail(`[${onde}] ${sup.length} suplente(s) no feed`);
    f.suplentes = sup.map((x) => ({ nome: nomeDe(ctx, x.sqcand, x.nmu), partido: siglaPartido(x.sgp) }));
  }
  Object.assign(f, o);
  f.resultado = { votos: c.votos, pct: c.pct, situacao: c.situacao };
  f.fotoGrupo = grupo;
  return limpo(f);
}

function fichaVice(ctx: Ctx, r: CargoLido, titular: CandidatoFicha, c: CandLido, v: TseViceX, grupo: string): CandidatoFicha {
  const onde = `${r.ctx} vice de ${c.numero}`;
  if (!v.sqcand) fail(`[${onde}] vice sem sqcand`);
  const { o, linha } = pessoais(ctx, v.sqcand!, { partido: v.sgp }, onde);
  const cargoEsperado = r.cargo === CARGO.presidente ? 'VICE-PRESIDENTE' : 'VICE-GOVERNADOR';
  if (linha.cargo !== cargoEsperado) fail(`[${onde}] consulta_cand: cargo ${linha.cargo}`);
  const f: CandidatoFicha = {
    sqcand: v.sqcand!,
    numero: titular.numero,
    nomeUrna: nomeDe(ctx, v.sqcand, v.nmu),
    nome: nomeDe(ctx, v.sqcand, v.nm),
    partido: siglaPartido(v.sgp),
    federacao: linha.nmFederacao ? nomeFederacao(linha.nmFederacao) : undefined,
    coligacao: titular.coligacao,
    composicao: titular.composicao,
    cargo: r.cargo === CARGO.presidente ? 'Vice-Presidente' : 'Vice-Governador',
    uf: titular.uf,
  };
  Object.assign(f, o);
  f.fotoGrupo = grupo;
  return limpo(f);
}

// ------------------------------------------------------------------------------------------------ main

async function main() {
  const t0 = Date.now();
  await garantirFeed(OFFLINE);
  const zipCand = await baixarAberto(ZIP_CAND, OFFLINE);
  const zipBens = await baixarAberto(ZIP_BENS, OFFLINE);
  const cand = await lerConsultaCand(zipCand);
  const { bens, linhas: linhasBens, centavos: centBens } = await lerBens(zipBens);

  // Feed: Presidente (Brasil) e os cargos estaduais.
  const presFile = await readRaw<TseResultadoX>(arqPresBr());
  const pres = lerCargo(presFile, 'BR c1');
  const pres2t = await readRaw<TseResultadoX>(arqPresBrT2());
  const gov = new Map<UFBr, CargoLido>();
  const sen = new Map<UFBr, CargoLido>();
  const cam = new Map<UFBr, CargoLido>();
  const ass = new Map<UFBr, CargoLido>();
  for (const uf of UFS) {
    gov.set(uf, await lerCargoUf(uf, CARGO.governador));
    sen.set(uf, await lerCargoUf(uf, CARGO.senador));
    cam.set(uf, await lerCargoUf(uf, CARGO.depFederal));
    ass.set(uf, await lerCargoUf(uf, cargoAssembleia(uf)));
  }
  const ctx: Ctx = { cand, bens, verificados: finalistasSq([pres, ...gov.values()]), semBens: 0 };

  const grupos = new Map<string, { candidatos: CandidatoFicha[]; aviso?: string }>();

  // segundo-turno: Presidente + Governadores das 7 UFs, por número, cada titular seguido do vice.
  const st: CandidatoFicha[] = [];
  const corridas: [CargoLido, 'BR' | UFBr][] = [[pres, 'BR'], ...UFS_GOV_2T.map((uf): [CargoLido, UFBr] => [gov.get(uf as UFBr)!, uf as UFBr])];
  for (const [r, uf] of corridas) {
    const fin = r.candidatos.filter((c) => c.situacao === 'segundo-turno').sort((a, b) => a.numero - b.numero);
    if (fin.length !== 2) fail(`[${r.ctx}] ${fin.length} finalistas`);
    for (const c of fin) {
      const t = fichaTitular(ctx, r, c, uf, 'segundo-turno');
      st.push(t, fichaVice(ctx, r, t, c, c.vs.find((x) => x.tp === 'v')!, 'segundo-turno'));
    }
  }
  // Os candidatos do arquivo do 2º turno de Presidente (6258) são os mesmos sqcands.
  const sq2t = pres2t.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand.map((x) => x.sqcand))).sort().join();
  const sqFin = pres.candidatos.filter((c) => c.situacao === 'segundo-turno').map((c) => c.sqcand).sort().join();
  if (sq2t !== sqFin) fail(`sqcand do 2º turno de Presidente (${sq2t}) ≠ finalistas do 1º turno (${sqFin})`);
  grupos.set('segundo-turno', { candidatos: st });

  // governadores: eleitos no 1º turno.
  const govs: CandidatoFicha[] = [];
  for (const uf of UFS) {
    const r = gov.get(uf)!;
    for (const c of r.candidatos.filter((x) => x.situacao === 'eleito')) govs.push(fichaTitular(ctx, r, c, uf, 'governadores'));
  }
  grupos.set('governadores', { candidatos: govs });

  // senado: todos os candidatos que estavam na urna (ordem: UF, votos).
  const sens: CandidatoFicha[] = [];
  for (const uf of UFS) {
    const r = sen.get(uf)!;
    for (const c of r.candidatos) sens.push(fichaTitular(ctx, r, c, uf, 'senado'));
  }
  grupos.set('senado', { candidatos: sens });

  // câmara e assembleias: só eleitos, por UF (ordem: votos).
  for (const [prefixo, mapa] of [['camara', cam], ['assembleia', ass]] as const) {
    for (const uf of UFS) {
      const r = mapa.get(uf)!;
      const grupo = `${prefixo}-${uf.toLowerCase()}`;
      const lista = r.candidatos.filter((c) => ehEleito(c.situacao)).map((c) => fichaTitular(ctx, r, c, uf, grupo));
      if (!r.pendente && lista.length !== r.vagas) fail(`[${r.ctx}] ${lista.length} eleitos ≠ ${r.vagas} vagas`);
      grupos.set(grupo, r.pendente ? { candidatos: lista, aviso: r.aviso } : { candidatos: lista });
    }
  }

  // ----- Conferências -----
  const todas = [...grupos.values()].flatMap((g) => g.candidatos);
  const vistos = new Map<string, string>();
  for (const [g, { candidatos }] of grupos) {
    for (const f of candidatos) {
      if (vistos.has(f.sqcand)) fail(`sqcand ${f.sqcand} em dois grupos (${vistos.get(f.sqcand)} e ${g})`);
      vistos.set(f.sqcand, g);
      if (f.fotoGrupo !== g) fail(`fotoGrupo de ${f.sqcand}`);
      if (f.nomeUrna === f.nomeUrna.toUpperCase() && /[a-z]/i.test(f.nomeUrna) && f.nomeUrna.length > 4) {
        console.warn(`  aviso: nome de urna em caixa alta: ${f.nomeUrna}`);
      }
    }
  }
  // Patrimônio: Σ das fichas = Σ dos bens desses sqcands no arquivo (centavos exatos).
  let centFichas = 0;
  let centArquivo = 0;
  for (const f of todas) {
    centFichas += Math.round(f.patrimonio!.total * 100);
    centArquivo += bens.get(f.sqcand)?.centavos ?? 0;
  }
  if (centFichas !== centArquivo) fail(`patrimônio: Σ fichas ${centFichas} ≠ Σ arquivo ${centArquivo} (centavos)`);
  // Conferência com meta.json (finalistas): mesmos nomes, partido e vice.
  const meta = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(PUBLIC_DATA, 'meta.json'), 'utf8')) as import('../../../src/shared/dataset').DatasetMeta;
  for (const race of meta.races.filter((x) => x.turno === 2)) {
    for (const c of race.candidatos) {
      const f = st.find((x) => x.uf === race.abrangencia && x.numero === c.numero && !x.cargo.startsWith('Vice'));
      if (!f || f.nomeUrna !== c.nomeUrna || f.nome !== c.nome || f.partido !== c.partido || f.vice?.nome !== c.vice ||
        (f.coligacao ?? '') !== (c.coligacao ?? '') || (f.composicao ?? '') !== (c.composicao ?? '')) {
        fail(`ficha de ${race.id} ${c.numero} diverge de meta.json: ${JSON.stringify({ f: f && [f.nomeUrna, f.nome, f.partido, f.vice?.nome, f.coligacao], c: [c.nomeUrna, c.nome, c.partido, c.vice, c.coligacao] })}`);
      }
      if (c.sqcand !== undefined && c.sqcand !== f.sqcand) fail(`sqcand de ${race.id} ${c.numero}: meta ${c.sqcand} ≠ ficha ${f.sqcand}`);
    }
  }

  // ----- Gravação -----
  await mkdir(OUT, { recursive: true });
  for (const f of await readdir(OUT)) if (f.endsWith('.json')) await rm(path.join(OUT, f));
  let bytes = 0;
  const tamanhos: string[] = [];
  for (const [grupo, g] of grupos) {
    const txt = JSON.stringify({ grupo, candidatos: g.candidatos, ...(g.aviso ? { aviso: g.aviso } : {}) });
    await writeFile(path.join(OUT, `${grupo}.json`), txt);
    bytes += Buffer.byteLength(txt);
    tamanhos.push(`${grupo} ${g.candidatos.length} (${(Buffer.byteLength(txt) / 1024).toFixed(0)} KB)`);
  }
  const index = {
    colunas: ['sqcand', 'nomeUrna', 'numero', 'partido', 'cargo', 'uf', 'grupo'],
    linhas: [...grupos].flatMap(([grupo, g]) => g.candidatos.map((f) => [f.sqcand, f.nomeUrna, f.numero, f.partido, f.cargo, f.uf, grupo])),
  };
  const txtIndex = JSON.stringify(index);
  await writeFile(path.join(OUT, 'index.json'), txtIndex);
  bytes += Buffer.byteLength(txtIndex);

  // ----- Relatório -----
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  console.log(`\nGrupos (${grupos.size}): ${tamanhos.join(' · ')}`);
  console.log(`index.json: ${index.linhas.length} linhas (${(Buffer.byteLength(txtIndex) / 1024).toFixed(0)} KB)`);
  const porCargo = new Map<string, number>();
  for (const f of todas) porCargo.set(f.cargo, (porCargo.get(f.cargo) ?? 0) + 1);
  console.log(`Fichas por cargo: ${[...porCargo].map(([k, v]) => `${k} ${v}`).join(' · ')} — total ${todas.length}`);
  const campos = ['genero', 'corRaca', 'idade', 'ocupacao', 'escolaridade', 'estadoCivil', 'naturalidade', 'federacao'] as const;
  console.log(`Campos preenchidos: ${campos.map((k) => `${k} ${todas.filter((f) => f[k] !== undefined).length}`).join(' · ')}`);
  console.log(
    `Patrimônio: arquivo com ${fmt(linhasBens)} bens (Σ R$ ${fmt(centBens / 100)}); fichas: Σ = Σ do arquivo para os mesmos ` +
      `${todas.length} sqcands (centavos exatos); ${ctx.semBens} ficha(s) sem bem declarado → { total: 0, itens: 0 }`,
  );
  for (const [g, { aviso }] of grupos) if (aviso) console.log(`⚠ ${g}: vazio — ${aviso}`);
  console.log(`\nTotal candidatos: ${(bytes / 1024).toFixed(0)} KB em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => fail((e as Error).stack ?? String(e)));
