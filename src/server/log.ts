/**
 * Log operacional do servidor: stdout (uma linha por evento, com data ISO) + anel em memória que aparece no
 * monitor do admin (AdminMetrics.log). Nunca registre IP, cookie, senha ou o código de um Duelo (LGPD).
 */
export type Nivel = 'info' | 'aviso' | 'erro';

export interface Logger {
  info(msg: string): void;
  aviso(msg: string): void;
  erro(msg: string, err?: unknown): void;
  /** Últimas `n` entradas (mais antigas primeiro). */
  recentes(n?: number): { t: number; msg: string }[];
}

export interface LoggerOptions {
  /** Escreve no stdout/stderr (desligado nos testes). Padrão true. */
  saida?: boolean;
  max?: number;
  now?: () => number;
}

export function msgErro(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const saida = opts.saida ?? true;
  const max = opts.max ?? 200;
  const now = opts.now ?? Date.now;
  const anel: { t: number; msg: string }[] = [];

  const add = (nivel: Nivel, msg: string) => {
    const t = now();
    anel.push({ t, msg: nivel === 'info' ? msg : `[${nivel}] ${msg}` });
    if (anel.length > max) anel.splice(0, anel.length - max);
    if (saida) {
      const linha = `${new Date(t).toISOString()} ${nivel.padEnd(5)} ${msg}`;
      if (nivel === 'erro') process.stderr.write(`${linha}\n`);
      else process.stdout.write(`${linha}\n`);
    }
  };

  return {
    info: (m) => add('info', m),
    aviso: (m) => add('aviso', m),
    erro: (m, err) => {
      add('erro', err === undefined ? m : `${m}: ${msgErro(err)}`);
      if (saida && err instanceof Error && err.stack && !(err as { status?: number }).status) {
        process.stderr.write(`${err.stack}\n`);
      }
    },
    recentes: (n = 50) => anel.slice(-n),
  };
}

/** Caminho seguro para log: esconde o código do Duelo (respostas do Teste Cego) e limita o tamanho. */
export function caminhoParaLog(path: string): string {
  return path.replace(/^\/duelo\/[^/?#]+/, '/duelo/…').slice(0, 160);
}
