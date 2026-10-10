/**
 * Valida o perfil do eleitorado (public/data/perfil/{uf}.json, contrato PerfilUfDataset de src/shared/dataset.ts)
 * contra o dataset da fase 1 (public/data/uf/{uf}.json e meta.json, que conferem com o feed oficial do TSE).
 * Conferência independente do ETL em Python (scripts/data/py/perfil_build.py).
 *
 *   npx tsx scripts/data/py/perfil_validate.ts
 *   DATA_DIR=dist/data npx tsx scripts/data/py/perfil_validate.ts
 *
 * Verificações (qualquer falha → código de saída 1):
 *  1. Estrutura: 28 arquivos (27 UFs + ZZ), `uf` certo, rótulos iguais em todas as UFs (22 faixas, escolaridade),
 *     todo número inteiro ≥ 0 e todo vetor com o tamanho dos rótulos.
 *  2. Por agregado: Σ idade[fem] + Σ idade[masc] + naoInformado = eleitores; Σ escolaridade = eleitores;
 *     deficiência, nome social (e extras biometria/quilombola/Libras) ≤ eleitores; extras estadoCivil/racaCor/
 *     identidadeGenero (quando houver) somam eleitores.
 *  3. Municípios: mesmo conjunto de chaves de UfDataset.municipios; total da UF = Σ municípios, campo a campo.
 *  4. Eleitorado: Σ por UF e nacional comparados com UfMeta.eleitorado e meta.totaisPrimeiroTurno.eleitorado —
 *     diferença tolerada ≤ 0,5% por UF e ≤ 0,01% no país (o perfil conta o eleitor no domicílio; os aptos do
 *     1º turno, onde ele vota, com o voto em trânsito). Orçamento total ≤ 6 MB.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DatasetMeta, PerfilAgregado, PerfilUfDataset, UfDataset } from '../../../src/shared/dataset';
import type { UF } from '../../../src/shared/types';
import { UFS } from '../../../src/shared/types';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'public', 'data');
const TODAS: UF[] = [...UFS, 'ZZ'];
const ORCAMENTO = 6e6;

/** Campos extras gravados pelo ETL além do contrato (opcionais). */
interface PerfilAgregadoExtras extends PerfilAgregado {
  estadoCivil?: number[];
  racaCor?: number[];
  identidadeGenero?: number[];
  biometria?: number;
  quilombola?: number;
  interpreteLibras?: number;
}
interface PerfilUfExtras extends PerfilUfDataset {
  dataReferencia?: string;
  estadosCivis?: string[];
  racasCores?: string[];
  identidadesGenero?: string[];
  total: PerfilAgregadoExtras;
  municipios: Record<string, PerfilAgregadoExtras>;
}

const erros: string[] = [];
const falha = (msg: string) => {
  erros.push(msg);
  if (erros.length <= 30) console.error('  ✗ ' + msg);
};
const inteiro = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const soma = (a: number[]) => a.reduce((s, x) => s + x, 0);
const fmt = (n: number) => n.toLocaleString('pt-BR');

async function lerJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, 'utf8')) as T;
}

function vetor(onde: string, v: unknown, n: number): v is number[] {
  if (!Array.isArray(v) || v.length !== n || !v.every(inteiro)) {
    falha(`${onde}: esperado vetor de ${n} inteiros ≥ 0`);
    return false;
  }
  return true;
}

function conferirAgregado(onde: string, a: PerfilAgregadoExtras, d: PerfilUfExtras): void {
  if (!inteiro(a.eleitores) || !inteiro(a.naoInformado)) return falha(`${onde}: eleitores/naoInformado inválidos`);
  const nf = d.faixas.length;
  if (!Array.isArray(a.idade) || a.idade.length !== 2) return falha(`${onde}: idade deve ser [fem[], masc[]]`);
  if (!vetor(`${onde}.idade[0]`, a.idade[0], nf) || !vetor(`${onde}.idade[1]`, a.idade[1], nf)) return;
  const e = a.eleitores;
  const si = soma(a.idade[0]) + soma(a.idade[1]) + a.naoInformado;
  if (si !== e) falha(`${onde}: Σ idade + naoInformado ${si} ≠ eleitores ${e}`);
  if (vetor(`${onde}.escolaridade`, a.escolaridade, d.escolaridade.length) && soma(a.escolaridade) !== e)
    falha(`${onde}: Σ escolaridade ${soma(a.escolaridade)} ≠ ${e}`);
  for (const k of ['deficiencia', 'nomeSocial', 'biometria', 'quilombola', 'interpreteLibras'] as const) {
    const x = a[k];
    if (x !== undefined && (!inteiro(x) || x > e)) falha(`${onde}: ${k} ${x} fora de [0, ${e}]`);
  }
  const extras = [
    ['estadoCivil', d.estadosCivis],
    ['racaCor', d.racasCores],
    ['identidadeGenero', d.identidadesGenero],
  ] as const;
  for (const [k, rot] of extras) {
    const v = a[k];
    if (v === undefined) continue;
    if (!rot) falha(`${onde}: ${k} sem rótulos no topo`);
    else if (vetor(`${onde}.${k}`, v, rot.length) && soma(v) !== e) falha(`${onde}: Σ ${k} ${soma(v)} ≠ ${e}`);
  }
}

/** Soma campo a campo (números e vetores, inclusive aninhados) de vários agregados. */
function somarAgregados(lista: PerfilAgregadoExtras[]): Record<string, unknown> {
  const add = (acc: unknown, x: unknown): unknown => {
    if (typeof x === 'number') return ((acc as number) ?? 0) + x;
    if (Array.isArray(x)) return x.map((y, i) => add((acc as unknown[] | undefined)?.[i], y));
    return acc;
  };
  const out: Record<string, unknown> = {};
  for (const a of lista) for (const [k, v] of Object.entries(a)) out[k] = add(out[k], v);
  return out;
}

async function main() {
  const meta = await lerJson<DatasetMeta>(path.join(DATA, 'meta.json'));
  const eleitoradoUf = new Map(meta.ufs.map((u) => [u.uf, u.eleitorado]));
  let faixas0: string | null = null;
  let escol0: string | null = null;
  let totPerfil = 0;
  let totFase1 = 0;
  let bytes = 0;
  let nMun = 0;
  const linhas: string[] = [];

  for (const uf of TODAS) {
    const arq = path.join(DATA, 'perfil', `${uf.toLowerCase()}.json`);
    let d: PerfilUfExtras;
    try {
      d = await lerJson<PerfilUfExtras>(arq);
    } catch {
      falha(`${uf}: arquivo ausente ou inválido (${arq})`);
      continue;
    }
    bytes += (await stat(arq)).size;
    const fase1 = await lerJson<UfDataset>(path.join(DATA, 'uf', `${uf.toLowerCase()}.json`));
    if (d.uf !== uf) falha(`${uf}: campo uf = ${d.uf}`);
    if (!Array.isArray(d.faixas) || d.faixas.length !== 22) falha(`${uf}: esperadas 22 faixas etárias`);
    if (!Array.isArray(d.escolaridade) || d.escolaridade[0] !== 'Analfabeto' || d.escolaridade[7] !== 'Superior completo')
      falha(`${uf}: escolaridade fora da ordem natural`);
    faixas0 ??= JSON.stringify(d.faixas);
    escol0 ??= JSON.stringify(d.escolaridade);
    if (JSON.stringify(d.faixas) !== faixas0 || JSON.stringify(d.escolaridade) !== escol0)
      falha(`${uf}: rótulos diferentes dos das outras UFs`);

    const cods = fase1.municipios.map((m) => m.cod);
    // Obs.: a ordem das chaves de um objeto em JS não é a do arquivo (chaves numéricas como "71072" vêm antes, em
    // ordem crescente) — quem precisa da ordem canônica usa UfDataset.municipios. Aqui conferimos o conjunto.
    const chaves = Object.keys(d.municipios);
    if (JSON.stringify([...chaves].sort()) !== JSON.stringify([...cods].sort()))
      falha(`${uf}: municípios (${chaves.length}) ≠ fase 1 (${cods.length})`);
    conferirAgregado(`${uf}/total`, d.total, d);
    for (const c of chaves) conferirAgregado(`${uf}/${c}`, d.municipios[c], d);
    nMun += chaves.length;

    const somado = somarAgregados(Object.values(d.municipios));
    for (const [k, v] of Object.entries(somado))
      if (JSON.stringify(v) !== JSON.stringify((d.total as unknown as Record<string, unknown>)[k]))
        falha(`${uf}: total.${k} ≠ Σ municípios`);

    const e1 = eleitoradoUf.get(uf) ?? 0;
    const e1mun = fase1.municipios.reduce((s, m) => s + m.eleitorado, 0);
    if (e1 !== e1mun) falha(`${uf}: meta.eleitorado ${e1} ≠ Σ municípios da fase 1 ${e1mun}`);
    const dif = d.total.eleitores - e1;
    if (Math.abs(dif) / e1 > 0.005) falha(`${uf}: perfil ${d.total.eleitores} difere demais da fase 1 ${e1}`);
    totPerfil += d.total.eleitores;
    totFase1 += e1;
    linhas.push(`${uf} ${fmt(d.total.eleitores).padStart(11)} ${fmt(e1).padStart(11)} ${(dif >= 0 ? '+' : '') + fmt(dif)}`);
  }

  const oficial = meta.totaisPrimeiroTurno.eleitorado;
  if (totFase1 !== oficial) falha(`Σ fase 1 ${totFase1} ≠ meta.totaisPrimeiroTurno.eleitorado ${oficial}`);
  if (Math.abs(totPerfil - oficial) / oficial > 1e-4) falha(`nacional: perfil ${totPerfil} difere demais de ${oficial}`);
  if (bytes > ORCAMENTO) falha(`orçamento: ${(bytes / 1e6).toFixed(2)} MB > 6 MB`);

  console.log('UF      perfil      fase 1  dif');
  for (const l of linhas) console.log(l);
  console.log(
    `Brasil + ZZ: perfil ${fmt(totPerfil)} · aptos 1º turno ${fmt(oficial)} (${totPerfil - oficial >= 0 ? '+' : ''}${fmt(totPerfil - oficial)})` +
      ` · ${nMun} municípios · ${(bytes / 1e6).toFixed(2)} MB`,
  );
  if (erros.length) {
    console.error(`\n${erros.length} falha(s).`);
    process.exit(1);
  }
  console.log('perfil OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
