/**
 * Cores NEUTRAS por partido (cargos do 1º turno: Senado, Câmara, Assembleias, governadores eleitos).
 *
 * Regras (ARCHITECTURE §1.1 e §10.2.9):
 *  - paleta categórica própria, ESTÁVEL (a mesma cor para o mesmo partido em todas as telas) e sem relação
 *    com as cores oficiais dos partidos. Sem vermelho nem azul saturados (nenhum eixo "vermelho = esquerda /
 *    azul = direita"), sem turquesa nem âmbar (reservados aos slots A/B dos candidatos do 2º turno) e sem o
 *    violeta da marca;
 *  - os 10 maiores partidos pelo nº de eleitos em 2026 (Câmara + Assembleias + Senado; critério de TAMANHO,
 *    nunca de espectro) recebem uma cor cada; os demais ficam em dois cinzas neutros alternados;
 *  - identidade nunca só pela cor: toda legenda, dica e lista traz a sigla do partido.
 *
 * Paleta validada com o validador de paletas categóricas (OKLab, CVD Machado 2009): lightness/croma dentro da
 * faixa, separação CVD ≥ 9,6 e visão normal ≥ 15 entre vizinhos nas ordens reais (Câmara, Assembleias, Senado),
 * nos dois temas. Contraste < 3:1 de 5 cores no tema claro → sempre há rótulo/legenda (regra de alívio).
 *
 * Os valores ficam como variáveis CSS `--partido-1..10` ("R G B", mesma convenção de src/app/styles.css),
 * injetadas uma vez no <head>; os componentes só usam `rgb(var(--partido-n))` via `corPartido()`.
 * (Pendência registrada: mover estes tokens para styles.css/tailwind.config quando o dono do tema puder.)
 */
import { tokenCss } from '@/app/lib/tokens';

/** Ordem por tamanho (nº de eleitos em 2026: Câmara + Assembleias + Senado, dados do TSE). */
export const PARTIDOS_COM_COR = ['PL', 'PT', 'MDB', 'PSD', 'PP', 'REPUBLICANOS', 'UNIÃO', 'PODE', 'PSB', 'PSOL'] as const;

/** "R G B" por slot (1..10), tema escuro e claro. */
const ESCURO = [
  '155 78 140', // ameixa
  '93 165 110', // sálvia
  '152 75 22', // argila
  '165 131 203', // lavanda
  '115 116 21', // oliva
  '204 118 139', // rosa antigo
  '87 85 162', // anil
  '109 163 97', // musgo
  '178 73 129', // fúcsia
  '166 145 63', // cáqui
];
const CLARO = [
  '136 60 122',
  '111 184 128',
  '170 88 48',
  '184 150 223',
  '109 110 10',
  '229 141 161',
  '85 84 153',
  '109 163 97',
  '178 73 129',
  '198 176 95',
];

function css(): string {
  const bloco = (vals: string[]) => vals.map((v, i) => `--partido-${i + 1}: ${v};`).join(' ');
  return [
    `:root, :root[data-theme='dark'] { ${bloco(ESCURO)} }`,
    `:root[data-theme='light'] { ${bloco(CLARO)} }`,
    `@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) { ${bloco(CLARO)} } }`,
  ].join('\n');
}

/** Injeta as variáveis uma única vez (idempotente; no-op fora do navegador). */
export function garantirPaletaPartidos(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('sintonia-paleta-partidos')) return;
  const el = document.createElement('style');
  el.id = 'sintonia-paleta-partidos';
  el.textContent = css();
  document.head.appendChild(el);
}
garantirPaletaPartidos();

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
