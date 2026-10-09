/** Ícone de tema do Teste Cego: o emoji neutro do conteúdo editorial num ladrilho discreto. */
import type { TemaInfo } from '@/app/content/propostas';
import { cn } from '@/app/lib/cn';

const tamanhos = {
  sm: 'h-9 w-9 rounded-xl text-[18px]',
  md: 'h-11 w-11 rounded-[14px] text-[22px]',
  lg: 'h-14 w-14 rounded-2xl text-[28px] sm:h-16 sm:w-16 sm:text-[32px]',
};

export function TemaEmoji({ tema, size = 'md', className }: { tema: TemaInfo; size?: keyof typeof tamanhos; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center border border-line bg-surface-2 leading-none shadow-[inset_0_1px_0_0_rgb(var(--line)/calc(var(--line-alpha)*1.5))]',
        tamanhos[size],
        className,
      )}
    >
      {tema.emoji ?? tema.rotulo.charAt(0)}
    </span>
  );
}
