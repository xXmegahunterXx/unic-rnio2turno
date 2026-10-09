/**
 * Exterior (ZZ): não há mapa. Tabela de cidades (com o país) e visão agregada por país.
 * O país vem do dataset (`data/uf/zz.json`, campo `pais`), lido uma vez e guardado em cache.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MunicipioResumo, Race, Tally } from '@/shared/types';
import type { UfDataset } from '@/shared/dataset';
import { pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtCompact, fmtInt } from '@/shared/format';
import { assetUrl } from '@/app/lib/assets';
import { DataTable, type Column } from '@/app/ui/DataTable';
import { SearchBox } from '@/app/ui/SearchBox';
import { Segmented } from '@/app/ui/Segmented';
import { casa } from '@/app/ui/textMatch';
import { ApuradoCell, CandHeader, MargemCell, PctCell, W, margemAssinada } from '@/app/components/apuracao/cells';

/** cod TSE da cidade → país. */
export function usePaisesExterior(ativo = true) {
  return useQuery({
    queryKey: ['dataset', 'zz', 'paises'],
    enabled: ativo,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const r = await fetch(assetUrl('data/uf/zz.json'));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as UfDataset;
      const out: Record<string, string> = {};
      for (const m of d.municipios) if (m.pais) out[m.cod] = m.pais;
      return out;
    },
  });
}

interface PaisLinha extends Tally {
  pais: string;
  cidades: number;
}

function somaPorPais(municipios: MunicipioResumo[], paises: Record<string, string>): PaisLinha[] {
  const mapa = new Map<string, PaisLinha>();
  for (const m of municipios) {
    const pais = paises[m.cod] ?? 'País não informado';
    let p = mapa.get(pais);
    if (!p) {
      p = {
        pais,
        cidades: 0,
        secoes: 0,
        secoesTotalizadas: 0,
        eleitorado: 0,
        eleitoradoTotalizado: 0,
        comparecimento: 0,
        abstencao: 0,
        votos: m.votos.map(() => 0),
        brancos: 0,
        nulos: 0,
      };
      mapa.set(pais, p);
    }
    p.cidades++;
    p.secoes += m.secoes;
    p.secoesTotalizadas += m.secoesTotalizadas;
    p.eleitorado += m.eleitorado;
    p.eleitoradoTotalizado += m.eleitoradoTotalizado;
    p.comparecimento += m.comparecimento;
    p.abstencao += m.abstencao;
    p.brancos += m.brancos;
    p.nulos += m.nulos;
    m.votos.forEach((v, i) => (p!.votos[i] += v));
  }
  return [...mapa.values()];
}

export interface ExteriorTabelaProps {
  race: Race;
  municipios: MunicipioResumo[];
  paises: Record<string, string> | undefined;
  onSelect: (m: MunicipioResumo) => void;
}

export function ExteriorTabela({ race, municipios, paises, onSelect }: ExteriorTabelaProps) {
  const [visao, setVisao] = useState<'cidades' | 'paises'>('cidades');
  const [q, setQ] = useState('');
  const [ca, cb] = race.candidatos;
  const pp = useMemo(() => paises ?? {}, [paises]);
  const linhasPais = useMemo(() => somaPorPais(municipios, pp), [municipios, pp]);
  const cidades = useMemo(
    () => (q ? municipios.filter((m) => casa(m.nome, q) || casa(pp[m.cod] ?? '', q)) : municipios),
    [municipios, q, pp],
  );
  const paisesFiltrados = useMemo(() => (q ? linhasPais.filter((p) => casa(p.pais, q)) : linhasPais), [linhasPais, q]);

  const colsCidade: Column<MunicipioResumo>[] = [
    {
      key: 'nome',
      header: 'Cidade',
      grow: true,
      sortValue: (m) => m.nome,
      cell: (m) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium" title={m.nome}>
            {m.nome}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-fg-muted">{pp[m.cod] ?? ' '}</span>
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
    { key: 'apurado', header: 'Apurado', align: 'right', hideBelow: 'sm', width: W.apuradoSemBarra, sortValue: (m) => pctTotalizadas(m), cell: (m) => <ApuradoCell t={m} bar={false} /> },
    { key: 'a', header: <CandHeader c={ca} />, headerLabel: ca.nomeUrna, align: 'right', width: W.pct, sortValue: (m) => pctValidos(m, 0), cell: (m) => <PctCell t={m} i={0} race={race} /> },
    { key: 'b', header: <CandHeader c={cb} />, headerLabel: cb.nomeUrna, align: 'right', width: W.pct, sortValue: (m) => pctValidos(m, 1), cell: (m) => <PctCell t={m} i={1} race={race} /> },
    { key: 'margem', header: 'Margem', align: 'right', width: W.margem, sortValue: margemAssinada, cell: (m) => <MargemCell t={m} race={race} /> },
  ];
  const colsPais: Column<PaisLinha>[] = [
    {
      key: 'pais',
      header: 'País',
      grow: true,
      sortValue: (p) => p.pais,
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{p.pais}</span>
          <span className="num mt-0.5 block text-[12px] text-fg-muted">
            {p.cidades} {p.cidades === 1 ? 'cidade' : 'cidades'}
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
      sortValue: (p) => p.eleitorado,
      cell: (p) => <span title={fmtInt(p.eleitorado)}>{fmtCompact(p.eleitorado)}</span>,
    },
    { key: 'apurado', header: 'Apurado', align: 'right', hideBelow: 'sm', width: W.apuradoSemBarra, sortValue: (p) => pctTotalizadas(p), cell: (p) => <ApuradoCell t={p} bar={false} /> },
    { key: 'a', header: <CandHeader c={ca} />, headerLabel: ca.nomeUrna, align: 'right', width: W.pct, sortValue: (p) => pctValidos(p, 0), cell: (p) => <PctCell t={p} i={0} race={race} /> },
    { key: 'b', header: <CandHeader c={cb} />, headerLabel: cb.nomeUrna, align: 'right', width: W.pct, sortValue: (p) => pctValidos(p, 1), cell: (p) => <PctCell t={p} i={1} race={race} /> },
    { key: 'margem', header: 'Margem', align: 'right', width: W.margem, sortValue: margemAssinada, cell: (p) => <MargemCell t={p} race={race} /> },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<'cidades' | 'paises'>
          ariaLabel="Agrupar por"
          size="sm"
          value={visao}
          onChange={setVisao}
          options={[
            { value: 'cidades', label: `Cidades · ${fmtInt(municipios.length)}` },
            { value: 'paises', label: `Países · ${fmtInt(linhasPais.length)}` },
          ]}
        />
        <SearchBox
          value={q}
          onChange={setQ}
          size="sm"
          placeholder={visao === 'cidades' ? 'Buscar cidade ou país' : 'Buscar país'}
          className="sm:max-w-[260px]"
        />
      </div>
      {visao === 'cidades' ? (
        <DataTable
          key={`c-${q}`}
          rows={cidades}
          columns={colsCidade}
          rowKey={(m) => m.cod}
          onRowClick={onSelect}
          rowLabel={(m) => `Abrir ${m.nome}`}
          initialSort={{ key: 'eleitorado', dir: 'desc' }}
          pageSize={20}
          itemLabel="cidades"
          caption={`Resultado por cidade no exterior · ${race.titulo}`}
          empty={q ? `Nenhuma cidade encontrada para “${q}”` : 'Sem cidades'}
        />
      ) : (
        <DataTable
          key={`p-${q}`}
          rows={paisesFiltrados}
          columns={colsPais}
          rowKey={(p) => p.pais}
          onRowClick={(p) => {
            setQ(p.pais);
            setVisao('cidades');
          }}
          rowLabel={(p) => `Ver as cidades de ${p.pais}`}
          initialSort={{ key: 'eleitorado', dir: 'desc' }}
          pageSize={20}
          itemLabel="países"
          caption={`Resultado por país · ${race.titulo}`}
          empty={q ? `Nenhum país encontrado para “${q}”` : 'Sem países'}
        />
      )}
    </div>
  );
}
