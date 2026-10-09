/** Pequenos formatadores de texto das páginas de detalhe (sobre os de src/shared/format.ts). */
import { fmtCompact, fmtInt } from '@/shared/format';

/** "9,1 mi de eleitores" · "348,8 mil eleitores" · "640 eleitores". */
export function fmtEleitores(n: number): string {
  if (n >= 1_000_000) return `${fmtCompact(n)} de eleitores`;
  if (n >= 10_000) return `${fmtCompact(n)} eleitores`;
  return `${fmtInt(n)} ${n === 1 ? 'eleitor' : 'eleitores'}`;
}

/** Zona/seção com 4 dígitos, como no título de eleitor: 0001. */
export const fmt4 = (n: number) => String(n).padStart(4, '0');
