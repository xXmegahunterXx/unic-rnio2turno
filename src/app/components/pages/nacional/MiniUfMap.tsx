/**
 * Mini mapas estáticos para os cartões de disputa (/governadores): uma UF por município (`MiniUfMap`) ou o
 * Brasil por UF (`MiniBrMap`). Sem zoom, tooltip ou foco: são ilustrativos — os números do cartão são a
 * informação acessível. Cores pelo modo 'vencedor' (mapModes), só tokens; área sem seção totalizada =
 * `pending` com a mesma hachura dos mapas grandes.
 * Memoizados: os paths são estáveis e só o `fill` muda (com transição) a cada atualização.
 */
import { memo, useId, useMemo } from 'react';
import type { MunicipioResumo, Race, Summary, UF } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { STROKE_DIVISA } from '@/app/lib/raceUi';
import { tokenCss } from '@/app/lib/tokens';
import { Skeleton } from '@/app/ui/Skeleton';
import { useGeo } from '@/app/components/apuracao/geo';
import { MapHatchPattern } from '@/app/components/apuracao/MapHatch';
import { valorModo } from '@/app/components/apuracao/mapModes';

/** Largura típica de exibição (px), para a hachura ter o mesmo passo dos mapas grandes. */
const LARGURA_EXIBICAO = 220;

/** Marcador interno de área pendente (vira a hachura). */
const PENDENTE = '__pendente__';

interface Area {
  chave: string;
  d: string;
  fill: string;
}

/** SVG comum: áreas, hachura das pendentes e contorno opcional. */
function MiniSvg({ viewBox, areas, contorno, className }: { viewBox: string; areas: Area[]; contorno?: string; className?: string }) {
  const id = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const escala = Number(viewBox.split(/\s+/)[2]) / LARGURA_EXIBICAO || 1;
  return (
    <svg viewBox={viewBox} className={cn('h-full w-full overflow-visible', className)} aria-hidden preserveAspectRatio="xMidYMid meet">
      <defs>
        <MapHatchPattern id={id} escala={escala} />
      </defs>
      <g>
        {areas.map((a) => (
          <path
            key={a.chave}
            d={a.d}
            fill={a.fill === PENDENTE ? `url(#${id})` : a.fill}
            stroke={STROKE_DIVISA}
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            style={{ transition: 'fill 600ms ease-out' }}
          />
        ))}
      </g>
      {contorno ? (
        <path d={contorno} fill="none" stroke={tokenCss('fg-subtle', 0.55)} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}

export interface MiniUfMapProps {
  uf: UF;
  municipios: MunicipioResumo[] | undefined;
  race: Pick<Race, 'candidatos'>;
  className?: string;
}

export const MiniUfMap = memo(function MiniUfMap({ uf, municipios, race, className }: MiniUfMapProps) {
  const { data: geo, error } = useGeo(uf);
  const porIbge = useMemo(() => new Map((municipios ?? []).map((m) => [m.ibge, m])), [municipios]);
  const areas = useMemo<Area[]>(() => {
    if (!geo) return [];
    return Object.entries(geo.municipios).map(([ibge, f]) => {
      const v = valorModo('vencedor', porIbge.get(ibge), { race });
      return { chave: ibge, d: f.d, fill: v.pendente ? PENDENTE : v.fill };
    });
  }, [geo, porIbge, race]);

  if (error) return <div aria-hidden className={cn('rounded-xl bg-surface-2', className)} />;
  if (!geo) return <Skeleton className={className} rounded="lg" />;
  return <MiniSvg viewBox={geo.viewBox} areas={areas} contorno={geo.contorno} className={className} />;
});

export interface MiniBrMapProps {
  ufs: Partial<Record<UF, Summary>> | undefined;
  race: Pick<Race, 'candidatos'>;
  className?: string;
}

export const MiniBrMap = memo(function MiniBrMap({ ufs, race, className }: MiniBrMapProps) {
  const { data: geo, error } = useGeo();
  const areas = useMemo<Area[]>(() => {
    if (!geo) return [];
    return Object.entries(geo.ufs).map(([uf, f]) => {
      const v = valorModo('vencedor', ufs?.[uf as UF], { race });
      return { chave: uf, d: f.d, fill: v.pendente ? PENDENTE : v.fill };
    });
  }, [geo, ufs, race]);

  if (error) return <div aria-hidden className={cn('rounded-xl bg-surface-2', className)} />;
  if (!geo) return <Skeleton className={className} rounded="lg" />;
  return <MiniSvg viewBox={geo.viewBox} areas={areas} className={className} />;
});
