/**
 * Download com retry/backoff e concorrência limitada, com cache em disco.
 * Usado por scripts/data/fetch-ibge.ts (independente dos helpers do pipeline do TSE).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface FetchCachedOptions {
  /** Ignora o cache e baixa de novo. */
  force?: boolean;
  /** Tentativas (padrão 5). */
  tentativas?: number;
  /** Valida o conteúdo antes de gravar (ex.: JSON parseável). */
  validar?: (texto: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Baixa `url` para `dest` (se ainda não existir) e devolve o texto. */
export async function fetchCached(url: string, dest: string, opts: FetchCachedOptions = {}): Promise<string> {
  if (!opts.force && existsSync(dest)) return readFile(dest, 'utf8');
  const tentativas = opts.tentativas ?? 5;
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'sintonia-data/1.0 (+pipeline de malhas)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      const texto = await res.text();
      opts.validar?.(texto);
      await mkdir(dirname(dest), { recursive: true });
      const tmp = `${dest}.tmp`;
      await writeFile(tmp, texto);
      await rename(tmp, dest);
      return texto;
    } catch (err) {
      ultimoErro = err;
      const espera = Math.min(15_000, 600 * 2 ** i) + Math.random() * 300;
      console.warn(`  ! falha (${i + 1}/${tentativas}) ${url}: ${(err as Error).message} — nova tentativa em ${Math.round(espera)} ms`);
      await sleep(espera);
    }
  }
  throw ultimoErro;
}

/** Executa `tarefas` com no máximo `limite` simultâneas, preservando a ordem dos resultados. */
export async function comLimite<T>(limite: number, tarefas: (() => Promise<T>)[]): Promise<T[]> {
  const resultados = new Array<T>(tarefas.length);
  let proxima = 0;
  async function trabalhador() {
    while (proxima < tarefas.length) {
      const i = proxima++;
      resultados[i] = await tarefas[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, trabalhador));
  return resultados;
}

export function validarJson(texto: string): void {
  JSON.parse(texto);
}
