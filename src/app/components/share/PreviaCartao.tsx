/**
 * Prévia escalada de um cartão: o nó exportado mantém o tamanho real (w×h) e só a caixa externa encolhe.
 * O `ref` aponta para o nó em tamanho real (é dele que sai o PNG).
 */
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/app/lib/cn';
import { DIMENSOES_CARTAO, type FormatoCartao } from './tipos';

export interface PreviaCartaoProps {
  formato: FormatoCartao;
  children: ReactNode;
  className?: string;
}

export const PreviaCartao = forwardRef<HTMLDivElement, PreviaCartaoProps>(function PreviaCartao({ formato, children, className }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [esc, setEsc] = useState(0.3);
  const { w, h } = DIMENSOES_CARTAO[formato];
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const medir = () => setEsc(el.clientWidth / w || 0.3);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div
      ref={box}
      className={cn('relative w-full overflow-hidden rounded-2xl border border-line shadow-card', className)}
      style={{ aspectRatio: `${w} / ${h}` }}
    >
      <div style={{ width: w, height: h, transform: `scale(${esc})`, transformOrigin: 'top left' }}>
        <div ref={ref} style={{ width: w, height: h }}>
          {children}
        </div>
      </div>
    </div>
  );
});
