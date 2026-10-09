/**
 * Ordem total entre AdminStates para sincronização (abas do demo, réplicas): o "mais novo" vence.
 * Critérios: `versao` → `relogio.ancoraWall` → desempate determinístico pelo JSON.
 * Sem dependências (importado também pela thread principal do demo).
 */
import type { AdminState } from '../shared/types';

export function estadoMaisNovo(a: AdminState, b: AdminState): boolean {
  if (a.versao !== b.versao) return a.versao > b.versao;
  if (a.relogio.ancoraWall !== b.relogio.ancoraWall) return a.relogio.ancoraWall > b.relogio.ancoraWall;
  return JSON.stringify(a) > JSON.stringify(b);
}
