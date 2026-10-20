/**
 * Pesquisas eleitorais REGISTRADAS do 2º turno (contrato isomórfico: dados, servidor, app e painel).
 *
 * Regra jurídica (Lei 9.504/97, art. 33; Res. TSE 23.600/2019): só se divulga pesquisa REGISTRADA no TSE, e sempre com
 * (art. 10 da resolução) o período da coleta, a margem de erro, o nível de confiança, o número de entrevistas, quem
 * realizou e quem contratou, e o número de registro. Enquete é proibida (art. 33, § 5º). Nada aqui calcula média,
 * projeção ou "agregado": cada pesquisa aparece como o instituto divulgou, com a fonte (URL) de onde o número saiu.
 *
 *  - `validaPesquisa` EXIGE todos esses campos, o formato do registro (BR-NNNNN/AAAA para Presidente; UF-NNNNN/AAAA para
 *    Governador, com a UF da disputa), percentuais com no máximo uma casa decimal e soma plausível (≤ 100,5), datas
 *    coerentes (coleta depois do 1º turno, início ≤ fim ≤ divulgação, nada no futuro) e, quando houver votos válidos,
 *    coerência com os votos totais. O contratante também é exigido: o registro no TSE sempre o traz (art. 2º, I — com
 *    recursos próprios, é o próprio instituto).
 *  - Ordenação (mais recente primeiro), séries por instituto (uma por instituto, nunca somadas) e a comparação com o
 *    resultado oficial são funções puras.
 *  - Dia da votação (0h–17h de 25/10, `diaDeVotacaoAntesDas17`): a área some (`fasePesquisas` → 'votacao').
 *
 * Os números de urna dos candidatos NUNCA são digitados aqui: quem valida passa os da corrida (`meta.json`, vindo do TSE).
 */
import { UF_NOMES, UFS_GOV_2T } from './constants';
import { diaDeVotacaoAntesDas17, INICIO_DIA_VOTACAO } from './diaVotacao';
import { fmtDecimal, fmtInt } from './format';
import type { FonteDados, Fase, UF } from './types';

// ---------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------

/** Disputa da pesquisa: 'pres' (Presidente, 2º turno) ou 'gov-xx' (Governador, só nas UFs de `UFS_GOV_2T`). */
export type CargoPesquisa = 'pres' | `gov-${string}`;

/** Modo de coleta (opcional; aparece como o instituto informou). */
export type ModoPesquisa = 'presencial' | 'telefone' | 'internet' | 'misto';
export const MODOS_PESQUISA: readonly ModoPesquisa[] = ['presencial', 'telefone', 'internet', 'misto'];
export const ROTULO_MODO: Record<ModoPesquisa, string> = {
  presencial: 'entrevistas presenciais',
  telefone: 'entrevistas por telefone',
  internet: 'questionário pela internet',
  misto: 'mais de um modo de coleta',
};

/** Chaves de `totais` além dos números de urna. */
export const CHAVE_BRANCOS_NULOS = 'brancosNulos';
export const CHAVE_INDECISOS = 'indecisos';

export interface Pesquisa {
  /** Estável: `idPesquisa(instituto, registro)` (hash) quando nasce no painel; a semente pode trazer o seu. */
  id: string;
  cargo: CargoPesquisa;
  /** Empresa ou entidade que realizou (ex.: "Datafolha"). */
  instituto: string;
  /** Quem contratou, como está no registro (com recursos próprios, o próprio instituto). Exigido pela validação. */
  contratante?: string;
  /** Número de registro no TSE: "BR-01234/2026" (Presidente) ou "DF-01234/2026" (Governador do DF). */
  registro: string;
  /** Período da coleta (AAAA-MM-DD, datas de Brasília). */
  coletaInicio: string;
  coletaFim: string;
  /** Dia em que o instituto (ou o contratante) divulgou (AAAA-MM-DD). */
  divulgadaEm: string;
  /** Número de entrevistas. */
  entrevistas: number;
  /** Margem de erro, em pontos percentuais, para mais ou para menos (ex.: 2 ou 2,2). */
  margemPp: number;
  /** Nível de confiança, em % (ex.: 95). */
  confiancaPct: number;
  modo?: ModoPesquisa;
  /**
   * Votos TOTAIS (estimulada, 2º turno), em %: chaves = número de urna de cada candidato ('13', '22') + 'brancosNulos'
   * + 'indecisos' (as duas últimas quando o instituto divulga).
   */
  totais: Record<string, number>;
  /** Votos VÁLIDOS em %, só quando o instituto divulgou (chaves = números de urna). Nunca calculado aqui. */
  validos?: Record<string, number>;
  /** De onde cada número saiu (página do instituto, do contratante ou reportagem que cite os dados): URLs https. */
  fontes: string[];
}

/** O que o painel manda (o id é calculado pelo servidor quando falta). */
export type PesquisaEntrada = Omit<Pesquisa, 'id'> & { id?: string };

/** Resposta de `GET /api/pesquisas`. */
export interface PesquisasPublicas {
  /** Pesquisas registradas (semente + painel, sem repetir id nem registro), mais recentes primeiro. */
  pesquisas: Pesquisa[];
  /** Identifica o conteúdo (muda quando a lista muda). */
  versao: string;
  /** Dia da votação (0h–17h de 25/10): lista vazia de propósito — a área não aparece. */
  suspensas?: true;
}

export type OrigemPesquisa = 'semente' | 'painel';

/** Linha do painel: a pesquisa e de onde ela vem. */
export interface PesquisaNoPainel {
  pesquisa: Pesquisa;
  origem: OrigemPesquisa;
  /** Também está na semente (o painel sobrepõe a versão do arquivo). */
  sobrepoeSemente?: boolean;
  /** Tirada do site pelo painel (a da semente continua no arquivo; "Restaurar" volta). */
  removida?: boolean;
  /** Última gravação pelo painel (epoch ms). */
  atualizadaEm?: number;
}

/** `GET /api/admin/pesquisas`. */
export interface PesquisasAdmin {
  itens: PesquisaNoPainel[];
  /** Situação do arquivo semente (public/data/pesquisas.json no build). */
  semente: { lida: boolean; total: number; invalidas: { id?: string; erro: string }[] };
  /** Números de urna de cada disputa (do meta.json), para o formulário. */
  candidatos: Record<string, { numero: number; nome: string; partido: string }[]>;
  /** Hoje em Brasília (AAAA-MM-DD), pelo relógio do servidor. */
  hoje: string;
}

/** Comando do painel (validado no servidor com zod — src/server/validation.ts). */
export type ComandoPesquisa =
  | { acao: 'salvar'; pesquisa: PesquisaEntrada; /** id antigo, quando a edição muda instituto ou registro */ idAnterior?: string }
  | { acao: 'remover'; id: string }
  | { acao: 'restaurar'; id: string };

export type CampoPesquisa =
  | 'id'
  | 'cargo'
  | 'instituto'
  | 'contratante'
  | 'registro'
  | 'coletaInicio'
  | 'coletaFim'
  | 'divulgadaEm'
  | 'entrevistas'
  | 'margemPp'
  | 'confiancaPct'
  | 'modo'
  | 'totais'
  | 'validos'
  | 'fontes';

export type ResultadoValidacao = { ok: Pesquisa } | { erro: string; campo?: CampoPesquisa };

// ---------------------------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------------------------

export const ANO_PESQUISAS = 2026;
/** Coleta do 2º turno começa no dia seguinte ao 1º turno (04/10/2026). */
export const COLETA_MIN = '2026-10-05';
/** Última data de divulgação aceita: o dia da votação. */
export const DIVULGACAO_MAX = '2026-10-25';

export const LIMITES_PESQUISA = {
  instituto: { min: 2, max: 80 },
  contratante: { min: 2, max: 160 },
  entrevistas: { min: 200, max: 200_000 },
  margemPp: { min: 0.1, max: 10 },
  confiancaPct: { min: 90, max: 99.9 },
  /** dias entre o início e o fim da coleta */
  duracaoMaxDias: 21,
  fontes: { min: 1, max: 6, url: 600 },
  /** soma dos votos totais (arredondamentos do instituto) */
  somaTotaisMax: 100.5,
  /** com brancos/nulos E indecisos informados, a soma fica perto de 100 */
  somaTotaisMinCompleta: 97,
  /** soma dos válidos */
  somaValidos: { min: 99, max: 101 },
  /** diferença aceita entre o válido divulgado e o válido que os totais implicam (arredondamentos) */
  toleranciaValidosPp: 1.5,
  /** pesquisas guardadas pelo painel */
  maxPainel: 400,
} as const;

/** Rótulo de cada campo (mensagens de erro e formulário do painel). */
export const ROTULO_CAMPO: Record<CampoPesquisa, string> = {
  id: 'Identificador',
  cargo: 'Disputa',
  instituto: 'Instituto',
  contratante: 'Contratante',
  registro: 'Registro no TSE',
  coletaInicio: 'Início da coleta',
  coletaFim: 'Fim da coleta',
  divulgadaEm: 'Data de divulgação',
  entrevistas: 'Entrevistas',
  margemPp: 'Margem de erro',
  confiancaPct: 'Nível de confiança',
  modo: 'Modo de coleta',
  totais: 'Votos totais',
  validos: 'Votos válidos',
  fontes: 'Fontes',
};

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_REGISTRO = /^([A-Z]{2})-(\d{5})\/(\d{4})$/;
const RE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const RE_NUMERO_URNA = /^\d{2}$/;

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

/** Texto de uma linha só, sem espaços repetidos nem caracteres de controle. */
const limpar = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Nome sem acento, minúsculo e sem espaços repetidos (chave do instituto nas séries e no id). */
export const chaveInstituto = (s: string) =>
  limpar(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** FNV-1a de 32 bits com semente (hex de 8). */
function fnv(s: string, semente: number): string {
  let h = semente >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** Id estável da pesquisa: hash (64 bits) de instituto + registro. "pq-3f9a…" */
export function idPesquisa(instituto: string, registro: string): string {
  const base = `${chaveInstituto(instituto)}|${limpar(registro).toUpperCase()}`;
  return `pq-${fnv(base, 2166136261)}${fnv(base, 0x811c9dc5 ^ 0x5bd1e995)}`;
}

/** 'gov-df' → 'DF'; 'pres' → null. */
export function ufDoCargo(cargo: string): UF | null {
  const m = /^gov-([a-z]{2})$/.exec(cargo);
  return m ? (m[1].toUpperCase() as UF) : null;
}

/** Disputas aceitas: Presidente + Governador nas UFs com 2º turno (`UFS_GOV_2T`). */
export const CARGOS_PESQUISA: readonly CargoPesquisa[] = ['pres', ...UFS_GOV_2T.map((uf) => `gov-${uf.toLowerCase()}` as CargoPesquisa)];

export const ehCargoPesquisa = (v: unknown): v is CargoPesquisa => typeof v === 'string' && (CARGOS_PESQUISA as readonly string[]).includes(v);

/** "Presidente" · "Governador · Distrito Federal" */
export function rotuloCargo(cargo: string): string {
  const uf = ufDoCargo(cargo);
  return uf ? `Governador · ${UF_NOMES[uf]}` : 'Presidente';
}

/** "Presidente" · "Governador (DF)" — curto, para filtros e cartões. */
export function rotuloCargoCurto(cargo: string): string {
  const uf = ufDoCargo(cargo);
  return uf ? `Governador (${uf})` : 'Presidente';
}

/** Data AAAA-MM-DD válida no calendário → dias desde 1970 (UTC); senão null. */
function diaDe(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = RE_DATA.exec(s);
  if (!m) return null;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(a, me - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== me - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(t / 86_400_000);
}

/** Hoje em Brasília (AAAA-MM-DD) para um instante (epoch ms). */
export function hojeBrasilia(agora: number): string {
  return new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** '2026-10-22' → '22/10' (com `ano`, '22/10/2026'). */
export function fmtDataPesquisa(s: string, ano = false): string {
  const m = RE_DATA.exec(s);
  if (!m) return s;
  return ano ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}/${m[2]}`;
}

/** Período da coleta: "20 a 22/10/2026" · "30/09 a 02/10/2026" · "22/10/2026". */
export function fmtPeriodoColeta(ini: string, fim: string, ano = true): string {
  const a = RE_DATA.exec(ini);
  const b = RE_DATA.exec(fim);
  if (!a || !b) return `${ini} a ${fim}`;
  const sufixo = ano ? `/${b[1]}` : '';
  if (ini === fim) return `${b[3]}/${b[2]}${sufixo}`;
  if (a[1] === b[1] && a[2] === b[2]) return `${a[3]} a ${b[3]}/${b[2]}${sufixo}`;
  return `${a[3]}/${a[2]}${a[1] !== b[1] ? `/${a[1]}` : ''} a ${b[3]}/${b[2]}${sufixo}`;
}

/** Casas decimais de um número como foi digitado (0, 1, 2…). */
function casas(n: number): number {
  if (Number.isInteger(n)) return 0;
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Percentual como o instituto divulgou: "45%" (inteiro) ou "45,5%". */
export function fmtPctPesquisa(n: number): string {
  return `${fmtDecimal(n, Number.isInteger(n) ? 0 : 1)}%`;
}

/** Margem: "2 pontos" · "2,2 pontos". */
export const fmtMargem = (n: number) => fmtDecimal(n, Number.isInteger(n) ? 0 : 1);

// ---------------------------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------------------------

export interface ContextoValidacao {
  /**
   * Números de urna dos dois candidatos da disputa (do meta.json, que vem do TSE). Ausente = aceita quaisquer dois
   * números de 2 dígitos (ex.: conferência de um arquivo fora do servidor).
   */
  candidatos?: (cargo: CargoPesquisa) => readonly number[] | undefined;
  /** Hoje em Brasília (AAAA-MM-DD): divulgação no futuro é recusada. Ausente = não confere. */
  hoje?: string;
}

const erro = (campo: CampoPesquisa, msg: string): ResultadoValidacao => ({ erro: `${ROTULO_CAMPO[campo]}: ${msg}`, campo });

/** Texto obrigatório (string não vazia dentro dos limites), limpo. */
function texto(v: unknown, campo: CampoPesquisa, lim: { min: number; max: number }): string | ResultadoValidacao {
  if (typeof v !== 'string') return erro(campo, 'obrigatório.');
  const s = limpar(v);
  if (s.length < lim.min) return erro(campo, 'obrigatório.');
  if (s.length > lim.max) return erro(campo, `no máximo ${lim.max} caracteres.`);
  if (/[<>{}]/.test(s)) return erro(campo, 'use só letras, números e pontuação comum.');
  return s;
}

/** Número finito dentro de [min, max] com no máximo `maxCasas` casas decimais. */
function numero(v: unknown, campo: CampoPesquisa, min: number, max: number, maxCasas: number, unidade = ''): number | ResultadoValidacao {
  if (typeof v !== 'number' || !Number.isFinite(v)) return erro(campo, 'obrigatório (número).');
  if (v < min || v > max) return erro(campo, `entre ${fmtDecimal(min, casas(min) ? 1 : 0)} e ${fmtDecimal(max, casas(max) ? 1 : 0)}${unidade}.`);
  if (casas(v) > maxCasas) return erro(campo, maxCasas === 0 ? 'número inteiro.' : `no máximo ${maxCasas === 1 ? 'uma casa decimal' : `${maxCasas} casas decimais`}, como o instituto divulgou.`);
  return v;
}

/** URL https pública (sem usuário/senha), até `max` caracteres. */
export function urlFonteValida(v: unknown, max: number = LIMITES_PESQUISA.fontes.url): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > max || /\s/.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.endsWith('.') || /^[\d.]+$/.test(host) || host === 'localhost') return null;
  return u.toString();
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Valida (e normaliza: textos limpos, registro em maiúsculas, chaves em ordem) uma pesquisa. Devolve `{ ok }` ou
 * `{ erro, campo }` com a 1ª falha em português. Exige tudo o que a Res. TSE 23.600/2019 manda divulgar.
 */
export function validaPesquisa(entrada: unknown, ctx: ContextoValidacao = {}): ResultadoValidacao {
  if (!ehObjeto(entrada)) return { erro: 'Pesquisa inválida.' };
  const e = entrada;
  const L = LIMITES_PESQUISA;

  // disputa
  if (!ehCargoPesquisa(e.cargo)) return erro('cargo', `use "pres" ou uma das disputas de governador do 2º turno (${UFS_GOV_2T.map((u) => `gov-${u.toLowerCase()}`).join(', ')}).`);
  const cargo = e.cargo;

  // quem fez e quem contratou
  const instituto = texto(e.instituto, 'instituto', L.instituto);
  if (typeof instituto !== 'string') return instituto;
  const contratante = texto(e.contratante, 'contratante', L.contratante);
  if (typeof contratante !== 'string') {
    return erro('contratante', 'obrigatório — como está no registro do TSE (com recursos próprios, o nome do próprio instituto).');
  }

  // registro
  if (typeof e.registro !== 'string') return erro('registro', 'obrigatório (ex.: BR-01234/2026).');
  const registro = limpar(e.registro).toUpperCase();
  const mr = RE_REGISTRO.exec(registro);
  const ufCargo = ufDoCargo(cargo);
  const prefixo = ufCargo ?? 'BR';
  if (!mr) return erro('registro', `use o formato ${prefixo}-NNNNN/${ANO_PESQUISAS} (5 dígitos), como no PesqEle do TSE.`);
  if (Number(mr[3]) !== ANO_PESQUISAS) return erro('registro', `o ano do registro é ${ANO_PESQUISAS}.`);
  if (mr[1] !== prefixo) {
    return erro('registro', ufCargo ? `pesquisa de Governador ${ufCargo} tem registro ${ufCargo}-NNNNN/${ANO_PESQUISAS}.` : `pesquisa de Presidente tem registro BR-NNNNN/${ANO_PESQUISAS}.`);
  }

  // id
  let id: string;
  if (e.id === undefined || e.id === null || e.id === '') id = idPesquisa(instituto, registro);
  else if (typeof e.id === 'string' && RE_ID.test(e.id)) id = e.id;
  else return erro('id', 'letras minúsculas, números e hífen (3 a 64).');

  // datas
  const dIni = diaDe(e.coletaInicio);
  const dFim = diaDe(e.coletaFim);
  const dDiv = diaDe(e.divulgadaEm);
  if (dIni === null) return erro('coletaInicio', 'data AAAA-MM-DD obrigatória.');
  if (dFim === null) return erro('coletaFim', 'data AAAA-MM-DD obrigatória.');
  if (dDiv === null) return erro('divulgadaEm', 'data AAAA-MM-DD obrigatória.');
  if (dIni < diaDe(COLETA_MIN)!) return erro('coletaInicio', `pesquisa do 2º turno: coleta a partir de ${fmtDataPesquisa(COLETA_MIN, true)}.`);
  if (dFim < dIni) return erro('coletaFim', 'antes do início da coleta.');
  if (dFim - dIni > L.duracaoMaxDias) return erro('coletaFim', `coleta de mais de ${L.duracaoMaxDias} dias — confira as datas.`);
  if (dDiv < dFim) return erro('divulgadaEm', 'antes do fim da coleta.');
  if (dDiv > diaDe(DIVULGACAO_MAX)!) return erro('divulgadaEm', `depois do dia da votação (${fmtDataPesquisa(DIVULGACAO_MAX, true)}).`);
  if (ctx.hoje) {
    const dHoje = diaDe(ctx.hoje);
    if (dHoje !== null && dDiv > dHoje) return erro('divulgadaEm', 'no futuro — só pesquisa já divulgada.');
  }

  // amostra, margem e confiança
  const entrevistas = numero(e.entrevistas, 'entrevistas', L.entrevistas.min, L.entrevistas.max, 0);
  if (typeof entrevistas !== 'number') return entrevistas;
  const margemPp = numero(e.margemPp, 'margemPp', L.margemPp.min, L.margemPp.max, 1, ' pontos');
  if (typeof margemPp !== 'number') return margemPp;
  const confiancaPct = numero(e.confiancaPct, 'confiancaPct', L.confiancaPct.min, L.confiancaPct.max, 1, '%');
  if (typeof confiancaPct !== 'number') return confiancaPct;

  let modo: ModoPesquisa | undefined;
  if (e.modo !== undefined && e.modo !== null && e.modo !== '') {
    if (!(MODOS_PESQUISA as readonly unknown[]).includes(e.modo)) return erro('modo', `use ${MODOS_PESQUISA.join(', ')}.`);
    modo = e.modo as ModoPesquisa;
  }

  // candidatos da disputa
  const esperados = ctx.candidatos?.(cargo);
  if (ctx.candidatos && (!esperados || esperados.length !== 2)) return erro('cargo', 'disputa sem os dois candidatos no conjunto de dados.');

  // votos totais
  if (!ehObjeto(e.totais)) return erro('totais', 'obrigatório.');
  const totais: Record<string, number> = {};
  const numsTotais: number[] = [];
  for (const [k, v] of Object.entries(e.totais)) {
    if (k !== CHAVE_BRANCOS_NULOS && k !== CHAVE_INDECISOS && !RE_NUMERO_URNA.test(k)) return erro('totais', `chave "${k.slice(0, 16)}" desconhecida (use o número de urna, brancosNulos ou indecisos).`);
    const n = numero(v, 'totais', 0, 100, 1, '%');
    if (typeof n !== 'number') return n;
    totais[k] = n;
    if (RE_NUMERO_URNA.test(k)) numsTotais.push(Number(k));
  }
  numsTotais.sort((a, b) => a - b);
  if (numsTotais.length !== 2) return erro('totais', 'informe os dois candidatos (pelo número de urna).');
  if (esperados) {
    const exp = [...esperados].sort((a, b) => a - b);
    if (exp[0] !== numsTotais[0] || exp[1] !== numsTotais[1]) return erro('totais', `os candidatos desta disputa são ${exp.join(' e ')}.`);
  }
  const somaTotais = Object.values(totais).reduce((a, b) => a + b, 0);
  if (somaTotais > L.somaTotaisMax + 1e-9) return erro('totais', `a soma passa de 100% (${fmtDecimal(somaTotais, 1)}%) — confira os números.`);
  if (totais[CHAVE_BRANCOS_NULOS] !== undefined && totais[CHAVE_INDECISOS] !== undefined && somaTotais < L.somaTotaisMinCompleta - 1e-9) {
    return erro('totais', `com brancos/nulos e indecisos, a soma deveria chegar perto de 100% (deu ${fmtDecimal(somaTotais, 1)}%).`);
  }
  const somaCand = totais[String(numsTotais[0])] + totais[String(numsTotais[1])];
  if (somaCand <= 0) return erro('totais', 'os dois candidatos com 0%.');

  // votos válidos (opcional, como o instituto divulgou)
  let validos: Record<string, number> | undefined;
  if (e.validos !== undefined && e.validos !== null) {
    if (!ehObjeto(e.validos)) return erro('validos', 'formato inválido.');
    const ks = Object.keys(e.validos);
    if (ks.length === 0) validos = undefined;
    else {
      validos = {};
      for (const [k, v] of Object.entries(e.validos)) {
        if (!RE_NUMERO_URNA.test(k) || !numsTotais.includes(Number(k))) return erro('validos', 'use os mesmos dois candidatos dos votos totais.');
        const n = numero(v, 'validos', 0, 100, 1, '%');
        if (typeof n !== 'number') return n;
        validos[k] = n;
      }
      if (Object.keys(validos).length !== 2) return erro('validos', 'informe os dois candidatos.');
      const somaV = Object.values(validos).reduce((a, b) => a + b, 0);
      if (somaV < L.somaValidos.min - 1e-9 || somaV > L.somaValidos.max + 1e-9) return erro('validos', `a soma deveria ser 100% (deu ${fmtDecimal(somaV, 1)}%).`);
      for (const n of numsTotais) {
        const implicito = (totais[String(n)] / somaCand) * 100;
        if (Math.abs(validos[String(n)] - implicito) > L.toleranciaValidosPp + 1e-9) {
          return erro('validos', `não batem com os votos totais (${n}: ${fmtDecimal(validos[String(n)], 1)}% contra ~${fmtDecimal(implicito, 1)}%) — confira se os candidatos não estão trocados.`);
        }
      }
    }
  }

  // fontes
  if (!Array.isArray(e.fontes) || e.fontes.length < L.fontes.min) return erro('fontes', 'informe pelo menos um link (https) de onde os números saíram.');
  if (e.fontes.length > L.fontes.max) return erro('fontes', `no máximo ${L.fontes.max} links.`);
  const fontes: string[] = [];
  for (const f of e.fontes) {
    const u = urlFonteValida(f);
    if (!u) return erro('fontes', 'cada fonte precisa ser um link https completo (até 600 caracteres).');
    if (!fontes.includes(u)) fontes.push(u);
  }

  // chaves em ordem fixa: candidatos pela urna, depois brancos/nulos e indecisos
  const ordenar = (o: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const n of numsTotais) if (o[String(n)] !== undefined) out[String(n)] = o[String(n)];
    for (const k of [CHAVE_BRANCOS_NULOS, CHAVE_INDECISOS]) if (o[k] !== undefined) out[k] = o[k];
    return out;
  };

  const p: Pesquisa = {
    id,
    cargo,
    instituto,
    contratante,
    registro,
    coletaInicio: e.coletaInicio as string,
    coletaFim: e.coletaFim as string,
    divulgadaEm: e.divulgadaEm as string,
    entrevistas,
    margemPp,
    confiancaPct,
    ...(modo ? { modo } : {}),
    totais: ordenar(totais),
    ...(validos ? { validos: ordenar(validos) } : {}),
    fontes,
  };
  return { ok: p };
}

// ---------------------------------------------------------------------------------------------
// Lista: mesclar, ordenar, séries
// ---------------------------------------------------------------------------------------------

/** Mais recente primeiro: divulgação, fim da coleta, depois instituto e registro (ordem estável). */
export function compararPesquisas(a: Pesquisa, b: Pesquisa): number {
  if (a.divulgadaEm !== b.divulgadaEm) return a.divulgadaEm < b.divulgadaEm ? 1 : -1;
  if (a.coletaFim !== b.coletaFim) return a.coletaFim < b.coletaFim ? 1 : -1;
  const i = a.instituto.localeCompare(b.instituto, 'pt-BR');
  if (i) return i;
  return a.registro < b.registro ? -1 : a.registro > b.registro ? 1 : 0;
}

/** Cópia ordenada (mais recente primeiro). */
export const ordenarPesquisas = <T extends Pesquisa>(lista: readonly T[]): T[] => [...lista].sort(compararPesquisas);

/** Só as de uma disputa. */
export const pesquisasDoCargo = <T extends Pesquisa>(lista: readonly T[], cargo: string): T[] => lista.filter((p) => p.cargo === cargo);

/**
 * Semente + painel, sem repetir: a do painel vence a da semente com o mesmo id OU o mesmo registro; ids em
 * `removidas` saem. Resultado ordenado (mais recente primeiro).
 */
export function mesclarPesquisas(semente: readonly Pesquisa[], painel: readonly Pesquisa[], removidas: readonly string[] = []): Pesquisa[] {
  const fora = new Set(removidas);
  const porId = new Map<string, Pesquisa>();
  const registros = new Set<string>();
  for (const p of painel) {
    if (fora.has(p.id) || porId.has(p.id) || registros.has(p.registro)) continue;
    porId.set(p.id, p);
    registros.add(p.registro);
  }
  for (const p of semente) {
    if (fora.has(p.id) || porId.has(p.id) || registros.has(p.registro)) continue;
    porId.set(p.id, p);
    registros.add(p.registro);
  }
  return ordenarPesquisas([...porId.values()]);
}

/** Números de urna dos dois candidatos da pesquisa, na ordem da urna. */
export function numerosDaPesquisa(p: Pick<Pesquisa, 'totais'>): number[] {
  return Object.keys(p.totais)
    .filter((k) => RE_NUMERO_URNA.test(k))
    .map(Number)
    .sort((a, b) => a - b);
}

export type BaseSerie = 'totais' | 'validos';

export interface PontoSerie {
  id: string;
  /** Fim da coleta (AAAA-MM-DD): o ponto fica no último dia de campo. */
  data: string;
  coletaInicio: string;
  divulgadaEm: string;
  registro: string;
  margemPp: number;
  /** % por número de urna, como divulgado. */
  valores: Record<number, number>;
}

export interface SerieInstituto {
  instituto: string;
  chave: string;
  pontos: PontoSerie[];
}

/**
 * Uma série POR INSTITUTO (nunca juntas, nunca média): os pontos da disputa no tempo, do mais antigo ao mais novo. Com
 * `base` 'validos', só entram as pesquisas que divulgaram válidos. Institutos em ordem alfabética.
 */
export function seriesPorInstituto(lista: readonly Pesquisa[], cargo: string, base: BaseSerie = 'totais'): SerieInstituto[] {
  const grupos = new Map<string, SerieInstituto>();
  for (const p of lista) {
    if (p.cargo !== cargo) continue;
    const fonte = base === 'validos' ? p.validos : p.totais;
    if (!fonte) continue;
    const valores: Record<number, number> = {};
    for (const n of numerosDaPesquisa(p)) if (fonte[String(n)] !== undefined) valores[n] = fonte[String(n)];
    if (Object.keys(valores).length !== 2) continue;
    const chave = chaveInstituto(p.instituto);
    let g = grupos.get(chave);
    if (!g) grupos.set(chave, (g = { instituto: p.instituto, chave, pontos: [] }));
    g.pontos.push({ id: p.id, data: p.coletaFim, coletaInicio: p.coletaInicio, divulgadaEm: p.divulgadaEm, registro: p.registro, margemPp: p.margemPp, valores });
  }
  const out = [...grupos.values()];
  for (const g of out) {
    g.pontos.sort((a, b) => (a.data !== b.data ? (a.data < b.data ? -1 : 1) : a.divulgadaEm < b.divulgadaEm ? -1 : a.divulgadaEm > b.divulgadaEm ? 1 : 0));
    // nome de exibição: o da pesquisa mais recente
    const ultima = lista.find((p) => p.id === g.pontos[g.pontos.length - 1].id);
    if (ultima) g.instituto = ultima.instituto;
  }
  return out.sort((a, b) => a.instituto.localeCompare(b.instituto, 'pt-BR'));
}

/** A pesquisa mais recente de cada instituto na disputa (ordem: mais recente primeiro). */
export function ultimaPorInstituto(lista: readonly Pesquisa[], cargo: string): Pesquisa[] {
  const vistas = new Set<string>();
  const out: Pesquisa[] = [];
  for (const p of ordenarPesquisas(pesquisasDoCargo(lista, cargo))) {
    const k = chaveInstituto(p.instituto);
    if (vistas.has(k)) continue;
    vistas.add(k);
    out.push(p);
  }
  return out;
}

export interface LinhaComparacao {
  numero: number;
  /** % dos válidos na pesquisa (como divulgado). */
  pesquisa: number;
  /** % dos válidos no resultado oficial. */
  resultado: number;
  /** resultado − pesquisa, em pontos percentuais (1 casa). */
  diferencaPp: number;
}

/**
 * Pesquisa × resultado oficial, candidato a candidato, SÓ com os válidos que o instituto divulgou (nunca calculados a
 * partir dos totais). `resultado` = % dos válidos oficiais por número de urna. Sem válidos divulgados → null.
 */
export function compararComResultado(p: Pick<Pesquisa, 'totais' | 'validos'>, resultado: Record<number, number>): LinhaComparacao[] | null {
  if (!p.validos) return null;
  const linhas: LinhaComparacao[] = [];
  for (const n of numerosDaPesquisa(p)) {
    const v = p.validos[String(n)];
    const r = resultado[n];
    if (v === undefined || r === undefined || !Number.isFinite(r)) return null;
    linhas.push({ numero: n, pesquisa: v, resultado: r, diferencaPp: Math.round((r - v) * 10) / 10 });
  }
  return linhas.length === 2 ? linhas : null;
}

// ---------------------------------------------------------------------------------------------
// Fases da área
// ---------------------------------------------------------------------------------------------

/**
 * O que a área de pesquisas mostra agora:
 *  - 'oculta': simulação com nomes ocultos (`anonimizado`) — a área não aparece;
 *  - 'votacao': dia da votação, 0h–17h de 25/10 (Brasília, relógio do servidor) — só um aviso neutro;
 *  - 'resultado': resultado oficial do TSE concluído (fonte 'tse', sem simulação, fase 'encerrada') — "Pesquisas ×
 *    resultado";
 *  - 'lista': as pesquisas registradas.
 */
export type FasePesquisas = 'oculta' | 'votacao' | 'resultado' | 'lista';

export interface EstadoPesquisas {
  agora: number;
  fonte?: FonteDados;
  fase?: Fase;
  simulacao?: boolean;
  anonimizado?: boolean;
}

export function fasePesquisas(s: EstadoPesquisas): FasePesquisas {
  if (s.anonimizado) return 'oculta';
  if (diaDeVotacaoAntesDas17(s.agora)) return 'votacao';
  if (s.fonte === 'tse' && !s.simulacao && s.fase === 'encerrada') return 'resultado';
  return 'lista';
}

/**
 * Bloco "Pesquisas registradas" na home e na /apuracao: só na fase 'pre' e antes do dia da votação (depois, a página
 * /pesquisas continua; no dia, nada).
 */
export function mostrarBlocoPesquisas(s: EstadoPesquisas): boolean {
  return fasePesquisas(s) === 'lista' && (s.fase ?? 'pre') === 'pre' && s.agora < INICIO_DIA_VOTACAO;
}

// ---------------------------------------------------------------------------------------------
// Informações obrigatórias (Res. TSE 23.600/2019, art. 10) — o MESMO texto no site, nas imagens e nas meta tags
// ---------------------------------------------------------------------------------------------

export interface ItemObrigatorio {
  rotulo: string;
  valor: string;
}

/** Instituto, contratante, registro, coleta, entrevistas, margem e confiança — nessa ordem. */
export function informacoesObrigatorias(p: Pesquisa): ItemObrigatorio[] {
  return [
    { rotulo: 'Instituto', valor: p.instituto },
    { rotulo: 'Contratante', valor: p.contratante ?? 'não informado' },
    { rotulo: 'Registro no TSE', valor: p.registro },
    { rotulo: 'Coleta', valor: fmtPeriodoColeta(p.coletaInicio, p.coletaFim) },
    { rotulo: 'Entrevistas', valor: fmtInt(p.entrevistas) },
    { rotulo: 'Margem de erro', valor: `${fmtMargem(p.margemPp)} ${p.margemPp === 1 ? 'ponto' : 'pontos'} para mais ou para menos` },
    { rotulo: 'Nível de confiança', valor: `${fmtDecimal(p.confiancaPct, Number.isInteger(p.confiancaPct) ? 0 : 1)}%` },
  ];
}

/** Numa linha: "Datafolha · contratante: Folha · registro BR-01234/2026 · coleta 20 a 22/10/2026 · 2.004 entrevistas · margem de erro de 2 pontos, para mais ou para menos · confiança de 95%". */
export function linhaObrigatoria(p: Pesquisa): string {
  const conf = fmtDecimal(p.confiancaPct, Number.isInteger(p.confiancaPct) ? 0 : 1);
  return [
    p.instituto,
    `contratante: ${p.contratante ?? 'não informado'}`,
    `registro ${p.registro}`,
    `coleta ${fmtPeriodoColeta(p.coletaInicio, p.coletaFim)}`,
    `${fmtInt(p.entrevistas)} entrevistas`,
    `margem de erro de ${fmtMargem(p.margemPp)} ${p.margemPp === 1 ? 'ponto' : 'pontos'}, para mais ou para menos`,
    `confiança de ${conf}%`,
  ].join(' · ');
}

/** Aviso fixo da área (página, bloco e imagens). */
export const AVISO_PESQUISAS =
  'Pesquisas registradas no TSE. Pesquisa não é resultado: mostra a intenção de voto no período da coleta, dentro da margem de erro.';

/** Aviso do dia da votação (0h–17h de 25/10): neutro, sem número nem nome. */
export const AVISO_DIA_VOTACAO =
  'Hoje é dia de votação. Até as 17h (horário de Brasília), esta área fica sem pesquisas; às 17h começa a divulgação dos resultados.';
