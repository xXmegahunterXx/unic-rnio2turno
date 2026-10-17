/**
 * `GET /api/texto/placar?race=pres&uf=sp` (I22, leva 3): o placar em TEXTO PURO para os bots de chat das lives
 * (Nightbot `$(urlfetch …)`, StreamElements `${customapi.…}`, Fossabot `$(customapi …)`). Regras do texto em
 * src/shared/texto-placar.ts (sem nomes antes das 17h de 25/10, ordem da urna, simulação e nomes ocultos).
 *
 *  - `text/plain; charset=utf-8`, ≤ 380 caracteres, SEMPRE 200 (um bot que recebe erro escreve o erro no chat);
 *  - cache: o navegador não guarda; a borda guarda 5 s (`Cloudflare-CDN-Cache-Control`; a Regra 1 da Cloudflare já
 *    cobre `/api/texto/`); na origem, o texto de cada (disputa, UF) é montado no máximo a cada 2 s;
 *  - limite na origem por CANAL do bot (`Nightbot-Channel`, `x-fossabot-channelid`…) — NUNCA por IP (os bots saem de
 *    poucos endereços); acima dele, só o endereço do site (`no-store`). O teto global conta só as MONTAGENS novas (o
 *    texto já montado nos últimos 2 s sai para todos, de graça): uma enxurrada de pedidos com query que fura a cópia da
 *    borda (`&z=…`) nunca deixa os outros canais só com o endereço;
 *  - canais: só a CONTAGEM de canais distintos (hash com sal aleatório do processo, nunca gravado); o nome do canal não é
 *    guardado nem vai ao log, e `Nightbot-User` (quem digitou) nunca é lido;
 *  - chave 'texto-bots' desligada no painel: responde só o endereço do site.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Context, Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import type { LiveStatus, Race, RaceId, Summary, UF } from '../shared/types';
import { DOMINIO_TEXTO_PADRAO, TEXTO_PLACAR, lerConsultaTexto, textoPlacarBot, type ConsultaTexto } from '../shared/texto-placar';
import { cabecalhosCache } from './http-cache';

type Ctx = Context<{ Bindings: HttpBindings }>;
type App = Hono<{ Bindings: HttpBindings }>;

/** O que a rota lê do servidor (a classe `Dados` de dados.ts já tem essa forma). */
export interface FonteTextoPlacar {
  status(): LiveStatus;
  race(id: RaceId): Race;
  nacional(race: RaceId): Promise<{ resumo: Summary }>;
  uf(race: RaceId, uf: UF): Promise<{ resumo: Summary }>;
}

export interface DepsTextoPlacar {
  now: () => number;
  dados: FonteTextoPlacar;
  /** chave 'texto-bots' do painel */
  ligado: () => boolean;
  /** domínio exibido ("sintonia2026.com.br"); padrão: o da PUBLIC_URL ou o endereço do produto */
  dominio?: string | null;
  /** `Cloudflare-CDN-Cache-Control` ligado (CDN_CC ≠ 0) */
  borda?: boolean;
  /** um canal de bot pediu o texto (chave já anonimizada: hash com sal do processo) */
  aoCanal?: (chave: string) => void;
}

/** Cabeçalhos do texto: navegador não guarda; a borda, 5 s (com cópia velha por até 10 min se a origem cair). */
export const CC_TEXTO = `public, max-age=0, s-maxage=${TEXTO_PLACAR.bordaS}`;
export const CC_BORDA_TEXTO = `max-age=${TEXTO_PLACAR.bordaS}, stale-while-revalidate=${TEXTO_PLACAR.bordaS}, stale-if-error=600`;

/** Montado no máximo a cada tanto, por (disputa, UF). */
const MEMO_MS = 2_000;

/**
 * Canal do bot que fez o pedido (só para o limite e a contagem): provedor + id ou nome, como os bots mandam. null =
 * pedido sem cabeçalho de bot (navegador, curl). Puro (testado).
 */
export function canalDoBot(h: (nome: string) => string | undefined): string | null {
  const nb = h('nightbot-channel');
  if (nb) {
    const p = new URLSearchParams(nb.slice(0, 400));
    const id = p.get('providerId') || p.get('name');
    if (id) return `nightbot:${p.get('provider') ?? ''}:${id.toLowerCase()}`;
  }
  const fb = h('x-fossabot-channelid') || h('x-fossabot-channellogin');
  if (fb) return `fossabot:${h('x-fossabot-channelprovider') ?? ''}:${fb.slice(0, 80).toLowerCase()}`;
  const se = h('x-streamelements-channel');
  if (se) return `streamelements:${se.slice(0, 80).toLowerCase()}`;
  return null;
}

/** Janela fixa de 1 min: conta pedidos por chave e esquece a janela anterior. */
class JanelaMinuto {
  private inicio = 0;
  private n = new Map<string, number>();
  constructor(private readonly now: () => number) {}
  /** Registra e diz se ainda cabe em `max`. */
  cabe(chave: string, max: number): boolean {
    const t = this.now();
    if (t - this.inicio >= 60_000) {
      this.inicio = t;
      this.n.clear();
    }
    const atual = this.n.get(chave);
    // memória limitada: com chaves demais na mesma janela (cabeçalho forjado em massa), as novas esperam o próximo minuto
    if (atual === undefined && this.n.size >= 50_000) return false;
    const v = (atual ?? 0) + 1;
    this.n.set(chave, v);
    return v <= max;
  }
}

/** Registra a rota pública (antes do 404 de /api/* em app.ts). Devolve a função que monta o texto (testes). */
export function registrarTextoPlacar(app: App, deps: DepsTextoPlacar) {
  const { now, dados } = deps;
  const sal = randomBytes(16);
  const janelas = new JanelaMinuto(now);
  const memo = new Map<string, { em: number; p: Promise<string> }>();
  const dominio = (deps.dominio || DOMINIO_TEXTO_PADRAO).replace(/^www\./, '');

  const montar = async (q: ConsultaTexto): Promise<string> => {
    const agora = now();
    const ligado = deps.ligado();
    let status: LiveStatus | null = null;
    try {
      status = dados.status();
    } catch {
      status = null;
    }
    const base = { agora, ligado, dominio, status, uf: q.uf };
    if (!ligado) return textoPlacarBot({ ...base, race: null, resumo: null });
    let race: Race | null = null;
    try {
      // a disputa dá o cabeçalho ("Governador · Distrito Federal") também antes da apuração
      race = dados.race(q.race);
    } catch {
      race = null;
    }
    // só busca números quando o texto pode levá-los (fora da fase 'pre')
    if (!status || status.fase === 'pre' || !race) return textoPlacarBot({ ...base, race, resumo: null });
    let resumo: Summary | null = null;
    try {
      resumo = (q.uf ? await dados.uf(q.race, q.uf) : await dados.nacional(q.race)).resumo;
    } catch {
      // fonte indisponível (TSE fora, disputa sem arquivo): o texto sai sem números, sempre 200
      resumo = null;
    }
    return textoPlacarBot({ ...base, race, resumo });
  };

  const chaveDe = (q: ConsultaTexto) => `${q.race}|${q.uf ?? 'br'}|${deps.ligado() ? 1 : 0}`;
  /** Texto já montado (ou em montagem) nos últimos 2 s, se houver: servir não custa nada. */
  const pronto = (q: ConsultaTexto): Promise<string> | null => {
    const m = memo.get(chaveDe(q));
    return m && now() - m.em < MEMO_MS ? m.p : null;
  };
  /** Texto de uma consulta, montado no máximo a cada 2 s. */
  const texto = (q: ConsultaTexto): Promise<string> => {
    const chave = chaveDe(q);
    const t = now();
    const m = memo.get(chave);
    if (m && t - m.em < MEMO_MS) return m.p;
    if (memo.size > 200) memo.clear();
    const p = montar(q).catch(() => dominio);
    memo.set(chave, { em: t, p });
    return p;
  };

  const so = (c: Ctx, corpo: string, cache: Record<string, string>) => {
    const h = { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff', ...cache };
    return c.req.method === 'HEAD' ? c.body(null, 200, h) : c.body(corpo, 200, h);
  };

  app.get(TEXTO_PLACAR.rota, async (c) => {
    const canal = canalDoBot((n) => c.req.header(n));
    const chaveCanal = canal ? createHash('sha256').update(sal).update(canal).digest('base64url').slice(0, 12) : null;
    const canalNoLimite = chaveCanal !== null && !janelas.cabe(chaveCanal, TEXTO_PLACAR.porCanalMin);
    if (chaveCanal) deps.aoCanal?.(chaveCanal);
    if (canalNoLimite) return so(c, dominio, { 'cache-control': 'no-store' });
    const q = lerConsultaTexto(c.req.query('race'), c.req.query('uf'));
    const cache = cabecalhosCache(CC_TEXTO, CC_BORDA_TEXTO, deps.borda !== false);
    // já montado: sai para todos, sem contar no teto global (a query lixo cai na mesma chave e não custa nada)
    const p = pronto(q);
    if (p) return so(c, await p, cache);
    // teto global: só as montagens novas contam (no máximo uma por disputa e UF a cada 2 s)
    if (!janelas.cabe('*', TEXTO_PLACAR.globalMin)) return so(c, dominio, { 'cache-control': 'no-store' });
    return so(c, await texto(q), cache);
  });

  return { texto };
}
