/**
 * Utilitários dos testes do servidor (não entram no build: só os *.test.ts importam este arquivo).
 * Monta o app com o motor REAL (dataset de public/data), relógio controlável e estado em pasta temporária.
 */
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createController, loadDataset } from '../engine/controller';
import type { LoadedDataset } from '../engine/api';
import type { AdminState } from '../shared/types';
import type { FetchLike } from '../tse';
import { createApp } from './app';
import { loadConfig } from './config';
import { createLogger } from './log';
import { createJsonStore } from './state-store';
import { TseManager } from './tse';

export const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
export const SENHA = 'senha-de-teste-bem-longa';
/** 09/10/2026 12:00 de Brasília (antes da eleição). */
export const AGORA_PADRAO = Date.UTC(2026, 9, 9, 15, 0, 0);

let dsPromise: Promise<LoadedDataset> | null = null;
export function datasetReal(): Promise<LoadedDataset> {
  dsPromise ??= loadDataset(async (p) => JSON.parse(await readFile(join(RAIZ, 'public', p), 'utf8')));
  return dsPromise;
}

export interface MontarOpcoes {
  env?: Record<string, string | undefined>;
  agora?: number;
  fetch?: FetchLike;
  estadoInicial?: AdminState;
  stateDir?: string;
}

export async function montar(o: MontarOpcoes = {}) {
  const ds = await datasetReal();
  const relogio = { t: o.agora ?? AGORA_PADRAO };
  const now = () => relogio.t;
  const stateDir = o.stateDir ?? mkdtempSync(join(tmpdir(), 'sintonia-teste-'));
  const config = loadConfig(
    { NODE_ENV: 'test', ADMIN_PASSWORD: SENHA, ADMIN_SECRET: 'segredo-de-teste-com-32-caracteres!!', STATE_DIR: stateDir, ...o.env },
    RAIZ,
  );
  const log = createLogger({ saida: false, now });
  const store = createJsonStore(stateDir, 'admin.json', { debounceMs: 0 });
  const controller = createController(ds, {
    modo: 'servidor',
    now,
    initialState: o.estadoInicial,
    onStateChange: (s) => store.salvar(s),
    log: (m) => log.info(`motor: ${m}`),
  });
  const tse = new TseManager({
    races: ds.meta.races,
    log: (m) => log.info(m),
    fetch: o.fetch,
    now,
    historico: createJsonStore(stateDir, 'tse-historico.json', { debounceMs: 0 }),
  });
  const s = createApp({ config, dataset: ds, controller, tse, log, now });
  return { ...s, ds, controller, tse, relogio, store, config, log, stateDir };
}

export type Montado = Awaited<ReturnType<typeof montar>>;

/** Faz login e devolve o header Cookie da sessão. */
export async function login(m: Montado, senha = SENHA): Promise<string> {
  const r = await m.app.request('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ senha }),
  });
  if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${await r.text()}`);
  const sc = r.headers.get('set-cookie') ?? '';
  return sc.split(';')[0];
}

export async function comando(m: Montado, cookie: string, cmd: unknown) {
  return m.app.request('/api/admin/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(cmd),
  });
}
