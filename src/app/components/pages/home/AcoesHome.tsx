/**
 * Ações secundárias da Home: "Lembrar da apuração" (agenda gerada no aparelho; BotaoLembrete.tsx) e "Compartilhar o
 * Sintonia" (kit). Os painéis só são baixados no 1º toque (ou ao apontar/focar o botão).
 */
import { cn } from '@/app/lib/cn';
import { Button, type ButtonSize, type ButtonVariant } from '@/app/ui/Button';
import { abrirCompartilharSite, preCarregarCompartilharSite } from '@/app/components/layout/acoesGlobais';

/** "Lembrar da apuração": em BotaoLembrete.tsx (I29: também no Teste Cego e no Palpite); reexportado para a Home. */
export { BotaoLembrete, lembreteDisponivel } from './BotaoLembrete';

export function BotaoCompartilharSite({ variant = 'outline', size = 'md', className, label = 'Compartilhar' }: { variant?: ButtonVariant; size?: ButtonSize; className?: string; label?: string }) {
  return (
    <Button
      variant={variant}
      size={size}
      icon="compartilhar"
      className={cn(className)}
      aria-haspopup="dialog"
      onPointerEnter={preCarregarCompartilharSite}
      onFocus={preCarregarCompartilharSite}
      onClick={abrirCompartilharSite}
    >
      {label}
    </Button>
  );
}
