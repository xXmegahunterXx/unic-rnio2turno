/**
 * Texto pronto para postar o cenário (X, WhatsApp, Web Share). Neutro: descreve a hipótese de quem montou, com os
 * dois finalistas sempre na ordem do número na urna e o aviso "Não é pesquisa nem previsão" SEMPRE presente
 * (as partes opcionais caem antes dele quando falta espaço). Puro: testado em textos.test.ts.
 */
import type { PresidenteT1Dataset, ResultadoCenario } from '@/shared/cenarios';
import { finalistasDe, nomeCurto, pctFinalista } from '@/shared/cenarios';
import { fmtInt, fmtPct } from '@/shared/format';
import { LIMITE_TEXTO, limitarTexto } from '@/app/components/share/textos';
import { pesoTextoX } from '@/app/lib/share';

export const HASHTAGS_CENARIO = ['Eleições2026', 'SegundoTurno'];
export const NOME_ARQUIVO_CENARIO = 'sintonia-meu-cenario-2-turno';
export const AVISO_TEXTO = 'Não é pesquisa nem previsão.';

export function textoCenario(ds: PresidenteT1Dataset, r: ResultadoCenario): string {
  const { a, b } = finalistasDe(ds);
  const pa = fmtPct(pctFinalista(r.brasil, 0));
  const pb = fmtPct(pctFinalista(r.brasil, 1));
  const [ea, eb] = r.estados;
  const estados = ` (${fmtInt(ea)} × ${fmtInt(eb)} estados)`;
  const tentativas = [
    `Montei um cenário hipotético do 2º turno no Sintonia, a partir do resultado oficial do 1º turno: ${a.nomeUrna} ${pa} × ${b.nomeUrna} ${pb} dos votos válidos${estados}. ${AVISO_TEXTO} Monte o seu:`,
    `Montei um cenário hipotético do 2º turno no Sintonia, a partir do 1º turno oficial: ${a.nomeUrna} ${pa} × ${b.nomeUrna} ${pb} dos válidos${estados}. ${AVISO_TEXTO} Monte o seu:`,
    `Montei um cenário hipotético do 2º turno no Sintonia, a partir do 1º turno oficial: ${a.nomeUrna} ${pa} × ${b.nomeUrna} ${pb} dos válidos. ${AVISO_TEXTO} Monte o seu:`,
    `Meu cenário hipotético do 2º turno no Sintonia: ${nomeCurto(a.nomeUrna)} ${pa} × ${nomeCurto(b.nomeUrna)} ${pb}. ${AVISO_TEXTO}`,
  ];
  for (const t of tentativas) if (pesoTextoX(t) <= LIMITE_TEXTO) return t;
  return limitarTexto(tentativas[tentativas.length - 1]);
}
