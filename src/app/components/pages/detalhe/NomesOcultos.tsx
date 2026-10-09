/**
 * Aviso discreto de que, na SIMULAÇÃO, os candidatos aparecem como "Candidato A/B" (LiveStatus.anonimizado):
 * números fictícios nunca circulam associados a candidatos reais. Fica ao lado das ações do cabeçalho.
 */
import { cn } from '@/app/lib/cn';
import { Tooltip } from '@/app/ui/Tooltip';
import { Icon } from '@/app/ui/Icon';

export function NomesOcultos({ className }: { className?: string }) {
  return (
    <Tooltip content="Na simulação os candidatos aparecem como “Candidato A” e “Candidato B”, para que números fictícios nunca sejam associados a pessoas reais.">
      <span
        tabIndex={0}
        className={cn(
          'inline-flex h-8 cursor-help items-center gap-1.5 rounded-full border border-dashed border-line px-3 text-[12px] font-medium text-fg-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          className,
        )}
      >
        <Icon name="olho-fechado" size={14} />
        Nomes ocultos na simulação
      </span>
    </Tooltip>
  );
}
