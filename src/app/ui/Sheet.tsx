/**
 * Sheet: no celular, painel inferior que se arrasta para fechar; no desktop (≥ 768 px), gaveta lateral.
 * Portal + foco preso + Esc + rolagem travada.
 */
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { useIsDesktop } from '@/app/lib/useMediaQuery';
import { IconButton } from './Button';
import { useModal } from './overlay';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Lado da gaveta no desktop. Padrão 'right'. */
  side?: 'right' | 'left';
  /** Largura da gaveta no desktop. */
  width?: 'sm' | 'md' | 'lg';
  className?: string;
}

const larguras = { sm: 'md:w-[380px]', md: 'md:w-[460px]', lg: 'md:w-[600px]' };

export function Sheet({ open, onClose, title, description, children, footer, side = 'right', width = 'md', className }: SheetProps) {
  const desktop = useIsDesktop();
  const painel = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  const idT = useId();
  const idD = useId();
  useModal(open, painel, onClose);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose();
  }

  if (typeof document === 'undefined') return null;
  const off = side === 'right' ? '100%' : '-100%';
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            className="absolute inset-0 bg-bg/65 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key={desktop ? 'drawer' : 'sheet'}
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idT}
            aria-describedby={description ? idD : undefined}
            tabIndex={-1}
            initial={desktop ? { x: off } : { y: '100%' }}
            animate={desktop ? { x: 0 } : { y: 0 }}
            exit={desktop ? { x: off } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.9 }}
            drag={desktop ? false : 'y'}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.9 }}
            onDragEnd={onDragEnd}
            className={cn(
              'absolute flex flex-col border-line bg-surface outline-none shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.6)]',
              // celular: base da tela
              'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl border-t',
              // desktop: gaveta lateral
              'md:inset-y-0 md:bottom-auto md:h-dvh md:max-h-none md:rounded-none md:border-t-0',
              side === 'right' ? 'md:left-auto md:right-0 md:border-l' : 'md:left-0 md:right-auto md:border-r',
              larguras[width],
              className,
            )}
          >
            {!desktop ? (
              <div
                className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                onPointerDown={(e) => drag.start(e)}
                aria-hidden
              >
                <span className="h-1.5 w-10 rounded-full bg-fg-subtle/50" />
              </div>
            ) : null}
            <div
              className={cn('flex shrink-0 items-start justify-between gap-4 px-5', desktop ? 'pb-3 pt-6' : 'pb-3 pt-0 touch-none')}
              onPointerDown={(e) => !desktop && drag.start(e)}
            >
              <div className="min-w-0">
                <h2 id={idT} className="font-display text-lg font-semibold tracking-[-0.01em] text-fg md:text-xl">
                  {title}
                </h2>
                {description ? (
                  <p id={idD} className="mt-1 text-[13px] text-fg-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton
                icon="fechar"
                label="Fechar"
                size="sm"
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                className="-mr-1"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer ? <div className="pb-safe shrink-0 border-t border-line px-5 pt-3">{footer}</div> : <div className="pb-safe shrink-0" />}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
