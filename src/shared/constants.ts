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

/**
 * UFs com 2º turno para Governador em 2026, na ordem alfabética da sigla. FONTE ÚNICA do quadro: o pipeline de dados
 * (scripts/data, inclusive o `secao_comum.py`, que lê esta linha), o motor, o servidor, as imagens OG e todos os textos
 * do app derivam daqui — nenhum texto traz o número de disputas fixo (use `QTD_GOV_2T` e `listaUfsGov2t()`).
 *
 * Quadro conforme o TSE:
 *  - 04/10/2026 (1º turno): AC, AM, DF, ES, RJ, RN, TO.
 *  - 10/10/2026 15:09:50 (retotalização do RJ, `ele2026/6259/dados/rj/rj-c0003-e006259-u.json`): os votos do
 *    candidato 10 viraram nulos técnicos e Douglas Ruas (PL, 22) passou a "Eleito" no 1º turno (50,88%). O RJ saiu
 *    do 2º turno; o `comum/config/ele-c.json` lista a eleição 6260 só para AC, AM, DF, ES e RN.
 *  - TO continua: o arquivo do 1º turno (`to-c0003-e006259-u.json`) ainda marca os dois finalistas como "2º turno"
 *    (conferido em 12/10/2026), embora o 6260 de TO ainda não tenha sido publicado.
 *
 * Mudar o quadro (tirar ou pôr uma UF): edite SÓ esta linha (mantenha o formato de uma linha, que o Python lê) e rode
 * o passo a passo do README › Dados › "Mudança no quadro do 2º turno (Governador)".
 */
export const UFS_GOV_2T: UF[] = ['AC', 'AM', 'DF', 'ES', 'RN', 'TO'];

/** Quantas disputas de governador há no 2º turno (derivado de `UFS_GOV_2T`). */
export const QTD_GOV_2T = UFS_GOV_2T.length;

/** Buckets de margem (pontos percentuais) usados no mapa e no mosaico de seções. */
export const MARGEM_BUCKETS = [5, 15, 30] as const;

/**
 * Cores de IDENTIFICAÇÃO dos candidatos a Presidente — decisão do dono do produto (out/2026): Lula (13) em vermelho e
 * Flávio Bolsonaro (22) em azul. Valem para a família de corridas 'pres' ('pres' e 'pres-t1'), inclusive na simulação
 * com "nomes reais". FONTE ÚNICA: o gerador (scripts/data/build-data.ts), o meta.json, os fixtures e os textos
 * derivam daqui (via `corCandidato` em ./cores.ts).
 *
 * Fora daqui as cores continuam NEUTRAS pela ordem do número na urna ('a' turquesa = menor número; 'b' âmbar):
 * disputas de governador (vermelho/azul pela ordem do número nos estados seria enganoso) e a simulação com nomes
 * ocultos (`anonimizarRace` neutraliza as cores: vermelho diria "é o Lula").
 */
export const CORES_IDENTIDADE: Readonly<Record<string, Readonly<Record<number, 'vermelho' | 'azul'>>>> = {
  pres: { 13: 'vermelho', 22: 'azul' },
};
