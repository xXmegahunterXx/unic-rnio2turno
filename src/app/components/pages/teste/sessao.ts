/**
 * Progresso do Teste Cego guardado SÓ na aba (sessionStorage): some quando a aba fecha.
 * Nada aqui é enviado a servidor (LGPD). Todo acesso é protegido (modo privado, armazenamento bloqueado).
 */
import { ehEscolha, N_RODADAS, type Escolha } from './codigo';

export type Parcial = (Escolha | null)[];

export interface Progresso {
  seed: number;
  respostas: Parcial;
  idx: number;
}

const CHAVE_TESTE = 'sintonia:teste:progresso';
const prefixoDuelo = 'sintonia:duelo:';

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

export const vazio = (): Parcial => Array.from({ length: N_RODADAS }, () => null);

function normalizar(v: unknown): Progresso | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<Progresso>;
  if (typeof o.seed !== 'number' || !Array.isArray(o.respostas) || o.respostas.length !== N_RODADAS) return null;
  const respostas = o.respostas.map((r) => (ehEscolha(r) ? r : null));
  const idx = typeof o.idx === 'number' ? Math.max(0, Math.min(N_RODADAS - 1, Math.floor(o.idx))) : 0;
  return { seed: o.seed, respostas, idx };
}

/** Progresso do teste em andamento (opcionalmente só se for da semente dada). */
export function lerProgresso(seed?: number): Progresso | null {
  const p = normalizar(ler(CHAVE_TESTE));
  if (!p) return null;
  return seed === undefined || p.seed === seed ? p : null;
}
export const gravarProgresso = (p: Progresso) => gravar(CHAVE_TESTE, p);
export const apagarProgresso = () => apagar(CHAVE_TESTE);

/** Respondidas (quantas rodadas têm resposta). */
export const respondidas = (r: Parcial) => r.filter((x) => x !== null).length;

/** Respostas de quem recebeu o desafio, por código do desafio (inclui as escolhas de quem desafiou). */
export function lerDuelo(chave: string): Progresso | null {
  return normalizar(ler(prefixoDuelo + chave));
}
export const gravarDuelo = (chave: string, p: Progresso) => gravar(prefixoDuelo + chave, p);
export const apagarDuelo = (chave: string) => apagar(prefixoDuelo + chave);
