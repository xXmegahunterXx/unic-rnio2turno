/**
 * Valida o 1º turno REAL por seção (public/data/secao/{uf}.json) e os locais de votação (public/data/locais/{uf}.json)
 * contra o dataset da fase 1 (public/data/uf/{uf}.json, que confere com o TSE), os totais oficiais
 * (meta.totaisPrimeiroTurno) e, por amostragem, contra o Boletim de Urna oficial do feed do TSE.
 *
 *   npx tsx scripts/data/validate-secao.ts            # tudo, com 6 BUs do feed (precisa de rede)
 *   npx tsx scripts/data/validate-secao.ts --sem-bu   # sem rede
 *   DATA_DIR=dist/data npx tsx scripts/data/validate-secao.ts
 *
 * Lê as colunas com decodeU16 (src/shared/u16.ts) e as seções com decodeFaixas (src/shared/calc.ts): é uma conferência
 * independente do ETL em Python (scripts/data/py/secao_build.py) e do contrato SecaoUfDataset/LocaisUfDataset.
 *
 * Verificações (qualquer falha → código de saída 1):
 *  1. Estrutura: 28 arquivos, `n` = UfMeta.secoes = nº de seções da ordem canônica, toda coluna com `n` posições,
 *     Governador presente exatamente nas 7 UFs com 2º turno.
 *  2. Por seção: a + b + outros + brancos + nulos = comparecimento ≤ aptos (Presidente e Governador).
 *  3. Por MUNICÍPIO, 100% exato: Σ seções de aptos, comparecimento, a, b, outros, brancos e nulos = t1 / t1gov
 *     (aptos = eleitorado; outros = Σ votos − a − b). Σ por UF e nacional idem.
 *  4. Nacional (Presidente, Brasil + ZZ) = meta.totaisPrimeiroTurno (seções, eleitorado, comparecimento, brancos,
 *     nulos, válidos).
 *  5. Locais: índice de cada seção válido (ou 0xFFFF, contado), o local tem o mesmo município e zona e lista a seção
 *     em `secoes`; cada seção aparece em exatamente um local; Σ aptos dos locais = Σ aptos das seções; extras
 *     `agregadas` e `segundoTurno` bem formados.
 *  6. Amostra de BUs (aux.json → bu.dat, src/tse/bu.ts): aptos, comparecimento, finalistas, outros, brancos e nulos
 *     de Presidente (e Governador quando houver) iguais aos da seção.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatasetMeta, LocaisUfDataset, SecaoUfDataset, UfDataset } from '../../src/shared/dataset';
import type { UF } from '../../src/shared/types';
import { UFS } from '../../src/shared/types';
import { UFS_GOV_2T } from '../../src/shared/constants';
import { decodeU16 } from '../../src/shared/u16';
import { decodeFaixas } from '../../src/shared/calc';
import { lerBoletimUrna, votosDoCargo, type BuVotosCargo } from '../../src/tse/bu';
import { tsePaths, type TseAuxArquivo } from '../../src/tse/feed';
import { arquivoBu, hashVigente } from '../../src/tse/map';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DATA = path.resolve(ROOT, process.env.DATA_DIR ?? 'public/data');
const TSE = 'https://resultados.tse.jus.br/oficial';
const TODAS: UF[] = [...UFS, 'ZZ'];
const SEM_BU = process.argv.includes('--sem-bu');

/** Colunas de uma corrida (o JSON de Governador traz também `aptos`, campo extra proposto para o contrato). */
type ColunasCorrida = NonNullable<SecaoUfDataset['gov']> & { aptos?: string };
type LocalExtra = LocaisUfDataset['locais'][number] & { agregadas?: string };
type LocaisArquivo = LocaisUfDataset & {
  segundoTurno?: { mudancas: Record<string, number>; locais: LocalExtra[] };
};

const erros: string[] = [];
const avisos: string[] = [];
const falha = (msg: string) => erros.push(msg);

async function lerJson<T>(rel: string): Promise<T> {
  return JSON.parse(await readFile(path.join(DATA, rel), 'utf8')) as T;
}

interface Corrida {
  aptos: Uint16Array;
  comp: Uint16Array;
  a: Uint16Array;
  b: Uint16Array;
  outros: Uint16Array;
  brancos: Uint16Array;
  nulos: Uint16Array;
}
const CAMPOS = ['aptos', 'comp', 'a', 'b', 'outros', 'brancos', 'nulos'] as const;
type Campo = (typeof CAMPOS)[number];
type Soma = Record<Campo, number>;
const zero = (): Soma => ({ aptos: 0, comp: 0, a: 0, b: 0, outros: 0, brancos: 0, nulos: 0 });

function decodificar(ctx: string, n: number, aptos: Uint16Array, c: ColunasCorrida): Corrida {
  const col = (k: keyof ColunasCorrida) => {
    const b64 = c[k];
    if (typeof b64 !== 'string') {
      falha(`${ctx}: coluna ${String(k)} ausente`);
      return new Uint16Array(n);
    }
    const v = decodeU16(b64);
    if (v.length !== n) falha(`${ctx}: coluna ${String(k)} com ${v.length} posições (esperado ${n})`);
    return v;
  };
  return {
    aptos: c.aptos !== undefined ? col('aptos') : aptos,
    comp: col('comp'),
    a: col('a'),
    b: col('b'),
    outros: col('outros'),
    brancos: col('brancos'),
    nulos: col('nulos'),
  };
}

function finalistas(meta: DatasetMeta, raceId: string): [string, string] {
  const race = meta.races.find((r) => r.id === raceId);
  if (!race || race.candidatos.length !== 2) throw new Error(`corrida ${raceId} sem 2 finalistas no meta.json`);
  const [x, y] = race.candidatos.map((c) => c.numero).sort((p, q) => p - q);
  return [String(x), String(y)];
}

interface SecaoRef {
  uf: UF;
  cod: string;
  zona: number;
  secao: number;
  i: number;
}

async function main() {
  const meta = await lerJson<DatasetMeta>('meta.json');
  const [pa, pb] = finalistas(meta, 'pres');
  const nacional = zero();
  let secoesNac = 0;
  let semLocal = 0;
  let locaisTotal = 0;
  let mudancas2t = 0;
  const amostras: { ref: SecaoRef; pres: Soma; gov: Soma | null }[] = [];
  const computadosPres = new Set<string>();
  const computadosGov = new Map<UF, Set<string>>();
  const ufds = new Map<UF, UfDataset>();
  for (const uf of TODAS) {
    const ufd = await lerJson<UfDataset>(`uf/${uf.toLowerCase()}.json`);
    ufds.set(uf, ufd);
    for (const m of ufd.municipios) {
      for (const n of Object.keys(m.t1.votos)) computadosPres.add(n);
      if (m.t1gov) {
        const s = computadosGov.get(uf) ?? new Set<string>();
        for (const n of Object.keys(m.t1gov.votos)) s.add(n);
        computadosGov.set(uf, s);
      }
    }
  }

  for (const uf of TODAS) {
    const ufl = uf.toLowerCase();
    const ufd = ufds.get(uf)!;
    const um = meta.ufs.find((u) => u.uf === uf);
    if (!um) {
      falha(`[${uf}] ausente do meta.json`);
      continue;
    }
    if (!existsSync(path.join(DATA, 'secao', `${ufl}.json`))) {
      falha(`[${uf}] falta secao/${ufl}.json`);
      continue;
    }
    const sd = await lerJson<SecaoUfDataset>(`secao/${ufl}.json`);
    // ordem canônica
    const ordem: { cod: string; zona: number; secao: number }[] = [];
    for (const m of ufd.municipios) for (const z of m.zonas) for (const s of decodeFaixas(z.s)) ordem.push({ cod: m.cod, zona: z.z, secao: s });
    const n = ordem.length;
    if (sd.uf !== uf) falha(`[${uf}] campo uf = ${sd.uf}`);
    if (sd.n !== n || n !== um.secoes) falha(`[${uf}] n = ${sd.n}, ordem canônica ${n}, meta ${um.secoes}`);
    secoesNac += sd.n;
    const aptos = decodeU16(sd.aptos);
    if (aptos.length !== n) falha(`[${uf}] aptos com ${aptos.length} posições`);
    const pres = decodificar(`[${uf} pres]`, n, aptos, sd.pres);
    const temGov = UFS_GOV_2T.includes(uf);
    if (temGov !== Boolean(sd.gov)) falha(`[${uf}] Governador ${sd.gov ? 'presente' : 'ausente'} (esperado ${temGov ? 'presente' : 'ausente'})`);
    const gov = sd.gov ? decodificar(`[${uf} gov]`, n, aptos, sd.gov as ColunasCorrida) : null;
    const [ga, gb] = gov ? finalistas(meta, `gov-${ufl}`) : ['', ''];

    // por seção
    for (const [nome, c] of [['Presidente', pres], ['Governador', gov]] as const) {
      if (!c) continue;
      let ruins = 0;
      for (let i = 0; i < n; i++) {
        const soma = c.a[i] + c.b[i] + c.outros[i] + c.brancos[i] + c.nulos[i];
        if (soma !== c.comp[i] || c.comp[i] > c.aptos[i]) {
          if (ruins++ < 5) falha(`[${uf} ${nome}] seção ${ordem[i].cod} ${ordem[i].zona}/${ordem[i].secao}: votos ${soma}, comp ${c.comp[i]}, aptos ${c.aptos[i]}`);
        }
      }
      if (ruins > 5) falha(`[${uf} ${nome}] … ${ruins} seções inconsistentes no total`);
    }

    // por município
    const somaMun = (c: Corrida) => {
      const out = new Map<string, Soma>();
      for (let i = 0; i < n; i++) {
        const s = out.get(ordem[i].cod) ?? zero();
        for (const k of CAMPOS) s[k] += c[k][i];
        out.set(ordem[i].cod, s);
      }
      return out;
    };
    const conferir = (nome: string, c: Corrida, fa: string, fb: string, campo: 't1' | 't1gov') => {
      const somas = somaMun(c);
      const totUf = zero();
      const espUf = zero();
      let divergentes = 0;
      for (const m of ufd.municipios) {
        const t = m[campo];
        if (!t) {
          falha(`[${uf} ${nome}] ${m.cod} sem ${campo}`);
          continue;
        }
        const validos = Object.values(t.votos).reduce((p, q) => p + q, 0);
        const a = t.votos[fa] ?? 0;
        const b = t.votos[fb] ?? 0;
        const esp: Soma = { aptos: t.eleitorado, comp: t.comparecimento, a, b, outros: validos - a - b, brancos: t.brancos, nulos: t.nulos };
        const s = somas.get(m.cod) ?? zero();
        const dif = CAMPOS.filter((k) => s[k] !== esp[k]);
        if (dif.length) {
          if (divergentes++ < 10) falha(`[${uf} ${nome}] ${m.cod} ${m.nome}: ${dif.map((k) => `${k} seções ${s[k]} ≠ município ${esp[k]}`).join('; ')}`);
        }
        for (const k of CAMPOS) {
          totUf[k] += s[k];
          espUf[k] += esp[k];
        }
      }
      if (divergentes > 10) falha(`[${uf} ${nome}] … ${divergentes} municípios divergentes`);
      return { totUf, espUf, divergentes };
    };
    const rp = conferir('Presidente', pres, pa, pb, 't1');
    for (const k of CAMPOS) nacional[k] += rp.totUf[k];
    let linhaGov = '';
    if (gov) {
      const rg = conferir('Governador', gov, ga, gb, 't1gov');
      const difAptos = gov.aptos.reduce((acc, v, i) => acc + (v !== aptos[i] ? 1 : 0), 0);
      linhaGov = ` · gov ${ufd.municipios.length - rg.divergentes}/${ufd.municipios.length} mun. ok (Σ comp ${rg.totUf.comp}, a ${rg.totUf.a}, b ${rg.totUf.b}; ${difAptos} seções com aptos gov ≠ pres)`;
    }

    // locais
    const principaisComAgregadas = new Set<string>();
    const lpath = path.join(DATA, 'locais', `${ufl}.json`);
    let linhaLoc = '';
    if (!existsSync(lpath)) {
      falha(`[${uf}] falta locais/${ufl}.json`);
    } else {
      const ld = await lerJson<LocaisArquivo>(`locais/${ufl}.json`);
      const locais = ld.locais as LocalExtra[];
      locaisTotal += locais.length;
      const local = decodeU16(sd.local);
      if (local.length !== n) falha(`[${uf}] local com ${local.length} posições`);
      const vistoEm = new Map<string, number>();
      locais.forEach((l, j) => {
        if (!l.nome || !l.endereco || !/^\d{5}$/.test(l.cod) || !Number.isInteger(l.nr) || !Number.isInteger(l.zona)) {
          falha(`[${uf}] local ${j} malformado: ${JSON.stringify(l).slice(0, 160)}`);
        }
        if ((l.lat === undefined) !== (l.lon === undefined)) falha(`[${uf}] local ${j} com só uma coordenada`);
        for (const s of decodeFaixas(l.secoes)) {
          const k = `${l.cod}:${l.zona}:${s}`;
          if (vistoEm.has(k)) falha(`[${uf}] seção ${k} em dois locais (${vistoEm.get(k)} e ${j})`);
          vistoEm.set(k, j);
        }
        if (l.agregadas && !/^\d+>\d+(,\d+>\d+)*$/.test(l.agregadas)) falha(`[${uf}] local ${j}: agregadas malformado`);
      });
      for (const l of locais) {
        for (const par of l.agregadas?.split(',') ?? []) principaisComAgregadas.add(`${l.cod}:${l.zona}:${par.split('>')[1]}`);
      }
      let semLocalUf = 0;
      const aptosLocal = new Float64Array(locais.length);
      for (let i = 0; i < n; i++) {
        const j = local[i];
        const o = ordem[i];
        if (j === 0xffff) {
          semLocalUf++;
          continue;
        }
        const l = locais[j];
        if (!l) {
          falha(`[${uf}] seção ${o.cod} ${o.zona}/${o.secao}: índice de local ${j} fora da lista (${locais.length})`);
          continue;
        }
        if (l.cod !== o.cod || l.zona !== o.zona || vistoEm.get(`${o.cod}:${o.zona}:${o.secao}`) !== j) {
          falha(`[${uf}] seção ${o.cod} ${o.zona}/${o.secao} aponta para local ${j} (${l.cod} z${l.zona}) que não a lista`);
        }
        aptosLocal[j] += aptos[i];
      }
      if (vistoEm.size !== n - semLocalUf) falha(`[${uf}] locais listam ${vistoEm.size} seções; seções com local: ${n - semLocalUf}`);
      let aptosDif = 0;
      locais.forEach((l, j) => {
        if (l.aptos !== aptosLocal[j]) aptosDif++;
      });
      if (aptosDif) falha(`[${uf}] ${aptosDif} locais com aptos ≠ Σ aptos das suas seções`);
      semLocal += semLocalUf;
      const st = ld.segundoTurno;
      if (st) {
        const total = locais.length + st.locais.length;
        for (const [k, j] of Object.entries(st.mudancas)) {
          if (!/^\d{5}:\d+:\d+$/.test(k) || !vistoEm.has(k)) falha(`[${uf}] segundoTurno: seção ${k} inexistente`);
          if (!Number.isInteger(j) || j < 0 || j >= total) falha(`[${uf}] segundoTurno: índice ${j} fora de [0, ${total})`);
        }
        mudancas2t += Object.keys(st.mudancas).length;
      }
      linhaLoc = ` · ${locais.length} locais${semLocalUf ? `, ${semLocalUf} seções sem local` : ''}${st ? `, ${Object.keys(st.mudancas).length} mudam no 2º turno` : ''}`;
    }

    console.log(
      `${uf}: ${n} seções · pres ${ufd.municipios.length - rp.divergentes}/${ufd.municipios.length} mun. ok (Σ aptos ${rp.totUf.aptos}, comp ${rp.totUf.comp})${linhaGov}${linhaLoc}`,
    );

    // amostra para o BU: 1ª seção com comparecimento > 0 em municípios-chave + casos difíceis
    const escolher = (pred: (i: number) => boolean) => {
      for (let i = 0; i < n; i++) if (pred(i)) return i;
      return -1;
    };
    const capital = um.capitalCod;
    const candidatos: number[] = [];
    if (uf === 'SP' || uf === 'RJ' || uf === 'BA') candidatos.push(escolher((i) => ordem[i].cod === capital && pres.comp[i] > 0));
    if (uf === 'DF' && gov) candidatos.push(escolher((i) => gov.aptos[i] !== aptos[i] && gov.comp[i] > 0)); // trânsito
    if (uf === 'RJ' && gov) candidatos.push(escolher((i) => ordem[i].cod !== capital && gov.aptos[i] !== aptos[i] && gov.comp[i] > 0));
    if (uf === 'ZZ') candidatos.push(escolher((i) => pres.comp[i] > 100));
    if (uf === 'AC' && principaisComAgregadas.size) {
      // seção principal que recebeu o eleitorado de seções agregadas (o BU é da urna da principal)
      candidatos.push(escolher((i) => principaisComAgregadas.has(`${ordem[i].cod}:${ordem[i].zona}:${ordem[i].secao}`) && pres.comp[i] > 0));
    }
    for (const i of candidatos) {
      if (i < 0) continue;
      const pick = (c: Corrida): Soma => ({ aptos: c.aptos[i], comp: c.comp[i], a: c.a[i], b: c.b[i], outros: c.outros[i], brancos: c.brancos[i], nulos: c.nulos[i] });
      amostras.push({ ref: { uf, ...ordem[i], i }, pres: pick(pres), gov: gov ? pick(gov) : null });
    }
  }

  // nacional
  const tp = meta.totaisPrimeiroTurno;
  const validos = nacional.a + nacional.b + nacional.outros;
  const esperadoNac: [string, number, number][] = [
    ['seções', secoesNac, tp.secoes],
    ['eleitorado', nacional.aptos, tp.eleitorado],
    ['comparecimento', nacional.comp, tp.comparecimento],
    ['brancos', nacional.brancos, tp.brancos],
    ['nulos', nacional.nulos, tp.nulos],
    ['válidos', validos, tp.validos],
  ];
  for (const [nome, obtido, esperado] of esperadoNac) if (obtido !== esperado) falha(`nacional: ${nome} ${obtido} ≠ oficial ${esperado}`);
  const presRace = meta.races.find((r) => r.id === 'pres');
  for (const [i, c] of (presRace?.candidatos ?? []).entries()) {
    const obtido = i === 0 ? nacional.a : nacional.b;
    if (c.primeiroTurno && c.primeiroTurno.votos !== obtido) falha(`nacional: ${c.nomeUrna} ${obtido} ≠ ${c.primeiroTurno.votos}`);
  }
  console.log(
    `\nNacional (Presidente, Brasil + ZZ): ${secoesNac} seções · eleitorado ${nacional.aptos} · comparecimento ${nacional.comp} · ` +
      `${pa} ${nacional.a} · ${pb} ${nacional.b} · outros ${nacional.outros} · brancos ${nacional.brancos} · nulos ${nacional.nulos} · válidos ${validos}`,
  );
  console.log(`Locais: ${locaisTotal} · seções sem local: ${semLocal} · seções que mudam de local no 2º turno: ${mudancas2t}`);

  // BUs
  if (SEM_BU) {
    avisos.push('conferência com o BU pulada (--sem-bu)');
  } else {
    console.log(`\nBoletins de urna (feed oficial, pleito 3220) — ${amostras.length} seções:`);
    for (const am of amostras) {
      const { uf, cod, zona, secao } = am.ref;
      const id = `${uf} ${cod} ${zona}/${secao}`;
      try {
        const auxRes = await fetch(`${TSE}/${tsePaths.aux('ele2026', '3220', uf, cod, zona, secao)}`, { signal: AbortSignal.timeout(30_000) });
        if (!auxRes.ok) throw new Error(`aux HTTP ${auxRes.status}`);
        const aux = (await auxRes.json()) as TseAuxArquivo;
        const h = hashVigente(aux);
        const nome = h ? arquivoBu(h) : null;
        if (!h || !nome) throw new Error('aux sem BU');
        const buRes = await fetch(`${TSE}/${tsePaths.arquivoUrna('ele2026', '3220', uf, cod, zona, secao, h.hash, nome)}`, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!buRes.ok) throw new Error(`bu HTTP ${buRes.status}`);
        const bu = lerBoletimUrna(new Uint8Array(await buRes.arrayBuffer()));
        const comparar = (rotulo: string, v: BuVotosCargo | null, esperado: Soma, fa: string, fb: string, comp: Set<string>) => {
          if (!v) return falha(`[BU ${id}] ${rotulo} ausente do BU`);
          let outros = 0;
          let naoComp = 0;
          for (const [num, q] of v.nominais) {
            const k = String(num);
            if (k === fa || k === fb) continue;
            if (comp.has(k)) outros += q;
            else naoComp += q;
          }
          const doBu: Soma = {
            aptos: v.aptos,
            comp: v.comparecimento,
            a: v.nominais.get(Number(fa)) ?? 0,
            b: v.nominais.get(Number(fb)) ?? 0,
            outros,
            brancos: v.brancos,
            nulos: v.nulos + naoComp,
          };
          const dif = CAMPOS.filter((k) => doBu[k] !== esperado[k]);
          const txt = CAMPOS.map((k) => `${k} ${esperado[k]}`).join(' ');
          if (dif.length || v.legenda) falha(`[BU ${id}] ${rotulo}: ${dif.map((k) => `${k} dataset ${esperado[k]} ≠ BU ${doBu[k]}`).join('; ')}`);
          else console.log(`  ok ${id} ${rotulo}: ${txt}`);
        };
        comparar('Presidente', votosDoCargo(bu, 6257, 1), am.pres, pa, pb, computadosPres);
        if (am.gov) {
          const [ga, gb] = finalistas(meta, `gov-${uf.toLowerCase()}`);
          comparar('Governador', votosDoCargo(bu, 6259, 3), am.gov, ga, gb, computadosGov.get(uf) ?? new Set());
        }
      } catch (e) {
        avisos.push(`BU ${id} indisponível: ${(e as Error).message}`);
      }
    }
  }

  for (const a of avisos) console.log(`aviso: ${a}`);
  if (erros.length) {
    console.error(`\n${erros.length} ERRO(S):`);
    for (const e of erros.slice(0, 200)) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log('\nOK: seções, municípios, UFs, nacional e locais conferem.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
