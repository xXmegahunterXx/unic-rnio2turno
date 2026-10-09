import type { HTMLAttributes } from 'react';
import { cn } from '@/app/lib/cn';

/** Largura máxima e respiros laterais padrão do app (16 px no celular). */
export function Container({ className, wide, ...rest }: HTMLAttributes<HTMLDivElement> & { wide?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', wide ? 'max-w-[1440px]' : 'max-w-[1200px]', className)} {...rest} />;
}
