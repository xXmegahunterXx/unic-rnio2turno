/**
 * Hospedeiro RPC do motor (isomórfico). Usado pelo Web Worker do demo (src/app/data/worker.ts) e, como
 * fallback, na thread principal (src/app/data/local.ts) — mesma troca de mensagens nos dois casos.
 *
 * Protocolo:
 *   → { type: 'init', base, modo?, state? }      carrega o dataset (fetch relativo a `base`) e cria o controller
 *   → { type: 'call', id, method, args }        chamadas (aguardam o init). Snapshots: o último argumento
 *                                               opcional é o instante `t` (epoch ms, "reveja a noite");
 *                                               zona/seção aguardam os locais de votação da UF (cache)
 *   → { type: 'setState', state }               estado vindo de outra aba: aplicado só se for MAIS NOVO que o
 *                                               atual (estadoMaisNovo); nunca gera 'state' de volta
 *   ← { type: 'ready', state, ms, cargaMs, modeloMs }  ms = boot total; cargaMs = download + JSON do dataset;
 *                                               modeloMs = construção do modelo (o resto é a estrutura)
 *   ← { type: 'reply', id, ok, result | error }
 *   ← { type: 'state', state }                  mudança feita por comando nesta aba (persistir/propagar)
 *   ← { type: 'fatal', error }                  falha ao carregar/construir
 */
import type { AdminState } from '../shared/types';
import type { Controller, JsonLoader } from './api';
import { createController, loadDataset } from './controller';
import { estadoMaisNovo } from './sync';

export type HostMethod =
  | 'status'
  | 'meta'
  | 'nacional'
  | 'uf'
  | 'municipio'
  | 'zona'
  | 'secao'
  | 'municipiosBr'
  | 'adminSnapshot'
  | 'command'
  | 'presets';

export interface HostError {
  name: string;
  message: string;
  status?: number;
}

export type HostIn =
  | { type: 'init'; base: string; modo?: 'demo' | 'servidor'; state?: AdminState | null }
  | { type: 'call'; id: number; method: HostMethod; args: unknown[] }
  | { type: 'setState'; state: AdminState };

export type HostOut =
  | { type: 'ready'; state: AdminState; ms: number; cargaMs?: number; modeloMs?: number }
  | { type: 'reply'; id: number; ok: true; result: unknown }
  | { type: 'reply'; id: number; ok: false; error: HostError }
  | { type: 'state'; state: AdminState }
  | { type: 'fatal'; error: HostError };

export function serializaErro(e: unknown): HostError {
  if (e && typeof e === 'object') {
    const o = e as { name?: unknown; message?: unknown; status?: unknown };
    return {
      name: typeof o.name === 'string' ? o.name : 'Error',
      message: typeof o.message === 'string' ? o.message : String(e),
      status: typeof o.status === 'number' ? o.status : undefined,
    };
  }
  return { name: 'Error', message: String(e) };
}

/** Leitor de JSON por fetch, relativo a `base` (URL absoluta do diretório que contém `data/`). */
export function fetchJsonLoader(base: string): JsonLoader {
  return async (path: string) => {
    const url = new URL(path, base).toString();
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} ao carregar ${url}`);
    return r.json();
  };
}

/** Instante opcional ("reveja a noite"): número finito ou ausente. */
const instante = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function dispatch(c: Controller, method: HostMethod, a: unknown[]): unknown {
  switch (method) {
    case 'status':
      return c.status();
    case 'meta':
      return c.meta();
    case 'nacional':
      return c.nacional(a[0] as string, instante(a[1]));
    case 'uf':
      return c.uf(a[0] as string, a[1] as never, instante(a[2]));
    case 'municipio':
      return c.municipio(a[0] as string, a[1] as never, a[2] as string, instante(a[3]));
    case 'zona':
      return c.zona(a[0] as string, a[1] as never, a[2] as string, a[3] as number, instante(a[4]));
    case 'secao':
      return c.secao(a[0] as string, a[1] as never, a[2] as string, a[3] as number, a[4] as number, instante(a[5]));
    case 'municipiosBr':
      return c.municipiosBr(a[0] as string, instante(a[1]));
    case 'adminSnapshot':
      return c.adminSnapshot();
    case 'command':
      return c.command(a[0] as never);
    case 'presets':
      return c.presets();
    default:
      throw new Error(`Método desconhecido: ${String(method)}`);
  }
}

const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Cria o tratador de mensagens. `post` envia respostas; `makeLoader(base)` cria o leitor do dataset. */
export function createEngineHost(
  post: (m: HostOut) => void,
  makeLoader: (base: string) => JsonLoader = fetchJsonLoader,
): (msg: HostIn) => Promise<void> {
  let ctrl: Controller | null = null;
  let ready: Promise<Controller> | null = null;
  let pendente: AdminState | null = null;

  return async function handle(msg: HostIn): Promise<void> {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'init') {
      if (ready) return;
      ready = (async () => {
        const t0 = perf();
        const ds = await loadDataset(makeLoader(msg.base));
        const cargaMs = Math.round(perf() - t0);
        const c = createController(ds, {
          modo: msg.modo ?? 'demo',
          initialState: msg.state ?? undefined,
          onStateChange: (s) => post({ type: 'state', state: s }),
        });
        if (pendente && estadoMaisNovo(pendente, c.state())) c.setState(pendente);
        pendente = null;
        ctrl = c;
        post({ type: 'ready', state: c.state(), ms: Math.round(perf() - t0), cargaMs, modeloMs: c.metrics().modeloMs ?? undefined });
        return c;
      })();
      ready.catch((e) => post({ type: 'fatal', error: serializaErro(e) }));
      return;
    }
    if (msg.type === 'setState') {
      // mensagens podem chegar enfileiradas depois de um estado mais novo (ex.: durante a construção)
      if (ctrl) {
        if (estadoMaisNovo(msg.state, ctrl.state())) ctrl.setState(msg.state);
      } else if (!pendente || estadoMaisNovo(msg.state, pendente)) pendente = msg.state;
      return;
    }
    if (msg.type === 'call') {
      try {
        if (!ready) throw new Error('Motor não inicializado (falta a mensagem init).');
        const c = await ready;
        // zona/seção: os locais de votação da UF entram na resposta (carregados uma vez, com cache)
        if ((msg.method === 'zona' || msg.method === 'secao') && c.carregaLocais && typeof msg.args?.[1] === 'string')
          await c.carregaLocais(msg.args[1]);
        post({ type: 'reply', id: msg.id, ok: true, result: dispatch(c, msg.method, msg.args ?? []) });
      } catch (e) {
        post({ type: 'reply', id: msg.id, ok: false, error: serializaErro(e) });
      }
    }
  };
}
