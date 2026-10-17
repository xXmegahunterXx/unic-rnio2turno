/**
 * Lives que exibem o Sintonia (I23, leva 3) e as rotas dos streamers. Contrato em src/shared/lives.ts.
 *
 * Contagem ANÔNIMA: a /live (fonte de navegador do OBS) manda um batimento a cada 60 s com um id aleatório da carga da
 * página, o layout e os anúncios na tela. Nada identifica canal nem pessoa: a rede do cliente entra só como hash com sal
 * (`clienteDe`, nunca o IP) para o teto de fontes por rede (`LIVES.maxFontesPorRede`), e só na memória. Guardado em disco (STATE_DIR/lives.json,
 * gravação atômica no máximo a cada 15 s; nada no contêiner de ensaio, SINTONIA_ENSAIO): minutos no ar (total, por
 * layout, por anúncio), o pico de lives ao mesmo tempo, o detalhe por hora (14 dias) e o MAIOR número de canais de bot
 * já visto — os canais em si (hash com sal do processo) ficam só na memória.
 *
 * Rotas (registradas por `registrarStreamers`, 1 linha em app.ts, antes do 404 de /api/* e do `app.route` do admin):
 *  - `POST /api/live/batimento`  corpo ≤ 200 B (text/plain do sendBeacon ou JSON) `{ id, layout, a? }` → 204. Conta só
 *    com Origin do site (outro site → 403; sem Origin, como no curl → 204 sem contar). Uma fonte só entra em "agora", no
 *    pico e nos quadros depois de confirmada (2 batimentos com ≥ 45 s entre eles; ver `Fonte.confirmada`). Chave
 *    'contar-lives' desligada → 204 sem ler nem contar. Na Cloudflare: regra de bypass (nunca guardado).
 *  - `GET /api/live/agora`  `{ agora: N | null }` — N só a partir de 5 lives (e null com a chave desligada); a borda guarda 30 s.
 *  - `GET /api/admin/lives`  LivesResumo · `POST /api/admin/lives { acao: 'zerar' }` (painel → Lives).
 *  - `GET /api/texto/placar`  o texto do placar para bots (src/server/texto-placar.ts), que alimenta `canaisBot`.
 */
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { HttpBindings } from '@hono/node-server';
import type { ChavesNoite } from '../shared/types';
import { LAYOUTS_CONTADOS, LIVES, ID_FONTE_LIVE, type BatimentoLive, type HoraLives, type LayoutContado, type LivesPublico, type LivesResumo } from '../shared/lives';
import { cabecalhosCache } from './http-cache';
import type { Logger } from './log';
import { createJsonStore, type JsonStore } from './state-store';
import { registrarTextoPlacar, type FonteTextoPlacar } from './texto-placar';

type Ctx = Context<{ Bindings: HttpBindings }>;
type App = Hono<{ Bindings: HttpBindings }>;

const HORA_MS = 3_600_000;
const ehLayout = (v: unknown): v is LayoutContado => typeof v === 'string' && (LAYOUTS_CONTADOS as readonly string[]).includes(v);
const ID_ANUNCIO = /^[a-z0-9-]{2,40}$/;

interface Fonte {
  rede: string;
  layout: LayoutContado;
  anuncios: string[];
  /** último batimento (epoch ms) */
  visto: number;
  /** último batimento que somou minuto (ou o 1º, que só registra) */
  contado: number;
  /**
   * já somou um minuto (2 batimentos com ≥ `minutoMinS` entre eles). Só as confirmadas contam em "agora", no pico, por
   * layout e por hora: um id mandado uma vez (curl, recarga) nunca vira "live" — forjar exige manter cada id vivo.
   */
  confirmada: boolean;
}

/** Arquivo STATE_DIR/lives.json (só contagens). */
interface LivesSalvo {
  v: 1;
  desde: number;
  minutos: { total: number; porLayout: Record<string, number>; porAnuncio: Record<string, number> };
  pico: { n: number; em: number } | null;
  horas: [number, number, number][];
  canaisMax: number;
}

/** Resultado de um batimento (testes e log). */
export type ResultadoBatimento = 'nova' | 'minuto' | 'visto' | 'teto-rede' | 'teto';

/** Contagem anônima das lives. Relógio injetável (testes). */
export class Lives {
  private fontes = new Map<string, Fonte>();
  /** fontes confirmadas (ver `Fonte.confirmada`) entre as ativas */
  private confirmadas = 0;
  private porRede = new Map<string, Set<string>>();
  private minutos = { total: 0, porLayout: {} as Record<string, number>, porAnuncio: {} as Record<string, number> };
  private pico: { n: number; em: number } | null = null;
  private horas = new Map<number, { max: number; minutos: number }>();
  private canais = new Set<string>();
  private canaisAntes = 0;
  private limpoEm = 0;
  desde: number;
  /** contagem nova desde a última gravação */
  sujo = false;

  constructor(private readonly now: () => number = Date.now) {
    this.desde = now();
  }

  /** Esquece as fontes sem batimento há mais de `LIVES.ativaS` (no máximo 1×/s). */
  private limpar(t: number, forcar = false) {
    if (!forcar && t - this.limpoEm < 1000) return;
    this.limpoEm = t;
    const limite = t - LIVES.ativaS * 1000;
    for (const [id, f] of this.fontes) {
      if (f.visto >= limite) continue;
      this.fontes.delete(id);
      if (f.confirmada) this.confirmadas--;
      const s = this.porRede.get(f.rede);
      s?.delete(id);
      if (s && s.size === 0) this.porRede.delete(f.rede);
    }
  }

  private hora(t: number) {
    const h = Math.floor(t / HORA_MS) * HORA_MS;
    let x = this.horas.get(h);
    if (!x) {
      x = { max: 0, minutos: 0 };
      this.horas.set(h, x);
      const corte = h - LIVES.horas * HORA_MS;
      for (const k of this.horas.keys()) if (k <= corte) this.horas.delete(k);
    }
    return x;
  }

  /**
   * Um batimento de uma fonte (/live aberta no OBS). `anunciosNoAr`: ids dos anúncios no ar agora (os outros ids do
   * corpo são ignorados). A 1ª vez só registra a fonte; as seguintes somam 1 minuto se vierem ≥ 45 s depois da última que
   * somou (recarregar a página não duplica: id novo = fonte nova, sem minuto).
   */
  batimento(rede: string, b: BatimentoLive & { layout: LayoutContado }, anunciosNoAr: ReadonlySet<string>): ResultadoBatimento {
    const t = this.now();
    this.limpar(t);
    const anuncios = [...new Set((b.a ?? []).filter((x) => anunciosNoAr.has(x)))].slice(0, LIVES.maxAnuncios);
    const f = this.fontes.get(b.id);
    if (!f || f.rede !== rede) {
      if (f) return 'visto'; // o mesmo id vindo de outra rede: ignora (não troca de dono)
      if (this.fontes.size >= LIVES.maxFontes) return 'teto';
      let s = this.porRede.get(rede);
      if (s && s.size >= LIVES.maxFontesPorRede) return 'teto-rede';
      if (!s) this.porRede.set(rede, (s = new Set()));
      s.add(b.id);
      // só registra: a fonte entra na contagem quando confirmar (2º batimento ≥ 45 s depois)
      this.fontes.set(b.id, { rede, layout: b.layout, anuncios, visto: t, contado: t, confirmada: false });
      return 'nova';
    }
    f.visto = t;
    f.layout = b.layout;
    f.anuncios = anuncios;
    if (t - f.contado < LIVES.minutoMinS * 1000) return 'visto';
    f.contado = t;
    const h = this.hora(t);
    if (!f.confirmada) {
      f.confirmada = true;
      this.confirmadas++;
      if (!this.pico || this.confirmadas > this.pico.n) this.pico = { n: this.confirmadas, em: t };
    }
    h.max = Math.max(h.max, this.confirmadas);
    this.minutos.total++;
    this.minutos.porLayout[b.layout] = (this.minutos.porLayout[b.layout] ?? 0) + 1;
    for (const a of anuncios) this.minutos.porAnuncio[a] = (this.minutos.porAnuncio[a] ?? 0) + 1;
    h.minutos++;
    this.sujo = true;
    return 'minuto';
  }

  /** Um canal de bot pediu o texto do placar (chave já com hash e sal; nunca o nome). */
  canal(chave: string) {
    if (this.canais.has(chave) || this.canais.size >= 100_000) return;
    this.canais.add(chave);
    if (this.canais.size > this.canaisAntes) this.sujo = true;
  }

  /** Lives ativas e confirmadas agora (no ar há pelo menos ~1 min). */
  agora(): number {
    this.limpar(this.now());
    return this.confirmadas;
  }

  /** Fontes registradas (confirmadas ou não): só para testes e o teto de memória. */
  fontesRegistradas(): number {
    this.limpar(this.now());
    return this.fontes.size;
  }

  /** O que a /streamers mostra: o número só com `LIVES.pisoPublico` ou mais. */
  publico(): LivesPublico {
    const n = this.agora();
    return { agora: n >= LIVES.pisoPublico ? n : null };
  }

  /** Canais distintos: o maior entre o que foi visto antes do último reinício e o de agora (nunca soma: conservador). */
  get canaisBot(): number {
    return Math.max(this.canaisAntes, this.canais.size);
  }

  resumo(): LivesResumo {
    this.limpar(this.now(), true);
    const porLayout: Record<string, number> = {};
    const agoraPorAnuncio: Record<string, number> = {};
    for (const f of this.fontes.values()) {
      if (!f.confirmada) continue;
      porLayout[f.layout] = (porLayout[f.layout] ?? 0) + 1;
      for (const a of f.anuncios) agoraPorAnuncio[a] = (agoraPorAnuncio[a] ?? 0) + 1;
    }
    const horas: HoraLives[] = [...this.horas.entries()].sort((a, b) => a[0] - b[0]).map(([h, x]) => ({ h, max: x.max, minutos: x.minutos }));
    return {
      agora: this.confirmadas,
      porLayout,
      minutos: { total: this.minutos.total, porLayout: { ...this.minutos.porLayout }, porAnuncio: { ...this.minutos.porAnuncio } },
      canaisBot: this.canaisBot,
      pico: this.pico ? { ...this.pico } : null,
      desde: this.desde,
      agoraPorAnuncio,
      horas,
    };
  }

  /** Zera tudo (painel: depois do ensaio, antes de vender). As fontes ativas continuam contando dali em diante. */
  zerar() {
    const t = this.now();
    this.minutos = { total: 0, porLayout: {}, porAnuncio: {} };
    this.horas.clear();
    this.canais.clear();
    this.canaisAntes = 0;
    this.desde = t;
    this.limpar(t, true);
    this.pico = this.confirmadas ? { n: this.confirmadas, em: t } : null;
    this.sujo = true;
  }

  toJSON(): LivesSalvo {
    return {
      v: 1,
      desde: this.desde,
      minutos: { total: this.minutos.total, porLayout: { ...this.minutos.porLayout }, porAnuncio: { ...this.minutos.porAnuncio } },
      pico: this.pico,
      horas: [...this.horas.entries()].sort((a, b) => a[0] - b[0]).map(([h, x]) => [h, x.max, x.minutos]),
      canaisMax: this.canaisBot,
    };
  }

  /** Restaura do arquivo (campo a campo; lixo é ignorado). false = arquivo inválido. */
  carregar(v: unknown): boolean {
    if (!v || typeof v !== 'object' || (v as { v?: unknown }).v !== 1) return false;
    const o = v as Partial<LivesSalvo>;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    const mapa = (x: unknown, chave: (k: string) => boolean) => {
      const out: Record<string, number> = {};
      if (x && typeof x === 'object') for (const [k, n] of Object.entries(x)) if (chave(k) && num(n) > 0) out[k] = num(n);
      return out;
    };
    if (typeof o.desde === 'number' && o.desde > 0) this.desde = o.desde;
    this.minutos = {
      total: num(o.minutos?.total),
      porLayout: mapa(o.minutos?.porLayout, (k) => ehLayout(k)),
      porAnuncio: mapa(o.minutos?.porAnuncio, (k) => ID_ANUNCIO.test(k)),
    };
    this.pico = o.pico && num(o.pico.n) > 0 && num(o.pico.em) > 0 ? { n: num(o.pico.n), em: num(o.pico.em) } : null;
    this.horas.clear();
    const corte = this.now() - LIVES.horas * HORA_MS;
    if (Array.isArray(o.horas)) {
      for (const x of o.horas) {
        if (!Array.isArray(x) || x.length !== 3) continue;
        const [h, max, min] = x.map(num);
        if (h > corte && h % HORA_MS === 0) this.horas.set(h, { max, minutos: min });
      }
    }
    this.canaisAntes = num(o.canaisMax);
    return true;
  }
}

// =============================================================================================
// Rotas
// =============================================================================================

export interface DepsStreamers {
  now: () => number;
  log: Logger;
  /** dados da apuração (a classe `Dados`) */
  dados: FonteTextoPlacar;
  /** chaves da noite em vigor ('texto-bots' e 'contar-lives') */
  noite: () => Pick<ChavesNoite, 'textoBots' | 'contarLives'>;
  /** rede do cliente (hash com sal; nunca o IP) */
  clienteDe: (c: Ctx) => string;
  /** pedido do próprio site (Origin/Referer/Sec-Fetch-Site) */
  origemPermitida: (c: Ctx) => boolean;
  /** STATE_DIR (null = só memória) */
  stateDir?: string | null;
  /** grava em disco? (padrão: sim, salvo SINTONIA_ENSAIO) */
  gravar?: boolean;
  /** `Cloudflare-CDN-Cache-Control` ligado (CDN_CC ≠ 0) */
  borda?: boolean;
  /** domínio exibido no texto dos bots (o da PUBLIC_URL) */
  dominio?: string | null;
}

/** `GET /api/live/agora`: navegador não guarda; a borda, 30 s. */
export const CC_LIVE_AGORA = `public, max-age=0, s-maxage=${LIVES.agoraBordaS}`;
export const CC_BORDA_LIVE_AGORA = `max-age=${LIVES.agoraBordaS}, stale-if-error=600`;

const ensaio = () => /^(1|true|sim)$/i.test(process.env.SINTONIA_ENSAIO?.trim() ?? '');

/**
 * Registra as rotas dos streamers: batimento e "agora" das lives, o painel (/api/admin/lives) e o texto do placar para
 * bots. `admin` = o sub-app do painel (já com sessão e CSRF). Chamar antes do 404 de /api/* e do `app.route` do admin.
 */
export function registrarStreamers(app: App, admin: App, deps: DepsStreamers) {
  const { now, log } = deps;
  const lives = new Lives(now);
  const gravar = (deps.gravar ?? !ensaio()) && !!deps.stateDir;
  let store: JsonStore | null = null;
  if (gravar) {
    store = createJsonStore(deps.stateDir!, 'lives.json', { debounceMs: 15_000, onErro: (e) => log.erro('Falha ao salvar a contagem de lives', e) });
    const salvo = store.ler();
    if (salvo !== null) {
      if (lives.carregar(salvo)) log.info(`Lives: contagem restaurada de ${store.caminho}`);
      else log.aviso(`Lives: ${store.caminho} inválido — ignorado`);
    }
  }
  const salvar = () => {
    if (!store || !lives.sujo) return;
    lives.sujo = false;
    store.salvar(() => lives.toJSON());
  };

  /**
   * Batimento mandado pelo próprio site? Outro site → 403. Conta só com `Origin` do site: todo navegador (e o OBS/CEF)
   * manda Origin num POST, inclusive no sendBeacon; sem Origin (curl, mesmo com Sec-Fetch-Site forjado) → aceito, mas
   * não conta. Não impede quem forja o Origin também — por isso o teto por rede e a confirmação em 2 batimentos.
   */
  const doSite = (c: Ctx): boolean | 'outro' => {
    const sfs = c.req.header('sec-fetch-site');
    if (sfs && sfs !== 'same-origin') return 'outro';
    if (!c.req.header('origin')) return false;
    return deps.origemPermitida(c) ? true : 'outro';
  };
  const porRede = new Map<string, number>();
  let janelaRede = 0;
  const redeCabe = (rede: string) => {
    const t = now();
    if (t - janelaRede >= 60_000) {
      janelaRede = t;
      porRede.clear();
    }
    const atual = porRede.get(rede);
    // memória limitada: com redes demais na mesma janela (ataque), as novas esperam o próximo minuto
    if (atual === undefined && porRede.size >= 50_000) return false;
    const n = (atual ?? 0) + 1;
    porRede.set(rede, n);
    return n <= LIVES.maxBatimentosRedeMin;
  };
  const semCorpo = (c: Ctx) => c.body(null, 204, { 'cache-control': 'no-store' });

  app.post(
    '/api/live/batimento',
    bodyLimit({ maxSize: LIVES.corpoMax, onError: (c) => c.json({ erro: 'Corpo grande demais.' }, 413, { 'cache-control': 'no-store' }) }),
    async (c) => {
      // chave 'contar-lives' desligada: nada é lido nem contado
      if (!deps.noite().contarLives) return semCorpo(c);
      const site = doSite(c);
      if (site === 'outro') return c.json({ erro: 'Origem não permitida.' }, 403, { 'cache-control': 'no-store' });
      const ct = c.req.header('content-type') ?? '';
      if (ct && !/^(application\/json|text\/plain)\b/i.test(ct)) return c.json({ erro: 'Envie { id, layout } em JSON.' }, 415, { 'cache-control': 'no-store' });
      let corpo: unknown;
      try {
        corpo = JSON.parse(await c.req.text());
      } catch {
        return c.json({ erro: 'Envie { id, layout } em JSON.' }, 400, { 'cache-control': 'no-store' });
      }
      const b = (corpo && typeof corpo === 'object' ? corpo : {}) as Partial<BatimentoLive>;
      const a = Array.isArray(b.a) ? b.a.filter((x): x is string => typeof x === 'string' && ID_ANUNCIO.test(x)) : [];
      if (typeof b.id !== 'string' || !ID_FONTE_LIVE.test(b.id) || !ehLayout(b.layout) || (b.a !== undefined && !Array.isArray(b.a))) {
        return c.json({ erro: 'Envie { id, layout } em JSON.' }, 400, { 'cache-control': 'no-store' });
      }
      if (!site) return semCorpo(c);
      const rede = deps.clienteDe(c);
      if (!redeCabe(rede)) return semCorpo(c);
      let noAr: Set<string>;
      try {
        noAr = new Set((deps.dados.status().anuncios ?? []).filter((x) => x.formatos.includes('live')).map((x) => x.id));
      } catch {
        noAr = new Set();
      }
      lives.batimento(rede, { id: b.id, layout: b.layout, a }, noAr);
      salvar();
      return semCorpo(c);
    },
  );

  app.get('/api/live/agora', (c) => {
    const corpo: LivesPublico = deps.noite().contarLives ? lives.publico() : { agora: null };
    return c.json(corpo, 200, { ...cabecalhosCache(CC_LIVE_AGORA, CC_BORDA_LIVE_AGORA, deps.borda !== false), 'access-control-allow-origin': '*' });
  });

  admin.get('/lives', (c) => c.json({ ...lives.resumo(), ligado: deps.noite().contarLives } satisfies LivesResumo));
  admin.post('/lives', async (c) => {
    if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ erro: 'Envie o corpo como application/json.' }, 415);
    let corpo: unknown = null;
    try {
      corpo = await c.req.json();
    } catch {
      corpo = null;
    }
    if (!corpo || typeof corpo !== 'object' || (corpo as { acao?: unknown }).acao !== 'zerar' || Object.keys(corpo).length !== 1) {
      return c.json({ erro: 'Envie { "acao": "zerar" }.' }, 400);
    }
    lives.zerar();
    salvar();
    log.info('Lives: contagem zerada pelo painel');
    return c.json({ ...lives.resumo(), ligado: deps.noite().contarLives } satisfies LivesResumo);
  });

  const texto = registrarTextoPlacar(app, {
    now,
    dados: deps.dados,
    ligado: () => deps.noite().textoBots,
    dominio: deps.dominio,
    borda: deps.borda,
    aoCanal: (k) => {
      lives.canal(k);
      salvar();
    },
  });

  return {
    lives,
    texto: texto.texto,
    /** Grava o pendente agora (encerramento). */
    persistir: async () => {
      salvar();
      await store?.flush();
    },
  };
}
