/**
 * Peças comuns dos formatos de anúncio: logo do anunciante (proporção natural, placa só quando o contraste pede),
 * rótulo ("Publicidade", "Patrocinado", "Oferecido por"), botão, brilho decorativo e o link patrocinado.
 *
 * Regras (ARCHITECTURE §1.5): sempre rotulado; link em nova aba com rel="sponsored noopener noreferrer"; nada de
 * animação piscante; cores só por tokens (a cor da marca aparece pela própria logo — o brilho é a logo desfocada).
 */
import { createContext, forwardRef, useContext, type CSSProperties, type ReactNode } from 'react';
import type { AnuncioPublico, FormatoAnuncio } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { useTheme } from '@/app/lib/useTheme';
import { hrefDoAnuncio, iniciaisDaMarca } from './nucleo';
import { apresentacaoLogo, type LogoDoAnuncio, type TemaLogo } from './logo';

export type TamanhoLogo = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Padrões por tamanho: altura do espaço da logo e largura máxima (logotipo). Entram como FALLBACK de `--logo-h` e
 * `--logo-max` (`cn` é só clsx, não resolve conflito de classes): quem chama define os dois por classe —
 * `[--logo-h:34px] [--logo-max:104px] lg:[--logo-h:40px]` — e o padrão só vale quando ninguém definiu.
 */
const PADRAO: Record<TamanhoLogo, { h: string; max: string }> = {
  xs: { h: '28px', max: '104px' },
  sm: { h: '36px', max: '120px' },
  md: { h: '48px', max: '150px' },
  lg: { h: '56px', max: '200px' },
  xl: { h: '72px', max: '240px' },
};

/**
 * Tema forçado num trecho da página (prévias claro | escuro do painel, vitrine das imagens de compartilhamento). Use
 * junto com `data-tema-local="claro|escuro"` no elemento (tokens de cor do trecho, styles.css). Fora dele vale o tema
 * do site (`data-theme` do <html>).
 */
export const TemaLocal = createContext<TemaLogo | null>(null);

/** Tema em que a logo é desenhada: o `TemaLocal`, se houver; senão, o do site. */
export function useTemaLogo(): TemaLogo {
  const local = useContext(TemaLocal);
  const { tema } = useTheme();
  return local ?? (tema === 'light' ? 'claro' : 'escuro');
}

/** Valor em CSS `calc(var(--lh) * f)` (frações do espaço da logo). */
const lh = (f: number) => `calc(var(--lh) * ${+f.toFixed(4)})`;

/**
 * Logo do anunciante (ARCHITECTURE §1.5; desenho medido no painel — `AjusteImagem`):
 *  - com ajuste: proporção NATURAL num espaço de altura `--logo-h` e largura máxima `--logo-max`; largura reservada
 *    pela proporção (nada pula quando a imagem chega). Sem placa: logotipo com 78% da altura, ícone (≤ 1,35) e imagem com
 *    fundo próprio com 100% (fundo próprio: cantos e filete — vira o "cartão" da marca). Com placa (o contraste pediu, ou
 *    o dono escolheu): placa clara/escura que abraça a imagem (no máximo a altura do espaço), folga de 12% × 20% (ícone:
 *    16% em volta), cantos de 26%;
 *  - sem ajuste (logo gravada antes) ou com `LOGO_NATURAL` desligado: o desenho antigo, a placa clara quadrada;
 *  - sem logo: as iniciais da marca numa placa neutra.
 * `prioridade`: sem `loading="lazy"` (faixa do topo, na 1ª dobra). Atributos para teste na raiz: `data-logo-placa`
 * (nenhuma|clara|escura|legado|monograma) e `data-logo-tema` (claro|escuro).
 */
export function LogoMarca({
  anuncio,
  tamanho = 'md',
  prioridade,
  className,
}: {
  anuncio: Partial<LogoDoAnuncio> & Pick<AnuncioPublico, 'marca'>;
  tamanho?: TamanhoLogo;
  prioridade?: boolean;
  className?: string;
}) {
  const tema = useTemaLogo();
  const ap = apresentacaoLogo(anuncio, tema);
  const vars = { '--lh': `var(--logo-h, ${PADRAO[tamanho].h})`, '--lm': `var(--logo-max, ${PADRAO[tamanho].max})` } as CSSProperties;
  const base = cn('inline-flex shrink-0 items-center justify-center', className);
  // com ajuste: num espaço mais estreito que a logo (barra do Modo TV com os controles à mostra), ela ENCOLHE inteira
  // (largura e altura, na proporção), nunca é cortada nem passa por cima do vizinho
  const encolhe = cn('inline-flex min-w-0 max-w-full shrink items-center justify-center', className);
  const carga = prioridade ? undefined : ('lazy' as const);
  if (!ap)
    return (
      <span
        aria-hidden
        data-logo-placa="monograma"
        data-logo-tema={tema}
        style={{ ...vars, fontSize: lh(0.34) }}
        className={cn(base, 'h-[var(--lh)] w-[var(--lh)] rounded-[calc(var(--lh)*0.28)] bg-surface-3 font-display font-semibold leading-none tracking-[-0.02em] text-fg ring-1 ring-inset ring-line')}
      >
        {iniciaisDaMarca(anuncio.marca)}
      </span>
    );
  if (!ap.ajuste)
    // DESENHO ANTIGO (logo sem ajuste ou interruptor desligado): placa quadrada, clara como sempre foi — a versão para
    // fundo escuro sem ajuste vai na placa escura (é branca/clara: na clara sumiria)
    return (
      <span
        data-logo-placa="legado"
        data-logo-tema={tema}
        style={{ ...vars, padding: lh(0.11) }}
        className={cn(
          base,
          'h-[var(--lh)] w-[var(--lh)] overflow-hidden rounded-[calc(var(--lh)*0.28)] shadow-[0_1px_2px_rgb(0_0_0/0.12)] ring-1 ring-inset ring-line',
          ap.escura ? 'bg-placa-escura' : 'bg-placa-clara',
        )}
      >
        <img src={ap.src} alt="" decoding="async" loading={carga} draggable={false} className="h-full w-full object-contain" />
      </span>
    );
  const placa = ap.placa === 'legado' ? 'nenhuma' : ap.placa;
  const comPlaca = placa !== 'nenhuma';
  const comFundo = !!ap.ajuste.comFundo;
  // altura da imagem (fração de --logo-h) e folga da placa: a caixa da imagem abraça o desenho (a largura sai da
  // proporção, limitada por --logo-max), então a placa, os cantos e o filete acompanham a logo de verdade. Placa com
  // logotipo: imagem com 76% da altura e folga de 12% × 20% (a logo no tema claro fica do tamanho da do escuro, sem
  // virar uma pílula escura com a marca miúda)
  const ih = comPlaca ? (ap.icone ? 0.68 : 0.76) : comFundo || ap.icone ? 1 : 0.78;
  const px = comPlaca ? (ap.icone ? 0.16 : 0.2) : 0;
  const py = comPlaca ? (1 - ih) / 2 : 0;
  // placa da mesma cor da superfície do tema (clara no claro, escura no escuro): um filete a separa; senão, sombra fina
  const mesmaCor = (placa === 'clara') === (tema === 'claro');
  return (
    <span
      data-logo-placa={placa}
      data-logo-tema={tema}
      style={comPlaca ? { ...vars, padding: `${lh(py)} ${lh(px)}` } : vars}
      className={cn(
        encolhe,
        // sem placa: o espaço tem a altura de --logo-h. Com placa: a placa ABRAÇA a imagem (folga + altura real dela) —
        // quando a largura máxima limita a imagem, a placa encolhe junto em vez de sobrar em volta
        !comPlaca && 'h-[var(--lh)]',
        comPlaca &&
          cn(
            'rounded-[calc(var(--lh)*0.26)]',
            placa === 'clara' ? 'bg-placa-clara' : 'bg-placa-escura',
            mesmaCor ? 'ring-1 ring-inset ring-line' : 'shadow-[0_1px_2px_rgb(0_0_0/0.18)]',
          ),
      )}
    >
      <img
        src={ap.src}
        alt=""
        decoding="async"
        loading={carga}
        draggable={false}
        // largura reservada pela proporção (nada pula quando a imagem chega), limitada pela largura máxima
        style={{
          width: `min(calc(var(--lm) - ${lh(2 * px)}), calc(var(--lh) * ${+ih.toFixed(4)} * ${ap.proporcao}))`,
          aspectRatio: String(ap.proporcao),
        }}
        className={cn('block h-auto max-w-full object-contain', comFundo && !comPlaca && 'rounded-[calc(var(--lh)*0.18)] ring-1 ring-line')}
      />
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
export function BrilhoMarca({ anuncio, className, adiado = true }: { anuncio: Partial<LogoDoAnuncio>; className?: string; adiado?: boolean }) {
  // a mesma imagem que a logo usa neste tema (a versão para fundo escuro, no escuro)
  const src = apresentacaoLogo(anuncio, useTemaLogo())?.src;
  if (!src) return null;
  return (
    <span aria-hidden className={cn('pointer-events-none absolute select-none', className)}>
      {/* decoração: baixa prioridade e só perto da tela (`adiado`), para não disputar banda com a foto do topo da página */}
      <img
        src={src}
        alt=""
        decoding="async"
        draggable={false}
        loading={adiado ? 'lazy' : undefined}
        fetchPriority="low"
        className="h-full w-full scale-150 object-cover opacity-60 blur-3xl saturate-150"
      />
    </span>
  );
}

export interface LinkAnuncioProps {
  anuncio: AnuncioPublico;
  formato: FormatoAnuncio;
  /** prévia (admin, /anuncie): sem link nem contagem */
  previa?: boolean;
  /** anel de foco por dentro (blocos com `overflow-hidden` em volta, como a faixa do topo: o anel de fora seria cortado) */
  anelDentro?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * O bloco inteiro é um link patrocinado (alvo grande no celular). Na prévia vira um <div> sem link. O rótulo de
 * leitor de tela sempre diz que é publicidade e que abre em nova aba.
 */
export const LinkAnuncio = forwardRef<HTMLElement, LinkAnuncioProps>(function LinkAnuncio({ anuncio, formato, previa, anelDentro, className, children }, ref) {
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
      className={cn(
        'group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        anelDentro ? 'focus-visible:ring-inset' : 'focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        className,
      )}
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
