/**
 * Escolha do anúncio de cada posição (contrato: src/shared/anuncios.ts, que reexporta `escolherAnuncio`). Módulo à
 * parte e pequeno: é a única função dos anúncios que o site precisa no JS inicial (a validação, os limites e as
 * mensagens do painel ficam fora do chunk de entrada).
 */
import type { AnuncioPublico, FormatoAnuncio } from './anuncios';

/** Hash FNV-1a 32 bits (escolha determinística por semente; não é criptografia). */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Escolhe o anúncio de um formato. Rotação ponderada pelo `peso`, determinística pela `semente` (ex.: id da visita
 * + posição na página: a mesma posição não troca a cada renderização, mas muda entre visitas). No 'topo', na 'tv', na
 * 'live' e em 'compartilhamento', a cota MASTER vence quando existe. `evitar` tira ids já mostrados em outra posição da mesma
 * página (se sobrar algum).
 */
export function escolherAnuncio<T extends Pick<AnuncioPublico, 'id' | 'formatos' | 'peso' | 'cota'>>(
  anuncios: readonly T[] | null | undefined,
  formato: FormatoAnuncio,
  semente: string,
  evitar: readonly string[] = [],
): T | null {
  let pool = (anuncios ?? []).filter((a) => a.formatos.includes(formato));
  if (pool.length === 0) return null;
  if (formato === 'topo' || formato === 'tv' || formato === 'live' || formato === 'compartilhamento') {
    const master = pool.filter((a) => a.cota === 'master');
    if (master.length) pool = master;
  }
  const sem = pool.filter((a) => !evitar.includes(a.id));
  if (sem.length) pool = sem;
  const total = pool.reduce((s, a) => s + Math.max(1, a.peso), 0);
  let r = fnv(`${semente}|${formato}`) % total;
  for (const a of pool) {
    r -= Math.max(1, a.peso);
    if (r < 0) return a;
  }
  return pool[pool.length - 1];
}
