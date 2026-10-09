/**
 * Barra dividida A | B (| Outros) com marcador de 50%, larguras animadas.
 * Opcionalmente mostra o % apurado como um trilho fino abaixo.
 */
import type { CorCandidato } from '@/shared/types';
import { pctValidos, validos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';

export interface VoteSplitBarProps {
  /** Votos por candidato (ordem de Race.candidatos). */
  votos: number[];
  /** Slots de cor na mesma ordem. Padrão ['a', 'b', 'outros'…]. */
  cores?: CorCandidato[];
  /** 0–100: trilho fino com o % de seções totalizadas. */
  apurado?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Marcador de 50%. Padrão true (só faz sentido com 2 candidatos). */
  showMarker?: boolean;
  /** % de válidos nas pontas. */
  showLabels?: boolean;
  /** Texto para leitores de tela (padrão: "% de cada candidato"). */
  ariaLabel?: string;
  /** Nomes para o texto acessível. */
  nomes?: string[];
  className?: string;
}

const alturas = { xs: 'h-1.5', sm: 'h-2', md: 'h-3', lg: 'h-4' };

export function VoteSplitBar({
  votos,
  cores,
  apurado,
  size = 'md',
  showMarker = true,
  showLabels,
  ariaLabel,
  nomes,
  className,
}: VoteSplitBarProps) {
  const total = validos({ votos });
  const pcts = votos.map((_, i) => pctValidos({ votos }, i));
  const slots = votos.map((_, i) => cores?.[i] ?? (i === 0 ? 'a' : i === 1 ? 'b' : 'outros'));
  const label =
    ariaLabel ??
    (total > 0
      ? pcts.map((p, i) => `${nomes?.[i] ?? `Candidato ${i + 1}`}: ${fmtPct(p)}`).join('; ')
      : 'Sem votos apurados');
  const raio = size === 'xs' || size === 'sm' ? 'rounded-full' : 'rounded-[6px]';
  return (
    <div className={cn('w-full', className)}>
      {showLabels && total > 0 ? (
        <div className="mb-1.5 flex items-baseline justify-between text-[12px] font-semibold">
          <span className={cn('num', corSlot(slots[0]).text)}>{fmtPct(pcts[0], 1)}</span>
          <span className={cn('num', corSlot(slots[slots.length > 2 ? 1 : slots.length - 1]).text)}>
            {fmtPct(pcts[slots.length > 2 ? 1 : pcts.length - 1], 1)}
          </span>
        </div>
      ) : null}
      <div role="img" aria-label={label} className="relative">
        <div className={cn('relative flex w-full gap-[2px] overflow-hidden', alturas[size], raio)}>
          {total > 0 ? (
            // Outros (se houver) fica no meio para A e B tocarem as pontas.
            ordemVisual(slots).map((i) => (
              <div
                key={i}
                className={cn('h-full min-w-0 transition-[flex-grow] duration-700 ease-[cubic-bezier(.22,.9,.24,1)]', corSlot(slots[i]).bg)}
                style={{ flexGrow: Math.max(pcts[i], 0.0001), flexBasis: 0 }}
              />
            ))
          ) : (
            <div className="h-full w-full bg-pending" />
          )}
        </div>
        {showMarker && votos.length >= 2 ? (
          <div aria-hidden className="pointer-events-none absolute inset-y-[-4px] left-1/2 w-0">
            <div className="h-full w-[2px] -translate-x-1/2 rounded-full bg-fg/90" />
          </div>
        ) : null}
      </div>
      {apurado !== undefined ? (
        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full rounded-full bg-brand/80 transition-[width] duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(100, apurado))}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function ordemVisual(slots: CorCandidato[]): number[] {
  const idx = slots.map((_, i) => i);
  if (slots.length < 3) return idx;
  const outros = idx.filter((i) => slots[i] === 'outros');
  const resto = idx.filter((i) => slots[i] !== 'outros');
  if (resto.length < 2) return idx;
  return [resto[0], ...outros, ...resto.slice(1)];
}
