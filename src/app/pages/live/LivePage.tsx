/**
 * /live — Modo streamer: a apuração como "fonte de navegador" (Browser Source) do OBS/Streamlabs, fora do AppShell.
 *
 *  - Layouts por `?layout=placar|barra|canto|mapa`; `?fundo=transparente|escuro|claro` (transparente de verdade:
 *    html e body sem fundo — o script do index.html já tira o fundo antes da 1ª pintura, sem "piscar" ao ativar a
 *    cena); `?tema=escuro|claro` (painéis; com fundo sólido acompanha o fundo); `?race=pres|gov-xx`; `?posicao=` (barra:
 *    baixo|topo; canto: topo-direita…); `?mapa=municipios`. Opções em components/live/opcoes.ts.
 *  - Pensado para 1920×1080 e 1280×720: tudo deriva de `--u` = min(1vh, 0,5625vw) (1% da altura de uma tela 16:9).
 *    Usa `vh`/`vw` (não `dvh`): o navegador do OBS em versões antigas não conhece `dvh` e a janela da fonte é fixa.
 *  - Janela EM PÉ (live vertical, 1080×1920: TikTok, Shorts, Kick no celular): placar e mapa viram o placar em pé, com
 *    `--u` = min(1,8vw, 1vh) — a mesma URL, sem opção nova.
 *  - Sem controles visíveis, sem cursor; atualiza sozinho com o mesmo polling da apuração; números rolam.
 *  - Marca "sintonia2026.com.br" sempre visível; anunciante do formato 'live' ("Oferecido por", sem link, fora do
 *    placar); fotos oficiais só quando permitido (useFotosRace); faixa SIMULAÇÃO quando for o caso.
 *  - O tema da URL nunca é gravado como preferência (o navegador do OBS é de quem transmite).
 *  - `?previa=1`: usado só pelas prévias da página /streamers (iframe) — o anúncio aparece sem contar impressão.
 */
import { useEffect, useLayoutEffect, useMemo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { aplicarTema } from '@/app/lib/useTheme';
import { LayoutLive } from '@/app/components/live/Layouts';
import { MapaLiveConteudo } from '@/app/components/live/MapaLive';
import { lerOpcoesLive, type FundoLive, type TemaLive } from '@/app/components/live/opcoes';
import { FundoSolidoLive } from '@/app/components/live/pecas';
import { useQuadroLive } from '@/app/components/live/useQuadroLive';
import { useAnuncioLive } from '@/app/components/anuncios/OferecimentoLive';
import { useMediaQuery } from '@/app/lib/useMediaQuery';

/** Tema dos painéis pela URL (sem gravar a preferência). */
function useTemaLive(tema: TemaLive) {
  useLayoutEffect(() => {
    aplicarTema(tema === 'claro' ? 'light' : 'dark', false);
  }, [tema]);
}

/** Fundo da página: transparente de verdade (html e body), sem barras de rolagem. */
function useFundoLive(fundo: FundoLive) {
  useLayoutEffect(() => {
    const h = document.documentElement;
    const b = document.body;
    const antes = [h.style.background, b.style.background, h.style.overflow, b.style.overflow];
    h.style.overflow = 'hidden';
    b.style.overflow = 'hidden';
    if (fundo === 'transparente') {
      h.style.background = 'transparent';
      b.style.background = 'transparent';
    } else {
      // o script do index.html marcou a página como transparente pela URL: aqui o fundo é sólido
      h.removeAttribute('data-fundo');
    }
    return () => {
      [h.style.background, b.style.background, h.style.overflow, b.style.overflow] = antes;
      h.removeAttribute('data-fundo');
    };
  }, [fundo]);
}

export default function LivePage() {
  const [params] = useSearchParams();
  const opcoes = useMemo(() => lerOpcoesLive(params), [params]);
  useTemaLive(opcoes.tema);
  useFundoLive(opcoes.fundo);
  useEffect(() => {
    const ant = document.title;
    document.title = 'Sintonia · Modo streamer';
    return () => {
      document.title = ant;
    };
  }, []);

  // prévia dentro da página /streamers (iframe): o anúncio aparece, mas não conta impressão
  const previa = params.get('previa') === '1';
  const quadro = useQuadroLive(opcoes.race);
  const anuncio = useAnuncioLive();
  // live vertical: janela mais alta que larga
  const emPe = useMediaQuery('(max-aspect-ratio: 1/1)', false);
  const vertical = emPe && (opcoes.layout === 'placar' || opcoes.layout === 'mapa');

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-live={opcoes.layout}
        data-vertical={vertical || undefined}
        className="fixed inset-0 cursor-none select-none overflow-hidden text-fg [--u:min(1vh,0.5625vw)]"
        style={vertical ? ({ '--u': 'min(1.8vw, 1vh)' } as CSSProperties) : undefined}
      >
        {opcoes.fundo !== 'transparente' ? <FundoSolidoLive /> : null}
        {/* antes do 1º dado: nada (transparente), em vez de um esqueleto piscando na transmissão */}
        {quadro ? (
          <LayoutLive
            q={quadro}
            opcoes={opcoes}
            anuncio={anuncio}
            previa={previa}
            vista="live"
            vertical={vertical}
            mapa={opcoes.layout === 'mapa' && !vertical ? <MapaLiveConteudo q={quadro} mapa={opcoes.mapa} /> : undefined}
          />
        ) : null}
      </div>
    </MotionConfig>
  );
}
