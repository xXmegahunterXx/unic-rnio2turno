import type { Regiao, UF } from './types';

export const APP_NAME = 'Sintonia';

/** Fuso de exibição: Brasília (UTC-3, sem horário de verão desde 2019). */
export const TZ = 'America/Sao_Paulo';
export const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

/** 25/10/2026, 8h–17h (Brasília). Divulgação dos resultados a partir das 17h. */
export const DATA_SEGUNDO_TURNO = '2026-10-25';
export const ABERTURA_URNAS = Date.UTC(2026, 9, 25, 11, 0, 0); // 08:00 BRT
export const INICIO_APURACAO = Date.UTC(2026, 9, 25, 20, 0, 0); // 17:00 BRT
export const DATA_PRIMEIRO_TURNO = '2026-10-04';

export const UF_NOMES: Record<UF, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul',
  SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins', ZZ: 'Exterior',
};

export const UF_REGIAO: Record<UF, Regiao> = {
  AC: 'N', AM: 'N', AP: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N',
  AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE',
  DF: 'CO', GO: 'CO', MS: 'CO', MT: 'CO',
  ES: 'SE', MG: 'SE', RJ: 'SE', SP: 'SE',
  PR: 'S', RS: 'S', SC: 'S',
  ZZ: 'EX',
};

export const REGIAO_NOMES: Record<Regiao, string> = {
  N: 'Norte', NE: 'Nordeste', CO: 'Centro-Oeste', SE: 'Sudeste', S: 'Sul', EX: 'Exterior',
};

/** UFs com 2º turno para Governador em 2026 (conforme TSE, 1º turno de 04/10/2026). */
export const UFS_GOV_2T: UF[] = ['AC', 'AM', 'DF', 'ES', 'RJ', 'RN', 'TO'];

/** Buckets de margem (pontos percentuais) usados no mapa e no mosaico de seções. */
export const MARGEM_BUCKETS = [5, 15, 30] as const;
