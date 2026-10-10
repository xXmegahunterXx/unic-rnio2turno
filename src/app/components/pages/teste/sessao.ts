/**
 * Progresso do Teste Cego guardado SÓ na aba (sessionStorage): some quando a aba fecha.
 * Nada aqui é enviado a servidor (LGPD). Todo acesso é protegido (modo privado, armazenamento bloqueado).
 * Chaves com "v2": o progresso do formato antigo (pares) é simplesmente ignorado.
 */
import { AFIRMACAO_POR_ID, AFIRMACOES, ehResposta, type Resposta } from '@/app/content/afirmacoes';

export type MapaRespostas = Partial<Record<string, Resposta>>;

export interface Progresso {
  seed: number;
  respostas: MapaRespostas;
  /** Ids marcados como "Isso pesa mais para mim" (só valem para respostas na escala). */
  importantes: string[];
  /** Posição atual na ordem embaralhada. */
  idx: number;
  /** Modo rápido (12 afirmações, uma por tema — ver `selecaoRapida`). */
  rapido?: boolean;
}

const CHAVE_TESTE = 'sintonia:teste:v2:progresso';
const prefixoDuelo = 'sintonia:duelo:v2:';
export const TOTAL = AFIRMACOES.length;

function ler(chave: string): unknown {
  try {
    const v = sessionStorage.getItem(chave);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: unknown) {
  try {
    sessionStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: segue só em memória */
  }
}
function apagar(chave: string) {
  try {
    sessionStorage.removeItem(chave);
  } catch {
    /* nada */
  }
}

function normalizar(v: unknown): Progresso | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<Progresso>;
  if (typeof o.seed !== 'number' || !Number.isFinite(o.seed) || !o.respostas || typeof o.respostas !== 'object') return null;
  const respostas: MapaRespostas = {};
  for (const [id, r] of Object.entries(o.respostas)) if (AFIRMACAO_POR_ID[id] && ehResposta(r)) respostas[id] = r;
  const importantes = Array.isArray(o.importantes)
    ? o.importantes.filter((id): id is string => typeof id === 'string' && !!AFIRMACAO_POR_ID[id] && typeof respostas[id] === 'number')
    : [];
  const idx = typeof o.idx === 'number' ? Math.max(0, Math.min(TOTAL - 1, Math.floor(o.idx))) : 0;
  return { seed: o.seed, respostas, importantes, idx, ...(o.rapido === true ? { rapido: true } : {}) };
}

/** Progresso do teste em andamento (opcionalmente só se for da semente dada). */
export function lerProgresso(seed?: number): Progresso | null {
  const p = normalizar(ler(CHAVE_TESTE));
  if (!p) return null;
  return seed === undefined || p.seed === seed ? p : null;
}
export const gravarProgresso = (p: Progresso) => gravar(CHAVE_TESTE, p);
export const apagarProgresso = () => apagar(CHAVE_TESTE);

/** Quantas afirmações já têm resposta (inclui "Pular"). Com `ids`, só entre elas (modo rápido). */
export const concluidas = (r: MapaRespostas, ids?: readonly string[]) =>
  ids ? ids.reduce((n, id) => n + (r[id] !== undefined ? 1 : 0), 0) : AFIRMACOES.reduce((n, a) => n + (r[a.id] !== undefined ? 1 : 0), 0);
export const completo = (r: MapaRespostas, ids?: readonly string[]) => concluidas(r, ids) === (ids ? ids.length : TOTAL);

/** Respostas de quem recebeu o desafio, por código do desafio (inclui as respostas de quem desafiou). */
export function lerDuelo(chave: string): Progresso | null {
  return normalizar(ler(prefixoDuelo + chave));
}
export const gravarDuelo = (chave: string, p: Progresso) => gravar(prefixoDuelo + chave, p);
export const apagarDuelo = (chave: string) => apagar(prefixoDuelo + chave);
