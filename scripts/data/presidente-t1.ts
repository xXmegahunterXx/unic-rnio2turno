/**
 * Presidente · 1º turno com TODOS os candidatos → public/data/presidente-t1.json (PresidenteT1Dataset,
 * src/shared/cenarios.ts). Base da calculadora "E se…? Monte seu cenário" (/cenarios).
 *
 *   npx tsx scripts/data/presidente-t1.ts            # grava public/data/presidente-t1.json
 *   npx tsx scripts/data/presidente-t1.ts --stdout   # só confere e imprime o resumo (não grava)
 *   DATA_DIR=dist/data npx tsx scripts/data/presidente-t1.ts
 *
 * Fontes:
 *  - votos por UF: soma dos municípios do dataset compilado (public/data/uf/{uf}.json → municipios[].t1), que já
 *    confere com o TSE (scripts/data/validate.ts);
 *  - candidatos (número, nome de urna, nome, partido, sqcand): arquivo do Brasil no cache bruto do feed oficial
 *    (data-raw/tse/ele2026/6257/dados/br/br-c0001-e006257-u.json; baixado por scripts/data/fetch-tse.ts — se faltar,
 *    este script baixa só esse arquivo, com o mesmo cache).
 *
 * Conferências (o script ABORTA se qualquer uma falhar):
 *  1. soma dos municípios de cada UF = arquivo da UF no feed do TSE (eleitorado, comparecimento, brancos, nulos e
 *     votos de cada candidato), quando o arquivo da UF está no cache;
 *  2. soma das UFs + exterior = arquivo do Brasil do TSE (candidato a candidato) = meta.json (totaisPrimeiroTurno);
 *  3. finalistas = race 'pres-t1' do meta.json (números, votos) e "Outros" = soma dos demais.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DatasetMeta, UfDataset } from '../../src/shared/dataset';
import type { CandidatoPresidenteT1, PresidenteT1Dataset, ResultadoUfPresidenteT1 } from '../../src/shared/cenarios';
import type { UF } from '../../src/shared/types';
import { UFS } from '../../src/shared/types';
import { fmtInt } from '../../src/shared/format';
import { createFetcher, readRaw, readRawOpcional } from './lib/cache';
import { resPresBr, resPresUf } from './lib/tse-feed';
import { nomePessoa, sigla } from './lib/nomes';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DATA = path.resolve(ROOT, process.env.DATA_DIR ?? 'public/data');
const SAIDA = path.join(DATA, 'presidente-t1.json');
const SO_STDOUT = process.argv.includes('--stdout');

const TODAS: UF[] = [...UFS, 'ZZ'];

/** Recorte do arquivo de resultado do feed (carg[0].agr[].par[].cand[], e, v). */
interface FeedResultado {
  carg: { agr: { par: { sg: string; cand: { n: string; sqcand: string; nm: string; nmu: string; vap: string; st?: string }[] }[] }[] }[];
  s?: { ts: string; st: string };
  e: { te: string; c: string };
  v: { vb: string; tvn: string; vv: string };
}

const lerJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(DATA, rel), 'utf8')) as T;
const int = (s: string | undefined) => Number.parseInt(s ?? '0', 10) || 0;

const erros: string[] = [];
function conferir(rotulo: string, obtido: number, esperado: number) {
  if (obtido !== esperado) erros.push(`${rotulo}: obtido ${fmtInt(obtido)} ≠ esperado ${fmtInt(esperado)}`);
}

function candidatosDoFeed(r: FeedResultado) {
  return r.carg[0].agr.flatMap((a) => a.par.flatMap((p) => p.cand.map((c) => ({ ...c, partido: sigla(p.sg) }))));
}

async function main() {
  const meta = lerJson<DatasetMeta>('meta.json');
  const race = meta.races.find((r) => r.id === 'pres-t1');
  if (!race) throw new Error('meta.json sem a race pres-t1');

  // Candidatos: arquivo do Brasil (cache bruto; baixa só ele se faltar).
  if (!(await readRawOpcional(resPresBr()))) {
    console.log('  arquivo do Brasil ausente no cache; baixando do feed do TSE…');
    await createFetcher({ concorrencia: 1 }).ensure(resPresBr());
  }
  const br = await readRaw<FeedResultado>(resPresBr());
  const feedCands = candidatosDoFeed(br);
  const numeros = feedCands.map((c) => Number(c.n)).sort((a, b) => a - b);

  // Votos por UF: soma dos municípios do dataset compilado.
  const ufs: ResultadoUfPresidenteT1[] = [];
  const porNumero = new Map<number, number>(numeros.map((n) => [n, 0]));
  for (const uf of TODAS) {
    const ds = lerJson<UfDataset>(`uf/${uf.toLowerCase()}.json`);
    const tot = { eleitorado: 0, comparecimento: 0, brancos: 0, nulos: 0 };
    const votos = new Map<number, number>(numeros.map((n) => [n, 0]));
    for (const m of ds.municipios) {
      tot.eleitorado += m.t1.eleitorado;
      tot.comparecimento += m.t1.comparecimento;
      tot.brancos += m.t1.brancos;
      tot.nulos += m.t1.nulos;
      for (const [k, v] of Object.entries(m.t1.votos)) {
        const n = Number(k);
        if (!votos.has(n)) throw new Error(`${uf}/${m.cod}: candidato ${k} fora do arquivo do Brasil`);
        votos.set(n, votos.get(n)! + v);
      }
    }
    // Conferência 1: arquivo da UF no feed (quando estiver no cache).
    const feedUf = await readRawOpcional<FeedResultado>(resPresUf(uf.toLowerCase()));
    if (feedUf) {
      conferir(`${uf} eleitorado`, tot.eleitorado, int(feedUf.e.te));
      conferir(`${uf} comparecimento`, tot.comparecimento, int(feedUf.e.c));
      conferir(`${uf} brancos`, tot.brancos, int(feedUf.v.vb));
      conferir(`${uf} nulos`, tot.nulos, int(feedUf.v.tvn));
      for (const c of candidatosDoFeed(feedUf)) conferir(`${uf} votos ${c.n}`, votos.get(Number(c.n)) ?? -1, int(c.vap));
    } else {
      console.log(`  aviso: arquivo da UF ${uf} ausente no cache bruto; conferida só pela soma nacional`);
    }
    // Comparecimento = votos + brancos + nulos (sanidade do dataset).
    const soma = [...votos.values()].reduce((s, v) => s + v, 0);
    conferir(`${uf} comparecimento = válidos + brancos + nulos`, soma + tot.brancos + tot.nulos, tot.comparecimento);
    for (const [n, v] of votos) porNumero.set(n, porNumero.get(n)! + v);
    ufs.push({ uf, ...tot, votos: numeros.map((n) => votos.get(n)!) });
  }

  // Conferência 2: Brasil (feed) e meta.json.
  const t = meta.totaisPrimeiroTurno;
  const somaUf = (k: 'eleitorado' | 'comparecimento' | 'brancos' | 'nulos') => ufs.reduce((s, u) => s + u[k], 0);
  const validos = [...porNumero.values()].reduce((s, v) => s + v, 0);
  conferir('Brasil eleitorado (meta)', somaUf('eleitorado'), t.eleitorado);
  conferir('Brasil comparecimento (meta)', somaUf('comparecimento'), t.comparecimento);
  conferir('Brasil brancos (meta)', somaUf('brancos'), t.brancos);
  conferir('Brasil nulos (meta)', somaUf('nulos'), t.nulos);
  conferir('Brasil válidos (meta)', validos, t.validos);
  conferir('Brasil eleitorado (TSE)', somaUf('eleitorado'), int(br.e.te));
  conferir('Brasil comparecimento (TSE)', somaUf('comparecimento'), int(br.e.c));
  conferir('Brasil brancos (TSE)', somaUf('brancos'), int(br.v.vb));
  conferir('Brasil nulos (TSE)', somaUf('nulos'), int(br.v.tvn));
  conferir('Brasil válidos (TSE)', validos, int(br.v.vv));
  for (const c of feedCands) conferir(`Brasil votos ${c.n} (TSE)`, porNumero.get(Number(c.n)) ?? -1, int(c.vap));

  // Conferência 3: finalistas da race pres-t1 (a = menor número) e "Outros".
  const fin = race.candidatos.filter((c) => !c.agregado);
  const outros = race.candidatos.find((c) => c.agregado);
  if (fin.length !== 2) erros.push(`pres-t1 com ${fin.length} finalistas`);
  const [fa, fb] = [...fin].sort((x, y) => x.numero - y.numero);
  for (const f of fin) conferir(`pres-t1 votos ${f.numero}`, porNumero.get(f.numero) ?? -1, f.primeiroTurno?.votos ?? -2);
  if (outros) {
    const somaOutros = [...porNumero].filter(([n]) => n !== fa.numero && n !== fb.numero).reduce((s, [, v]) => s + v, 0);
    conferir('pres-t1 "Outros"', somaOutros, outros.primeiroTurno?.votos ?? -1);
  }
  const st2 = feedCands.filter((c) => (c.st ?? '').includes('2º turno')).map((c) => Number(c.n)).sort((a, b) => a - b);
  if (st2.join() !== [fa.numero, fb.numero].join()) erros.push(`finalistas do feed (${st2.join()}) ≠ pres-t1 (${fa.numero},${fb.numero})`);

  if (erros.length) {
    console.error(`\n✗ ${erros.length} divergência(s):\n  ${erros.slice(0, 40).join('\n  ')}`);
    process.exit(1);
  }

  // Candidatos (nome de exibição como nas races: mesma função nomePessoa; finalistas com o nome da race).
  const daRace = new Map(fin.map((c) => [c.numero, c]));
  const candidatos: CandidatoPresidenteT1[] = numeros
    .map((n) => {
      const c = feedCands.find((x) => Number(x.n) === n)!;
      const r = daRace.get(n);
      return {
        numero: n,
        nomeUrna: r?.nomeUrna ?? nomePessoa(c.nmu),
        nome: r?.nome ?? nomePessoa(c.nm),
        partido: r?.partido ?? c.partido,
        sqcand: c.sqcand,
        votos: porNumero.get(n)!,
        finalista: n === fa.numero || n === fb.numero,
      };
    })
    .sort((x, y) => y.votos - x.votos || x.numero - y.numero);
  const ordem = candidatos.map((c) => numeros.indexOf(c.numero));

  const saida: PresidenteT1Dataset = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    fonte:
      'TSE · resultado oficial do 1º turno (04/10/2026) para Presidente: votos por município somados por UF ' +
      '(resultados.tse.jus.br, eleição 6257, cargo 1); candidatos do arquivo nacional do mesmo feed.',
    candidatos,
    finalistas: [fa.numero, fb.numero],
    ufs: ufs.map((u) => ({ ...u, votos: ordem.map((i) => u.votos[i]) })),
    totais: {
      secoes: t.secoes,
      eleitorado: t.eleitorado,
      comparecimento: t.comparecimento,
      brancos: t.brancos,
      nulos: t.nulos,
      validos: t.validos,
    },
  };

  console.log('✓ conferido: UFs = feed do TSE; UFs + exterior = Brasil (TSE) = meta.json; finalistas = pres-t1');
  for (const c of candidatos) {
    console.log(`  ${String(c.numero).padStart(2)} ${c.nomeUrna.padEnd(28)} ${c.partido.padEnd(10)} ${fmtInt(c.votos).padStart(12)}${c.finalista ? '  (2º turno)' : ''}`);
  }
  if (SO_STDOUT) return;
  const txt = `${JSON.stringify(saida)}\n`;
  writeFileSync(SAIDA, txt);
  console.log(`→ ${path.relative(ROOT, SAIDA)} (${(Buffer.byteLength(txt) / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
