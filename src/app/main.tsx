import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
