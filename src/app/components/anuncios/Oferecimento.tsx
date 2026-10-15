/**
 * Formatos 'teste' e 'tv'.
 *
 *  - Teste Cego: "Resultado oferecido por [logo] Marca" + botão, ABAIXO do cartão de resultado e separado dele
 *    (o cartão tem fotos, nomes e percentuais; o anúncio fica fora dele, com borda própria).
 *  - Modo TV: logo grande com "Oferecimento" no rodapé da tela de transmissão (sem link: é uma tela de TV). Medidas
 *    em `--u` (unidade da TV, ≈ 1% da altura útil).
 */
import { useRef } from 'react';
import type { AnuncioPublico } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { useAnunciosDaPagina } from './contexto';
import { useImpressaoVisivel } from './impressao';
import { imagemDoAnuncio, iniciaisDaMarca } from './nucleo';
import { BrilhoMarca, CtaAnuncio, LinkAnuncio, LogoMarca, RotuloAnuncio } from './pecas';

/** Slot do Teste Cego (página de resultado). */
export function OferecimentoTeste({ className }: { className?: string }) {
  const { escolha, vista, semProvedor, pronto } = useAnunciosDaPagina();
  if (semProvedor || !pronto || !escolha.teste) return null;
  return <OferecimentoTestePeca anuncio={escolha.teste} vista={vista} className={className} />;
}

export function OferecimentoTestePeca({ anuncio: a, vista = 'previa', previa, className }: { anuncio: AnuncioPublico; vista?: string; previa?: boolean; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  useImpressaoVisivel(ref, { id: a.id, formato: 'teste', bloco: 'teste', vista, ativo: !previa });
  return (
    <aside aria-label="Publicidade" className={cn('relative', className)}>
      <LinkAnuncio
        ref={ref}
        anuncio={a}
        formato="teste"
        previa={previa}
        className="relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-line bg-surface px-4 py-5 text-center shadow-card sm:flex-row sm:gap-5 sm:px-6 sm:py-4 sm:text-left"
      >
        <BrilhoMarca anuncio={a} className="-left-16 -top-20 -z-10 h-56 w-56 opacity-45 dark:opacity-30" />
        <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-1 sm:flex-row sm:gap-4">
          <LogoMarca anuncio={a} tamanho="lg" />
          <div className="min-w-0">
            <RotuloAnuncio>Resultado oferecido por</RotuloAnuncio>
            <p className="mt-1.5 truncate font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg">{a.marca}</p>
            <p className="mt-0.5 text-pretty text-[13.5px] leading-snug text-fg-muted">{a.titulo}</p>
          </div>
        </div>
        <CtaAnuncio texto={a.cta} tamanho="md" className="w-full sm:w-auto" />
      </LinkAnuncio>
    </aside>
  );
}

/** Slot do Modo TV. */
export function OferecimentoTv({ className }: { className?: string }) {
  const { escolha, vista, semProvedor } = useAnunciosDaPagina();
  if (semProvedor || !escolha.tv) return null;
  return <OferecimentoTvPeca anuncio={escolha.tv} vista={vista} className={className} />;
}

/** Peça da TV: medidas em `--u` (fora do Modo TV, defina `--u` no contêiner — a prévia usa ~1 px × fator). */
export function OferecimentoTvPeca({ anuncio: a, vista = 'previa', previa, className }: { anuncio: AnuncioPublico; vista?: string; previa?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useImpressaoVisivel(ref, { id: a.id, formato: 'tv', bloco: 'tv', vista, ativo: !previa });
  const logo = imagemDoAnuncio(a.logo);
  return (
    <div ref={ref} role="group" aria-label={`Publicidade: oferecimento de ${a.marca}`} className={cn('flex min-w-0 items-center gap-[calc(var(--u)*1.6)]', className)}>
      {logo ? (
        <span className="inline-flex h-[calc(var(--u)*9)] w-[calc(var(--u)*9)] shrink-0 items-center justify-center overflow-hidden rounded-[calc(var(--u)*2)] bg-brand-ink p-[calc(var(--u)*1)] ring-1 ring-inset ring-line">
          <img src={logo} alt="" decoding="async" className="h-full w-full object-contain" />
        </span>
      ) : (
        <span
          aria-hidden
          className="inline-flex h-[calc(var(--u)*9)] w-[calc(var(--u)*9)] shrink-0 items-center justify-center rounded-[calc(var(--u)*2)] bg-surface-3 font-display text-[length:calc(var(--u)*3.4)] font-semibold text-fg ring-1 ring-inset ring-line"
        >
          {iniciaisDaMarca(a.marca)}
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[length:calc(var(--u)*1.5)] font-semibold uppercase tracking-[0.16em] text-fg-subtle">Oferecimento</div>
        <div className="mt-[calc(var(--u)*0.3)] truncate font-display text-[length:calc(var(--u)*3.2)] font-semibold leading-tight tracking-[-0.02em] text-fg">
          {a.marca}
        </div>
        {a.destino ? <div className="mt-[calc(var(--u)*0.2)] truncate text-[length:calc(var(--u)*1.6)] text-fg-muted">{a.destino}</div> : null}
      </div>
    </div>
  );
}
