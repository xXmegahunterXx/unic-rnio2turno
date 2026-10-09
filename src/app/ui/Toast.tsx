/**
 * Toast simples: `toast('Link copiado')` em qualquer lugar; `<Toaster/>` (montado no AppShell) exibe.
 * Store global mínima (sem contexto), então funciona fora de providers.
 */
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from './Icon';

export type ToastTone = 'neutral' | 'ok' | 'alert';
export interface ToastItem {
  id: number;
  texto: string;
  tone: ToastTone;
  icon?: IconName;
}

let itens: ToastItem[] = [];
let seq = 1;
const ouvintes = new Set<() => void>();
const emitir = () => ouvintes.forEach((l) => l());

/** Mostra um aviso breve. Retorna o id (para `dismissToast`). */
export function toast(texto: string, opts: { tone?: ToastTone; icon?: IconName; duracao?: number } = {}): number {
  const id = seq++;
  itens = [...itens.slice(-2), { id, texto, tone: opts.tone ?? 'neutral', icon: opts.icon }];
  emitir();
  window.setTimeout(() => dismissToast(id), opts.duracao ?? 2800);
  return id;
}

export function dismissToast(id: number) {
  itens = itens.filter((t) => t.id !== id);
  emitir();
}

const sub = (cb: () => void) => {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
};

const icones: Record<ToastTone, IconName> = { neutral: 'info', ok: 'check-circulo', alert: 'alerta' };

/** Pilha de toasts (base da tela no celular, acima da tab bar; canto inferior no desktop). */
export function Toaster() {
  const lista = useSyncExternalStore(sub, () => itens, () => itens);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      <AnimatePresence initial={false}>
        {lista.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            role="status"
            className={cn(
              'pointer-events-auto flex max-w-[min(420px,100%)] items-center gap-2.5 rounded-2xl border border-line px-4 py-3',
              'glass text-sm font-medium text-fg shadow-[0_18px_40px_-16px_rgb(0_0_0/0.65)]',
            )}
          >
            <Icon
              name={t.icon ?? icones[t.tone]}
              size={18}
              className={cn(t.tone === 'ok' && 'text-ok', t.tone === 'alert' && 'text-alert', t.tone === 'neutral' && 'text-brand-2')}
            />
            <span>{t.texto}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
