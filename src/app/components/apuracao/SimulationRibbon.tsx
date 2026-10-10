/**
 * Sinalização obrigatória de simulação (ARCHITECTURE §1.4): "SIMULAÇÃO · dados fictícios".
 * - variant 'bar': faixa de largura total (usada no AppShell em toda página quando status.simulacao).
 * - variant 'badge': selo compacto (cartões, BU, imagens de compartilhamento).
 * - variant 'stamp': carimbo inclinado para o Boletim de Urna.
 */
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';

/** Cor do carimbo sobre o papel do BU (claro também no tema escuro): marca escurecida, AA nos dois temas. */
export const CARIMBO_SOBRE_PAPEL = 'dark:text-[color:color-mix(in_srgb,rgb(var(--brand))_70%,rgb(var(--bg)))]';

export interface SimulationRibbonProps {
  variant?: 'bar' | 'badge' | 'stamp';
  /** Texto complementar (bar; só a partir de `sm`). */
  detalhe?: string;
  /**
   * Texto principal da faixa (bar), visível também no celular. Padrão: "Simulação · dados fictícios". Nas páginas do
   * 1º turno durante a simulação os números são OFICIAIS: lá a faixa diz isso (ver AppShell).
   */
  titulo?: string;
  className?: string;
}

export function SimulationRibbon({
  variant = 'bar',
  detalhe = 'Os números desta página não são resultados reais.',
  titulo = 'Simulação · dados fictícios',
  className,
}: SimulationRibbonProps) {
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
          // Sobre superfícies do tema (AA). Sobre papel claro no tema escuro (BU), use `CARIMBO_SOBRE_PAPEL`.
          'text-brand-fg',
          className,
        )}
      >
        <span className="text-[13px] font-semibold uppercase leading-none tracking-[0.16em]">Simulação</span>
        <span className="mt-1 text-[9px] font-medium uppercase leading-none tracking-[0.14em]">dados fictícios</span>
      </span>
    );
  }
  return (
    <div
      role="note"
      aria-label={`${titulo}. ${detalhe}`}
      className={cn(
        // Fundo OPACO (surface + tinta violeta): a faixa fica presa sob o header e o conteúdo rola por baixo.
        'relative isolate flex h-7 items-center justify-center gap-2 overflow-hidden border-b border-brand/25 bg-surface px-4',
        'text-[11px] font-semibold uppercase tracking-[0.14em]',
        'text-brand-fg',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-0 -z-10 bg-brand/[0.12]" />
      <span
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60 [background-image:repeating-linear-gradient(-45deg,rgb(var(--brand)/0.10)_0_8px,transparent_8px_16px)]"
      />
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {titulo}
      </span>
      <span className="hidden truncate font-medium normal-case tracking-normal text-fg-muted sm:inline">— {detalhe}</span>
    </div>
  );
}
