/**
 * Endereços e códigos do feed oficial de resultados do TSE (eleições gerais de 2026).
 *
 * Descobertos em `comum/config/ele-c.json` (pleito 3220 = 1º turno de 04/10/2026; 3221 = 2º turno de 25/10/2026).
 * Ver ARCHITECTURE.md §4.1. Todos os caminhos são relativos a `TSE_BASE` e são espelhados em `data-raw/tse/`.
 */
import { UFS_GOV_2T } from '../../../src/shared/constants';

export const TSE_BASE = 'https://resultados.tse.jus.br/oficial';
export const CICLO = 'ele2026';

export const PLEITO_T1 = '3220';
export const PLEITO_T2 = '3221';
/** Eleição federal (Presidente): 1º turno → 2º turno. */
export const ELE_PRES_T1 = '6257';
export const ELE_PRES_T2 = '6258';
/** Eleição estadual (Governador = cargo 3): 1º turno → 2º turno. */
export const ELE_GOV_T1 = '6259';
export const ELE_GOV_T2 = '6260';
export const CARGO_PRES = '1';
export const CARGO_GOV = '3';

/** UFs com 2º turno de Governador, em minúsculas (como no feed). */
export const UFS_GOV = UFS_GOV_2T.map((u) => u.toLowerCase());

const pad = (n: string, len: number) => n.padStart(len, '0');
const c = (cargo: string) => `c${pad(cargo, 4)}`;
const e = (ele: string) => `e${pad(ele, 6)}`;

export const paths = {
  /** Configuração geral (pleitos, eleições, cargos). */
  config: () => 'comum/config/ele-c.json',
  /** Municípios por UF (código TSE, IBGE, nome, capital, zonas). Inclui 'zz' (exterior). */
  municipios: (ele = ELE_PRES_T1) => `${CICLO}/${ele}/config/mun-${e(ele)}-cm.json`,
  /** Todas as seções da UF: município → zona → seção. */
  secoes: (uf: string, pleito = PLEITO_T1) =>
    `${CICLO}/arquivo-urna/${pleito}/config/${uf}/${uf}-p${pad(pleito, 6)}-cs.json`,
  /** Abrangência (seções/eleitorado/comparecimento) por município + total da UF. */
  abrangencia: (uf: string, ele = ELE_PRES_T1) => `${CICLO}/${ele}/dados/${uf}/${uf}-${e(ele)}-ab.json`,
  /** Resultado de uma abrangência ('br', UF ou UF+código do município). */
  resultado: (dir: string, abr: string, ele: string, cargo: string) =>
    `${CICLO}/${ele}/dados/${dir}/${abr}-${c(cargo)}-${e(ele)}-u.json`,
};

/** Resultado de Presidente 1º turno de um município (vale também para o exterior: dir 'zz'). */
export const resPresMun = (uf: string, cod: string) => paths.resultado(uf, `${uf}${cod}`, ELE_PRES_T1, CARGO_PRES);
export const resPresUf = (uf: string) => paths.resultado(uf, uf, ELE_PRES_T1, CARGO_PRES);
export const resPresBr = () => paths.resultado('br', 'br', ELE_PRES_T1, CARGO_PRES);
export const resGovMun = (uf: string, cod: string) => paths.resultado(uf, `${uf}${cod}`, ELE_GOV_T1, CARGO_GOV);
export const resGovUf = (uf: string) => paths.resultado(uf, uf, ELE_GOV_T1, CARGO_GOV);
/** 2º turno (zerado até 25/10; usado só para os candidatos). */
export const resPresBrT2 = () => paths.resultado('br', 'br', ELE_PRES_T2, CARGO_PRES);
export const resGovUfT2 = (uf: string) => paths.resultado(uf, uf, ELE_GOV_T2, CARGO_GOV);

export const url = (p: string) => `${TSE_BASE}/${p}`;

/**
 * Nomes oficiais dos municípios (IBGE, API de localidades v1): referência de grafia para exibição
 * (acentos, hífens, numerais romanos). Fica no mesmo cache bruto, sob `_ibge/`.
 */
export const IBGE_MUNICIPIOS_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
export const ibgeMunicipios = () => '_ibge/localidades-v1-municipios.json';
