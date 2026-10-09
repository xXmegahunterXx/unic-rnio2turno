/**
 * Sinalização obrigatória de simulação (ARCHITECTURE §1.4): "SIMULAÇÃO · dados fictícios".
 * - variant 'bar': faixa de largura total (usada no AppShell em toda página quando status.simulacao).
 * - variant 'badge': selo compacto (cartões, BU, imagens de compartilhamento).
 * - variant 'stamp': carimbo inclinado para o Boletim de Urna.
 */
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';

export interface SimulationRibbonProps {
  variant?: 'bar' | 'badge' | 'stamp';
  /** Texto complementar (bar). */
  detalhe?: string;
  className?: string;
}

export function SimulationRibbon({ variant = 'bar', detalhe = 'Os números desta página não são resultados reais.', className }: SimulationRibbonProps) {
  if (variant === 'badge') {
    return (
      <span
        className={cn(
          'inline-flex h-6 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/15 px-2',
          'text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-fg',
          className,
        )}
      >
        <Icon name="info" size={12} strokeWidth={2.25} />
        Simulação
      </span>
    );
  }
  if (variant === 'stamp') {
    return (
      <span
        aria-label="Simulação: dados fictícios"
        className={cn(
          'pointer-events-none inline-flex -rotate-[8deg] flex-col items-center rounded-md border-2 border-current px-2.5 py-1.5 font-mono',
          'text-brand-deep opacity-90',
          className,
        )}
      >
        <span className="text-[13px] font-semibold uppercase leading-none tracking-[0.16em]">Simulação</span>
        <span className="mt-1 text-[8.5px] uppercase leading-none tracking-[0.14em]">dados fictícios</span>
      </span>
    );
  }
  return (
    <div
      role="note"
      aria-label="Simulação: dados fictícios"
      className={cn(
        'relative isolate flex h-7 items-center justify-center gap-2 overflow-hidden border-b border-brand/25 px-4',
        'bg-brand/[0.12] text-[11px] font-semibold uppercase tracking-[0.14em]',
        'text-brand-fg',
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60 [background-image:repeating-linear-gradient(-45deg,rgb(var(--brand)/0.10)_0_8px,transparent_8px_16px)]"
      />
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Simulação · dados fictícios
      </span>
      <span className="hidden truncate font-medium normal-case tracking-normal text-fg-muted sm:inline">— {detalhe}</span>
    </div>
  );
}
