import { useEffect, useState } from 'react';
import type { LiveStatus } from '@/shared/types';

/**
 * Relógio de parede que avança a cada `ms` (padrão 1 s), alinhado à virada do segundo para que
 * contagens regressivas não "pulem". Pausa quando a aba está oculta.
 */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      setNow(Date.now());
      const delay = ms - (Date.now() % ms) + 5;
      timer = window.setTimeout(tick, delay);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        tick();
      } else window.clearTimeout(timer);
    };
    tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms]);
  return now;
}

/**
 * Estima o relógio da apuração (simNow) agora, a partir do último LiveStatus recebido.
 * `recebidoEm` é o instante local em que o status chegou (React Query: `dataUpdatedAt`).
 */
export function estimarSimNow(status: LiveStatus, recebidoEm: number, agora: number): number {
  if (status.pausado || status.congelado || status.fase !== 'apurando') return status.simNow;
  const dt = Math.max(0, agora - recebidoEm);
  return status.simNow + dt * (status.velocidade || 1);
}

/** Relógio da apuração interpolado entre atualizações do status (tick de 1 s). */
export function useSimNow(status: LiveStatus | undefined, recebidoEm: number): number | null {
  const now = useNow(status && status.velocidade > 1 ? 250 : 1000);
  if (!status) return null;
  return estimarSimNow(status, recebidoEm, now);
}
