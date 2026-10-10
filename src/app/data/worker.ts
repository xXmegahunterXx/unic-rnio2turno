/// <reference lib="webworker" />
/**
 * Web Worker do build demo: roda o motor de simulação + controller fora da thread principal.
 * Toda a lógica de mensagens está em src/engine/host.ts (a mesma usada no fallback da thread principal).
 * O dataset é carregado por fetch relativo à `base` recebida no `init` (o worker não tem `document`):
 * meta + 28 UFs + (opcionais, em paralelo) 28 arquivos do 1º turno real por seção e municipios-br.json; os
 * locais de votação de cada UF são baixados na 1ª consulta de zona/seção dela. Boot medido (Chromium, desktop,
 * dataset completo): ~1,2–1,7 s até o 'ready' (dados ~0,4 s · estrutura ~0,1 s · modelo ~0,6–0,9 s).
 */
import { createEngineHost, fetchJsonLoader, type HostIn, type HostOut } from '@/engine/host';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handle = createEngineHost((m: HostOut) => scope.postMessage(m), fetchJsonLoader);

scope.onmessage = (e: MessageEvent<HostIn>) => {
  void handle(e.data);
};
