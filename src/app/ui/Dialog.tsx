/** Diálogo modal centralizado (portal, Esc fecha, foco preso, rolagem travada). */
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { IconButton } from './Button';
import { useModal } from './overlay';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Rodapé (ações). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const larguras = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', className }: DialogProps) {
  const painel = useRef<HTMLDivElement>(null);
  const idT = useId();
  const idD = useId();
  useModal(open, painel, onClose);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idT}
            aria-describedby={description ? idD : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn(
              'relative w-full overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] outline-none',
              larguras[size],
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
              <div className="min-w-0">
                <h2 id={idT} className="font-display text-xl font-semibold tracking-[-0.01em] text-fg">
                  {title}
                </h2>
                {description ? (
                  <p id={idD} className="mt-1 text-sm text-fg-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton icon="fechar" label="Fechar" size="sm" onClick={onClose} className="-mr-1 -mt-1" />
            </div>
            <div className="max-h-[70dvh] overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
            {footer ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3 sm:px-6">{footer}</div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
