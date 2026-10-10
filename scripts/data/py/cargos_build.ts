/**
 * Resultados oficiais do 1º turno (04/10/2026) de TODOS os cargos estaduais, a partir do feed do TSE.
 *
 *   npx tsx scripts/data/py/cargos_build.ts            # baixa o que falta (cache em data-raw/tse/) e gera os JSON
 *   npx tsx scripts/data/py/cargos_build.ts --offline  # só o cache
 *   npx tsx scripts/data/py/cargos_build.ts --refresh  # rebaixa os arquivos do feed (ex.: após retotalização)
 *
 * Saídas (CargoDataset em src/shared/dataset.ts, JSON minificado):
 *   public/data/cargos/governador-t1.json  27 UFs: todos os candidatos a Governador (eleitos no 1º turno e os 7 pares
 *                                          que foram ao 2º turno); composicao = eleitos no 1º turno por partido
 *   public/data/cargos/senado.json         27 UFs × 2 vagas: todos os candidatos; composicao = 54 eleitos em 2026
 *   public/data/cargos/camara.json         513 vagas: por UF, eleitos + 20 mais votados não eleitos; partidos com votos
 *                                          e eleitos; composicao nacional por partido
 *   public/data/cargos/assembleia.json     Deputado Estadual (26 UFs) e Deputado Distrital (DF): idem
 *
 * Convenções:
 *  - `validos` = válidos computados (`vvc` do TSE: nominais + legenda + anulados sub judice), denominador do `pct`
 *    oficial de cada candidato (`pct` = `pvap` do TSE, conferido; voto > 0 que arredondaria para 0,00% vira 0,01%,
 *    como no TSE). Σ partidos[].votos = válidos sem os anulados sub judice (nominais válidos + legenda).
 *  - Senado (2 vagas): cada eleitor vota 2 vezes; validos + brancos + nulos = 2 × comparecimento. Use
 *    (validos + brancos + nulos) como denominador de brancos/nulos nessa casa.
 *  - `comparecimento`/`eleitorado`/`secoes` são os do cargo na UF (feed). O comparecimento estadual pode diferir do
 *    de Presidente (dataset da fase 1) por causa do voto em trânsito, que só vale para Presidente fora da UF.
 *  - Totalização reaberta pelo TSE (ex.: AM, deputados, "Aguarde reprocessamento da eleição"): votos completos,
 *    sem eleitos; os candidatos saem com situacao 'outro' e a UF ganha a propriedade extra `aviso` (mensagem do feed).
 *    Nesse caso a lista traz os (vagas + 20) mais votados. Rode de novo com --refresh quando o TSE concluir.
 *  - Nomes: capitalização de exibição do nome de urna do feed (finalistas do 2º turno com a mesma grafia de
 *    meta.json, via lib/nomes.ts › nomePessoa); partidos pela sigla oficial (PCdoB).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CargoDataset, CargoUfResultado, DatasetMeta, UfDataset } from '../../../src/shared/dataset';
import { UFS, type UFBr } from '../../../src/shared/types';
import { UFS_GOV_2T } from '../../../src/shared/constants';
import { nomeColigacao, nomePessoa } from '../lib/nomes';
import {
  CARGO,
  PUBLIC_DATA,
  cargoAssembleia,
  arquivosFeed,
  ehEleito,
  fail,
  finalistasSq,
  garantirFeed,
  lerCargoUf,
  nomePartidoBruto,
  nomeSimples,
  siglaFederacao,
  siglaPartido,
  situacoesDesconhecidas,
  type CargoLido,
} from './candidatos_comum';
import { createFetcher } from '../lib/cache';

const args = new Set(process.argv.slice(2));
const OFFLINE = args.has('--offline');
const REFRESH = args.has('--refresh');
const OUT = path.join(PUBLIC_DATA, 'cargos');
/** Proporcionais: além dos eleitos, quantos não eleitos mais votados entram na lista. */
const NAO_ELEITOS = 20;

const avisos: string[] = [];

function resultadoUf(uf: UFBr, r: CargoLido, nomeDe: (sq: string, nmu: string) => string, proporcional: boolean): CargoUfResultado {
  let cands = r.candidatos;
  if (proporcional) {
    const eleitos = cands.filter((c) => ehEleito(c.situacao));
    const naoEleitos = cands.filter((c) => !ehEleito(c.situacao)).slice(0, r.pendente ? r.vagas + NAO_ELEITOS : NAO_ELEITOS);
    cands = [...eleitos, ...naoEleitos].sort((a, b) => b.votos - a.votos || a.numero - b.numero);
  }
  const out: CargoUfResultado & { aviso?: string } = {
    uf,
    cargo: r.nomeCargo,
    vagas: r.vagas,
    secoesTotalizadas: r.secoesTotalizadas,
    secoes: r.secoes,
    validos: r.validos,
    brancos: r.brancos,
    nulos: r.nulos,
    comparecimento: r.comparecimento,
    eleitorado: r.eleitorado,
  } as CargoUfResultado;
  if (proporcional) {
    const fed = new Map(r.federacoes.map((f) => [f.n, siglaFederacao(f.sg)]));
    out.partidos = r.partidos.map((p) => {
      const o: NonNullable<CargoUfResultado['partidos']>[number] = {
        sigla: siglaPartido(p.sigla),
        nome: nomePartidoBruto(p.nome) ?? nomeColigacao(p.nome),
        votos: p.votos,
        eleitos: p.eleitos,
      };
      if (p.nfed) o.federacao = fed.get(p.nfed) ?? fail(`[${r.ctx}] federação ${p.nfed} ausente de carg.fed`);
      return o;
    });
  }
  out.candidatos = cands.map((c) => ({
    sqcand: c.sqcand,
    numero: c.numero,
    nomeUrna: nomeDe(c.sqcand, c.nmu),
    partido: siglaPartido(c.partido.sg),
    votos: c.votos,
    pct: c.pct,
    situacao: c.situacao,
  }));
  if (r.pendente) {
    out.aviso = r.aviso;
    avisos.push(`${uf} ${r.nomeCargo}: totalização reaberta no TSE ("${r.aviso}", feed ${r.feed.dg} ${r.feed.hg}) — votos completos, sem eleitos`);
  }
  return out;
}

function composicao(ufs: CargoLido[]): { sigla: string; eleitos: number }[] {
  const m = new Map<string, number>();
  for (const r of ufs) for (const c of r.candidatos) if (ehEleito(c.situacao)) m.set(siglaPartido(c.partido.sg), (m.get(siglaPartido(c.partido.sg)) ?? 0) + 1);
  return [...m].map(([sigla, eleitos]) => ({ sigla, eleitos })).sort((a, b) => b.eleitos - a.eleitos || a.sigla.localeCompare(b.sigla, 'pt-BR'));
}

async function gravar(nome: string, d: CargoDataset): Promise<number> {
  const txt = JSON.stringify(d);
  await writeFile(path.join(OUT, `${nome}.json`), txt);
  return Buffer.byteLength(txt);
}

/**
 * Conferência com o dataset da fase 1 (public/data/uf/*.json e meta.json, que já conferem com o TSE).
 *  - Os 4 cargos de cada UF têm o MESMO eleitorado, comparecimento e seções (mesmos eleitores e urnas).
 *  - Seções = meta.json. Eleitorado/comparecimento estaduais ≤ os de Presidente: a diferença são os eleitores em
 *    trânsito vindos de outras UFs, que só votam para Presidente (é relatada, não é erro).
 *  - Governador nas 7 UFs com 2º turno: eleitorado, comparecimento e votos de cada candidato = Σ t1gov dos municípios;
 *    finalistas = meta.json (número, votos e %).
 */
async function conferirFase1(gov: Map<UFBr, CargoLido>, todos: CargoLido[][]) {
  const meta = JSON.parse(await readFile(path.join(PUBLIC_DATA, 'meta.json'), 'utf8')) as DatasetMeta;
  const transito: string[] = [];
  let totEleit = 0;
  let totComp = 0;
  for (const uf of UFS) {
    const ds = JSON.parse(await readFile(path.join(PUBLIC_DATA, 'uf', `${uf.toLowerCase()}.json`), 'utf8')) as UfDataset;
    const um = meta.ufs.find((u) => u.uf === uf) ?? fail(`meta sem UF ${uf}`);
    const eleitPres = ds.municipios.reduce((a, m) => a + m.eleitorado, 0);
    const compPres = ds.municipios.reduce((a, m) => a + m.t1.comparecimento, 0);
    const daUf = todos.map((l) => l.find((x) => x.abr === uf.toLowerCase())!);
    const g0 = daUf[0];
    for (const r of daUf) {
      if (r.eleitorado !== g0.eleitorado || r.comparecimento !== g0.comparecimento || r.secoes !== g0.secoes) {
        fail(`[${r.ctx}] eleitorado/comparecimento/seções ≠ ${g0.ctx}`);
      }
      if (r.secoes !== um.secoes) fail(`[${r.ctx}] seções ${r.secoes} ≠ meta.json ${um.secoes}`);
    }
    if (g0.eleitorado > eleitPres || g0.comparecimento > compPres) fail(`[${uf}] eleitorado/comparecimento estadual > Presidente`);
    totEleit += eleitPres - g0.eleitorado;
    totComp += compPres - g0.comparecimento;
    transito.push(`${uf} ${eleitPres - g0.eleitorado}`);
    if (UFS_GOV_2T.includes(uf)) {
      const g = gov.get(uf)!;
      const soma: Record<string, number> = {};
      for (const m of ds.municipios) for (const [n, v] of Object.entries(m.t1gov!.votos)) soma[n] = (soma[n] ?? 0) + v;
      for (const c of g.candidatos) {
        if ((soma[String(c.numero)] ?? -1) !== c.votos) fail(`[${g.ctx}] ${c.numero}: ${c.votos} ≠ Σ t1gov ${soma[String(c.numero)]}`);
      }
      const compGov = ds.municipios.reduce((a, m) => a + m.t1gov!.comparecimento, 0);
      const eleitGov = ds.municipios.reduce((a, m) => a + m.t1gov!.eleitorado, 0);
      if (compGov !== g.comparecimento || eleitGov !== g.eleitorado) fail(`[${g.ctx}] eleitorado/comparecimento ≠ Σ t1gov`);
      const race = meta.races.find((x) => x.id === `gov-${uf.toLowerCase()}-t1`)!;
      for (const rc of race.candidatos.filter((x) => !x.agregado)) {
        const c = g.candidatos.find((x) => x.numero === rc.numero);
        if (!c || c.situacao !== 'segundo-turno' || c.votos !== rc.primeiroTurno!.votos || c.pct !== rc.primeiroTurno!.pct) {
          fail(`[${g.ctx}] finalista ${rc.numero} diverge de meta.json`);
        }
      }
    }
  }
  console.log(
    `✓ fase 1: seções das 27 UFs = meta.json; 4 cargos por UF com o mesmo eleitorado/comparecimento; governador das 7 UFs = Σ t1gov (votos, eleitorado, comparecimento) e finalistas = meta.json`,
  );
  console.log(
    `  eleitores em trânsito de outras UFs (só votam para Presidente): eleitorado ${totEleit.toLocaleString('pt-BR')}, ` +
      `comparecimento ${totComp.toLocaleString('pt-BR')} a menos nos cargos estaduais (${transito.join(' · ')})`,
  );
}

async function main() {
  const t0 = Date.now();
  if (REFRESH && !OFFLINE) {
    const f = createFetcher({ concorrencia: 12, refresh: true });
    await Promise.all(arquivosFeed().map((x) => f.ensure(x.p, { opcional: x.opcional })));
    console.log(`✓ feed atualizado (${f.stats.baixados} arquivo(s))`);
  } else await garantirFeed(OFFLINE);

  const gov = new Map<UFBr, CargoLido>();
  const sen: CargoLido[] = [];
  const cam: CargoLido[] = [];
  const ass: CargoLido[] = [];
  for (const uf of UFS) {
    gov.set(uf, await lerCargoUf(uf, CARGO.governador));
    sen.push(await lerCargoUf(uf, CARGO.senador));
    cam.push(await lerCargoUf(uf, CARGO.depFederal));
    ass.push(await lerCargoUf(uf, cargoAssembleia(uf)));
  }
  await conferirFase1(gov, [[...gov.values()], sen, cam, ass]);

  const fin = finalistasSq([...gov.values()]);
  const nomeDe = (sq: string, nmu: string) => (fin.has(sq) ? nomePessoa(nmu) : nomeSimples(nmu));

  const govDs: CargoDataset = {
    cargo: 'governador-t1',
    titulo: 'Governador · 1º turno',
    ufs: UFS.map((uf) => resultadoUf(uf, gov.get(uf)!, nomeDe, false)),
    composicao: composicao([...gov.values()]),
  };
  const senDs: CargoDataset = {
    cargo: 'senado',
    titulo: 'Senado Federal',
    ufs: UFS.map((uf, i) => resultadoUf(uf, sen[i], nomeDe, false)),
    composicao: composicao(sen),
  };
  const camDs: CargoDataset = {
    cargo: 'camara',
    titulo: 'Câmara dos Deputados',
    ufs: UFS.map((uf, i) => resultadoUf(uf, cam[i], nomeDe, true)),
    composicao: composicao(cam),
  };
  const assDs: CargoDataset = {
    cargo: 'assembleia',
    titulo: 'Assembleias Legislativas e Câmara Legislativa do DF',
    ufs: UFS.map((uf, i) => resultadoUf(uf, ass[i], nomeDe, true)),
    composicao: composicao(ass),
  };

  // Conferências de fechamento.
  const somaVagas = (l: CargoLido[]) => l.reduce((a, r) => a + r.vagas, 0);
  const somaEleitos = (c?: { eleitos: number }[]) => (c ?? []).reduce((a, x) => a + x.eleitos, 0);
  const pend = (l: CargoLido[]) => l.filter((r) => r.pendente).reduce((a, r) => a + r.vagas, 0);
  if (somaVagas(sen) !== 54 || somaEleitos(senDs.composicao) !== 54) fail('Senado: vagas/eleitos ≠ 54');
  if (somaVagas(cam) !== 513) fail(`Câmara: Σ vagas ${somaVagas(cam)} ≠ 513`);
  if (somaEleitos(camDs.composicao) !== 513 - pend(cam)) fail('Câmara: eleitos ≠ vagas − pendentes');
  if (somaEleitos(assDs.composicao) !== somaVagas(ass) - pend(ass)) fail('Assembleias: eleitos ≠ vagas − pendentes');
  const govEleitos = [...gov.values()].filter((g) => g.candidatos.some((c) => c.situacao === 'eleito')).length;
  const gov2t = [...gov.values()].filter((g) => g.candidatos.some((c) => c.situacao === 'segundo-turno'));
  if (govEleitos + gov2t.length !== 27) fail('Governador: eleitos + 2º turno ≠ 27');
  if (gov2t.map((g) => g.abr.toUpperCase()).join() !== UFS_GOV_2T.join()) fail(`Governador: UFs com 2º turno ${gov2t.map((g) => g.abr)} ≠ constants`);
  for (const ds of [camDs, assDs]) {
    for (const u of ds.ufs) {
      const r = (ds === camDs ? cam : ass).find((x) => x.abr === u.uf.toLowerCase())!;
      const sp = u.partidos!.reduce((a, p) => a + p.votos, 0);
      if (sp !== r.nominais + r.legenda) fail(`[${r.ctx}] Σ partidos ${sp} ≠ nominais + legenda ${r.nominais + r.legenda}`);
      if (u.partidos!.reduce((a, p) => a + p.eleitos, 0) !== u.candidatos.filter((c) => ehEleito(c.situacao)).length) fail(`[${r.ctx}] eleitos por partido`);
    }
  }
  if (situacoesDesconhecidas.size) avisos.push(`situações desconhecidas no feed (→ 'outro'): ${[...situacoesDesconhecidas].map(([k, v]) => `"${k}" ×${v}`).join(', ')}`);

  await mkdir(OUT, { recursive: true });
  const tam = {
    'governador-t1': await gravar('governador-t1', govDs),
    senado: await gravar('senado', senDs),
    camara: await gravar('camara', camDs),
    assembleia: await gravar('assembleia', assDs),
  };
  if (tam.assembleia > 3e6) fail('assembleia.json > 3 MB: implemente a divisão por UF (assembleia/{uf}.json)');

  // ----- Relatório -----
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  console.log('\nArquivo                 KB   UFs  vagas  eleitos  candidatos(listados/total)');
  const linhas: [string, CargoDataset, CargoLido[]][] = [
    ['governador-t1', govDs, [...gov.values()]],
    ['senado', senDs, sen],
    ['camara', camDs, cam],
    ['assembleia', assDs, ass],
  ];
  for (const [nome, ds, lidos] of linhas) {
    const listados = ds.ufs.reduce((a, u) => a + u.candidatos.length, 0);
    const total = lidos.reduce((a, r) => a + r.candidatos.length, 0);
    const eleitos = lidos.reduce((a, r) => a + r.candidatos.filter((c) => ehEleito(c.situacao)).length, 0);
    console.log(
      `${`${nome}.json`.padEnd(22)} ${(tam[nome as keyof typeof tam] / 1024).toFixed(0).padStart(4)}   ${String(ds.ufs.length).padStart(3)}  ${String(somaVagas(lidos)).padStart(5)}  ${String(eleitos).padStart(7)}  ${fmt(listados)}/${fmt(total)}`,
    );
  }
  console.log(`\nGovernador: ${govEleitos} eleitos no 1º turno; 2º turno em ${gov2t.map((g) => g.abr.toUpperCase()).join(', ')}`);
  console.log(`Câmara (composição, top 10): ${camDs.composicao!.slice(0, 10).map((c) => `${c.sigla} ${c.eleitos}`).join(' · ')}`);
  console.log(`Senado (eleitos 2026, top 10): ${senDs.composicao!.slice(0, 10).map((c) => `${c.sigla} ${c.eleitos}`).join(' · ')}`);
  const sj = [...sen, ...cam, ...ass, ...gov.values()].filter((r) => r.subJudice > 0);
  console.log(`Votos anulados sub judice (incluídos em validos, como o TSE): ${sj.length} (UF × cargo), total ${fmt(sj.reduce((a, r) => a + r.subJudice, 0))}`);
  for (const a of avisos) console.log(`⚠ ${a}`);
  console.log(`\nTotal cargos: ${(Object.values(tam).reduce((a, b) => a + b, 0) / 1024).toFixed(0)} KB em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => fail((e as Error).stack ?? String(e)));
