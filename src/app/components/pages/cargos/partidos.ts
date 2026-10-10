/**
 * Cores por partido (cargos do 1º turno: Senado, Câmara, Assembleias, governadores eleitos).
 *
 * Regras (ARCHITECTURE §1.1 e §10.2.9):
 *  - paleta categórica própria e ESTÁVEL (a mesma cor para o mesmo partido em todas as telas);
 *  - PT no vermelho do Lula e PL no azul do Flávio Bolsonaro — os MESMOS tokens dos candidatos (`--partido-2` =
 *    `var(--cand-vermelho)`, `--partido-1` = `var(--cand-azul)`), para a cor do partido nunca contradizer a do seu
 *    candidato a Presidente (decisão do dono do produto; ver CORES_IDENTIDADE em src/shared/constants.ts);
 *  - os outros 8 fogem de vermelho/rosa-avermelhado, de azul/anil, de turquesa e âmbar (slots neutros A/B, ainda usados
 *    nos governadores e na simulação com nomes ocultos) e do violeta da marca;
 *  - os 10 maiores partidos pelo nº de eleitos em 2026 (Câmara + Assembleias + Senado; critério de TAMANHO, nunca de
 *    espectro) recebem uma cor cada; os demais ficam em dois cinzas neutros alternados;
 *  - identidade nunca só pela cor: toda legenda, dica e lista traz a sigla do partido.
 *
 * Os 8 tons foram escolhidos por otimização (OKLab ×100, simulação de daltonismo Machado 2009 — protan, deutan e
 * tritan, severidade 1) para maximizar a PIOR separação entre QUAISQUER dois dos 10 partidos nos dois temas (nas
 * Assembleias quase todo par fica lado a lado em alguma UF), com matiz fora das faixas proibidas e distância mínima
 * de vermelho/azul (≥ 15 normal, ≥ 5 com daltonismo), da marca (≥ 15) e de turquesa/âmbar (≥ 12). Pior par: visão
 * normal ≈ 10,4 (MDB × UNIÃO) e daltonismo ≈ 5,0–5,8 (PL × REPUBLICANOS no escuro, PT × PSD no claro) — abaixo das
 * metas de 15/8, inevitável com 10 cores "todos os pares" e as faixas proibidas; por isso a sigla vem sempre junto.
 * A atribuição evita as cores oficiais conhecidas dos demais partidos (verde/amarelo para MDB, PSD, REPUBLICANOS e
 * PODE; amarelo/vermelho para PSB e PSOL). Contraste < 3:1 de algumas cores sobre a superfície → sempre há rótulo.
 *
 * Os valores são tokens do tema em src/app/styles.css (`--partido-1..10`, "R G B", tema escuro e claro), na ordem
 * de PARTIDOS_COM_COR; os componentes só usam `rgb(var(--partido-n))` via `corPartido()`. Espelho no servidor:
 * src/server/og-hemiciclo.ts.
 */
import { tokenCss } from '@/app/lib/tokens';

/** Ordem por tamanho (nº de eleitos em 2026: Câmara + Assembleias + Senado, dados do TSE). */
export const PARTIDOS_COM_COR = ['PL', 'PT', 'MDB', 'PSD', 'PP', 'REPUBLICANOS', 'UNIÃO', 'PODE', 'PSB', 'PSOL'] as const;

/** Mantido por compatibilidade: as variáveis agora vêm de styles.css (nada a injetar). */
export function garantirPaletaPartidos(): void {}

const normSigla = (s: string) => s.trim().toUpperCase().replace('UNIAO', 'UNIÃO');

/** Índice 1..10 do partido na paleta, ou 0 (demais partidos, cinza). */
export function slotPartido(sigla: string): number {
  const i = (PARTIDOS_COM_COR as readonly string[]).indexOf(normSigla(sigla));
  return i < 0 ? 0 : i + 1;
}

/** Cinzas dos demais partidos (alternados por ordem alfabética para separar vizinhos). */
const CINZAS = [tokenCss('cand-outros', 0.85), tokenCss('fg-subtle', 0.5)];
const DEMAIS_ORDEM = new Map<string, number>();

/** Preenchimento CSS do partido: `rgb(var(--partido-n) / α)` ou um cinza neutro. */
export function corPartido(sigla: string, alpha = 1): string {
  const s = slotPartido(sigla);
  if (s > 0) return alpha >= 1 ? `rgb(var(--partido-${s}))` : `rgb(var(--partido-${s}) / ${alpha})`;
  const k = normSigla(sigla);
  let i = DEMAIS_ORDEM.get(k);
  if (i === undefined) {
    // estável: hash simples da sigla (não depende da ordem de chegada)
    let h = 0;
    for (let j = 0; j < k.length; j++) h = (h * 31 + k.charCodeAt(j)) >>> 0;
    i = h % 2;
    DEMAIS_ORDEM.set(k, i);
  }
  return CINZAS[i];
}

/** true se o partido tem cor própria (senão entra em "demais partidos"). */
export const temCorPropria = (sigla: string) => slotPartido(sigla) > 0;

/** Rótulo de exibição da sigla (o TSE grava "UNIÃO", "PODE", "PCdoB"…): mantemos como vem. */
export const siglaExibicao = (s: string) => s;

/** Ordena siglas/contagens por tamanho (desc), desempate alfabético — nunca por espectro. */
export function porTamanho<T extends { sigla: string }>(itens: T[], tamanho: (x: T) => number): T[] {
  return [...itens].sort((a, b) => tamanho(b) - tamanho(a) || a.sigla.localeCompare(b.sigla, 'pt-BR'));
}
