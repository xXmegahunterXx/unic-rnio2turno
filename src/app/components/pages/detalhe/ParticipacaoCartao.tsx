/**
 * Participação (eleitorado, comparecimento, abstenção, brancos, nulos) em lista compacta dentro de um cartão:
 * a versão de celular do `StatsGrid` em cartões e o painel lateral do 1º turno.
 */
import type { Tally } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { StatsGrid } from '@/app/components/apuracao/StatsGrid';

export function ParticipacaoCartao({ t, titulo, className }: { t: Tally; titulo: string; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">{titulo}</h3>
      <StatsGrid t={t} variant="list" />
    </section>
  );
}
