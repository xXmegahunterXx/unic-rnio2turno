/**
 * "Minha seção": a última consulta (UF, município, zona, seção) guardada no navegador para o atalho
 * "Ver minha seção". Só endereço eleitoral — nenhum dado de opinião (LGPD) — e nunca sai do aparelho.
 */
import { useCallback, useEffect, useState } from 'react';
import type { UF } from '@/shared/types';

export const CHAVE_MINHA_SECAO = 'sintonia:minha-secao';

export interface MinhaSecao {
  uf: UF;
  cod: string;
  nome: string;
  zona: number;
  secao: number;
  /** epoch ms da última gravação */
  em: number;
}

function valida(v: unknown): v is MinhaSecao {
  if (!v || typeof v !== 'object') return false;
  const x = v as Partial<MinhaSecao>;
  return (
    typeof x.uf === 'string' &&
    typeof x.cod === 'string' &&
    typeof x.nome === 'string' &&
    Number.isInteger(x.zona) &&
    Number.isInteger(x.secao)
  );
}

export function lerMinhaSecao(): MinhaSecao | null {
  try {
    const raw = localStorage.getItem(CHAVE_MINHA_SECAO);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return valida(v) ? v : null;
  } catch {
    return null;
  }
}

const EVENTO = 'sintonia:minha-secao';

export function gravarMinhaSecao(s: Omit<MinhaSecao, 'em'> | null): void {
  try {
    if (s === null) localStorage.removeItem(CHAVE_MINHA_SECAO);
    else localStorage.setItem(CHAVE_MINHA_SECAO, JSON.stringify({ ...s, em: Date.now() }));
  } catch {
    /* modo privado / armazenamento bloqueado: segue sem atalho */
  }
  try {
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    /* ignora */
  }
}

/** Estado reativo da "minha seção" (atualiza entre componentes e abas). */
export function useMinhaSecao(): [MinhaSecao | null, (s: Omit<MinhaSecao, 'em'> | null) => void] {
  const [v, setV] = useState<MinhaSecao | null>(() => (typeof window === 'undefined' ? null : lerMinhaSecao()));
  useEffect(() => {
    const atualizar = () => setV(lerMinhaSecao());
    window.addEventListener(EVENTO, atualizar);
    const onStorage = (e: StorageEvent) => e.key === CHAVE_MINHA_SECAO && atualizar();
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENTO, atualizar);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const set = useCallback((s: Omit<MinhaSecao, 'em'> | null) => gravarMinhaSecao(s), []);
  return [v, set];
}

export const mesmaSecao = (
  a: Pick<MinhaSecao, 'uf' | 'cod' | 'zona' | 'secao'> | null,
  b: Pick<MinhaSecao, 'uf' | 'cod' | 'zona' | 'secao'> | null,
) => !!a && !!b && a.uf === b.uf && a.cod === b.cod && a.zona === b.zona && a.secao === b.secao;
