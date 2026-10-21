/** Texto de compartilhar de uma pesquisa (puro; testado em textos.test.ts). */
import { pesoPostX } from '@/app/lib/share';
import { fmtInt } from '@/shared/format';
import { fmtConfianca, fmtMargem, fmtPctPesquisa, fmtPeriodoColeta, rotuloCargoCurto, type Pesquisa } from '@/shared/pesquisas';
import type { CorCandidato } from '@/shared/types';

export interface CandidatoTexto {
  numero: number;
  nome: string;
  cor?: CorCandidato;
}

/** O post inteiro (texto + o link) cabe no X sem que a intenção do X corte nada (`textoParaX` corta com "…"). */
const cabeNoX = (t: string) => pesoPostX(t, [], true) <= 280;

/**
 * Texto do post: placar e TODAS as informações obrigatórias (nunca cortadas). Neutro, ordem da urna, sem hashtags.
 * Sempre cabe no X com o link (≤ 280; o link conta 23), para a intenção do X nunca cortar a informação obrigatória:
 *  1. completo, com o aviso "Pesquisa não é resultado" (ele está sempre na imagem);
 *  2. sem o aviso;
 *  3. compacto (rótulos curtos);
 *  4. com contratante/instituto longos demais: SEM os números — o post remete ao link e à imagem, que trazem o placar
 *     com todas as informações. Número de pesquisa nunca sai sem as informações obrigatórias ao lado.
 */
export function textoPesquisa(p: Pesquisa, cands: CandidatoTexto[]): string {
  const placar = cands.map((c) => `${c.nome} ${fmtPctPesquisa(p.totais[String(c.numero)])}`).join(' × ');
  const conf = fmtConfianca(p.confiancaPct);
  const contr = p.contratante ?? 'não informado';
  const coleta = fmtPeriodoColeta(p.coletaInicio, p.coletaFim, false);
  const base =
    `Pesquisa ${p.instituto} (${rotuloCargoCurto(p.cargo)}, 2º turno), votos totais: ${placar}. ` +
    `Registro ${p.registro}; contratante: ${contr}; coleta ${coleta}; ` +
    `${fmtInt(p.entrevistas)} entrevistas; margem ±${fmtMargem(p.margemPp)} p.p.; confiança ${conf}%.`;
  const comAviso = `${base} Pesquisa não é resultado.`;
  if (cabeNoX(comAviso)) return comAviso;
  if (cabeNoX(base)) return base;
  const compacto =
    `${p.instituto} (${rotuloCargoCurto(p.cargo)}, 2º turno), totais: ${placar}. ` +
    `Reg. ${p.registro}; contratante: ${contr}; coleta ${coleta}; ${fmtInt(p.entrevistas)} entrev.; margem ±${fmtMargem(p.margemPp)} p.p.; confiança ${conf}%.`;
  if (cabeNoX(compacto)) return compacto;
  return `Pesquisa ${p.instituto} (${rotuloCargoCurto(p.cargo)}, 2º turno), registro ${p.registro}: os números e todas as informações exigidas pelo TSE estão no link.`;
}
