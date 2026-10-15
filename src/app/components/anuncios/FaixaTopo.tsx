/**
 * Formato 'topo': faixa logo abaixo do cabeçalho em todas as páginas do AppShell ("Oferecido por" + logo + marca +
 * título + botão). A cota MASTER tem prioridade (escolherAnuncio).
 *
 *  - Desktop (≥ 768 px): dentro do cabeçalho fixo — fica sempre à vista e entra na altura `--app-header-h` (os
 *    elementos "sticky" das páginas descontam a faixa sozinhos).
 *  - Celular: logo abaixo do cabeçalho, rola junto com a página (a barra fixa do celular é o formato 'rodape';
 *    duas peças fixas tomariam a tela). Versão compacta: logo, título curto e botão.
 *  - Altura reservada antes de o status chegar (sem pulo de layout); sem anúncio no topo, a faixa não aparece.
 */
import { useRef } from 'react';
import type { AnuncioPublico } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Container } from '@/app/components/layout/Container';
import { useAnunciosDaPagina } from './contexto';
import { useImpressaoVisivel } from './impressao';
import { tituloCurto } from './nucleo';
import { BrilhoMarca, CtaAnuncio, LinkAnuncio, LogoMarca, RotuloAnuncio } from './pecas';
import { topoEsperado } from './visita';

/** Altura da faixa: 44 px no celular, 52 px a partir de 768 px. */
export const ALTURA_TOPO = 'h-11 md:h-[52px]';

const FUNDO = 'relative overflow-hidden border-b border-line bg-surface-2';

/** Faixa do topo (slot do AppShell). */
export function FaixaTopo({ className }: { className?: string }) {
  const { escolha, pronto, vista, semProvedor } = useAnunciosDaPagina();
  if (semProvedor) return null;
  const a = escolha.topo;
  if (!a) {
    // antes do status: reserva a altura se a última consulta tinha anúncio (ou se ainda não se sabe)
    if (!pronto && topoEsperado() !== false) return <div aria-hidden className={cn(FUNDO, ALTURA_TOPO, className)} />;
    return null;
  }
  return <FaixaTopoPeca anuncio={a} vista={vista} className={className} />;
}

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
  // classes que só valem a partir de 768 px (ou nunca, na versão compacta)
  const md = (c: string) => (compacta ? '' : c);
  return (
    <aside aria-label="Publicidade" className={cn(FUNDO, compacta ? 'h-11' : ALTURA_TOPO, className)}>
      <BrilhoMarca anuncio={a} className="-left-10 -top-16 h-40 w-72 opacity-40 dark:opacity-30" />
      <Container wide className={cn('relative h-full', compacta && '!px-3')}>
        <LinkAnuncio ref={ref} anuncio={a} formato="topo" previa={previa} className={cn('flex h-full min-w-0 items-center gap-2.5 rounded-xl', md('md:gap-3'))}>
          <RotuloAnuncio className={cn('hidden', md('lg:inline'))}>Oferecido por</RotuloAnuncio>
          <LogoMarca anuncio={a} tamanho="xs" className={md('md:h-8 md:w-8')} />
          {/* celular: marca + título curto em duas linhas */}
          <span className={cn('min-w-0 flex-1 leading-tight', md('md:hidden'))}>
            <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              <span className="shrink-0">Publicidade</span>
              <span aria-hidden>·</span>
              <span className="truncate normal-case tracking-normal text-fg-muted">{a.marca}</span>
            </span>
            <span className="mt-0.5 block truncate text-[13.5px] font-semibold text-fg">{tituloCurto(a.titulo)}</span>
          </span>
          {/* tablet/desktop: uma linha */}
          {compacta ? null : (
            <span className="hidden min-w-0 flex-1 items-baseline gap-2 md:flex">
              <span className="shrink-0 text-[14px] font-semibold text-fg">{a.marca}</span>
              <span aria-hidden className="text-fg-subtle">·</span>
              <span className="truncate text-[14px] text-fg-muted">{a.titulo}</span>
              <RotuloAnuncio className="ml-1 lg:hidden">Publicidade</RotuloAnuncio>
            </span>
          )}
          {a.destino && !compacta ? <span className="hidden shrink-0 text-[12.5px] text-fg-subtle xl:inline">{a.destino}</span> : null}
          <CtaAnuncio texto={a.cta} tamanho="sm" className="max-[359px]:hidden" />
        </LinkAnuncio>
      </Container>
    </aside>
  );
}
