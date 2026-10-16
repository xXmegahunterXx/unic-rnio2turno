/**
 * Peça da faixa do topo (formato 'topo'; regras e o slot em FaixaTopo.tsx). Chunk à parte: carregado pelo slot e
 * usado direto pela vitrine da /anuncie e pela prévia do painel.
 */
import { useRef } from 'react';
import type { AnuncioPublico } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Container } from '@/app/components/layout/Container';
import { Icon } from '@/app/ui/Icon';
import { ALTURA_TOPO, FUNDO_TOPO } from './FaixaTopo';
import { useImpressaoVisivel } from './impressao';
import { BrilhoMarca, CtaAnuncio, LinkAnuncio, LogoMarca, RotuloAnuncio } from './pecas';

const FUNDO = FUNDO_TOPO;

export function FaixaTopoPeca({
  anuncio: a,
  vista = 'previa',
  previa,
  compacta,
  className,
}: {
  anuncio: AnuncioPublico;
  vista?: string;
  previa?: boolean;
  /** força a versão do celular (prévia em coluna estreita) */
  compacta?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useImpressaoVisivel(ref, { id: a.id, formato: 'topo', bloco: 'topo', vista, ativo: !previa });
  // classes que só valem a partir de 1024 px (ou nunca, na versão compacta). Até 1023 px (celular e tablet em retrato) a
  // versão de duas linhas: numa linha só, o título de 60 caracteres saía cortado no iPad em retrato
  const md = (c: string) => (compacta ? '' : c);
  return (
    <aside aria-label="Publicidade" className={cn(FUNDO, compacta ? 'h-[52px]' : ALTURA_TOPO, className)}>
      {/* no topo da página: a logo já está à vista, então o brilho carrega junto (sem `loading=lazy`) */}
      <BrilhoMarca anuncio={a} adiado={false} className="-left-10 -top-16 h-40 w-72 opacity-40 dark:opacity-30" />
      <Container wide className={cn('relative h-full', compacta && '!px-3')}>
        {/* anel de foco por dentro: o fundo tem overflow-hidden e cortaria o anel de fora */}
        <LinkAnuncio
          ref={ref}
          anuncio={a}
          formato="topo"
          previa={previa}
          anelDentro
          // -mx-2 px-2: o anel de foco (por dentro) ganha folga e não passa por cima do rótulo nem do botão
          className={cn('-mx-2 flex h-full min-w-0 items-center gap-2.5 rounded-xl px-2', md('md:gap-3'))}
        >
          {/* "Publicidade" (não "Oferecido por"): logo acima do título de uma página, "Oferecido por" soava como patrocínio
              da apuração ou do Palpite */}
          <RotuloAnuncio className={cn('hidden', md('lg:inline'))}>Publicidade</RotuloAnuncio>
          <LogoMarca anuncio={a} tamanho="xs" className={cn('h-8 w-8', md('md:h-8 md:w-8'))} />
          {/* celular: "Publicidade · marca" + o título inteiro em até duas linhas */}
          <span className={cn('min-w-0 flex-1', md('lg:hidden'))}>
            <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold uppercase leading-[1.2] tracking-[0.12em] text-fg-subtle">
              <span className="shrink-0">Publicidade</span>
              <span aria-hidden>·</span>
              <span className="truncate normal-case tracking-normal text-fg-muted">{a.marca}</span>
            </span>
            <span className="mt-[3px] line-clamp-2 text-pretty text-[13px] font-semibold leading-[1.16] text-fg">{a.titulo}</span>
          </span>
          {/* tablet/desktop: uma linha */}
          {compacta ? null : (
            <span className="hidden min-w-0 flex-1 items-baseline gap-2 lg:flex">
              <span className="shrink-0 text-[14px] font-semibold text-fg">{a.marca}</span>
              <span aria-hidden className="text-fg-subtle">·</span>
              <span className="truncate text-[14px] text-fg-muted">{a.titulo}</span>
            </span>
          )}
          {a.destino && !compacta ? <span className="hidden shrink-0 text-[12.5px] text-fg-subtle xl:inline">{a.destino}</span> : null}
          {/* abaixo de 400 px (ou na prévia estreita): só a seta, para o título caber inteiro */}
          <CtaAnuncio texto={a.cta} tamanho="sm" className={compacta ? 'hidden' : 'max-[399px]:hidden'} />
          <span
            aria-hidden
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-bg transition-opacity group-hover:opacity-90',
              compacta ? '' : 'min-[400px]:hidden',
            )}
          >
            <Icon name="seta" size={15} />
          </span>
        </LinkAnuncio>
      </Container>
    </aside>
  );
}
