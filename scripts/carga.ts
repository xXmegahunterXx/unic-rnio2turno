/**
 * Teste de carga do servidor do Sintonia — Node puro, sem dependências (http + cluster).
 *
 *   npx tsx scripts/carga.ts [opções]
 *
 *   --base=http://127.0.0.1:8787   servidor a medir
 *   --conexoes=200,500,1000        conexões keep-alive simultâneas (uma rodada por valor)
 *   --duracao=10                   segundos por rodada (mais 2 s de aquecimento, descartados)
 *   --rotas=/,/api/status,…        rotas medidas UMA A UMA (padrão: as 6 da noite da eleição, abaixo)
 *   --misto                        em vez de uma rota por vez, mistura realista de visitantes (pesos abaixo)
 *   --trabalhadores=3              processos geradores de carga (cada um com conexoes/trabalhadores conexões)
 *   --pid=1234                     PID do servidor: memória (RSS) lida de /proc a cada 250 ms (Linux).
 *                                  Sem ele, usa o memoriaMb do /healthz a cada 1 s
 *   --json                         imprime também o resultado em JSON (para guardar/comparar)
 *
 * Cada conexão faz uma requisição por vez (como um navegador com keep-alive) e mede do envio ao último byte. As
 * conexões abrem ao longo do aquecimento (descartado), como visitantes chegando.
 * Cabeçalho `Accept-Encoding: br, gzip` (como os navegadores). Erro = status ≥ 400, falha de socket ou tempo-limite
 * (10 s). Latência em histograma com resolução de 0,1 ms até 100 ms e 1 ms até 30 s.
 *
 * Exemplo (servidor de produção local):
 *   NODE_ENV=production PORT=8787 node dist-server/main.js &
 *   npx tsx scripts/carga.ts --base=http://127.0.0.1:8787 --pid=$! --conexoes=200,500,1000 --duracao=10
 */
import cluster from 'node:cluster';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { availableParallelism } from 'node:os';

// ---- opções -------------------------------------------------------------------------------------
const arg = (nome: string, padrao?: string): string | undefined => {
  const a = process.argv.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  if (!a) return padrao;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : 'true';
};

export const ROTAS_PADRAO = ['/', '/api/status', '/api/apuracao/pres/br', '/api/apuracao/pres/uf/sp', '/api/og/apuracao.png', '/teste'];
/** Mistura da noite da eleição (por requisição): o placar e o status são consultados a cada poucos segundos. */
export const MISTURA: [string, number][] = [
  ['/api/status', 40],
  ['/api/apuracao/pres/br', 25],
  ['/api/apuracao/pres/uf/sp', 12],
  ['/', 8],
  ['/apuracao', 5],
  ['/teste', 5],
  ['/api/og/apuracao.png', 3],
  ['/api/apuracao/pres/br/municipios', 2],
];

const BASE = new URL(arg('base', 'http://127.0.0.1:8787')!);
const CONEXOES = arg('conexoes', '200,500,1000')!.split(',').map(Number).filter((n) => n > 0);
const DURACAO = Math.max(2, Number(arg('duracao', '10')));
const MISTO = arg('misto') === 'true';
const ROTAS = MISTO ? ['misto'] : (arg('rotas')?.split(',') ?? ROTAS_PADRAO);
const TRAB = Math.max(1, Math.min(Number(arg('trabalhadores', String(Math.max(1, Math.min(4, availableParallelism() - 1))))), 16));
const PID = arg('pid');
const JSON_SAIDA = arg('json') === 'true';
const TIMEOUT_MS = 10_000;
const AQUECIMENTO_MS = 2_000;

// ---- histograma de latência -----------------------------------------------------------------------
const FINO = 1000; // 0,1 ms até 100 ms
const GROSSO = 29_900; // 1 ms de 100 ms a 30 s
const N_BALDES = FINO + GROSSO + 1;
const balde = (ms: number) => (ms < 100 ? Math.floor(ms * 10) : Math.min(FINO + Math.floor(ms - 100), N_BALDES - 1));
const valorDoBalde = (b: number) => (b < FINO ? (b + 0.5) / 10 : 100 + (b - FINO) + 0.5);

export function percentil(h: number[] | Uint32Array, total: number, p: number): number {
  if (!total) return 0;
  const alvo = Math.ceil(total * p);
  let acc = 0;
  for (let i = 0; i < h.length; i++) {
    acc += h[i];
    if (acc >= alvo) return valorDoBalde(i);
  }
  return valorDoBalde(h.length - 1);
}

interface ResultadoTrab {
  ok: number;
  erros: number;
  status: Record<string, number>;
  bytes: number;
  hist: number[];
  max: number;
}

// ---- trabalhador: abre as conexões e dispara até o fim ------------------------------------------------
function escolhedor(rota: string): () => string {
  if (rota !== 'misto') return () => rota;
  const total = MISTURA.reduce((s, [, p]) => s + p, 0);
  return () => {
    let r = Math.random() * total;
    for (const [p, w] of MISTURA) if ((r -= w) < 0) return p;
    return MISTURA[0][0];
  };
}

async function trabalhador(rota: string, conexoes: number, aquecerAte: number, ate: number): Promise<ResultadoTrab> {
  const agent = new http.Agent({ keepAlive: true, maxSockets: conexoes, maxFreeSockets: conexoes, timeout: TIMEOUT_MS });
  const hist = new Uint32Array(N_BALDES);
  const r: ResultadoTrab = { ok: 0, erros: 0, status: {}, bytes: 0, hist: [], max: 0 };
  const proxima = escolhedor(rota);
  const um = () =>
    new Promise<void>((res) => {
      const t0 = performance.now();
      const path = proxima();
      const req = http.request(
        { host: BASE.hostname, port: BASE.port || 80, path, agent, headers: { 'accept-encoding': 'br, gzip', 'user-agent': 'sintonia-carga/1' } },
        (resp) => {
          let n = 0;
          resp.on('data', (c: Buffer) => (n += c.length));
          resp.on('end', () => {
            const ms = performance.now() - t0;
            if (performance.now() >= aquecerAte) {
              const st = String(resp.statusCode ?? 0);
              r.status[st] = (r.status[st] ?? 0) + 1;
              if ((resp.statusCode ?? 0) >= 400) r.erros++;
              else r.ok++;
              r.bytes += n;
              hist[balde(ms)]++;
              if (ms > r.max) r.max = ms;
            }
            res();
          });
          resp.on('error', () => {
            r.erros++;
            res();
          });
        },
      );
      req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('tempo-limite')));
      req.on('error', (e) => {
        if (performance.now() >= aquecerAte) {
          r.erros++;
          const k = `erro:${(e as NodeJS.ErrnoException).code ?? e.message}`;
          r.status[k] = (r.status[k] ?? 0) + 1;
        }
        res();
      });
      req.end();
    });
  // as conexões abrem ao longo do aquecimento (como visitantes chegando), não todas no mesmo milissegundo: uma rajada
  // de 1.000 SYN de uma vez estoura a fila do kernel e mede retransmissão de TCP, não o servidor
  const rampa = Math.max(0, aquecerAte - performance.now() - 200);
  const laco = async (_: unknown, i: number) => {
    await new Promise((r) => setTimeout(r, (i / Math.max(1, conexoes)) * rampa));
    while (performance.now() < ate) await um();
  };
  await Promise.all(Array.from({ length: conexoes }, laco));
  agent.destroy();
  r.hist = Array.from(hist);
  return r;
}

// ---- memória do servidor -------------------------------------------------------------------------------
function rssPid(pid: string): number | null {
  try {
    const m = /VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'));
    return m ? Math.round(Number(m[1]) / 1024) : null;
  } catch {
    return null;
  }
}

async function rssHealthz(): Promise<number | null> {
  return new Promise((res) => {
    http
      .get(new URL('/healthz', BASE), (r) => {
        let s = '';
        r.on('data', (c) => (s += c));
        r.on('end', () => {
          try {
            res((JSON.parse(s) as { memoriaMb?: number }).memoriaMb ?? null);
          } catch {
            res(null);
          }
        });
      })
      .on('error', () => res(null));
  });
}

// ---- coordenador ---------------------------------------------------------------------------------
interface Linha {
  rota: string;
  conexoes: number;
  reqPorSeg: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
  erros: number;
  status: Record<string, number>;
  mbPorSeg: number;
  bytesMedio: number;
  memMaxMb: number | null;
}

async function rodada(rota: string, conexoes: number): Promise<Linha> {
  const trabs = Object.values(cluster.workers ?? {}).filter((w): w is NonNullable<typeof w> => !!w);
  const porTrab = trabs.map((_, i) => Math.floor(conexoes / trabs.length) + (i < conexoes % trabs.length ? 1 : 0));
  let memMax: number | null = null;
  const amostrar = async () => {
    const v = PID ? rssPid(PID) : await rssHealthz();
    if (v !== null) memMax = Math.max(memMax ?? 0, v);
  };
  const timer = setInterval(() => void amostrar(), PID ? 250 : 1000);
  const resultados = await Promise.all(
    trabs.map(
      (w, i) =>
        new Promise<ResultadoTrab>((res) => {
          w.once('message', (m: ResultadoTrab) => res(m));
          w.send({ rota, conexoes: porTrab[i], duracao: DURACAO });
        }),
    ),
  );
  clearInterval(timer);
  await amostrar();
  const hist = new Array<number>(N_BALDES).fill(0);
  const status: Record<string, number> = {};
  let ok = 0;
  let erros = 0;
  let bytes = 0;
  let max = 0;
  for (const r of resultados) {
    ok += r.ok;
    erros += r.erros;
    bytes += r.bytes;
    max = Math.max(max, r.max);
    for (let i = 0; i < N_BALDES; i++) hist[i] += r.hist[i];
    for (const [k, v] of Object.entries(r.status)) status[k] = (status[k] ?? 0) + v;
  }
  const total = ok + erros;
  return {
    rota,
    conexoes,
    reqPorSeg: Math.round(total / DURACAO),
    p50: percentil(hist, total, 0.5),
    p90: percentil(hist, total, 0.9),
    p99: percentil(hist, total, 0.99),
    max,
    erros,
    status,
    mbPorSeg: Math.round((bytes / DURACAO / 1048576) * 10) / 10,
    bytesMedio: total ? Math.round(bytes / total) : 0,
    memMaxMb: memMax,
  };
}

const f = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: n < 10 ? 1 : 0 });

async function coordenador() {
  // cada gerador avisa quando está pronto (mensagem antes do listener se perderia)
  await Promise.all(
    Array.from({ length: TRAB }, () => new Promise<void>((res) => cluster.fork().once('message', () => res()))),
  );
  console.log(
    `Carga em ${BASE.origin} · ${TRAB} gerador(es) · ${DURACAO} s por rodada (+${AQUECIMENTO_MS / 1000} s de aquecimento) · conexões ${CONEXOES.join('/')}` +
      ` · memória ${PID ? `RSS do PID ${PID}` : '/healthz'}`,
  );
  console.log('rota | conexões | req/s | p50 ms | p90 ms | p99 ms | máx ms | erros | resposta média | MB/s | memória máx');
  const linhas: Linha[] = [];
  for (const rota of ROTAS) {
    for (const c of CONEXOES) {
      const l = await rodada(rota, c);
      linhas.push(l);
      const errosDet = l.erros ? ` (${Object.entries(l.status).filter(([k]) => !/^[23]/.test(k)).map(([k, v]) => `${k}: ${v}`).join(', ')})` : '';
      console.log(
        `${rota} | ${c} | ${f(l.reqPorSeg)} | ${f(l.p50)} | ${f(l.p90)} | ${f(l.p99)} | ${f(l.max)} | ${l.erros}${errosDet} | ` +
          `${f(l.bytesMedio / 1024)} KB | ${f(l.mbPorSeg)} | ${l.memMaxMb ?? '—'} MB`,
      );
      await new Promise((r) => setTimeout(r, 1500)); // respiro entre rodadas (conexões fechando)
    }
  }
  if (JSON_SAIDA) console.log(JSON.stringify(linhas));
  for (const w of Object.values(cluster.workers ?? {})) w?.kill();
}

if (cluster.isPrimary) {
  void coordenador();
} else {
  process.on('message', async (m: { rota: string; conexoes: number; duracao: number }) => {
    const agora = performance.now();
    const r = await trabalhador(m.rota, m.conexoes, agora + AQUECIMENTO_MS, agora + AQUECIMENTO_MS + m.duracao * 1000);
    process.send?.(r);
  });
  process.send?.('pronto');
}
