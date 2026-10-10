/**
 * Formato do dataset compilado pelo pipeline (scripts/data) a partir do feed oficial do TSE (1º turno 2026,
 * estrutura real de municípios/zonas/seções) e consumido pelo motor (src/engine).
 *
 * Arquivos:
 *   public/data/meta.json          → DatasetMeta
 *   public/data/uf/{uf}.json       → UfDataset   (uf em minúsculas; inclui 'zz' = exterior)
 *   public/geo/br.json             → GeoBrasil
 *   public/geo/mun/{uf}.json       → GeoUf       (sem 'zz')
 */
import type { Race, Regiao, UF } from './types';

export interface DatasetMeta {
  versao: number;
  geradoEm: string; // ISO
  fonte: string; // descrição + URLs do TSE/IBGE usados
  /** Corridas disponíveis: 'pres', 'gov-xx' (2º turno) e 'pres-t1', 'gov-xx-t1' (1º turno, finais). */
  races: Race[];
  ufs: UfMeta[];
  /** Totais nacionais oficiais do 1º turno (Presidente), para conferência. */
  totaisPrimeiroTurno: {
    secoes: number;
    eleitorado: number;
    comparecimento: number;
    brancos: number;
    nulos: number;
    validos: number;
  };
}

export interface UfMeta {
  uf: UF;
  nome: string; // "São Paulo" | "Exterior"
  regiao: Regiao;
  capitalCod: string | null; // código TSE do município-capital (null para ZZ)
  eleitorado: number;
  secoes: number;
  municipios: number;
  zonas: number;
}

export interface UfDataset {
  uf: UF;
  municipios: MunicipioDataset[];
}

export interface ResultadoPrimeiroTurno {
  eleitorado: number;
  comparecimento: number;
  brancos: number;
  nulos: number;
  /** Votos por número do candidato (todos os candidatos do 1º turno). Ex.: { "13": 1098, "22": 1244, "55": 34 } */
  votos: Record<string, number>;
}

export interface MunicipioDataset {
  cod: string; // código TSE, 5 dígitos
  ibge: string; // código IBGE 7 dígitos ('' no exterior)
  nome: string; // capitalização de exibição
  capital: boolean;
  /** Para ZZ: país da cidade (quando disponível). */
  pais?: string;
  eleitorado: number; // eleitores aptos (1º turno 2026)
  /** Zonas com as seções ativas (não agregadas) em faixas compactas "1-120,135,140-160". */
  zonas: { z: number; s: string }[];
  /** Resultado oficial do 1º turno para Presidente neste município. */
  t1: ResultadoPrimeiroTurno;
  /** Resultado oficial do 1º turno para Governador (só nas UFs com 2º turno de governador). */
  t1gov?: ResultadoPrimeiroTurno;
}

/** Caminhos SVG já projetados (viewBox próprio). */
export interface GeoBrasil {
  viewBox: string; // "0 0 1000 1000"
  ufs: Record<string, { d: string; cx: number; cy: number }>; // chave = UF (27)
}

export interface GeoUf {
  uf: UF;
  viewBox: string;
  contorno: string; // contorno da UF
  /** chave = código IBGE do município (7 dígitos) → path d; centróides para rótulos/hit-test */
  municipios: Record<string, { d: string; cx: number; cy: number }>;
}

// =============================================================================================
// FASE 2 — dados completos do TSE (1º turno real por seção, locais, perfil, candidatos, cargos)
// =============================================================================================

/**
 * Votação REAL do 1º turno por seção (fonte: votacao_secao_2026_{BR,UF}.zip + detalhe_votacao_secao_2026.zip,
 * dados abertos do TSE). Arquivo: public/data/secao/{uf}.json (uf minúscula, inclui 'zz').
 *
 * Ordem das seções = ordem canônica do dataset: municípios na ordem de UfDataset.municipios → zonas na ordem →
 * seções na ordem de decodeFaixas(zona.s). `n` = total de seções ativas da UF (bate com UfMeta.secoes).
 * Seções agregadas (nsp) já estão somadas na seção principal.
 *
 * Colunas: base64 de Uint16Array little-endian com `n` posições (decodifique com decodeU16 de src/shared/u16.ts).
 */
export interface SecaoUfDataset {
  uf: UF;
  n: number;
  /** eleitores aptos da seção */
  aptos: string;
  /** Presidente 1º turno: comparecimento, finalista a (menor nº, 13), finalista b (22), demais candidatos, brancos, nulos */
  pres: { comp: string; a: string; b: string; outros: string; brancos: string; nulos: string };
  /**
   * Governador 1º turno (só nas 7 UFs com 2º turno): mesma convenção, a/b = finalistas por ordem do número.
   * `aptos` (opcional): eleitorado do cargo por seção — menor que o de Presidente por causa dos eleitores em
   * trânsito (que votam só para Presidente); soma exatamente o eleitorado oficial de Governador.
   */
  gov?: { comp: string; a: string; b: string; outros: string; brancos: string; nulos: string; aptos?: string };
  /** índice do local de votação da seção em LocaisUfDataset.locais (0xFFFF = desconhecido) */
  local: string;
}

/** Locais de votação (eleitorado_local_votacao_2026.zip). Arquivo: public/data/locais/{uf}.json */
export interface LocaisUfDataset {
  uf: UF;
  locais: LocalVotacao[];
  /**
   * Mudanças de local no 2º turno (cadastro de 25/10). `mudancas["cod:zona:secao"]` = índice na lista
   * `[...locais, ...segundoTurno.locais]`. Seção ausente em `mudancas` = mesmo local do 1º turno.
   */
  segundoTurno?: { mudancas: Record<string, number>; locais: LocalVotacao[] };
}

export interface LocalVotacao {
  /** código do local no TSE (NR_LOCAL_VOTACAO) dentro da zona */
  nr: number;
  cod: string; // município (TSE)
  zona: number;
  nome: string; // capitalização de exibição: "Escola Estadual Fulano de Tal"
  endereco: string;
  bairro?: string;
  cep?: string;
  lat?: number;
  lon?: number;
  /** seções do local nesta zona, em faixas ("1-12,40") */
  secoes: string;
  /** eleitores aptos no local */
  aptos: number;
  /** seções agregadas a uma principal neste local: "45>12,46>12" (agregada > principal) — para a Consulta */
  agregadas?: string;
}

/** Perfil do eleitorado (perfil_eleitorado_2026.zip), agregado. Arquivo: public/data/perfil/{uf}.json */
export interface PerfilUfDataset {
  uf: UF;
  /** rótulos das faixas etárias, na ordem dos arrays (ex.: "16 anos", "17 anos", "18 a 20", … "100+") */
  faixas: string[];
  /** rótulos de escolaridade na ordem dos arrays */
  escolaridade: string[];
  total: PerfilAgregado;
  municipios: Record<string, PerfilAgregado>; // chave = código TSE do município
}

export interface PerfilAgregado {
  eleitores: number;
  /** eleitores por faixa etária: [feminino[], masculino[]] (outros/não informado somados em `naoInformado`) */
  idade: [number[], number[]];
  naoInformado: number;
  escolaridade: number[];
  /** eleitores com deficiência declarada / nome social (quando houver no arquivo) */
  deficiencia?: number;
  nomeSocial?: number;
}

/** Ordem canônica dos 5.571 municípios para o mapa nacional. Arquivo: public/data/municipios-br.json */
export interface MunicipiosBr {
  /** chave IBGE (7 dígitos), na ordem dos arrays de MunicipiosNacionalSnapshot */
  ordem: string[];
  uf: string[]; // UF de cada posição
  cod: string[]; // código TSE de cada posição
  nome: string[];
}

/** Geometria nacional de municípios (mesma projeção de br.json). Arquivo: public/geo/br-mun.json */
export interface GeoBrasilMunicipios {
  viewBox: string;
  /** chave IBGE → path d */
  municipios: Record<string, string>;
  /** contornos das UFs (overlay de fronteiras estaduais), chave = UF */
  ufs: Record<string, string>;
}

/** Fotos oficiais (TSE) em pacotes, para poucos arquivos e cache. Arquivo: public/data/fotos/{grupo}.json */
export interface FotoPacote {
  grupo: string; // "segundo-turno" | "senado" | "camara-sp" | "assembleia-sp" | "governadores" …
  /** sqcand → data URI (image/webp ou image/jpeg), retrato ~120×160, sem edição além de redimensionar */
  fotos: Record<string, string>;
}

export type SituacaoCandidato =
  | 'eleito'
  | 'eleito-qp' // eleito por quociente partidário
  | 'eleito-media'
  | 'segundo-turno'
  | 'suplente'
  | 'nao-eleito'
  | 'outro';

/** Ficha pública do candidato (consulta_cand + bem_candidato + resultado). public/data/candidatos/{grupo}.json */
export interface CandidatoFicha {
  sqcand: string;
  numero: number;
  nomeUrna: string;
  nome: string;
  partido: string;
  federacao?: string;
  coligacao?: string;
  composicao?: string;
  cargo: string; // "Presidente" | "Governador" | "Senador" | "Deputado Federal" | ...
  uf: 'BR' | UF;
  vice?: { nome: string; partido?: string; sqcand?: string };
  suplentes?: { nome: string; partido?: string }[];
  genero?: string;
  corRaca?: string;
  idade?: number; // na data da eleição
  nascimento?: string; // ISO
  ocupacao?: string;
  escolaridade?: string;
  estadoCivil?: string;
  naturalidade?: string; // "Garanhuns (PE)"
  /** patrimônio declarado (soma dos bens, R$) e nº de bens */
  patrimonio?: { total: number; itens: number };
  /** resultado no 1º turno na abrangência do cargo */
  resultado?: { votos: number; pct: number; situacao: SituacaoCandidato };
  fotoGrupo?: string;
}

/** Resultado do 1º turno de um cargo numa UF (senado, câmara, assembleia, governador). */
export interface CargoUfResultado {
  uf: 'BR' | UF;
  cargo: string;
  vagas: number;
  secoesTotalizadas: number;
  secoes: number;
  validos: number;
  brancos: number;
  nulos: number;
  comparecimento: number;
  eleitorado: number;
  /** votos por partido/federação (cargos proporcionais) */
  partidos?: { sigla: string; nome: string; votos: number; eleitos: number; federacao?: string }[];
  /** candidatos ordenados por votos (cargos proporcionais: só eleitos + 20 mais votados não eleitos para caber) */
  candidatos: { sqcand: string; numero: number; nomeUrna: string; partido: string; votos: number; pct: number; situacao: SituacaoCandidato }[];
}

/** public/data/cargos/{cargo}.json — cargo ∈ 'governador-t1' | 'senado' | 'camara' | 'assembleia' */
export interface CargoDataset {
  cargo: string;
  titulo: string;
  ufs: CargoUfResultado[];
  /** composição nacional por partido (câmara, senado: eleitos em 2026) */
  composicao?: { sigla: string; eleitos: number }[];
}
