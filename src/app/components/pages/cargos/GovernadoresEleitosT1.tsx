/**
 * Governadores do 1º turno (resultado oficial, 4/10/2026) — componente para a página /governadores.
 *
 *  - cartograma: as 20 UFs que elegeram governador no 1º turno, na cor NEUTRA do partido do eleito, e as 7 que
 *    decidem no 2º turno em destaque ("2T");
 *  - legenda por partido (maior primeiro) e cartões dos 20 eleitos (foto oficial, nome → ficha, partido, % e votos);
 *  - as 7 disputas do 2º turno com os dois finalistas e o % de cada um no 1º turno (dado oficial).
 *
 * Neutralidade/anonimização: na simulação com nomes ocultos (`status.anonimizado`), por padrão os finalistas do
 * 2º turno aparecem só como "2º turno" (sem nome/foto), para não destoar do placar anônimo da mesma página.
 * `mostrarFinalistas` força o comportamento. Os 20 eleitos são dado real e sempre aparecem.
 *
 * Uso: <GovernadoresEleitosT1 onSelectUf2t={(uf) => navigate(`/apuracao/${uf.toLowerCase()}?race=gov-${uf.toLowerCase()}`)} />
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CargoUfResultado } from '@/shared/dataset';
import type { UFBr } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt, fmtPct } from '@/shared/format';
import { useCargo } from '@/app/data/estatico';
import { useAnonimizado } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { MapaUfs, type CelulaUf } from './MapaUfs';
import { corPartido, porTamanho } from './partidos';
import { useIndiceCandidatos } from './dados';
import { FotoOficial } from './FotoOficial';
import { FonteTse, NomeLink, PartidoChip } from './ui';

export interface GovernadoresEleitosT1Props {
  /** Clique numa UF com 2º turno (ex.: abrir a apuração do governador). Sem isso, rola até o cartão. */
  onSelectUf2t?: (uf: UFBr) => void;
  /** Mostra nome/foto dos finalistas do 2º turno (padrão: só fora da simulação anonimizada). */
  mostrarFinalistas?: boolean;
  /** Título interno (padrão "Eleitos no 1º turno"); `null` omite o cabeçalho. */
  titulo?: string | null;
  /**
   * Lista "Decidem no 2º turno" (padrão sim). Na /governadores as 7 disputas já aparecem acima, então a página
   * passa `false` (o cartograma continua marcando as 7 UFs e levando à apuração).
   */
  mostrarSegundoTurno?: boolean;
  className?: string;
}

export function GovernadoresEleitosT1({
  onSelectUf2t,
  mostrarFinalistas,
  titulo = 'Eleitos no 1º turno',
  mostrarSegundoTurno = true,
  className,
}: GovernadoresEleitosT1Props) {
  const q = useCargo('governador-t1');
  const indice = useIndiceCandidatos();
  const anonimizado = useAnonimizado();
  const verFinalistas = mostrarFinalistas ?? !anonimizado;
  const [sel, setSel] = useState<UFBr | null>(null);

  const { eleitos, segundo, legenda } = useMemo(() => {
    const ufs = (q.data?.ufs ?? []) as CargoUfResultado[];
    const eleitos = ufs
      .map((u) => ({ uf: u.uf as UFBr, c: u.candidatos.find((c) => c.situacao === 'eleito') }))
      .filter((x): x is { uf: UFBr; c: CargoUfResultado['candidatos'][number] } => !!x.c)
      .sort((a, b) => UF_NOMES[a.uf].localeCompare(UF_NOMES[b.uf], 'pt-BR'));
    const segundo = ufs
      .map((u) => ({
        uf: u.uf as UFBr,
        fin: u.candidatos.filter((c) => c.situacao === 'segundo-turno').sort((a, b) => a.numero - b.numero),
      }))
      .filter((x) => x.fin.length > 0)
      .sort((a, b) => UF_NOMES[a.uf].localeCompare(UF_NOMES[b.uf], 'pt-BR'));
    const cont = new Map<string, number>();
    for (const e of eleitos) cont.set(e.c.partido, (cont.get(e.c.partido) ?? 0) + 1);
    const legenda = porTamanho(
      [...cont.entries()].map(([sigla, n]) => ({ sigla, n })),
      (x) => x.n,
    );
    return { eleitos, segundo, legenda };
  }, [q.data]);

  const celulas = useMemo(() => {
    const out: Partial<Record<UFBr, CelulaUf>> = {};
    for (const { uf, c } of eleitos) {
      out[uf] = {
        faixas: [corPartido(c.partido)],
        rotulo: `${UF_NOMES[uf]}: ${c.nomeUrna} (${c.partido}), eleito no 1º turno com ${fmtPct(c.pct, 1)}`,
        dica: (
          <span className="block min-w-[150px]">
            <span className="block text-[12px] font-semibold text-fg">{UF_NOMES[uf]}</span>
            <span className="mt-1 flex items-center gap-1.5 text-[12px] text-fg-muted">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: corPartido(c.partido) }} />
              <span className="font-medium text-fg">{c.nomeUrna}</span> {c.partido} · <span className="num">{fmtPct(c.pct, 1)}</span>
            </span>
          </span>
        ),
      };
    }
    for (const { uf, fin } of segundo) {
      out[uf] = {
        faixas: [],
        especial: (
          <span className="flex h-full w-full items-end justify-center bg-brand/10 pb-[9%] ring-2 ring-inset ring-brand/50">
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-brand-fg min-[400px]:text-[10px]">2º turno</span>
          </span>
        ),
        rotulo: `${UF_NOMES[uf]}: 2º turno em 25 de outubro${verFinalistas ? ` entre ${fin.map((c) => c.nomeUrna).join(' e ')}` : ''}`,
        dica: (
          <span className="block min-w-[150px]">
            <span className="block text-[12px] font-semibold text-fg">{UF_NOMES[uf]} · 2º turno em 25/10</span>
            {verFinalistas
              ? fin.map((c) => (
                  <span key={c.sqcand} className="mt-1 block text-[12px] text-fg-muted">
                    <span className="font-medium text-fg">{c.nomeUrna}</span> {c.partido} · <span className="num">{fmtPct(c.pct, 1)}</span> no 1º turno
                  </span>
                ))
              : null}
          </span>
        ),
      };
    }
    return out;
  }, [eleitos, segundo, verFinalistas]);

  if (q.isError) return <ErrorState compact onRetry={() => q.refetch()} className={className} />;
  if (!q.data) return <LoadingState variant="lista" rows={6} className={className} />;

  function selecionar(uf: UFBr) {
    if (segundo.some((s) => s.uf === uf) && onSelectUf2t) {
      onSelectUf2t(uf);
      return;
    }
    setSel(uf);
    const el = document.getElementById(`gov-t1-${uf}`);
    if (el) {
      const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'center' });
    }
  }

  return (
    <div className={className}>
      {titulo !== null ? (
        <div className="mb-4">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
            <Icon name="selo" size={14} /> 1º turno · resultado oficial
          </p>
          <h2 className="mt-1 font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">{titulo}</h2>
          <p className="mt-1 text-[14px] text-fg-muted">
            <span className="num">{eleitos.length}</span> estados elegeram o governador em 4 de outubro;{' '}
            <span className="num">{segundo.length}</span> decidem no 2º turno, em 25 de outubro.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <section
          className="min-w-0 self-start rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6 lg:sticky lg:top-[calc(var(--app-header-h,64px)+16px)] lg:col-span-5"
          aria-label="Mapa dos governadores do 1º turno"
        >
          <MapaUfs celulas={celulas} selecionada={sel} onSelect={selecionar} ariaLabel="Governador eleito ou 2º turno, por estado" />
          <ul className="mt-5 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-line pt-4" aria-label="Legenda: partidos dos governadores eleitos">
            {legenda.map((l) => (
              <li key={l.sigla} className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: corPartido(l.sigla) }} />
                <span className="font-medium text-fg">{l.sigla}</span>
                <span className="num">{l.n}</span>
              </li>
            ))}
            <li className="flex items-center gap-1.5 text-[12px] text-fg-muted">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-brand/15 ring-1 ring-inset ring-brand/60" />
              <span className="font-medium text-fg">2º turno</span>
              <span className="num">{segundo.length}</span>
            </li>
          </ul>
        </section>

        <div className="min-w-0 lg:col-span-7">
          <ul className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2">
            {eleitos.map(({ uf, c }) => (
              <li
                key={uf}
                id={`gov-t1-${uf}`}
                className={cn(
                  'flex min-w-0 scroll-mt-28 items-center gap-3 rounded-2xl border bg-surface p-3 shadow-card transition-colors',
                  sel === uf ? 'border-brand/50 ring-2 ring-brand/30' : 'border-line',
                )}
              >
                <FotoOficial sqcand={c.sqcand} fotoGrupo="governadores" nome={c.nomeUrna} tamanho="xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                    {UF_NOMES[uf]} <span className="font-mono text-fg-subtle">{uf}</span>
                  </p>
                  <NomeLink
                    sqcand={c.sqcand}
                    nome={c.nomeUrna}
                    comFicha={indice.porSq.has(c.sqcand)}
                    className="mt-0.5 block text-[15px] font-semibold leading-tight text-fg"
                  />
                  <PartidoChip sigla={c.partido} numero={c.numero} className="mt-1" />
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="num font-display text-[16px] font-semibold leading-none text-fg">{fmtPct(c.pct)}</span>
                    <span className="num text-[11.5px] text-fg-muted">{fmtInt(c.votos)} votos</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {mostrarSegundoTurno ? (
        <section className="mt-5" aria-labelledby="gov-t1-2t">
          <h3 id="gov-t1-2t" className="mb-3 font-display text-[18px] font-semibold tracking-[-0.01em] text-fg">
            Decidem no 2º turno
          </h3>
          <ul className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2 lg:grid-cols-4">
            {segundo.map(({ uf, fin }) => {
              const conteudo = (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-fg">
                      {UF_NOMES[uf]} <span className="font-mono text-[11.5px] text-fg-subtle">{uf}</span>
                    </span>
                    <Icon name="chevron-direita" size={15} className="text-fg-subtle" />
                  </span>
                  {verFinalistas ? (
                    <span className="mt-2 block space-y-1">
                      {fin.map((c) => (
                        <span key={c.sqcand} className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span className="min-w-0 truncate text-fg">
                            {c.nomeUrna} <span className="text-fg-muted">· {c.partido}</span>
                          </span>
                          <span className="num shrink-0 text-fg-muted">{fmtPct(c.pct, 1)}</span>
                        </span>
                      ))}
                      <span className="block pt-0.5 text-[11px] text-fg-subtle">% dos válidos no 1º turno</span>
                    </span>
                  ) : (
                    <span className="mt-1 block text-[12.5px] text-fg-muted">2º turno em 25 de outubro</span>
                  )}
                </>
              );
              const cls =
                'block h-full rounded-2xl border border-brand/30 bg-surface p-3.5 shadow-card transition-colors hover:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
              return (
                <li key={uf} id={`gov-t1-${uf}`} className="scroll-mt-28">
                  {onSelectUf2t ? (
                    <button type="button" onClick={() => onSelectUf2t(uf)} className={cn(cls, 'w-full text-left')}>
                      {conteudo}
                    </button>
                  ) : (
                    <Link to={`/apuracao/${uf.toLowerCase()}?race=gov-${uf.toLowerCase()}`} className={cls}>
                      {conteudo}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <FonteTse className="mt-4" />
    </div>
  );
}
