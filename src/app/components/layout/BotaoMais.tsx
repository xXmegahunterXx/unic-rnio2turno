/**
 * Botões "Mais" (leves, no JS inicial). O conteúdo do menu (MenuMais.tsx) é um chunk à parte: pré-carregado quando
 * o navegador fica ocioso e, de novo, ao apontar/tocar o botão.
 */
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { ativoNoMais } from './nav';

const carregar = () => import('./MenuMais');
const PainelMais = lazy(() => carregar().then((m) => ({ default: m.PainelMais })));
const FolhaMais = lazy(() => carregar().then((m) => ({ default: m.FolhaMais })));
export const preCarregarMenuMais = () => void carregar();

/** Pré-carrega o menu quando o navegador ficar ocioso (o 1º toque abre sem espera). */
export function usePreCarregarMenuMais() {
  useEffect(() => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const t = window.setTimeout(() => (ric ? ric(preCarregarMenuMais, { timeout: 6000 }) : preCarregarMenuMais()), 4000);
    return () => window.clearTimeout(t);
  }, []);
}

/** Header (≥ 768 px): botão "Mais" com o painel. */
export function BotaoMaisDesktop({ className }: { className?: string }) {
  const [aberto, setAberto] = useState(false);
  const { pathname } = useLocation();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();
  const ativo = ativoNoMais(pathname);

  useEffect(() => setAberto(false), [pathname]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onPointerEnter={preCarregarMenuMais}
        onFocus={preCarregarMenuMais}
        onClick={() => setAberto((v) => !v)}
        className={cn(
          'relative inline-flex items-center gap-1 whitespace-nowrap rounded-[10px] px-2.5 py-2 text-[14px] font-medium transition-colors lg:px-3',
          aberto || ativo ? 'text-fg' : 'text-fg-muted hover:text-fg',
          (aberto || ativo) && 'bg-surface-3/80',
        )}
      >
        Mais
        <Icon name="chevron" size={15} className={cn('transition-transform', aberto && 'rotate-180')} />
      </button>
      <Suspense fallback={null}>
        <AnimatePresence>{aberto ? <PainelMais key="mais" id={id} onFechar={() => setAberto(false)} /> : null}</AnimatePresence>
      </Suspense>
    </div>
  );
}

/** Celular: a folha "Mais" (montada só depois do 1º toque). */
export function FolhaMaisPreguicosa({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [montada, setMontada] = useState(false);
  useEffect(() => {
    if (aberto) setMontada(true);
  }, [aberto]);
  if (!montada && !aberto) return null;
  return (
    <Suspense fallback={null}>
      <FolhaMais aberto={aberto} onFechar={onFechar} />
    </Suspense>
  );
}
