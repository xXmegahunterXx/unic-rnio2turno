/**
 * Formato bruto do feed oficial do TSE (resultados.tse.jus.br/oficial) e construtores de caminho.
 *
 * Tudo aqui foi conferido contra o feed real do 1º turno de 2026 (pleito 3220, eleições 6257/6259) e
 * contra o código do app oficial do TSE (que monta as mesmas URLs). Ver src/tse/README.md.
 *
 * Convenções do feed:
 *  - Números chegam como STRING ("56104503"); percentuais com vírgula ("47,03"); vazio = "".
 *  - Datas "dd/mm/aaaa" e horas "hh:mm:ss" em "horário local" da abrangência (Brasil = Brasília).
 *  - Códigos com zeros à esquerda: eleição 6 dígitos (006258), cargo 4 (0001), município 5, zona 4, seção 4.
 *
 * Arquivo isomórfico: não importa nada de Node nem do DOM.
 */

// ---------------------------------------------------------------------------------------------
// Tipos brutos
// ---------------------------------------------------------------------------------------------

/** Candidato num arquivo de resultado (`-u.json`). */
export interface TseCand {
  /** número na urna */
  n: string;
  sqcand?: string;
  /** nome completo (CAIXA ALTA) */
  nm: string;
  /** nome de urna (CAIXA ALTA) */
  nmu: string;
  dt?: string;
  /** destinação dos votos: "Válido", "Anulado sub judice"… (ausente no 2º turno antes da apuração) */
  dvt?: string;
  /** ordem de exibição do TSE */
  seq?: string;
  /** 's' quando eleito OU classificado para o 2º turno (ver `st`) */
  e?: string;
  /** situação: "Eleito", "2º turno", "Não eleito", "" (em apuração)… */
  st?: string;
  /** votos apurados */
  vap: string;
  /** % de votos (vírgula) sobre `v.vvc` */
  pvap?: string;
  pvapn?: string;
  /** vice(s) */
  vs?: { tp: string; sqcand?: string; nm: string; nmu: string; sgp?: string }[];
}

export interface TsePartido {
  n: string;
  sg: string;
  nm: string;
  nfed?: string;
  tvtn?: string;
  tvan?: string;
  cand: TseCand[];
}

/** Agremiação: 'i' partido isolado · 'c' coligação · 'f' federação. */
export interface TseAgremiacao {
  n: string;
  nm: string;
  tp: string;
  com: string;
  tvtn?: string;
  tvan?: string;
  par: TsePartido[];
}

export interface TseCargo {
  cd: string;
  nmn: string;
  nmm?: string;
  nmf?: string;
  nv?: string;
  fed?: { n: string; sg: string; nm: string; com: string; npar: string[] }[];
  agr: TseAgremiacao[];
}

/** Bloco de seções ("s"). */
export interface TseSecoesBloco {
  /** total de seções */
  ts: string;
  /** seções totalizadas */
  st: string;
  pst?: string;
  snt?: string;
  /** seções instaladas / não instaladas */
  si?: string;
  sni?: string;
  sa?: string;
  sna?: string;
  [k: string]: string | undefined;
}

/** Bloco de eleitorado ("e"). */
export interface TseEleitoradoBloco {
  /** eleitorado total */
  te: string;
  /** eleitorado das seções totalizadas */
  est: string;
  esnt?: string;
  esi?: string;
  esni?: string;
  /** comparecimento */
  c: string;
  /** abstenção (sobre o eleitorado das seções instaladas) */
  a: string;
  pc?: string;
  pa?: string;
  [k: string]: string | undefined;
}

/** Bloco de votos ("v"). */
export interface TseVotosBloco {
  /** total de votos (= comparecimento) */
  tv: string;
  /** válidos computados (= soma de `vap` de todos os candidatos, inclui "anulados sub judice") */
  vvc: string;
  /** válidos */
  vv: string;
  /** nominais */
  vnom: string;
  /** anulados / anulados sub judice */
  van?: string;
  vansj?: string;
  /** brancos */
  vb: string;
  /** total de nulos (nulos + nulos técnicos) */
  tvn: string;
  vn?: string;
  vnt?: string;
  [k: string]: string | undefined;
}

/** Arquivo de resultado: {abr}[{mun}][-z{zona}]-c{cargo}-e{ele}-u.json */
export interface TseResultadoArquivo {
  ele: string;
  /** turno: '1' | '2' */
  t: string;
  /** ambiente: 'o' oficial */
  f: string;
  sup?: string;
  /** 'br' | 'uf' | 'mu' | 'zona' */
  tpabr: string;
  cdabr: string;
  /** data/hora de geração do arquivo */
  dg: string;
  hg: string;
  idg?: string;
  /** data/hora da última totalização ('' antes do início) */
  dt: string;
  ht: string;
  dv?: string;
  /** 's' = totalização finalizada */
  tf: string;
  /** andamento: 'n' não iniciada · 'f' finalizada (demais valores = em andamento) */
  and?: string;
  esae?: string;
  mnae?: unknown[];
  carg: TseCargo[];
  s: TseSecoesBloco;
  e: TseEleitoradoBloco;
  v: TseVotosBloco;
}

/** Item do acompanhamento ("ab"): uma UF (no arquivo br) ou um município (no arquivo da UF). */
export interface TseAcompanhamentoItem {
  and?: string;
  /** 'uf' | 'mun' */
  tpabr: string;
  cdabr: string;
  dt: string;
  ht: string;
  /** municípios não recebidos / parcialmente totalizados / finalizados (só nas linhas de UF do br) */
  munnr?: string;
  munpt?: string;
  munf?: string;
  s: TseSecoesBloco;
  e: TseEleitoradoBloco;
}

/** Acompanhamento: {abr}-e{ele}-ab.json (br → UFs; uf → municípios + a própria UF). */
export interface TseAcompanhamentoArquivo {
  ele: string;
  t: string;
  f?: string;
  dg: string;
  hg: string;
  idg?: string;
  abr: TseAcompanhamentoItem[];
}

/** Municípios: {ele}/config/mun-e{ele}-cm.json */
export interface TseMunicipiosArquivo {
  dg: string;
  hg: string;
  abr: {
    cd: string; // uf minúscula ('zz' = exterior)
    ds: string;
    mu: {
      cd: string; // código TSE (5)
      cdi: string; // código IBGE (7) ('' no exterior)
      nm: string; // CAIXA ALTA
      c: string; // capital 's' | 'n'
      z: string[]; // zonas ('0001')
    }[];
  }[];
}

/** Seção no arquivo de configuração de seções. */
export interface TseSecaoCfg {
  /** número da seção */
  ns: string;
  /** seção principal à qual esta foi agregada (não conta) */
  nsp?: string;
  /** seções agregadas a esta */
  nsa?: string[];
  /** data/hora de publicação dos arquivos da urna (presente ⇒ arquivos publicados ⇒ seção totalizada) */
  da?: string;
  ha?: string;
}

/** Seções: arquivo-urna/{pleito}/config/{uf}/{uf}-p{pleito}-cs.json */
export interface TseSecoesArquivo {
  dg: string;
  hg: string;
  cdp?: string;
  abr: {
    cd: string;
    ds: string;
    mu: { cd: string; nm: string; zon: { cd: string; sec: TseSecaoCfg[] }[] }[];
  }[];
}

/** Arquivos de uma seção: arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/p{pleito}-{uf}-m{mun}-z{zona}-s{secao}-aux.json */
export interface TseAuxArquivo {
  dg: string;
  hg: string;
  f?: string;
  /** "Totalizada" | … */
  st: string;
  hashes: {
    hash: string;
    /** data/hora de recebimento (Brasília) */
    dr: string;
    hr: string;
    /** "Totalizado" | "Recebido" | "Excluído"… */
    st: string;
    arq: { nm: string; tp: string }[];
  }[];
}

/** Configuração geral: comum/config/ele-c.json (apenas o que usamos). */
export interface TseConfigGeralArquivo {
  dg: string;
  hg: string;
  pl: {
    cd: string;
    cdpr?: string;
    c: string; // ciclo
    dt: string;
    e: { cd: string; cdt2?: string; nm: string; t: string; tp: string; abr: { cd: string; cp: { cd: string; ds: string }[] }[] }[];
  }[];
}

// ---------------------------------------------------------------------------------------------
// Caminhos (relativos a `baseUrl`, ex.: https://resultados.tse.jus.br/oficial)
// ---------------------------------------------------------------------------------------------

export const pad = (v: string | number, n: number) => String(v).padStart(n, '0');
const lc = (s: string) => s.toLowerCase();

export const tsePaths = {
  configGeral: () => 'comum/config/ele-c.json',

  municipios: (ciclo: string, ele: string) => `${ciclo}/${ele}/config/mun-e${pad(ele, 6)}-cm.json`,

  /**
   * Resultado de uma abrangência.
   *  - Brasil: abr 'br'
   *  - UF: abr 'sp' (ou 'zz')
   *  - Município: abr 'sp' + mun '71072'
   *  - Zona: abr 'sp' + mun '71072' + zona 1
   */
  resultado: (ciclo: string, ele: string, cargo: string | number, abr: string, mun?: string, zona?: number | string) => {
    const a = lc(abr);
    const m = mun ? pad(mun, 5) : '';
    const z = mun && zona !== undefined && zona !== null && zona !== '' ? `-z${pad(zona, 4)}` : '';
    return `${ciclo}/${ele}/dados/${a}/${a}${m}${z}-c${pad(cargo, 4)}-e${pad(ele, 6)}-u.json`;
  },

  /** Acompanhamento: 'br' lista as UFs; uma UF lista seus municípios (+ a própria UF). */
  acompanhamento: (ciclo: string, ele: string, abr: string) =>
    `${ciclo}/${ele}/dados/${lc(abr)}/${lc(abr)}-e${pad(ele, 6)}-ab.json`,

  secoes: (ciclo: string, pleito: string, uf: string) =>
    `${ciclo}/arquivo-urna/${pleito}/config/${lc(uf)}/${lc(uf)}-p${pad(pleito, 6)}-cs.json`,

  dirSecao: (ciclo: string, pleito: string, uf: string, mun: string, zona: number | string, secao: number | string) =>
    `${ciclo}/arquivo-urna/${pleito}/dados/${lc(uf)}/${pad(mun, 5)}/${pad(zona, 4)}/${pad(secao, 4)}`,

  aux: (ciclo: string, pleito: string, uf: string, mun: string, zona: number | string, secao: number | string) =>
    `${tsePaths.dirSecao(ciclo, pleito, uf, mun, zona, secao)}/p${pad(pleito, 6)}-${lc(uf)}-m${pad(mun, 5)}-z${pad(zona, 4)}-s${pad(secao, 4)}-aux.json`,

  /** Arquivo da urna listado no aux (bu.dat, rdv.dat, log.jez, vota.vsc). */
  arquivoUrna: (
    ciclo: string,
    pleito: string,
    uf: string,
    mun: string,
    zona: number | string,
    secao: number | string,
    hash: string,
    nome: string,
  ) => `${tsePaths.dirSecao(ciclo, pleito, uf, mun, zona, secao)}/${hash}/${nome}`,
};
