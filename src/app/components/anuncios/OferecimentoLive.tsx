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
 *  - Logotipo (anunciantes v2: logo com ajuste e proporção ≥ 2): a logo grande, na proporção natural, no lugar do nome em
 *    texto — no cabeçalho, "Oferecido por" ao lado; na aba, em cima. Ícone ou logo antiga: logo + nome, como antes.
 */
import { useRef } from 'react';
import { escolherAnuncio } from '@/shared/anuncios-escolha';
import type { AnuncioPublico } from '@/shared/anuncios';
import { useStatus } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { useNow } from '@/app/lib/useNow';
import { useImpressaoVisivel } from './impressao';
import { ehLogotipo } from './logo';
import { LogoMarca, useTemaLogo } from './pecas';
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
  const aba = variante === 'aba';
  const logotipo = ehLogotipo(a, useTemaLogo());
  const rotulo = (
    // "Oferecido por" em cima da marca também na aba: a pílula cabe na largura da marca do Sintonia (nunca avança sobre a
    // foto do 1º candidato) e a marca ganha a largura toda
    <div
      className={cn(
        'whitespace-nowrap font-semibold uppercase leading-none text-fg-subtle',
        aba ? 'text-[length:calc(var(--u)*1.05)] tracking-[0.14em]' : 'text-[length:calc(var(--u)*1.2)] tracking-[0.16em]',
        aba && !logotipo && 'mb-[calc(var(--u)*0.35)]',
      )}
    >
      Oferecido por
    </div>
  );
  return (
    <div
      ref={ref}
      role="group"
      aria-label={`Publicidade: oferecido por ${a.marca}`}
      data-anuncio-live={a.id}
      className={cn('flex min-w-0 items-center', aba ? 'gap-[calc(var(--u)*0.9)]' : 'gap-[calc(var(--u)*1.2)]', className)}
    >
      {logotipo ? (
        aba ? (
          // aba: o rótulo em cima e a logo embaixo (a pílula cabe na largura da marca do Sintonia)
          <div className="flex min-w-0 flex-col items-start gap-[calc(var(--u)*0.45)]">
            {rotulo}
            <LogoMarca anuncio={a} prioridade className="[--logo-h:calc(var(--u)*3.4)] [--logo-max:calc(var(--u)*18)]" />
          </div>
        ) : (
          // cabeçalho: o rótulo ao lado e a logo na altura da barra, sem placa duplicada
          <>
            {rotulo}
            <LogoMarca anuncio={a} prioridade className="[--logo-h:calc(var(--u)*5.6)] [--logo-max:calc(var(--u)*24)]" />
          </>
        )
      ) : (
        <>
          <LogoMarca
            anuncio={a}
            prioridade
            className={aba ? '[--logo-h:calc(var(--u)*3.6)] [--logo-max:calc(var(--u)*8)]' : '[--logo-h:calc(var(--u)*5.6)] [--logo-max:calc(var(--u)*12)]'}
          />
          <div className="min-w-0">
            {rotulo}
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
        </>
      )}
    </div>
  );
}
