/**
 * Ilustração do Teste Cego: uma pilha de afirmações "sem rosto" (linhas abstratas, nunca texto real — nada que
 * influencie a resposta), a escala de concordância e o selo "?" de autoria oculta. Só decoração; movimento
 * lento e respeitoso (desligado com movimento reduzido).
 */
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';

const PONTOS = [2, 1, 0, 1, 2] as const;
const TAM = ['h-7 w-7 sm:h-8 sm:w-8', 'h-[22px] w-[22px] sm:h-6 sm:w-6', 'h-[18px] w-[18px] sm:h-5 sm:w-5'] as const;

export function IlustracaoAfirmacao({ className, compacta }: { className?: string; compacta?: boolean }) {
  const reduzir = useReducedMotion();
  const flutuar = (d: number, amp = 6) =>
    reduzir ? {} : { animate: { y: [0, -amp, 0] }, transition: { duration: 6 + d, repeat: Infinity, ease: 'easeInOut' as const, delay: d } };
  return (
    <div aria-hidden className={cn('relative select-none', compacta ? 'h-[210px]' : 'h-[300px] sm:h-[380px]', className)}>
      <div className="absolute left-1/2 top-1/2 h-[70%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-[60px]" />

      {/* cartas de trás: a pilha das próximas afirmações */}
      <div className="absolute left-[14%] right-[6%] top-[12%] h-[62%] rotate-[6deg] rounded-[24px] border border-line bg-surface-2/70" />
      <div className="absolute left-[9%] right-[9%] top-[9%] h-[64%] rotate-[2.5deg] rounded-[24px] border border-line bg-surface/80" />

      <motion.div className="absolute inset-x-[4%] top-[6%]" {...flutuar(0, 5)}>
        <div className="-rotate-[2deg] rounded-[24px] border border-line bg-surface p-4 shadow-card sm:p-6">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-surface-3" />
            <span className="h-2.5 w-16 rounded-full bg-surface-3" />
          </div>
          <div className={cn('space-y-2.5', compacta ? 'mt-3' : 'mt-4 sm:mt-5')}>
            <div className="h-4 w-full rounded-full bg-fg/[0.14] sm:h-5" />
            <div className="h-4 w-[88%] rounded-full bg-fg/[0.14] sm:h-5" />
            {!compacta ? <div className="h-4 w-[58%] rounded-full bg-fg/[0.14] sm:h-5" /> : null}
          </div>
          <div className={cn('relative', compacta ? 'mt-4' : 'mt-6 sm:mt-8')}>
            <div className="absolute left-[10%] right-[10%] top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-line/[2]" />
            <div className="relative grid grid-cols-5">
              {PONTOS.map((n, i) => {
                const marcado = i === 1;
                return (
                  <span key={i} className="flex h-8 items-center justify-center sm:h-9">
                    {/* fundo opaco (bg-surface) por baixo da tinta: o trilho não aparece dentro do círculo */}
                    <span className={cn('relative inline-flex items-center justify-center rounded-full bg-surface', TAM[2 - n])}>
                      <span
                        className={cn(
                          'absolute inset-0 rounded-full border-2',
                          marcado
                            ? 'border-transparent bg-brand-cta shadow-glow'
                            : n === 2
                              ? 'border-brand/70 bg-brand/[0.12]'
                              : n === 1
                                ? 'border-brand/45 bg-brand/[0.06]'
                                : 'border-fg-subtle/50 bg-surface-2',
                        )}
                      />
                      {marcado ? <Icon name="check" size={13} strokeWidth={3} className="relative text-brand-ink" /> : null}
                    </span>
                  </span>
                );
              })}
            </div>
            <div className="mt-1.5 grid grid-cols-5 text-center text-[9.5px] font-medium leading-tight text-fg-subtle sm:text-[10.5px]">
              <span>Concordo totalmente</span>
              <span className="text-fg">Concordo</span>
              <span>Neutro</span>
              <span>Discordo</span>
              <span>Discordo totalmente</span>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div className={cn('absolute', compacta ? '-top-[2%] right-0' : 'bottom-[2%] right-[2%] sm:right-[4%]')} {...flutuar(0.8, 8)}>
        <div
          className={cn(
            'relative flex items-center justify-center rounded-full border border-dashed border-fg-subtle/60 bg-surface-2/90 font-display font-semibold text-fg-muted shadow-card backdrop-blur',
            compacta ? 'h-14 w-14 text-[26px]' : 'h-16 w-16 text-[30px] sm:h-20 sm:w-20 sm:text-[38px]',
          )}
        >
          ?
          <span className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-fg-muted sm:h-8 sm:w-8">
            <Icon name="olho-fechado" size={15} />
          </span>
        </div>
      </motion.div>
    </div>
  );
}
