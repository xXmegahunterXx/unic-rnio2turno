/**
 * Acontecimentos da apuração: lista (desktop, em cartão) ou ticker deslizável (celular).
 * O evento mais recente de 'virada' ou 'eleito' ganha um destaque na cor do candidato.
 */
import { memo } from 'react';
import type { CorCandidato, FeedEvent, Race } from '@/shared/types';
import { fmtHora } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot, slotDe } from '@/app/lib/raceUi';
import { useIsDesktop } from '@/app/lib/useMediaQuery';
import { Icon } from '@/app/ui/Icon';
import { EventFeed } from '@/app/components/apuracao/EventFeed';

export interface FeedPanelProps {
  eventos: FeedEvent[];
  race: Race;
  className?: string;
}

/** Borda translúcida por slot (classes literais para o Tailwind gerar). */
const BORDA: Record<CorCandidato, string> = {
  a: 'border-cand-a/40',
  b: 'border-cand-b/40',
  outros: 'border-line',
};

export const FeedPanel = memo(function FeedPanel({ eventos, race, className }: FeedPanelProps) {
  const desktop = useIsDesktop();
  const destaque = eventos.find((e) => e.tipo === 'eleito' || e.tipo === 'virada');
  // O destaque sai da lista para não aparecer duas vezes.
  const resto = destaque ? eventos.filter((e) => e.id !== destaque.id) : eventos;

  if (!desktop) {
    return (
      <section aria-labelledby="feed-titulo" className={cn('min-w-0', className)}>
        <h2 id="feed-titulo" className="mb-3 font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg">
          Acontecimentos
        </h2>
        {destaque ? <Destaque e={destaque} race={race} className="mb-2.5" /> : null}
        <EventFeed eventos={resto} race={race} variant="ticker" max={10} emptyText="Os marcos da apuração aparecem aqui a partir das 17h." />
      </section>
    );
  }

  return (
    <section aria-labelledby="feed-titulo" className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-card', className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="feed-titulo" className="font-display text-[21px] font-semibold leading-tight tracking-[-0.015em] text-fg">
          Acontecimentos
        </h2>
        <span className="text-[12px] text-fg-muted">horário de Brasília</span>
      </div>
      {destaque ? <Destaque e={destaque} race={race} className="mb-4" /> : null}
      <div className="relative min-h-0 flex-1">
        <div className="-mr-2 max-h-[400px] overflow-y-auto pr-2 [mask-image:linear-gradient(to_bottom,black_calc(100%-36px),transparent)] lg:absolute lg:inset-0 lg:max-h-none">
          <EventFeed eventos={resto} race={race} variant="list" max={20} className="pb-8" emptyText="Os marcos da apuração aparecem aqui a partir das 17h." />
        </div>
      </div>
    </section>
  );
});

function Destaque({ e, race, className }: { e: FeedEvent; race: Race; className?: string }) {
  const cor = slotDe(race, e.candidato);
  const s = corSlot(cor);
  const eleito = e.tipo === 'eleito';
  return (
    <div role="note" className={cn('relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 sm:p-4', BORDA[cor], s.glow, className)}>
      <div className={cn('flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em]', s.text)}>
        <Icon name={eleito ? 'selo' : 'troca'} size={15} strokeWidth={2} />
        {eleito ? 'Resultado definido' : 'Virada'}
        <span className="text-fg-muted">·</span>
        <time dateTime={new Date(e.t).toISOString()} className="num text-fg-muted">
          {fmtHora(e.t)}
        </time>
      </div>
      <p className="mt-1.5 text-pretty text-[15.5px] font-semibold leading-snug text-fg">{e.titulo}</p>
      {e.detalhe ? <p className="num mt-1 text-[12.5px] leading-snug text-fg-muted">{e.detalhe}</p> : null}
    </div>
  );
}
