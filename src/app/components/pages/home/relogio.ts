/**
 * Relógio da apuração para a Home: estima o "agora" entre atualizações do LiveStatus.
 *  - fonte 'pre' / 'tse': relógio real (simNow = parede no servidor) avançando 1:1;
 *  - fonte 'simulacao': relógio simulado avançando na velocidade do admin (parado se pausado/congelado).
 * Diferente de `useSimNow` (lib), também interpola ANTES das 17h — a contagem regressiva precisa disso.
 */
import { useNow } from '@/app/lib/useNow';
import type { LiveStatus } from '@/shared/types';

export function estimarRelogio(status: LiveStatus, recebidoEm: number, agora: number): number {
  const dt = Math.max(0, agora - recebidoEm);
  if (status.fonte !== 'simulacao') return status.simNow + dt;
  if (status.pausado || status.congelado) return status.simNow;
  return status.simNow + dt * (status.velocidade || 1);
}

/** Relógio interpolado (tique de 1 s; 250 ms quando a simulação está acelerada). */
export function useRelogioApuracao(status: LiveStatus | undefined, recebidoEm: number): number {
  const rapido = !!status && status.fonte === 'simulacao' && status.velocidade > 1 && !status.pausado;
  const now = useNow(rapido ? 250 : 1000);
  if (!status) return now;
  return estimarRelogio(status, recebidoEm, now);
}
