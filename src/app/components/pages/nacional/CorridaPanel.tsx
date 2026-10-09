/**
 * "A corrida da apuração": série do % de válidos de cada candidato, com eixo em % de seções ou horário.
 * Memoizado: a série só muda quando chegam novos pontos (structural sharing do React Query).
 */
import { memo, useState } from 'react';
import type { Race, SeriePoint } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { Segmented } from '@/app/ui/Segmented';
import { TimelineChart } from '@/app/components/apuracao/TimelineChart';
import { EmptyState } from '@/app/components/apuracao/States';

export interface CorridaPanelProps {
  serie: SeriePoint[];
  race: Race;
  className?: string;
}

type Eixo = 'secoes' | 'horario';

export const CorridaPanel = memo(function CorridaPanel({ serie, race, className }: CorridaPanelProps) {
  const [eixo, setEixo] = useState<Eixo>('secoes');
  const tem = serie.length >= 2;
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
        <div className="flex flex-1 flex-col justify-center">
          <TimelineChart serie={serie} race={race} eixoX={eixo} ariaLabel={`Evolução do placar · ${race.titulo}`} />
        </div>
      ) : (
        <EmptyState
          compact
          icon="grafico"
          title="O gráfico começa com as primeiras seções"
          description="A partir das 17h (Brasília), cada ponto mostra o placar acumulado até ali."
        />
      )}
    </section>
  );
});
