/**
 * Botão que abre o `CompartilharSheet`. O cartão só é desenhado quando o sheet abre (nada pesa na página).
 */
import { useState, type ReactNode } from 'react';
import { cn } from '@/app/lib/cn';
import { Button, type ButtonSize, type ButtonVariant } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { CompartilharSheet } from './CompartilharSheet';
import type { ConteudoCompartilhavel } from './tipos';

export interface BotaoCompartilharProps extends ConteudoCompartilhavel {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Só o ícone (com rótulo acessível). */
  soIcone?: boolean;
  /** Linha sob o título do sheet. */
  descricao?: ReactNode;
  /** Dados do cartão ainda chegando. */
  carregando?: boolean;
  /** Ícone à esquerda (padrão: compartilhar). */
  icone?: Parameters<typeof Icon>[0]['name'];
}

export function BotaoCompartilhar({
  label = 'Compartilhar',
  variant = 'secondary',
  size = 'md',
  className,
  soIcone,
  icone = 'compartilhar',
  descricao,
  carregando,
  ...conteudo
}: BotaoCompartilharProps) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      {soIcone ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label={label}
          title={label}
          aria-haspopup="dialog"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9',
            className,
          )}
        >
          <Icon name={icone} size={size === 'sm' ? 16 : 18} />
        </button>
      ) : (
        <Button variant={variant} size={size} icon={icone} onClick={() => setAberto(true)} className={className} aria-haspopup="dialog">
          {label}
        </Button>
      )}
      <CompartilharSheet {...conteudo} descricao={descricao} carregando={carregando} aberto={aberto} onFechar={() => setAberto(false)} />
    </>
  );
}
