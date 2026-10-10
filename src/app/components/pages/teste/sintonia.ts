/**
 * Apoio de UI ao cálculo do Teste Cego (puro, sem DOM). A conta da sintonia em si é a de
 * `content/afirmacoes.ts` (`calcularSintonia`, `calcularConcordancia`) — fonte única da fórmula:
 *
 *   afinidade no item = 1 − |resposta − posição| / 4  (escala −2…+2; posição: concorda +2, neutro 0, discorda −2)
 *   sintonia = 100 × Σ peso·afinidade / Σ peso       (peso 2 nas afirmações marcadas "pesa mais para mim")
 *
 * Itens pulados e itens em que o plano não trata do assunto ficam fora da conta daquele candidato.
 */
import {
  AFIRMACOES,
  calcularConcordancia,
  CANDIDATOS,
  ESCALA,
  ehResposta,
  type Afirmacao,
  type Candidato,
  type Resposta,
  type Respostas,
  type ValorLikert,
  type ValorPosicao,
} from '@/app/content/afirmacoes';
import { fmtPct } from '@/shared/format';

export type Autor = Candidato;
export const AUTORES: readonly Autor[] = CANDIDATOS;

/** As 5 opções da escala (sem "Pular"), na ordem de exibição: concordo totalmente → discordo totalmente. */
export const OPCOES_ESCALA = ESCALA.filter((o): o is { valor: ValorLikert; rotulo: string } => o.valor !== 'pular');

const ROTULO_POR_VALOR = new Map<Resposta, string>(ESCALA.map((o) => [o.valor, o.rotulo]));

/** "Concordo totalmente" … "Discordo totalmente", "Pulou" ou "Sem resposta". */
export function rotuloResposta(r: Resposta | null | undefined): string {
  if (r === 'pular') return 'Pulou';
  if (r === null || r === undefined) return 'Sem resposta';
  return ROTULO_POR_VALOR.get(r) ?? '';
}

export type Lado = 'concorda' | 'neutro' | 'discorda';

/** Lado de uma resposta na escala (null se pulada ou sem resposta). */
export function ladoDe(r: Resposta | null | undefined): Lado | null {
  if (r === null || r === undefined || r === 'pular') return null;
  return r > 0 ? 'concorda' : r < 0 ? 'discorda' : 'neutro';
}

/** Rótulo da posição documentada do candidato. */
export const ROTULO_POSICAO: Record<ValorPosicao, string> = {
  concorda: 'Concorda',
  discorda: 'Discorda',
  neutro: 'Posição intermediária',
  'sem-posicao': 'O plano não trata do assunto',
};

/** Percentual de sintonia para exibição (0 casas); "—" quando não há base de cálculo. */
export const fmtSintonia = (pct: number | null | undefined) => (pct === null || pct === undefined ? '—' : fmtPct(pct, 0));

/**
 * Nota editorial para o público: remove frases que são instrução interna de revisão/UI
 * (ex.: "mostrar como citação"), mantendo a explicação da posição.
 */
export function notaPublica(nota: string | undefined): string | null {
  if (!nota) return null;
  // Sem lookbehind (Safari antigo não aceita): frases = trechos até o ponto final.
  const frases = (nota.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).map((f) => f.trim()).filter((f) => f && !/\bmostrar como\b/i.test(f));
  const t = frases.join(' ').trim();
  return t || null;
}

// ── Duelo ─────────────────────────────────────────────────────────────────────

export interface ItemDuelo {
  afirmacao: Afirmacao;
  minha: Resposta | null;
  outra: Resposta | null;
  /** As duas responderam na escala. */
  comparavel: boolean;
  /** Mesmo lado da escala (as duas concordam, as duas discordam ou as duas neutras). */
  mesmoLado: boolean;
  /** 0–100 na mesma régua do teste (1 − |a − b| / 4), ou null se não comparável. */
  afinidade: number | null;
}

export interface ComparacaoDuelo {
  itens: ItemDuelo[];
  /** Afirmações em que as duas ficaram do mesmo lado. */
  iguais: number;
  /** Afirmações que as duas responderam na escala. */
  emComum: number;
  /** Afinidade média entre as duas pessoas (0–100) ou null. */
  afinidade: number | null;
}

const resp = (r: Respostas, id: string): Resposta | null => {
  const v = r[id];
  return ehResposta(v) ? v : null;
};

/** Compara duas pessoas afirmação a afirmação (só as duas — nunca agregados; ARCHITECTURE §1.2). */
export function compararDuelo(minhas: Respostas, outras: Respostas, ordem: readonly Afirmacao[] = AFIRMACOES): ComparacaoDuelo {
  const itens = ordem.map((afirmacao) => {
    const minha = resp(minhas, afirmacao.id);
    const outra = resp(outras, afirmacao.id);
    const a = ladoDe(minha);
    const b = ladoDe(outra);
    const comparavel = a !== null && b !== null;
    const afinidade = comparavel ? (1 - Math.abs((minha as number) - (outra as number)) / 4) * 100 : null;
    return { afirmacao, minha, outra, comparavel, mesmoLado: comparavel && a === b, afinidade };
  });
  const { pct, emComum } = calcularConcordancia(minhas, outras);
  return { itens, iguais: itens.filter((i) => i.mesmoLado).length, emComum, afinidade: pct };
}

export function frasesConcordancia(iguais: number, total: number): string {
  if (total === 0) return 'Vocês não responderam nenhuma afirmação em comum.';
  if (iguais === total) return 'Vocês ficaram do mesmo lado em todas as afirmações.';
  if (iguais === 0) return 'Vocês ficaram em lados diferentes em todas as afirmações — assunto não falta para uma boa conversa.';
  if (iguais / total >= 0.75) return 'Muita coisa em comum entre as respostas de vocês.';
  if (iguais / total >= 0.4) return 'Vocês concordam em parte — e discordam em temas que valem uma conversa.';
  return 'Vocês pensam diferente na maioria das afirmações — assunto não falta para uma boa conversa.';
}
