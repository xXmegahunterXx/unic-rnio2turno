/**
 * Ensaio de carga PELA BORDA (I17, leva 3): visitantes virtuais que se comportam como o app na noite da eleição,
 * passando pela Cloudflare de verdade, e um relatório que diz se a borda segura (aprovação no fim). Node puro, sem
 * dependências (http/https + cluster), a partir das ideias de scripts/carga.ts (que mede a ORIGEM sem CDN).
 *
 *   npx tsx scripts/ensaio-borda.ts --base=https://sintonia2026.com.br --usuarios=100 --duracao=300
 *
 *   --base=URL           site a ensaiar (padrão http://127.0.0.1:8787)
 *   --usuarios=100       visitantes virtuais (rodadas do plano: 100, depois 1000 e, se passar, 3000; teto 5000)
 *   --duracao=300        segundos medidos, depois da rampa
 *   --rampa=60           segundos para todos chegarem (como gente entrando); a rampa não entra no relatório
 *   --fator=1            multiplica TODOS os intervalos (2 = metade do ritmo; o "freio" do painel faz o mesmo no app)
 *   --trabalhadores=N    processos geradores (padrão: núcleos − 1, de 1 a 8)
 *   --sem-presenca       não manda o sinal de audiência (POST /api/audiencia); com ele, ZERE a medição depois
 *   --conectar=IP        conecta neste IP mandando Host/SNI do --base (ex.: testar uma origem com o domínio)
 *   --json               imprime também o resultado em JSON
 *   --forcar             roda mesmo no congelamento (24/10 0h a 26/10 6h) — o plano proíbe ensaio em 24 e 25/10
 *   SINTONIA_ADMIN_SENHA (ambiente, opcional): lê do painel, a cada 15 s, quantas requisições de API chegaram à ORIGEM
 *                        (o número que vale para a aprovação); sem ela, a origem é estimada pelo cf-cache-status
 *
 * Cada visitante: status a cada 2 s; placar nacional quando a marca do status muda (`?d=`, como o app; sem marca, no
 * ritmo do app para a fase); UF e mapa por município a cada 4 s; 10% deles abrem um município ao acaso a cada 10 s;
 * presença a cada 60–240 s (o intervalo que o servidor devolver); recarrega o HTML a cada 10 min.
 *
 * Relatório: req/s por `cf-cache-status`, p50/p95/p99 por tipo de pedido, 4xx/5xx/erros de rede e req/s que chegaram à
 * origem. Aprovação (plano, item 4): origem < 300 req/s; ≥ 95% HIT/UPDATING na API pública; p95 < 300 ms; zero 5xx.
 * Depois do ensaio: Painel → Audiência → Zerar medição (o tráfego de teste infla o pico).
 */
import cluster from 'node:cluster';
import http from 'node:http';
import https from 'node:https';
import { availableParallelism } from 'node:os';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

// ---- opções -----------------------------------------------------------------------------------------------------------
const arg = (nome: string, padrao?: string): string | undefined => {
  const a = process.argv.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  if (!a) return padrao;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : 'true';
};
const BASE = new URL(arg('base', 'http://127.0.0.1:8787')!);
const USUARIOS = Math.max(1, Math.min(5000, Math.round(Number(arg('usuarios', '100')))));
const DURACAO = Math.max(5, Number(arg('duracao', '300')));
const RAMPA = Math.max(0, Number(arg('rampa', '60')));
const FATOR = Math.max(0.25, Math.min(10, Number(arg('fator', '1')) || 1));
const TRAB = Math.max(1, Math.min(8, Number(arg('trabalhadores', String(Math.max(1, availableParallelism() - 1)))), USUARIOS));
const PRESENCA = arg('sem-presenca') !== 'true';
const JSON_SAIDA = arg('json') === 'true';
const CONECTAR = arg('conectar');
const HTTPS = BASE.protocol === 'https:';
const MOD: typeof http = HTTPS ? (https as unknown as typeof http) : http;
const TIMEOUT_MS = 15_000;
/** HTTPS: SNI do domínio (vale com --conectar=IP) */
const TLS = HTTPS ? { servername: BASE.hostname } : {};

/** Grupos de pedido (a aprovação de HIT olha só a API pública: os 5 primeiros). */
export const GRUPOS = ['status', 'placar', 'uf', 'mapa', 'municipio', 'presenca', 'html'] as const;
export type Grupo = (typeof GRUPOS)[number];
export const API_PUBLICA: readonly Grupo[] = ['status', 'placar', 'uf', 'mapa', 'municipio'];
/** cf-cache-status que NÃO foram à origem para responder (UPDATING: a cópia saiu e a renovação vai uma vez só). */
export const DA_BORDA = new Set(['HIT', 'UPDATING', 'STALE']);
export const LIMITES = { origemReqS: 300, hitMin: 0.95, p95Ms: 300 } as const;

/** Peso aproximado de cada UF no eleitorado (onde as pessoas abrem a própria UF). */
const PESO_UF: [string, number][] = [
  ['sp', 222], ['mg', 104], ['rj', 82], ['ba', 70], ['rs', 55], ['pr', 55], ['pe', 46], ['ce', 44], ['pa', 40], ['sc', 36],
  ['ma', 33], ['go', 31], ['pb', 20], ['es', 19], ['am', 16], ['rn', 16], ['pi', 16], ['mt', 16], ['al', 15], ['df', 14],
  ['ms', 13], ['se', 11], ['ro', 8], ['to', 7], ['ac', 4], ['ap', 4], ['rr', 3],
];
const sortearUf = () => {
  let r = Math.random() * PESO_UF.reduce((s, [, p]) => s + p, 0);
  for (const [uf, p] of PESO_UF) if ((r -= p) < 0) return uf;
  return 'sp';
};

// ---- histograma (como em carga.ts: 0,1 ms até 100 ms, 1 ms até 30 s) ------------------------------------------------
const FINO = 1000;
const GROSSO = 29_900;
const N_BALDES = FINO + GROSSO + 1;
const balde = (ms: number) => (ms < 100 ? Math.floor(ms * 10) : Math.min(FINO + Math.floor(ms - 100), N_BALDES - 1));
const valorDoBalde = (b: number) => (b < FINO ? (b + 0.5) / 10 : 100 + (b - FINO) + 0.5);
export function percentil(h: ArrayLike<number>, p: number): number {
  let total = 0;
  for (let i = 0; i < h.length; i++) total += h[i];
  if (!total) return 0;
  const alvo = Math.ceil(total * p);
  let acc = 0;
  for (let i = 0; i < h.length; i++) {
    acc += h[i];
    if (acc >= alvo) return valorDoBalde(i);
  }
  return valorDoBalde(h.length - 1);
}

// ---- contagem ---------------------------------------------------------------------------------------------------------
export interface Contagem {
  /** por grupo → por cf-cache-status ('—' = sem o cabeçalho) */
  porGrupo: Record<string, Record<string, number>>;
  /** códigos HTTP (e 'erro:<código>' para falha de rede/tempo) */
  codigos: Record<string, number>;
  /** histograma de latência por grupo (só pedidos medidos, fora da rampa) */
  hist: Record<string, number[]>;
}
export const contagemVazia = (): Contagem => ({ porGrupo: {}, codigos: {}, hist: {} });
export function somar(a: Contagem, b: Contagem): Contagem {
  for (const [g, m] of Object.entries(b.porGrupo)) for (const [s, n] of Object.entries(m)) ((a.porGrupo[g] ??= {})[s] = (a.porGrupo[g][s] ?? 0) + n);
  for (const [k, n] of Object.entries(b.codigos)) a.codigos[k] = (a.codigos[k] ?? 0) + n;
  for (const [g, h] of Object.entries(b.hist)) {
    const alvo = (a.hist[g] ??= new Array<number>(N_BALDES).fill(0));
    for (let i = 0; i < h.length; i++) alvo[i] += h[i];
  }
  return a;
}
/** Pedidos que precisaram da origem (MISS, EXPIRED, REVALIDATED, BYPASS, DYNAMIC ou sem borda). */
export const foiAOrigem = (cst: string) => !DA_BORDA.has(cst);

export interface Resumo {
  total: number;
  porStatus: Record<string, number>;
  hitApi: number;
  p: Record<string, { n: number; p50: number; p95: number; p99: number; hit: number }>;
  p95Api: number;
  erros5xx: number;
  erros4xx: number;
  errosRede: number;
}
export function resumir(c: Contagem): Resumo {
  const porStatus: Record<string, number> = {};
  let total = 0;
  let apiN = 0;
  let apiBorda = 0;
  const p: Resumo['p'] = {};
  const histApi = new Array<number>(N_BALDES).fill(0);
  for (const g of GRUPOS) {
    const m = c.porGrupo[g] ?? {};
    let n = 0;
    let borda = 0;
    for (const [s, k] of Object.entries(m)) {
      porStatus[s] = (porStatus[s] ?? 0) + k;
      n += k;
      if (s === 'HIT' || s === 'UPDATING') borda += k;
    }
    total += n;
    const h = c.hist[g] ?? [];
    if (API_PUBLICA.includes(g)) {
      apiN += n;
      apiBorda += borda;
      for (let i = 0; i < h.length; i++) histApi[i] += h[i];
    }
    if (n) p[g] = { n, p50: percentil(h, 0.5), p95: percentil(h, 0.95), p99: percentil(h, 0.99), hit: borda / n };
  }
  let e5 = 0;
  let e4 = 0;
  let rede = 0;
  for (const [k, n] of Object.entries(c.codigos)) {
    if (k.startsWith('erro:')) rede += n;
    else if (Number(k) >= 500) e5 += n;
    else if (Number(k) >= 400) e4 += n;
  }
  return { total, porStatus, hitApi: apiN ? apiBorda / apiN : 0, p, p95Api: percentil(histApi, 0.95), erros5xx: e5, erros4xx: e4, errosRede: rede };
}

/** Aprovação do plano (item 4). `origemMax`: req/s na origem (painel ou estimativa). */
export function avaliar(r: Resumo, origemMax: number | null) {
  return [
    { criterio: `origem abaixo de ${LIMITES.origemReqS} req/s`, ok: origemMax !== null && origemMax < LIMITES.origemReqS, valor: origemMax === null ? '—' : `${origemMax.toFixed(1)} req/s (pico de 10 s)` },
    { criterio: `≥ ${LIMITES.hitMin * 100}% HIT/UPDATING na API pública`, ok: r.hitApi >= LIMITES.hitMin, valor: `${(r.hitApi * 100).toFixed(1)}%` },
    { criterio: `p95 abaixo de ${LIMITES.p95Ms} ms (API pública)`, ok: r.p95Api < LIMITES.p95Ms, valor: `${r.p95Api.toFixed(0)} ms` },
    { criterio: 'zero 5xx', ok: r.erros5xx === 0, valor: String(r.erros5xx) },
  ];
}

// ---- trabalhador: os visitantes ---------------------------------------------------------------------------------------
interface Ordem {
  usuarios: number;
  /** instante (Date.now) em que a medição começa (fim da rampa) e acaba */
  medirDe: number;
  ate: number;
  rampaMs: number;
  municipios: [string, string][];
}
interface Parcial {
  t: number;
  pedidos: number;
  /** pedidos que foram à origem para responder (MISS, EXPIRED, BYPASS, DYNAMIC…) */
  origem: number;
  /** UPDATING: a cópia velha saiu e a borda renovou em segundo plano — no máximo 1 ida à origem por UPDATING */
  updating: number;
  porStatus: Record<string, number>;
  e5: number;
}

async function trabalhador(o: Ordem) {
  const agent = new MOD.Agent({ keepAlive: true, maxSockets: Math.min(512, Math.max(16, o.usuarios)), timeout: TIMEOUT_MS });
  const total = contagemVazia();
  let janela: Parcial = { t: Date.now(), pedidos: 0, origem: 0, updating: 0, porStatus: {}, e5: 0 };
  const parcial = setInterval(() => {
    process.send?.({ tipo: 'parcial', ...janela, t: Date.now() });
    janela = { t: Date.now(), pedidos: 0, origem: 0, updating: 0, porStatus: {}, e5: 0 };
  }, 5000);
  const ativo = () => Date.now() < o.ate;
  /** espera no ritmo (×FATOR), mas nunca além do fim do ensaio: todos os laços terminam juntos */
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, Math.min(ms * FATOR, o.ate - Date.now() + 5))));

  function pedir(grupo: Grupo, path: string, metodo = 'GET', corpo?: string): Promise<{ status: number; texto: string }> {
    return new Promise((res) => {
      const t0 = performance.now();
      const ehHtml = grupo === 'html';
      const cab: Record<string, string> = {
        host: BASE.host,
        'user-agent': 'Mozilla/5.0 (Linux; Android 14) sintonia-ensaio-borda/1',
        'accept-encoding': 'gzip, br',
        accept: ehHtml ? 'text/html' : 'application/json',
      };
      if (corpo !== undefined) {
        cab['content-type'] = 'text/plain;charset=UTF-8';
        cab.origin = BASE.origin;
        cab['content-length'] = String(Buffer.byteLength(corpo));
      }
      const req = MOD.request(
        { host: CONECTAR ?? BASE.hostname, port: BASE.port || (HTTPS ? 443 : 80), path, method: metodo, agent, headers: cab, ...TLS },
        (resp) => {
          const partes: Buffer[] = [];
          const guardar = grupo === 'status' || grupo === 'presenca';
          resp.on('data', (b: Buffer) => guardar && partes.push(b));
          resp.on('end', () => {
            const ms = performance.now() - t0;
            const st = String(resp.statusCode ?? 0);
            const cst = String(resp.headers['cf-cache-status'] ?? '—').toUpperCase();
            if (Date.now() >= o.medirDe && Date.now() <= o.ate + TIMEOUT_MS) {
              const m = (total.porGrupo[grupo] ??= {});
              m[cst] = (m[cst] ?? 0) + 1;
              total.codigos[st] = (total.codigos[st] ?? 0) + 1;
              (total.hist[grupo] ??= new Array<number>(N_BALDES).fill(0))[balde(ms)]++;
            }
            janela.pedidos++;
            janela.porStatus[cst] = (janela.porStatus[cst] ?? 0) + 1;
            if (foiAOrigem(cst)) janela.origem++;
            else if (cst === 'UPDATING') janela.updating++;
            if (Number(st) >= 500) janela.e5++;
            let texto = '';
            if (guardar) {
              try {
                // o status vem comprimido (gzip/br): só o tamanho importa aqui, a marca é lida descomprimindo
                texto = descomprimir(Buffer.concat(partes), String(resp.headers['content-encoding'] ?? ''));
              } catch {
                texto = '';
              }
            }
            res({ status: resp.statusCode ?? 0, texto });
          });
          resp.on('error', () => res({ status: 0, texto: '' }));
        },
      );
      req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('tempo')));
      req.on('error', (e) => {
        const k = `erro:${(e as NodeJS.ErrnoException).code ?? e.message}`;
        if (Date.now() >= o.medirDe) total.codigos[k] = (total.codigos[k] ?? 0) + 1;
        res({ status: 0, texto: '' });
      });
      req.end(corpo);
    });
  }

  async function visitante(i: number) {
    await new Promise((r) => setTimeout(r, (i / Math.max(1, o.usuarios)) * o.rampaMs + Math.random() * 500));
    if (!ativo()) return;
    const uf = sortearUf();
    const curioso = Math.random() < 0.1;
    let fase = 'pre';
    let marca: string | null = null;
    let ultimaMarca: string | null = null;
    // entrada: a página e os dados que ela pede de cara
    await pedir('html', '/');
    const lacos: Promise<void>[] = [];
    const laco = (fn: () => Promise<number>) =>
      lacos.push(
        (async () => {
          await esperar(Math.random() * 2000); // não bater junto com os outros laços
          while (ativo()) await esperar(await fn());
        })(),
      );
    laco(async () => {
      const r = await pedir('status', '/api/status');
      try {
        const s = JSON.parse(r.texto) as { fase?: string; frescor?: { pres?: { marca?: string } } };
        fase = s.fase ?? fase;
        marca = s.frescor?.pres?.marca ?? null;
      } catch {
        /* status ilegível (erro): segue no mesmo ritmo */
      }
      if (marca && marca !== ultimaMarca) {
        ultimaMarca = marca;
        void pedir('placar', `/api/apuracao/pres/br?d=${encodeURIComponent(marca)}`);
      }
      return 2000;
    });
    laco(async () => {
      // com marca, o placar já vem na troca de marca (e a cada 6 s, como o app); sem marca, no ritmo da fase
      if (marca) await pedir('placar', `/api/apuracao/pres/br?d=${encodeURIComponent(marca)}`);
      else await pedir('placar', '/api/apuracao/pres/br');
      return marca ? 6000 : fase === 'apurando' ? 2500 : 15000;
    });
    laco(async () => {
      await pedir('uf', `/api/apuracao/pres/uf/${uf}`);
      return 4000;
    });
    laco(async () => {
      await pedir('mapa', '/api/apuracao/pres/br/municipios');
      return 4000;
    });
    if (curioso && o.municipios.length) {
      laco(async () => {
        const [u, cod] = o.municipios[Math.floor(Math.random() * o.municipios.length)];
        await pedir('municipio', `/api/apuracao/pres/uf/${u.toLowerCase()}/mun/${cod}`);
        return 10_000;
      });
    }
    if (PRESENCA) {
      laco(async () => {
        const r = await pedir('presenca', '/api/audiencia', 'POST', JSON.stringify({ p: 1, g: 'apuracao' }));
        let s = 60;
        try {
          const j = JSON.parse(r.texto) as { s?: number };
          if (typeof j.s === 'number' && j.s >= 30 && j.s <= 900) s = j.s;
        } catch {
          /* sem corpo: 60 s */
        }
        return s * 1000 * (0.9 + Math.random() * 0.2);
      });
    }
    laco(async () => {
      await esperar(600_000);
      if (ativo()) await pedir('html', '/');
      return 0;
    });
    await Promise.all(lacos);
  }

  await Promise.all(Array.from({ length: o.usuarios }, (_, i) => visitante(i)));
  clearInterval(parcial);
  process.send?.({ tipo: 'parcial', ...janela, t: Date.now() });
  agent.destroy();
  process.send?.({ tipo: 'fim', contagem: total });
}

function descomprimir(b: Buffer, enc: string): string {
  if (!b.length) return '';
  if (enc === 'gzip') return gunzipSync(b).toString('utf8');
  if (enc === 'br') return brotliDecompressSync(b).toString('utf8');
  return b.toString('utf8');
}

// ---- pedidos avulsos do coordenador (municípios, painel), pelo mesmo caminho dos visitantes (--conectar) ------------
function avulso(path: string, op: { metodo?: string; corpo?: string; cab?: Record<string, string> } = {}): Promise<{ status: number; cab: http.IncomingHttpHeaders; texto: string }> {
  return new Promise((res, rej) => {
    const req = MOD.request(
      {
        host: CONECTAR ?? BASE.hostname,
        port: BASE.port || (HTTPS ? 443 : 80),
        path,
        method: op.metodo ?? 'GET',
        headers: { host: BASE.host, 'accept-encoding': 'gzip', 'user-agent': 'sintonia-ensaio-borda/1', ...(op.cab ?? {}) },
        ...TLS,
      },
      (r) => {
        const partes: Buffer[] = [];
        r.on('data', (b: Buffer) => partes.push(b));
        r.on('end', () => {
          try {
            res({ status: r.statusCode ?? 0, cab: r.headers, texto: descomprimir(Buffer.concat(partes), String(r.headers['content-encoding'] ?? '')) });
          } catch (e) {
            rej(e as Error);
          }
        });
        r.on('error', rej);
      },
    );
    req.setTimeout(20_000, () => req.destroy(new Error('tempo')));
    req.on('error', rej);
    req.end(op.corpo);
  });
}

// ---- origem pelo painel (opcional) ------------------------------------------------------------------------------------
async function sessaoAdmin(senha: string): Promise<string | null> {
  try {
    const corpo = JSON.stringify({ senha });
    const r = await avulso('/api/admin/login', {
      metodo: 'POST',
      corpo,
      cab: { 'content-type': 'application/json', origin: BASE.origin, 'content-length': String(Buffer.byteLength(corpo)) },
    });
    const c = ([] as string[]).concat(r.cab['set-cookie'] ?? [])[0];
    return r.status === 200 && c ? c.split(';')[0] : null;
  } catch {
    return null;
  }
}
async function origemPainel(cookie: string): Promise<number | null> {
  try {
    const r = await avulso('/api/admin/state', { cab: { cookie } });
    if (r.status !== 200) return null;
    const j = JSON.parse(r.texto) as { metrics?: { requisicoesUltimoMinuto?: number } };
    const n = j.metrics?.requisicoesUltimoMinuto;
    return typeof n === 'number' ? n / 60 : null;
  } catch {
    return null;
  }
}

// ---- coordenador ------------------------------------------------------------------------------------------------------
const f1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

async function coordenador() {
  const agora = process.env.ENSAIO_AGORA ? Date.parse(process.env.ENSAIO_AGORA) : Date.now();
  const local = /^(localhost|127\.|\[::1\]|.*\.localhost$)/.test(BASE.hostname);
  if (!local && arg('forcar') !== 'true' && agora >= Date.parse('2026-10-24T00:00:00-03:00') && agora < Date.parse('2026-10-26T06:00:00-03:00')) {
    console.error('Ensaio contra a produção NUNCA em 24 nem em 25/10 (plano, item 4). Use --forcar só se o dono mandar.');
    process.exit(2);
  }
  // municípios (código TSE + UF) do próprio site, uma vez só
  let municipios: [string, string][] = [];
  try {
    const r = await avulso('/data/municipios-br.json');
    const j = JSON.parse(r.texto) as { uf: string[]; cod: string[] };
    municipios = j.cod.map((c, i) => [j.uf[i], c]);
  } catch {
    console.error('! Não consegui ler /data/municipios-br.json: os 10% "curiosos" ficam sem município.');
  }
  const senha = process.env.SINTONIA_ADMIN_SENHA;
  const cookie = senha ? await sessaoAdmin(senha) : null;
  if (senha && !cookie) console.error('! SINTONIA_ADMIN_SENHA definida, mas o login no painel falhou: a origem será só estimada.');

  const workers = Array.from({ length: TRAB }, () => cluster.fork());
  await Promise.all(workers.map((w) => new Promise<void>((r) => w.once('message', () => r()))));
  const inicio = Date.now() + 500;
  const medirDe = inicio + RAMPA * 1000;
  const ate = medirDe + DURACAO * 1000;
  console.log(
    `Ensaio pela borda em ${BASE.origin} · ${USUARIOS} visitantes em ${TRAB} processo(s) · rampa ${RAMPA} s + ${DURACAO} s medidos` +
      ` · ritmo ×${FATOR} · presença ${PRESENCA ? 'ligada (zere a medição depois)' : 'desligada'} · origem ${cookie ? 'pelo painel' : 'estimada pelo cf-cache-status'}`,
  );
  console.log('tempo | req/s | da borda (HIT+UPDATING) | à origem (estimativa: mín–máx) | origem pelo painel (API, média de 1 min) | 5xx');

  /** janelas de 10 s, somando os parciais dos processos */
  const janelas = new Map<number, Parcial>();
  const origemPainelSerie: number[] = [];
  let origemEstMax = 0;
  const final = contagemVazia();
  let fins = 0;
  const imprimir = setInterval(async () => {
    const chave = Math.floor((Date.now() - 10_000) / 10_000);
    const j = janelas.get(chave);
    janelas.delete(chave);
    const op = cookie ? await origemPainel(cookie) : null;
    if (op !== null && Date.now() >= medirDe) origemPainelSerie.push(op);
    if (!j) return;
    const s = (Date.now() - inicio) / 1000;
    const borda = (j.porStatus.HIT ?? 0) + (j.porStatus.UPDATING ?? 0);
    // estimativa conservadora: cada UPDATING conta como uma renovação na origem (é o teto; o real fica entre os dois)
    if (Date.now() >= medirDe + 10_000) origemEstMax = Math.max(origemEstMax, (j.origem + j.updating) / 10);
    console.log(
      `${s < RAMPA ? 'rampa ' : ''}${Math.round(s)} s | ${f1(j.pedidos / 10)} | ${f1(borda / 10)} | ${f1(j.origem / 10)}–${f1((j.origem + j.updating) / 10)} | ${op === null ? '—' : f1(op)} | ${j.e5}`,
    );
  }, 10_000);

  await new Promise<void>((res) => {
    for (const w of workers) {
      w.on('message', (m: { tipo: string } & Partial<Parcial> & { contagem?: Contagem }) => {
        if (m.tipo === 'parcial') {
          const k = Math.floor((m.t ?? Date.now()) / 10_000);
          const j = janelas.get(k) ?? { t: k, pedidos: 0, origem: 0, updating: 0, porStatus: {}, e5: 0 };
          j.pedidos += m.pedidos ?? 0;
          j.origem += m.origem ?? 0;
          j.updating += m.updating ?? 0;
          j.e5 += m.e5 ?? 0;
          for (const [s, n] of Object.entries(m.porStatus ?? {})) j.porStatus[s] = (j.porStatus[s] ?? 0) + n;
          janelas.set(k, j);
        } else if (m.tipo === 'fim' && m.contagem) {
          somar(final, m.contagem);
          if (++fins === workers.length) res();
        }
      });
    }
    const porTrab = workers.map((_, i) => Math.floor(USUARIOS / TRAB) + (i < USUARIOS % TRAB ? 1 : 0));
    workers.forEach((w, i) => w.send({ usuarios: porTrab[i], medirDe, ate, rampaMs: RAMPA * 1000, municipios } satisfies Ordem));
  });
  clearInterval(imprimir);
  for (const w of workers) w.kill();

  const r = resumir(final);
  const origemMax = origemPainelSerie.length ? Math.max(...origemPainelSerie) : origemEstMax;
  console.log(`\nResultado (${DURACAO} s medidos, ${f1(r.total / DURACAO)} req/s em média, ${r.total} pedidos)`);
  console.log('cf-cache-status | pedidos | req/s | %');
  for (const [s, n] of Object.entries(r.porStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`${s} | ${n} | ${f1(n / DURACAO)} | ${f1((n / Math.max(1, r.total)) * 100)}%`);
  }
  console.log('\npedido | pedidos | p50 ms | p95 ms | p99 ms | HIT+UPDATING');
  for (const g of GRUPOS) {
    const p = r.p[g];
    if (p) console.log(`${g} | ${p.n} | ${f1(p.p50)} | ${f1(p.p95)} | ${f1(p.p99)} | ${f1(p.hit * 100)}%`);
  }
  const outros = Object.entries(final.codigos).filter(([k]) => !/^[23]/.test(k));
  console.log(`\nerros: 5xx ${r.erros5xx} · 4xx ${r.erros4xx} · rede ${r.errosRede}${outros.length ? ` (${outros.map(([k, n]) => `${k}: ${n}`).join(', ')})` : ''}`);
  console.log(
    `origem: ${origemPainelSerie.length ? `pelo painel, pico ${f1(origemMax)} req/s de API (média ${f1(origemPainelSerie.reduce((a, b) => a + b, 0) / origemPainelSerie.length)})` : `estimada, pico de 10 s ≤ ${f1(origemEstMax)} req/s (pedidos que não saíram da cópia + 1 renovação por UPDATING; o painel dá o número exato)`}`,
  );
  console.log('\nAprovação (plano, item 4):');
  const crit = avaliar(r, origemMax);
  for (const c of crit) console.log(`${c.ok ? '✔' : '✘'} ${c.criterio}: ${c.valor}`);
  const aprovado = crit.every((c) => c.ok);
  console.log(aprovado ? '\nAPROVADO' : '\nREPROVADO (veja os ✘ acima)');
  if (PRESENCA) console.log('Lembrete: Painel → Audiência → Zerar medição (o ensaio contou como audiência).');
  if (JSON_SAIDA) console.log(JSON.stringify({ base: BASE.origin, usuarios: USUARIOS, duracao: DURACAO, fator: FATOR, resumo: r, origemMax, criterios: crit, aprovado }));
  process.exit(aprovado ? 0 : 1);
}

// só quando executado (importar para testar não dispara nada); os processos filhos rodam o mesmo arquivo
if (process.argv[1] && /ensaio-borda\.[cm]?[jt]s$/.test(process.argv[1])) {
  if (cluster.isPrimary) {
    void coordenador();
  } else {
    process.on('message', (m: Ordem) => {
      if (m && m.usuarios > 0) void trabalhador(m);
    });
    process.send?.('pronto');
  }
}
