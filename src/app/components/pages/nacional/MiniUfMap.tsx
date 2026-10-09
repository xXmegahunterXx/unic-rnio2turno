/**
 * Mini mapa estático de uma UF por município (cartões de governador). Sem zoom, tooltip ou foco:
 * é decorativo/ilustrativo — os números do cartão são a informação acessível. Cores pelo modo
 * 'vencedor' (mapModes), só tokens; município sem seção totalizada = `pending`.
 * Memoizado: os paths são estáveis e só o `fill` muda (com transição) a cada atualização.
 */
import { memo, useMemo } from 'react';
import type { MunicipioResumo, Race, UF } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { STROKE_DIVISA } from '@/app/lib/raceUi';
import { tokenCss } from '@/app/lib/tokens';
import { Skeleton } from '@/app/ui/Skeleton';
import { useGeo } from '@/app/components/apuracao/geo';
import { valorModo } from '@/app/components/apuracao/mapModes';

export interface MiniUfMapProps {
  uf: UF;
  municipios: MunicipioResumo[] | undefined;
  race: Pick<Race, 'candidatos'>;
  className?: string;
}

export const MiniUfMap = memo(function MiniUfMap({ uf, municipios, race, className }: MiniUfMapProps) {
  const { data: geo, error } = useGeo(uf);
  const porIbge = useMemo(() => new Map((municipios ?? []).map((m) => [m.ibge, m])), [municipios]);
  const itens = useMemo(() => (geo ? Object.entries(geo.municipios) : []), [geo]);
  const fills = useMemo(() => {
    const out = new Map<string, string>();
    for (const [ibge] of itens) out.set(ibge, valorModo('vencedor', porIbge.get(ibge), { race }).fill);
    return out;
  }, [itens, porIbge, race]);

  if (error) return <div aria-hidden className={cn('rounded-xl bg-surface-2', className)} />;
  if (!geo) return <Skeleton className={className} rounded="lg" />;
  return (
    <svg viewBox={geo.viewBox} className={cn('h-full w-full overflow-visible', className)} aria-hidden preserveAspectRatio="xMidYMid meet">
      <g>
        {itens.map(([ibge, f]) => (
          <path
            key={ibge}
            d={f.d}
            fill={fills.get(ibge)}
            stroke={STROKE_DIVISA}
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            style={{ transition: 'fill 600ms ease-out' }}
          />
        ))}
      </g>
      <path d={geo.contorno} fill="none" stroke={tokenCss('fg-subtle', 0.55)} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
});
