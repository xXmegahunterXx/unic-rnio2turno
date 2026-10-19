/**
 * Peças do formato 'nativo' (regras e o slot em AnuncioNativo.tsx): o cartão do anunciante (`faixa` ou `cartao`, com a
 * peça inteira) e o anúncio da casa. Chunk à parte: carregado pelo slot e usado direto pela /anuncie e pela prévia.
 *
 * Anunciantes v2: logotipo grande em cima do título (sem a linha da marca em texto); peça TRANSPARENTE com ajuste numa
 * área da cor pedida pelo contraste (placa clara, placa escura ou a superfície), sem a cópia desfocada atrás quando há
 * placa; peça com ajuste tem a altura reservada pela proporção (nada pula quando chega).
 */
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AnuncioPublico } from '@/shared/anuncios';
import { LOGO_NATURAL } from '@/shared/anuncios-flags';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { LogoMark } from '@/app/components/layout/Logo';
import { useImpressaoVisivel } from './impressao';
import { ehLogotipo, placaDaPeca } from './logo';
import { imagemDoAnuncio } from './nucleo';
import { BrilhoMarca, CtaAnuncio, DestinoAnuncio, LinkAnuncio, LogoMarca, RotuloAnuncio, useTemaLogo } from './pecas';

export type VarianteNativo = 'auto' | 'faixa' | 'cartao';

export function AnuncioNativoPeca({
  anuncio: a,
  variante = 'auto',
  bloco = 'nativo',
  vista = 'previa',
  previa,
  pecaPrevia,
  empilhado,
  className,
}: {
  anuncio: AnuncioPublico;
  variante?: VarianteNativo;
  bloco?: string;
  vista?: string;
  previa?: boolean;
  /** só na prévia (/anuncie): no lugar da peça, um desenho de exemplo */
  pecaPrevia?: ReactNode;
  /** sempre em coluna (peça em cima, botão embaixo), mesmo em tela larga — para colunas estreitas */
  empilhado?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useImpressaoVisivel(ref, { id: a.id, formato: 'nativo', bloco, vista, ativo: !previa });
  const tema = useTemaLogo();
  const logotipo = ehLogotipo(a, tema);
  const peca = imagemDoAnuncio(a.imagem);
  // peça transparente com ajuste: o fundo da área pela placa do tema (null = peça opaca ou sem ajuste: como antes)
  const placaPeca = placaDaPeca(a, tema);
  const propPeca = LOGO_NATURAL && a.imagemAjuste && a.imagemAjuste.proporcao > 0 ? a.imagemAjuste.proporcao : null;
  const temPeca = !!peca || (previa && !!pecaPrevia);
  const tipo = variante === 'auto' ? (temPeca ? 'cartao' : 'faixa') : variante === 'cartao' && !temPeca ? 'faixa' : variante;

  const cabecalho = (
    <div className="flex items-center justify-between gap-3">
      <RotuloAnuncio chip>Patrocinado</RotuloAnuncio>
      <DestinoAnuncio destino={a.destino} />
    </div>
  );

  const corpo = (titulo: string) => (
    <>
      {logotipo ? (
        // logotipo: a logo em cima, grande e na proporção natural (é ela que o anunciante paga para mostrar), e o título
        // embaixo — sem a linha da marca em texto (o nome segue no rótulo do link)
        <div className="min-w-0">
          <LogoMarca
            anuncio={a}
            className={tipo === 'faixa' ? '[--logo-h:48px] [--logo-max:240px] sm:[--logo-h:60px] sm:[--logo-max:300px]' : '[--logo-h:40px] [--logo-max:220px]'}
          />
          <p className={cn('mt-3.5 text-balance font-display font-semibold leading-[1.12] tracking-[-0.02em] text-fg', titulo)}>{a.titulo}</p>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          <LogoMarca anuncio={a} className={tipo === 'faixa' ? '[--logo-h:56px] [--logo-max:104px] sm:[--logo-h:72px] sm:[--logo-max:120px]' : '[--logo-h:48px] [--logo-max:96px]'} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-fg-muted">{a.marca}</p>
            <p className={cn('mt-0.5 text-balance font-display font-semibold leading-[1.12] tracking-[-0.02em] text-fg', titulo)}>{a.titulo}</p>
          </div>
        </div>
      )}
      {a.texto ? <p className="mt-3 text-pretty text-[14px] leading-relaxed text-fg-muted sm:text-[15px]">{a.texto}</p> : null}
    </>
  );

  return (
    // data-chat-evita: o popup do chat não fica por cima de um anúncio (um anunciante não tapa o de outro; a impressão
    // visível contaria coberta) — chat/regiao.ts
    <aside aria-label="Publicidade" data-chat-evita className={cn('relative', className)}>
      <LinkAnuncio
        ref={ref}
        anuncio={a}
        formato="nativo"
        previa={previa}
        className="relative isolate block overflow-hidden rounded-3xl border border-line bg-surface shadow-card transition-[border-color,transform] duration-200 hover:border-line/[2.2]"
      >
        <BrilhoMarca anuncio={a} className="-right-24 -top-28 -z-10 h-72 w-72 opacity-50 dark:opacity-35" />
        {tipo === 'cartao' ? (
          <div className={cn('grid grid-cols-1 gap-0', !empilhado && 'md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]')}>
            <div
              data-peca-placa={peca ? (placaPeca ?? 'legado') : undefined}
              className={cn(
                'relative flex min-h-[180px] items-center justify-center overflow-hidden',
                placaPeca === 'clara' ? 'bg-placa-clara' : placaPeca === 'escura' ? 'bg-placa-escura' : 'bg-surface-2',
                // peça transparente: respiro em volta (o desenho já vem sem margens vazias)
                peca && placaPeca && 'p-4 sm:p-6',
                !empilhado && 'md:order-2 md:min-h-[300px]',
              )}
            >
              {peca ? (
                <>
                  {/* fundo feito da própria peça (desfocada), para a peça inteira caber sem corte e sem faixas vazias — não
                      quando a peça transparente está numa placa (o fundo é a placa) */}
                  {/* a mesma URL nas duas (um download só), baixada perto da tela e com prioridade baixa: não disputa banda
                      com a foto do topo da página */}
                  {placaPeca === 'clara' || placaPeca === 'escura' ? null : (
                    <img
                      src={peca}
                      alt=""
                      aria-hidden
                      decoding="async"
                      loading="lazy"
                      fetchPriority="low"
                      className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl"
                    />
                  )}
                  <img
                    src={peca}
                    alt={`Peça publicitária de ${a.marca}`}
                    decoding="async"
                    loading="lazy"
                    fetchPriority="low"
                    // com ajuste: largura e proporção reservadas (altura máxima de 320/360 px), nada pula quando a peça chega
                    style={propPeca ? ({ aspectRatio: String(propPeca), width: `min(100%, calc(var(--peca-h) * ${propPeca}))` } as CSSProperties) : undefined}
                    className={cn(
                      'relative object-contain',
                      propPeca ? 'h-auto max-w-full [--peca-h:320px] md:[--peca-h:360px]' : 'max-h-[320px] w-auto max-w-full md:max-h-[360px]',
                    )}
                  />
                </>
              ) : (
                pecaPrevia
              )}
            </div>
            <div className={cn('flex min-w-0 flex-col p-4 sm:p-6', !empilhado && 'md:order-1 md:p-7')}>
              {cabecalho}
              <div className="mt-4 sm:mt-5">{corpo(empilhado ? 'text-[22px] sm:text-[24px]' : 'text-[22px] sm:text-[26px] lg:text-[30px]')}</div>
              <div className={cn('mt-5 flex flex-wrap items-center gap-x-4 gap-y-2', !empilhado && 'md:mt-auto md:pt-6')}>
                <CtaAnuncio texto={a.cta} tamanho="lg" className="w-full sm:w-auto" />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            {cabecalho}
            <div className={cn('mt-4 flex flex-col gap-5 sm:mt-5', !empilhado && 'md:flex-row md:items-center md:gap-8')}>
              <div className="min-w-0 flex-1">{corpo('text-[20px] sm:text-[24px]')}</div>
              <CtaAnuncio texto={a.cta} tamanho="lg" className={cn('w-full', !empilhado && 'md:w-auto')} />
            </div>
          </div>
        )}
      </LinkAnuncio>
    </aside>
  );
}

/** Anúncio da casa: o espaço está disponível. Leva a /anuncie (link interno, sem contagem). */
export function AnuncioDaCasa({ className }: { className?: string }) {
  return (
    <aside aria-label="Espaço publicitário" data-chat-evita className={cn('relative', className)}>
      <Link
        to="/anuncie"
        className="group relative isolate block overflow-hidden rounded-3xl border border-dashed border-line/[2.5] bg-surface/70 p-4 transition-colors hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-6"
      >
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-brand/10 blur-3xl" />
        <div className="flex items-center justify-between gap-3">
          <RotuloAnuncio chip>Espaço publicitário</RotuloAnuncio>
          <span className="text-[12px] text-fg-subtle">Anunciantes não políticos</span>
        </div>
        <div className="mt-4 flex flex-col gap-5 sm:mt-5 md:flex-row md:items-center md:gap-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <LogoMark size={56} className="sm:h-[72px] sm:w-[72px]" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-fg-muted">Anuncie no Sintonia</p>
              <p className="mt-0.5 text-balance font-display text-[20px] font-semibold leading-[1.12] tracking-[-0.02em] text-fg sm:text-[24px]">
                Sua marca aqui, na noite da apuração
              </p>
              <p className="mt-1.5 hidden text-pretty text-[14px] leading-relaxed text-fg-muted sm:block">
                Faixa no topo, cartões no conteúdo, Teste Cego, Modo TV e imagens de compartilhamento. Sempre identificado como publicidade.
              </p>
            </div>
          </div>
          <span className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-surface-2 px-5 text-[15px] font-semibold text-fg transition-colors group-hover:bg-surface-3 md:w-auto">
            Ver formatos
            <Icon name="seta" size={18} className="-mr-0.5" />
          </span>
        </div>
      </Link>
    </aside>
  );
}
