/**
 * `true` quando o elemento chega perto da tela (IntersectionObserver com folga `margem`) — e continua `true` depois.
 * Usado para só baixar dados pesados (locais de votação, perfil do eleitorado, pacotes de fotos) quando o bloco
 * vai de fato aparecer. Sem IntersectionObserver (navegador antigo, testes), libera na hora.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';

export function useNaTela<T extends HTMLElement>(margem = '600px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visto) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisto(true);
      return;
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisto(true), { rootMargin: margem });
    io.observe(el);
    return () => io.disconnect();
  }, [visto, margem]);
  return [ref, visto];
}
