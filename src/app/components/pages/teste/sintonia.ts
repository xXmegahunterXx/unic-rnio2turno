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
  direcao,
  ESCALA,
  ehResposta,
  ladoDoConcordo,
  ordemDoTeste,
  TEMAS,
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

/**
 * As 5 opções da escala (sem "Pular"), na ordem de EXIBIÇÃO: discordo totalmente (à esquerda) → concordo totalmente
 * (à direita), a convenção mais comum das escalas Likert. Atalhos 1–5 seguem a mesma ordem visual. A ordem de
 * `ESCALA` (conteúdo) não muda — o código das respostas depende só dos valores.
 */
export const OPCOES_ESCALA = ESCALA.filter((o): o is { valor: ValorLikert; rotulo: string } => o.valor !== 'pular').reverse();

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

// ── Tempo estimado (honesto) ──────────────────────────────────────────────────
//
// Medimos a leitura: as afirmações têm até 110 caracteres (~18 palavras ≈ 5 s de leitura no celular) e a decisão leva
// mais 2–3 s. 7,5 s por afirmação ⇒ 24 em ≈ 3 min e 12 em ≈ 2 min. Durante o teste, a estimativa do que falta usa o
// RITMO DA PRÓPRIA PESSOA (mediana dos intervalos entre respostas, limitada a 3–20 s) a partir da 3ª resposta.

export const SEGUNDOS_POR_AFIRMACAO = 7.5;

/** Minutos estimados para `n` afirmações (arredondado, mínimo 1). */
export const minutosEstimados = (n: number) => Math.max(1, Math.round((n * SEGUNDOS_POR_AFIRMACAO) / 60));

/** Segundos que faltam, pelo ritmo da pessoa (intervalos em ms entre respostas) ou pelo padrão. */
export function segundosRestantes(restantes: number, intervalosMs: readonly number[] = []): number {
  if (restantes <= 0) return 0;
  const validos = intervalosMs.filter((x) => Number.isFinite(x) && x > 0);
  let porItem = SEGUNDOS_POR_AFIRMACAO;
  if (validos.length >= 3) {
    const ord = [...validos].sort((a, b) => a - b);
    const meio = ord.length >> 1;
    const mediana = ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
    porItem = Math.min(20, Math.max(3, mediana / 1000));
  }
  return restantes * porItem;
}

/** "menos de 1 min" · "≈ 2 min" (sem número quando não falta nada). */
export function textoRestante(segundos: number): string {
  if (segundos <= 0) return '';
  if (segundos < 45) return 'menos de 1 min';
  return `≈ ${Math.max(1, Math.round(segundos / 60))} min`;
}

// ── Modo rápido (12 afirmações, uma por tema) ─────────────────────────────────
//
// Cabe no modelo atual sem mudar o código da URL: as 12 afirmações que ficam de fora vão como "não respondida" (0 no
// código), que o cálculo já trata como fora da conta. A fórmula é a MESMA; só há menos itens (resultado menos preciso,
// e a página diz isso). Para não distorcer, a seleção sorteada pela semente sai só entre as combinações "uma por tema"
// que mantêm o equilíbrio do teste completo (ver `validarAfirmacoes`):
//   - concordar aproxima de cada candidato em quantidades iguais (±1);
//   - afirmações com posições opostas: tantas em que o 13 concorda quanto em que o 22 concorda (±1);
//   - o número de afirmações com posição documentada é o mesmo para os dois (±1) — os dois percentuais têm a mesma base;
//   - no máximo 1 afirmação de controle (os dois planos com a mesma posição).
// O Duelo de quem fez o modo rápido usa exatamente as afirmações que essa pessoa respondeu.

export interface EquilibrioSelecao {
  ladoDoConcordo: { 13: number; 22: number; ambos: number };
  opostas: { 13: number; 22: number };
  comPosicao: { 13: number; 22: number };
  controles: number;
}

export function equilibrioDe(lista: readonly Afirmacao[]): EquilibrioSelecao {
  const e: EquilibrioSelecao = { ladoDoConcordo: { 13: 0, 22: 0, ambos: 0 }, opostas: { 13: 0, 22: 0 }, comPosicao: { 13: 0, 22: 0 }, controles: 0 };
  for (const a of lista) {
    const l = ladoDoConcordo(a);
    if (l !== null) e.ladoDoConcordo[l]++;
    const d = direcao(a);
    if (d) e.opostas[d]++;
    for (const c of CANDIDATOS) if (a.posicoes[c].valor !== 'sem-posicao') e.comPosicao[c]++;
    if (a.posicoes[13].valor === a.posicoes[22].valor && a.posicoes[13].valor !== 'sem-posicao') e.controles++;
  }
  return e;
}

export const selecaoEquilibrada = (e: EquilibrioSelecao) =>
  Math.abs(e.ladoDoConcordo[13] - e.ladoDoConcordo[22]) <= 1 &&
  Math.abs(e.opostas[13] - e.opostas[22]) <= 1 &&
  Math.abs(e.comPosicao[13] - e.comPosicao[22]) <= 1 &&
  e.controles <= 1;

let combinacoes: string[][] | null = null;

/** Todas as seleções "uma afirmação por tema" equilibradas (ids na ordem canônica). Calculado uma vez (2¹² combinações). */
export function selecoesRapidas(): readonly string[][] {
  if (combinacoes) return combinacoes;
  const grupos = TEMAS.map((t) => AFIRMACOES.filter((a) => a.tema === t.id)).filter((g) => g.length > 0);
  const out: string[][] = [];
  const n = 1 << grupos.length;
  for (let m = 0; m < n; m++) {
    // Tema com uma só afirmação: o bit é ignorado (evita repetir a mesma seleção).
    if (grupos.some((g, i) => g.length < 2 && (m >> i) & 1)) continue;
    const sel = grupos.map((g, i) => g[Math.min(g.length - 1, (m >> i) & 1)]);
    if (selecaoEquilibrada(equilibrioDe(sel))) out.push(AFIRMACOES.filter((a) => sel.includes(a)).map((a) => a.id));
  }
  combinacoes = out;
  return out;
}

/** Número de afirmações do modo rápido (uma por tema). */
export const N_RAPIDO = TEMAS.length;

/** As afirmações do modo rápido para uma semente (determinístico; ids na ordem canônica). */
export function selecaoRapida(seed: number): string[] {
  const todas = selecoesRapidas();
  if (!todas.length) return AFIRMACOES.map((a) => a.id); // nunca deveria acontecer (testado)
  // Mistura a semente (a mesma semente define a ordem; aqui escolhe a combinação).
  let h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return [...todas[(h >>> 0) % todas.length]];
}

/** Ordem de exibição do quiz: as 24 (ou só `ids`, no modo rápido/duelo rápido), embaralhadas pela semente. */
export function ordemQuiz(seed: number, ids?: readonly string[] | null): Afirmacao[] {
  if (!ids || ids.length === 0 || ids.length >= AFIRMACOES.length) return ordemDoTeste(seed);
  const set = new Set(ids);
  return ordemDoTeste(
    seed,
    AFIRMACOES.filter((a) => set.has(a.id)),
  );
}

/**
 * Qual conjunto de afirmações uma pessoa recebeu, a partir das respostas decodificadas do link: as 24 (teste completo,
 * todas com resposta ou "pular") ou só as que têm resposta (modo rápido — as demais vêm como "não respondida").
 */
export function conjuntoRespondido(respostas: Respostas): { rapido: boolean; ids: string[] } {
  const ids = AFIRMACOES.filter((a) => respostas[a.id] !== undefined).map((a) => a.id);
  const rapido = ids.length > 0 && ids.length < AFIRMACOES.length;
  return { rapido, ids: rapido ? ids : AFIRMACOES.map((a) => a.id) };
}

/** Quantas foram puladas ("Pular") entre `ids` (não conta as que ficaram de fora do modo rápido). */
export const contarPuladas = (respostas: Respostas, ids: readonly string[]) => ids.reduce((n, id) => n + (respostas[id] === 'pular' ? 1 : 0), 0);
