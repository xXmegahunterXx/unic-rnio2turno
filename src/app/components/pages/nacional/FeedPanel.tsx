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
  /** Cartão em largura total (antes da 1ª seção): lista e guia lado a lado no desktop. */
  largo?: boolean;
  className?: string;
}

/** Borda translúcida por slot (classes literais para o Tailwind gerar). */
const BORDA: Record<CorCandidato, string> = {
  a: 'border-cand-a/40',
  b: 'border-cand-b/40',
  outros: 'border-line',
};

export const FeedPanel = memo(function FeedPanel({ eventos, race, largo, className }: FeedPanelProps) {
  const desktop = useIsDesktop();
  const destaque = eventos.find((e) => e.tipo === 'eleito' || e.tipo === 'virada');
  // O destaque sai da lista para não aparecer duas vezes.
  const resto = destaque ? eventos.filter((e) => e.id !== destaque.id) : eventos;
  // Começo da noite (poucos eventos): o espaço vira um guia curto de como ler a apuração.
  const poucos = eventos.length <= 3;

  if (!desktop) {
    return (
      <section aria-labelledby="feed-titulo" className={cn('min-w-0', className)}>
        <h2 id="feed-titulo" className="mb-3 font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg">
          Acontecimentos
        </h2>
        {destaque ? <Destaque e={destaque} race={race} className="mb-2.5" /> : null}
        <EventFeed eventos={resto} race={race} variant="ticker" max={10} emptyText="Os marcos da apuração aparecem aqui a partir das 17h." />
        {poucos ? <ComoAcompanhar className="mt-3 rounded-2xl border border-line bg-surface p-4" /> : null}
      </section>
    );
  }

  if (poucos) {
    return (
      <section aria-labelledby="feed-titulo" className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-card', className)}>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="feed-titulo" className="font-display text-[21px] font-semibold leading-tight tracking-[-0.015em] text-fg">
            Acontecimentos
          </h2>
          <span className="text-[12px] text-fg-muted">horário de Brasília</span>
        </div>
        <div className={cn('flex flex-1 flex-col', largo && 'lg:grid lg:grid-cols-2 lg:gap-10')}>
          <div className="min-w-0">
            {destaque ? <Destaque e={destaque} race={race} className="mb-4" /> : null}
            <EventFeed eventos={resto} race={race} variant="list" max={20} emptyText="Os marcos da apuração aparecem aqui a partir das 17h." />
          </div>
          <ComoAcompanhar className={cn('mt-auto border-t border-line pt-4', largo && 'lg:mt-0 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0')} />
        </div>
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
        <div className="-mr-2 max-h-[400px] overflow-y-auto pr-2 [mask-image:linear-gradient(to_bottom,black_calc(100%-36px),transparent)] min-[1360px]:absolute min-[1360px]:inset-0 min-[1360px]:max-h-none">
          <EventFeed eventos={resto} race={race} variant="list" max={20} className="pb-8" emptyText="Os marcos da apuração aparecem aqui a partir das 17h." />
        </div>
      </div>
    </section>
  );
});

/** Guia neutro e curto para o começo da noite: como os números chegam e quando um resultado se define. */
function ComoAcompanhar({ className }: { className?: string }) {
  const itens: { icon: 'urna' | 'troca' | 'selo'; texto: string }[] = [
    { icon: 'urna', texto: 'A partir das 17h (Brasília), cada seção totalizada pelo TSE entra no placar.' },
    { icon: 'troca', texto: 'A ordem de chegada varia entre estados e regiões, por isso quem está à frente pode mudar ao longo da noite.' },
    { icon: 'selo', texto: 'O resultado fica definido quando a diferença supera o número de eleitores das seções que faltam.' },
  ];
  return (
    <div className={className}>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Como acompanhar</p>
      <ul className="mt-3 space-y-3">
        {itens.map((it) => (
          <li key={it.icon} className="flex items-start gap-3">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-muted">
              <Icon name={it.icon} size={15} />
            </span>
            <span className="pt-[3px] text-pretty text-[13px] leading-snug text-fg-muted">{it.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
