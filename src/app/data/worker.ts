/// <reference lib="webworker" />
/**
 * Web Worker do build demo: roda o motor de simulação + controller fora da thread principal.
 * Toda a lógica de mensagens está em src/engine/host.ts (a mesma usada no fallback da thread principal).
 * O dataset é carregado por fetch relativo à `base` recebida no `init` (o worker não tem `document`).
 */
import { createEngineHost, fetchJsonLoader, type HostIn, type HostOut } from '@/engine/host';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handle = createEngineHost((m: HostOut) => scope.postMessage(m), fetchJsonLoader);

scope.onmessage = (e: MessageEvent<HostIn>) => {
  void handle(e.data);
};
