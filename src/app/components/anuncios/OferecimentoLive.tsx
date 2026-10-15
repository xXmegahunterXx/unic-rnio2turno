/**
 * Formato 'live' (modo streamer, /live): "Oferecido por <marca>" nos layouts que os streamers põem na transmissão pela
 * fonte de navegador do OBS/Streamlabs. Contrato: src/shared/anuncios.ts (não muda aqui).
 *
 *  - SEM link (a live é vídeo: ninguém clica no OBS) — a peça é um bloco rotulado, nunca um <a>.
 *  - FORA do placar: na barra do topo dos layouts de tela cheia (ao lado da marca do Sintonia, separada por um filete),
 *    ou numa aba própria colada à marca/endereço do Sintonia na barra e no quadro do canto — nunca encostada em foto,
 *    nome ou número de candidato. A marca nunca é cortada (quebra em até 2 linhas).
 *  - Escolha: `escolherAnuncio(…, 'live', …)` (a cota MASTER tem prioridade). Numa live de horas, quando há mais de um
 *    anunciante elegível, eles se revezam a cada `ROTACAO_LIVE_MS` (escolha determinística por visita + janela).
 *  - Impressão: a mesma regra dos outros formatos (`useImpressaoVisivel`: ≥ 50% na tela por ≥ 1 s, com a aba visível),
 *    uma vez por anúncio por carregamento da página. No OBS, um carregamento = uma fonte de navegador ligada (ou
 *    atualizada ao ativar a cena). NÃO é a audiência da live — quantas pessoas assistem cada transmissão só a
 *    plataforma (Twitch/YouTube/Kick) sabe.
 *  - Medidas em `--u` (≈ 1% da altura da tela da live).
 */
import { useRef } from 'react';
import { escolherAnuncio } from '@/shared/anuncios-escolha';
import type { AnuncioPublico } from '@/shared/anuncios';
import { useStatus } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { useNow } from '@/app/lib/useNow';
import { useImpressaoVisivel } from './impressao';
import { imagemDoAnuncio, iniciaisDaMarca } from './nucleo';
import { idDaVisita } from './visita';

/** Revezamento entre anunciantes elegíveis numa live longa (com um só anunciante, nada muda). */
export const ROTACAO_LIVE_MS = 5 * 60_000;

/**
 * Variantes:
 *  - 'cabecalho': na barra do topo dos layouts de tela cheia (placar, mapa) — rótulo em cima, logo e marca;
 *  - 'aba': pílula compacta presa à marca do Sintonia (barra inferior e quadro do canto).
 */
export type VarianteLive = 'cabecalho' | 'aba';

/** Anúncio do formato 'live' para esta fonte agora (null = nenhum no ar). Puro (testado). */
export function anuncioDaLive(anuncios: readonly AnuncioPublico[] | null | undefined, visita: string, agora: number): AnuncioPublico | null {
  return escolherAnuncio(anuncios, 'live', `${visita}|live|${Math.floor(agora / ROTACAO_LIVE_MS)}`);
}

/** O anúncio 'live' em vigor (status ao vivo; troca na janela de revezamento). */
export function useAnuncioLive(): AnuncioPublico | null {
  const anuncios = useStatus().data?.anuncios;
  // a janela de revezamento muda a cada 5 min: relógio de 30 s basta
  const agora = useNow(30_000);
  return anuncioDaLive(anuncios, idDaVisita(), agora);
}

export function OferecimentoLivePeca({
  anuncio: a,
  variante = 'cabecalho',
  previa,
  vista = 'live',
  className,
}: {
  anuncio: AnuncioPublico;
  variante?: VarianteLive;
  /** prévia (/streamers, /anuncie, admin): não conta impressão */
  previa?: boolean;
  /** carregamento da página (reinicia a contagem de impressões) */
  vista?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useImpressaoVisivel(ref, { id: a.id, formato: 'live', bloco: 'live', vista, ativo: !previa });
  const logo = imagemDoAnuncio(a.logo);
  const aba = variante === 'aba';
  const caixa = aba
    ? 'h-[calc(var(--u)*3.6)] w-[calc(var(--u)*3.6)] rounded-[calc(var(--u)*0.9)] p-[calc(var(--u)*0.4)]'
    : 'h-[calc(var(--u)*5.6)] w-[calc(var(--u)*5.6)] rounded-[calc(var(--u)*1.3)] p-[calc(var(--u)*0.6)]';
  return (
    <div
      ref={ref}
      role="group"
      aria-label={`Publicidade: oferecido por ${a.marca}`}
      data-anuncio-live={a.id}
      className={cn('flex min-w-0 items-center', aba ? 'gap-[calc(var(--u)*0.9)]' : 'gap-[calc(var(--u)*1.2)]', className)}
    >
      {aba ? (
        <span className="shrink-0 whitespace-nowrap text-[length:calc(var(--u)*1.15)] font-semibold uppercase leading-none tracking-[0.14em] text-fg-subtle">
          Oferecido por
        </span>
      ) : null}
      {logo ? (
        <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden bg-brand-ink ring-1 ring-inset ring-line', caixa)}>
          <img src={logo} alt="" decoding="async" draggable={false} className="h-full w-full object-contain" />
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            'inline-flex shrink-0 items-center justify-center bg-surface-3 font-display font-semibold text-fg ring-1 ring-inset ring-line',
            caixa,
            aba ? 'text-[length:calc(var(--u)*1.4)]' : 'text-[length:calc(var(--u)*2.1)]',
          )}
        >
          {iniciaisDaMarca(a.marca)}
        </span>
      )}
      <div className="min-w-0">
        {!aba ? (
          <div className="whitespace-nowrap text-[length:calc(var(--u)*1.2)] font-semibold uppercase leading-none tracking-[0.16em] text-fg-subtle">Oferecido por</div>
        ) : null}
        {/* a marca é o que o anunciante paga para mostrar: nunca cortada (quebra em até 2 linhas) */}
        <div
          className={cn(
            'line-clamp-2 break-words font-display font-semibold tracking-[-0.02em] text-fg [overflow-wrap:anywhere]',
            aba ? 'text-[length:calc(var(--u)*1.9)] leading-[1.05]' : 'mt-[calc(var(--u)*0.45)] text-[length:calc(var(--u)*2.4)] leading-[1.05]',
          )}
        >
          {a.marca}
        </div>
      </div>
    </div>
  );
}
