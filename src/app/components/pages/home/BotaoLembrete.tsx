/**
 * "Lembrar da apuração" (I29 mínimo): botão que abre o diálogo da agenda gerada NO APARELHO (DialogoLembrete, carregado
 * no 1º toque ou ao apontar/focar). Usado na Home, no fim do resultado do Teste Cego (depois da revelação) e no Palpite
 * (depois de cravar).
 *
 * `caminho` = a página que o evento abre (padrão /apuracao; no Palpite, /palpite). O link do evento ganha
 * `utm_source=agenda` (agenda.ts). NUNCA vai no link o código do palpite nem o resultado do Teste: o palpite fica no
 * aparelho (`localStorage`) e a página /palpite o mostra de volta sozinha.
 *
 * Só antes do início REAL da apuração (relógio de parede; passe `agora` do servidor quando houver).
 */
import { lazy, Suspense, useState } from 'react';
import { INICIO_APURACAO } from '@/shared/constants';
import { Button, type ButtonSize, type ButtonVariant } from '@/app/ui/Button';

const DialogoLembrete = lazy(() => import('./DialogoLembrete'));
const preCarregarLembrete = () => void import('./DialogoLembrete');

/** O lembrete só faz sentido antes do início REAL da apuração (relógio de parede). */
export const lembreteDisponivel = (agora = Date.now()) => agora < INICIO_APURACAO;

/** Caminho do evento sem nada além do caminho (nem query, nem `#`): o código do palpite ou do Teste nunca vai junto. */
export function caminhoLembrete(caminho: string): string {
  const p = caminho.split(/[?#]/)[0];
  return /^\/[a-z0-9/-]*$/i.test(p) ? p : '/apuracao';
}

export function BotaoLembrete({
  variant = 'outline',
  size = 'md',
  className,
  label = 'Lembrar da apuração',
  labelCurto,
  caminho = '/apuracao',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  label?: string;
  /** rótulo abaixo de 380 px (o botão divide a linha com outro) */
  labelCurto?: string;
  /** página que o evento da agenda abre (só o caminho) */
  caminho?: string;
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
          <DialogoLembrete aberto={aberto} onFechar={() => setAberto(false)} caminho={caminhoLembrete(caminho)} />
        </Suspense>
      ) : null}
    </>
  );
}
