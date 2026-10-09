/**
 * Seletor do modo de coloração dos mapas (segmented, rolável no celular).
 * Usa o `Segmented` do design system; no celular mostra os rótulos curtos.
 */
import { Segmented } from '@/app/ui/Segmented';
import { cn } from '@/app/lib/cn';
import { MAP_MODES, type MapMode } from './mapModes';

export interface MapModeSwitchProps {
  value: MapMode;
  onChange: (m: MapMode) => void;
  /** Restringe os modos oferecidos (ex.: sem 'variacao' quando não há 1º turno). */
  modos?: readonly MapMode[];
  size?: 'sm' | 'md';
  className?: string;
}

export function MapModeSwitch({ value, onChange, modos, size = 'sm', className }: MapModeSwitchProps) {
  const lista = MAP_MODES.filter((m) => !modos || modos.includes(m.id));
  return (
    <div
      className={cn('-mx-1 max-w-full overflow-x-auto px-1 pb-0.5 scrollbar-none', className)}
      // Esmaece a borda direita quando há rolagem (dica de que há mais modos).
      style={{ maskImage: 'linear-gradient(90deg, black calc(100% - 20px), transparent)', WebkitMaskImage: 'linear-gradient(90deg, black calc(100% - 20px), transparent)' }}
    >
      <Segmented<MapMode>
        ariaLabel="Colorir o mapa por"
        size={size}
        value={value}
        onChange={onChange}
        options={lista.map((m) => ({
          value: m.id,
          ariaLabel: m.label,
          label: (
            <>
              <span className="sm:hidden">{m.curto}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </>
          ),
        }))}
      />
    </div>
  );
}
