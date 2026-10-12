/** Formatação pt-BR (números, percentuais, horários de Brasília). */
import { TZ } from './constants';

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** 12.345.678 */
export const fmtInt = (n: number) => nf0.format(Math.round(n));
/** 51,93% (2 casas, como o TSE) */
export const fmtPct = (n: number, casas: 0 | 1 | 2 = 2) =>
  `${casas === 2 ? nf2.format(n) : casas === 1 ? nf1.format(n) : nf0.format(n)}%`;
/** 12,5 (número com casas fixas, sem %) */
export const fmtDecimal = (n: number, casas: 0 | 1 | 2 = 1) => (casas === 2 ? nf2 : casas === 1 ? nf1 : nf0).format(n);
/** 2,3 mi / 12,9 mil */
export const fmtCompact = (n: number) => compact.format(n);
/** +3,2 p.p. */
export const fmtPP = (n: number, casas: 1 | 2 = 1) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${casas === 1 ? nf1.format(Math.abs(n)) : nf2.format(Math.abs(n))} p.p.`;

const hm = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const hms = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dhm = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

/** 18:42 (Brasília) */
export const fmtHora = (ms: number) => hm.format(ms);
/** 18:42:07 (Brasília) */
export const fmtHoraSeg = (ms: number) => hms.format(ms);
/** 25/10, 18:42 */
export const fmtDataHora = (ms: number) => dhm.format(ms).replace(' ', ' ');

/** "SÃO JOSÉ DO RIO PRETO" → "São José do Rio Preto" */
export function titleCasePt(s: string): string {
  const minus = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'"]);
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w, i) => (i > 0 && minus.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
    .replace(/D'([a-z])/g, (_, c) => `d'${c.toUpperCase()}`);
}

/** Remove acentos e baixa caixa — para busca. */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "AC, AM e DF" — lista em pt-BR: vírgulas e a conjunção ("e"/"ou") antes do último item. */
export function fmtLista(itens: readonly string[], conjuncao: 'e' | 'ou' = 'e'): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} ${conjuncao} ${itens[itens.length - 1]}`;
}

const EXTENSO = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte',
];

/**
 * Número inteiro por extenso, para quantidades pequenas no meio de uma frase ("seis estados", "duas disputas").
 * De 0 a 30; fora disso (ou não inteiro), cai em `fmtInt`. `genero` 'f' flexiona um/dois → uma/duas.
 */
export function fmtExtenso(n: number, genero: 'm' | 'f' = 'm'): string {
  if (!Number.isInteger(n) || n < 0 || n > 30) return fmtInt(n);
  const fem = (s: string) => (genero === 'f' ? s.replace(/^um$/, 'uma').replace(/^dois$/, 'duas') : s);
  if (n <= 20) return fem(EXTENSO[n]);
  if (n === 30) return 'trinta';
  return `vinte e ${fem(EXTENSO[n - 20])}`;
}
