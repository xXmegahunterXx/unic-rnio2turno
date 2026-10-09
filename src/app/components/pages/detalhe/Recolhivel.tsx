/**
 * Conteúdo alto (ex.: o mosaico das 26.683 seções de São Paulo no celular) recolhido a uma altura máxima, com
 * esmaecimento e o botão "Ver tudo". Só recolhe quando de fato passa da altura (mede com ResizeObserver).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/app/lib/cn';
import { Button } from '@/app/ui/Button';

export interface RecolhivelProps {
  /** Altura máxima recolhida, em px. `null` desliga (mostra tudo). */
  alturaMax: number | null;
  /** Rótulo do botão de expandir (ex.: "Ver as 57 zonas"). */
  rotulo: string;
  children: ReactNode;
  className?: string;
}

export function Recolhivel({ alturaMax, rotulo, children, className }: RecolhivelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState(0);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setAltura(el.scrollHeight));
    ro.observe(el);
    setAltura(el.scrollHeight);
    return () => ro.disconnect();
  }, []);

  // Folga de 25%: não vale recolher o que passa só um pouco.
  const recolher = alturaMax !== null && !aberto && altura > alturaMax * 1.25;
  return (
    <div className={cn('relative', className)}>
      <div ref={ref} style={recolher ? { maxHeight: alturaMax!, overflow: 'hidden' } : undefined}>
        {children}
      </div>
      {recolher ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-28 items-end justify-center bg-gradient-to-b from-surface/0 via-surface/85 to-surface pb-1">
          <Button
            variant="secondary"
            size="sm"
            iconRight="chevron"
            onClick={() => setAberto(true)}
            className="pointer-events-auto shadow-card"
          >
            {rotulo}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
