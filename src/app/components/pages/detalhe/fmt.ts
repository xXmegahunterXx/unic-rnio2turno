/** Pequenos formatadores de texto das páginas de detalhe (sobre os de src/shared/format.ts). */
import type { UF } from '@/shared/types';
import { fmtCompact, fmtInt } from '@/shared/format';
import { emUf } from '@/engine/events';

/** "9,1 mi de eleitores" · "348,8 mil eleitores" · "640 eleitores". */
export function fmtEleitores(n: number): string {
  if (n >= 1_000_000) return `${fmtCompact(n)} de eleitores`;
  if (n >= 10_000) return `${fmtCompact(n)} eleitores`;
  return `${fmtInt(n)} ${n === 1 ? 'eleitor' : 'eleitores'}`;
}

/** Zona/seção com 4 dígitos, como no título de eleitor: 0001. */
export const fmt4 = (n: number) => String(n).padStart(4, '0');

/** "em São Paulo" · "no Rio de Janeiro" · "na Bahia" · "no exterior" (mesma regra dos textos do feed). */
export { emUf };

/** Municípios: quase sempre "em"; o Rio de Janeiro (cidade) pede artigo. */
export function emMun(nome: string): string {
  return nome === 'Rio de Janeiro' ? `no ${nome}` : `em ${nome}`;
}

/** "O Distrito Federal" · "A Bahia" · "São Paulo" (início de frase). */
export function comArtigo(uf: UF, nome: string): string {
  const prep = emUf(uf, nome).split(' ')[0];
  return prep === 'no' ? `O ${nome}` : prep === 'na' ? `A ${nome}` : nome;
}
