/**
 * Visão por estado de um cargo proporcional: mapa do Brasil com a MAIOR bancada de cada UF (cor neutra do partido)
 * e a lista de UFs com nº de cadeiras e barra de composição. Clique → detalhe da UF.
 */
import { useMemo } from 'react';
import type { CargoDataset, CargoUfResultado } from '@/shared/dataset';
import type { UFBr } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { MapaUfs, type CelulaUf } from './MapaUfs';
import { BarraComposicao } from './Bancadas';
import { corPartido, porTamanho } from './partidos';

interface LinhaUf {
  uf: UFBr;
  vagas: number;
  pendentes: number;
  bancadas: { sigla: string; eleitos: number }[];
  aviso?: string;
}

function linhas(data: CargoDataset): LinhaUf[] {
  return (data.ufs as (CargoUfResultado & { aviso?: string })[])
    .map((u) => {
      const bancadas = porTamanho(
        (u.partidos ?? []).filter((p) => p.eleitos > 0).map((p) => ({ sigla: p.sigla, eleitos: p.eleitos })),
        (b) => b.eleitos,
      );
      const eleitos = bancadas.reduce((a, b) => a + b.eleitos, 0);
      return { uf: u.uf as UFBr, vagas: u.vagas, pendentes: Math.max(0, u.vagas - eleitos), bancadas, aviso: u.aviso };
    })
    .sort((a, b) => UF_NOMES[a.uf].localeCompare(UF_NOMES[b.uf], 'pt-BR'));
}

export function UfsComposicao({
  data,
  onSelect,
  rotuloCasa,
}: {
  data: CargoDataset;
  onSelect: (uf: UFBr) => void;
  /** (uf) => "Assembleia Legislativa" etc., para a dica. */
  rotuloCasa?: (uf: UFBr) => string;
}) {
  const ls = useMemo(() => linhas(data), [data]);
  const celulas = useMemo(() => {
    const out: Partial<Record<UFBr, CelulaUf>> = {};
    for (const l of ls) {
      const maior = l.bancadas[0];
      const empate = l.bancadas.filter((b) => maior && b.eleitos === maior.eleitos);
      out[l.uf] = {
        faixas: maior ? empate.slice(0, 2).map((b) => corPartido(b.sigla)) : [],
        marca: maior ? undefined : 'pendente',
        rotulo: `${UF_NOMES[l.uf]}: ${maior ? `maior bancada ${empate.map((b) => b.sigla).join(' e ')} com ${maior.eleitos} de ${l.vagas}` : 'aguardando o TSE'}`,
        dica: (
          <span className="block min-w-[160px]">
            <span className="block text-[12px] font-semibold text-fg">
              {rotuloCasa ? rotuloCasa(l.uf) : UF_NOMES[l.uf]} · <span className="num">{l.vagas}</span> cadeiras
            </span>
            {maior ? (
              l.bancadas.slice(0, 3).map((b) => (
                <span key={b.sigla} className="mt-1 flex items-center gap-1.5 text-[12px] text-fg-muted">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: corPartido(b.sigla) }} />
                  <span className="font-medium text-fg">{b.sigla}</span>
                  <span className="num">{b.eleitos}</span>
                </span>
              ))
            ) : (
              <span className="mt-1 block text-[12px] text-fg-muted">Aguardando o TSE</span>
            )}
          </span>
        ),
      };
    }
    return out;
  }, [ls, rotuloCasa]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
      <section className="min-w-0 self-start rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6 lg:col-span-5">
        <h3 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-fg">Maior bancada em cada estado</h3>
        <p className="mt-1 text-[12.5px] leading-snug text-fg-muted">
          Cor do partido com mais cadeiras (listrado em caso de empate). Toque numa UF para ver a composição.
        </p>
        <MapaUfs celulas={celulas} onSelect={onSelect} ariaLabel="Maior bancada por estado" className="mt-4" />
      </section>
      <section className="min-w-0 rounded-2xl border border-line bg-surface p-2 shadow-card sm:p-3 lg:col-span-7">
        <ul className="grid grid-cols-1 sm:grid-cols-2">
          {ls.map((l) => (
            <li key={l.uf}>
              <button
                type="button"
                onClick={() => onSelect(l.uf)}
                className="group flex w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="w-8 shrink-0 font-mono text-[12.5px] font-semibold text-fg-muted">{l.uf}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium text-fg">{UF_NOMES[l.uf]}</span>
                    <span className="num shrink-0 text-[12px] text-fg-muted">
                      {fmtInt(l.vagas)} {l.vagas === 1 ? 'cadeira' : 'cadeiras'}
                    </span>
                  </span>
                  <BarraComposicao bancadas={l.bancadas} pendentes={l.pendentes} className={cn('mt-1.5 h-2')} />
                  <span className="mt-1 block truncate text-[11.5px] text-fg-subtle">
                    {l.bancadas.length
                      ? l.bancadas
                          .slice(0, 3)
                          .map((b) => `${b.sigla} ${b.eleitos}`)
                          .join(' · ')
                      : 'Aguardando o TSE (reprocessamento)'}
                  </span>
                </span>
                <Icon name="chevron-direita" size={16} className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
