/**
 * Utilitários comuns do ETL de candidatos, fotos e resultados do 1º turno de todos os cargos (fase 2).
 * Usado por cargos_build.ts e candidatos_build.ts (ver README.md › Dados › Candidatos, cargos e fotos).
 *
 * - Feed oficial (resultados.tse.jus.br): arquivos de resultado por UF de cada cargo do 1º turno, com cache em
 *   data-raw/tse/ (mesmo espelho e mesmo downloader de scripts/data/fetch-tse.ts: lib/cache.ts).
 *     ele2026/6259/dados/{uf}/{uf}-c000{3,5,6,7|8}-e006259-u.json  Governador, Senador, Dep. Federal, Dep. Estadual
 *                                                                   (cargo 8 = Dep. Distrital, só no DF)
 *     ele2026/6257/dados/br/br-c0001-e006257-u.json                 Presidente 1º turno
 *     ele2026/6258/dados/br/br-c0001-e006258-u.json                 Presidente 2º turno (candidatos)
 *     ele2026/6260/dados/{uf}/{uf}-c0003-e006260-u.json             Governador 2º turno (opcional)
 * - Dados abertos (cdn.tse.jus.br/estatistica/sead/odsele): consulta_cand e bem_candidato, com cache em
 *   data-raw/tse-abertos/ (não rebaixa se o arquivo existe e o tamanho bate com o Content-Length).
 * - CSV do TSE lido em STREAMING de dentro do ZIP (`unzip -p`): latin-1, separador ';', aspas duplas (com "" escapado);
 *   "#NULO#", "#NULO", "#NE#" e "#NE" viram ''.
 * - `lerCargo` confere a consistência interna de cada arquivo (Σ votos = válidos computados, Σ eleitos = vagas,
 *   votos de legenda etc.). Se algo não fechar, o build para — nunca "ajustamos" números.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ROOT, createFetcher, readRaw, readRawOpcional } from '../lib/cache';
import { titleCasePt } from '../../../src/shared/format';
import { CICLO, ELE_GOV_T1, ELE_GOV_T2, ELE_PRES_T1, ELE_PRES_T2, TSE_BASE, paths } from '../lib/tse-feed';
import type { TseAgremiacao, TseCandidato, TsePartido, TseResultado } from '../lib/tse-types';
import { UFS, type UFBr } from '../../../src/shared/types';
import type { SituacaoCandidato } from '../../../src/shared/dataset';

export { ROOT };
export const PUBLIC_DATA = path.join(ROOT, 'public', 'data');
export const RAW_ABERTOS = path.join(ROOT, 'data-raw', 'tse-abertos');
export const ABERTOS_BASE = 'https://cdn.tse.jus.br/estatistica/sead/odsele/';

/** Para o build com uma mensagem clara (tipo explícito: o TS estreita os tipos depois de `fail(...)`). */
export const fail: (msg: string) => never = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// ------------------------------------------------------------------------------------------------ feed: cargos

/** Códigos de cargo do feed do TSE (2026). */
export const CARGO = {
  presidente: '1',
  vicePresidente: '2',
  governador: '3',
  viceGovernador: '4',
  senador: '5',
  depFederal: '6',
  depEstadual: '7',
  depDistrital: '8',
} as const;

/** Assembleia: Deputado Estadual (7) nas 26 UFs; Deputado Distrital (8) na Câmara Legislativa do DF. */
export const cargoAssembleia = (uf: UFBr) => (uf === 'DF' ? CARGO.depDistrital : CARGO.depEstadual);

const lo = (uf: string) => uf.toLowerCase();
/** Resultado do 1º turno de um cargo estadual na UF (eleição 6259). */
export const arqCargoUf = (uf: UFBr, cargo: string) => paths.resultado(lo(uf), lo(uf), ELE_GOV_T1, cargo);
export const arqPresBr = () => paths.resultado('br', 'br', ELE_PRES_T1, CARGO.presidente);
export const arqPresBrT2 = () => paths.resultado('br', 'br', ELE_PRES_T2, CARGO.presidente);
export const arqGovUfT2 = (uf: UFBr) => paths.resultado(lo(uf), lo(uf), ELE_GOV_T2, CARGO.governador);

/** Lista de arquivos do feed usados pela fase 2 (cargos e candidatos). */
export function arquivosFeed(): { p: string; opcional?: boolean; refresh?: boolean }[] {
  const lista: { p: string; opcional?: boolean; refresh?: boolean }[] = [{ p: arqPresBr() }, { p: arqPresBrT2() }];
  for (const uf of UFS) {
    for (const c of [CARGO.governador, CARGO.senador, CARGO.depFederal, cargoAssembleia(uf)]) lista.push({ p: arqCargoUf(uf, c) });
  }
  return lista;
}

/**
 * Garante no cache data-raw/tse/ todos os arquivos do feed usados aqui (concorrência 12, retry; não rebaixa).
 * `--offline`: só confere o cache.
 */
export async function garantirFeed(offline: boolean): Promise<void> {
  const lista = arquivosFeed();
  const t0 = Date.now();
  if (offline) {
    const faltando = lista.filter((x) => !x.opcional && !existsSync(path.join(ROOT, 'data-raw', 'tse', x.p)));
    if (faltando.length) fail(`[offline] ${faltando.length} arquivo(s) do feed ausente(s), ex.: ${faltando[0].p}`);
    return;
  }
  const fetcher = createFetcher({ concorrencia: 12 });
  const res = await Promise.allSettled(lista.map((x) => fetcher.ensure(x.p, { opcional: x.opcional })));
  const falhas = res.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (falhas.length) fail(`${falhas.length} arquivo(s) do feed falharam: ${(falhas[0].reason as Error).message}`);
  console.log(
    `✓ feed: ${lista.length} arquivo(s) (${fetcher.stats.baixados} baixado(s), ${fetcher.stats.doCache} do cache) ` +
      `em ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}

export { readRaw, readRawOpcional };

// ------------------------------------------------------------------------------------------------ feed: leitura

/** Campos do feed que lib/tse-types.ts não declara (cargos proporcionais e suplentes). */
export interface TseViceX {
  tp: string; // 'v' (vice), 's1'/'s2' (suplentes de senador)
  sqcand?: string;
  nm: string;
  nmu: string;
  sgp: string;
}
export interface TseCandidatoX extends Omit<TseCandidato, 'vs'> {
  dt?: string; // nascimento dd/mm/aaaa
  seq?: string;
  vs?: TseViceX[];
}
export interface TsePartidoX extends Omit<TsePartido, 'cand'> {
  nfed?: string; // número da federação ('' = sem federação)
  tvtn?: string; // votos nominais VÁLIDOS dos candidatos do partido (sem os anulados sub judice)
  tvan?: string; // votos nominais apurados (inclui os anulados sub judice)
  tvtl?: string; // votos de legenda VÁLIDOS
  tval?: string; // votos de legenda apurados (inclui os anulados sub judice, quando o partido está sub judice)
  dvt?: string; // 'Válido (legenda)' | 'Anulado sub judice'
  cand: TseCandidatoX[];
}
export interface TseAgremiacaoX extends Omit<TseAgremiacao, 'par'> {
  vag?: string; // vagas obtidas (proporcionais)
  par: TsePartidoX[];
}
export interface TseFederacao {
  n: string;
  sg: string; // "PT/PC do B/PV"
  nm: string; // "FEDERAÇÃO BRASIL DA ESPERANÇA - FE BRASIL"
  com: string;
  npar: string[];
}
export interface TseResultadoX extends Omit<TseResultado, 'carg' | 'v'> {
  mntf?: string; // mensagem quando a totalização não está encerrada
  v: TseResultado['v'] & { vl?: string };
  carg: { cd: string; nmn: string; nv?: string; qe?: string; fed?: TseFederacao[]; agr: TseAgremiacaoX[] }[];
}

const num = (s: string | undefined, campo: string, ctx: string): number => {
  if (s === undefined || s === '') return fail(`[${ctx}] campo numérico ausente: ${campo}`);
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return fail(`[${ctx}] campo numérico inválido (${campo}): ${JSON.stringify(s)}`);
  return n;
};
const numOpc = (s: string | undefined, campo: string, ctx: string) => (s === undefined || s === '' ? 0 : num(s, campo, ctx));

/** Situação do feed (`st`) → contrato. Valores desconhecidos viram 'outro' (e são listados no relatório). */
const SITUACOES: Record<string, SituacaoCandidato> = {
  Eleito: 'eleito',
  'Eleito por QP': 'eleito-qp',
  'Eleito por média': 'eleito-media',
  '2º turno': 'segundo-turno',
  Suplente: 'suplente',
  'Não eleito': 'nao-eleito',
};
export const situacoesDesconhecidas = new Map<string, number>();
export function situacao(st: string): SituacaoCandidato {
  const s = SITUACOES[st];
  if (s) return s;
  situacoesDesconhecidas.set(st, (situacoesDesconhecidas.get(st) ?? 0) + 1);
  return 'outro';
}
export const ehEleito = (s: SituacaoCandidato) => s === 'eleito' || s === 'eleito-qp' || s === 'eleito-media';

/** Destinações de voto computadas no percentual oficial (ver scripts/data/lib/resultado.ts). */
const DESTINO_COMPUTADO = new Set(['Válido', 'Anulado sub judice']);

export interface CandLido {
  sqcand: string;
  numero: number;
  nm: string;
  nmu: string;
  dt?: string;
  votos: number;
  /** % dos válidos computados, 2 casas (= `pvap` do TSE, conferido). */
  pct: number;
  st: string;
  situacao: SituacaoCandidato;
  subJudice: boolean;
  partido: TsePartidoX;
  agr: TseAgremiacaoX;
  vs: TseViceX[];
}

export interface PartidoLido {
  numero: number;
  sigla: string; // como no feed
  nome: string; // como no feed
  nfed: string;
  /** votos válidos do partido: nominais válidos (sem sub judice) + legenda */
  votos: number;
  nominais: number;
  legenda: number;
  eleitos: number;
}

export interface CargoLido {
  ctx: string;
  abr: string; // 'br' | uf minúscula
  cargo: string; // código
  nomeCargo: string; // "Senador"
  vagas: number;
  secoes: number;
  secoesTotalizadas: number;
  eleitorado: number;
  comparecimento: number;
  /** total de votos (= vagas × comparecimento no Senado com 2 vagas) */
  totalVotos: number;
  /** válidos computados (`vvc`) = Σ votos dos candidatos + legenda */
  validos: number;
  nominais: number;
  legenda: number;
  subJudice: number;
  brancos: number;
  nulos: number;
  quociente?: number;
  /**
   * Totalização ainda não encerrada pelo TSE (`tf` = 'n') com 100% das seções totalizadas e SEM situação definida
   * (ex.: AM, deputados, "Aguarde reprocessamento da eleição" em 09/10/2026). Votos valem; eleitos ainda não.
   */
  pendente: boolean;
  /** Mensagem do feed (`mntf`) quando pendente. */
  aviso?: string;
  federacoes: TseFederacao[];
  candidatos: CandLido[]; // ordem: votos desc, número asc
  partidos: PartidoLido[]; // ordem: votos desc
  feed: { dg: string; hg: string };
}

/** Percentual com 2 casas, meio para cima, em aritmética inteira (igual a lib/resultado.ts › pct2 e ao `pvap`). */
export function pct2(parte: number, todo: number): number {
  if (todo <= 0) return 0;
  return Math.floor((parte * 10000 * 2 + todo) / (2 * todo)) / 100;
}

/** Percentual como o `pvap` do TSE: pct2, mas no mínimo 0,01 quando há voto. */
export const pctTse = (parte: number, todo: number) => {
  const p = pct2(parte, todo);
  return parte > 0 && p === 0 ? 0.01 : p;
};

/**
 * Lê um arquivo de resultado (qualquer cargo) e confere a consistência interna:
 *  - totalização encerrada; Σ votos dos candidatos (+ legenda) = válidos computados (`vvc`);
 *  - `vvc` + brancos + nulos = total de votos; total de votos = vagas × comparecimento (Senado: 2 votos por eleitor);
 *  - sub judice = `vansj`; nominais/legenda = `vnom`/`vl`; Σ por partido = `tvtn`/`tvtl`;
 *  - eleitos = vagas (governador: 1 eleito ou 2 no 2º turno); `pvap` publicado = votos ÷ vvc.
 */
export function lerCargo(r: TseResultadoX, ctx: string): CargoLido {
  if (r.carg.length !== 1) fail(`[${ctx}] esperado 1 cargo, veio ${r.carg.length}`);
  const carg = r.carg[0];
  // Totalização não encerrada: só aceitamos o caso "votos completos, situação pendente" (reprocessamento).
  const pendente = r.tf !== 's';
  if (pendente) {
    const comSituacao = carg.agr.flatMap((a) => a.par.flatMap((p) => p.cand)).filter((c) => c.st !== '' || c.e === 's');
    if (comSituacao.length || r.s.st !== r.s.ts) {
      fail(`[${ctx}] totalização não encerrada (tf=${r.tf}) com situação parcial ou seções faltando`);
    }
  }
  const { s, e, v } = r;
  const secoes = num(s.ts, 's.ts', ctx);
  const secoesTotalizadas = num(s.st, 's.st', ctx);
  if (secoes !== secoesTotalizadas) fail(`[${ctx}] seções totalizadas ${s.st} ≠ total ${s.ts}`);
  const vagas = carg.nv ? num(carg.nv, 'nv', ctx) : 1;
  const proporcional = carg.cd === CARGO.depFederal || carg.cd === CARGO.depEstadual || carg.cd === CARGO.depDistrital;

  const candidatos: CandLido[] = [];
  const partidos: PartidoLido[] = [];
  const vistos = new Set<string>();
  let subJudice = 0;
  let somaVotos = 0;
  let somaLegenda = 0;
  let somaLegendaApurada = 0;
  let anuladosPendentes = 0;
  for (const agr of carg.agr) {
    for (const par of agr.par) {
      const p: PartidoLido = {
        numero: num(par.n, 'par.n', ctx),
        sigla: par.sg,
        nome: par.nm,
        nfed: par.nfed ?? '',
        votos: 0,
        nominais: 0,
        legenda: proporcional ? numOpc(par.tvtl, `tvtl ${par.sg}`, ctx) : 0,
        eleitos: 0,
      };
      let nominaisComSj = 0;
      for (const cand of par.cand) {
        const c = `${ctx} ${cand.n}`;
        if (vistos.has(cand.sqcand)) fail(`[${c}] sqcand repetido ${cand.sqcand}`);
        vistos.add(cand.sqcand);
        const votos = num(cand.vap, 'vap', c);
        let sj = false;
        let anulado = false;
        if (cand.dvt === undefined) {
          if (votos !== 0) fail(`[${c}] sem destinação de voto com ${votos} votos`);
        } else if (pendente && cand.dvt === 'Anulado') {
          // Arquivo em reprocessamento: o feed soma esses votos com os anulados sub judice (vansj), fora do tvtn.
          anulado = true;
          sj = true;
          subJudice += votos;
          anuladosPendentes += votos;
        } else if (!DESTINO_COMPUTADO.has(cand.dvt)) {
          fail(`[${c}] destinação de voto não tratada: "${cand.dvt}"`);
        } else if (cand.dvt === 'Anulado sub judice') {
          sj = true;
          subJudice += votos;
        }
        somaVotos += votos;
        nominaisComSj += votos;
        if (!sj) p.nominais += votos;
        const sit = pendente ? 'outro' : situacao(cand.st);
        if (ehEleito(sit)) p.eleitos++;
        candidatos.push({
          sqcand: cand.sqcand,
          numero: num(cand.n, 'n', c),
          nm: cand.nm,
          nmu: cand.nmu,
          dt: cand.dt,
          votos,
          pct: 0,
          st: cand.st,
          situacao: sit,
          subJudice: sj,
          partido: par,
          agr,
          vs: cand.vs ?? [],
        });
      }
      if (proporcional) {
        const tvtn = numOpc(par.tvtn, `tvtn ${par.sg}`, ctx);
        const tvan = numOpc(par.tvan, `tvan ${par.sg}`, ctx);
        if (tvtn !== p.nominais) fail(`[${ctx}] ${par.sg}: Σ votos válidos dos candidatos ${p.nominais} ≠ tvtn ${tvtn}`);
        if (tvan !== nominaisComSj) fail(`[${ctx}] ${par.sg}: Σ votos dos candidatos ${nominaisComSj} ≠ tvan ${tvan}`);
        // Legenda: tval = apurada; tvtl = válida. A diferença só existe com o partido sub judice (vai para vansj).
        const tval = numOpc(par.tval, `tval ${par.sg}`, ctx);
        const legendaSj = tval - p.legenda;
        if (legendaSj < 0) fail(`[${ctx}] ${par.sg}: tval ${tval} < tvtl ${p.legenda}`);
        if (legendaSj > 0 && par.dvt !== 'Anulado sub judice') fail(`[${ctx}] ${par.sg}: legenda anulada sem sub judice`);
        if (par.dvt !== undefined && par.dvt !== 'Válido (legenda)' && par.dvt !== 'Anulado sub judice') {
          fail(`[${ctx}] ${par.sg}: destinação da legenda não tratada "${par.dvt}"`);
        }
        subJudice += legendaSj;
        somaLegendaApurada += tval;
      }
      somaLegenda += p.legenda;
      p.votos = p.nominais + p.legenda;
      partidos.push(p);
    }
  }

  const validos = num(v.vvc, 'v.vvc', ctx);
  const vv = num(v.vv, 'v.vv', ctx);
  const nominais = num(v.vnom, 'v.vnom', ctx);
  const legenda = numOpc(v.vl, 'v.vl', ctx);
  const brancos = num(v.vb, 'v.vb', ctx);
  const nulos = num(v.tvn, 'v.tvn', ctx);
  const comparecimento = num(e.c, 'e.c', ctx);
  const totalVotos = num(v.tv, 'v.tv', ctx);
  if (somaVotos + somaLegendaApurada !== validos) {
    fail(`[${ctx}] Σ votos ${somaVotos} + legenda apurada ${somaLegendaApurada} ≠ vvc ${validos}`);
  }
  if (vv + subJudice !== validos) fail(`[${ctx}] vv ${vv} + sub judice ${subJudice} ≠ vvc ${validos}`);
  if (num(v.vansj, 'v.vansj', ctx) !== subJudice) fail(`[${ctx}] sub judice ${subJudice} ≠ vansj ${v.vansj}`);
  if (num(v.van, 'v.van', ctx) !== 0) fail(`[${ctx}] votos anulados em definitivo (van=${v.van}) não tratados`);
  if (nominais + legenda !== vv) fail(`[${ctx}] nominais ${nominais} + legenda ${legenda} ≠ vv ${vv}`);
  if (legenda !== somaLegenda) fail(`[${ctx}] legenda ${legenda} ≠ Σ tvtl ${somaLegenda}`);
  if (num(v.vn, 'v.vn', ctx) + num(v.vnt, 'v.vnt', ctx) !== nulos) fail(`[${ctx}] vn + vnt ≠ tvn`);
  if (validos + brancos + nulos !== totalVotos) fail(`[${ctx}] vvc + brancos + nulos ≠ total de votos ${totalVotos}`);
  const votosPorEleitor = carg.cd === CARGO.senador ? vagas : 1;
  if (totalVotos !== votosPorEleitor * comparecimento) {
    fail(`[${ctx}] total de votos ${totalVotos} ≠ ${votosPorEleitor} × comparecimento ${comparecimento}`);
  }
  const eleitorado = num(e.te, 'e.te', ctx);
  if (comparecimento > eleitorado) fail(`[${ctx}] comparecimento > eleitorado`);

  // Percentuais: votos ÷ vvc, conferidos com o pvap publicado. Como o TSE, voto > 0 que arredondaria para 0,00%
  // aparece como 0,01% (regra do `pvap`, conferida em todos os arquivos).
  for (const c of candidatos) {
    c.pct = pctTse(c.votos, validos);
    const cand = c.partido.cand.find((x) => x.sqcand === c.sqcand)!;
    const pvap = Number(cand.pvap.replace(',', '.'));
    if (pvap !== c.pct) fail(`[${ctx} ${c.numero}] pct calculado ${c.pct} ≠ pvap ${cand.pvap}`);
  }

  // Eleitos = vagas.
  const eleitos = candidatos.filter((c) => ehEleito(c.situacao)).length;
  if (pendente) {
    if (eleitos !== 0) fail(`[${ctx}] pendente com ${eleitos} eleito(s)`);
  } else if (carg.cd === CARGO.governador || carg.cd === CARGO.presidente) {
    const t2 = candidatos.filter((c) => c.situacao === 'segundo-turno').length;
    if (!((eleitos === 1 && t2 === 0) || (eleitos === 0 && t2 === 2))) fail(`[${ctx}] ${eleitos} eleito(s) e ${t2} no 2º turno`);
  } else if (eleitos !== vagas) {
    fail(`[${ctx}] ${eleitos} eleito(s) ≠ ${vagas} vaga(s)`);
  }
  if (proporcional) {
    for (const agr of carg.agr) {
      const vag = numOpc(agr.vag, 'vag', ctx);
      const el = candidatos.filter((c) => c.agr === agr && ehEleito(c.situacao)).length; // 0 se pendente
      if (vag !== el) fail(`[${ctx}] agremiação ${agr.nm}: vag ${vag} ≠ ${el} eleito(s)`);
    }
  }

  candidatos.sort((a, b) => b.votos - a.votos || a.numero - b.numero);
  partidos.sort((a, b) => b.votos - a.votos || b.eleitos - a.eleitos || a.numero - b.numero);
  return {
    ctx,
    abr: r.cdabr,
    cargo: carg.cd,
    nomeCargo: carg.nmn,
    vagas,
    secoes,
    secoesTotalizadas,
    eleitorado,
    comparecimento,
    totalVotos,
    validos,
    nominais,
    legenda,
    subJudice,
    brancos,
    nulos,
    quociente: carg.qe ? num(carg.qe, 'qe', ctx) : undefined,
    pendente,
    aviso: pendente ? (r.mntf || 'Totalização não encerrada') : undefined,
    federacoes: carg.fed ?? [],
    candidatos,
    partidos,
    feed: { dg: r.dg, hg: r.hg },
  };
}

export async function lerCargoUf(uf: UFBr, cargo: string): Promise<CargoLido> {
  const arq = arqCargoUf(uf, cargo);
  const r = await readRaw<TseResultadoX>(arq);
  if (r.cdabr !== lo(uf)) fail(`${arq}: cdabr ${r.cdabr}`);
  return lerCargo(r, `${uf} c${cargo}`);
}

// ------------------------------------------------------------------------------------------------ nomes

/**
 * sqcands cuja grafia segue lib/nomes.ts › nomePessoa (com a tabela de acentos verificados), como em meta.json:
 * finalistas do 2º turno (situação "2º turno") e seus vices. Os demais usam `nomeSimples`.
 */
export function finalistasSq(resultados: CargoLido[]): Set<string> {
  const s = new Set<string>();
  for (const r of resultados) {
    for (const c of r.candidatos) {
      if (c.situacao !== 'segundo-turno') continue;
      s.add(c.sqcand);
      for (const v of c.vs) if (v.sqcand) s.add(v.sqcand);
    }
  }
  return s;
}

/** Grafia oficial de siglas que o feed publica em caixa alta ("PC do B" → "PCdoB"), igual a lib/nomes.ts › sigla. */
export const siglaPartido = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return ({ PCDOB: 'PCdoB', 'PC DO B': 'PCdoB' } as Record<string, string>)[t.toUpperCase()] ?? t;
};
/** Sigla de federação "PT/PC do B/PV" → "PT/PCdoB/PV". */
export const siglaFederacao = (s: string) => s.split('/').map(siglaPartido).join('/');

/**
 * Nomes das federações de 2026 (feed: CAIXA ALTA; siglas de partido preservadas). Tabela explícita porque a regra
 * genérica erra siglas ("PSOL") e nomes próprios iguais a siglas ("União"). Federação nova → o build para.
 */
const FEDERACOES: Record<string, string> = {
  'FEDERAÇÃO BRASIL DA ESPERANÇA - FE BRASIL': 'Federação Brasil da Esperança - Fe Brasil',
  'FEDERAÇÃO PSOL REDE': 'Federação PSOL Rede',
  'FEDERAÇÃO PSDB CIDADANIA': 'Federação PSDB Cidadania',
  'FEDERAÇÃO RENOVAÇÃO SOLIDÁRIA': 'Federação Renovação Solidária',
  'FEDERAÇÃO UNIÃO PROGRESSISTA': 'Federação União Progressista',
};
export function nomeFederacao(nm: string): string {
  const k = nm.trim().replace(/\s+/g, ' ').toUpperCase();
  return FEDERACOES[k] ?? fail(`federação sem grafia de exibição: "${nm}" (acrescente em FEDERACOES)`);
}

/** Ajustes pós-titleCasePt (iguais aos de lib/nomes.ts): "Olho-D'água" → "Olho-d'Água", "Sant'ana" → "Sant'Ana". */
function ajustarApostrofos(s: string): string {
  return s
    .replace(/([\s-])D'(\p{L})/gu, (_, pre: string, c: string) => `${pre}d'${c.toUpperCase()}`)
    .replace(/(\p{L})'(\p{Ll})/gu, (_, a: string, c: string) => `${a}'${c.toUpperCase()}`);
}

/** Abreviações só de consoantes que se escrevem com inicial maiúscula ("Dr.", "Sgt."), não como sigla. */
const ABREVIACOES = new Set(['DR', 'JR', 'PR', 'SGT', 'CB', 'CMDT', 'SR', 'ST', 'TEN']);

/**
 * Nome de pessoa SEM a tabela de correções de acento de lib/nomes.ts (que só vale para os finalistas verificados):
 * para os demais candidatos, a grafia é exatamente a do TSE, só com a capitalização de exibição (titleCasePt) e dois
 * ajustes de caixa: palavras só de consoantes (siglas: "JHC", "MLB", "PT", "DJ") ficam em maiúsculas, salvo
 * abreviações como "Dr"/"Jr"/"Sgt"; e letra logo depois de ponto fica maiúscula ("J.R.", "Hosp.Câncer").
 */
export function nomeSimples(nm: string): string {
  const bruto = nm.trim().replace(/\s+/g, ' ');
  const siglas = new Set(
    bruto.split(/[\s-]+/).filter((w) => /^[B-DF-HJ-NP-TV-Z]{2,}$/.test(w) && !ABREVIACOES.has(w)),
  );
  return ajustarApostrofos(titleCasePt(bruto))
    .split(/(\s+|-)/)
    .map((w) => (siglas.has(w.toUpperCase()) ? w.toUpperCase() : w))
    .join('')
    .replace(/(\p{L})\.(\p{Ll})/gu, (_, a: string, c: string) => `${a}.${c.toUpperCase()}`);
}

/** Nomes de partido que o feed publica sem acento (grafia oficial do estatuto). */
const PARTIDOS_GRAFIA: Record<string, string> = {
  'PARTIDO RENOVACAO DEMOCRATICA': 'Partido Renovação Democrática',
};
export const nomePartidoBruto = (nm: string) => PARTIDOS_GRAFIA[nm.trim().replace(/\s+/g, ' ').toUpperCase()];

/** Rótulos descritivos do TSE em CAIXA ALTA → "Superior completo", "Casado(a)", "Empresário". Siglas preservadas. */
const SIGLAS_ROTULO = new Set(['TV', 'ONG', 'SUS', 'PM', 'CLT', 'TI']);
export function rotulo(s: string): string | undefined {
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t || /^N[ÃA]O DIVULG[ÁA]VEL$/i.test(t) || /^N[ÃA]O INFORMADO$/i.test(t)) return undefined;
  const lower = t.toLocaleLowerCase('pt-BR');
  const palavras = lower.split(' ').map((w) => (SIGLAS_ROTULO.has(w.toUpperCase()) ? w.toUpperCase() : w));
  const out = palavras.join(' ');
  return out.charAt(0).toLocaleUpperCase('pt-BR') + out.slice(1);
}

// ------------------------------------------------------------------------------------------------ dados abertos

async function headSize(url: string): Promise<number | null> {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(60_000) });
      if (r.ok) {
        const n = r.headers.get('content-length');
        return n ? Number(n) : null;
      }
    } catch {
      /* tenta de novo */
    }
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
  }
  return null;
}

/**
 * Baixa ABERTOS_BASE+rel para data-raw/tse-abertos/rel com cache por tamanho (Content-Length). Download atômico
 * (.part + rename). `offline`: só usa o cache.
 */
export async function baixarAberto(rel: string, offline = false): Promise<string> {
  const dest = path.join(RAW_ABERTOS, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  if (offline) {
    if (!existsSync(dest)) fail(`[offline] ausente: ${dest}`);
    return dest;
  }
  const url = ABERTOS_BASE + rel;
  const esperado = await headSize(url);
  if (existsSync(dest) && (esperado === null || statSync(dest).size === esperado)) {
    console.log(`cache ok  ${rel} (${(statSync(dest).size / 1e6).toFixed(1)} MB)`);
    return dest;
  }
  for (let i = 0; i < 5; i++) {
    const part = `${dest}.part`;
    try {
      const t0 = Date.now();
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      await pipeline(Readable.fromWeb(r.body as import('node:stream/web').ReadableStream), createWriteStream(part));
      const n = statSync(part).size;
      if (esperado !== null && n !== esperado) throw new Error(`tamanho ${n} ≠ ${esperado}`);
      await rename(part, dest);
      console.log(`baixado   ${rel} (${(n / 1e6).toFixed(1)} MB em ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      return dest;
    } catch (err) {
      await rm(part, { force: true });
      console.warn(`  falhou ${rel} (${(err as Error).message}); tentativa ${i + 1}/5`);
      await new Promise((res) => setTimeout(res, 5000 * (i + 1)));
    }
  }
  return fail(`não consegui baixar ${url}`);
}

const NULOS_TSE = new Set(['#NULO#', '#NULO', '#NE#', '#NE']);

/**
 * Itera as linhas de um CSV do TSE dentro de um ZIP, em streaming (`unzip -p`), como objetos coluna → valor.
 * latin-1, ';' e aspas duplas com "" escapado; quebras de linha dentro de aspas são preservadas.
 */
export async function* lerCsvZip(zip: string, membro: string): AsyncGenerator<Record<string, string>> {
  const proc = spawn('unzip', ['-p', zip, membro], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
  const fim = new Promise<number>((res) => proc.on('close', (code) => res(code ?? 0)));

  let cab: string[] | null = null;
  let campo = '';
  let linha: string[] = [];
  // 0 = fora de aspas · 1 = dentro de aspas · 2 = viu uma aspa dentro de aspas (pode ser "" ou o fim)
  let estado = 0;
  const fecharLinha = function* (): Generator<Record<string, string>> {
    linha.push(campo);
    campo = '';
    const l = linha;
    linha = [];
    if (l.length === 1 && l[0] === '') return; // linha vazia
    if (!cab) {
      cab = l.map((x, i) => (i === 0 ? x.replace(/^﻿/, '') : x));
      return;
    }
    if (l.length !== cab.length) fail(`${membro}: linha com ${l.length} colunas (esperado ${cab.length}): ${l.slice(0, 6).join(';')}`);
    const o: Record<string, string> = {};
    for (let i = 0; i < cab.length; i++) o[cab[i]] = NULOS_TSE.has(l[i]) ? '' : l[i];
    yield o;
  };

  for await (const chunk of proc.stdout) {
    const s = (chunk as Buffer).toString('latin1');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (estado === 1) {
        if (ch === '"') estado = 2;
        else campo += ch;
        continue;
      }
      if (estado === 2) {
        if (ch === '"') {
          campo += '"';
          estado = 1;
          continue;
        }
        estado = 0; // fim das aspas; processa o caractere normalmente
      }
      if (ch === '"') estado = 1;
      else if (ch === ';') {
        linha.push(campo);
        campo = '';
      } else if (ch === '\n') yield* fecharLinha();
      else if (ch !== '\r') campo += ch;
    }
  }
  if (campo !== '' || linha.length) yield* fecharLinha();
  const code = await fim;
  if (code !== 0) fail(`unzip -p ${zip} ${membro} saiu com ${code}: ${stderr.trim()}`);
}

/** Valor monetário do TSE ("2735055,57", "-139,91") → centavos (inteiro). */
export function centavos(s: string, ctx: string): number {
  const m = /^(-?)(\d+)(?:,(\d{1,2}))?$/.exec(s.trim());
  if (!m) return fail(`[${ctx}] valor monetário inválido: ${JSON.stringify(s)}`);
  const c = Number(m[2]) * 100 + Number((m[3] ?? '0').padEnd(2, '0'));
  return m[1] ? -c : c;
}

/** "25/01/1988" → "1988-01-25" (ou undefined se vazio/inválido). */
export function dataIso(s: string | undefined): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/** Idade completa em `refIso` (data da eleição). */
export function idadeEm(nascIso: string, refIso: string): number {
  const [ay, am, ad] = nascIso.split('-').map(Number);
  const [ry, rm, rd] = refIso.split('-').map(Number);
  return ry - ay - (rm < am || (rm === am && rd < ad) ? 1 : 0);
}

export const FONTE_FEED = `${TSE_BASE}/${CICLO}`;
