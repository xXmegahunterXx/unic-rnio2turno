/**
 * Relatório do anunciante por link privado (anunciantes v2, E17): `/relatorio#k=<token>`.
 *
 *  - O painel gera o link (`POST /api/admin/relatorios`, ação 'criar'): o token tem 128 bits e aparece UMA vez, na
 *    resposta. O servidor guarda só o sha256 dele em STATE_DIR/relatorios.json (gravação atômica, permissão 600).
 *  - A página `/relatorio` lê o token do fragmento (`#k=`, que nunca vai ao servidor nem ao log) e faz
 *    `POST /api/anuncie/relatorio { k }` → `RelatorioAnunciante` (src/shared/relatorio.ts): só números agregados de UMA
 *    marca. Token errado, revogado ou de anúncio removido → 404 'Link inválido ou revogado.'. Só do próprio site, 20
 *    pedidos por minuto por rede, `no-store`, `noindex` e `no-referrer`; resposta guardada em memória por 30 s por token.
 *  - Até `LINKS_POR_ANUNCIO` links ativos por anúncio e 100 no total; revogar faz o link dar 404 na hora. Remover o
 *    anúncio no painel revoga os links dele (`revogarDoAnuncio`).
 *  - Interruptor `RELATORIOS=0` no ambiente: a rota pública dá 404 e o painel recebe `ligado: false` (esconde os links).
 *
 * LGPD: nada do visitante é guardado; `acessos` conta aberturas do link (no máximo uma por rede a cada 30 min) e
 * `ultimoAcessoHora` é só a hora cheia.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { HttpBindings } from '@hono/node-server';
import { z } from 'zod';
import { LINKS_POR_ANUNCIO, type LinkRelatorio, type RelatorioAnunciante } from '../shared/relatorio';
import { LimiteJanela, Repeticoes } from './anuncios';
import type { Logger } from './log';
import type { JsonStore } from './state-store';

type App = Hono<{ Bindings: HttpBindings }>;
type Ctx = Context<{ Bindings: HttpBindings }>;

/** Links guardados no total (ativos); os revogados ficam no arquivo até o teto de `MAX_GUARDADOS`. */
export const MAX_LINKS_ATIVOS = 100;
const MAX_GUARDADOS = 300;
/** Pedidos da página por minuto por rede. */
export const PEDIDOS_RELATORIO_MIN = 20;
/** Resposta guardada em memória por token. */
export const CACHE_RELATORIO_MS = 30_000;
/** Uma abertura por rede e link a cada 30 min conta como acesso. */
const JANELA_ACESSO_MS = 30 * 60_000;
const HORA = 3_600_000;
const ERRO_LINK = 'Link inválido ou revogado.';
const CABECALHOS = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } as const;

/** Link como fica no arquivo: o do contrato + `h` (sha256 do token, hex). */
interface LinkGuardado extends LinkRelatorio {
  h: string;
}

/** Formato de STATE_DIR/relatorios.json. */
export interface RelatoriosArquivo {
  v: 1;
  links: LinkGuardado[];
}

export const hashToken = (k: string) => createHash('sha256').update(k).digest('hex');
const RE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const RE_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RE_LID = /^[a-f0-9]{8,32}$/;

const comandoSchema = z.discriminatedUnion('acao', [
  z
    .object({
      acao: z.literal('criar'),
      id: z.string().trim().toLowerCase().regex(RE_ID, 'id de anúncio inválido'),
      rotulo: z.string().trim().max(60, 'rótulo com até 60 caracteres').optional(),
      mostrarMeta: z.boolean().optional(),
    })
    .strict(),
  z.object({ acao: z.literal('revogar'), lid: z.string().regex(RE_LID, 'link inválido') }).strict(),
]);

export interface DepsRelatorios {
  now: () => number;
  log: Logger;
  /** RELATORIOS=0 → false */
  ligado: boolean;
  store?: JsonStore | null;
  origemPermitida: (c: Ctx) => boolean;
  /** chave da rede (hash com sal) para o limite por minuto e a contagem de acessos */
  redeDe: (c: Ctx) => string;
  /** origem pública (PUBLIC_URL ou a da requisição) para montar o link */
  origemDe: (c: Ctx) => string;
  /** o anúncio existe no painel? */
  anuncioExiste: (id: string) => boolean;
  /** relatório do anúncio (null = anúncio removido) */
  relatorio: (id: string, mostrarMeta: boolean, origem: string) => RelatorioAnunciante | null;
}

/** Valida um link lido do arquivo (nunca lança; inválido → null). */
function linkDoArquivo(v: unknown): LinkGuardado | null {
  if (!v || typeof v !== 'object') return null;
  const x = v as Record<string, unknown>;
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  if (typeof x.h !== 'string' || !/^[a-f0-9]{64}$/.test(x.h)) return null;
  if (typeof x.lid !== 'string' || !RE_LID.test(x.lid) || typeof x.id !== 'string' || !RE_ID.test(x.id)) return null;
  const out: LinkGuardado = {
    h: x.h,
    lid: x.lid,
    id: x.id,
    rotulo: typeof x.rotulo === 'string' ? x.rotulo.slice(0, 60) : '',
    criadoEm: num(x.criadoEm),
    mostrarMeta: x.mostrarMeta === true,
    acessos: num(x.acessos),
  };
  if (num(x.revogadoEm) > 0) out.revogadoEm = num(x.revogadoEm);
  if (num(x.ultimoAcessoHora) > 0) out.ultimoAcessoHora = num(x.ultimoAcessoHora);
  return out;
}

/** Link para o painel (sem o hash). */
const publico = ({ h: _h, ...l }: LinkGuardado): LinkRelatorio => ({ ...l });

export function registrarRelatorios(app: App, admin: App, deps: DepsRelatorios) {
  const { now, log } = deps;
  const links: LinkGuardado[] = [];
  const salvo = deps.store?.ler() as Partial<RelatoriosArquivo> | null | undefined;
  if (salvo && salvo.v === 1 && Array.isArray(salvo.links)) {
    for (const l of salvo.links) {
      const ok = linkDoArquivo(l);
      if (ok && !links.some((x) => x.lid === ok.lid || x.h === ok.h)) links.push(ok);
    }
    if (links.length) log.info(`Relatórios: ${links.filter((l) => !l.revogadoEm).length} link(s) ativo(s) restaurado(s) de ${deps.store!.caminho}`);
  }
  const salvar = () => deps.store?.salvar((): RelatoriosArquivo => ({ v: 1, links }));
  const limite = new LimiteJanela(PEDIDOS_RELATORIO_MIN, 60_000, now);
  const acessosVistos = new Repeticoes(JANELA_ACESSO_MS, now, 50_000);
  const cache = new Map<string, { em: number; corpo: string }>();
  const ativo = (l: LinkGuardado) => !l.revogadoEm;

  // ---- pública: a página /relatorio ---------------------------------------------------------------------------
  app.post(
    '/api/anuncie/relatorio',
    bodyLimit({ maxSize: 512, onError: (c) => c.json({ erro: 'Corpo grande demais.' }, 413, CABECALHOS) }),
    async (c) => {
      if (!deps.ligado) return c.json({ erro: ERRO_LINK }, 404, CABECALHOS);
      if (!deps.origemPermitida(c)) return c.json({ erro: 'Origem não permitida.' }, 403, CABECALHOS);
      const rede = deps.redeDe(c);
      if (!limite.tentar(rede)) return c.json({ erro: 'Muitos pedidos; tente de novo em 1 minuto.' }, 429, { ...CABECALHOS, 'retry-after': '60' });
      let k: unknown;
      try {
        k = (JSON.parse(await c.req.text()) as { k?: unknown })?.k;
      } catch {
        k = undefined;
      }
      if (typeof k !== 'string' || !RE_TOKEN.test(k)) return c.json({ erro: ERRO_LINK }, 404, CABECALHOS);
      const h = hashToken(k);
      const link = links.find((l) => l.h === h && ativo(l));
      if (!link) return c.json({ erro: ERRO_LINK }, 404, CABECALHOS);
      const t = now();
      if (!acessosVistos.visto(`${rede}|${link.lid}`)) {
        link.acessos++;
        link.ultimoAcessoHora = Math.floor(t / HORA) * HORA;
        salvar();
      }
      const memo = cache.get(h);
      if (memo && t - memo.em < CACHE_RELATORIO_MS) return c.body(memo.corpo, 200, { ...CABECALHOS, 'content-type': 'application/json; charset=utf-8' });
      const r = deps.relatorio(link.id, link.mostrarMeta, deps.origemDe(c));
      if (!r) return c.json({ erro: ERRO_LINK }, 404, CABECALHOS);
      const corpo = JSON.stringify(r);
      if (cache.size > 500) cache.clear();
      cache.set(h, { em: t, corpo });
      return c.body(corpo, 200, { ...CABECALHOS, 'content-type': 'application/json; charset=utf-8' });
    },
  );

  // ---- painel -------------------------------------------------------------------------------------------------
  admin.get('/relatorios', (c) => c.json({ links: links.map(publico), ligado: deps.ligado }));

  admin.post('/relatorios', async (c) => {
    if (!deps.ligado) return c.json({ erro: 'Relatórios desligados no servidor (RELATORIOS=0).' }, 404);
    if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ erro: 'Envie o corpo como application/json.' }, 415);
    let corpo: unknown;
    try {
      corpo = await c.req.json();
    } catch {
      return c.json({ erro: 'JSON inválido no corpo da requisição.' }, 400);
    }
    const p = comandoSchema.safeParse(corpo);
    if (!p.success) return c.json({ erro: `Comando inválido — ${p.error.issues[0]?.message ?? 'formato'}` }, 400);
    const cmd = p.data;
    const t = now();
    if (cmd.acao === 'revogar') {
      const link = links.find((l) => l.lid === cmd.lid);
      if (!link) return c.json({ erro: 'Link não encontrado.' }, 404);
      if (!link.revogadoEm) {
        link.revogadoEm = t;
        cache.delete(link.h);
        salvar();
        log.info(`Relatórios: link revogado (${link.id}, ${link.lid})`);
      }
      return c.json({ link: publico(link) });
    }
    if (!deps.anuncioExiste(cmd.id)) return c.json({ erro: `Anúncio "${cmd.id}" não encontrado.` }, 404);
    const ativos = links.filter(ativo);
    if (ativos.filter((l) => l.id === cmd.id).length >= LINKS_POR_ANUNCIO)
      return c.json({ erro: `Já há ${LINKS_POR_ANUNCIO} links ativos para este anúncio: revogue um antes de gerar outro.` }, 409);
    if (ativos.length >= MAX_LINKS_ATIVOS) return c.json({ erro: `Limite de ${MAX_LINKS_ATIVOS} links ativos: revogue algum antes.` }, 409);
    const token = randomBytes(16).toString('base64url');
    const link: LinkGuardado = {
      h: hashToken(token),
      lid: randomBytes(6).toString('hex'),
      id: cmd.id,
      rotulo: cmd.rotulo ?? '',
      criadoEm: t,
      mostrarMeta: cmd.mostrarMeta === true,
      acessos: 0,
    };
    links.push(link);
    // o arquivo não cresce sem fim: saem os revogados mais antigos
    while (links.length > MAX_GUARDADOS) {
      const i = links.findIndex((l) => l.revogadoEm);
      if (i < 0) break;
      links.splice(i, 1);
    }
    salvar();
    log.info(`Relatórios: link criado (${link.id}, ${link.lid}${link.mostrarMeta ? ', com a meta' : ''})`);
    return c.json({ link: publico(link), url: `${deps.origemDe(c)}/relatorio#k=${token}` });
  });

  return {
    /** Links (sem o hash), para testes e o painel. */
    links: () => links.map(publico),
    /**
     * Revoga os links ativos de um anúncio (anúncio removido no painel): um anúncio recriado com o mesmo id não reabre o
     * link antigo com outra marca, e o link morto deixa de ocupar o teto de 100. Devolve quantos foram revogados.
     */
    revogarDoAnuncio: (id: string): number => {
      const t = now();
      let n = 0;
      for (const l of links)
        if (l.id === id && !l.revogadoEm) {
          l.revogadoEm = t;
          cache.delete(l.h);
          n++;
        }
      if (n) {
        salvar();
        log.info(`Relatórios: ${n} link(s) de ${id} revogado(s) com o anúncio removido`);
      }
      return n;
    },
    /** Grava o pendente agora (encerramento). */
    persistir: async () => {
      await deps.store?.flush();
    },
  };
}
