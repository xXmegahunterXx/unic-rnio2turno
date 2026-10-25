/**
 * Contexto histórico: resultado OFICIAL do 2º turno de 2022 para Presidente (TSE, dados abertos), por UF, no exterior
 * (ZZ) e no Brasil. Arquivo estático em public/data/historico/presidente-2022-t2.json, baixado só quando a página o
 * mostra e guardado no cache do React Query (staleTime infinito).
 *
 * Os % saem dos votos pela regra única de calc.ts (`pctValidos`), não do campo `pct` do arquivo. Qualquer problema no
 * arquivo (faltando, malformado, UF ausente) vira `null`: o bloco simplesmente não aparece.
 */
import type { UF } from '@/shared/types';
import { pctValidos } from '@/shared/calc';
import { useDadoEstatico } from '@/app/data/estatico';

export const CAMINHO_HISTORICO_2022 = 'data/historico/presidente-2022-t2.json';

interface VotoArquivo {
  votos: number;
  pct?: number;
}

/** Formato do arquivo (chaves dos candidatos = número na urna). */
export interface Historico2022Arquivo {
  fonte?: string;
  eleicao?: string;
  candidatos: Record<string, { nome: string; partido: string }>;
  porUf: Partial<Record<UF, Record<string, VotoArquivo>>>;
  brasil: Record<string, VotoArquivo>;
}

export interface LinhaHistorico {
  numero: number;
  nome: string;
  partido: string;
  votos: number;
  /** % dos votos válidos (0–100), por calc.ts. */
  pct: number;
}

export interface Historico2022 {
  /** Ordem pelo número na urna (13 antes de 22). */
  linhas: LinhaHistorico[];
  validos: number;
}

const votoOk = (v: unknown): v is VotoArquivo =>
  !!v && typeof v === 'object' && Number.isFinite((v as VotoArquivo).votos) && (v as VotoArquivo).votos >= 0;

/**
 * Linhas do 2º turno de 2022 numa abrangência ('BR' = Brasil com o exterior), ordenadas pelo número na urna.
 * null quando o arquivo não tem a abrangência ou está malformado.
 */
export function historico2022De(d: Historico2022Arquivo | undefined | null, abrangencia: UF | 'BR'): Historico2022 | null {
  if (!d || typeof d !== 'object' || !d.candidatos || typeof d.candidatos !== 'object') return null;
  const local = abrangencia === 'BR' ? d.brasil : d.porUf?.[abrangencia];
  if (!local || typeof local !== 'object') return null;
  const numeros = Object.keys(d.candidatos)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
  if (numeros.length !== 2) return null;
  const base = numeros.map((n) => {
    const c = d.candidatos[String(n)];
    const v = local[String(n)];
    return c && typeof c.nome === 'string' && typeof c.partido === 'string' && votoOk(v)
      ? { numero: n, nome: c.nome, partido: c.partido, votos: v.votos }
      : null;
  });
  if (base.some((x) => x === null)) return null;
  const ok = base as Omit<LinhaHistorico, 'pct'>[];
  const votos = ok.map((x) => x.votos);
  const validos = votos.reduce((a, b) => a + b, 0);
  if (validos <= 0) return null;
  return { linhas: ok.map((x, i) => ({ ...x, pct: pctValidos({ votos }, i) })), validos };
}

/** Baixa o arquivo (uma vez por sessão; null = desligado). */
export const useHistorico2022Arquivo = (ativo: boolean) => useDadoEstatico<Historico2022Arquivo>(ativo ? CAMINHO_HISTORICO_2022 : null);
