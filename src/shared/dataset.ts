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
