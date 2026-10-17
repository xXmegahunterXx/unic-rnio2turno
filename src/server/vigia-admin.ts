/**
 * Vigia do admin.json (várias instâncias com o mesmo STATE_DIR: volume compartilhado, PM2/cluster, o contêiner de ensaio
 * do update.sh). Quem não escreveu adota o estado do arquivo (setState não regrava → sem laço). Atraso ≤ ~1 s.
 *
 * Leva 3 — correção: as "Chaves da noite" gravam SEM subir a versão (controller.ts, mudouSemVersao). Antes, o filtro
 * `versao < atual` deixava passar a gravação ATRASADA da própria instância (o state-store grava com debounce): com 2 ou
 * 3 chaves trocadas em menos de ~1 s, o vigia via o arquivo da chave anterior, de mesma versão e conteúdo diferente, e o
 * adotava por cima do estado mais novo — "freio 1" ou "html-borda desligar" voltavam atrás em silêncio. Agora o arquivo
 * cujo conteúdo é uma das últimas gravações DESTE processo (`store.gravadoPorMim`, por hash) é sempre ignorado.
 */
import { unwatchFile, watchFile } from 'node:fs';
import type { AdminState } from '../shared/types';
import type { JsonStore } from './state-store';

/** O que o vigia faz com o conteúdo lido do arquivo. */
export type DecisaoVigia =
  | { acao: 'ignorar'; motivo: 'vazio' | 'invalido' | 'proprio' | 'antigo' | 'igual' }
  | { acao: 'recusar-simulacao'; versao: number }
  | { acao: 'adotar'; estado: AdminState };

/** Decisão pura (testada em vigia-admin.test.ts). */
export function decidirAdocao(
  texto: string | null,
  atual: AdminState,
  o: { gravadoPorMim: (t: string) => boolean; permitirSimulacao: boolean },
): DecisaoVigia {
  if (!texto) return { acao: 'ignorar', motivo: 'vazio' };
  // a própria gravação (atrasada pelo debounce ou vista depois do comando seguinte) nunca é "outra instância"
  if (o.gravadoPorMim(texto)) return { acao: 'ignorar', motivo: 'proprio' };
  let v: AdminState;
  try {
    v = JSON.parse(texto) as AdminState;
  } catch {
    return { acao: 'ignorar', motivo: 'invalido' };
  }
  if (!v || typeof v !== 'object' || typeof v.versao !== 'number') return { acao: 'ignorar', motivo: 'invalido' };
  if (v.versao < atual.versao) return { acao: 'ignorar', motivo: 'antigo' };
  if (JSON.stringify(v) === JSON.stringify(atual)) return { acao: 'ignorar', motivo: 'igual' };
  if (!o.permitirSimulacao && v.fonte === 'simulacao') return { acao: 'recusar-simulacao', versao: v.versao };
  return { acao: 'adotar', estado: v };
}

export interface VigiaAdminDeps {
  store: Pick<JsonStore, 'caminho' | 'lerTexto' | 'gravadoPorMim'>;
  controller: { state(): AdminState; setState(s: AdminState): void };
  permitirSimulacao: boolean;
  /** Depois de adotar (ex.: ressincronizar a fonte TSE). */
  aoAdotar?: (s: AdminState) => void;
  log: { info(m: string): void; aviso(m: string): void; erro(m: string, e?: unknown): void };
  /** Intervalo do watchFile (padrão 1000 ms). */
  intervaloMs?: number;
}

/** Liga o vigia; devolve a função que o desliga. */
export function vigiarAdmin(d: VigiaAdminDeps): () => void {
  const caminho = d.store.caminho;
  watchFile(caminho, { interval: d.intervaloMs ?? 1000, persistent: false }, (cur, prev) => {
    if (cur.mtimeMs === prev.mtimeMs || cur.mtimeMs === 0) return;
    const r = decidirAdocao(d.store.lerTexto(), d.controller.state(), { gravadoPorMim: (t) => d.store.gravadoPorMim(t), permitirSimulacao: d.permitirSimulacao });
    if (r.acao === 'ignorar') return;
    if (r.acao === 'recusar-simulacao') {
      d.log.aviso(`Estado de outra instância IGNORADO: fonte "simulacao" sem ALLOW_SIMULACAO=1 (versão ${r.versao})`);
      return;
    }
    try {
      d.controller.setState(r.estado);
      const s = d.controller.state();
      d.aoAdotar?.(s);
      d.log.info(`Estado do admin sincronizado de outra instância (versão ${s.versao}, fonte ${s.fonte})`);
    } catch (e) {
      d.log.erro('Falha ao adotar o estado de outra instância', e);
    }
  });
  return () => unwatchFile(caminho);
}
