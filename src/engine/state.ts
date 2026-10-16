/**
 * AdminState: padrão por modo, relógio, (de)serialização e validação de estados persistidos/recebidos.
 */
import { INICIO_APURACAO } from '../shared/constants';
import {
  ANUNCIO_LIMITES,
  validaAnuncio,
  validaContatoAnuncie,
  type AnuncioConfig,
  type ContatoAnuncie,
} from '../shared/anuncios';
import type { AdminState, Aviso, ClockState, FonteDados, Patrocinio, ScenarioConfig, TrocaAutoEstado, TseConfig } from '../shared/types';
import { emailProvisorio, validaContatosPublicos, type ContatosPublicos } from '../shared/contatos';
import { normalizaCenario } from './scenario';
import type { Structure } from './structure';

/** 16:59:30 de 25/10/2026 (Brasília): 30 s antes do início da divulgação. */
export const INICIO_SIMULACAO = INICIO_APURACAO - 30_000;
export const VELOCIDADE_DEMO = 20;
export const FONTES: FonteDados[] = ['pre', 'simulacao', 'tse'];

/** simNow = ancoraSim + (rodando ? (wallNow − ancoraWall) × velocidade : 0) */
export function simNowDe(c: ClockState, wall: number): number {
  return c.ancoraSim + (c.rodando ? (wall - c.ancoraWall) * c.velocidade : 0);
}

/** Config do feed do TSE a partir das corridas do dataset. */
export function tsePadrao(st: Structure): TseConfig {
  const pres = st.races.find((r) => r.kind === 'pres' && r.turno === 2)?.race.tse;
  const gov = st.races.find((r) => r.kind === 'gov' && r.turno === 2)?.race.tse;
  return {
    baseUrl: 'https://resultados.tse.jus.br/oficial',
    ciclo: pres?.ciclo ?? 'ele2026',
    eleicaoPres: pres?.eleicao ?? '6258',
    eleicaoGov: gov?.eleicao ?? '6260',
    pleito: pres?.pleito ?? '3221',
    intervaloSeg: 15,
    intervaloPrioritarioSeg: 5,
  };
}

/**
 * Estado padrão:
 *  - servidor: fonte 'pre' (as telas mostram o 1º turno real); relógio em tempo real (velocidade 1), de modo
 *    que, se o admin trocar para 'simulacao' sem iniciar, a simulação acompanha o horário real;
 *  - demo: fonte 'simulacao', relógio rodando a 20× a partir de 16:59:30 de 25/10.
 */
export function estadoPadrao(modo: 'servidor' | 'demo', wall: number, cenario: ScenarioConfig, st: Structure): AdminState {
  const relogio: ClockState =
    modo === 'demo'
      ? { rodando: true, velocidade: VELOCIDADE_DEMO, ancoraWall: wall, ancoraSim: INICIO_SIMULACAO }
      : { rodando: true, velocidade: 1, ancoraWall: wall, ancoraSim: wall };
  return {
    fonte: modo === 'demo' ? 'simulacao' : 'pre',
    relogio,
    cenario,
    aviso: null,
    congelado: false,
    congeladoEm: null,
    versao: 1,
    tse: tsePadrao(st),
    nomesReais: false,
    patrocinio: null,
    anuncios: [],
    anuncie: null,
    contatos: null,
    trocaAuto: trocaAutoPadrao(),
  };
}

/** Troca automática 'pre' → 'tse': ligada, no horário padrão do servidor, ainda não feita. */
export const trocaAutoPadrao = (): TrocaAutoEstado => ({ ligada: true, adiadaPara: null, feitaEm: null });

/** Faixa aceita para horários da troca automática (epoch ms): 2020–2040 (protege contra lixo no estado salvo). */
export const TROCA_AUTO_MIN = Date.UTC(2020, 0, 1);
export const TROCA_AUTO_MAX = Date.UTC(2040, 0, 1);

const instanteValido = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= TROCA_AUTO_MIN && v <= TROCA_AUTO_MAX ? Math.floor(v) : null;

/** Troca automática de um estado restaurado (ausente/inválida → padrão; nunca lança). */
export function parseTrocaAuto(v: unknown, fallback: TrocaAutoEstado = trocaAutoPadrao()): TrocaAutoEstado {
  if (!isObj(v)) return { ...fallback };
  return {
    ligada: typeof v.ligada === 'boolean' ? v.ligada : fallback.ligada,
    adiadaPara: v.adiadaPara === null ? null : (instanteValido(v.adiadaPara) ?? fallback.adiadaPara),
    feitaEm: v.feitaEm === null ? null : (instanteValido(v.feitaEm) ?? fallback.feitaEm),
  };
}

export function serializeAdminState(s: AdminState): string {
  return JSON.stringify(s);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finito = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);

export function parseAviso(v: unknown): Aviso | null {
  if (!isObj(v)) return null;
  const texto = typeof v.texto === 'string' ? v.texto.trim().slice(0, 280) : '';
  if (!texto) return null;
  return { nivel: v.nivel === 'alerta' ? 'alerta' : 'info', texto };
}

/**
 * Limites do patrocínio — os MESMOS da validação zod do servidor (src/server/validation.ts), que é a porta de
 * entrada do comando em produção: um valor aceito lá nunca pode ser recusado aqui (e vice-versa).
 */
export const PATROCINIO_LIMITES = {
  marca: 60,
  texto: 140,
  url: 500,
  /**
   * data URI da logo: até 150 KB de imagem (base64 ≈ 4/3 + cabeçalho). No servidor, o /api/status troca o data URI
   * por uma URL com hash (não pesa no status); no demo ele vai no status. Prefira uma URL https.
   */
  imagemDataUri: Math.ceil((150 * 1024 * 4) / 3) + 64,
};

/** Imagem estática (GIF não: o slot é discreto, sem animação — mesma regra do servidor). */
const RE_DATA_URI = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

function urlHttps(v: string): boolean {
  if (v.length > PATROCINIO_LIMITES.url || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * Valida um patrocínio (comando 'patrocinio' e estado restaurado). Retorna o objeto normalizado (só os campos do
 * contrato, textos aparados) ou a mensagem de erro. Regras: `marca` (1–60) e `texto` (1–140) obrigatórios; `url`
 * https válida (sem usuário/senha); `imagem` opcional: data URI de imagem (png, jpeg, webp ou svg, base64,
 * até ~150 KB de imagem) ou URL https.
 */
export function validaPatrocinio(v: unknown): { ok: Patrocinio } | { erro: string } {
  if (!isObj(v)) return { erro: 'Patrocínio inválido: informe { marca, texto, url, imagem? } ou null para remover.' };
  const L = PATROCINIO_LIMITES;
  const marca = typeof v.marca === 'string' ? v.marca.trim() : '';
  const texto = typeof v.texto === 'string' ? v.texto.trim() : '';
  const url = typeof v.url === 'string' ? v.url.trim() : '';
  if (!marca || marca.length > L.marca) return { erro: `Patrocínio: "marca" é obrigatória (até ${L.marca} caracteres).` };
  if (!texto || texto.length > L.texto) return { erro: `Patrocínio: "texto" é obrigatório (até ${L.texto} caracteres).` };
  if (!urlHttps(url)) return { erro: 'Patrocínio: "url" precisa ser um endereço https:// válido.' };
  const out: Patrocinio = { marca, texto, url };
  if (v.imagem !== undefined && v.imagem !== null && v.imagem !== '') {
    const img = typeof v.imagem === 'string' ? v.imagem.trim() : '';
    if (img.startsWith('data:')) {
      if (img.length > L.imagemDataUri)
        return { erro: 'Patrocínio: a imagem em data URI passa de 150 KB (use uma imagem menor ou uma URL https).' };
      if (!RE_DATA_URI.test(img)) return { erro: 'Patrocínio: "imagem" deve ser data:image/(png|jpeg|webp|svg+xml);base64,…' };
    } else if (!urlHttps(img)) return { erro: 'Patrocínio: "imagem" deve ser uma URL https:// ou um data URI de imagem.' };
    out.imagem = img;
  }
  return { ok: out };
}

/**
 * Restaura um AdminState de JSON (string ou objeto), completando/corrigindo campos com `fallback`.
 * Nunca lança por conteúdo inválido: campos ruins voltam ao fallback (cenário inválido → cenário do fallback).
 */
export function parseAdminState(raw: unknown, fallback: AdminState, st: Structure): AdminState {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  if (!isObj(v)) return fallback;
  const r = isObj(v.relogio) ? v.relogio : {};
  // mesma faixa que o comando `velocidade` aceita (0 < v ≤ 10000): ida e volta sem alterar o relógio
  const vel = finito(r.velocidade, fallback.relogio.velocidade);
  const relogio: ClockState = {
    rodando: typeof r.rodando === 'boolean' ? r.rodando : fallback.relogio.rodando,
    velocidade: vel > 0 ? Math.min(10000, vel) : fallback.relogio.velocidade,
    ancoraWall: finito(r.ancoraWall, fallback.relogio.ancoraWall),
    ancoraSim: finito(r.ancoraSim, fallback.relogio.ancoraSim),
  };
  let cenario = fallback.cenario;
  if (isObj(v.cenario)) {
    const bruto = { ...(v.cenario as Partial<ScenarioConfig>) };
    // Corrida de governador que saiu do quadro do 2º turno (ex.: gov-rj, retotalização do TSE de 10/10/2026) num
    // estado salvo antes da mudança: descarta só essa chave, sem perder o resto do cenário do admin.
    if (isObj(bruto.alvoGov)) {
      const govs = new Set(st.govRaces.map((g) => g.id));
      bruto.alvoGov = Object.fromEntries(Object.entries(bruto.alvoGov).filter(([k]) => govs.has(k)));
    }
    try {
      cenario = normalizaCenario({ ...fallback.cenario, ...bruto } as ScenarioConfig, st);
    } catch {
      cenario = fallback.cenario;
    }
  }
  const t = isObj(v.tse) ? v.tse : {};
  const str = (x: unknown, fb: string) => (typeof x === 'string' && x.trim() ? x.trim() : fb);
  const tse: TseConfig = {
    baseUrl: str(t.baseUrl, fallback.tse.baseUrl),
    ciclo: str(t.ciclo, fallback.tse.ciclo),
    eleicaoPres: str(t.eleicaoPres, fallback.tse.eleicaoPres),
    eleicaoGov: str(t.eleicaoGov, fallback.tse.eleicaoGov),
    pleito: str(t.pleito, fallback.tse.pleito),
    intervaloSeg: Math.min(600, Math.max(5, finito(t.intervaloSeg, fallback.tse.intervaloSeg))),
    intervaloPrioritarioSeg: Math.min(600, Math.max(3, finito(t.intervaloPrioritarioSeg, fallback.tse.intervaloPrioritarioSeg ?? 5))),
  };
  const congelado = typeof v.congelado === 'boolean' ? v.congelado : fallback.congelado;
  return {
    fonte: FONTES.includes(v.fonte as FonteDados) ? (v.fonte as FonteDados) : fallback.fonte,
    relogio,
    cenario,
    aviso: v.aviso === null ? null : v.aviso === undefined ? fallback.aviso : parseAviso(v.aviso),
    congelado,
    congeladoEm: congelado ? finito(v.congeladoEm, simNowDe(relogio, relogio.ancoraWall)) : null,
    versao: Math.max(0, Math.floor(finito(v.versao, fallback.versao))),
    tse,
    nomesReais: typeof v.nomesReais === 'boolean' ? v.nomesReais : (fallback.nomesReais ?? false),
    // LEGADO: o patrocínio único vira um anúncio (migrado uma vez; ver `migraPatrocinio`) e o campo fica null
    patrocinio: null,
    anuncios: migraPatrocinio(parseAnunciosSalvos(v.anuncios, fallback.anuncios ?? []), parsePatrocinioSalvo(v.patrocinio, fallback.patrocinio ?? null)),
    anuncie: parseContatoSalvo(v.anuncie, fallback.anuncie ?? null),
    contatos: parseContatosSalvos(v.contatos, fallback.contatos ?? null),
    trocaAuto: parseTrocaAuto(v.trocaAuto, fallback.trocaAuto ?? trocaAutoPadrao()),
  };
}

/** Patrocínio de um estado restaurado: null remove; ausente → fallback; inválido → null (nunca lança). */
function parsePatrocinioSalvo(v: unknown, fallback: Patrocinio | null): Patrocinio | null {
  if (v === undefined) return fallback;
  if (v === null) return null;
  const r = validaPatrocinio(v);
  return 'ok' in r ? r.ok : null;
}

// ---------------------------------------------------------------------------------------------
// Anúncios (src/shared/anuncios.ts)
// ---------------------------------------------------------------------------------------------

/** Id do anúncio que o comando legado 'patrocinio' cria/atualiza (e a migração de estados antigos). */
export const ID_PATROCINIO = 'patrocinio';

/** Imagem guardada no estado: só data URI (a URL do servidor é resolvida antes de chegar ao motor). */
const ehDataUri = (v: string | undefined): v is string => typeof v === 'string' && v.startsWith('data:');

/**
 * Anúncio validado para guardar no estado: só os campos do contrato e imagens em data URI. Uma imagem que veio como
 * URL do próprio servidor (`/api/anuncio/img?h=…`, ida e volta pelo admin) e que o servidor não trocou pelo conteúdo
 * mantém a imagem que o anúncio de mesmo id já tem; sem anterior, fica sem imagem.
 */
export function normalizaAnuncio(
  v: unknown,
  anterior?: AnuncioConfig | null,
  /** nomes de candidatos do dataset (anúncio que os cite é recusado — src/shared/anuncios-politica.ts) */
  nomesCandidatos?: readonly string[],
): { ok: AnuncioConfig } | { erro: string } {
  const r = validaAnuncio(v, { nomesCandidatos });
  if ('erro' in r) return r;
  const a = { ...r.ok };
  for (const campo of ['logo', 'imagem'] as const) {
    const x = a[campo];
    if (x === undefined || ehDataUri(x)) continue;
    const antes = anterior?.[campo];
    if (ehDataUri(antes)) a[campo] = antes;
    else delete a[campo];
  }
  return { ok: a };
}

/** Anúncios de um estado restaurado: inválidos e ids repetidos saem; no máximo `ANUNCIO_LIMITES.maxAnuncios` (nunca lança). */
export function parseAnunciosSalvos(v: unknown, fallback: AnuncioConfig[]): AnuncioConfig[] {
  if (v === undefined) return fallback.map((a) => ({ ...a, formatos: [...a.formatos] }));
  if (!Array.isArray(v)) return [];
  const out: AnuncioConfig[] = [];
  const ids = new Set<string>();
  for (const x of v) {
    if (out.length >= ANUNCIO_LIMITES.maxAnuncios) break;
    const r = normalizaAnuncio(x);
    if (!('ok' in r) || ids.has(r.ok.id)) continue;
    ids.add(r.ok.id);
    out.push(r.ok);
  }
  return out;
}

/** Contato da página /anuncie de um estado restaurado (inválido/vazio → null; ausente → fallback). */
function parseContatoSalvo(v: unknown, fallback: ContatoAnuncie | null): ContatoAnuncie | null {
  if (v === undefined) return fallback ? { ...fallback } : null;
  if (v === null) return null;
  // e-mail provisório salvo por uma versão antiga (domínio reservado): sai só ele, o resto do contato fica
  const salvo = v && typeof v === 'object' && typeof (v as ContatoAnuncie).email === 'string' && emailProvisorio((v as ContatoAnuncie).email!) ? { ...(v as object), email: undefined } : v;
  const r = validaContatoAnuncie(salvo);
  return 'ok' in r && Object.keys(r.ok).length ? r.ok : null;
}

/** Contatos públicos de um estado restaurado (inválido/vazio → null; ausente → fallback). */
function parseContatosSalvos(v: unknown, fallback: ContatosPublicos | null): ContatosPublicos | null {
  if (v === undefined) return fallback ? { ...fallback } : null;
  if (v === null) return null;
  const r = validaContatosPublicos(v);
  return 'ok' in r && Object.keys(r.ok).length ? r.ok : null;
}

/** Corta em `max` caracteres com reticências, sem deixar espaço antes delas. */
const cortarTexto = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`);

/**
 * LEGADO: o patrocínio único (comando 'patrocinio' e estados salvos antes dos anúncios) como anúncio id 'patrocinio':
 * cota master, formatos topo + nativo + tv, título = texto cortado em 60, botão "Saiba mais". Logo só em data URI (a
 * logo por URL externa não é aceita nos anúncios: o site não carrega imagem de terceiros). Mantém o peso do anterior.
 */
export function anuncioDoPatrocinio(p: Patrocinio, anterior?: AnuncioConfig | null, nomesCandidatos?: readonly string[]): { ok: AnuncioConfig } | { erro: string } {
  return normalizaAnuncio({
    id: ID_PATROCINIO,
    marca: cortarTexto(p.marca.trim(), ANUNCIO_LIMITES.marca),
    titulo: cortarTexto(p.texto.trim(), ANUNCIO_LIMITES.titulo),
    texto: cortarTexto(p.texto.trim(), ANUNCIO_LIMITES.texto),
    cta: 'Saiba mais',
    url: p.url,
    ...(ehDataUri(p.imagem) ? { logo: p.imagem } : {}),
    formatos: ['topo', 'nativo', 'tv'],
    peso: anterior?.peso ?? 5,
    cota: 'master',
    ativo: true,
    inicio: null,
    fim: null,
    naoPolitico: true,
  }, null, nomesCandidatos);
}

/**
 * Migração (uma vez) de um estado salvo com o patrocínio antigo: vira o anúncio 'patrocinio', se ainda não houver um
 * com esse id e couber na lista. Depois disso o estado guarda `patrocinio: null` e a migração não se repete.
 */
function migraPatrocinio(anuncios: AnuncioConfig[], p: Patrocinio | null): AnuncioConfig[] {
  if (!p || anuncios.some((a) => a.id === ID_PATROCINIO) || anuncios.length >= ANUNCIO_LIMITES.maxAnuncios) return anuncios;
  const r = anuncioDoPatrocinio(p);
  return 'ok' in r ? [r.ok, ...anuncios] : anuncios;
}
