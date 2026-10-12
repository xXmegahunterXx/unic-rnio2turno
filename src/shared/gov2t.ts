/**
 * Textos do quadro de 2º turno de Governador, SEMPRE derivados de `UFS_GOV_2T` (src/shared/constants.ts).
 * Nenhum texto do app, do servidor ou das imagens traz o número de disputas fixo: se o TSE mudar o quadro (ex.: a
 * retotalização do RJ em 10/10/2026), basta editar `UFS_GOV_2T` e regenerar os dados.
 */
import { QTD_GOV_2T, UF_NOMES, UFS_GOV_2T } from './constants';
import { fmtExtenso, fmtInt, fmtLista } from './format';
import { UFS } from './types';

export { QTD_GOV_2T, UFS_GOV_2T };

/** "AC, AM, DF, ES, RN e TO" */
export const SIGLAS_GOV_2T = fmtLista(UFS_GOV_2T);

/** "Acre, Amazonas, Distrito Federal, Espírito Santo, Rio Grande do Norte e Tocantins" */
export const NOMES_GOV_2T = fmtLista(UFS_GOV_2T.map((uf) => UF_NOMES[uf]));

/** "6 disputas" (singular com 1). */
export const nDisputasGov = (n: number = QTD_GOV_2T) => `${fmtInt(n)} ${n === 1 ? 'disputa' : 'disputas'}`;

/** "6 estados" (singular com 1). O DF entra na conta como nos textos do TSE ("estados com 2º turno"). */
export const nEstadosGov = (n: number = QTD_GOV_2T) => `${fmtInt(n)} ${n === 1 ? 'estado' : 'estados'}`;

/** "Seis estados" / "seis estados" — por extenso, para o começo ou o meio de uma frase. */
export function estadosGovExtenso(maiuscula = false, n: number = QTD_GOV_2T): string {
  const s = `${fmtExtenso(n)} ${n === 1 ? 'estado' : 'estados'}`;
  return maiuscula ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "As 6 disputas de governador" (título) — com 1, "A disputa de governador". */
export const asDisputasGov = (n: number = QTD_GOV_2T) => (n === 1 ? 'A disputa de governador' : `As ${nDisputasGov(n)} de governador`);

/** UFs que elegeram o governador no 1º turno: as 27 menos as do 2º turno (21 desde a retotalização do RJ). */
export const UFS_GOV_ELEITO_T1 = UFS.filter((uf) => !UFS_GOV_2T.includes(uf));
