/**
 * Leitor do Boletim de Urna (BU) oficial publicado pelo TSE (`o{pleito}{uf}{mun}{zona}{secao}-bu.dat`).
 *
 * O TSE NÃO publica BU em texto em 2026 (`-imgbu.dat` dá 404); o aux.json de cada seção lista só
 * `bu.dat` (ASN.1 BER), `rdv.dat` (ASN.1), `log.jez` (7z) e `vota.vsc` (assinatura). Este módulo traz
 * um decodificador BER mínimo e lê do BU apenas o necessário para o cartão da seção: identificação,
 * datas, carga da urna, eleitores aptos, comparecimento e votos por cargo/candidato.
 *
 * Estrutura (conferida no schema embutido no app oficial e byte a byte num BU real):
 *
 *   EntidadeEnvelopeGenerico ::= SEQUENCE {
 *     cabecalho CabecalhoEntidade, fase ENUMERATED, identificacao CHOICE([0] seção | [1] contingência),
 *     tipoEnvelope ENUMERATED (1 = BU), conteudo OCTET STRING  -- contém EntidadeBoletimUrna
 *   }
 *   EntidadeBoletimUrna ::= SEQUENCE {
 *     cabecalho, fase, urna Urna, identificacao IdentificacaoSecao, dataHoraEmissao GeneralString,
 *     dadosSecaoSA CHOICE([0] dadosSecao{abertura, encerramento} | [1] dadosSA) OPTIONAL,
 *     qtdEleitoresCompareceram INTEGER, [1] qtdEleitoresCompBiometrico OPTIONAL,
 *     resultadosVotacaoPorEleicao SEQUENCE OF {
 *       idEleicao INTEGER, qtdEleitoresAptos INTEGER, (aptosSecao, aptosTTE INTEGER)?,
 *       resultadosVotacao SEQUENCE OF {
 *         tipoCargo ENUMERATED, qtdComparecimento INTEGER,
 *         totaisVotosCargo SEQUENCE OF {
 *           codigoCargo CHOICE([1] cargoConstitucional | [2] consulta), ordemImpressao INTEGER,
 *           votosVotaveis SEQUENCE OF {
 *             [1] tipoVoto (1 nominal, 2 branco, 3 nulo, 4 legenda, 5 cargoSemCandidato),
 *             [2] quantidadeVotos, [3] identificacaoVotavel { partido, codigo } OPTIONAL, …, hash
 *           } } } }, …
 *   }
 *
 * Isomórfico (Uint8Array).
 */

// ---------------------------------------------------------------------------------------------
// BER mínimo
// ---------------------------------------------------------------------------------------------

export interface BerNo {
  /** 0 universal · 1 application · 2 context · 3 private */
  classe: number;
  construido: boolean;
  tag: number;
  /** início do conteúdo (após cabeçalho) */
  inicio: number;
  /** tamanho do conteúdo */
  tamanho: number;
  filhos?: BerNo[];
}

const UNIV_INTEGER = 2;
const UNIV_OCTET = 4;
const UNIV_ENUM = 10;
const UNIV_SEQ = 16;
const UNIV_GENERALSTRING = 27;

export class BuFormatoError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BuFormatoError';
  }
}

/** Decodifica um TLV em `buf[pos..fim)`; desce em construídos. */
export function berLer(buf: Uint8Array, pos = 0, fim = buf.length, profundidade = 0): { no: BerNo; prox: number } {
  if (profundidade > 32) throw new BuFormatoError('BER: aninhamento excessivo');
  if (pos >= fim) throw new BuFormatoError('BER: fim inesperado');
  const b0 = buf[pos++];
  const classe = b0 >> 6;
  const construido = (b0 & 0x20) !== 0;
  let tag = b0 & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    let b: number;
    let n = 0;
    do {
      if (pos >= fim) throw new BuFormatoError('BER: tag truncada');
      b = buf[pos++];
      tag = tag * 128 + (b & 0x7f);
      if (++n > 4) throw new BuFormatoError('BER: tag longa demais');
    } while (b & 0x80);
  }
  if (pos >= fim) throw new BuFormatoError('BER: comprimento ausente');
  let tamanho = buf[pos++];
  if (tamanho === 0x80) throw new BuFormatoError('BER: comprimento indefinido não suportado');
  if (tamanho & 0x80) {
    const n = tamanho & 0x7f;
    if (n > 4) throw new BuFormatoError('BER: comprimento longo demais');
    tamanho = 0;
    for (let i = 0; i < n; i++) {
      if (pos >= fim) throw new BuFormatoError('BER: comprimento truncado');
      tamanho = tamanho * 256 + buf[pos++];
    }
  }
  const inicio = pos;
  const prox = inicio + tamanho;
  if (prox > fim) throw new BuFormatoError('BER: conteúdo além do fim');
  const no: BerNo = { classe, construido, tag, inicio, tamanho };
  if (construido) {
    const filhos: BerNo[] = [];
    let p = inicio;
    while (p < prox) {
      const r = berLer(buf, p, prox, profundidade + 1);
      filhos.push(r.no);
      p = r.prox;
    }
    no.filhos = filhos;
  }
  return { no, prox };
}

/** Desce num OCTET STRING que contém outra estrutura BER. */
function berDentro(buf: Uint8Array, no: BerNo): BerNo {
  return berLer(buf, no.inicio, no.inicio + no.tamanho).no;
}

export function berInt(buf: Uint8Array, no: BerNo): number {
  if (no.tamanho === 0) return 0;
  if (no.tamanho > 6) throw new BuFormatoError('BER: inteiro grande demais');
  let v = buf[no.inicio] & 0x80 ? -1 : 0;
  // complemento de dois: começa em -1 quando o bit de sinal está ligado
  for (let i = 0; i < no.tamanho; i++) v = v * 256 + buf[no.inicio + i];
  return v;
}

export function berStr(buf: Uint8Array, no: BerNo): string {
  let s = '';
  for (let i = 0; i < no.tamanho; i++) s += String.fromCharCode(buf[no.inicio + i]);
  return s;
}

export function berHex(buf: Uint8Array, no: BerNo): string {
  let s = '';
  for (let i = 0; i < no.tamanho; i++) s += buf[no.inicio + i].toString(16).padStart(2, '0');
  return s;
}

const eh = (no: BerNo | undefined, classe: number, tag: number) => !!no && no.classe === classe && no.tag === tag;
const ehU = (no: BerNo | undefined, tag: number) => eh(no, 0, tag);

// ---------------------------------------------------------------------------------------------
// Boletim de Urna
// ---------------------------------------------------------------------------------------------

export const TIPO_VOTO = { nominal: 1, branco: 2, nulo: 3, legenda: 4, cargoSemCandidato: 5 } as const;

export interface BuVotavel {
  /** 1 nominal · 2 branco · 3 nulo · 4 legenda · 5 cargo sem candidato */
  tipoVoto: number;
  quantidade: number;
  partido: number | null;
  /** número do candidato (null para branco/nulo) */
  codigo: number | null;
}

export interface BuCargo {
  /** código do cargo constitucional (1 Presidente, 3 Governador…) ou da consulta */
  codigoCargo: number;
  consulta: boolean;
  /** 1 majoritário · 2 proporcional · 3 consulta */
  tipoCargo: number;
  comparecimento: number;
  votos: BuVotavel[];
}

export interface BuEleicao {
  idEleicao: number;
  aptos: number;
  cargos: BuCargo[];
}

export interface BoletimUrna {
  /** 1 simulado · 2 oficial · 3 treinamento */
  fase: number;
  municipio: number;
  zona: number;
  local: number | null;
  secao: number;
  /** "20261004T154409" (horário local da urna) */
  emissao: string | null;
  abertura: string | null;
  encerramento: string | null;
  /** 1 seção · 3 contingência · 4 reserva seção · 6 reserva encerrando seção */
  tipoUrna: number | null;
  versaoVotacao: string | null;
  numeroInternoUrna: number | null;
  codigoCarga: string | null;
  dataHoraCarga: string | null;
  comparecimento: number | null;
  eleicoes: BuEleicao[];
}

/** Lê um bu.dat (envelope BER). Lança `BuFormatoError` se o arquivo não for um BU. */
export function lerBoletimUrna(bytes: Uint8Array): BoletimUrna {
  const env = berLer(bytes).no;
  if (!ehU(env, UNIV_SEQ) || !env.filhos) throw new BuFormatoError('BU: envelope não é SEQUENCE');
  // ENUMERATEDs do envelope: fase, tipoEnvelope (1 = boletim de urna)
  const tipoEnv = env.filhos.filter((f) => ehU(f, UNIV_ENUM))[1];
  if (tipoEnv && berInt(bytes, tipoEnv) !== 1) throw new BuFormatoError('BU: envelope não é de boletim de urna');
  const conteudo = env.filhos.find((f) => ehU(f, UNIV_OCTET));
  if (!conteudo) throw new BuFormatoError('BU: conteúdo ausente');
  const bu = berDentro(bytes, conteudo);
  if (!ehU(bu, UNIV_SEQ) || !bu.filhos) throw new BuFormatoError('BU: EntidadeBoletimUrna não é SEQUENCE');
  const f = bu.filhos;

  // posições fixas do início: cabecalho, fase, urna, identificacao, dataHoraEmissao
  const fase = ehU(f[1], UNIV_ENUM) ? berInt(bytes, f[1]) : 0;
  const urna = ehU(f[2], UNIV_SEQ) ? f[2] : undefined;
  const ident = ehU(f[3], UNIV_SEQ) ? f[3] : undefined;
  if (!ident?.filhos) throw new BuFormatoError('BU: identificação da seção ausente');
  const munZona = ident.filhos[0];
  if (!munZona?.filhos || munZona.filhos.length < 2) throw new BuFormatoError('BU: município/zona ausente');
  const municipio = berInt(bytes, munZona.filhos[0]);
  const zona = berInt(bytes, munZona.filhos[1]);
  const ints = ident.filhos.slice(1).filter((x) => ehU(x, UNIV_INTEGER));
  const local = ints.length >= 2 ? berInt(bytes, ints[0]) : null;
  const secao = berInt(bytes, ints[ints.length - 1]);

  let emissao: string | null = null;
  let abertura: string | null = null;
  let encerramento: string | null = null;
  let comparecimento: number | null = null;
  let resultados: BerNo | undefined;
  for (let i = 4; i < f.length; i++) {
    const no = f[i];
    if (i === 4 && ehU(no, UNIV_GENERALSTRING)) emissao = berStr(bytes, no);
    else if (eh(no, 2, 0) && no.filhos) {
      // [0] dadosSecao { abertura, encerramento }
      const gs = no.filhos.filter((x) => ehU(x, UNIV_GENERALSTRING));
      abertura = gs[0] ? berStr(bytes, gs[0]) : null;
      encerramento = gs[1] ? berStr(bytes, gs[1]) : null;
    } else if (ehU(no, UNIV_INTEGER) && comparecimento === null) comparecimento = berInt(bytes, no);
    else if (ehU(no, UNIV_SEQ) && !resultados) resultados = no;
  }

  let tipoUrna: number | null = null;
  let versaoVotacao: string | null = null;
  let numeroInternoUrna: number | null = null;
  let codigoCarga: string | null = null;
  let dataHoraCarga: string | null = null;
  if (urna?.filhos) {
    if (ehU(urna.filhos[0], UNIV_ENUM)) tipoUrna = berInt(bytes, urna.filhos[0]);
    if (ehU(urna.filhos[1], UNIV_GENERALSTRING)) versaoVotacao = berStr(bytes, urna.filhos[1]);
    const corresp = urna.filhos.find((x, i) => i >= 2 && ehU(x, UNIV_SEQ));
    const carga = corresp?.filhos?.find((x) => ehU(x, UNIV_SEQ));
    if (carga?.filhos) {
      if (ehU(carga.filhos[0], UNIV_INTEGER)) numeroInternoUrna = berInt(bytes, carga.filhos[0]);
      const gs = carga.filhos.filter((x) => ehU(x, UNIV_GENERALSTRING));
      // dataHoraCarga, codigoCarga (os nomes do gerador de mídia ficam numa SEQUENCE à parte)
      if (gs.length >= 2) {
        dataHoraCarga = berStr(bytes, gs[gs.length - 2]);
        codigoCarga = berStr(bytes, gs[gs.length - 1]);
      }
    }
  }

  const eleicoes: BuEleicao[] = [];
  for (const rve of resultados?.filhos ?? []) {
    if (!ehU(rve, UNIV_SEQ) || !rve.filhos) continue;
    const ints = rve.filhos.filter((x) => ehU(x, UNIV_INTEGER));
    if (ints.length < 2) continue;
    const idEleicao = berInt(bytes, ints[0]);
    const aptos = berInt(bytes, ints[1]);
    const lista = rve.filhos.find((x) => ehU(x, UNIV_SEQ));
    const cargos: BuCargo[] = [];
    for (const rv of lista?.filhos ?? []) {
      if (!ehU(rv, UNIV_SEQ) || !rv.filhos) continue;
      const tipoCargo = ehU(rv.filhos[0], UNIV_ENUM) ? berInt(bytes, rv.filhos[0]) : 0;
      const comp = rv.filhos.find((x) => ehU(x, UNIV_INTEGER));
      const totais = rv.filhos.find((x) => ehU(x, UNIV_SEQ));
      for (const tvc of totais?.filhos ?? []) {
        if (!ehU(tvc, UNIV_SEQ) || !tvc.filhos) continue;
        const cod = tvc.filhos[0];
        const consulta = eh(cod, 2, 2);
        const codigoCargo = cod && cod.classe === 2 ? berInt(bytes, cod) : 0;
        const vvs = tvc.filhos.find((x) => ehU(x, UNIV_SEQ));
        const votos: BuVotavel[] = [];
        for (const vv of vvs?.filhos ?? []) {
          if (!vv.filhos) continue;
          let tipoVoto = 0;
          let quantidade = 0;
          let partido: number | null = null;
          let codigo: number | null = null;
          for (const c of vv.filhos) {
            if (eh(c, 2, 1)) tipoVoto = berInt(bytes, c);
            else if (eh(c, 2, 2)) quantidade = berInt(bytes, c);
            else if (eh(c, 2, 3) && c.filhos) {
              const ids = c.filhos.filter((x) => ehU(x, UNIV_INTEGER));
              if (ids[0]) partido = berInt(bytes, ids[0]);
              if (ids[1]) codigo = berInt(bytes, ids[1]);
            }
          }
          votos.push({ tipoVoto, quantidade, partido, codigo });
        }
        cargos.push({ codigoCargo, consulta, tipoCargo, comparecimento: comp ? berInt(bytes, comp) : 0, votos });
      }
    }
    eleicoes.push({ idEleicao, aptos, cargos });
  }

  return {
    fase,
    municipio,
    zona,
    local,
    secao,
    emissao,
    abertura,
    encerramento,
    tipoUrna,
    versaoVotacao,
    numeroInternoUrna,
    codigoCarga,
    dataHoraCarga,
    comparecimento,
    eleicoes,
  };
}

/** Votos de um cargo numa eleição do BU, já somados por tipo. */
export interface BuVotosCargo {
  aptos: number;
  comparecimento: number;
  /** número do candidato → votos nominais */
  nominais: Map<number, number>;
  brancos: number;
  /** nulos + votos em "cargo sem candidato" */
  nulos: number;
  legenda: number;
}

export function votosDoCargo(bu: BoletimUrna, idEleicao: number, codigoCargo: number): BuVotosCargo | null {
  const el = bu.eleicoes.find((e) => e.idEleicao === idEleicao);
  if (!el) return null;
  const cg = el.cargos.find((c) => !c.consulta && c.codigoCargo === codigoCargo);
  if (!cg) return null;
  const nominais = new Map<number, number>();
  let brancos = 0;
  let nulos = 0;
  let legenda = 0;
  for (const v of cg.votos) {
    if (v.tipoVoto === TIPO_VOTO.nominal && v.codigo !== null) nominais.set(v.codigo, (nominais.get(v.codigo) ?? 0) + v.quantidade);
    else if (v.tipoVoto === TIPO_VOTO.branco) brancos += v.quantidade;
    else if (v.tipoVoto === TIPO_VOTO.nulo || v.tipoVoto === TIPO_VOTO.cargoSemCandidato) nulos += v.quantidade;
    else if (v.tipoVoto === TIPO_VOTO.legenda) legenda += v.quantidade;
  }
  return { aptos: el.aptos, comparecimento: cg.comparecimento, nominais, brancos, nulos, legenda };
}
