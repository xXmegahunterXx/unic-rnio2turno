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
  /** Esconde a coluna abaixo deste breakpoint DA JANELA. Prefira `hideBelowWidth`. */
  hideBelow?: 'sm' | 'md' | 'lg';
  /**
   * Esconde a coluna quando a própria TABELA tem menos que esta largura (container query). Funciona
   * igual no celular e em cartões lado a lado no desktop — use este em vez de `hideBelow`.
   */
  hideBelowWidth?: TableWidth;
  /**
   * Coluna elástica: ocupa a largura que sobra e trunca o conteúdo. Quando alguma coluna tem `grow`,
   * a tabela usa `table-layout: fixed` (nunca estoura a largura no celular) e as demais colunas
   * precisam de `width` (padrão `w-20`).
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

/** Larguras de referência da tabela (px) para colunas responsivas ao contêiner. */
export type TableWidth = 420 | 520 | 640 | 760;
// Classes por extenso (o Tailwind só gera o que aparece literalmente no código).
const esconderLargura: Record<TableWidth, string> = {
  420: 'hidden [@container(min-width:420px)]:table-cell',
  520: 'hidden [@container(min-width:520px)]:table-cell',
  640: 'hidden [@container(min-width:640px)]:table-cell',
  760: 'hidden [@container(min-width:760px)]:table-cell',
};
/**
 * Para conteúdo que substitui uma coluna escondida (ex.: % apurado sob o nome): visível só enquanto
 * a tabela for mais estreita que a largura dada. Use dentro de uma célula da DataTable.
 */
export const soAbaixoDe: Record<TableWidth, string> = {
  420: '[@container(min-width:420px)]:hidden',
  520: '[@container(min-width:520px)]:hidden',
  640: '[@container(min-width:640px)]:hidden',
  760: '[@container(min-width:760px)]:hidden',
};
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

  // 'auto' responde à largura da TABELA (container query), não da janela.
  const padX =
    density === 'compact' ? 'px-2' : density === 'comfortable' ? 'px-3' : 'px-2 [@container(min-width:560px)]:px-3';
  const padY =
    density === 'compact' ? 'py-2' : density === 'comfortable' ? 'py-3' : 'py-2.5 [@container(min-width:560px)]:py-3';
  const txt =
    density === 'compact'
      ? 'text-[13px]'
      : density === 'comfortable'
        ? 'text-sm'
        : 'text-[13px] [@container(min-width:560px)]:text-sm';

  function onKey(e: KeyboardEvent<HTMLTableRowElement>, r: R) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(r);
    }
  }

  const rolagemInterna = maxHeight !== undefined;
  const fixo = columns.some((c) => c.grow);
  const largura = (c: Column<R>) => (c.grow ? undefined : (c.width ?? (fixo ? 'w-20' : undefined)));
  return (
    // Contêiner de consulta (container queries): colunas e células se adaptam à largura da TABELA.
    <div className={cn('w-full [container-type:inline-size]', className)}>
      <div
        // `relative` na rolagem interna: elementos absolutos das células (ex.: textos sr-only) ficam contidos no
        // rolador; sem isso escapam para o ancestral posicionado e esticam a página além do rodapé.
        className={cn('w-full overflow-x-clip', rolagemInterna && 'relative overflow-y-auto overscroll-contain')}
        style={rolagemInterna ? { maxHeight } : undefined}
      >
        <table className={cn('w-full border-separate border-spacing-0', fixo && 'table-fixed', txt)}>
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
                      'z-10 border-b border-line bg-surface align-middle font-medium text-fg-muted',
                      stickyHeader && 'sticky',
                      padX,
                      'py-2 text-[11px] uppercase tracking-[0.06em] [@container(min-width:560px)]:py-2.5',
                      alinhar[c.align ?? 'left'],
                      largura(c),
                      c.grow ? 'overflow-hidden' : 'whitespace-nowrap',
                      c.hideBelow && esconder[c.hideBelow],
                      c.hideBelowWidth && esconderLargura[c.hideBelowWidth],
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
                          'group relative inline-flex h-[22px] max-w-full items-center rounded-md align-middle uppercase leading-none tracking-[inherit] transition-colors hover:text-fg',
                          ativo && 'text-fg',
                        )}
                      >
                        <span className="truncate">{c.header}</span>
                        {/* O ícone fica no respiro da célula (absoluto): nunca rouba largura do rótulo. */}
                        <Icon
                          name={ativo ? (sort!.dir === 'asc' ? 'chevron-cima' : 'chevron') : 'ordenar'}
                          size={ativo ? 13 : 12}
                          strokeWidth={ativo ? 2.25 : 1.75}
                          className={cn(
                            'pointer-events-none absolute top-1/2 -translate-y-1/2',
                            c.align === 'right' ? 'right-full mr-0.5' : 'left-full ml-0.5',
                            !ativo && 'opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70',
                          )}
                        />
                      </button>
                    ) : (
                      <span className="inline-flex h-[22px] max-w-full items-center align-middle leading-none">{c.header}</span>
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
                        padX,
                        padY,
                        alinhar[c.align ?? 'left'],
                        c.align === 'right' && 'num',
                        c.grow ? 'overflow-hidden' : 'whitespace-nowrap',
                        c.hideBelow && esconder[c.hideBelow],
                        c.hideBelowWidth && esconderLargura[c.hideBelowWidth],
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
