/**
 * Números de audiência na página /anuncie — só os MEDIDOS pelo próprio site (src/server/audiencia.ts) e só quando o
 * painel liga "Mostrar audiência na página /anuncie". Sem dado (ou desligado, ou no demo): nada aparece. Nunca há
 * número estimado à parte ou arredondado para cima.
 */
import type { ReactNode } from 'react';
import { diaBrasilia, fmtDia, type AudienciaPublica } from '@/shared/audiencia';
import { fmtDataHora, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';

function Numero({ icone, rotulo, valor, detalhe, compacto }: { icone: IconName; rotulo: string; valor: string; detalhe: ReactNode; compacto?: boolean }) {
  const sm = (c: string) => (compacto ? '' : c);
  return (
    <li className={cn('relative min-w-0 overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-card', sm('sm:p-6'))}>
      <span className={cn('hidden h-10 w-10 items-center justify-center rounded-2xl bg-brand/15 text-brand-fg ring-1 ring-inset ring-brand/25', sm('sm:inline-flex'))}>
        <Icon name={icone} size={19} />
      </span>
      <p className={cn('text-[13.5px] font-medium leading-snug text-fg-muted', sm('sm:mt-4'))}>{rotulo}</p>
      {/* celular: número à esquerda e o detalhe à direita (cartões baixos); a partir de 640 px, empilhados */}
      <div className={cn('mt-1 flex items-baseline justify-between gap-3', sm('sm:block'))}>
        <p className={cn('num font-display text-[34px] font-semibold leading-none tracking-[-0.04em] text-fg', sm('sm:text-[46px]'))}>{valor}</p>
        <p className={cn('num shrink-0 text-right text-[12.5px] leading-snug text-fg-subtle', sm('sm:mt-2 sm:text-left sm:text-[13px]'))}>{detalhe}</p>
      </div>
    </li>
  );
}

/** Há algum número medido para mostrar? */
export const temNumeros = (a: AudienciaPublica): boolean => (a.pico?.valor ?? 0) > 0 || (a.maiorDia?.unicos ?? 0) > 0 || a.paginas > 0;

export function NumerosAudiencia({ audiencia, className, compacto }: { audiencia: AudienciaPublica; className?: string; compacto?: boolean }) {
  const { pico, maiorDia, paginas, desde } = audiencia;
  const itens: ReactNode[] = [];
  if (pico && pico.valor > 0)
    itens.push(<Numero key="pico" icone="usuarios" compacto={compacto} rotulo="Pico de pessoas no site ao mesmo tempo" valor={fmtInt(pico.valor)} detalhe={`em ${fmtDataHora(pico.em)}`} />);
  if (maiorDia && maiorDia.unicos > 0)
    itens.push(<Numero key="dia" icone="calendario" compacto={compacto} rotulo="Visitantes únicos no maior dia" valor={fmtInt(maiorDia.unicos)} detalhe={`em ${fmtDia(maiorDia.dia)}`} />);
  if (paginas > 0) itens.push(<Numero key="pag" icone="grade" compacto={compacto} rotulo="Páginas vistas" valor={fmtInt(paginas)} detalhe={`desde ${fmtDia(diaBrasilia(desde))}`} />);
  if (!itens.length) return null;
  return (
    <div className={className}>
      <ul className={cn('grid grid-cols-1 gap-3', !compacto && 'sm:gap-4', !compacto && (itens.length >= 3 ? 'sm:grid-cols-3' : itens.length === 2 ? 'sm:grid-cols-2' : ''))}>{itens}</ul>
      <p className="mt-4 max-w-[52rem] text-pretty text-[13px] leading-relaxed text-fg-subtle">
        Medição própria do Sintonia desde <span className="num">{fmtDia(diaBrasilia(desde))}</span>, só com números agregados, sem cookie e sem guardar IP (horários de Brasília). As
        contagens são conservadoras: pessoas na mesma rede com o mesmo navegador contam como uma, robôs não contam, e widgets em outros sites e o
        modo streamer ficam de fora.
      </p>
    </div>
  );
}
