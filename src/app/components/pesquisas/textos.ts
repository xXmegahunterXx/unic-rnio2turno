/** Texto de compartilhar de uma pesquisa (puro; testado em textos.test.ts). */
import { pesoTextoX } from '@/app/lib/share';
import { fmtDecimal, fmtInt } from '@/shared/format';
import { fmtMargem, fmtPctPesquisa, fmtPeriodoColeta, rotuloCargoCurto, type Pesquisa } from '@/shared/pesquisas';
import type { CorCandidato } from '@/shared/types';

export interface CandidatoTexto {
  numero: number;
  nome: string;
  cor?: CorCandidato;
}

/**
 * Texto do post: placar e TODAS as informações obrigatórias (nunca cortadas). Neutro, ordem da urna. Compacto para caber
 * no X com o link (peso ≤ 250 + o link de 23 ≤ 280; sem hashtags); o aviso "Pesquisa não é resultado" entra quando cabe (ele está sempre na imagem).
 */
export function textoPesquisa(p: Pesquisa, cands: CandidatoTexto[]): string {
  const placar = cands.map((c) => `${c.nome} ${fmtPctPesquisa(p.totais[String(c.numero)])}`).join(' × ');
  const conf = fmtDecimal(p.confiancaPct, Number.isInteger(p.confiancaPct) ? 0 : 1);
  const base =
    `Pesquisa ${p.instituto} (${rotuloCargoCurto(p.cargo)}, 2º turno), votos totais: ${placar}. ` +
    `Registro ${p.registro}; contratante: ${p.contratante ?? 'não informado'}; coleta ${fmtPeriodoColeta(p.coletaInicio, p.coletaFim, false)}; ` +
    `${fmtInt(p.entrevistas)} entrevistas; margem ±${fmtMargem(p.margemPp)} p.p.; confiança ${conf}%.`;
  const comAviso = `${base} Pesquisa não é resultado.`;
  return pesoTextoX(comAviso) <= 250 ? comAviso : base;
}

