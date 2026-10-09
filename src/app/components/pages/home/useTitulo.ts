import { useEffect } from 'react';
import { APP_NAME } from '@/shared/constants';

/** Título da aba (o servidor injeta as meta tags; aqui só acompanhamos a navegação no cliente). */
export function useTitulo(titulo: string | null | undefined) {
  useEffect(() => {
    if (!titulo) return;
    const anterior = document.title;
    document.title = titulo.includes(APP_NAME) ? titulo : `${titulo} · ${APP_NAME}`;
    return () => {
      document.title = anterior;
    };
  }, [titulo]);
}
