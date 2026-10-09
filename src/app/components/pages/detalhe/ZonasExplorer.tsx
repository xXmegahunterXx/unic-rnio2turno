/**
 * Zonas e seções de um município (mestre-detalhe):
 *  - à esquerda (desktop) / em cima (celular), a lista de zonas ordenável (nº, % apurado, % de cada
 *    candidato, margem). Com rolagem interna no desktop, "ver mais" no celular;
 *  - ao escolher uma zona (`?zona=`), o resumo da zona e a tabela das seções (useZona) com filtros
 *    (todas/totalizadas/aguardando, busca por nº); clique numa seção abre o Boletim de Urna.
 *
 * Variação local de `ZonaTable` (src/app/components/apuracao/SecaoTable.tsx): precisa de `maxHeight` e
 * `pageSize`, que aquele componente não repassa à DataTable (anotado para o kit).
 */
import { useEffect, useRef } from 'react';
import type { Race, UF, ZonaResumo } from '@/shared/types';
import { pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtInt } from '@/shared/format';
import { useZona } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { DataTable, soAbaixoDe, type Column } from '@/app/ui/DataTable';
import { Button } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { Select } from '@/app/ui/Select';
import { ApuradoCell, CandHeader, LARGURA, MargemCell, PctCell, W, margemAssinada } from '@/app/components/apuracao/cells';
import { SecaoTable } from '@/app/components/apuracao/SecaoTable';
import { ApuracaoProgress } from '@/app/components/apuracao/ApuracaoProgress';
import { ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { ehNaoEncontrado } from './useDetalhe';
import { MiniPlacar } from './MiniPlacar';

export interface ZonasExplorerProps {
  race: Race;
  uf: UF;
  cod: string;
  nomeMunicipio: string;
  zonas: ZonaResumo[];
  zona: number | null;
  onZona: (z: number | null) => void;
  onSecao: (zona: number, secao: number) => void;
}

const fmtZona = (z: number) => String(z).padStart(4, '0');

export function ZonasExplorer({ race, uf, cod, nomeMunicipio, zonas, zona, onZona, onSecao }: ZonasExplorerProps) {
  const lg = useMediaQuery('(min-width: 1024px)');
  const detalheRef = useRef<HTMLDivElement>(null);
  const zonaValida = zona !== null && zonas.some((z) => z.zona === zona) ? zona : null;
  const unica = zonas.length === 1;

  // Município com uma zona só: já abre a lista de seções.
  useEffect(() => {
    if (unica && zonaValida === null) onZona(zonas[0].zona);
  }, [unica, zonaValida, zonas, onZona]);

  function escolher(z: number) {
    onZona(z === zonaValida && !unica ? null : z);
    if (!lg && z !== zonaValida) {
      window.setTimeout(() => detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }

  const [ca, cb] = race.candidatos;
  const colunas: Column<ZonaResumo>[] = [
    {
      key: 'zona',
      header: 'Zona',
      grow: true,
      sortValue: (z) => z.zona,
      firstDir: 'asc',
      cell: (z) => (
        <span className="block min-w-0">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="font-mono text-[13px] font-semibold">{fmtZona(z.zona)}</span>
            <span className="num truncate text-[11.5px] text-fg-muted">{fmtInt(z.secoes)} seções</span>
            {z.zona === zonaValida ? <Icon name="check" size={14} className="shrink-0 self-center text-brand-fg" /> : null}
          </span>
          <span className={cn('mt-1 block', soAbaixoDe[LARGURA.apurado])}>
            <ApuradoCell t={z} compact />
          </span>
        </span>
      ),
    },
    {
      key: 'apurado',
      header: 'Apurado',
      align: 'right',
      hideBelowWidth: LARGURA.apurado,
      width: W.apuradoSemBarra,
      sortValue: (z) => pctTotalizadas(z),
      cell: (z) => <ApuradoCell t={z} bar={false} />,
    },
    { key: 'a', header: <CandHeader c={ca} />, headerLabel: ca.nomeUrna, align: 'right', width: W.pct, sortValue: (z) => pctValidos(z, 0), cell: (z) => <PctCell t={z} i={0} race={race} /> },
    { key: 'b', header: <CandHeader c={cb} />, headerLabel: cb.nomeUrna, align: 'right', width: W.pct, sortValue: (z) => pctValidos(z, 1), cell: (z) => <PctCell t={z} i={1} race={race} /> },
    { key: 'margem', header: 'Margem', align: 'right', width: W.margem, sortValue: margemAssinada, cell: (z) => <MargemCell t={z} race={race} /> },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <section
        aria-label="Zonas eleitorais"
        className="min-w-0 rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4 lg:sticky lg:top-[calc(var(--app-header-h,64px)+16px)]"
      >
        <header className="mb-2 flex items-baseline justify-between gap-2 px-1">
          <h3 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-fg">
            {unica ? 'Zona eleitoral' : <>{fmtInt(zonas.length)} zonas eleitorais</>}
          </h3>
          <span className="text-[12px] text-fg-muted">{unica ? '' : 'Toque para ver as seções'}</span>
        </header>
        <DataTable
          rows={zonas}
          columns={colunas}
          rowKey={(z) => z.zona}
          onRowClick={(z) => escolher(z.zona)}
          rowLabel={(z) => `Ver as seções da zona ${z.zona}`}
          rowClassName={(z) => cn(z.zona === zonaValida && 'bg-brand/[0.09]')}
          initialSort={{ key: 'zona', dir: 'asc' }}
          maxHeight={lg ? 'calc(100dvh - var(--app-header-h, 64px) - 120px)' : undefined}
          pageSize={lg ? undefined : 8}
          itemLabel="zonas"
          caption={`Resultado por zona eleitoral em ${nomeMunicipio}`}
        />
      </section>

      <div ref={detalheRef} className="min-w-0 scroll-mt-[calc(var(--app-header-h,64px)+12px)]">
        {zonaValida === null ? (
          <SemZona zonas={zonas} onZona={(z) => escolher(z)} />
        ) : (
          <ZonaDetalhe race={race} uf={uf} cod={cod} zona={zonaValida} unica={unica} onFechar={() => onZona(null)} onSecao={onSecao} />
        )}
      </div>
    </div>
  );
}

function SemZona({ zonas, onZona }: { zonas: ZonaResumo[]; onZona: (z: number) => void }) {
  return (
    <section className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-fg-muted">
        <Icon name="lista" size={22} />
      </span>
      <h3 className="mt-4 font-display text-[18px] font-semibold text-fg">Escolha uma zona</h3>
      <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-fg-muted">
        A lista das seções da zona aparece aqui, com o boletim de cada uma.
      </p>
      <Select
        aria-label="Zona eleitoral"
        defaultValue=""
        onChange={(e) => e.target.value && onZona(Number(e.target.value))}
        options={[{ value: '', label: 'Escolher zona…' }, ...zonas.map((z) => ({ value: String(z.zona), label: `Zona ${fmtZona(z.zona)} · ${fmtInt(z.secoes)} seções` }))]}
        wrapperClassName="mt-5 w-full max-w-[260px]"
      />
    </section>
  );
}

function ZonaDetalhe({
  race,
  uf,
  cod,
  zona,
  unica,
  onFechar,
  onSecao,
}: {
  race: Race;
  uf: UF;
  cod: string;
  zona: number;
  unica: boolean;
  onFechar: () => void;
  onSecao: (zona: number, secao: number) => void;
}) {
  const q = useZona(race.id, uf, cod, zona);
  const snap = q.data && q.data.zona === zona && q.data.cod === cod && q.data.race === race.id ? q.data : undefined;
  const erro = q.error ?? q.failureReason;

  return (
    <section aria-label={`Seções da zona ${zona}`} className="min-w-0 rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-5">
      <header className="mb-4 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Seções da zona</p>
          <h3 className="mt-0.5 font-mono text-[22px] font-semibold leading-tight tracking-[0.02em] text-fg">{fmtZona(zona)}</h3>
        </div>
        {!unica ? (
          <Button variant="ghost" size="sm" icon="fechar" onClick={onFechar}>
            Fechar
          </Button>
        ) : null}
      </header>

      {ehNaoEncontrado(erro) && !snap ? (
        <p className="px-1 py-6 text-[14px] text-fg-muted">Esta zona não existe neste município.</p>
      ) : q.isError && !snap ? (
        <ErrorState compact onRetry={() => q.refetch()} />
      ) : !snap ? (
        <LoadingState variant="tabela" rows={6} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-2 sm:gap-5 sm:p-4">
            <MiniPlacar race={race} t={snap.resumo} nome="Resultado na zona" semApurado className="mx-0 py-0" />
            <ApuracaoProgress resumo={snap.resumo} variant="compact" className="self-end" />
          </div>
          <SecaoTable race={race} secoes={snap.secoes} onSelect={(s) => onSecao(zona, s)} pageSize={30} />
          <p className="mt-3 flex items-center gap-1.5 px-1 text-[12px] text-fg-muted">
            <Icon name="urna" size={14} />
            Toque numa seção para ver o boletim de urna.
          </p>
        </>
      )}
    </section>
  );
}

