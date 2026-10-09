/**
 * SearchBox: campo de busca com ícone e botão limpar.
 * Combobox: busca acento-insensível com lista navegável por teclado (padrão ARIA combobox).
 */
import { forwardRef, useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/app/lib/cn';
import { Icon } from './Icon';
import { pontuar, realcar } from './textMatch';

export interface SearchBoxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  value: string;
  onChange: (v: string) => void;
  size?: 'sm' | 'md' | 'lg';
  /** Rótulo acessível (padrão: placeholder). */
  ariaLabel?: string;
  /** Conteúdo à direita (ex.: contador de resultados). */
  trailing?: ReactNode;
}

const alturas = { sm: 'h-9 text-[13px] rounded-[10px] pl-9', md: 'h-11 text-[15px] rounded-xl pl-10', lg: 'h-14 text-base rounded-2xl pl-12' };
const iconePos = { sm: 'left-2.5', md: 'left-3', lg: 'left-4' };

export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  { value, onChange, size = 'md', ariaLabel, placeholder = 'Buscar', trailing, className, ...rest },
  ref,
) {
  return (
    <div className={cn('relative w-full', className)}>
      <Icon name="busca" size={size === 'lg' ? 20 : 18} className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-muted', iconePos[size])} />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full border border-line bg-surface-2 pr-10 text-fg placeholder:text-fg-subtle',
          'transition-[border-color,background-color,box-shadow] focus:border-brand/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand/15',
          '[&::-webkit-search-cancel-button]:appearance-none',
          alturas[size],
        )}
        {...rest}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {trailing}
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Limpar busca"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg"
          >
            <Icon name="fechar" size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );
});

export interface ComboOption {
  value: string;
  label: string;
  /** Texto secundário à direita (ex.: UF, nº de seções). */
  hint?: string;
  /** Termos extras que também casam na busca (ex.: sigla, código). */
  keywords?: string;
}

export interface ComboboxProps {
  options: ComboOption[];
  onSelect: (o: ComboOption) => void;
  /** Valor selecionado (mostra o rótulo no campo). */
  value?: string | null;
  label?: ReactNode;
  placeholder?: string;
  ariaLabel?: string;
  /** Máximo de itens exibidos. Padrão 60. */
  maxResults?: number;
  emptyText?: string;
  size?: 'md' | 'lg';
  /** Abre a lista ao focar, mesmo sem texto. Padrão true. */
  openOnFocus?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Busca com sugestões (acento-insensível, ↑/↓/Enter/Esc). */
export function Combobox({
  options,
  onSelect,
  value,
  label,
  placeholder = 'Digite para buscar',
  ariaLabel,
  maxResults = 60,
  emptyText = 'Nada encontrado',
  size = 'md',
  openOnFocus = true,
  disabled,
  className,
}: ComboboxProps) {
  const id = useId();
  const listId = `${id}-lista`;
  const selecionado = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
  const [texto, setTexto] = useState(selecionado?.label ?? '');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [digitou, setDigitou] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setTexto(selecionado?.label ?? '');
    setDigitou(false);
  }, [selecionado]);

  const consulta = digitou ? texto : '';
  const resultados = useMemo(() => {
    if (!consulta.trim()) return options.slice(0, maxResults);
    return options
      .map((o) => ({ o, s: Math.max(pontuar(o.label, consulta), pontuar(`${o.keywords ?? ''} ${o.hint ?? ''}`, consulta) > 0 ? 0.5 : -1) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s || a.o.label.localeCompare(b.o.label, 'pt-BR'))
      .slice(0, maxResults)
      .map((r) => r.o);
  }, [options, consulta, maxResults]);

  useEffect(() => setAtivo(0), [consulta]);
  useEffect(() => {
    if (!aberto) return;
    lista.current?.querySelector<HTMLElement>(`[data-idx="${ativo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [ativo, aberto]);

  function escolher(o: ComboOption) {
    setTexto(o.label);
    setDigitou(false);
    setAberto(false);
    onSelect(o);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!aberto) setAberto(true);
      else setAtivo((a) => Math.min(resultados.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (aberto && resultados[ativo]) {
        e.preventDefault();
        escolher(resultados[ativo]);
      }
    } else if (e.key === 'Escape') {
      if (aberto) {
        e.preventDefault();
        setAberto(false);
      } else if (texto) {
        setTexto('');
        setDigitou(true);
      }
    } else if (e.key === 'Home' && aberto) {
      setAtivo(0);
    } else if (e.key === 'End' && aberto) {
      setAtivo(resultados.length - 1);
    }
  }

  const h = size === 'lg' ? 'h-14 text-base rounded-2xl pl-12' : 'h-11 text-[15px] rounded-xl pl-10';
  return (
    <div className={cn('relative w-full', className)}>
      {label ? (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-fg-muted">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <Icon name="busca" size={size === 'lg' ? 20 : 18} className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-muted', size === 'lg' ? 'left-4' : 'left-3')} />
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={aberto && resultados[ativo] ? `${id}-op-${ativo}` : undefined}
          aria-label={label ? undefined : (ariaLabel ?? placeholder)}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={texto}
          placeholder={placeholder}
          onChange={(e) => {
            setTexto(e.target.value);
            setDigitou(true);
            setAberto(true);
          }}
          onFocus={(e) => {
            if (openOnFocus) setAberto(true);
            e.currentTarget.select();
          }}
          onBlur={() => window.setTimeout(() => setAberto(false), 120)}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full border border-line bg-surface-2 pr-10 text-fg placeholder:text-fg-subtle',
            'transition-[border-color,background-color,box-shadow] focus:border-brand/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand/15',
            'disabled:cursor-not-allowed disabled:opacity-50',
            h,
          )}
        />
        <Icon
          name="chevron"
          size={16}
          className={cn('pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-muted transition-transform', aberto && 'rotate-180')}
        />
      </div>
      {aberto ? (
        <ul
          ref={lista}
          id={listId}
          role="listbox"
          aria-label={typeof label === 'string' ? label : (ariaLabel ?? placeholder)}
          className="absolute left-0 right-0 z-40 mt-2 max-h-[min(340px,50dvh)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface-2 p-1.5 shadow-[0_24px_48px_-16px_rgb(0_0_0/0.6)]"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-3 text-sm text-fg-muted">{emptyText}</li>
          ) : (
            resultados.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-op-${i}`}
                data-idx={i}
                role="option"
                aria-selected={i === ativo}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(o)}
                onMouseMove={() => setAtivo(i)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[15px]',
                  i === ativo ? 'bg-surface-3 text-fg' : 'text-fg',
                )}
              >
                <span className="min-w-0 truncate">
                  {realcar(o.label, consulta).map((p, k) =>
                    p.hit ? (
                      <mark key={k} className="rounded-[3px] bg-brand/25 text-fg">
                        {p.t}
                      </mark>
                    ) : (
                      <span key={k}>{p.t}</span>
                    ),
                  )}
                </span>
                {o.hint ? <span className="num shrink-0 text-xs text-fg-muted">{o.hint}</span> : null}
                {selecionado?.value === o.value ? <Icon name="check" size={16} className="shrink-0 text-brand-fg" /> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
