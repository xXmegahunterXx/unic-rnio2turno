/**
 * Alterna a disputa exibida: Presidente | Governador (e a UF, quando necessário).
 * Navega via `?race=` (useRaceParam) — ou chame `onChange` para controlar por fora.
 */
import { useMemo } from 'react';
import type { Race, RaceId, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { useRaceParam } from '@/app/lib/useRaceParam';
import { Segmented } from '@/app/ui/Segmented';

export interface RaceSwitcherProps {
  races: Race[];
  /** Corrida atual. Padrão: lida de ?race=. */
  value?: RaceId;
  /** Callback (padrão: grava em ?race=). */
  onChange?: (race: RaceId) => void;
  /** Contexto de UF (página de estado/município): "Governador" vai direto para gov-{uf}. */
  uf?: UF;
  /** Considera também as corridas de 1º turno. Padrão false. */
  incluirPrimeiroTurno?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const familia = (id: RaceId) => id.replace(/-t1$/, '');

export function RaceSwitcher({ races, value, onChange, uf, incluirPrimeiroTurno, size = 'md', className }: RaceSwitcherProps) {
  const [param, setParam] = useRaceParam();
  const atual = value ?? param;
  const mudar = onChange ?? ((id: RaceId) => setParam(id));
  const t1 = atual.endsWith('-t1');
  const sufixo = t1 && incluirPrimeiroTurno ? '-t1' : '';

  const govs = useMemo(
    () => races.filter((r) => r.cargo === 'Governador' && r.turno === 2).sort((a, b) => UF_NOMES[a.abrangencia as UF].localeCompare(UF_NOMES[b.abrangencia as UF], 'pt-BR')),
    [races],
  );
  const govDaUf = uf ? govs.find((r) => r.abrangencia === uf) : undefined;
  const cargo: 'pres' | 'gov' = familia(atual).startsWith('gov') ? 'gov' : 'pres';
  const govAtual = cargo === 'gov' ? familia(atual) : null;

  function escolherCargo(c: 'pres' | 'gov') {
    if (c === 'pres') return mudar(`pres${sufixo}`);
    const alvo = govDaUf ?? govs.find((g) => g.id === govAtual) ?? govs[0];
    if (alvo) mudar(`${alvo.id}${sufixo}`);
  }

  const govDisponivel = uf ? !!govDaUf : govs.length > 0;
  return (
    <div className={cn('flex flex-col items-start gap-2.5', className)}>
      <Segmented<'pres' | 'gov'>
        ariaLabel="Disputa"
        size={size}
        value={cargo}
        onChange={escolherCargo}
        options={[
          { value: 'pres', label: 'Presidente' },
          { value: 'gov', label: uf && govDaUf ? `Governador · ${uf}` : 'Governador', disabled: !govDisponivel },
        ]}
      />
      {cargo === 'gov' && !uf && govs.length > 1 ? (
        <div role="radiogroup" aria-label="Estado" className="-mx-4 flex w-[calc(100%+2rem)] gap-1.5 overflow-x-auto px-4 pb-0.5 scrollbar-none sm:mx-0 sm:w-full sm:flex-wrap sm:px-0">
          {govs.map((g) => {
            const sel = g.id === govAtual;
            const sigla = g.abrangencia as UF;
            return (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={sel}
                aria-label={UF_NOMES[sigla]}
                onClick={() => mudar(`${g.id}${sufixo}`)}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  sel ? 'border-transparent bg-fg text-bg' : 'border-line bg-surface-2 text-fg-muted hover:text-fg',
                )}
              >
                <span className="font-mono text-[11.5px] font-semibold">{sigla}</span>
                <span className="hidden sm:inline">{UF_NOMES[sigla]}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
