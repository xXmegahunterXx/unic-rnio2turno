/**
 * Barra dividida A | B (| Outros) com marcador de 50%, larguras animadas.
 * Opcionalmente mostra o % apurado como um trilho fino abaixo.
 *
 * Desempenho: na apuração ao vivo os números mudam a cada segundo. Os segmentos são posicionados e dimensionados com
 * transform (translateX + scaleX, origem à esquerda), que o navegador anima na GPU — animar `flex-grow`/`width` fazia
 * layout da página a cada quadro e pesava em celular fraco. Visual idêntico: segmentos retos, cantos pelo contêiner.
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
        <div className={cn('relative w-full overflow-hidden', alturas[size], raio)}>
          {total > 0 ? (
            // Outros (se houver) fica no meio para A e B tocarem as pontas.
            segmentos(ordemVisual(slots), pcts).map(({ i, transform, largura }) => (
              <div
                key={i}
                className={cn('absolute inset-y-0 left-0 origin-left transition-transform duration-700 ease-[cubic-bezier(.22,.9,.24,1)]', corSlot(slots[i]).bg)}
                style={{ width: largura, transform }}
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
          <div className="h-full w-full rounded-full bg-brand/80 transition-transform duration-700 ease-out" style={{ transform: `translateX(${Math.max(0, Math.min(100, apurado)) - 100}%)` }} />
        </div>
      ) : null}
    </div>
  );
}

/** Espaço entre segmentos (px), o mesmo `gap-[2px]` de antes. */
const VAO = 2;

/**
 * Posição de cada segmento só com transform: todos têm a largura útil (100% menos os vãos) e começam na esquerda;
 * `translateX(acumulado% + vãos)` leva ao início e `scaleX(fração)` dá o tamanho. Frações sobre a soma (100% de válidos).
 * Pura (testada).
 */
export function segmentos(ordem: number[], pcts: number[]): { i: number; transform: string; largura: string }[] {
  const soma = ordem.reduce((s, i) => s + Math.max(0, pcts[i] ?? 0), 0);
  const n = ordem.length;
  const largura = n > 1 ? `calc(100% - ${(n - 1) * VAO}px)` : '100%';
  let acumulado = 0;
  return ordem.map((i, k) => {
    const f = soma > 0 ? Math.max(0, pcts[i] ?? 0) / soma : 1 / n;
    const inicio = acumulado;
    acumulado += f;
    const r = (x: number) => Math.round(x * 1e5) / 1e5;
    return { i, largura, transform: `translateX(calc(${r(inicio * 100)}% + ${k * VAO}px)) scaleX(${r(f)})` };
  });
}

function ordemVisual(slots: CorCandidato[]): number[] {
  const idx = slots.map((_, i) => i);
  if (slots.length < 3) return idx;
  const outros = idx.filter((i) => slots[i] === 'outros');
  const resto = idx.filter((i) => slots[i] !== 'outros');
  if (resto.length < 2) return idx;
  return [resto[0], ...outros, ...resto.slice(1)];
}
