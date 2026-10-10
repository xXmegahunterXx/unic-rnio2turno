/**
 * Aviso discreto de anonimização da SIMULAÇÃO (LiveStatus.anonimizado): os candidatos aparecem como
 * "Candidato A/B" para que prints de números fictícios nunca circulem associados a candidatos reais.
 * Componente único do kit (antes havia uma variação por página).
 *
 *  - padrão: texto com ícone, para a linha de metadados sob o título;
 *  - `chip`: pílula tracejada, para ficar ao lado de botões (ações do cabeçalho, rodapé de cartões);
 *  - `curto`: no celular mostra só "Nomes ocultos" (o texto completo segue para leitores de tela);
 *  - `onClick`: vira botão (ex.: no admin, leva à configuração).
 */
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { Tooltip } from '@/app/ui/Tooltip';

export const TEXTO_NOMES_OCULTOS =
  'Na simulação os candidatos aparecem como “Candidato A” e “Candidato B”, na ordem do número na urna, para que números fictícios nunca sejam associados a pessoas reais.';

export interface NomesOcultosProps {
  chip?: boolean;
  curto?: boolean;
  onClick?: () => void;
  /** Dica no lugar do texto padrão (ex.: "Configurar em Fonte"). */
  dica?: string;
  className?: string;
}

export function NomesOcultos({ chip, curto, onClick, dica, className }: NomesOcultosProps) {
  const cls = cn(
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-fg-muted',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    chip ? 'h-8 rounded-full border border-dashed border-line/[2] px-3' : 'h-6 rounded-md',
    onClick ? 'cursor-pointer transition-colors hover:text-fg' : 'cursor-help',
    onClick && !chip && '-mx-1.5 px-1.5 hover:bg-surface-2',
    className,
  );
  const conteudo = (
    <>
      <Icon name="olho-fechado" size={14} className="shrink-0" />
      <span>
        Nomes ocultos<span className={cn(curto && 'max-sm:sr-only')}> na simulação</span>
      </span>
    </>
  );
  return (
    <Tooltip content={dica ?? TEXTO_NOMES_OCULTOS}>
      {onClick ? (
        <button type="button" onClick={onClick} className={cls}>
          {conteudo}
        </button>
      ) : (
        <span tabIndex={0} className={cls}>
          {conteudo}
        </span>
      )}
    </Tooltip>
  );
}
