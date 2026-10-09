import { useEffect, useRef } from 'react';

/** setInterval declarativo. `ms = null` pausa. O callback mais recente é sempre usado. */
export function useInterval(cb: () => void, ms: number | null): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}
