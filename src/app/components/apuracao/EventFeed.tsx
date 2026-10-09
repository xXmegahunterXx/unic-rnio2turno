/**
 * Feed de eventos da apuração (FeedEvent[], mais recentes primeiro): ícone por tipo, hora (Brasília),
 * entrada animada. Variante 'ticker': faixa horizontal deslizável (celular).
 */
import { AnimatePresence, motion } from 'framer-motion';
import type { FeedEvent, Race, TipoEvento } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtHora } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Icon, type IconName } from '@/app/ui/Icon';

export interface EventFeedProps {
  eventos: FeedEvent[];
  /** Corrida (para colorir eventos de candidato). */
  race?: Race;
  variant?: 'list' | 'ticker';
  /** Máximo de itens. Padrão 12 (lista) / 8 (ticker). */
  max?: number;
  /** Mostra a sigla da UF em eventos estaduais. Padrão true. */
  showUf?: boolean;
  emptyText?: string;
  /** Ticker: sangra até a borda da tela (−16 px nas laterais). Padrão true; use false dentro de cartões. */
  bleed?: boolean;
  className?: string;
}

const FADE_DIREITA = 'linear-gradient(90deg, black calc(100% - 28px), transparent)';

const ICONE: Record<TipoEvento, IconName> = {
  inicio: 'play',
  marco: 'bandeira',
  lideranca: 'seta-cima',
  virada: 'troca',
  'uf-encerrada': 'check-circulo',
  eleito: 'selo',
  aviso: 'alerta',
};

function tomEvento(e: FeedEvent, race?: Race) {
  if (e.tipo === 'aviso') return 'bg-alert/15 text-alert-fg';
  if (e.candidato !== undefined && race?.candidatos[e.candidato]) {
    const s = corSlot(race.candidatos[e.candidato].cor);
    return cn(s.bgSoft, s.text);
  }
  if (e.tipo === 'uf-encerrada') return 'bg-ok/15 text-ok-fg';
  return 'bg-surface-3 text-fg-muted';
}

export function EventFeed({ eventos, race, variant = 'list', max, showUf = true, emptyText = 'Os acontecimentos da apuração aparecem aqui.', bleed = true, className }: EventFeedProps) {
  const lista = eventos.slice(0, max ?? (variant === 'ticker' ? 8 : 12));
  if (lista.length === 0) {
    return (
      <div className={cn('flex items-center gap-2.5 rounded-2xl border border-dashed border-line px-4 py-5 text-[14px] text-fg-muted', className)}>
        <Icon name="relogio" size={18} />
        {emptyText}
      </div>
    );
  }

  if (variant === 'ticker') {
    return (
      <div className={cn('relative', className)}>
        <ol
          aria-label="Últimos acontecimentos"
          className={cn('flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 scrollbar-none', bleed ? '-mx-4 scroll-px-4 px-4 sm:mx-0 sm:scroll-px-0 sm:px-0' : '')}
          // esmaece a borda direita: dica de que a faixa rola (e o cartão seguinte não "corta" seco)
          style={{ maskImage: FADE_DIREITA, WebkitMaskImage: FADE_DIREITA }}
        >
          <AnimatePresence initial={false}>
            {lista.map((e, i) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                className={cn(
                  'flex w-[78%] max-w-[300px] shrink-0 snap-start items-start gap-2.5 rounded-2xl border border-line bg-surface p-3',
                  i === 0 && 'border-brand/35',
                )}
              >
                <span className={cn('mt-px inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', tomEvento(e, race))}>
                  <Icon name={ICONE[e.tipo]} size={15} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="num text-[11px] font-medium text-fg-muted">
                    {fmtHora(e.t)}
                    {showUf && e.abrangencia !== 'BR' ? ` · ${e.abrangencia}` : ''}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-fg">{e.titulo}</div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </div>
    );
  }

  return (
    <ol aria-label="Acontecimentos da apuração" className={cn('relative', className)}>
      <AnimatePresence initial={false}>
        {lista.map((e, i) => (
          <motion.li
            key={e.id}
            layout
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className="relative"
          >
            {/* conector da linha do tempo: liga este ícone ao próximo (some no último item) */}
            {i < lista.length - 1 ? <span aria-hidden className="absolute bottom-0 left-[15.5px] top-8 w-px bg-line/[2]" /> : null}
            <div className={cn('flex gap-3', i < lista.length - 1 && 'pb-4')}>
              <span className={cn('relative z-[1] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface', tomEvento(e, race))}>
                <Icon name={ICONE[e.tipo]} size={15} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <time dateTime={new Date(e.t).toISOString()} className="num text-[12px] font-medium text-fg-muted">
                    {fmtHora(e.t)}
                  </time>
                  {showUf && e.abrangencia !== 'BR' ? (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle" title={UF_NOMES[e.abrangencia]}>
                      {e.abrangencia}
                    </span>
                  ) : null}
                </div>
                <p className={cn('mt-0.5 text-pretty text-[14.5px] leading-snug text-fg', (e.tipo === 'eleito' || e.tipo === 'virada') && 'font-semibold')}>
                  {e.titulo}
                </p>
                {e.detalhe ? <p className="num mt-0.5 text-[12.5px] leading-snug text-fg-muted">{e.detalhe}</p> : null}
              </div>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
