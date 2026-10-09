/**
 * Nota discreta "Nomes ocultos na simulação" (LiveStatus.anonimizado): na simulação os candidatos aparecem
 * como "Candidato A/B" para que prints de números fictícios nunca circulem associados a candidatos reais.
 * (Variação local; candidata a virar componente do kit — há versões equivalentes nas páginas de apuração.)
 */
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { Tooltip } from '@/app/ui/Tooltip';

export function NotaNomesOcultos({ className }: { className?: string }) {
  return (
    <Tooltip content="Na simulação os candidatos aparecem como “Candidato A” e “Candidato B”, na ordem do número na urna, para que números fictícios nunca sejam associados a pessoas reais.">
      <span
        tabIndex={0}
        className={cn(
          'inline-flex h-7 cursor-help items-center gap-1.5 rounded-full border border-dashed border-line/[2] px-2.5 text-[12px] font-medium text-fg-muted',
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
