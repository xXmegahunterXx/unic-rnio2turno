/** Ranking/tabela de UFs: % apurado, % de cada candidato e margem; ordenável; clique → onSelect(uf). */
import { useMemo } from 'react';
import type { Race, Summary, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { pctTotalizadas, pctValidos } from '@/shared/calc';
import { cn } from '@/app/lib/cn';
import { DataTable, type Column, type SortState } from '@/app/ui/DataTable';
import { ApuradoCell, CandHeader, MargemCell, PctCell, W, margemAssinada } from './cells';

export interface UfTableProps {
  race: Race;
  ufs: Partial<Record<UF, Summary>>;
  onSelect?: (uf: UF) => void;
  /** UF destacada. */
  selected?: UF;
  /** Inclui ZZ (exterior). Padrão true. */
  incluirExterior?: boolean;
  initialSort?: SortState;
  /** Altura máxima com rolagem interna. */
  maxHeight?: number | string;
  className?: string;
}

type Linha = Summary & { uf: UF };

export function UfTable({ race, ufs, onSelect, selected, incluirExterior = true, initialSort, maxHeight, className }: UfTableProps) {
  const rows = useMemo(
    () =>
      (Object.entries(ufs) as [UF, Summary][])
        .filter(([uf, s]) => s && (incluirExterior || uf !== 'ZZ'))
        .map(([uf, s]) => ({ ...s, uf })),
    [ufs, incluirExterior],
  );
  const [ca, cb] = race.candidatos;
  const columns: Column<Linha>[] = [
    {
      key: 'uf',
      header: 'Estado',
      grow: true,
      sortValue: (r) => UF_NOMES[r.uf],
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="hidden h-6 w-8 shrink-0 items-center justify-center rounded-md bg-surface-3 font-mono text-[11px] font-semibold text-fg sm:inline-flex">
            {r.uf}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium" title={UF_NOMES[r.uf]}>
              {UF_NOMES[r.uf]}
            </span>
            <span className="block sm:hidden">
              <ApuradoCell t={r} compact />
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'apurado',
      header: 'Apurado',
      align: 'right',
      hideBelow: 'sm',
      width: W.apurado,
      sortValue: (r) => pctTotalizadas(r),
      cell: (r) => <ApuradoCell t={r} />,
    },
    {
      key: 'a',
      header: <CandHeader c={ca} />,
      headerLabel: ca.nomeUrna,
      align: 'right',
      width: W.pct,
      sortValue: (r) => pctValidos(r, 0),
      cell: (r) => <PctCell t={r} i={0} race={race} />,
    },
    {
      key: 'b',
      header: <CandHeader c={cb} />,
      headerLabel: cb.nomeUrna,
      align: 'right',
      width: W.pct,
      sortValue: (r) => pctValidos(r, 1),
      cell: (r) => <PctCell t={r} i={1} race={race} />,
    },
    {
      key: 'margem',
      header: 'Margem',
      align: 'right',
      width: W.margem,
      sortValue: margemAssinada,
      cell: (r) => <MargemCell t={r} race={race} />,
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.uf}
      onRowClick={onSelect ? (r) => onSelect(r.uf) : undefined}
      rowLabel={(r) => `Abrir ${UF_NOMES[r.uf]}`}
      rowClassName={(r) => cn(selected === r.uf && 'bg-brand/[0.08]')}
      initialSort={initialSort ?? { key: 'uf', dir: 'asc' }}
      maxHeight={maxHeight}
      caption={`Resultado por estado · ${race.titulo}`}
      className={className}
    />
  );
}
