/**
 * Ações secundárias da Home: "Lembrar da apuração" (agenda gerada no aparelho) e "Compartilhar o Sintonia" (kit).
 * Os painéis só são baixados no 1º toque (ou ao apontar/focar o botão).
 */
import { lazy, Suspense, useState } from 'react';
import { INICIO_APURACAO } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { Button, type ButtonSize, type ButtonVariant } from '@/app/ui/Button';
import { abrirCompartilharSite, preCarregarCompartilharSite } from '@/app/components/layout/acoesGlobais';

const DialogoLembrete = lazy(() => import('./DialogoLembrete'));
const preCarregarLembrete = () => void import('./DialogoLembrete');

/** O lembrete só faz sentido antes do início REAL da apuração (relógio de parede). */
export const lembreteDisponivel = (agora = Date.now()) => agora < INICIO_APURACAO;

export function BotaoLembrete({
  variant = 'outline',
  size = 'md',
  className,
  label = 'Lembrar da apuração',
  labelCurto,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  label?: string;
  /** rótulo abaixo de 380 px (o botão divide a linha com outro) */
  labelCurto?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon="calendario"
        className={className}
        aria-haspopup="dialog"
        aria-label={labelCurto ? label : undefined}
        onPointerEnter={preCarregarLembrete}
        onFocus={preCarregarLembrete}
        onClick={() => {
          setMontado(true);
          setAberto(true);
        }}
      >
        {labelCurto ? (
          <>
            <span className="max-[379px]:hidden">{label}</span>
            <span className="min-[380px]:hidden">{labelCurto}</span>
          </>
        ) : (
          label
        )}
      </Button>
      {montado ? (
        <Suspense fallback={null}>
          <DialogoLembrete aberto={aberto} onFechar={() => setAberto(false)} />
        </Suspense>
      ) : null}
    </>
  );
}

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
