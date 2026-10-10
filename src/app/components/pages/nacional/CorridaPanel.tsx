/**
 * "A corrida da apuração": série do % de válidos de cada candidato, com eixo em % de seções ou horário.
 * Memoizado: a série só muda quando chegam novos pontos (structural sharing do React Query).
 */
import { memo, useState } from 'react';
import type { Race, SeriePoint } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { Segmented } from '@/app/ui/Segmented';
import { TimelineChart } from '@/app/components/apuracao/TimelineChart';
import { Icon } from '@/app/ui/Icon';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { useElementSize } from '@/app/components/apuracao/MapHooks';

/** Altura da legenda do TimelineChart (uma linha + margem) somada ao gráfico. */
const LEGENDA_H = 32;

export interface CorridaPanelProps {
  serie: SeriePoint[];
  race: Race;
  className?: string;
}

type Eixo = 'secoes' | 'horario';

export const CorridaPanel = memo(function CorridaPanel({ serie, race, className }: CorridaPanelProps) {
  const [eixo, setEixo] = useState<Eixo>('secoes');
  const tem = serie.length >= 2;
  const largo = useMediaQuery('(min-width: 1360px)');
  const [areaRef, area] = useElementSize<HTMLDivElement>();
  return (
    <section aria-labelledby="corrida-titulo" className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5">
        <div className="min-w-0 flex-[1_1_14rem]">
          <h2 id="corrida-titulo" className="font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[21px]">
            A corrida da apuração
          </h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-fg-muted">% dos votos válidos de cada um conforme as seções são totalizadas</p>
        </div>
        {tem ? (
          <Segmented<Eixo>
            ariaLabel="Eixo horizontal do gráfico"
            size="sm"
            value={eixo}
            onChange={setEixo}
            options={[
              { value: 'secoes', label: '% das seções' },
              { value: 'horario', label: 'Horário' },
            ]}
          />
        ) : null}
      </div>
      {tem ? (
        largo ? (
          // Desktop largo: o cartão estica até a altura da coluna do mapa; o gráfico ocupa essa altura toda
          // (absoluto dentro da área medida, para a medida não depender do próprio gráfico).
          <div ref={areaRef} className="relative min-h-[332px] flex-1">
            <div className="absolute inset-x-0 top-0">
              <TimelineChart
                serie={serie}
                race={race}
                eixoX={eixo}
                altura={Math.max(300, Math.floor(area.h) - LEGENDA_H)}
                ariaLabel={`Evolução do placar · ${race.titulo}`}
              />
            </div>
          </div>
        ) : (
          <TimelineChart serie={serie} race={race} eixoX={eixo} ariaLabel={`Evolução do placar · ${race.titulo}`} />
        )
      ) : (
        <GraficoVazio />
      )}
    </section>
  );
});

/**
 * Antes das primeiras seções: a moldura do gráfico (eixos e a linha dos 50%) com a explicação no centro,
 * para o cartão já ter a forma do que vai aparecer.
 */
function GraficoVazio() {
  const linhas = [60, 55, 50, 45, 40];
  return (
    <div className="relative flex min-h-[200px] flex-1 flex-col sm:min-h-[240px]">
      <div aria-hidden className="relative ml-9 flex-1">
        {linhas.map((v, k) => (
          <div key={v} className="absolute inset-x-0" style={{ top: `${(k / (linhas.length - 1)) * 100}%` }}>
            <div className={cn('border-t', v === 50 ? 'border-dashed border-fg-subtle/60' : 'border-line')} />
            <span className="num absolute -left-9 -translate-y-1/2 text-[11px] text-fg-subtle">{v}%</span>
          </div>
        ))}
      </div>
      <div aria-hidden className="num ml-9 mt-2 flex justify-between text-[11px] text-fg-subtle">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <div className="absolute inset-0 ml-9 flex items-center justify-center p-3">
        <div className="max-w-[340px] rounded-2xl border border-line bg-surface/90 px-4 py-3 text-center shadow-card backdrop-blur-sm">
          <p className="flex items-center justify-center gap-2 text-[14px] font-semibold text-fg">
            <Icon name="grafico" size={16} className="text-fg-muted" />O gráfico começa com as primeiras seções
          </p>
          <p className="mt-1 text-pretty text-[12.5px] leading-snug text-fg-muted">Cada ponto mostra o placar acumulado até ali, a partir das 17h (Brasília).</p>
        </div>
      </div>
    </div>
  );
}
