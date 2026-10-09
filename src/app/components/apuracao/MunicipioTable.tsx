/** Tabela de municípios: busca acento-insensível, ordenação, "ver mais", destaque da capital. */
import { useMemo, useState } from 'react';
import type { MunicipioResumo, Race } from '@/shared/types';
import { pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtCompact, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Badge } from '@/app/ui/Badge';
import { DataTable, type Column, type SortState } from '@/app/ui/DataTable';
import { SearchBox } from '@/app/ui/SearchBox';
import { casa } from '@/app/ui/textMatch';
import { ApuradoCell, CandHeader, MargemCell, PctCell, W, margemAssinada } from './cells';

export interface MunicipioTableProps {
  race: Race;
  municipios: MunicipioResumo[];
  onSelect?: (m: MunicipioResumo) => void;
  /** Linhas por página ("ver mais"). Padrão 20. */
  pageSize?: number;
  /** Mostra a busca. Padrão true. */
  searchable?: boolean;
  initialSort?: SortState;
  className?: string;
}

export function MunicipioTable({ race, municipios, onSelect, pageSize = 20, searchable = true, initialSort, className }: MunicipioTableProps) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => (q ? municipios.filter((m) => casa(m.nome, q)) : municipios), [municipios, q]);
  const [ca, cb] = race.candidatos;
  const columns: Column<MunicipioResumo>[] = [
    {
      key: 'nome',
      header: 'Município',
      grow: true,
      sortValue: (m) => m.nome,
      cell: (m) => (
        <span className="block min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span title={m.nome} className={cn('truncate', m.capital ? 'font-semibold' : 'font-medium')}>
              {m.nome}
            </span>
            {m.capital ? (
              <Badge tone="brand" size="xs" className="hidden min-[400px]:inline-flex">
                Capital
              </Badge>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center gap-2 sm:hidden">
            <ApuradoCell t={m} compact />
          </span>
        </span>
      ),
    },
    {
      key: 'eleitorado',
      header: 'Eleitores',
      align: 'right',
      hideBelow: 'md',
      width: W.eleitores,
      sortValue: (m) => m.eleitorado,
      cell: (m) => <span title={fmtInt(m.eleitorado)}>{fmtCompact(m.eleitorado)}</span>,
    },
    {
      key: 'apurado',
      header: 'Apurado',
      align: 'right',
      hideBelow: 'sm',
      width: W.apuradoSemBarra,
      sortValue: (m) => pctTotalizadas(m),
      cell: (m) => <ApuradoCell t={m} bar={false} />,
    },
    { key: 'a', header: <CandHeader c={ca} />, headerLabel: ca.nomeUrna, align: 'right', width: W.pct, sortValue: (m) => pctValidos(m, 0), cell: (m) => <PctCell t={m} i={0} race={race} /> },
    { key: 'b', header: <CandHeader c={cb} />, headerLabel: cb.nomeUrna, align: 'right', width: W.pct, sortValue: (m) => pctValidos(m, 1), cell: (m) => <PctCell t={m} i={1} race={race} /> },
    { key: 'margem', header: 'Margem', align: 'right', width: W.margem, sortValue: margemAssinada, cell: (m) => <MargemCell t={m} race={race} /> },
  ];
  return (
    <div className={className}>
      {searchable ? (
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Buscar município"
          size="md"
          className="mb-3"
          trailing={q ? <span className="num mr-1 text-[12px] text-fg-muted">{fmtInt(rows.length)}</span> : null}
        />
      ) : null}
      <DataTable
        key={q ? 'busca' : 'todos'}
        rows={rows}
        columns={columns}
        rowKey={(m) => m.cod}
        onRowClick={onSelect}
        rowLabel={(m) => `Abrir ${m.nome}`}
        rowClassName={(m) => (m.capital ? 'bg-brand/[0.05]' : undefined)}
        initialSort={initialSort ?? { key: 'eleitorado', dir: 'desc' }}
        pageSize={pageSize}
        itemLabel="municípios"
        caption={`Resultado por município · ${race.titulo}`}
        empty={q ? `Nenhum município encontrado para “${q}”` : 'Sem municípios'}
      />
    </div>
  );
}
