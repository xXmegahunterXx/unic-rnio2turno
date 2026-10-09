import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { useTheme } from '@/app/lib/useTheme';
import { Icon } from './Icon';

/** Alterna tema claro/escuro (persistido em localStorage 'sintonia:tema'). */
export function ThemeToggle({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const { tema, alternar } = useTheme();
  const escuro = tema === 'dark';
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
      title={escuro ? 'Tema claro' : 'Tema escuro'}
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        size === 'sm' ? 'h-8 w-8 rounded-[10px]' : 'h-10 w-10 rounded-xl',
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={tema}
          initial={{ y: 14, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 40 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="inline-flex"
        >
          <Icon name={escuro ? 'lua' : 'sol'} size={size === 'sm' ? 17 : 19} />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
