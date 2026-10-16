/**
 * Peça da faixa do topo (formato 'topo'; regras e o slot em FaixaTopo.tsx). Chunk à parte: carregado pelo slot e
 * usado direto pela vitrine da /anuncie e pela prévia do painel.
 *
 * Faixa "premium" (anunciantes v2): o logotipo grande, na proporção natural, no lugar do nome em texto (o nome segue no
 * rótulo do link: "Publicidade de <marca>…"). Ícone ou logo antiga: o nome continua em texto, como antes.
 */
import { useRef } from 'react';
import type { AnuncioPublico } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Container } from '@/app/components/layout/Container';
import { Icon } from '@/app/ui/Icon';
import { ALTURA_TOPO, ALTURA_TOPO_COMPACTA, FUNDO_TOPO } from './FaixaTopo';
import { useImpressaoVisivel } from './impressao';
import { ehLogotipo } from './logo';
import { BrilhoMarca, CtaAnuncio, LinkAnuncio, LogoMarca, RotuloAnuncio, useTemaLogo } from './pecas';

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
  const lg = (c: string) => (compacta ? '' : c);
  // logotipo (já traz o nome): o nome não se repete em texto ao lado — o título ganha o espaço
  const logotipo = ehLogotipo(a, useTemaLogo());
  return (
    <aside aria-label="Publicidade" className={cn(FUNDO, compacta ? ALTURA_TOPO_COMPACTA : ALTURA_TOPO, className)}>
      {/* no topo da página: a logo já está à vista, então o brilho carrega junto (sem `loading=lazy`) */}
      <BrilhoMarca anuncio={a} adiado={false} className="-left-10 -top-16 h-40 w-72 opacity-40 dark:opacity-30" />
      {/* telas estreitas (< 380 px): respiro lateral menor, para o título de 60 caracteres caber inteiro em 2 linhas */}
      <Container wide className={cn('relative h-full', compacta ? '!px-3' : 'max-[379px]:!px-3')}>
        {/* anel de foco por dentro: o fundo tem overflow-hidden e cortaria o anel de fora */}
        <LinkAnuncio
          ref={ref}
          anuncio={a}
          formato="topo"
          previa={previa}
          anelDentro
          // -mx-2 px-2: o anel de foco (por dentro) ganha folga e não passa por cima do rótulo nem do botão
          className={cn('-mx-2 flex h-full min-w-0 items-center gap-2.5 rounded-xl px-2 max-[379px]:gap-2', lg('lg:gap-3.5'))}
        >
          {/* "Publicidade" (não "Oferecido por"): logo acima do título de uma página, "Oferecido por" soava como patrocínio
              da apuração ou do Palpite */}
          <RotuloAnuncio className={cn('hidden', lg('lg:inline'))}>Publicidade</RotuloAnuncio>
          <span aria-hidden className={cn('hidden h-7 w-px shrink-0 bg-line', lg('lg:block'))} />
          <LogoMarca
            anuncio={a}
            prioridade
            className={cn('[--logo-h:34px] [--logo-max:104px] max-[399px]:[--logo-max:88px] max-[379px]:[--logo-max:76px]', lg('lg:[--logo-h:40px] lg:[--logo-max:200px]'))}
          />
          {logotipo ? <span aria-hidden className={cn('h-8 w-px shrink-0 bg-line', lg('lg:hidden'))} /> : null}
          {/* celular e tablet: "Publicidade" (· marca, sem logotipo) + o título INTEIRO em até duas linhas */}
          <span className={cn('min-w-0 flex-1', lg('lg:hidden'))}>
            <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold uppercase leading-[1.2] tracking-[0.12em] text-fg-subtle">
              <span className="shrink-0">Publicidade</span>
              {logotipo ? null : (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate normal-case tracking-normal text-fg-muted">{a.marca}</span>
                </>
              )}
            </span>
            <span className="mt-[3px] line-clamp-2 text-pretty text-[13px] font-semibold leading-[1.16] text-fg">{a.titulo}</span>
          </span>
          {/* a partir de 1024 px: uma linha */}
          {compacta ? null : (
            <span className="hidden min-w-0 flex-1 items-baseline gap-2 text-[15px] lg:flex">
              {logotipo ? null : (
                <>
                  <span className="shrink-0 font-semibold text-fg">{a.marca}</span>
                  <span aria-hidden className="text-fg-subtle">·</span>
                </>
              )}
              <span className={cn('truncate', logotipo ? 'font-semibold text-fg' : 'text-fg-muted')}>{a.titulo}</span>
            </span>
          )}
          {a.destino && !compacta ? <span className="hidden shrink-0 text-[12.5px] text-fg-subtle xl:inline">{a.destino}</span> : null}
          {/* abaixo de 1024 px (e na prévia estreita): só a seta, para o título caber inteiro; o texto do botão segue no
              rótulo do link */}
          <CtaAnuncio texto={a.cta} tamanho="sm" className={cn('hidden', lg('lg:inline-flex'))} />
          <span
            aria-hidden
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-bg transition-opacity group-hover:opacity-90',
              lg('lg:hidden'),
            )}
          >
            <Icon name="seta" size={15} />
          </span>
        </LinkAnuncio>
      </Container>
    </aside>
  );
}
