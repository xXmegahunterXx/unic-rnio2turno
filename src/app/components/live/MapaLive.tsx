/**
 * Desenho do mapa do layout 'mapa' da live: Brasil por estado (padrão), Brasil por município (`?mapa=municipios`,
 * só Presidente) ou, numa disputa de governador ou com estado fixo (`?uf=`, Presidente), o estado por município — do
 * snapshot da UF que o placar já pediu (mesmo cache). Ocupa o espaço que sobra (mede a caixa) e é estático: sem
 * tooltip, sem foco, sem clique (`inert` — numa fonte do OBS ninguém interage).
 */
import { lazy, Suspense } from 'react';
import type { RaceId, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { useMunicipiosBr, useUf } from '@/app/data/hooks';
import { BrazilMap } from '@/app/components/apuracao/BrazilMap';
import { UfMap } from '@/app/components/apuracao/UfMap';
import { useElementSize } from '@/app/components/apuracao/MapHooks';
import type { MapaLive } from './opcoes';
import type { QuadroLive } from './pecas';

const BrazilMunicipiosMap = lazy(() => import('@/app/components/apuracao/BrazilMunicipiosMap').then((m) => ({ default: m.BrazilMunicipiosMap })));

/** Proporção do viewBox do BrazilMap (996 + 120 de caixas fora da costa × 1000) — a mesma do Modo TV. */
const AR_BRASIL = 1116 / 1000;

export function MapaLiveConteudo({ q, mapa }: { q: QuadroLive; mapa: MapaLive }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const raceId = q.race.id as RaceId;
  const uf = q.race.abrangencia !== 'BR' ? (q.race.abrangencia as UF) : (q.uf ?? null);
  const ufQ = useUf(raceId, uf ?? undefined);
  const ufSnap = uf && ufQ.data && ufQ.data.uf === uf && ufQ.data.race === raceId ? ufQ.data : undefined;
  const municipios = !uf && mapa === 'municipios';
  const mun = useMunicipiosBr(raceId, undefined, municipios);
  const snapMun = mun.data && mun.data.race === raceId ? mun.data : undefined;
  const W = size.w;
  const H = size.h;
  return (
    <div ref={ref} inert className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {W > 0 && H > 0 ? (
        uf ? (
          ufSnap ? (
            <div className="w-full [&_button]:hidden">
              <UfMap uf={uf} municipios={ufSnap.municipios} race={q.race} alturaMax={H} zoomNoDestaque={false} ariaLabel={`Mapa de ${UF_NOMES[uf]} por município`} />
            </div>
          ) : null
        ) : municipios ? (
          <div style={{ width: Math.min(W, H * 0.996) }}>
            <Suspense fallback={null}>
              <BrazilMunicipiosMap snapshot={snapMun} race={q.race} estatico alturaMax={H} ariaLabel="Mapa do Brasil por município" />
            </Suspense>
          </div>
        ) : (
          <div style={{ width: Math.min(W, H * AR_BRASIL) }}>
            <BrazilMap ufs={q.ufs ?? {}} race={q.race} valores ariaLabel="Mapa do Brasil por estado" />
          </div>
        )
      ) : null}
    </div>
  );
}
