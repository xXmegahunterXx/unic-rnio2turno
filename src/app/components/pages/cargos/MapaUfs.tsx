/**
 * Cartograma de blocos das 27 UFs (mesma grade 6 × 8 do TileMap da apuração) para os cargos do 1º turno.
 * Cada bloco recebe 1 ou 2 faixas de cor (ex.: Senado = 2 vagas → 2 faixas, uma por eleito), a sigla da UF
 * num selo legível sobre qualquer cor e uma dica com os nomes. Clique seleciona a UF.
 * Identidade nunca só pela cor: a dica e a lista ao lado trazem partido e nome.
 */
import type { ReactNode } from 'react';
import type { UFBr } from '@/shared/types';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { Tooltip } from '@/app/ui/Tooltip';
import { TILE_LAYOUT } from '@/app/components/apuracao/TileMap';

export interface CelulaUf {
  /** Preenchimentos CSS das faixas (de cima para baixo). Vazio = neutro. */
  faixas: string[];
  /** Conteúdo da dica (nomes, partidos). */
  dica: ReactNode;
  /** Rótulo para leitores de tela. */
  rotulo: string;
  /** Estado especial (ex.: governador em 2º turno). */
  especial?: ReactNode;
}

export function MapaUfs({
  celulas,
  selecionada,
  onSelect,
  ariaLabel,
  className,
}: {
  celulas: Partial<Record<UFBr, CelulaUf>>;
  selecionada?: UFBr | null;
  onSelect?: (uf: UFBr) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('mx-auto w-full max-w-[420px]', className)}>
      <div className="grid grid-cols-6 grid-rows-[repeat(8,auto)] gap-[5px] sm:gap-1.5">
        {UFS.map((uf) => {
          const [c, r] = TILE_LAYOUT[uf];
          const cel = celulas[uf];
          const sel = selecionada === uf;
          const apagado = !!selecionada && !sel;
          return (
            <div key={uf} style={{ gridColumnStart: c + 1, gridRowStart: r + 1 }} className="aspect-square">
              <Tooltip content={cel?.dica ?? UF_NOMES[uf]} delay={80}>
                <button
                  type="button"
                  aria-label={cel?.rotulo ?? UF_NOMES[uf]}
                  aria-pressed={sel}
                  onClick={() => onSelect?.(uf)}
                  className={cn(
                    'group relative flex h-full w-full flex-col overflow-hidden rounded-[10px] bg-surface-3 outline-none transition-[opacity,transform,box-shadow] duration-200',
                    'hover:-translate-y-px hover:shadow-card focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    sel && 'ring-2 ring-fg ring-offset-2 ring-offset-bg',
                    apagado && 'opacity-50 hover:opacity-100',
                  )}
                >
                  {cel?.especial ? (
                    <span className="absolute inset-0">{cel.especial}</span>
                  ) : (
                    (cel?.faixas.length ? cel.faixas : ['']).map((f, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className={cn('block flex-1', i > 0 && 'border-t-2 border-bg/80')}
                        style={f ? { background: f } : undefined}
                      />
                    ))
                  )}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface/90 px-1 py-[3px] font-display text-[10.5px] font-semibold leading-none tracking-wide text-fg shadow-sm min-[400px]:text-[11.5px] sm:px-1.5 sm:text-[12px]"
                  >
                    {uf}
                  </span>
                </button>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}
