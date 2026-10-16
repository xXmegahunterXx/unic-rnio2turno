/**
 * Vitrine dos formatos: cada peça real (em modo prévia) dentro de uma moldura que lembra a página do site. Usada na
 * página /anuncie (com um anúncio de exemplo) e na prévia do painel (com o anúncio que está sendo cadastrado).
 */
import type { ReactNode } from 'react';
import type { AnuncioPublico, FormatoAnuncio } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { LogoMark } from '@/app/components/layout/Logo';
import { AnuncioNativoPeca } from './AnuncioNativoPeca';
import { BarraRodapePeca } from './BarraRodape';
import { FaixaTopoPeca } from './FaixaTopoPeca';
import { apresentacaoLogo } from './logo';
import { imagemDoAnuncio } from './nucleo';
import { OferecimentoTestePeca, OferecimentoTvPeca } from './Oferecimento';
import { LogoMarca, TemaLocal } from './pecas';
import { MolduraChatVitrine } from './OferecimentoChat';
import { MolduraLiveVitrine } from '@/app/components/live/Cena';

/** Linhas cinzas que fazem as vezes do conteúdo do site em volta da peça. */
function Conteudo({ linhas = 2, className }: { linhas?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-2', className)}>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className={cn('h-2.5 rounded-full bg-surface-3', i % 2 ? 'w-2/3' : 'w-11/12')} />
      ))}
    </div>
  );
}

function MiniCabecalho() {
  return (
    <div aria-hidden className="flex h-11 items-center gap-2 border-b border-line bg-surface px-4">
      <LogoMark size={22} />
      <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-fg">Sintonia</span>
      <span className="ml-auto h-6 w-16 rounded-full bg-surface-3" />
    </div>
  );
}

/**
 * Um formato desenhado dentro de uma "moldura" que lembra a página do site, com a peça REAL em modo prévia (sem link
 * e sem contagem). `pecaPrevia`: desenho no lugar da peça quando o anúncio não tem uma (vitrine da /anuncie).
 */
export function VitrineFormato({
  anuncio,
  formato,
  pecaPrevia,
  estreita,
}: {
  anuncio: AnuncioPublico;
  formato: FormatoAnuncio;
  pecaPrevia?: ReactNode;
  /** coluna estreita (prévia do painel): o cartão com peça fica sempre empilhado */
  estreita?: boolean;
}) {
  const temPeca = !!imagemDoAnuncio(anuncio.imagem) || !!pecaPrevia;
  switch (formato) {
    case 'topo':
      return (
        <div className="overflow-hidden rounded-2xl border border-line bg-bg">
          <MiniCabecalho />
          <FaixaTopoPeca anuncio={anuncio} previa compacta={estreita} />
          <div className="space-y-3 p-4">
            <Conteudo />
            <div aria-hidden className="h-20 rounded-xl bg-surface-2" />
          </div>
        </div>
      );
    case 'rodape':
      return (
        <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[30px] border border-line bg-bg">
          <div className="space-y-3 p-4 pb-3">
            <Conteudo linhas={3} />
            <div aria-hidden className="h-28 rounded-xl bg-surface-2" />
            <Conteudo />
          </div>
          <div className="px-2 pb-2">
            <BarraRodapePeca anuncio={anuncio} previa />
          </div>
          <div aria-hidden className="grid h-12 grid-cols-5 border-t border-line bg-surface">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className="m-auto h-5 w-5 rounded-md bg-surface-3" />
            ))}
          </div>
        </div>
      );
    case 'nativo':
      return (
        <div className="grid grid-cols-1 gap-4">
          <div className="min-w-0 rounded-2xl border border-line bg-bg p-3 sm:p-4">
            <Conteudo className="mb-4" />
            <AnuncioNativoPeca anuncio={anuncio} previa variante="faixa" empilhado={estreita} />
            <p className="mt-3 text-center text-[12px] text-fg-subtle">Sem peça: faixa com logo, chamada, texto e botão</p>
          </div>
          {temPeca ? (
            <div className="min-w-0 rounded-2xl border border-line bg-bg p-3 sm:p-4">
              <Conteudo className="mb-4" />
              <AnuncioNativoPeca anuncio={anuncio} previa variante="cartao" pecaPrevia={pecaPrevia} empilhado={estreita} />
              <p className="mt-3 text-center text-[12px] text-fg-subtle">Com peça: a imagem aparece inteira, sem corte</p>
            </div>
          ) : null}
        </div>
      );
    case 'teste':
      return (
        <div className="rounded-2xl border border-line bg-bg p-3 sm:p-4">
          <div aria-hidden className="rounded-2xl border border-line bg-surface p-4 text-center">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">Teste Cego · resultado</p>
            <div className="mx-auto mt-3 h-4 w-44 rounded-full bg-surface-3" />
            <div className="mx-auto mt-4 grid max-w-[260px] grid-cols-2 gap-4">
              <div className="mx-auto h-16 w-16 rounded-full border-[6px] border-surface-3" />
              <div className="mx-auto h-16 w-16 rounded-full border-[6px] border-surface-3" />
            </div>
          </div>
          {/* no site: só depois de revelar, longe do cartão do resultado (depois do compartilhar e dos avisos) */}
          <div aria-hidden className="mt-3 grid grid-cols-2 gap-2">
            <div className="h-9 rounded-xl bg-surface-2" />
            <div className="h-9 rounded-xl bg-surface-2" />
          </div>
          <Conteudo linhas={2} className="mt-3" />
          <OferecimentoTestePeca anuncio={anuncio} previa compacta={estreita} className="mt-5 border-t border-line pt-5" />
        </div>
      );
    case 'tv':
      return (
        <div className="overflow-hidden rounded-2xl border border-line bg-bg [--u:3.4px] sm:[--u:4.6px]">
          <div className="flex aspect-video flex-col p-3 sm:p-4">
            {/* barra do topo: Sintonia · Oferecimento (fora do placar) · relógio */}
            <div className="flex items-center gap-2">
              <span aria-hidden className="flex shrink-0 items-center gap-2">
                <LogoMark size={18} />
                <span className="hidden font-display text-[12px] font-semibold text-fg sm:inline">Sintonia · Modo TV</span>
              </span>
              <span className="flex min-w-0 flex-1 justify-center">
                <span className="flex min-w-0 items-center border-l border-line pl-2.5">
                  <OferecimentoTvPeca anuncio={anuncio} previa variante="cabecalho" />
                </span>
              </span>
              <span aria-hidden className="num shrink-0 font-display text-[12px] font-semibold text-fg-muted">
                21:04
              </span>
            </div>
            <div aria-hidden className="mt-3 grid flex-1 grid-cols-[1fr_1.2fr] gap-3">
              <div className="rounded-xl bg-surface-2" />
              <div className="rounded-xl bg-surface-2" />
            </div>
          </div>
        </div>
      );
    case 'live':
      // modo streamer (/live no OBS): tela 16:9 de uma live com a peça real "Oferecido por" presa à marca do Sintonia
      return (
        <div className="overflow-hidden rounded-2xl border border-line bg-bg p-2 sm:p-3">
          <MolduraLiveVitrine anuncio={anuncio} />
        </div>
      );
    case 'chat':
      // chat ao vivo da apuração: a faixa real "Sala oferecida por" no topo de uma sala desenhada (sem mensagens reais)
      return (
        <div className="rounded-2xl border border-line bg-bg p-3 sm:p-4">
          <MolduraChatVitrine anuncio={anuncio} estreita={estreita} />
        </div>
      );
    case 'compartilhamento':
      // as imagens de compartilhamento são sempre escuras (servidor OG): a moldura também, com a logo do tema escuro
      return (
        <TemaLocal.Provider value="escuro">
          <VitrineCompartilhamento anuncio={anuncio} />
        </TemaLocal.Provider>
      );
  }
}

/**
 * Cartão de compartilhamento (1200×630) desenhado, com a faixa "Oferecimento" no pé como o servidor desenha (E7): com a
 * logo ajustada (versão para fundo escuro, se houver), "Oferecimento" + a logo; logo antiga ou sem logo, o texto
 * "Oferecimento: <marca>".
 */
function VitrineCompartilhamento({ anuncio }: { anuncio: AnuncioPublico }) {
  const comLogo = !!apresentacaoLogo(anuncio, 'escuro')?.ajuste;
  return (
    <div data-tema-local="escuro" className="overflow-hidden rounded-2xl border border-line bg-bg text-fg">
      <div className="relative aspect-[1200/630] w-full">
        <div aria-hidden className="absolute inset-0 flex flex-col p-[4%]">
          <div className="flex items-center gap-2">
            <LogoMark size={20} />
            <span className="font-display text-[13px] font-semibold text-fg">Sintonia</span>
          </div>
          <div className="mt-[3%] h-3 w-1/3 rounded-full bg-surface-3" />
          <div className="mt-[3%] flex flex-1 items-end gap-[3%] pb-[6%]">
            <div className="h-3/4 flex-1 rounded-xl bg-surface-2" />
            <div className="h-3/4 flex-1 rounded-xl bg-surface-2" />
          </div>
        </div>
        {comLogo ? (
          <div className="absolute inset-x-0 bottom-0 flex h-[13%] min-h-[34px] items-center justify-center gap-2.5 border-t border-line bg-surface px-[4%]">
            <span className="text-[11px] text-fg-subtle sm:text-[13px]">Oferecimento</span>
            <LogoMarca anuncio={anuncio} className="[--logo-h:22px] [--logo-max:200px] sm:[--logo-h:26px] sm:[--logo-max:300px]" />
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 flex h-[11%] min-h-[22px] items-center justify-center gap-1.5 border-t border-line bg-surface px-[4%] text-[11px] sm:text-[13px]">
            <span className="text-fg-subtle">Oferecimento:</span>
            <span className="font-semibold text-fg">{anuncio.marca}</span>
          </div>
        )}
      </div>
    </div>
  );
}
