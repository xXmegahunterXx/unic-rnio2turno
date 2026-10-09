/**
 * Baixa do feed oficial do TSE tudo o que o pipeline precisa e guarda em `data-raw/tse/` (cache).
 *
 *   npx tsx scripts/data/fetch-tse.ts            # usa o cache; baixa só o que falta (+ atualiza arquivos do 2º turno)
 *   npx tsx scripts/data/fetch-tse.ts --force    # rebaixa tudo
 *   npx tsx scripts/data/fetch-tse.ts --offline  # não acessa a rede; só confere se o cache está completo
 *
 * Arquivos (ver ARCHITECTURE.md §4.1 e scripts/data/lib/tse-feed.ts):
 *   - comum/config/ele-c.json                               (conferência dos códigos de pleito/eleição)
 *   - ele2026/6257/config/mun-e006257-cm.json               (municípios, IBGE, capitais, zonas)
 *   - ele2026/arquivo-urna/3220/config/{uf}/…-cs.json       (todas as seções, 27 UFs + zz)
 *   - ele2026/6257/dados/{uf}/{uf}-e006257-ab.json          (seções/eleitorado/comparecimento por município)
 *   - ele2026/6257/dados/{uf}/{uf}[{mun}]-c0001-e006257-u.json  (Presidente 1º turno: UF e cada município)
 *   - ele2026/6257/dados/br/br-c0001-e006257-u.json         (Presidente 1º turno: Brasil + exterior)
 *   - ele2026/6259/dados/{uf}/{uf}[{mun}]-c0003-e006259-u.json  (Governador 1º turno, só nas 7 UFs com 2º turno)
 *   - ele2026/6258/dados/br/br-c0001-e006258-u.json         (2º turno Presidente: candidatos; sempre atualizado)
 *   - ele2026/6260/dados/{uf}/{uf}-c0003-e006260-u.json     (2º turno Governador: opcional, pode não existir ainda)
 */
import { createFetcher, rawPath, readRaw } from './lib/cache';
import { existsSync } from 'node:fs';
import {
  ELE_GOV_T1,
  ELE_GOV_T2,
  ELE_PRES_T1,
  ELE_PRES_T2,
  PLEITO_T1,
  PLEITO_T2,
  CICLO,
  UFS_GOV,
  paths,
  resGovMun,
  resGovUf,
  resGovUfT2,
  resPresBr,
  resPresBrT2,
  resPresMun,
  resPresUf,
} from './lib/tse-feed';
import type { TseConfigGeral, TseMunicipiosConfig } from './lib/tse-types';

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const OFFLINE = args.has('--offline');

const t0 = Date.now();
const fetcher = createFetcher({ concorrencia: 12, refresh: FORCE });

async function etapa(nome: string, lista: { p: string; opcional?: boolean; refresh?: boolean }[]) {
  const t = Date.now();
  if (OFFLINE) {
    const ausentes = lista.filter((x) => !existsSync(rawPath(x.p)));
    const faltando = ausentes.filter((x) => !x.opcional);
    if (faltando.length) throw new Error(`[offline] ${faltando.length} arquivo(s) ausente(s) em ${nome}, ex.: ${faltando[0].p}`);
    console.log(`✓ ${nome}: ${lista.length - ausentes.length}/${lista.length} arquivo(s) no cache`);
    return ausentes.map((x) => x.p);
  }
  let feitos = 0;
  const inexistentes: string[] = [];
  const passo = Math.max(250, Math.ceil(lista.length / 10));
  const resultados = await Promise.allSettled(
    lista.map(async (x) => {
      const r = await fetcher.ensure(x.p, { opcional: x.opcional, refresh: x.refresh });
      if (r === 'inexistente') inexistentes.push(x.p);
      feitos++;
      if (lista.length > passo && feitos % passo === 0) console.log(`  … ${nome}: ${feitos}/${lista.length}`);
    }),
  );
  const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (falhas.length) {
    for (const f of falhas.slice(0, 10)) console.error(`  ✗ ${(f.reason as Error).message}`);
    throw new Error(`${falhas.length} arquivo(s) falharam em "${nome}" (rode de novo: o cache preserva o que já baixou)`);
  }
  console.log(`✓ ${nome}: ${lista.length} arquivo(s) em ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return inexistentes;
}

async function main() {
  console.log(`Feed TSE → ${rawPath('')}${FORCE ? ' (--force)' : ''}${OFFLINE ? ' (--offline)' : ''}`);

  // 1) Configuração geral: confere que os códigos que usamos continuam valendo.
  await etapa('config geral', [{ p: paths.config(), refresh: true }]);
  const cfg = await readRaw<TseConfigGeral>(paths.config());
  const pl1 = cfg.pl.find((p) => p.cd === PLEITO_T1 && p.c === CICLO);
  const pl2 = cfg.pl.find((p) => p.cd === PLEITO_T2 && p.c === CICLO);
  if (!pl1 || !pl2) throw new Error(`Pleitos ${PLEITO_T1}/${PLEITO_T2} não encontrados em ele-c.json`);
  const ePres = pl1.e.find((e) => e.cd === ELE_PRES_T1);
  const eGov = pl1.e.find((e) => e.cd === ELE_GOV_T1);
  if (!ePres || ePres.cdt2 !== ELE_PRES_T2) throw new Error(`Eleição ${ELE_PRES_T1}→${ELE_PRES_T2} não confere`);
  if (!eGov || eGov.cdt2 !== ELE_GOV_T2) throw new Error(`Eleição ${ELE_GOV_T1}→${ELE_GOV_T2} não confere`);
  if (!pl2.e.some((e) => e.cd === ELE_PRES_T2)) throw new Error(`Eleição ${ELE_PRES_T2} ausente do pleito ${PLEITO_T2}`);
  const gov2tListado = pl2.e.some((e) => e.cd === ELE_GOV_T2);
  console.log(
    `  pleito ${pl1.cd} (${pl1.dt}) · ${ePres.nm} → ${ePres.cdt2}; ${eGov.nm} → ${eGov.cdt2}` +
      `\n  pleito ${pl2.cd} (${pl2.dt}) · eleição ${ELE_GOV_T2} ${gov2tListado ? 'listada' : 'ainda NÃO listada'} no config`,
  );

  // 2) Municípios (inclui 'zz').
  await etapa('municípios (cm)', [{ p: paths.municipios() }]);
  const cm = await readRaw<TseMunicipiosConfig>(paths.municipios());
  const ufs = cm.abr.map((a) => a.cd);
  const totalMun = cm.abr.reduce((s, a) => s + a.mu.length, 0);
  console.log(`  ${ufs.length} abrangências (${ufs.join(' ')}), ${totalMun} municípios/cidades`);
  if (ufs.length !== 28 || !ufs.includes('zz')) throw new Error('Esperadas 27 UFs + zz no arquivo de municípios');

  // 3) Por UF: seções, abrangência e resultado agregado da UF.
  await etapa(
    'seções (cs)',
    ufs.map((uf) => ({ p: paths.secoes(uf) })),
  );
  await etapa(
    'abrangência (ab)',
    ufs.map((uf) => ({ p: paths.abrangencia(uf) })),
  );
  await etapa('Presidente 1T · Brasil e UFs', [{ p: resPresBr() }, ...ufs.map((uf) => ({ p: resPresUf(uf) }))]);

  // 4) Presidente 1T por município (~5.570 + exterior).
  await etapa(
    'Presidente 1T · municípios',
    cm.abr.flatMap((a) => a.mu.map((m) => ({ p: resPresMun(a.cd, m.cd) }))),
  );

  // 5) Governador 1T nas UFs com 2º turno.
  const gov = cm.abr.filter((a) => UFS_GOV.includes(a.cd));
  if (gov.length !== UFS_GOV.length) throw new Error('UF de governador ausente do arquivo de municípios');
  await etapa('Governador 1T · UFs', UFS_GOV.map((uf) => ({ p: resGovUf(uf) })));
  await etapa(
    'Governador 1T · municípios',
    gov.flatMap((a) => a.mu.map((m) => ({ p: resGovMun(a.cd, m.cd) }))),
  );

  // 6) 2º turno (arquivos vivos: sempre tenta atualizar; os de Governador podem não existir ainda).
  await etapa('Presidente 2T · Brasil', [{ p: resPresBrT2(), refresh: true }]);
  const semGov2t = await etapa(
    'Governador 2T · UFs (opcional)',
    UFS_GOV.map((uf) => ({ p: resGovUfT2(uf), opcional: true, refresh: true })),
  );
  if (semGov2t.length) {
    console.log(
      `  ${semGov2t.length}/${UFS_GOV.length} arquivo(s) de Governador 2T ainda não publicados pelo TSE;` +
        ' o build deriva os finalistas do 1º turno (st = "2º turno").',
    );
  }

  if (OFFLINE) {
    console.log(`\nCache completo (offline) em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return;
  }
  const s = fetcher.stats;
  console.log(
    `\nConcluído em ${((Date.now() - t0) / 1000).toFixed(1)} s · baixados ${s.baixados} ` +
      `(${(s.bytes / 1e6).toFixed(1)} MB) · do cache ${s.doCache} · inexistentes ${s.inexistentes} · ` +
      `retries ${s.tentativasExtras} · falhas ${s.falhas}`,
  );
}

main().catch((err) => {
  console.error(`\n✗ fetch-tse falhou: ${(err as Error).message}`);
  process.exit(1);
});
