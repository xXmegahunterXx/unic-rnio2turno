/**
 * Persistência em disco de pequenos documentos JSON (AdminState, histórico do TSE), com:
 *  - escrita atômica: grava em arquivo temporário, fsync e `rename` sobre o destino (nunca deixa JSON pela metade);
 *  - debounce: rajadas de mudanças viram uma escrita (padrão 250 ms);
 *  - escritas serializadas (nunca duas ao mesmo tempo) e `flush()` para o encerramento gracioso.
 */
import { readFileSync } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface JsonStore {
  readonly caminho: string;
  /** Conteúdo salvo (JSON) ou null se não existir/estiver corrompido. Síncrono (só na subida). */
  ler(): unknown | null;
  /** Agenda a gravação (debounce). O valor é serializado no momento da escrita (`() => valor`) ou já. */
  salvar(valor: unknown | (() => unknown)): void;
  /** Grava o pendente agora e espera terminar. */
  flush(): Promise<void>;
  readonly escritas: number;
}

export interface JsonStoreOptions {
  debounceMs?: number;
  onErro?: (err: unknown) => void;
}

export function createJsonStore(dir: string, arquivo: string, opts: JsonStoreOptions = {}): JsonStore {
  const caminho = join(dir, arquivo);
  const debounceMs = opts.debounceMs ?? 250;
  let pendente: { v: unknown | (() => unknown) } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let gravando: Promise<void> = Promise.resolve();
  let escritas = 0;
  let seq = 0;

  const gravar = async (texto: string) => {
    await mkdir(dirname(caminho), { recursive: true });
    const tmp = `${caminho}.${process.pid}.${++seq}.tmp`;
    const fh = await open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(texto, 'utf8');
      await fh.sync();
    } finally {
      await fh.close();
    }
    try {
      await rename(tmp, caminho);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
    escritas++;
  };

  const descarregar = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pendente) return gravando;
    const { v } = pendente;
    pendente = null;
    let texto: string;
    try {
      texto = JSON.stringify(typeof v === 'function' ? (v as () => unknown)() : v);
    } catch (err) {
      opts.onErro?.(err);
      return gravando;
    }
    gravando = gravando.then(() => gravar(texto)).catch((err) => opts.onErro?.(err));
    return gravando;
  };

  return {
    caminho,
    ler() {
      try {
        return JSON.parse(readFileSync(caminho, 'utf8')) as unknown;
      } catch {
        return null;
      }
    },
    salvar(valor) {
      pendente = { v: valor };
      if (timer) return;
      timer = setTimeout(() => void descarregar(), debounceMs);
      (timer as { unref?: () => void }).unref?.();
    },
    flush: () => descarregar(),
    get escritas() {
      return escritas;
    },
  };
}
