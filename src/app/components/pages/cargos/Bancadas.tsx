/**
 * Ranking de bancadas (partidos por nº de eleitos, maior primeiro) — também é a legenda e a alternativa em
 * texto do hemiciclo. Passar o mouse/focar numa linha destaca o partido no hemiciclo.
 * `BarraComposicao`: a mesma informação numa barra empilhada fina (para cartões e mapas).
 */
import { useState } from 'react';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { hachuraStyle } from '@/app/components/apuracao/MapHatch';
import { corPartido } from './partidos';

export interface Bancada {
  sigla: string;
  eleitos: number;
  votos?: number;
  nome?: string;
  federacao?: string;
}

export function Bancadas({
  bancadas,
  total,
  pendentes = 0,
  rotuloPendentes = 'Aguardando o TSE',
  destaque,
  onDestaque,
  votosValidos,
  max,
  className,
}: {
  bancadas: Bancada[];
  /** Total de cadeiras (inclui pendentes). */
  total: number;
  pendentes?: number;
  rotuloPendentes?: string;
  destaque?: string | null;
  onDestaque?: (s: string | null) => void;
  /** Total de votos válidos (mostra % dos votos de cada partido). */
  votosValidos?: number;
  /** Corta a lista (o resto vira "demais"). */
  max?: number;
  className?: string;
}) {
  const [todos, setTodos] = useState(false);
  const lista = bancadas.filter((b) => b.eleitos > 0);
  const maior = Math.max(1, ...lista.map((b) => b.eleitos));
  const cortar = !!max && !todos && lista.length > max + 1;
  const visiveis = cortar ? lista.slice(0, max) : lista;
  const resto = cortar ? lista.slice(max) : [];
  return (
    <div className={className}>
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Cadeiras por partido, da maior para a menor bancada</caption>
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            <th scope="col" className="pb-2 pl-1 font-semibold">
              Partido
            </th>
            <th scope="col" className="w-[4.75rem] pb-2 text-right font-semibold">
              Cadeiras
            </th>
            {votosValidos ? (
              <th scope="col" className="hidden w-[6.5rem] pb-2 pr-1 text-right font-semibold min-[440px]:table-cell">
                Votos
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((b) => {
            const ativo = destaque === b.sigla;
            const apagado = !!destaque && !ativo;
            return (
              <tr
                key={b.sigla}
                tabIndex={onDestaque ? 0 : undefined}
                onMouseEnter={() => onDestaque?.(b.sigla)}
                onMouseLeave={() => onDestaque?.(null)}
                onFocus={() => onDestaque?.(b.sigla)}
                onBlur={() => onDestaque?.(null)}
                className={cn(
                  'group border-t border-line transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                  apagado && 'opacity-45',
                )}
              >
                <th scope="row" className="py-1.5 pl-1 pr-2 font-normal">
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: corPartido(b.sigla) }} />
                    <span className="truncate text-[14px] font-semibold text-fg" title={b.nome}>
                      {b.sigla}
                    </span>
                    {b.federacao ? (
                      <span className="hidden truncate text-[11.5px] text-fg-subtle sm:inline" title={`Federação ${b.federacao}`}>
                        Fed. {b.federacao}
                      </span>
                    ) : null}
                  </div>
                  <div className="ml-5 mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full" style={{ width: `${(b.eleitos / maior) * 100}%`, background: corPartido(b.sigla) }} />
                  </div>
                </th>
                <td className="py-1.5 text-right align-top">
                  <span className="num font-display text-[16px] font-semibold leading-none text-fg">{fmtInt(b.eleitos)}</span>
                  <span className="num block pt-0.5 text-[11px] text-fg-muted">{fmtPct((b.eleitos / Math.max(1, total)) * 100, 1)}</span>
                </td>
                {votosValidos ? (
                  <td className="hidden py-1.5 pr-1 text-right align-top min-[440px]:table-cell">
                    <span className="num text-[13px] leading-none text-fg">{b.votos !== undefined ? fmtPct((b.votos / votosValidos) * 100, 1) : '—'}</span>
                    <span className="num block pt-0.5 text-[11px] text-fg-muted">{b.votos !== undefined ? fmtInt(b.votos) : ''}</span>
                  </td>
                ) : null}
              </tr>
            );
          })}
          {resto.length ? (
            <tr className="border-t border-line">
              <th scope="row" className="py-2 pl-1 text-[13px] font-normal text-fg-muted">
                <button
                  type="button"
                  onClick={() => setTodos(true)}
                  className="inline-flex items-center gap-1 rounded-md text-left font-medium text-brand-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Ver os outros {resto.length} partidos
                  <Icon name="chevron" size={14} />
                </button>
                {/* Quebra em linhas (célula de tabela com layout automático não trunca: estourava a largura no celular). */}
                <span className="mt-0.5 block text-pretty text-[11.5px] leading-snug">{resto.map((b) => b.sigla).join(' · ')}</span>
              </th>
              <td className="num py-2 text-right text-[14px] font-semibold text-fg">{fmtInt(resto.reduce((a, b) => a + b.eleitos, 0))}</td>
              {votosValidos ? <td className="hidden min-[440px]:table-cell" /> : null}
            </tr>
          ) : null}
          {pendentes > 0 ? (
            <tr className="border-t border-line">
              <th scope="row" className="py-2 pl-1 pr-2 font-normal">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px] ring-1 ring-inset ring-line" style={hachuraStyle()} />
                  <span className="text-[13.5px] text-fg-muted">{rotuloPendentes}</span>
                </div>
              </th>
              <td className="num py-2 text-right text-[15px] font-semibold text-fg-muted">{fmtInt(pendentes)}</td>
              {votosValidos ? <td className="hidden min-[440px]:table-cell" /> : null}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** Barra empilhada fina com as bancadas (maior primeiro) + pendentes no fim. */
export function BarraComposicao({
  bancadas,
  pendentes = 0,
  className,
}: {
  bancadas: Bancada[];
  pendentes?: number;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={`Composição: ${bancadas
        .filter((b) => b.eleitos > 0)
        .map((b) => `${b.sigla} ${b.eleitos}`)
        .join(', ')}${pendentes ? `, ${pendentes} aguardando` : ''}`}
      className={cn('flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full', className)}
    >
      {bancadas
        .filter((b) => b.eleitos > 0)
        .map((b) => (
          <span key={b.sigla} className="h-full first:rounded-l-full" style={{ flexGrow: b.eleitos, flexBasis: 0, background: corPartido(b.sigla) }} />
        ))}
      {pendentes ? <span className="h-full rounded-r-full" style={{ flexGrow: pendentes, flexBasis: 0, ...hachuraStyle() }} /> : null}
    </div>
  );
}

/** Legenda/ranking compacto em grade (sigla, cadeiras, %), maior primeiro; destaca no hemiciclo ao passar. */
export function BancadasGrade({
  bancadas,
  total,
  pendentes = 0,
  rotuloPendentes = 'Aguardando',
  destaque,
  onDestaque,
  className,
}: {
  bancadas: Bancada[];
  total: number;
  pendentes?: number;
  rotuloPendentes?: string;
  destaque?: string | null;
  onDestaque?: (s: string | null) => void;
  className?: string;
}) {
  const lista = bancadas.filter((b) => b.eleitos > 0);
  return (
    // Colunas pela largura disponível (nunca corta "REPUBLICANOS"); o % some quando o item fica estreito.
    <ul className={cn('grid grid-cols-[repeat(auto-fill,minmax(9.25rem,1fr))] gap-x-3 gap-y-1', className)} aria-label="Cadeiras por partido">
      {lista.map((b) => {
        const apagado = !!destaque && destaque !== b.sigla;
        return (
          <li
            key={b.sigla}
            tabIndex={onDestaque ? 0 : undefined}
            onMouseEnter={() => onDestaque?.(b.sigla)}
            onMouseLeave={() => onDestaque?.(null)}
            onFocus={() => onDestaque?.(b.sigla)}
            onBlur={() => onDestaque?.(null)}
            className={cn(
              'rounded-lg px-1 py-1.5 transition-[opacity,background-color] [container-type:inline-size] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              apagado && 'opacity-40',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: corPartido(b.sigla) }} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg" title={b.sigla}>
                {b.sigla}
              </span>
              <span className="num shrink-0 text-[13.5px] font-semibold text-fg">{fmtInt(b.eleitos)}</span>
              <span className="num hidden w-11 shrink-0 text-right text-[11px] text-fg-muted [@container(min-width:12.5rem)]:inline">
                {fmtPct((b.eleitos / Math.max(1, total)) * 100, 1)}
              </span>
            </span>
          </li>
        );
      })}
      {pendentes > 0 ? (
        <li className="px-1 py-1.5 [container-type:inline-size]">
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-[4px] ring-1 ring-inset ring-line" style={hachuraStyle()} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">{rotuloPendentes}</span>
            <span className="num shrink-0 text-[13.5px] font-semibold text-fg-muted">{fmtInt(pendentes)}</span>
            <span className="hidden w-11 shrink-0 [@container(min-width:12.5rem)]:inline" />
          </span>
        </li>
      ) : null}
    </ul>
  );
}
