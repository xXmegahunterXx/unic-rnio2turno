/**
 * Impressão VISÍVEL de um anúncio (métrica agregada — ARCHITECTURE §10.2, item 10): conta quando pelo menos 50% do
 * bloco fica na tela por pelo menos 1 segundo, com a aba visível; uma vez por bloco por página vista.
 *
 * Envio: `navigator.sendBeacon('/api/anuncio/evento', JSON)` (corpo text/plain; sobrevive à troca de página), com
 * `fetch(..., { keepalive: true })` de reserva. Vai só { id, formato }: sem cookie, sem identificador, sem dado
 * pessoal. No build demo (sem servidor) nada é enviado.
 */
import { useEffect, type RefObject } from 'react';
import type { FormatoAnuncio } from '@/shared/anuncios';

export const LIMIAR_VISIVEL = 0.5;
export const TEMPO_VISIVEL_MS = 1000;
const ROTA_EVENTO = '/api/anuncio/evento';

/** Blocos já contados nesta página vista (`vista|bloco|id|formato`). */
const contados = new Set<string>();

export function enviarImpressao(id: string, formato: FormatoAnuncio): void {
  if (__DEMO__ || typeof window === 'undefined') return;
  const corpo = JSON.stringify({ id, formato });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ROTA_EVENTO, corpo)) return;
  } catch {
    /* cai no fetch */
  }
  try {
    void fetch(ROTA_EVENTO, {
      method: 'POST',
      body: corpo,
      keepalive: true,
      credentials: 'omit',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
    }).catch(() => undefined);
  } catch {
    /* sem rede: a métrica é só agregada, perder uma impressão não quebra nada */
  }
}

export interface OpcoesImpressao {
  id: string | undefined;
  formato: FormatoAnuncio;
  /** identifica o bloco na página (ex.: 'topo', 'nativo-2') */
  bloco: string;
  /** página vista (muda a cada navegação: o mesmo bloco conta de novo na próxima página) */
  vista: string;
  /** false = não mede (prévia, anúncio da casa) */
  ativo?: boolean;
}

/** Mede o bloco `ref` e envia a impressão uma vez quando ele fica ≥ 50% visível por ≥ 1 s. */
export function useImpressaoVisivel(ref: RefObject<HTMLElement | null>, { id, formato, bloco, vista, ativo = true }: OpcoesImpressao): void {
  useEffect(() => {
    if (!ativo || !id || __DEMO__) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const chave = `${vista}|${bloco}|${id}|${formato}`;
    if (contados.has(chave)) return;

    let visivel = false;
    let timer = 0;
    const parar = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    };
    const armar = () => {
      if (timer || !visivel || document.visibilityState !== 'visible' || contados.has(chave)) return;
      timer = window.setTimeout(() => {
        timer = 0;
        if (!visivel || document.visibilityState !== 'visible' || contados.has(chave)) return;
        contados.add(chave);
        enviarImpressao(id, formato);
        io.disconnect();
      }, TEMPO_VISIVEL_MS);
    };
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) visivel = e.isIntersecting && e.intersectionRatio >= LIMIAR_VISIVEL;
        if (visivel) armar();
        else parar();
      },
      { threshold: [0, LIMIAR_VISIVEL, 1] },
    );
    const aoMudarAba = () => (document.visibilityState === 'visible' ? armar() : parar());
    io.observe(el);
    document.addEventListener('visibilitychange', aoMudarAba);
    return () => {
      parar();
      io.disconnect();
      document.removeEventListener('visibilitychange', aoMudarAba);
    };
  }, [ref, id, formato, bloco, vista, ativo]);
}
