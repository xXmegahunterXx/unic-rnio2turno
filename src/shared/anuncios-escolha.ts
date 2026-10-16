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
 * Formatos em que a cota MASTER (sem reserva) tem prioridade: havendo master no ar com o formato, só os masters
 * disputam. Também é a base do bloqueio de master sobreposto (`conflitoMaster`, src/shared/anuncios.ts).
 */
export const FORMATOS_MASTER_PRIORITARIO: readonly FormatoAnuncio[] = ['topo', 'tv', 'live', 'compartilhamento'];

/**
 * Escolhe o anúncio de um formato. Rotação ponderada pelo `peso`, determinística pela `semente` (ex.: id da visita
 * + posição na página: a mesma posição não troca a cada renderização, mas muda entre visitas). Ordem:
 *  1. só os anúncios com o formato;
 *  2. nos formatos de `FORMATOS_MASTER_PRIORITARIO`, havendo master sem reserva, só os masters (sem reserva);
 *  3. tira os ids de `evitar` (já mostrados em outra posição da mesma página), se sobrar algum;
 *  4. sobrando algum pago (sem `reserva`), tira as reservas — a reserva só preenche o espaço que nenhum pago ocupa
 *     (vem depois do `evitar`: num cartão em que todos os pagos já apareceram, a reserva preenche o lugar);
 *  5. sorteio pelo peso (FNV da semente + formato).
 */
export function escolherAnuncio<T extends Pick<AnuncioPublico, 'id' | 'formatos' | 'peso' | 'cota' | 'reserva'>>(
  anuncios: readonly T[] | null | undefined,
  formato: FormatoAnuncio,
  semente: string,
  evitar: readonly string[] = [],
): T | null {
  let pool = (anuncios ?? []).filter((a) => a.formatos.includes(formato));
  if (pool.length === 0) return null;
  if (FORMATOS_MASTER_PRIORITARIO.includes(formato)) {
    const master = pool.filter((a) => a.cota === 'master' && !a.reserva);
    if (master.length) pool = master;
  }
  const sem = pool.filter((a) => !evitar.includes(a.id));
  if (sem.length) pool = sem;
  const pagos = pool.filter((a) => !a.reserva);
  if (pagos.length) pool = pagos;
  const total = pool.reduce((s, a) => s + Math.max(1, a.peso), 0);
  let r = fnv(`${semente}|${formato}`) % total;
  for (const a of pool) {
    r -= Math.max(1, a.peso);
    if (r < 0) return a;
  }
  return pool[pool.length - 1];
}
