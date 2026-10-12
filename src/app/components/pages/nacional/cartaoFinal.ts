/**
 * Cartão final das faixas de governador ("As N disputas lado a lado", na home e na apuração): ocupa as colunas que
 * sobram na última linha da grade (`spanFinal`) e, quando fica com a linha inteira, vira uma faixa horizontal
 * (ícone · texto · link) em vez de um bloco alto e vazio. Funciona com qualquer número de disputas (UFS_GOV_2T).
 *
 * Classes escritas por extenso: o Tailwind só gera o que aparece literalmente no código.
 */
import { cn } from '@/app/lib/cn';
import { spanFinal } from './fase';

type Bp = 'sm' | 'lg' | 'xl';

const SPAN: Record<Bp, Record<number, string>> = {
  sm: { 1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4' },
  lg: { 1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4' },
  xl: { 1: 'min-[1360px]:col-span-1', 2: 'min-[1360px]:col-span-2', 3: 'min-[1360px]:col-span-3', 4: 'min-[1360px]:col-span-4' },
};

/** Linha inteira: horizontal, altura do conteúdo. */
const LINHA: Record<Bp, { cartao: string; texto: string }> = {
  sm: { cartao: 'sm:min-h-0 sm:flex-row sm:items-center sm:justify-start sm:gap-4', texto: 'sm:flex-1' },
  lg: { cartao: 'lg:min-h-0 lg:flex-row lg:items-center lg:justify-start lg:gap-4', texto: 'lg:flex-1' },
  xl: {
    cartao: 'min-[1360px]:min-h-0 min-[1360px]:flex-row min-[1360px]:items-center min-[1360px]:justify-start min-[1360px]:gap-4',
    texto: 'min-[1360px]:flex-1',
  },
};

/** Parte da linha: o bloco vertical de sempre (desfaz a faixa de um ponto de quebra menor). */
const BLOCO: Record<Bp, { cartao: string; texto: string }> = {
  sm: { cartao: 'sm:min-h-[176px] sm:flex-col sm:items-stretch sm:justify-between sm:gap-0', texto: 'sm:flex-none' },
  lg: { cartao: 'lg:min-h-[176px] lg:flex-col lg:items-stretch lg:justify-between lg:gap-0', texto: 'lg:flex-none' },
  xl: {
    cartao: 'min-[1360px]:min-h-[176px] min-[1360px]:flex-col min-[1360px]:items-stretch min-[1360px]:justify-between min-[1360px]:gap-0',
    texto: 'min-[1360px]:flex-none',
  },
};

/**
 * Classes do cartão final para `n` itens antes dele numa grade com estas colunas por ponto de quebra
 * (`sm`, `lg` e `xl` = 1360 px). `item` vai no <li>; `cartao` no link (que já é `flex flex-col` com `min-h-[176px]`);
 * `texto` no bloco de texto do meio.
 */
export function cartaoFinal(n: number, grade: Partial<Record<Bp, number>>): { item: string; cartao: string; texto: string } {
  const item: string[] = [];
  const cartao: string[] = [];
  const texto: string[] = [];
  for (const bp of ['sm', 'lg', 'xl'] as const) {
    const cols = grade[bp];
    if (!cols) continue;
    const span = spanFinal(n, cols);
    const modo = span === cols ? LINHA[bp] : BLOCO[bp];
    item.push(SPAN[bp][span]);
    cartao.push(modo.cartao);
    texto.push(modo.texto);
  }
  return { item: cn(item), cartao: cn(cartao), texto: cn(texto) };
}
