/**
 * Busca rápida (Ctrl/⌘ + K, "/" ou a lupa do header e da tab bar): paleta de comandos acessível.
 *
 *  - busca sem acento e sem caixa em municípios (5.571 + cidades no exterior), UFs, candidatos com ficha e páginas;
 *  - "zona/seção": "SP 1 123", "zona 1 seção 123", "campinas 33 120" → vai direto ao boletim; sem município no
 *    texto, pede o município (passo 2 dentro da própria paleta);
 *  - resultados agrupados, ↑/↓ para navegar, Enter abre, Esc fecha (ou volta do passo do município);
 *  - recentes só neste aparelho (localStorage, com try/catch).
 * Padrão ARIA: diálogo modal com combobox + listbox (aria-activedescendant).
 *
 * Montagem: `<BuscaRapida />` uma vez (AppShell). Abrir de qualquer lugar: `abrirBusca()`.
 */
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';

/** O painel (índice, listas, dados) só é baixado na 1ª abertura: fora do JS inicial. */
const PainelBusca = lazy(() => import('./PainelBusca'));
/** Pré-carrega o painel (ex.: ao passar o mouse na lupa). */
export const preCarregarBusca = () => void import('./PainelBusca');

// ---------------------------------------------------------------------------------------------
// Estado global (aberta/fechada)
// ---------------------------------------------------------------------------------------------

let aberta = false;
const ouvintes = new Set<() => void>();
function setAberta(v: boolean) {
  if (aberta === v) return;
  aberta = v;
  ouvintes.forEach((f) => f());
}
/** Abre a busca rápida (de qualquer componente). */
export const abrirBusca = () => setAberta(true);
export const fecharBusca = () => setAberta(false);
function useAberta() {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => aberta,
    () => false,
  );
}

/** "⌘K" no Mac, "Ctrl K" nos demais. */
export function atalhoTeclado(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
}

export function BuscaRapida() {
  const aberto = useAberta();
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAberta(!aberta);
        return;
      }
      if (e.key === '/' && !aberta && !e.ctrlKey && !e.metaKey) {
        const t = e.target as HTMLElement | null;
        const digitando = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
        if (!digitando) {
          e.preventDefault();
          setAberta(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <Suspense fallback={null}>
      <AnimatePresence>{aberto ? <PainelBusca key="busca" onClose={fecharBusca} /> : null}</AnimatePresence>
    </Suspense>,
    document.body,
  );
}

/** Botão de busca para o header: campo "falso" com o atalho no desktop; só a lupa no celular. */
export function BotaoBusca({ className, compacto }: { className?: string; compacto?: boolean }) {
  const [atalho, setAtalho] = useState('Ctrl K');
  useEffect(() => setAtalho(atalhoTeclado()), []);
  if (compacto) {
    // lupa; a partir de 1280 px também mostra o atalho do teclado ao lado
    return (
      <button
        type="button"
        onClick={abrirBusca}
        onPointerEnter={preCarregarBusca}
        onFocus={preCarregarBusca}
        aria-label={`Buscar (${atalho})`}
        aria-keyshortcuts="Control+K Meta+K"
        title={`Buscar (${atalho})`}
        className={cn(
          'inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-2 text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand xl:border xl:border-line xl:pl-2.5 xl:pr-1.5',
          className,
        )}
      >
        <Icon name="busca" size={18} />
        <kbd className="hidden rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-fg-muted xl:inline-block">{atalho}</kbd>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={abrirBusca}
      onPointerEnter={preCarregarBusca}
      onFocus={preCarregarBusca}
      aria-label={`Buscar município, candidato ou seção (${atalho})`}
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        'group inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-surface-2/70 pl-3 pr-1.5 text-[13px] text-fg-muted transition-colors hover:border-line/[2.5] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      <Icon name="busca" size={16} />
      <span className="whitespace-nowrap">Buscar</span>
      <kbd className="ml-1 rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-fg-muted">{atalho}</kbd>
    </button>
  );
}
