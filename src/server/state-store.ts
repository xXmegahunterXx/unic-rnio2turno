/**
 * Persistência em disco de pequenos documentos JSON (AdminState, histórico do TSE), com:
 *  - escrita atômica: grava em arquivo temporário, fsync e `rename` sobre o destino (nunca deixa JSON pela metade);
 *  - debounce: rajadas de mudanças viram uma escrita (padrão 250 ms);
 *  - escritas serializadas (nunca duas ao mesmo tempo) e `flush()` para o encerramento gracioso;
 *  - (opcional, `lembrar`) memória das últimas gravações DESTE processo (só o hash), para o vigia do arquivo
 *    (vigia-admin.ts) reconhecer a própria gravação atrasada e não adotá-la como "estado de outra instância".
 */
import { createHash } from 'node:crypto';
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
  /** Texto atual do arquivo (null se não existir). Síncrono. */
  lerTexto(): string | null;
  /**
   * true se `texto` é idêntico a uma das últimas `lembrar` gravações feitas (ou já serializadas para gravar) por ESTE
   * processo. Sempre false sem a opção `lembrar`.
   */
  gravadoPorMim(texto: string): boolean;
}

export interface JsonStoreOptions {
  debounceMs?: number;
  onErro?: (err: unknown) => void;
  /** Quantas gravações recentes lembrar (por hash) para `gravadoPorMim` (padrão 0 = nenhuma). */
  lembrar?: number;
}

const hashTexto = (t: string) => createHash('sha256').update(t).digest('base64');

export function createJsonStore(dir: string, arquivo: string, opts: JsonStoreOptions = {}): JsonStore {
  const caminho = join(dir, arquivo);
  const debounceMs = opts.debounceMs ?? 250;
  let pendente: { v: unknown | (() => unknown) } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let gravando: Promise<void> = Promise.resolve();
  let escritas = 0;
  let seq = 0;
  const lembrar = Math.max(0, Math.floor(opts.lembrar ?? 0));
  const recentes: string[] = [];

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
    // lembrado ANTES de gravar: o vigia pode ver o arquivo novo logo depois do rename, antes do `then` seguinte
    if (lembrar > 0) {
      recentes.push(hashTexto(texto));
      if (recentes.length > lembrar) recentes.splice(0, recentes.length - lembrar);
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
    lerTexto() {
      try {
        return readFileSync(caminho, 'utf8');
      } catch {
        return null;
      }
    },
    gravadoPorMim(texto) {
      if (lembrar === 0 || recentes.length === 0) return false;
      return recentes.includes(hashTexto(texto));
    },
  };
}
