/**
 * Batimento da /live (I23, contagem anônima de lives): a cada `LIVES.batimentoS` a fonte do OBS avisa o servidor que está
 * no ar, com um id ALEATÓRIO desta carga da página (não fica no aparelho, não identifica canal nem pessoa), o layout e o
 * anúncio na tela. O servidor só conta (src/server/lives.ts); a chave 'contar-lives' do painel desliga.
 *
 * Não manda nada: nas prévias da /streamers (`?previa=1`), no build demo (sem servidor), com automação
 * (`navigator.webdriver`), com Global Privacy Control ou Do Not Track, nem com a página escondida (uma fonte fora da cena
 * não está sendo exibida — conservador).
 */
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LIVES, type BatimentoLive, type LayoutContado } from '@/shared/lives';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { useAnuncioLive } from '@/app/components/anuncios/OferecimentoLive';
import { lerOpcoesLive, type LayoutLive } from './opcoes';

export const ROTA_BATIMENTO = '/api/live/batimento';

/** Id aleatório desta carga da página: 12 caracteres [a-z0-9]. */
export function idFonteLive(aleatorio: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(aleatorio(12), (b) => abc[b % abc.length]).join('');
}

/** Layout contado: o da URL, ou 'vertical' quando placar/mapa viram o placar em pé. Puro (testado). */
export function layoutContado(layout: LayoutLive, emPe: boolean): LayoutContado {
  return emPe && (layout === 'placar' || layout === 'mapa') ? 'vertical' : layout;
}

/** Corpo do batimento (≤ 200 bytes). Puro (testado). */
export function corpoBatimento(id: string, layout: LayoutContado, anuncio: string | null | undefined): string {
  const b: BatimentoLive = anuncio ? { id, layout, a: [anuncio] } : { id, layout };
  return JSON.stringify(b);
}

/** O aparelho pede para não ser medido (ou é automação)? */
function naoMedir(): boolean {
  if (typeof navigator === 'undefined') return true;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  if (n.webdriver) return true;
  if (n.globalPrivacyControl === true) return true;
  const dnt = n.doNotTrack ?? (window as Window & { doNotTrack?: string }).doNotTrack ?? n.msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

function enviar(corpo: string) {
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ROTA_BATIMENTO, corpo)) return;
  } catch {
    /* cai no fetch */
  }
  void fetch(ROTA_BATIMENTO, { method: 'POST', body: corpo, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(() => undefined);
}

/** Liga o batimento da /live (uma vez por página). Lê o layout e `?previa` da URL e o anúncio em vigor. */
export function useBatimentoLive(): void {
  const [params] = useSearchParams();
  const previa = params.get('previa') === '1';
  const { layout } = lerOpcoesLive(params);
  const emPe = useMediaQuery('(max-aspect-ratio: 1/1)', false);
  const anuncio = useAnuncioLive();
  // o intervalo lê sempre o layout e o anúncio de agora (trocar de opção não reinicia a fonte)
  const atual = useRef({ layout: layoutContado(layout, emPe), anuncio: anuncio?.id ?? null });
  atual.current = { layout: layoutContado(layout, emPe), anuncio: anuncio?.id ?? null };

  useEffect(() => {
    if (previa || __DEMO__ || naoMedir()) return;
    const id = idFonteLive();
    const bater = () => {
      if (document.visibilityState === 'hidden') return;
      enviar(corpoBatimento(id, atual.current.layout, atual.current.anuncio));
    };
    // o 1º só registra a fonte; os seguintes somam os minutos no ar
    const primeiro = window.setTimeout(bater, 1500);
    const t = window.setInterval(bater, LIVES.batimentoS * 1000);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(t);
    };
  }, [previa]);
}
