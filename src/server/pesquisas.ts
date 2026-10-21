/**
 * Pesquisas REGISTRADAS do 2º turno (contrato em src/shared/pesquisas.ts): semente + painel, rota pública, painel e
 * cartões de compartilhar. Registradas por `registrarPesquisas(app, admin, deps)` (1 linha em app.ts, antes do 404 de
 * /api/* e de `app.route('/api/admin', admin)`).
 *
 *  - SEMENTE: `DATA_DIR/pesquisas.json` (public/data no repositório; dist/data no build), preenchida com dados
 *    verificados (cada número com a URL da fonte). Relida quando o arquivo muda (no máximo a cada 60 s; ArquivosJson).
 *    Cada pesquisa passa por `validaPesquisa`; a que falha fica fora do site e aparece no painel com o motivo.
 *  - PAINEL: inclusões, edições e remoções (inclusive de uma da semente: some do site, o arquivo fica igual) em
 *    `STATE_DIR/pesquisas.json`, gravado de forma atômica (state-store.ts) a cada mudança. Outra instância no mesmo
 *    STATE_DIR (plano B de réplicas) relê o arquivo quando ele muda (conferido no máximo a cada 5 s).
 *  - PÚBLICA: `GET /api/pesquisas` → `PesquisasPublicas` (semente + painel, sem repetir id nem registro, mais recentes
 *    primeiro), com ETag e cache curto (navegador 30 s; borda 30 s + `stale-if-error`) que NUNCA atravessa a 0h de 25/10:
 *    das 0h às 17h do dia da votação a lista sai vazia (`suspensas: true`) e às 17h volta.
 *  - CARTÕES: `GET /api/og/pesquisa.png?id=<id>&formato=og|x|feed|story` (og-pesquisa.ts; sem id, a capa genérica).
 *    A rota está em OG_COM_CANDIDATO (meta-tags.ts): no dia da votação responde o convite genérico (og-rotas.ts).
 *  - PAINEL (sessão + CSRF do admin): `GET /api/admin/pesquisas` → `PesquisasAdmin`; `POST /api/admin/pesquisas`
 *    `ComandoPesquisa` (forma validada por zod em validation.ts; conteúdo por `validaPesquisa`).
 */
import { statSync } from 'node:fs';
import type { Context, Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { INICIO_APURACAO } from '../shared/constants';
import { INICIO_DIA_VOTACAO, diaDeVotacaoAntesDas17 } from '../shared/diaVotacao';
import {
  CARGOS_PESQUISA,
  LIMITES_PESQUISA,
  hojeBrasilia,
  mesclarPesquisas,
  ordenarPesquisas,
  validaPesquisa,
  type CargoPesquisa,
  type ComandoPesquisa,
  type ContextoValidacao,
  type Pesquisa,
  type PesquisaNoPainel,
  type PesquisasAdmin,
  type PesquisasPublicas,
} from '../shared/pesquisas';
import type { Race } from '../shared/types';
import { ArquivosJson } from './dados-estaticos';
import { CABECALHO_BORDA, casaEtag, etagFraco, hashCurto } from './http-cache';
import type { Logger } from './log';
import { renderPng } from './og';
import { layoutCapaPesquisas, layoutPesquisa, type CandidatoCartao } from './og-pesquisa';
import { DIM_OG, FORMATOS_OG, type FormatoOg } from './og-placar';
import { LimiteOgExcedido, type OgServida, type ServicoOg } from './og-servico';
import type { JsonStore } from './state-store';
import { ErroValidacao, parseComandoPesquisa } from './validation';

type Ctx = Context<{ Bindings: HttpBindings }>;
type App = Hono<{ Bindings: HttpBindings }>;

export const ROTA_PESQUISAS = '/api/pesquisas';
export const ROTA_OG_PESQUISA = '/api/og/pesquisa.png';
export const ARQUIVO_SEMENTE = 'pesquisas.json';

/** Cache da lista pública: o navegador e a borda guardam 30 s (mudança no painel aparece em ~1 min). */
export const TTL_PESQUISAS_S = 30;
/** Imagem de uma pesquisa (o conteúdo vai no `v=` das meta tags e na chave do cache: edição = imagem nova). */
export const TTL_OG_PESQUISA_S = 300;

/** Instantes que o cache nunca atravessa: 0h de 25/10 (a área some) e 17h (a área volta). */
const VIRADAS = [INICIO_DIA_VOTACAO, INICIO_APURACAO] as const;

/**
 * `Cache-Control` + `Cloudflare-CDN-Cache-Control` para um conteúdo que vale `ttl` segundos, encurtado para nunca
 * atravessar a próxima virada (0h ou 17h de 25/10): perto dela, sem `stale-*` (a cópia velha não pode sair depois).
 */
export function cabecalhosAteVirada(agora: number, ttl: number, borda: boolean, ligada = true): Record<string, string> {
  const prox = VIRADAS.find((v) => v > agora);
  const falta = prox === undefined ? Infinity : Math.floor((prox - agora) / 1000) - 1;
  const t = Math.max(0, Math.min(ttl, falta));
  const swr = Math.max(0, Math.min(ttl, falta - t));
  const sie = falta - t - swr >= 600 ? 600 : 0;
  const cc = t > 0 ? `public, max-age=${t}, s-maxage=${t}${swr ? `, stale-while-revalidate=${swr}` : ''}` : 'public, max-age=0, s-maxage=0, must-revalidate';
  const h: Record<string, string> = { 'cache-control': cc };
  if (borda && ligada) h[CABECALHO_BORDA] = t > 0 ? `max-age=${t}${swr ? `, stale-while-revalidate=${swr}` : ''}${sie ? `, stale-if-error=${sie}` : ''}` : 'no-store';
  return h;
}

interface Gravada {
  pesquisa: Pesquisa;
  atualizadaEm: number;
}

/** Formato de STATE_DIR/pesquisas.json. */
interface ArquivoPainel {
  v: 1;
  pesquisas: Gravada[];
  /** ids tirados do site pelo painel (os da semente continuam no arquivo da semente) */
  removidas: string[];
}

export interface DepsPesquisas {
  now: () => number;
  log: Pick<Logger, 'info' | 'aviso' | 'erro'>;
  /** DATA_DIR (onde está a semente `pesquisas.json`). */
  dataDir: string;
  /** STATE_DIR/pesquisas.json (null = só em memória). */
  store: JsonStore | null;
  /** Corridas do 2º turno (meta.json): números de urna e nomes. */
  races: () => Map<string, Race>;
  /** Simulação com nomes ocultos agora? (a área não aparece; cartões viram a capa genérica) */
  anonimizado?: () => boolean;
  /** `Cloudflare-CDN-Cache-Control` ligado (CDN_CC ≠ 0). Padrão: sim. */
  borda?: boolean;
  /** Imagens: cache LRU + fila serial (o mesmo serviço das outras imagens OG). Sem ele, gera a cada pedido. */
  servicoOg?: ServicoOg;
  /** Limite de imagens novas por cliente (OG_LIMITE_MIN): 0 = pode; senão segundos de espera (→ 429). */
  limitarRender?: (c: Ctx) => number;
  /** Domínio exibido nos cartões (PUBLIC_URL) ou null. */
  dominio?: string | null;
}

export class Pesquisas {
  private painel = new Map<string, Gravada>();
  private removidas = new Set<string>();
  private readonly arquivos: ArquivosJson;
  private sementeMemo: { versao: string; lista: Pesquisa[]; invalidas: { id?: string; erro: string }[]; lida: boolean } | null = null;
  private publicoMemo: { chave: string; corpo: PesquisasPublicas; texto: string; etag: string } | null = null;
  private versaoPainel = 0;
  /** mtime do arquivo do painel visto por último (para reler o que outra instância gravou). */
  private discoMtime = -1;
  private discoConferidoEm = 0;

  constructor(private readonly d: DepsPesquisas) {
    this.arquivos = new ArquivosJson(d.dataDir, d.now);
    this.carregarDoDisco(true);
  }

  // ---- validação -----------------------------------------------------------------------------------

  /** Números de urna da disputa (do meta.json). */
  candidatosDe = (cargo: CargoPesquisa): number[] | undefined => {
    const r = this.d.races().get(cargo);
    const nums = r?.candidatos.filter((c) => !c.agregado).map((c) => c.numero);
    return nums && nums.length === 2 ? nums : undefined;
  };

  private ctxValidacao(comHoje: boolean): ContextoValidacao {
    return { candidatos: this.candidatosDe, ...(comHoje ? { hoje: hojeBrasilia(this.d.now()) } : {}) };
  }

  // ---- disco (painel) ------------------------------------------------------------------------------

  private carregarDoDisco(inicial = false): void {
    const store = this.d.store;
    if (!store) return;
    try {
      this.discoMtime = statSync(store.caminho).mtimeMs;
    } catch {
      this.discoMtime = -1;
    }
    const bruto = store.ler() as Partial<ArquivoPainel> | null;
    if (!bruto || typeof bruto !== 'object') {
      if (!inicial) return;
      this.painel.clear();
      this.removidas.clear();
      return;
    }
    const painel = new Map<string, Gravada>();
    let recusadas = 0;
    for (const g of Array.isArray(bruto.pesquisas) ? bruto.pesquisas : []) {
      // gravadas antes: válidas no dia em que entraram (sem conferir "hoje")
      const r = validaPesquisa(g?.pesquisa, this.ctxValidacao(false));
      if ('ok' in r) painel.set(r.ok.id, { pesquisa: r.ok, atualizadaEm: Number(g.atualizadaEm) || 0 });
      else recusadas++;
    }
    this.painel = painel;
    this.removidas = new Set((Array.isArray(bruto.removidas) ? bruto.removidas : []).filter((x): x is string => typeof x === 'string' && x.length <= 64));
    this.versaoPainel++;
    if (recusadas) this.d.log.aviso(`Pesquisas: ${recusadas} gravada(s) no painel ficaram fora (não passam mais na validação)`);
  }

  /** Outra instância gravou o arquivo do painel? Relê (conferido no máximo a cada 5 s). */
  private sincronizar(): void {
    const store = this.d.store;
    if (!store) return;
    const t = this.d.now();
    if (t - this.discoConferidoEm < 5000) return;
    this.discoConferidoEm = t;
    let mtime = -1;
    try {
      mtime = statSync(store.caminho).mtimeMs;
    } catch {
      mtime = -1;
    }
    if (mtime === this.discoMtime) return;
    const texto = store.lerTexto();
    if (texto !== null && store.gravadoPorMim(texto)) {
      this.discoMtime = mtime;
      return;
    }
    this.carregarDoDisco();
  }

  private gravar(): void {
    this.versaoPainel++;
    this.publicoMemo = null;
    const v: ArquivoPainel = { v: 1, pesquisas: [...this.painel.values()], removidas: [...this.removidas] };
    this.d.store?.salvar(v);
  }

  async persistir(): Promise<void> {
    await this.d.store?.flush();
  }

  // ---- semente -------------------------------------------------------------------------------------

  /** Pesquisas válidas da semente (e as recusadas, com o motivo). */
  semente(): { versao: string; lista: Pesquisa[]; invalidas: { id?: string; erro: string }[]; lida: boolean } {
    const lido = this.arquivos.ler<unknown>(ARQUIVO_SEMENTE);
    // o dia entra na versão: a validação recusa divulgação "no futuro" pelo relógio de hoje
    const versao = `${lido?.versao ?? 'ausente'}|${hojeBrasilia(this.d.now())}`;
    if (this.sementeMemo?.versao === versao) return this.sementeMemo;
    const bruto = lido?.valor;
    const itens: unknown[] = Array.isArray(bruto) ? bruto : bruto && typeof bruto === 'object' && Array.isArray((bruto as { pesquisas?: unknown }).pesquisas) ? (bruto as { pesquisas: unknown[] }).pesquisas : [];
    const lista: Pesquisa[] = [];
    const invalidas: { id?: string; erro: string }[] = [];
    const ids = new Set<string>();
    const ctx = this.ctxValidacao(true);
    for (const it of itens) {
      const r = validaPesquisa(it, ctx);
      const idBruto = it && typeof it === 'object' && typeof (it as { id?: unknown }).id === 'string' ? String((it as { id: string }).id).slice(0, 64) : undefined;
      if (!('ok' in r)) {
        invalidas.push({ id: idBruto, erro: r.erro });
        continue;
      }
      if (ids.has(r.ok.id)) {
        invalidas.push({ id: r.ok.id, erro: 'id repetido na semente' });
        continue;
      }
      ids.add(r.ok.id);
      lista.push(r.ok);
    }
    if (lido && invalidas.length) this.d.log.aviso(`Pesquisas: ${invalidas.length} da semente ficaram fora do site (veja o painel → Pesquisas)`);
    this.sementeMemo = { versao, lista, invalidas, lida: !!lido };
    this.publicoMemo = null;
    return this.sementeMemo;
  }

  // ---- leitura -------------------------------------------------------------------------------------

  /** Lista publicada (semente + painel), sem considerar o dia da votação. */
  lista(): Pesquisa[] {
    this.sincronizar();
    const s = this.semente();
    return mesclarPesquisas(
      s.lista,
      [...this.painel.values()].map((g) => g.pesquisa),
      [...this.removidas],
    );
  }

  /** Pesquisa publicada pelo id (null se não existe ou foi removida). */
  porId(id: string): Pesquisa | null {
    return this.lista().find((p) => p.id === id) ?? null;
  }

  /** Corpo de `GET /api/pesquisas` (memorizado até a lista mudar). */
  publicas(agora: number = this.d.now()): { corpo: PesquisasPublicas; texto: string; etag: string } {
    if (diaDeVotacaoAntesDas17(agora)) {
      const corpo: PesquisasPublicas = { pesquisas: [], versao: 'dia-da-votacao', suspensas: true };
      const texto = JSON.stringify(corpo);
      return { corpo, texto, etag: etagFraco('pesq', 'votacao') };
    }
    // simulação com nomes ocultos: a área não aparece — e a API também não entrega os números (por número de urna real)
    if (this.d.anonimizado?.()) {
      const corpo: PesquisasPublicas = { pesquisas: [], versao: 'oculta' };
      return { corpo, texto: JSON.stringify(corpo), etag: etagFraco('pesq', 'oculta') };
    }
    this.sincronizar();
    const s = this.semente();
    const chave = `${s.versao}|${this.versaoPainel}`;
    if (this.publicoMemo?.chave === chave) return this.publicoMemo;
    const pesquisas = this.lista();
    const versao = hashCurto(JSON.stringify(pesquisas));
    const corpo: PesquisasPublicas = { pesquisas, versao };
    const texto = JSON.stringify(corpo);
    this.publicoMemo = { chave, corpo, texto, etag: etagFraco('pesq', versao) };
    return this.publicoMemo;
  }

  /** O que o painel vê. */
  paraAdmin(): PesquisasAdmin {
    this.sincronizar();
    const s = this.semente();
    const daSemente = new Map(s.lista.map((p) => [p.id, p]));
    const itens: PesquisaNoPainel[] = [];
    for (const g of this.painel.values()) {
      itens.push({ pesquisa: g.pesquisa, origem: 'painel', atualizadaEm: g.atualizadaEm, ...(daSemente.has(g.pesquisa.id) ? { sobrepoeSemente: true } : {}) });
    }
    for (const p of s.lista) {
      if (this.painel.has(p.id)) continue;
      itens.push({ pesquisa: p, origem: 'semente', ...(this.removidas.has(p.id) ? { removida: true } : {}) });
    }
    const ordem = new Map(ordenarPesquisas(itens.map((i) => i.pesquisa)).map((p, i) => [p.id, i]));
    itens.sort((a, b) => (ordem.get(a.pesquisa.id) ?? 0) - (ordem.get(b.pesquisa.id) ?? 0));
    const candidatos: PesquisasAdmin['candidatos'] = {};
    for (const cargo of CARGOS_PESQUISA) {
      const r = this.d.races().get(cargo);
      if (r) candidatos[cargo] = r.candidatos.filter((c) => !c.agregado).map((c) => ({ numero: c.numero, nome: c.nomeUrna, partido: c.partido }));
    }
    return { itens, semente: { lida: s.lida, total: s.lista.length, invalidas: s.invalidas }, candidatos, hoje: hojeBrasilia(this.d.now()) };
  }

  // ---- comandos do painel ----------------------------------------------------------------------------

  aplicar(cmd: ComandoPesquisa): { ok: true; log: string } | { ok: false; status: 400 | 404 | 409; erro: string; campo?: string } {
    this.sincronizar();
    const s = this.semente();
    const naSemente = (id: string) => s.lista.some((p) => p.id === id);
    if (cmd.acao === 'salvar') {
      const r = validaPesquisa(cmd.pesquisa, this.ctxValidacao(true));
      if (!('ok' in r)) return { ok: false, status: 400, erro: r.erro, campo: r.campo };
      const p = r.ok;
      const ant = cmd.idAnterior && cmd.idAnterior !== p.id ? cmd.idAnterior : null;
      // o mesmo registro em OUTRA pesquisa publicada (um registro do TSE = uma pesquisa)
      const outra = this.lista().find((x) => x.registro === p.registro && x.id !== p.id && x.id !== ant);
      if (outra) return { ok: false, status: 409, erro: `O registro ${p.registro} já está na pesquisa ${outra.instituto} (${outra.id}). Edite aquela.`, campo: 'registro' };
      if (!this.painel.has(p.id) && this.painel.size >= LIMITES_PESQUISA.maxPainel) return { ok: false, status: 409, erro: `O painel guarda no máximo ${LIMITES_PESQUISA.maxPainel} pesquisas.` };
      const nova = !this.painel.has(p.id) && !naSemente(p.id);
      if (ant) {
        this.painel.delete(ant);
        if (naSemente(ant)) this.removidas.add(ant);
      }
      this.removidas.delete(p.id);
      this.painel.set(p.id, { pesquisa: p, atualizadaEm: this.d.now() });
      this.gravar();
      return { ok: true, log: `${nova ? 'incluída' : 'atualizada'} ${p.instituto} ${p.registro} (${p.cargo})` };
    }
    if (cmd.acao === 'remover') {
      const noPainel = this.painel.get(cmd.id);
      if (!noPainel && !naSemente(cmd.id)) return { ok: false, status: 404, erro: 'Pesquisa não encontrada.' };
      this.painel.delete(cmd.id);
      if (naSemente(cmd.id)) this.removidas.add(cmd.id);
      this.gravar();
      return { ok: true, log: `removida do site ${cmd.id}` };
    }
    // restaurar: volta a da semente (desfaz remoção e descarta a edição do painel)
    if (!naSemente(cmd.id)) return { ok: false, status: 404, erro: 'Só dá para restaurar uma pesquisa do arquivo semente.' };
    if (!this.removidas.has(cmd.id) && !this.painel.has(cmd.id)) return { ok: false, status: 409, erro: 'Esta pesquisa já está como no arquivo semente.' };
    this.removidas.delete(cmd.id);
    this.painel.delete(cmd.id);
    this.gravar();
    return { ok: true, log: `restaurada da semente ${cmd.id}` };
  }

  // ---- cartões ---------------------------------------------------------------------------------------

  /** Os dois candidatos da disputa (nome de urna, partido, número, cor dos dados). */
  candidatosCartao(cargo: string): CandidatoCartao[] {
    const r = this.d.races().get(cargo);
    return (r?.candidatos ?? []).filter((c) => !c.agregado).map((c) => ({ numero: c.numero, nome: c.nomeUrna, partido: c.partido, cor: c.cor }));
  }
}

const erroJson = (c: Ctx, status: number, erro: string, extra: Record<string, unknown> = {}) =>
  c.json({ ok: false, erro, ...extra }, status as 400, { 'cache-control': 'no-store' });

/** JSON do painel (415/400 com mensagem). */
async function jsonAdmin(c: Ctx): Promise<unknown | Response> {
  const ct = c.req.header('content-type') ?? '';
  if (!/^application\/json\b/i.test(ct)) return c.json({ erro: 'Envie o corpo como application/json.' }, 415);
  try {
    return await c.req.json();
  } catch {
    return c.json({ erro: 'JSON inválido no corpo da requisição.' }, 400);
  }
}

/** `?formato=` dos cartões: og (padrão), x, feed ou story. */
function formatoPesquisa(v: string | undefined): FormatoOg {
  if (v === undefined || v === '') return 'og';
  if ((FORMATOS_OG as readonly string[]).includes(v)) return v as FormatoOg;
  throw new ErroValidacao('Parâmetro formato: og, x, feed ou story.');
}

export function registrarPesquisas(app: App, admin: App, d: DepsPesquisas): Pesquisas {
  const pesquisas = new Pesquisas(d);
  const borda = d.borda !== false;

  // ---- pública ---------------------------------------------------------------------------------------
  app.get(ROTA_PESQUISAS, (c) => {
    const agora = d.now();
    const { texto, etag } = pesquisas.publicas(agora);
    const headers: Record<string, string> = {
      ...cabecalhosAteVirada(agora, TTL_PESQUISAS_S, borda),
      etag,
      vary: 'Accept-Encoding',
      'x-robots-tag': 'noindex',
    };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    const h = { ...headers, 'content-type': 'application/json; charset=utf-8' };
    return c.req.method === 'HEAD' ? c.body(null, 200, h) : c.body(texto, 200, h);
  });

  // ---- cartões (OG) -----------------------------------------------------------------------------------
  // No dia da votação, o middleware de og-rotas.ts (OG_COM_CANDIDATO) responde antes o convite genérico; a conferência
  // aqui é a rede de segurança caso a rota saia daquela lista.
  app.get(ROTA_OG_PESQUISA, async (c) => {
    const agora = d.now();
    const formato = formatoPesquisa(c.req.query('formato'));
    const idQ = c.req.query('id');
    if (idQ !== undefined && !/^[a-z0-9][a-z0-9-]{2,63}$/.test(idQ)) throw new ErroValidacao('Parâmetro id inválido.');
    // pesquisa desconhecida, removida, dia da votação ou nomes ocultos → a capa genérica (sem número nem nome)
    const p = idQ && !diaDeVotacaoAntesDas17(agora) && !d.anonimizado?.() ? pesquisas.porId(idQ) : null;
    const versao = p ? hashCurto(JSON.stringify(p)) : 'capa-v1';
    const chave = `pesq|${p ? p.id : 'capa'}|${formato}`;
    const { w, h: alt } = DIM_OG[formato];
    const montar = async () => {
      const t0 = performance.now();
      const no = p ? layoutPesquisa({ pesquisa: p, candidatos: pesquisas.candidatosCartao(p.cargo), formato, dominio: d.dominio }) : layoutCapaPesquisas(formato, d.dominio);
      const png = await renderPng(no, w, alt);
      d.log.info(`OG ${chave} gerada em ${Math.round(performance.now() - t0)} ms (${Math.round(png.length / 1024)} KB)`);
      return { png, sub: `${versao}|estatico` };
    };
    let s: OgServida;
    if (d.servicoOg) {
      const pd = { chave, sub: `${versao}|estatico`, ttlMs: Infinity, staleMs: 0, montar };
      if (d.limitarRender && !d.servicoOg.servivel(pd)) {
        const espera = d.limitarRender(c);
        if (espera > 0) throw new LimiteOgExcedido(espera);
      }
      s = await d.servicoOg.obter(pd);
    } else {
      const r = await montar();
      s = { png: r.png, sub: r.sub, em: agora, headers: {}, hit: false };
    }
    const etag = etagFraco('ogp', hashCurto(chave), hashCurto(s.sub));
    // a imagem da pesquisa não muda (outra versão = outro `v=`), mas o cache nunca atravessa a 0h de 25/10
    const headers: Record<string, string> = {
      'content-type': 'image/png',
      ...cabecalhosAteVirada(agora, p ? TTL_OG_PESQUISA_S : 3600, borda),
      etag,
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
      'content-disposition': `inline; filename="sintonia-pesquisa-${p ? p.id : 'capa'}-${formato}.png"`,
    };
    if (casaEtag(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
    if (c.req.method === 'HEAD') return c.body(null, 200, headers);
    return c.body(new Uint8Array(s.png.buffer as ArrayBuffer, s.png.byteOffset, s.png.byteLength), 200, headers);
  });

  // ---- painel ------------------------------------------------------------------------------------------
  admin.get('/pesquisas', (c) => c.json(pesquisas.paraAdmin(), 200, { 'cache-control': 'no-store' }));
  admin.post('/pesquisas', async (c) => {
    const b = await jsonAdmin(c);
    if (b instanceof Response) return b;
    const cmd = parseComandoPesquisa(b) as ComandoPesquisa;
    const r = pesquisas.aplicar(cmd);
    if (!r.ok) return erroJson(c, r.status, r.erro, r.campo ? { campo: r.campo } : {});
    d.log.info(`Admin: pesquisas — ${r.log}`);
    return c.json(pesquisas.paraAdmin(), 200, { 'cache-control': 'no-store' });
  });

  return pesquisas;
}
