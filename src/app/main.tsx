import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { preCarregarDadosDaRota } from './data/hooks';
import { recarregarUmaVez } from './lib/recarga';
import './styles.css';

/** 400/404 são respostas definitivas (endereço inexistente ou malformado): repetir só atrasaria a tela de "não encontrado". */
const definitivo = (e: unknown) => {
  const st = (e as { status?: unknown } | null)?.status;
  return st === 400 || st === 404;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => n < 2 && !definitivo(e), refetchOnWindowFocus: true, staleTime: 1000 },
  },
});

// Pedaço do app que não existe mais (aba aberta antes de um deploy): o Vite avisa ao pré-carregar; recarrega uma vez.
// As falhas que passam direto pelo import() caem na tela de erro das rotas (ErroRota), que faz o mesmo.
window.addEventListener('vite:preloadError', (e) => {
  if (recarregarUmaVez()) e.preventDefault();
});

// Dados da rota de entrada pedidos já agora, em paralelo com o chunk da página (ver preCarregarDadosDaRota).
if (!__DEMO__) preCarregarDadosDaRota(queryClient, window.location.pathname, window.location.search);

// Audiência só agregada, sem cookie e sem guardar IP (lib/audiencia.ts): chunk próprio, depois da 1ª pintura, fora do JS inicial.
if (!__DEMO__) {
  const audiencia = () => void import('./lib/audiencia').then((m) => m.instalarAudiencia(router)).catch(() => undefined);
  if ('requestIdleCallback' in window) window.requestIdleCallback(audiencia, { timeout: 4000 });
  else setTimeout(audiencia, 2000);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
