/**
 * Layouts do modo streamer (/live) — puros: recebem o `QuadroLive` montado e o anúncio já escolhido (testáveis com
 * renderização estática, e os mesmos componentes desenham as prévias da página /streamers).
 *
 *  - placar: tela cheia, os dois finalistas com os percentuais gigantes, o total apurado e o último dado;
 *  - barra:  faixa no pé (ou no topo), tipo GC/lower-third, sobre o jogo ou a câmera;
 *  - canto:  quadro compacto num dos cantos;
 *  - mapa:   mapa grande (o desenho vem por `mapa`, montado pela página) + placar lateral;
 *  - vertical (automático: janela EM PÉ, ex.: 1080×1920 para TikTok, Shorts, Kick no celular): placar e mapa viram o
 *    placar em pé (`LayoutPlacarVertical`, `--u` ≈ 1,8% da largura): candidatos um embaixo do outro, números grandes,
 *    marca e QR no pé. Barra e canto continuam como são (sobrepostos à câmera).
 *
 * O contêiner define `--u` (≈ 1% da altura) e tem proporção 16:9 (a /live ocupa a janela da fonte do OBS).
 *
 * Anúncio ('live', "Oferecido por"): nunca dentro do placar nem colado a foto, nome ou número de candidato — na barra do
 * topo (placar, mapa) ao lado da marca do Sintonia e separado por um filete; na barra e no canto, numa aba própria
 * presa à marca/endereço do Sintonia, do lado oposto aos candidatos.
 *
 * Estado fixo (I25, `?uf=pe`, Presidente): o mesmo desenho com o placar da UF ("Presidente · PE") e, no layout mapa, o
 * estado por município. "N pessoas no site agora" (I09, `?pessoas=0` esconde): junto do endereço do site, nunca no
 * placar — rodapé (placar), linha do selo (mapa), linha de cima da barra, faixa da marca (canto), pé do placar em pé.
 */
import type { ReactNode } from 'react';
import type { AnuncioPublico } from '@/shared/anuncios';
import { pctTotalizadas } from '@/shared/calc';
import { fmtHoraSeg, fmtPct } from '@/shared/format';
import { UF_NOMES } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { corSlot, fillMargem } from '@/app/lib/raceUi';
import { hachuraStyle } from '@/app/components/apuracao/MapHatch';
import { OferecimentoLivePeca } from '@/app/components/anuncios/OferecimentoLive';
import type { OpcoesLive, PosicaoCanto } from './opcoes';
import {
  ApuradoLive,
  AvatarLive,
  BarraDividida,
  DiferencaLive,
  eleitoDe,
  FaixaSimulacaoLive,
  finalistas,
  MarcaLive,
  PAINEL,
  PctLive,
  PessoasLive,
  QrLive,
  rotuloDisputa,
  SeloEleito,
  SeloLive,
  TempoLive,
  textoContagem,
  VotosLive,
  type QuadroLive,
} from './pecas';

export interface PropsLayoutLive {
  q: QuadroLive;
  opcoes: OpcoesLive;
  /** anúncio 'live' em vigor (null = nenhum) */
  anuncio: AnuncioPublico | null;
  /** prévia (/streamers): o anúncio não conta impressão */
  previa?: boolean;
  /** carregamento da página (contagem de impressões) */
  vista?: string;
  /** desenho do mapa (layout mapa), montado pela página */
  mapa?: ReactNode;
  /** janela em pé (live vertical): placar e mapa viram o placar em pé */
  vertical?: boolean;
}

/** Escolhe o layout. */
export function LayoutLive(props: PropsLayoutLive) {
  if (props.vertical && (props.opcoes.layout === 'placar' || props.opcoes.layout === 'mapa')) return <LayoutPlacarVertical {...props} />;
  switch (props.opcoes.layout) {
    case 'barra':
      return <LayoutBarra {...props} />;
    case 'canto':
      return <LayoutCanto {...props} />;
    case 'mapa':
      return <LayoutMapa {...props} />;
    default:
      return <LayoutPlacar {...props} />;
  }
}

// =============================================================================================
// Barra do topo (placar e mapa)
// =============================================================================================

function CabecalhoLive({ q, anuncio, previa, vista, pessoas }: Pick<PropsLayoutLive, 'q' | 'anuncio' | 'previa' | 'vista'> & { pessoas?: number | null }) {
  return (
    <header className={cn(PAINEL, 'relative flex shrink-0 items-center gap-[calc(var(--u)*2)] px-[calc(var(--u)*2.2)] py-[calc(var(--u)*1.4)]')}>
      <MarcaLive dominio={q.dominio} subtitulo={`Apuração · ${rotuloDisputa(q)}`} tamanho="lg" className="shrink-0" />
      {/* anúncio fora do placar: ao lado da marca do Sintonia, separado por um filete */}
      <div className="flex min-w-0 flex-1 justify-center">
        {anuncio ? (
          <div className="flex min-w-0 max-w-[calc(var(--u)*60)] items-center border-l border-line pl-[calc(var(--u)*2)]">
            <OferecimentoLivePeca anuncio={anuncio} variante="cabecalho" previa={previa} vista={vista} />
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-[calc(var(--u)*2)]">
        {pessoas ? (
          <div className="flex flex-col items-end gap-[calc(var(--u)*0.7)]">
            <SeloLive q={q} />
            <PessoasLive n={pessoas} />
          </div>
        ) : (
          <SeloLive q={q} />
        )}
        <TempoLive q={q} />
      </div>
    </header>
  );
}

// =============================================================================================
// Placar grande (tela cheia)
// =============================================================================================

/** "N pessoas agora" a mostrar (null = não mostra: `?pessoas=0` ou o servidor não mandou). */
const pessoasDe = (q: QuadroLive, opcoes: OpcoesLive): number | null => (opcoes.pessoas !== false && q.pessoasAgora ? q.pessoasAgora : null);

function LayoutPlacar({ q, opcoes, anuncio, previa, vista }: PropsLayoutLive) {
  const fin = finalistas(q.race);
  const eleito = eleitoDe(q);
  const tem = q.resumo.votos.some((v) => v > 0);
  return (
    <div data-layout="placar" className="absolute inset-0 flex flex-col gap-[calc(var(--u)*1.8)] p-[calc(var(--u)*3)]">
      <CabecalhoLive q={q} anuncio={anuncio} previa={previa} vista={vista} />
      {q.simulado ? <FaixaSimulacaoLive className="shrink-0" /> : null}

      <section aria-label="Placar" aria-live="polite" className={cn(PAINEL, 'relative flex min-h-0 flex-1 flex-col overflow-hidden px-[calc(var(--u)*3)] py-[calc(var(--u)*2.4)]')}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {fin.map(({ c }, k) => (
            <div
              key={c.numero}
              className={cn('absolute h-[80%] w-[55%] rounded-full opacity-80 blur-[90px]', k === 0 ? '-left-[18%] -top-[35%]' : '-bottom-[35%] -right-[18%]', corSlot(c.cor).bgSoft)}
            />
          ))}
        </div>
        <div className="relative flex items-center justify-between gap-[calc(var(--u)*2)]">
          <span className="text-[length:calc(var(--u)*1.5)] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            {q.t1 ? 'Resultado oficial do 1º turno · 4 de outubro' : 'Votos válidos'}
          </span>
          {eleito ? <SeloEleito c={eleito} encerrada={q.resumo.status === 'encerrada'} /> : null}
        </div>

        <ul className="relative grid min-h-0 flex-1 grid-cols-2 items-center gap-[calc(var(--u)*3)]">
          {fin.map(({ c, i }, k) => {
            const direita = k === 1;
            const lider = tem && q.resumo.lider === i;
            return (
              <li key={c.numero} className={cn('flex min-w-0 flex-col', direita ? 'items-end border-l border-line pl-[calc(var(--u)*3)] text-right' : 'items-start')}>
                <div className={cn('flex min-w-0 max-w-full items-center gap-[calc(var(--u)*1.8)]', direita && 'flex-row-reverse')}>
                  <AvatarLive
                    c={c}
                    foto={q.fotos[i]}
                    eleito={eleito === c}
                    className="!h-[calc(var(--u)*11)] !w-[calc(var(--u)*11)] !text-[length:calc(var(--u)*4)]"
                  />
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-balance break-words font-display text-[length:calc(var(--u)*4.4)] font-semibold leading-[1.02] tracking-[-0.025em] text-fg">
                      {c.nomeUrna}
                    </div>
                    <div className="num mt-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*2)] text-fg-muted">
                      {c.partido} · {c.numero}
                    </div>
                  </div>
                </div>
                <PctLive resumo={q.resumo} i={i} cor={c.cor} className={cn('mt-[calc(var(--u)*2)] text-[length:calc(var(--u)*15)]', tem && !lider && 'opacity-90')} />
                <VotosLive resumo={q.resumo} i={i} className="mt-[calc(var(--u)*0.8)] text-[length:calc(var(--u)*2.2)]" />
              </li>
            );
          })}
        </ul>

        <div className="relative shrink-0">
          <BarraDividida race={q.race} resumo={q.resumo} className="h-[calc(var(--u)*2.2)]" />
          <div className="mt-[calc(var(--u)*1.8)] flex items-end justify-between gap-[calc(var(--u)*3)] border-t border-line pt-[calc(var(--u)*1.4)]">
            <div>
              <ApuradoLive resumo={q.resumo} className="font-display text-[length:calc(var(--u)*4.6)] font-semibold leading-none tracking-[-0.03em] text-fg" />
              <div className="mt-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*1.7)] text-fg-muted">das seções totalizadas</div>
            </div>
            <DiferencaLive q={q} />
          </div>
        </div>
      </section>

      <RodapeLive q={q} pessoas={pessoasDe(q, opcoes)} />
    </div>
  );
}

// =============================================================================================
// Placar em pé (live vertical: 9:16) — `--u` ≈ 1,8% da largura (a página define)
// =============================================================================================

function LayoutPlacarVertical({ q, opcoes, anuncio, previa, vista }: PropsLayoutLive) {
  const pessoas = pessoasDe(q, opcoes);
  const fin = finalistas(q.race);
  const eleito = eleitoDe(q);
  const tem = q.resumo.votos.some((v) => v > 0);
  return (
    <div data-layout="placar-vertical" className="absolute inset-0 flex flex-col gap-[calc(var(--u)*1.4)] p-[calc(var(--u)*2.2)]">
      <header className={cn(PAINEL, 'shrink-0 px-[calc(var(--u)*2)] py-[calc(var(--u)*1.5)]')}>
        <div className="flex items-center justify-between gap-[calc(var(--u)*1.5)]">
          <MarcaLive dominio={q.dominio} subtitulo={q.uf ? rotuloDisputa(q, true) : `Apuração · ${rotuloDisputa(q, true)}`} tamanho="md" className="min-w-0" />
          <SeloLive q={q} />
        </div>
        {/* anúncio fora do placar: no cabeçalho, embaixo da marca do Sintonia, separado por um filete */}
        {anuncio ? (
          <div className="mt-[calc(var(--u)*1.2)] flex justify-center border-t border-line pt-[calc(var(--u)*1.1)]">
            <OferecimentoLivePeca anuncio={anuncio} variante="cabecalho" previa={previa} vista={vista} />
          </div>
        ) : null}
      </header>
      {q.simulado ? <FaixaSimulacaoLive className="shrink-0 self-center" /> : null}

      <section aria-label="Placar" aria-live="polite" className={cn(PAINEL, 'relative flex min-h-0 flex-1 flex-col overflow-hidden px-[calc(var(--u)*2.4)] py-[calc(var(--u)*2)]')}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {fin.map(({ c }, k) => (
            <div
              key={c.numero}
              className={cn('absolute h-[45%] w-[90%] rounded-full opacity-80 blur-[60px]', k === 0 ? '-left-[30%] -top-[18%]' : '-bottom-[18%] -right-[30%]', corSlot(c.cor).bgSoft)}
            />
          ))}
        </div>
        <div className="relative flex items-center justify-between gap-[calc(var(--u)*1.5)]">
          <span className="text-[length:calc(var(--u)*1.5)] font-semibold uppercase tracking-[0.14em] text-fg-muted">{q.t1 ? 'Oficial · 1º turno' : 'Votos válidos'}</span>
          {eleito ? <SeloEleito c={eleito} encerrada={q.resumo.status === 'encerrada'} /> : null}
        </div>

        <ul className="relative mt-[calc(var(--u)*0.8)] flex min-h-0 flex-1 flex-col justify-around">
          {fin.map(({ c, i }, k) => {
            const lider = tem && q.resumo.lider === i;
            return (
              <li key={c.numero} className={cn('flex min-w-0 flex-col', k === 1 && 'border-t border-line pt-[calc(var(--u)*1.6)]')}>
                <div className="flex min-w-0 items-center gap-[calc(var(--u)*1.4)]">
                  <AvatarLive c={c} foto={q.fotos[i]} eleito={eleito === c} className="!h-[calc(var(--u)*6.2)] !w-[calc(var(--u)*6.2)] !text-[length:calc(var(--u)*2.4)]" />
                  <div className="min-w-0">
                    <div className="line-clamp-2 text-balance break-words font-display text-[length:calc(var(--u)*3)] font-semibold leading-[1.02] tracking-[-0.025em] text-fg">
                      {c.nomeUrna}
                    </div>
                    <div className="num mt-[calc(var(--u)*0.4)] text-[length:calc(var(--u)*1.8)] text-fg-muted">
                      {c.partido} · {c.numero}
                    </div>
                  </div>
                </div>
                <PctLive resumo={q.resumo} i={i} cor={c.cor} className={cn('mt-[calc(var(--u)*0.8)] text-[length:calc(var(--u)*9.5)]', tem && !lider && 'opacity-90')} />
                <VotosLive resumo={q.resumo} i={i} className="mt-[calc(var(--u)*0.4)] text-[length:calc(var(--u)*2)]" />
              </li>
            );
          })}
        </ul>

        {/* barra + apurado e diferença numa linha só: a tela em pé não tem altura para empilhar tudo */}
        <div className="relative mt-[calc(var(--u)*1.2)] shrink-0">
          <BarraDividida race={q.race} resumo={q.resumo} className="h-[calc(var(--u)*1.6)]" />
          <div className="mt-[calc(var(--u)*1.2)] flex items-end justify-between gap-[calc(var(--u)*1.5)] border-t border-line pt-[calc(var(--u)*1.2)]">
            <div className="min-w-0">
              <ApuradoLive resumo={q.resumo} className="font-display text-[length:calc(var(--u)*3.6)] font-semibold leading-none tracking-[-0.03em] text-fg" />
              <div className="mt-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*1.4)] leading-none text-fg-muted">das seções totalizadas</div>
            </div>
            <DiferencaLive q={q} alinhar="right" />
          </div>
        </div>
      </section>

      <footer className={cn(PAINEL, 'flex shrink-0 items-center gap-[calc(var(--u)*1.6)] px-[calc(var(--u)*1.8)] py-[calc(var(--u)*1.2)]')}>
        <QrLive url={q.urlQr} className="h-[calc(var(--u)*8)] w-[calc(var(--u)*8)]" />
        <div className="min-w-0 flex-1">
          <div className="whitespace-nowrap font-display text-[length:calc(var(--u)*2.8)] font-semibold leading-none tracking-[-0.02em] text-fg">{q.dominio}</div>
          <div className="mt-[calc(var(--u)*0.6)] text-[length:calc(var(--u)*1.4)] leading-snug text-fg-muted">
            {/* número simulado nunca sai com "Fonte: TSE" */}
            {q.simulado ? <span className="font-semibold text-brand-fg">Simulação · dados fictícios</span> : <>Fonte: <span className="font-semibold text-fg">TSE</span></>}
            <span className="text-fg-subtle"> · Não é site oficial da Justiça Eleitoral</span>
          </div>
          {pessoas ? <PessoasLive n={pessoas} className="mt-[calc(var(--u)*0.7)]" /> : null}
        </div>
      </footer>
    </div>
  );
}

/** Pé dos layouts de tela cheia: QR + endereço (o que leva o público da live ao site) + fonte. */
function RodapeLive({ q, pessoas }: { q: QuadroLive; pessoas?: number | null }) {
  return (
    <footer className={cn(PAINEL, 'flex shrink-0 items-center gap-[calc(var(--u)*1.8)] px-[calc(var(--u)*2)] py-[calc(var(--u)*1.2)]')}>
      <QrLive url={q.urlQr} className="h-[calc(var(--u)*7)] w-[calc(var(--u)*7)]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:calc(var(--u)*1.5)] font-semibold uppercase tracking-[0.14em] text-fg-muted">Estado por estado, cidade por cidade, seção por seção</div>
        <div className="mt-[calc(var(--u)*0.4)] flex items-center gap-[calc(var(--u)*2)]">
          <span className="whitespace-nowrap font-display text-[length:calc(var(--u)*3.2)] font-semibold leading-none tracking-[-0.02em] text-fg">{q.dominio}</span>
          {pessoas ? <PessoasLive n={pessoas} className="min-w-0" /> : null}
        </div>
      </div>
      <div className="shrink-0 text-right text-[length:calc(var(--u)*1.5)] leading-snug text-fg-muted">
        {/* número simulado nunca sai com "Fonte: TSE" */}
        <div>{q.simulado ? <span className="font-semibold text-brand-fg">Simulação · dados fictícios</span> : <>Fonte: <span className="font-semibold text-fg">TSE</span></>}</div>
        <div className="text-fg-subtle">Não é site oficial da Justiça Eleitoral</div>
      </div>
    </footer>
  );
}

// =============================================================================================
// Barra inferior (GC / lower-third)
// =============================================================================================

function LayoutBarra({ q, opcoes, anuncio, previa, vista }: PropsLayoutLive) {
  const topo = opcoes.posicao === 'topo';
  const pessoas = pessoasDe(q, opcoes);
  const fin = finalistas(q.race);
  const eleito = eleitoDe(q);
  // a aba do anúncio fica presa ao bloco da marca do Sintonia (à esquerda), do lado de fora da barra, e NUNCA passa da
  // largura dele (33u): mais larga, encostava na foto do 1º candidato (ARCHITECTURE §1.5)
  const aba = anuncio ? (
    <div className={cn('flex', topo ? 'mt-[calc(var(--u)*0.8)]' : 'mb-[calc(var(--u)*0.8)]')}>
      <div data-aba-anuncio className={cn(PAINEL, 'flex max-w-[calc(var(--u)*33)] items-center rounded-[calc(var(--u)*1.6)] px-[calc(var(--u)*1.4)] py-[calc(var(--u)*0.7)]')}>
        <OferecimentoLivePeca anuncio={anuncio} variante="aba" previa={previa} vista={vista} />
      </div>
    </div>
  ) : null;
  // do lado oposto ao anúncio: a simulação e o "N pessoas no site agora" (numa pílula própria, sobre a câmera)
  const simulacao =
    q.simulado || pessoas ? (
      <div className={cn('flex items-center justify-end gap-[calc(var(--u)*1)]', topo ? 'mt-[calc(var(--u)*0.8)]' : 'mb-[calc(var(--u)*0.8)]')}>
        {pessoas ? (
          <div className={cn(PAINEL, 'flex items-center rounded-full px-[calc(var(--u)*1.4)] py-[calc(var(--u)*0.7)]')}>
            <PessoasLive n={pessoas} />
          </div>
        ) : null}
        {q.simulado ? <FaixaSimulacaoLive /> : null}
      </div>
    ) : null;
  return (
    <div data-layout="barra" className={cn('absolute inset-x-[calc(var(--u)*3)] flex flex-col', topo ? 'top-[calc(var(--u)*3)]' : 'bottom-[calc(var(--u)*3)]')}>
      {!topo ? (
        <div className="flex items-end justify-between gap-[calc(var(--u)*2)]">
          {aba ?? <span />}
          {simulacao}
        </div>
      ) : null}
      <section
        aria-label="Placar"
        aria-live="polite"
        className={cn(PAINEL, 'flex h-[calc(var(--u)*12)] items-stretch overflow-hidden rounded-[calc(var(--u)*2.2)]')}
      >
        {/* marca do Sintonia: o endereço é o que traz o público */}
        <div className="flex w-[calc(var(--u)*33)] shrink-0 items-center border-r border-line bg-surface-2 px-[calc(var(--u)*1.8)]">
          <MarcaLive dominio={q.dominio} subtitulo={rotuloDisputa(q, true)} tamanho="md" />
        </div>

        {/* placar: A · (vão) · B, com a barra dividida embaixo, de ponta a ponta */}
        <div className="flex min-w-0 flex-1 flex-col justify-center px-[calc(var(--u)*2)]">
          <div className="flex min-w-0 items-center">
            {fin.map(({ c, i }, k) => {
              const direita = k === 1;
              return (
                <div
                  key={c.numero}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-[calc(var(--u)*1.4)]',
                    direita ? 'flex-row-reverse border-l border-line pl-[calc(var(--u)*2.2)] text-right' : 'pr-[calc(var(--u)*2.2)]',
                  )}
                >
                  <AvatarLive c={c} foto={q.fotos[i]} eleito={eleito === c} className="!h-[calc(var(--u)*6.8)] !w-[calc(var(--u)*6.8)] !text-[length:calc(var(--u)*2.6)]" />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-words font-display text-[length:calc(var(--u)*2.5)] font-semibold leading-[1.02] tracking-[-0.02em] text-fg">{c.nomeUrna}</div>
                    <div className="num mt-[calc(var(--u)*0.35)] whitespace-nowrap text-[length:calc(var(--u)*1.4)] text-fg-muted">
                      {c.partido} · {c.numero}
                    </div>
                  </div>
                  <div className={cn('flex shrink-0 flex-col', direita ? 'items-start' : 'items-end')}>
                    <PctLive resumo={q.resumo} i={i} cor={c.cor} className="text-[length:calc(var(--u)*5.2)]" />
                    <VotosLive resumo={q.resumo} i={i} className="mt-[calc(var(--u)*0.2)] text-[length:calc(var(--u)*1.3)]" />
                  </div>
                </div>
              );
            })}
          </div>
          <BarraDividida race={q.race} resumo={q.resumo} className="mt-[calc(var(--u)*1)] h-[calc(var(--u)*1.1)]" />
        </div>

        {/* apuração */}
        <div className="flex w-[calc(var(--u)*25)] shrink-0 flex-col justify-center border-l border-line bg-surface-2 px-[calc(var(--u)*1.8)]">
          {q.pre ? (
            <TempoLive q={q} tamanho="sm" alinhar="left" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-[calc(var(--u)*1)]">
                <ApuradoLive resumo={q.resumo} className="font-display text-[length:calc(var(--u)*3.2)] font-semibold leading-none tracking-[-0.03em] text-fg" />
                <SeloLive q={q} className="!px-[calc(var(--u)*0.8)] !text-[length:calc(var(--u)*1.1)]" />
              </div>
              <div className="mt-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*1.3)] text-fg-muted">das seções totalizadas</div>
              <div className="num mt-[calc(var(--u)*0.4)] text-[length:calc(var(--u)*1.3)] text-fg-muted">{textoAtualizado(q)}</div>
            </>
          )}
        </div>
      </section>
      {topo ? (
        <div className="flex items-start justify-between gap-[calc(var(--u)*2)]">
          {aba ?? <span />}
          {simulacao}
        </div>
      ) : null}
    </div>
  );
}

function textoAtualizado(q: QuadroLive): string {
  if (q.t1) return 'Resultado oficial · TSE';
  if (!q.atualizadoEm) return 'Aguardando dados do TSE';
  return `Último dado: ${fmtHoraSeg(q.atualizadoEm)}`;
}

// =============================================================================================
// Canto
// =============================================================================================

const CANTO: Record<PosicaoCanto, string> = {
  'topo-direita': 'right-[calc(var(--u)*3)] top-[calc(var(--u)*3)] items-end',
  'topo-esquerda': 'left-[calc(var(--u)*3)] top-[calc(var(--u)*3)] items-start',
  'baixo-direita': 'bottom-[calc(var(--u)*3)] right-[calc(var(--u)*3)] items-end',
  'baixo-esquerda': 'bottom-[calc(var(--u)*3)] left-[calc(var(--u)*3)] items-start',
};

function LayoutCanto({ q, opcoes, anuncio, previa, vista }: PropsLayoutLive) {
  const pos = (opcoes.posicao in CANTO ? opcoes.posicao : 'topo-direita') as PosicaoCanto;
  const pessoas = pessoasDe(q, opcoes);
  const embaixo = pos.startsWith('baixo');
  const fin = finalistas(q.race);
  const eleito = eleitoDe(q);
  const tem = q.resumo.votos.some((v) => v > 0);
  // aba do anúncio: presa à faixa da marca do Sintonia — nunca junto das linhas dos candidatos
  const aba = anuncio ? (
    <div className={cn(PAINEL, 'flex max-w-[calc(var(--u)*46)] items-center rounded-full px-[calc(var(--u)*1.4)] py-[calc(var(--u)*0.6)]')}>
      <OferecimentoLivePeca anuncio={anuncio} variante="aba" previa={previa} vista={vista} />
    </div>
  ) : null;
  // faixa da marca (o endereço do site, sempre visível): fica sempre do lado da aba do anúncio — embaixo do quadro nos
  // cantos de cima, em cima nos de baixo —, então a marca do Sintonia separa o anúncio das linhas dos candidatos
  const faixaMarca = (
    <div className={cn('flex flex-col items-center justify-center gap-[calc(var(--u)*0.7)] bg-surface-2 px-[calc(var(--u)*1.8)] py-[calc(var(--u)*1)]', embaixo ? 'border-b border-line' : 'border-t border-line')}>
      <MarcaLive dominio={q.dominio} tamanho="sm" />
      {pessoas ? <PessoasLive n={pessoas} className="!text-[length:calc(var(--u)*1.2)]" /> : null}
    </div>
  );
  return (
    <div data-layout="canto" className={cn('absolute flex w-[calc(var(--u)*46)] flex-col gap-[calc(var(--u)*0.8)]', CANTO[pos])}>
      {embaixo ? aba : null}
      {q.simulado ? <FaixaSimulacaoLive className="w-full !text-[length:calc(var(--u)*1.25)]" /> : null}
      <section aria-label="Placar" aria-live="polite" className={cn(PAINEL, 'w-full overflow-hidden')}>
        {embaixo ? faixaMarca : null}
        <div className="flex items-center justify-between gap-[calc(var(--u)*1)] px-[calc(var(--u)*1.8)] pt-[calc(var(--u)*1.5)]">
          <span className="truncate text-[length:calc(var(--u)*1.35)] font-semibold uppercase tracking-[0.14em] text-fg-muted">{rotuloDisputa(q)}</span>
          {eleito ? <SeloEleito c={eleito} encerrada={q.resumo.status === 'encerrada'} className="!text-[length:calc(var(--u)*1.1)]" /> : <SeloLive q={q} className="!text-[length:calc(var(--u)*1.1)]" />}
        </div>
        <ul className="mt-[calc(var(--u)*1)] space-y-[calc(var(--u)*0.9)] px-[calc(var(--u)*1.8)]">
          {fin.map(({ c, i }) => (
            <li key={c.numero} className="flex items-center gap-[calc(var(--u)*1.2)]">
              <AvatarLive c={c} foto={q.fotos[i]} eleito={eleito === c} className="!h-[calc(var(--u)*5.6)] !w-[calc(var(--u)*5.6)] !text-[length:calc(var(--u)*2.1)]" />
              <div className="min-w-0 flex-1">
                {/* nome nunca cortado (mesmo tratamento para os dois): quebra em até 2 linhas */}
                <div className="line-clamp-2 break-words font-display text-[length:calc(var(--u)*2.2)] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">{c.nomeUrna}</div>
                <div className="num truncate text-[length:calc(var(--u)*1.3)] text-fg-muted">
                  {c.partido} · {c.numero}
                </div>
              </div>
              <PctLive resumo={q.resumo} i={i} cor={c.cor} className={cn('text-[length:calc(var(--u)*4.4)]', tem && q.resumo.lider !== i && 'opacity-90')} />
            </li>
          ))}
        </ul>
        <div className="px-[calc(var(--u)*1.8)] pt-[calc(var(--u)*1.3)]">
          <BarraDividida race={q.race} resumo={q.resumo} className="h-[calc(var(--u)*1.2)]" />
        </div>
        <div className="num flex items-center justify-between gap-[calc(var(--u)*1)] px-[calc(var(--u)*1.8)] pb-[calc(var(--u)*1.3)] pt-[calc(var(--u)*1)] text-[length:calc(var(--u)*1.35)] text-fg-muted">
          {q.pre ? (
            <span className="truncate">{q.faltaMs && q.faltaMs > 0 ? '2º turno: apuração em' : 'Apuração do 2º turno'}</span>
          ) : (
            <span className="truncate">
              <span className="font-semibold text-fg">{fmtPct(pctTotalizadas(q.resumo))}</span> das seções
            </span>
          )}
          <span className="shrink-0 font-semibold text-fg">
            {q.pre ? (
              <TempoCurto q={q} />
            ) : q.atualizadoEm ? (
              <>
                <span className="font-normal text-fg-muted">último dado </span>
                {fmtHoraSeg(q.atualizadoEm)}
              </>
            ) : (
              'aguardando dados'
            )}
          </span>
        </div>
        {!embaixo ? faixaMarca : null}
      </section>
      {!embaixo ? aba : null}
    </div>
  );
}

function TempoCurto({ q }: { q: QuadroLive }) {
  if (q.faltaMs === null || q.faltaMs <= 0) return <>aguardando o TSE</>;
  return <>{textoContagem(q.faltaMs)}</>;
}

// =============================================================================================
// Mapa
// =============================================================================================

function LayoutMapa({ q, opcoes, anuncio, previa, vista, mapa }: PropsLayoutLive) {
  const fin = finalistas(q.race);
  const eleito = eleitoDe(q);
  const tem = q.resumo.votos.some((v) => v > 0);
  const gov = q.race.cargo === 'Governador';
  // estado fixo (Presidente numa UF): o mapa é o do estado, por município, como no governador
  const porUf = gov || !!q.uf;
  // o DF é um município só (Brasília): "em cada município" não faria sentido
  const df = q.race.abrangencia === 'DF' || q.uf === 'DF';
  const titulo = porUf
    ? df
      ? q.t1
        ? 'Mais votado no Distrito Federal'
        : 'Quem está à frente no Distrito Federal'
      : q.t1
        ? 'Mais votado em cada município'
        : 'Quem está à frente em cada município'
    : q.t1
      ? `Mais votado em cada ${opcoes.mapa === 'municipios' ? 'município' : 'estado'}`
      : `Quem está à frente em cada ${opcoes.mapa === 'municipios' ? 'município' : 'estado'}`;
  return (
    <div data-layout="mapa" className="absolute inset-0 flex flex-col gap-[calc(var(--u)*1.8)] p-[calc(var(--u)*3)]">
      <CabecalhoLive q={q} anuncio={anuncio} previa={previa} vista={vista} pessoas={pessoasDe(q, opcoes)} />
      {q.simulado ? <FaixaSimulacaoLive className="shrink-0" /> : null}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-[calc(var(--u)*1.8)]">
        <section aria-label="Mapa" className={cn(PAINEL, 'relative flex min-h-0 flex-col overflow-hidden p-[calc(var(--u)*2)]')}>
          <div className="text-[length:calc(var(--u)*1.5)] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            {gov
              ? q.race.titulo.replace(/ · 1º turno$/, '')
              : q.uf
                ? `Presidente · ${UF_NOMES[q.uf]}`
                : opcoes.mapa === 'municipios'
                  ? 'Brasil · por município'
                  : 'Brasil · por estado'}
          </div>
          <div className="mt-[calc(var(--u)*0.4)] truncate font-display text-[length:calc(var(--u)*3)] font-semibold leading-tight tracking-[-0.02em] text-fg">{titulo}</div>
          <div className="relative mt-[calc(var(--u)*1)] flex min-h-0 flex-1 items-center justify-center">{mapa}</div>
          <LegendaLive q={q} />
        </section>

        <aside aria-label="Placar" aria-live="polite" className={cn(PAINEL, 'relative flex min-h-0 flex-col overflow-hidden p-[calc(var(--u)*2.2)]')}>
          <div className="flex items-center justify-between gap-[calc(var(--u)*1)]">
            <span className="text-[length:calc(var(--u)*1.4)] font-semibold uppercase tracking-[0.14em] text-fg-muted">{q.t1 ? 'Resultado oficial' : 'Votos válidos'}</span>
            {eleito ? <SeloEleito c={eleito} encerrada={q.resumo.status === 'encerrada'} className="!text-[length:calc(var(--u)*1.1)]" /> : null}
          </div>
          <ul className="mt-[calc(var(--u)*1.2)] flex flex-1 flex-col justify-center gap-[calc(var(--u)*2.2)]">
            {fin.map(({ c, i }) => (
              <li key={c.numero} className="flex items-center gap-[calc(var(--u)*1.4)]">
                <AvatarLive c={c} foto={q.fotos[i]} eleito={eleito === c} className="!h-[calc(var(--u)*9.5)] !w-[calc(var(--u)*9.5)] !text-[length:calc(var(--u)*3.4)]" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 break-words font-display text-[length:calc(var(--u)*3)] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">{c.nomeUrna}</div>
                  <PctLive resumo={q.resumo} i={i} cor={c.cor} className={cn('mt-[calc(var(--u)*0.4)] text-[length:calc(var(--u)*7.6)]', tem && q.resumo.lider !== i && 'opacity-90')} />
                  <VotosLive resumo={q.resumo} i={i} className="block text-[length:calc(var(--u)*1.7)]" />
                </div>
              </li>
            ))}
          </ul>
          <BarraDividida race={q.race} resumo={q.resumo} className="mt-[calc(var(--u)*1.4)] h-[calc(var(--u)*1.6)] shrink-0" />
          <div className="mt-[calc(var(--u)*1.4)] flex shrink-0 items-end justify-between gap-[calc(var(--u)*1.5)] border-t border-line pt-[calc(var(--u)*1.2)]">
            <div>
              <ApuradoLive resumo={q.resumo} className="font-display text-[length:calc(var(--u)*3.6)] font-semibold leading-none tracking-[-0.03em] text-fg" />
              <div className="mt-[calc(var(--u)*0.4)] text-[length:calc(var(--u)*1.4)] text-fg-muted">das seções totalizadas</div>
            </div>
            <QrLive url={q.urlQr} className="h-[calc(var(--u)*7)] w-[calc(var(--u)*7)]" />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Legenda grande (a mesma do Modo TV): cor de cada candidato (dos dados), intensidade = vantagem, hachura = sem seções. */
function LegendaLive({ q }: { q: QuadroLive }) {
  return (
    <ul className="mt-[calc(var(--u)*1)] flex flex-wrap items-center gap-x-[calc(var(--u)*2.2)] gap-y-[calc(var(--u)*0.6)] text-[length:calc(var(--u)*1.5)] text-fg-muted">
      {finalistas(q.race).map(({ c }) => (
        <li key={c.numero} className="flex items-center gap-[calc(var(--u)*0.7)]">
          <span aria-hidden className="flex overflow-hidden rounded-[calc(var(--u)*0.35)]">
            {([0, 1, 2, 3] as const).map((b) => (
              <span key={b} className="h-[calc(var(--u)*1.4)] w-[calc(var(--u)*1)]" style={{ background: fillMargem(c.cor, b) }} />
            ))}
          </span>
          <span className="font-semibold text-fg">{c.nomeUrna}</span>
        </li>
      ))}
      <li className="text-fg-subtle">mais forte = maior vantagem</li>
      {!q.t1 ? (
        <li className="flex items-center gap-[calc(var(--u)*0.7)]">
          <span aria-hidden className="h-[calc(var(--u)*1.4)] w-[calc(var(--u)*1.4)] rounded-[calc(var(--u)*0.35)]" style={hachuraStyle()} />
          sem seções apuradas
        </li>
      ) : null}
    </ul>
  );
}
