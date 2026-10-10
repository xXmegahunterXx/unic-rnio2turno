/**
 * AdminState: padrão por modo, relógio, (de)serialização e validação de estados persistidos/recebidos.
 */
import { INICIO_APURACAO } from '../shared/constants';
import type { AdminState, Aviso, ClockState, FonteDados, Patrocinio, ScenarioConfig, TseConfig } from '../shared/types';
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

/** Limites do patrocínio (o status, com o patrocínio, é consultado a cada poucos segundos por todos). */
export const PATROCINIO_LIMITES = {
  marca: 60,
  texto: 160,
  url: 500,
  /** data URI da logo: ~45 KB de imagem. Prefira uma URL https (não pesa no status). */
  imagemDataUri: 60_000,
};

const RE_DATA_URI = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

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
 * contrato, textos aparados) ou a mensagem de erro. Regras: `marca` (1–60) e `texto` (1–160) obrigatórios; `url`
 * https válida (sem usuário/senha); `imagem` opcional: data URI de imagem (png, jpeg, webp, gif ou svg, base64,
 * até 60 mil caracteres) ou URL https.
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
        return { erro: `Patrocínio: a imagem em data URI passa de ${L.imagemDataUri} caracteres (use uma URL https).` };
      if (!RE_DATA_URI.test(img)) return { erro: 'Patrocínio: "imagem" deve ser data:image/(png|jpeg|webp|gif|svg+xml);base64,…' };
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
    try {
      cenario = normalizaCenario({ ...fallback.cenario, ...(v.cenario as Partial<ScenarioConfig>) } as ScenarioConfig, st);
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
    patrocinio: parsePatrocinioSalvo(v.patrocinio, fallback.patrocinio ?? null),
  };
}

/** Patrocínio de um estado restaurado: null remove; ausente → fallback; inválido → null (nunca lança). */
function parsePatrocinioSalvo(v: unknown, fallback: Patrocinio | null): Patrocinio | null {
  if (v === undefined) return fallback;
  if (v === null) return null;
  const r = validaPatrocinio(v);
  return 'ok' in r ? r.ok : null;
}
