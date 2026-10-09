/**
 * Ilustração do Teste Cego: duas propostas "sem rosto" (linhas abstratas, nunca texto real — nada que
 * influencie a escolha) e um selo "?" de autoria oculta. Só decoração; movimento lento e respeitoso.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';

export function CartasIlustracao({ className, compacta }: { className?: string; compacta?: boolean }) {
  const reduzir = useReducedMotion();
  const flutuar = (d: number, amp = 6) =>
    reduzir ? {} : { animate: { y: [0, -amp, 0] }, transition: { duration: 6 + d, repeat: Infinity, ease: 'easeInOut' as const, delay: d } };
  return (
    <div aria-hidden className={cn('relative select-none', compacta ? 'h-[200px]' : 'h-[300px] sm:h-[380px]', className)}>
      {/* brilho de fundo */}
      <div className="absolute left-1/2 top-1/2 h-[70%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-[60px]" />

      <motion.div className="absolute left-[2%] top-[6%] w-[68%]" {...flutuar(0)}>
        <div className="-rotate-[7deg] rounded-[22px] border border-line bg-surface p-4 shadow-card sm:p-5">
          <Cabecalho rotulo="Opção 1" />
          <Linhas larguras={['w-full', 'w-[92%]', 'w-[64%]']} />
          <div className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-[11.5px] font-semibold text-fg-muted">
            <Icon name="check" size={13} className="text-fg-subtle" />
            Prefiro esta
          </div>
        </div>
      </motion.div>

      <motion.div className="absolute bottom-[4%] right-[2%] w-[68%]" {...flutuar(1.2)}>
        <div className="relative rotate-[5deg] overflow-hidden rounded-[22px] border border-brand/55 bg-surface p-4 shadow-glow sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/[0.16] via-brand/[0.04] to-transparent" />
          <div className="relative">
            <Cabecalho rotulo="Opção 2" />
            <Linhas larguras={['w-full', 'w-[86%]', 'w-[72%]']} />
            <div className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-cta px-3 text-[11.5px] font-semibold text-brand-ink">
              <Icon name="check" size={13} strokeWidth={2.5} />
              Sua escolha
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div className="absolute right-[10%] top-[4%] sm:right-[12%]" {...flutuar(0.6, 8)}>
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-fg-subtle/60 bg-surface-2/90 font-display text-[30px] font-semibold text-fg-muted shadow-card backdrop-blur sm:h-20 sm:w-20 sm:text-[38px]">
          ?
          <span className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-fg-muted sm:h-8 sm:w-8">
            <Icon name="olho-fechado" size={15} />
          </span>
        </div>
      </motion.div>
    </div>
  );
}

function Cabecalho({ rotulo }: { rotulo: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-muted">{rotulo}</span>
      <span className="font-display text-[28px] leading-[0.6] text-brand-fg/50">“</span>
    </div>
  );
}

function Linhas({ larguras }: { larguras: string[] }) {
  return (
    <div className="mt-3 space-y-2">
      {larguras.map((w, i) => (
        <div key={i} className={cn('h-3 rounded-full bg-surface-3 sm:h-3.5', w)} />
      ))}
    </div>
  );
}
