/**
 * Tabela de dados: ordenável, cabeçalho fixo (sticky), linhas clicáveis (mouse e teclado),
 * densidade compacta no celular, colunas que somem em telas estreitas e paginação "ver mais".
 */
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/app/lib/cn';
import { fmtInt } from '@/shared/format';
import { Icon } from './Icon';

export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

export interface Column<R> {
  key: string;
  header: ReactNode;
  /** Rótulo acessível do cabeçalho quando `header` não é texto. */
  headerLabel?: string;
  cell: (row: R, index: number) => ReactNode;
  /** Habilita ordenação por esta coluna. */
  sortValue?: (row: R) => number | string;
  /** Primeira direção ao clicar (padrão: 'desc' para números, 'asc' para texto). */
  firstDir?: SortDir;
  align?: 'left' | 'right' | 'center';
  /** Classes de largura (ex.: 'w-20'). */
  width?: string;
  className?: string;
  headerClassName?: string;
  /** Esconde a coluna abaixo deste breakpoint. */
  hideBelow?: 'sm' | 'md' | 'lg';
  /**
   * Coluna elástica: ocupa a sobra e trunca o conteúdo (td com `width:100%; max-width:0`).
   * Use na coluna de nome para a tabela nunca estourar a largura no celular.
   */
  grow?: boolean;
}

export interface DataTableProps<R> {
  rows: R[];
  columns: Column<R>[];
  rowKey: (row: R) => string | number;
  onRowClick?: (row: R) => void;
  /** Texto acessível de cada linha clicável (ex.: "Abrir São Paulo"). */
  rowLabel?: (row: R) => string;
  rowClassName?: (row: R) => string | undefined;
  /** Ordenação inicial (não controlada). */
  initialSort?: SortState;
  /** Ordenação controlada. */
  sort?: SortState | null;
  onSortChange?: (s: SortState) => void;
  /** Cabeçalho fixo ao rolar. Padrão true. */
  stickyHeader?: boolean;
  /**
   * Distância do topo para o cabeçalho fixo (px ou CSS). Padrão: `var(--app-header-h, 64px)`, a altura
   * do header do AppShell (inclui a faixa de simulação quando visível).
   */
  stickyOffset?: number | string;
  /** Altura máxima com rolagem interna (o cabeçalho gruda no topo da caixa). */
  maxHeight?: number | string;
  /** Paginação incremental: mostra N linhas e um botão "Ver mais". */
  pageSize?: number;
  /** Rótulo do item para o botão "Ver mais" (ex.: 'municípios'). */
  itemLabel?: string;
  density?: 'auto' | 'compact' | 'comfortable';
  /** Legenda (visível só para leitores de tela). */
  caption?: string;
  empty?: ReactNode;
  className?: string;
}

const esconder = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
const alinhar = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function DataTable<R>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowLabel,
  rowClassName,
  initialSort,
  sort: sortCtrl,
  onSortChange,
  stickyHeader = true,
  stickyOffset = 'var(--app-header-h, 64px)',
  maxHeight,
  pageSize,
  itemLabel = 'linhas',
  density = 'auto',
  caption,
  empty,
  className,
}: DataTableProps<R>) {
  const [sortLocal, setSortLocal] = useState<SortState | null>(initialSort ?? null);
  const sort = sortCtrl !== undefined ? sortCtrl : sortLocal;
  const [limite, setLimite] = useState(pageSize ?? Infinity);

  const ordenadas = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    const mult = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
      return String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' }) * mult;
    });
  }, [rows, columns, sort]);

  const visiveis = Number.isFinite(limite) ? ordenadas.slice(0, limite) : ordenadas;
  const restantes = ordenadas.length - visiveis.length;

  function clicarCabecalho(c: Column<R>) {
    if (!c.sortValue) return;
    let dir: SortDir;
    if (sort?.key === c.key) dir = sort.dir === 'asc' ? 'desc' : 'asc';
    else {
      const amostra = rows[0] ? c.sortValue(rows[0]) : 0;
      dir = c.firstDir ?? (typeof amostra === 'number' ? 'desc' : 'asc');
    }
    const s = { key: c.key, dir };
    if (sortCtrl === undefined) setSortLocal(s);
    onSortChange?.(s);
  }

  const pad =
    density === 'compact' ? 'px-2 py-2' : density === 'comfortable' ? 'px-3 py-3' : 'px-2 py-2.5 sm:px-3 sm:py-3';
  const txt = density === 'compact' ? 'text-[13px]' : density === 'comfortable' ? 'text-sm' : 'text-[13px] sm:text-sm';

  function onKey(e: KeyboardEvent<HTMLTableRowElement>, r: R) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(r);
    }
  }

  const rolagemInterna = maxHeight !== undefined;
  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn('w-full overflow-x-clip', rolagemInterna && 'overflow-y-auto overscroll-contain')}
        style={rolagemInterna ? { maxHeight } : undefined}
      >
        <table className={cn('w-full border-separate border-spacing-0', txt)}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => {
                const ativo = sort?.key === c.key;
                const ariaSort = ativo ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn(
                      'z-10 border-b border-line bg-surface font-medium text-fg-muted',
                      stickyHeader && 'sticky',
                      pad,
                      'py-2 text-[11px] uppercase tracking-[0.08em] sm:py-2.5',
                      alinhar[c.align ?? 'left'],
                      c.width,
                      c.grow && 'w-full max-w-0',
                      !c.grow && 'whitespace-nowrap',
                      c.hideBelow && esconder[c.hideBelow],
                      c.headerClassName,
                    )}
                    style={stickyHeader ? { top: rolagemInterna ? 0 : stickyOffset } : undefined}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => clicarCabecalho(c)}
                        aria-label={c.headerLabel ? `Ordenar por ${c.headerLabel}` : undefined}
                        className={cn(
                          'group inline-flex items-center gap-1 rounded-md uppercase tracking-[0.08em] transition-colors hover:text-fg',
                          c.align === 'right' && 'flex-row-reverse',
                          ativo && 'text-fg',
                        )}
                      >
                        <span>{c.header}</span>
                        <Icon
                          name={ativo ? (sort!.dir === 'asc' ? 'chevron-cima' : 'chevron') : 'ordenar'}
                          size={ativo ? 14 : 12}
                          strokeWidth={ativo ? 2.25 : 1.75}
                          className={cn(!ativo && 'opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70')}
                        />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-fg-muted">
                  {empty ?? 'Nenhum resultado'}
                </td>
              </tr>
            ) : (
              visiveis.map((r, i) => (
                <tr
                  key={rowKey(r)}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick && rowLabel ? rowLabel(r) : undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => onKey(e, r) : undefined}
                  className={cn(
                    'group/row transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                    rowClassName?.(r),
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'border-b border-line align-middle text-fg',
                        pad,
                        alinhar[c.align ?? 'left'],
                        c.align === 'right' && 'num',
                        c.grow ? 'w-full max-w-0' : 'whitespace-nowrap',
                        c.hideBelow && esconder[c.hideBelow],
                        c.className,
                      )}
                    >
                      {c.cell(r, i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {restantes > 0 && pageSize ? (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => setLimite((l) => l + pageSize)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface-2 px-5 text-sm font-medium text-fg transition-colors hover:bg-surface-3"
          >
            Ver mais {Math.min(pageSize, restantes)} {itemLabel}
            <span className="num text-fg-muted">· faltam {fmtInt(restantes)}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
