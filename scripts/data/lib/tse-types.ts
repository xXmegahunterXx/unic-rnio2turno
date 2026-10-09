/**
 * Tipos (parciais) dos JSON do feed do TSE usados pelo pipeline. Todos os números vêm como string.
 * Só declaramos os campos que lemos; o restante é ignorado.
 */

/** `comum/config/ele-c.json` */
export interface TseConfigGeral {
  dg: string;
  hg: string;
  pl: {
    cd: string; // pleito
    c: string; // ciclo
    dt: string; // data
    e: { cd: string; cdt2: string; nm: string; t: string; abr: { cd: string; cp: { cd: string; ds: string }[] }[] }[];
  }[];
}

/** `{ciclo}/{ele}/config/mun-e{ele}-cm.json` */
export interface TseMunicipiosConfig {
  dg: string;
  hg: string;
  abr: {
    cd: string; // uf minúscula ('zz' = exterior)
    ds: string; // "ACRE"
    mu: { cd: string; cdi: string; nm: string; c: 's' | 'n'; z: string[] }[];
  }[];
}

/**
 * Seção no arquivo de configuração de seções (`-cs.json`).
 *  - `da`/`ha`: data/hora de instalação (ausentes = seção não instalada; ainda conta no total `s.ts`).
 *  - `nsp`: número da seção principal à qual esta foi AGREGADA (não conta como seção).
 *  - `nsa`: seções agregadas a esta.
 */
export interface TseSecao {
  ns: string;
  da?: string;
  ha?: string;
  nsp?: string;
  nsa?: string[];
}

/** `{ciclo}/arquivo-urna/{pleito}/config/{uf}/{uf}-p{pleito}-cs.json` */
export interface TseSecoesConfig {
  dg: string;
  hg: string;
  cdp: string;
  abr: { cd: string; ds: string; mu: { cd: string; nm: string; zon: { cd: string; sec: TseSecao[] }[] }[] }[];
}

/** Bloco de seções ("s") dos arquivos de resultado/abrangência. */
export interface TseS {
  ts: string; // total de seções
  st: string; // seções totalizadas
  si: string; // instaladas
  sni: string; // não instaladas
}

/** Bloco de eleitorado ("e"). */
export interface TseE {
  te: string; // eleitorado apto
  c: string; // comparecimento
  a: string; // abstenção
}

/** Bloco de votos ("v"). */
export interface TseV {
  tv: string; // total de votos (= comparecimento)
  vv: string; // válidos
  vvc: string; // válidos computados (= vv + vansj): denominador do percentual oficial
  vnom: string; // nominais
  vb: string; // brancos
  tvn: string; // total de nulos (vn + vnt)
  vn: string; // nulos
  vnt: string; // nulos técnicos
  van: string; // anulados
  vansj: string; // anulados sub judice
}

/** `{uf}-e{ele}-ab.json` */
export interface TseAbrangencia {
  ele: string;
  dg: string;
  hg: string;
  abr: { tpabr: 'mun' | 'uf' | string; cdabr: string; s: TseS; e: TseE }[];
}

export interface TseVice {
  tp: string;
  nm: string;
  nmu: string;
  sgp: string;
}

export interface TseCandidato {
  n: string; // número na urna
  sqcand: string;
  nm: string; // nome completo (CAIXA ALTA)
  nmu: string; // nome de urna (CAIXA ALTA)
  dvt?: string; // destinação do voto ("Válido")
  e: string; // eleito 's'|'n'
  st: string; // situação ("2º turno", "Não eleito", "Eleito"...)
  vap: string; // votos apurados
  pvap: string;
  vs?: TseVice[];
}

export interface TsePartido {
  n: string;
  sg: string;
  nm: string;
  cand: TseCandidato[];
}

/** Agremiação: partido isolado (tp 'i'), coligação (tp 'c') ou federação. */
export interface TseAgremiacao {
  n: string;
  nm: string;
  tp: string;
  com: string; // composição "PSB / PDT / ..."
  par: TsePartido[];
}

/** `{abr}-c{cargo}-e{ele}-u.json` (resultado de uma abrangência) */
export interface TseResultado {
  ele: string;
  t: string;
  tpabr: string; // 'br' | 'uf' | 'mu'
  cdabr: string;
  dg: string;
  hg: string;
  /** 's' quando a totalização está encerrada. */
  tf: string;
  s: TseS;
  e: TseE;
  v: TseV;
  carg: { cd: string; nmn: string; agr: TseAgremiacao[] }[];
}

/** Converte número do feed ("1.234" não ocorre; vem "1234") em inteiro, com verificação. */
export function int(s: string | undefined, campo = 'valor'): number {
  if (s === undefined || s === '') throw new Error(`Campo numérico ausente: ${campo}`);
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Campo numérico inválido (${campo}): ${JSON.stringify(s)}`);
  return n;
}

/** Lista plana de candidatos de um resultado, com partido e agremiação. */
export function candidatosDe(r: TseResultado): { cand: TseCandidato; par: TsePartido; agr: TseAgremiacao }[] {
  if (r.carg.length !== 1) throw new Error(`Esperado 1 cargo em ${r.cdabr}/${r.ele}, veio ${r.carg.length}`);
  const out: { cand: TseCandidato; par: TsePartido; agr: TseAgremiacao }[] = [];
  for (const agr of r.carg[0].agr) for (const par of agr.par) for (const cand of par.cand) out.push({ cand, par, agr });
  return out;
}
