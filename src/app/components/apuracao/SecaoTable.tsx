/**
 * ZonaTable (ZonaResumo[]) e SecaoTable (SecaoResumo[]): nº, status, aptos, comparecimento, votos e vencedor.
 */
import { useMemo, useState } from 'react';
import type { Race, SecaoResumo, ZonaResumo } from '@/shared/types';
import { margem, pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtHora, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot, slotDe } from '@/app/lib/raceUi';
import { DataTable, soAbaixoDe, type Column } from '@/app/ui/DataTable';
import { Segmented } from '@/app/ui/Segmented';
import { SearchBox } from '@/app/ui/SearchBox';
import { ApuradoCell, CandHeader, LARGURA, MargemCell, PctCell, W, margemAssinada } from './cells';
import { CandidateAvatar } from './CandidateAvatar';

export interface ZonaTableProps {
  race: Race;
  zonas: ZonaResumo[];
  onSelect?: (zona: number) => void;
  selected?: number;
  className?: string;
}

export function ZonaTable({ race, zonas, onSelect, selected, className }: ZonaTableProps) {
  const [ca, cb] = race.candidatos;
  const columns: Column<ZonaResumo>[] = [
    {
      key: 'zona',
      header: 'Zona',
      grow: true,
      sortValue: (z) => z.zona,
      firstDir: 'asc',
      cell: (z) => (
        <span className="block">
          <span className="font-mono text-[13px] font-semibold">{String(z.zona).padStart(3, '0')}</span>
          <span className={cn('mt-0.5 block', soAbaixoDe[LARGURA.apurado])}>
            <ApuradoCell t={z} compact />
          </span>
        </span>
      ),
    },
    {
      key: 'secoes',
      header: 'Seções',
      align: 'right',
      hideBelowWidth: LARGURA.secundaria,
      width: 'w-[6rem]',
      sortValue: (z) => z.secoes,
      cell: (z) => (
        <span className="whitespace-nowrap text-fg-muted">
          <span className="text-fg">{fmtInt(z.secoesTotalizadas)}</span>/{fmtInt(z.secoes)}
        </span>
      ),
    },
    { key: 'apurado', header: 'Apurado', align: 'right', hideBelowWidth: LARGURA.apurado, width: W.apurado, sortValue: (z) => pctTotalizadas(z), cell: (z) => <ApuradoCell t={z} /> },
    { key: 'a', header: <CandHeader c={ca} />, headerLabel: ca.nomeUrna, align: 'right', width: W.pct, sortValue: (z) => pctValidos(z, 0), cell: (z) => <PctCell t={z} i={0} race={race} /> },
    { key: 'b', header: <CandHeader c={cb} />, headerLabel: cb.nomeUrna, align: 'right', width: W.pct, sortValue: (z) => pctValidos(z, 1), cell: (z) => <PctCell t={z} i={1} race={race} /> },
    { key: 'margem', header: 'Margem', align: 'right', width: W.margem, sortValue: margemAssinada, cell: (z) => <MargemCell t={z} race={race} /> },
  ];
  return (
    <DataTable
      rows={zonas}
      columns={columns}
      rowKey={(z) => z.zona}
      onRowClick={onSelect ? (z) => onSelect(z.zona) : undefined}
      rowLabel={(z) => `Abrir zona ${z.zona}`}
      rowClassName={(z) => cn(selected === z.zona && 'bg-brand/[0.08]')}
      initialSort={{ key: 'zona', dir: 'asc' }}
      caption={`Resultado por zona eleitoral · ${race.titulo}`}
      className={className}
    />
  );
}

export interface SecaoTableProps {
  race: Race;
  secoes: SecaoResumo[];
  onSelect?: (secao: number) => void;
  selected?: number;
  /** Linhas por página. Padrão 30. */
  pageSize?: number;
  /** Filtros (status + busca por número). Padrão true. */
  filtros?: boolean;
  className?: string;
}

type Filtro = 'todas' | 'totalizadas' | 'aguardando';

export function SecaoTable({ race, secoes, onSelect, selected, pageSize = 30, filtros = true, className }: SecaoTableProps) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [q, setQ] = useState('');
  const rows = useMemo(
    () =>
      secoes.filter(
        (s) =>
          (filtro === 'todas' || (filtro === 'totalizadas' ? s.totalizada : !s.totalizada)) &&
          (!q.trim() || String(s.secao).startsWith(q.trim().replace(/^0+/, ''))),
      ),
    [secoes, filtro, q],
  );
  const nTot = secoes.filter((s) => s.totalizada).length;
  const [ca, cb] = race.candidatos;
  const columns: Column<SecaoResumo>[] = [
    {
      key: 'secao',
      header: 'Seção',
      sortValue: (s) => s.secao,
      firstDir: 'asc',
      width: 'w-[4.25rem]',
      cell: (s) => <span className="inline-flex items-center font-mono text-[13px] font-semibold">{String(s.secao).padStart(4, '0')}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      grow: true,
      sortValue: (s) => s.totalizadaEm ?? Number.MAX_SAFE_INTEGER,
      firstDir: 'asc',
      cell: (s) =>
        s.totalizada ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-fg">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
            <span className="num">{s.totalizadaEm ? fmtHora(s.totalizadaEm) : 'Totalizada'}</span>
            <span className="sr-only">totalizada</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-fg-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-fg-subtle" />
            Aguardando
          </span>
        ),
    },
    { key: 'aptos', header: 'Aptos', align: 'right', hideBelowWidth: 520, width: 'w-[4.5rem]', sortValue: (s) => s.aptos, cell: (s) => fmtInt(s.aptos) },
    {
      key: 'comp',
      header: 'Votaram',
      align: 'right',
      hideBelowWidth: 640,
      width: 'w-[5.75rem]',
      sortValue: (s) => s.comparecimento,
      cell: (s) => (s.totalizada ? fmtInt(s.comparecimento) : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'va',
      header: <CandHeader c={ca} />,
      headerLabel: ca.nomeUrna,
      align: 'right',
      width: 'w-[3.75rem]',
      sortValue: (s) => s.votos[0] ?? 0,
      cell: (s) => (s.totalizada ? <VotosCell s={s} i={0} race={race} /> : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'vb',
      header: <CandHeader c={cb} />,
      headerLabel: cb.nomeUrna,
      align: 'right',
      width: 'w-[3.75rem]',
      sortValue: (s) => s.votos[1] ?? 0,
      cell: (s) => (s.totalizada ? <VotosCell s={s} i={1} race={race} /> : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'venc',
      header: 'Venc.',
      headerLabel: 'Vencedor',
      align: 'center',
      hideBelowWidth: 420,
      width: 'w-[4.25rem]',
      sortValue: (s) => (s.totalizada ? margemAssinada(s) : -999),
      cell: (s) => {
        const m = margem(s);
        if (!s.totalizada || m.lider === null) return <span className="text-fg-subtle">—</span>;
        const c = race.candidatos[m.lider];
        return (
          <span className="inline-flex justify-center" title={c.nomeUrna}>
            <CandidateAvatar candidato={c} size="xs" />
            <span className="sr-only">{c.nomeUrna}</span>
          </span>
        );
      },
    },
  ];
  return (
    <div className={className}>
      {filtros ? (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Segmented<Filtro>
            ariaLabel="Filtrar seções"
            size="sm"
            value={filtro}
            onChange={setFiltro}
            options={[
              { value: 'todas', label: `Todas · ${fmtInt(secoes.length)}` },
              { value: 'totalizadas', label: `Totalizadas · ${fmtInt(nTot)}` },
              { value: 'aguardando', label: `Aguardando · ${fmtInt(secoes.length - nTot)}` },
            ]}
          />
          <SearchBox value={q} onChange={setQ} placeholder="Nº da seção" size="sm" inputMode="numeric" className="sm:max-w-[180px]" />
        </div>
      ) : null}
      <DataTable
        key={`${filtro}-${q}`}
        rows={rows}
        columns={columns}
        rowKey={(s) => s.secao}
        onRowClick={onSelect ? (s) => onSelect(s.secao) : undefined}
        rowLabel={(s) => `Abrir boletim da seção ${s.secao}`}
        rowClassName={(s) => cn(selected === s.secao && 'bg-brand/[0.08]', !s.totalizada && 'text-fg-muted')}
        initialSort={{ key: 'secao', dir: 'asc' }}
        pageSize={pageSize}
        itemLabel="seções"
        density="compact"
        caption={`Seções da zona · ${race.titulo}`}
        empty="Nenhuma seção neste filtro"
      />
    </div>
  );
}

function VotosCell({ s, i, race }: { s: SecaoResumo; i: number; race: Race }) {
  const m = margem(s);
  const lider = m.lider === i;
  return <span className={cn('num', lider ? cn('font-semibold', corSlot(slotDe(race, i)).text) : 'text-fg')}>{fmtInt(s.votos[i] ?? 0)}</span>;
}
