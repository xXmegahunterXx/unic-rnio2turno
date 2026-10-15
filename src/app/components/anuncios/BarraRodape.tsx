/**
 * Formato 'rodape': barra fixa no pé da tela do celular (< 768 px), logo acima da tab bar: logo, marca, título,
 * botão e "fechar" (lembrado até o fim da visita). Aparece depois da 1ª rolagem ou de 2 s; respeita a área segura;
 * some com diálogo/folha aberta (compartilhar, busca, menu) e enquanto ela está na tela a página ganha espaço no fim
 * (`--anuncio-rodape-h`, usado pelo rodapé do AppShell) para nada ficar escondido atrás dela.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { AnuncioPublico } from '@/shared/anuncios';
import { cn } from '@/app/lib/cn';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { Icon } from '@/app/ui/Icon';
import { useAnunciosDaPagina } from './contexto';
import { useImpressaoVisivel } from './impressao';
import { CtaAnuncio, LinkAnuncio, LogoMarca } from './pecas';
import { fecharRodape, rodapeFechado } from './visita';

/** Altura da barra (sem a área segura), também reservada no fim da página. */
export const ALTURA_RODAPE_PX = 60;
const ESPERA_MS = 2000;

/** Há um diálogo/folha aberto? (Dialog e Sheet travam a rolagem do <html>; a busca e o menu usam aria-modal). */
function useModalAberto(): boolean {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const html = document.documentElement;
    const ver = () => setAberto(html.style.overflow === 'hidden' || document.querySelector('[aria-modal="true"]') !== null);
    ver();
    const mo = new MutationObserver(ver);
    mo.observe(html, { attributes: true, attributeFilter: ['style'] });
    mo.observe(document.body, { childList: true });
    return () => mo.disconnect();
  }, []);
  return aberto;
}

/** Libera a barra depois da 1ª rolagem ou de 2 s. */
function useLiberada(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (ok) return;
    const liberar = () => setOk(true);
    const t = window.setTimeout(liberar, ESPERA_MS);
    window.addEventListener('scroll', liberar, { passive: true, once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', liberar);
    };
  }, [ok]);
  return ok;
}

/** Barra do rodapé (slot do AppShell; só no celular). */
export function BarraRodape() {
  const { escolha, vista, semProvedor } = useAnunciosDaPagina();
  const celular = !useMediaQuery('(min-width: 768px)', true);
  const [fechada, setFechada] = useState(rodapeFechado);
  const liberada = useLiberada();
  const modal = useModalAberto();
  const a = semProvedor ? null : escolha.rodape;
  const visivel = !!a && celular && !fechada && liberada && !modal;

  // espaço no fim da página enquanto a barra existe (o rodapé do AppShell soma esta altura)
  const reserva = !!a && celular && !fechada;
  useEffect(() => {
    const html = document.documentElement;
    if (reserva) html.style.setProperty('--anuncio-rodape-h', `${ALTURA_RODAPE_PX + 8}px`);
    else html.style.removeProperty('--anuncio-rodape-h');
    return () => {
      html.style.removeProperty('--anuncio-rodape-h');
    };
  }, [reserva]);

  return (
    <AnimatePresence>
      {visivel && a ? (
        <BarraRodapeMovel
          key="barra-rodape"
          anuncio={a}
          vista={vista}
          onFechar={() => {
            fecharRodape();
            setFechada(true);
          }}
        />
      ) : null}
    </AnimatePresence>
  );
}

function BarraRodapeMovel({ anuncio, vista, onFechar }: { anuncio: AnuncioPublico; vista: string; onFechar: () => void }) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      initial={reduzir ? { opacity: 0 } : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduzir ? { opacity: 0 } : { y: 24, opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      // logo acima da tab bar (60 px + área segura), abaixo dos diálogos (z-70) e da tab bar (z-50)
      className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-40 px-2 pb-2 md:hidden"
    >
      <BarraRodapePeca anuncio={anuncio} vista={vista} onFechar={onFechar} className="mx-auto max-w-md" />
    </motion.div>
  );
}

export function BarraRodapePeca({
  anuncio: a,
  vista = 'previa',
  onFechar,
  previa,
  className,
}: {
  anuncio: AnuncioPublico;
  vista?: string;
  onFechar?: () => void;
  previa?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useImpressaoVisivel(ref, { id: a.id, formato: 'rodape', bloco: 'rodape', vista, ativo: !previa });
  return (
    <aside
      aria-label="Publicidade"
      style={{ height: ALTURA_RODAPE_PX }}
      className={cn(
        'relative flex items-center gap-1 rounded-2xl border border-line bg-surface py-1.5 pl-1.5 pr-1 shadow-[0_14px_40px_-12px_rgb(0_0_0/0.55),0_2px_6px_-2px_rgb(0_0_0/0.2)]',
        className,
      )}
    >
      {/* rótulo na borda de cima: sempre visível, sem tirar espaço da marca e do título */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-2 left-3 inline-flex h-4 items-center rounded-full border border-line bg-surface px-1.5 text-[9px] font-bold uppercase leading-none tracking-[0.12em] text-fg-subtle"
      >
        Publicidade
      </span>
      <LinkAnuncio ref={ref} anuncio={a} formato="rodape" previa={previa} className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-xl">
        <LogoMarca anuncio={a} tamanho="md" className="h-11 w-11" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[11.5px] font-semibold text-fg-muted">{a.marca}</span>
          <span className="mt-0.5 line-clamp-2 text-[13.5px] font-semibold leading-[1.18] text-fg">{a.titulo}</span>
        </span>
        <CtaAnuncio texto={a.cta} tamanho="sm" className="max-[359px]:hidden" />
      </LinkAnuncio>
      <button
        type="button"
        onClick={onFechar}
        disabled={!onFechar}
        aria-label={`Fechar o anúncio de ${a.marca}`}
        className="toque relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none"
      >
        <Icon name="fechar" size={16} />
      </button>
    </aside>
  );
}
