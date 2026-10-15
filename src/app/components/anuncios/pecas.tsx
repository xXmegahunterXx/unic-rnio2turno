/**
 * Peças comuns dos formatos de anúncio: logo do anunciante (placa clara do mesmo jeito nos dois temas), rótulo
 * ("Publicidade", "Patrocinado", "Oferecido por"), botão, brilho decorativo e o link patrocinado.
 *
 * Regras (ARCHITECTURE §1.5): sempre rotulado; link em nova aba com rel="sponsored noopener noreferrer"; nada de
 * animação piscante; cores só por tokens (a cor da marca aparece pela própria logo — o brilho é a logo desfocada).
 */
import { forwardRef, type ReactNode } from 'react';
import type { AnuncioPublico, FormatoAnuncio } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { hrefDoAnuncio, imagemDoAnuncio, iniciaisDaMarca } from './nucleo';

export type TamanhoLogo = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const CAIXA: Record<TamanhoLogo, string> = {
  xs: 'h-7 w-7 rounded-lg p-[3px] text-[10.5px]',
  sm: 'h-9 w-9 rounded-[11px] p-1 text-[12px]',
  md: 'h-12 w-12 rounded-[14px] p-1.5 text-[15px]',
  lg: 'h-14 w-14 rounded-2xl p-1.5 text-[18px]',
  xl: 'h-[72px] w-[72px] rounded-[20px] p-2 text-[22px]',
};

/**
 * Logo do anunciante numa placa clara (`bg-brand-ink`, branca nos dois temas: logos costumam ser feitas para fundo
 * claro). Sem logo: as iniciais da marca numa placa neutra.
 */
export function LogoMarca({
  anuncio,
  tamanho = 'md',
  className,
}: {
  anuncio: Pick<AnuncioPublico, 'logo' | 'marca'>;
  tamanho?: TamanhoLogo;
  className?: string;
}) {
  const src = imagemDoAnuncio(anuncio.logo);
  if (src)
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden bg-brand-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)] ring-1 ring-inset ring-line',
          CAIXA[tamanho],
          className,
        )}
      >
        <img src={src} alt="" decoding="async" draggable={false} className="h-full w-full object-contain" />
      </span>
    );
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-surface-3 font-display font-semibold tracking-[-0.02em] text-fg ring-1 ring-inset ring-line',
        CAIXA[tamanho],
        className,
      )}
    >
      {iniciaisDaMarca(anuncio.marca)}
    </span>
  );
}

/** Rótulo obrigatório de publicidade. */
export function RotuloAnuncio({ children, className, chip = false }: { children: ReactNode; className?: string; chip?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap text-[10.5px] font-semibold uppercase leading-none tracking-[0.13em] text-fg-subtle',
        chip && 'inline-flex h-[22px] items-center rounded-full border border-line bg-surface-2 px-2.5 text-fg-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Botão do anúncio (desenhado como botão, dentro do link do bloco inteiro). */
export function CtaAnuncio({ texto, className, tamanho = 'md' }: { texto: string; className?: string; tamanho?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-fg font-semibold text-bg transition-[opacity,transform] duration-150 group-hover:opacity-90 group-active:scale-[0.98]',
        tamanho === 'sm' && 'h-8 px-3 text-[12.5px]',
        tamanho === 'md' && 'h-10 px-4 text-[13.5px]',
        tamanho === 'lg' && 'h-12 px-5 text-[15px]',
        className,
      )}
    >
      {texto}
      <Icon name="seta" size={tamanho === 'lg' ? 18 : tamanho === 'sm' ? 14 : 16} className="-mr-0.5" />
    </span>
  );
}

/**
 * Brilho decorativo com as cores da própria marca: a logo, muito ampliada e desfocada, atrás do conteúdo. Sem logo,
 * nada (o cartão fica neutro). Só decoração (`aria-hidden`), não interfere no clique.
 */
export function BrilhoMarca({ anuncio, className }: { anuncio: Pick<AnuncioPublico, 'logo'>; className?: string }) {
  const src = imagemDoAnuncio(anuncio.logo);
  if (!src) return null;
  return (
    <span aria-hidden className={cn('pointer-events-none absolute select-none', className)}>
      <img src={src} alt="" decoding="async" draggable={false} className="h-full w-full scale-150 object-cover opacity-60 blur-3xl saturate-150" />
    </span>
  );
}

export interface LinkAnuncioProps {
  anuncio: AnuncioPublico;
  formato: FormatoAnuncio;
  /** prévia (admin, /anuncie): sem link nem contagem */
  previa?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * O bloco inteiro é um link patrocinado (alvo grande no celular). Na prévia vira um <div> sem link. O rótulo de
 * leitor de tela sempre diz que é publicidade e que abre em nova aba.
 */
export const LinkAnuncio = forwardRef<HTMLElement, LinkAnuncioProps>(function LinkAnuncio({ anuncio, formato, previa, className, children }, ref) {
  const href = previa ? null : hrefDoAnuncio(anuncio.href, formato, __DEMO__);
  const rotulo = `Publicidade de ${anuncio.marca}: ${anuncio.titulo}. ${anuncio.cta}${anuncio.destino ? ` em ${anuncio.destino}` : ''}`;
  if (!href)
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={cn('group', className)} aria-label={previa ? `Prévia: ${rotulo}` : rotulo} role="group">
        {children}
      </div>
    );
  return (
    <a
      ref={ref as React.Ref<HTMLAnchorElement>}
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      aria-label={`${rotulo} (abre em nova aba)`}
      className={cn('group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg', className)}
    >
      {children}
    </a>
  );
});

/** Domínio de destino com o ícone de "abre fora". */
export function DestinoAnuncio({ destino, className }: { destino: string; className?: string }) {
  if (!destino) return null;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-[12px] text-fg-subtle', className)}>
      <span className="truncate">{destino}</span>
      <Icon name="externo" size={12} className="shrink-0" />
    </span>
  );
}
