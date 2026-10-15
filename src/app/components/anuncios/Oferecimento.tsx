/**
 * Formatos 'teste' e 'tv'.
 *
 *  - Teste Cego: "Teste Cego oferecido por [logo] Marca" + botão. A marca fica com o Teste Cego (a ferramenta), nunca
 *    com o resultado: o bloco só aparece depois de revelar, LONGE do cartão do resultado (depois das ações de
 *    compartilhar e dos avisos — ResultadoPage), com borda própria.
 *  - Modo TV: "Oferecimento" + logo + marca, sem link (é uma tela de TV), FORA do placar: na barra do topo (TV deitada,
 *    ao lado da marca do Sintonia) ou numa faixa própria acima do letreiro (retrato). A marca nunca é cortada (até 2
 *    linhas). Medidas em `--u` (unidade da TV, ≈ 1% da altura útil). Antes de o status chegar, a altura fica
 *    reservada se a última consulta tinha anúncio de TV (sem pulo de layout).
 */
import { useRef } from 'react';
import type { AnuncioPublico } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { useAnunciosDaPagina } from './contexto';
import { useImpressaoVisivel } from './impressao';
import { imagemDoAnuncio, iniciaisDaMarca } from './nucleo';
import { BrilhoMarca, CtaAnuncio, LinkAnuncio, LogoMarca, RotuloAnuncio } from './pecas';
import { tvEsperado } from './visita';

/** Slot do Teste Cego (página de resultado). */
export function OferecimentoTeste({ className }: { className?: string }) {
  const { escolha, vista, semProvedor, pronto } = useAnunciosDaPagina();
  if (semProvedor || !pronto || !escolha.teste) return null;
  return <OferecimentoTestePeca anuncio={escolha.teste} vista={vista} className={className} />;
}

export function OferecimentoTestePeca({
  anuncio: a,
  vista = 'previa',
  previa,
  compacta,
  className,
}: {
  anuncio: AnuncioPublico;
  vista?: string;
  previa?: boolean;
  /** força a versão empilhada do celular (prévia em coluna estreita) */
  compacta?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useImpressaoVisivel(ref, { id: a.id, formato: 'teste', bloco: 'teste', vista, ativo: !previa });
  const sm = (c: string) => (compacta ? '' : c);
  return (
    <aside aria-label="Publicidade" className={cn('relative', className)}>
      <LinkAnuncio
        ref={ref}
        anuncio={a}
        formato="teste"
        previa={previa}
        className={cn(
          'relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-line bg-surface px-4 py-5 text-center shadow-card',
          sm('sm:flex-row sm:gap-5 sm:px-6 sm:py-4 sm:text-left'),
        )}
      >
        <BrilhoMarca anuncio={a} className="-left-16 -top-20 -z-10 h-56 w-56 opacity-45 dark:opacity-30" />
        <div className={cn('flex min-w-0 flex-col items-center gap-3', sm('sm:flex-1 sm:flex-row sm:gap-4'))}>
          <LogoMarca anuncio={a} tamanho="lg" />
          <div className="min-w-0">
            <RotuloAnuncio>Teste Cego oferecido por</RotuloAnuncio>
            <p className="mt-1.5 truncate font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg">{a.marca}</p>
            <p className="mt-0.5 text-pretty text-[13.5px] leading-snug text-fg-muted">{a.titulo}</p>
          </div>
        </div>
        <CtaAnuncio texto={a.cta} tamanho="md" className={cn('w-full', sm('sm:w-auto'))} />
      </LinkAnuncio>
    </aside>
  );
}

/**
 * Variantes da peça da TV:
 *  - 'cabecalho': compacta, para a barra do topo (TV deitada) — altura fixa de ~6 u, como o relógio ao lado;
 *  - 'faixa': faixa larga e centralizada acima do letreiro (retrato);
 *  - 'quadro': a peça maior (prévias).
 */
export type VarianteTv = 'cabecalho' | 'faixa' | 'quadro';

const ALTURA_TV: Record<VarianteTv, string> = {
  cabecalho: 'h-[calc(var(--u)*6.6)]',
  faixa: 'h-[calc(var(--u)*9)]',
  quadro: 'min-h-[calc(var(--u)*9)]',
};

/** Slot do Modo TV. */
export function OferecimentoTv({ className, variante = 'quadro' }: { className?: string; variante?: VarianteTv }) {
  const { escolha, vista, semProvedor, pronto } = useAnunciosDaPagina();
  if (semProvedor) return null;
  if (!escolha.tv) {
    // antes do status: reserva a altura se a última consulta tinha anúncio de TV (o placar e o mapa não pulam)
    if (!pronto && tvEsperado()) return <div aria-hidden className={cn(ALTURA_TV[variante], className)} />;
    return null;
  }
  return <OferecimentoTvPeca anuncio={escolha.tv} vista={vista} variante={variante} className={className} />;
}

/** Peça da TV: medidas em `--u` (fora do Modo TV, defina `--u` no contêiner — a prévia usa ~1 px × fator). */
export function OferecimentoTvPeca({
  anuncio: a,
  vista = 'previa',
  previa,
  variante = 'quadro',
  className,
}: {
  anuncio: AnuncioPublico;
  vista?: string;
  previa?: boolean;
  variante?: VarianteTv;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useImpressaoVisivel(ref, { id: a.id, formato: 'tv', bloco: 'tv', vista, ativo: !previa });
  const logo = imagemDoAnuncio(a.logo);
  const compacta = variante === 'cabecalho';
  const caixa = compacta ? 'h-[calc(var(--u)*6.4)] w-[calc(var(--u)*6.4)] rounded-[calc(var(--u)*1.5)] p-[calc(var(--u)*0.7)]' : 'h-[calc(var(--u)*9)] w-[calc(var(--u)*9)] rounded-[calc(var(--u)*2)] p-[calc(var(--u)*1)]';
  return (
    <div
      ref={ref}
      role="group"
      aria-label={`Publicidade: oferecimento de ${a.marca}`}
      className={cn('flex min-w-0 items-center', compacta ? 'gap-[calc(var(--u)*1.1)]' : 'gap-[calc(var(--u)*1.6)]', ALTURA_TV[variante], className)}
    >
      {logo ? (
        <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden bg-brand-ink ring-1 ring-inset ring-line', caixa)}>
          <img src={logo} alt="" decoding="async" className="h-full w-full object-contain" />
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            'inline-flex shrink-0 items-center justify-center bg-surface-3 font-display font-semibold text-fg ring-1 ring-inset ring-line',
            caixa,
            compacta ? 'text-[length:calc(var(--u)*2.4)]' : 'text-[length:calc(var(--u)*3.4)]',
          )}
        >
          {iniciaisDaMarca(a.marca)}
        </span>
      )}
      <div className="min-w-0">
        <div className={cn('font-semibold uppercase leading-none tracking-[0.16em] text-fg-subtle', compacta ? 'text-[length:calc(var(--u)*1.25)]' : 'text-[length:calc(var(--u)*1.5)]')}>
          Oferecimento
        </div>
        {/* a marca é o que o anunciante paga para mostrar: nunca cortada (quebra em até 2 linhas) */}
        <div
          className={cn(
            'line-clamp-2 break-words font-display font-semibold tracking-[-0.02em] text-fg [overflow-wrap:anywhere]',
            compacta ? 'mt-[calc(var(--u)*0.45)] text-[length:calc(var(--u)*2.2)] leading-[1.05]' : 'mt-[calc(var(--u)*0.3)] text-[length:calc(var(--u)*3.2)] leading-tight',
          )}
        >
          {a.marca}
        </div>
        {a.destino && !compacta ? <div className="mt-[calc(var(--u)*0.2)] truncate text-[length:calc(var(--u)*1.6)] text-fg-muted">{a.destino}</div> : null}
      </div>
    </div>
  );
}
