/**
 * Utilitário SÓ PARA NODE (servidor, testes, scripts): leitor de JSON do disco para `loadDataset`.
 * Não é reexportado por `src/engine/index.ts` (o motor é isomórfico; este arquivo importa `node:fs`).
 *
 *   const ds = await loadDataset(fsJsonLoader('public'));   // lê public/data/meta.json, public/data/uf/*.json
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JsonLoader } from './api';

/** `root` é o diretório que contém `data/` (ex.: 'public' ou 'dist'). */
export function fsJsonLoader(root: string): JsonLoader {
  return async (path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));
}
