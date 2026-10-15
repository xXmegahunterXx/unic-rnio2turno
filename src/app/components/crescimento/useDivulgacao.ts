/**
 * `GET /api/divulgacao` (src/server/crescimento.ts): redes do Sintonia e, se o painel ligar, os números de audiência
 * medidos. Uma consulta por visita (cache de 5 min); no build demo não há servidor: nada aparece.
 */
import { useQuery } from '@tanstack/react-query';
import type { DivulgacaoPublica } from '@/shared/audiencia';

export function useDivulgacao(ativo = true) {
  return useQuery<DivulgacaoPublica>({
    queryKey: ['divulgacao'],
    enabled: ativo && !__DEMO__,
    queryFn: async () => {
      const r = await fetch('/api/divulgacao', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!r.ok) throw Object.assign(new Error(`Erro ${r.status}`), { status: r.status });
      return (await r.json()) as DivulgacaoPublica;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
