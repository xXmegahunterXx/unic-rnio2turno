/**
 * Seleciona a implementação de ApuracaoClient:
 *  - produção/dev: HTTP (src/app/data/http.ts) falando com o servidor Hono;
 *  - build demo (__DEMO__): motor local num Web Worker (src/app/data/local.ts).
 */
import type { ApuracaoClient } from '@/shared/api';

let clientPromise: Promise<ApuracaoClient> | null = null;

export function getClient(): Promise<ApuracaoClient> {
  if (!clientPromise) {
    clientPromise = __DEMO__
      ? import('./local').then((m) => m.createLocalClient())
      : import('./http').then((m) => m.createHttpClient());
  }
  return clientPromise;
}
