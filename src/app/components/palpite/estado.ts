/**
 * Estado do Palpite no app (hooks): relógio do servidor, palpite guardado NO APARELHO e os finalistas reais.
 * Nada aqui envia dado algum: o palpite vive no localStorage (conveniência) e no link que a pessoa compartilhar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candidate } from '@/shared/types';
import { useMeta, useStatus } from '@/app/data/hooks';
import { useNow } from '@/app/lib/useNow';
import { CHAVE_PALPITE, deslocamentoRelogio, gravarPalpite, lerPalpiteSalvo, type Palpite } from './nucleo';

/**
 * "Agora" pelo relógio do servidor (o prazo das 17h de 25/10 é o do servidor, não o do aparelho), com tique de 1 s.
 * Sem status (erro de rede, demo antes do worker), o relógio do aparelho.
 */
export function useAgoraServidor(): number {
  const q = useStatus();
  const local = useNow(1000);
  const desloc = deslocamentoRelogio(q.data?.wallNow, q.dataUpdatedAt);
  return local + desloc;
}

/** Palpite guardado neste aparelho (acompanha outras abas pelo evento 'storage'). */
export function usePalpiteSalvo(): [Palpite | null, (p: Palpite) => boolean] {
  const [salvo, setSalvo] = useState<Palpite | null>(() => lerPalpiteSalvo());
  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === null || e.key === CHAVE_PALPITE) setSalvo(lerPalpiteSalvo());
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);
  const gravar = useCallback((p: Palpite) => {
    const ok = gravarPalpite(p);
    // armazenamento bloqueado (modo privado): o palpite vale nesta aba, mas não é lembrado
    setSalvo(p);
    return ok;
  }, []);
  return [salvo, gravar];
}

/**
 * Os dois finalistas REAIS de Presidente (2º turno), na ordem da urna, com as cores dos dados. O Palpite é sobre a
 * eleição real: usa o `meta` sem anonimizar (como o Teste Cego) e nunca compara com números simulados.
 */
export function useFinalistas(): readonly [Candidate, Candidate] | null {
  const { data: meta } = useMeta();
  return useMemo(() => {
    const pres = meta?.races.find((r) => r.id === 'pres');
    const fin = pres?.candidatos.filter((c) => !c.agregado).sort((x, y) => x.numero - y.numero) ?? [];
    return fin.length === 2 ? ([fin[0], fin[1]] as const) : null;
  }, [meta]);
}
