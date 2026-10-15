/**
 * Frescor dos dados ao vivo (fonte 'tse'): regras puras usadas pelo cliente HTTP e pelos hooks.
 *
 * O servidor publica no `/api/status` a MARCA dos números de cada disputa do 2º turno (`LiveStatus.frescor`, hash do
 * conteúdo): ela muda no instante em que o TSE publica dado novo. Com isso:
 *  - os hooks reconsultam o placar da disputa assim que a marca muda (sem esperar o próximo ciclo de consulta);
 *  - o cliente HTTP põe a marca no endereço do placar nacional (`?d=<marca>`): dado novo = endereço novo, então nem
 *    o navegador nem a CDN entregam a cópia anterior (e a CDN pode guardar cada marca por mais tempo).
 * Fora da fonte 'tse' (pré, simulação, demo) não há `frescor`: tudo segue no intervalo de sempre.
 */
import type { LiveStatus, RaceId } from '@/shared/types';

/** Marcas por disputa (só as que vieram no status). */
export function marcasDoStatus(status: Pick<LiveStatus, 'frescor'> | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  const f = status?.frescor;
  if (!f || typeof f !== 'object') return out;
  for (const [race, v] of Object.entries(f)) {
    if (v && typeof v.marca === 'string' && v.marca && v.marca.length <= 16) out[race] = v.marca;
  }
  return out;
}

/**
 * Atualiza `vistas` com as marcas do status e devolve as disputas cuja marca MUDOU. A primeira vez que uma disputa
 * aparece não conta (os dados acabaram de ser pedidos junto com o status). `vistas` é guardado por aba (módulo),
 * não por componente: vários componentes leem o status ao mesmo tempo e só o primeiro deve disparar a reconsulta.
 */
export function marcasQueMudaram(vistas: Map<string, string>, status: Pick<LiveStatus, 'frescor'> | undefined | null): RaceId[] {
  const mudaram: RaceId[] = [];
  for (const [race, marca] of Object.entries(marcasDoStatus(status))) {
    const antes = vistas.get(race);
    if (antes !== undefined && antes !== marca) mudaram.push(race as RaceId);
    vistas.set(race, marca);
  }
  return mudaram;
}

/** Query `?d=<marca>` do placar nacional ('' sem marca). */
export function queryMarca(marca: string | undefined): string {
  return marca ? `?d=${encodeURIComponent(marca)}` : '';
}
