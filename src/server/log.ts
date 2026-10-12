/**
 * Log operacional do servidor: stdout (uma linha por evento) + anel em memória que aparece no monitor do admin
 * (AdminMetrics.log). Nunca registre IP, cookie, senha, query string ou o código de um Duelo (LGPD).
 *
 * Formatos (LOG_FORMAT):
 *  - 'json' (padrão em produção): um objeto por linha, fácil de filtrar com `jq` ou de mandar a um agregador:
 *      {"t":"2026-10-25T20:00:00.000Z","nivel":"info","msg":"Admin: comando \"fonte\" aplicado (versão 12)"}
 *      {"t":"…","nivel":"info","msg":"req","id":"k3f9a-1c","metodo":"GET","rota":"/api/status","status":200,"ms":0.4,"amostra":0.01}
 *      {"t":"…","nivel":"erro","msg":"Erro em GET /api/og/…","erro":"…","stack":"…"}
 *  - 'texto' (padrão em dev): `2026-10-25T20:00:00.000Z info  mensagem`.
 *
 * Requisições (`req`) vão só para a saída (não para o anel do admin), com amostragem decidida por quem chama
 * (ver `registroDeAcesso` em app.ts). `amostra` = fração registrada (para estimar o total).
 */
export type Nivel = 'info' | 'aviso' | 'erro';

export type Campos = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  info(msg: string, campos?: Campos): void;
  aviso(msg: string, campos?: Campos): void;
  erro(msg: string, err?: unknown, campos?: Campos): void;
  /** Linha de acesso (uma requisição). Não entra no anel do admin. */
  req(campos: Campos): void;
  /** Últimas `n` entradas (mais antigas primeiro). */
  recentes(n?: number): { t: number; msg: string }[];
}

export interface LoggerOptions {
  /** Escreve no stdout/stderr (desligado nos testes). Padrão true. */
  saida?: boolean;
  formato?: 'json' | 'texto';
  max?: number;
  now?: () => number;
  /** Destino alternativo (testes): recebe cada linha já formatada. */
  escrever?: (linha: string, nivel: Nivel) => void;
}

export function msgErro(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Valor seguro para o JSON do log: strings limitadas, sem quebras de linha nos campos. */
const limpo = (v: Campos[string]) => (typeof v === 'string' ? v.slice(0, 2000) : v);

export function createLogger(opts: LoggerOptions = {}): Logger {
  const saida = opts.saida ?? true;
  const formato = opts.formato ?? 'texto';
  const max = opts.max ?? 200;
  const now = opts.now ?? Date.now;
  const anel: { t: number; msg: string }[] = [];

  const escrever =
    opts.escrever ??
    ((linha: string, nivel: Nivel) => {
      if (nivel === 'erro') process.stderr.write(`${linha}\n`);
      else process.stdout.write(`${linha}\n`);
    });

  const linha = (t: number, nivel: Nivel, msg: string, campos?: Campos): string => {
    if (formato === 'json') {
      const o: Record<string, unknown> = { t: new Date(t).toISOString(), nivel, msg };
      if (campos) for (const [k, v] of Object.entries(campos)) if (v !== undefined && !(k in o)) o[k] = limpo(v);
      return JSON.stringify(o);
    }
    let extra = '';
    if (campos) {
      const partes = Object.entries(campos)
        .filter(([k, v]) => v !== undefined && k !== 'stack')
        .map(([k, v]) => `${k}=${typeof v === 'string' && /\s/.test(v) ? JSON.stringify(v) : String(v)}`);
      if (partes.length) extra = ` ${partes.join(' ')}`;
    }
    return `${new Date(t).toISOString()} ${nivel.padEnd(5)} ${msg}${extra}`;
  };

  const add = (nivel: Nivel, msg: string, campos?: Campos, msgAnel = msg) => {
    const t = now();
    anel.push({ t, msg: nivel === 'info' ? msgAnel : `[${nivel}] ${msgAnel}` });
    if (anel.length > max) anel.splice(0, anel.length - max);
    if (saida || opts.escrever) escrever(linha(t, nivel, msg, campos), nivel);
  };

  return {
    info: (m, campos) => add('info', m, campos),
    aviso: (m, campos) => add('aviso', m, campos),
    erro: (m, err, campos) => {
      const comStatus = !!(err as { status?: number } | undefined)?.status;
      const stack = err instanceof Error && err.stack && !comStatus ? err.stack : undefined;
      if (formato === 'json') {
        add('erro', m, { ...campos, erro: err === undefined ? undefined : msgErro(err), stack }, err === undefined ? m : `${m}: ${msgErro(err)}`);
      } else {
        add('erro', err === undefined ? m : `${m}: ${msgErro(err)}`, campos);
        if ((saida || opts.escrever) && stack) escrever(stack, 'erro');
      }
    },
    req: (campos) => {
      if (!saida && !opts.escrever) return;
      const nivel: Nivel = typeof campos.status === 'number' && campos.status >= 500 ? 'erro' : 'info';
      if (formato === 'json') escrever(linha(now(), nivel, 'req', campos), nivel);
      else {
        const { metodo, rota, status, ms, ...resto } = campos;
        escrever(linha(now(), nivel, `${metodo} ${rota} → ${status} (${typeof ms === 'number' ? ms.toFixed(1) : ms} ms)`, resto), nivel);
      }
    },
    recentes: (n = 50) => anel.slice(-n),
  };
}

/** Caminho seguro para log: esconde o código do Duelo (respostas do Teste Cego) e limita o tamanho. */
export function caminhoParaLog(path: string): string {
  return path.replace(/^\/duelo\/[^/?#]+/, '/duelo/…').slice(0, 160);
}
