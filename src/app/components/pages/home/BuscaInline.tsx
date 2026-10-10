/**
 * Busca "Como votou sua cidade ou seção", direto na Home (sem abrir outra tela). Reaproveita o índice da busca
 * rápida (municípios, UFs e o atalho "cidade + zona + seção" → boletim de urna). A lista de 5.571 municípios só é
 * baixada quando a pessoa toca no campo. Combobox acessível (↑/↓, Enter, Esc). Resultados empurram o conteúdo para
 * baixo (nada de lista flutuante cortada pelo teclado do celular).
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { UF } from '@/shared/types';
import { useMeta } from '@/app/data/hooks';
import { useMunicipiosBrOrdem } from '@/app/data/estatico';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { Spinner } from '@/app/ui/Button';
import { itensMunicipios, itensUfs, type ItemBusca, type MunicipioBase } from '@/app/components/busca/indice';
import { gravarRecente, lerRecentes, type Recente } from '@/app/components/busca/recentes';
import { preCarregarRota, propsPreCarregar } from '@/app/components/layout/prefetch';
import { resultadosInline } from './buscaInline';

const fmt4 = (n: number) => String(n).padStart(4, '0');

export function BuscaInline({ className, placeholder = 'Digite sua cidade' }: { className?: string; placeholder?: string }) {
  const navigate = useNavigate();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [foco, setFoco] = useState(false);
  const [ativado, setAtivado] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [recentes, setRecentes] = useState<Recente[]>([]);

  const munQ = useMunicipiosBrOrdem(ativado);
  const { data: meta } = useMeta();
  const itensMun = useMemo(() => {
    const m = munQ.data;
    if (!m) return [];
    const capitais = new Set((meta?.ufs ?? []).map((u) => u.capitalCod).filter(Boolean) as string[]);
    const lista: MunicipioBase[] = [];
    for (let i = 0; i < m.cod.length; i++) lista.push({ uf: m.uf[i] as UF, cod: m.cod[i], nome: m.nome[i], capital: capitais.has(m.cod[i]) });
    return itensMunicipios(lista);
  }, [munQ.data, meta]);
  const itensUf = useMemo(() => itensUfs(), []);

  const { opcoes, faltaCidade } = useMemo(() => resultadosInline(q, itensMun, itensUf), [q, itensMun, itensUf]);
  const vazio = !q.trim();
  const lista: (ItemBusca | Recente)[] = vazio ? recentes : opcoes;
  const idx = Math.min(ativo, Math.max(0, lista.length - 1));
  const carregando = !vazio && ativado && munQ.isLoading;
  const mostrar = foco && (lista.length > 0 || (!vazio && (carregando || !!faltaCidade || itensMun.length > 0)));
  const idLista = `${id}-lista`;
  const idOp = (i: number) => `${id}-op-${i}`;

  useEffect(() => setAtivo(0), [q]);

  function ativar() {
    if (!ativado) setAtivado(true);
    setRecentes(lerRecentes().filter((r) => r.tipo === 'municipio' || r.tipo === 'secao' || r.tipo === 'uf').slice(0, 4));
  }

  function aoFocar() {
    setFoco(true);
    ativar();
    // Celular: leva o campo para perto do topo, acima do teclado virtual.
    if (window.innerWidth < 768) {
      window.setTimeout(() => {
        const el = input.current;
        if (!el || document.activeElement !== el) return;
        const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 56;
        const y = el.getBoundingClientRect().top + window.scrollY - header - 16;
        if (Math.abs(window.scrollY - y) > 24) window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }, 280);
    }
  }

  function ir(it: ItemBusca | Recente) {
    gravarRecente(it);
    setFoco(false);
    input.current?.blur();
    navigate(it.to);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAtivo((a) => (lista.length ? (Math.min(a, lista.length - 1) + 1) % lista.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => (lista.length ? (Math.min(a, lista.length - 1) - 1 + lista.length) % lista.length : 0));
    } else if (e.key === 'Enter') {
      const op = lista[idx];
      if (op) {
        e.preventDefault();
        ir(op);
      }
    } else if (e.key === 'Escape') {
      if (q) setQ('');
      else input.current?.blur();
    }
  }

  // pré-carrega a página do 1º resultado (o toque chega com o chunk pronto)
  const primeiro = lista[0]?.to;
  useEffect(() => {
    if (foco && primeiro) preCarregarRota(primeiro);
  }, [foco, primeiro]);

  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={`${id}-campo`} className="sr-only">
        Buscar sua cidade, ou cidade com zona e seção
      </label>
      <div
        className={cn(
          'flex h-[52px] items-center gap-2.5 rounded-2xl border bg-surface-2/80 pl-3.5 pr-1.5 transition-[border-color,box-shadow]',
          foco ? 'border-brand/60 ring-4 ring-brand/15' : 'border-line hover:border-line/[2.5]',
        )}
      >
        <Icon name="busca" size={19} className={cn('shrink-0', foco ? 'text-brand-fg' : 'text-fg-muted')} />
        <input
          ref={input}
          id={`${id}-campo`}
          type="search"
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={mostrar && lista.length ? idOp(idx) : undefined}
          aria-describedby={`${id}-dica`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={aoFocar}
          onPointerDown={ativar}
          onBlur={() => window.setTimeout(() => setFoco(false), 120)}
          onKeyDown={onKeyDown}
          // 16 px: o iPhone não dá zoom ao focar
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <button
            type="button"
            aria-label="Limpar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQ('');
              input.current?.focus();
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-3 hover:text-fg"
          >
            <Icon name="fechar" size={16} />
          </button>
        ) : null}
      </div>

      {mostrar ? (
        <ul id={idLista} role="listbox" aria-label={vazio ? 'Buscas recentes' : 'Resultados'} className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {vazio ? <li className="px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Recentes</li> : null}
          {lista.map((it, i) => (
            <li
              key={it.id}
              id={idOp(i)}
              role="option"
              aria-selected={i === idx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => ir(it)}
              onMouseEnter={() => setAtivo(i)}
              className={cn('flex min-h-[48px] cursor-pointer items-center gap-3 px-3.5 py-2', i === idx ? 'bg-surface-3/70' : 'hover:bg-surface-2')}
            >
              <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', it.tipo === 'secao' ? 'bg-brand/15 text-brand-fg' : 'bg-surface-3 text-fg-muted')}>
                <Icon name={it.icone} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[14.5px] font-semibold text-fg', it.tipo === 'secao' && 'num')}>{it.rotulo}</span>
                {it.sub ? <span className="block truncate text-[12.5px] text-fg-muted">{it.sub}</span> : null}
              </span>
              <Icon name="chevron-direita" size={16} className="shrink-0 text-fg-subtle" />
            </li>
          ))}
          {!vazio && carregando ? (
            <li className="flex items-center gap-2 px-3.5 py-3 text-[13.5px] text-fg-muted" role="presentation">
              <Spinner size={16} /> Carregando os municípios…
            </li>
          ) : null}
          {!vazio && faltaCidade ? (
            <li className="px-3.5 py-3 text-[13.5px] leading-snug text-fg-muted" role="presentation">
              <span className="num font-semibold text-fg">
                Zona {fmt4(faltaCidade.zona)} · Seção {fmt4(faltaCidade.secao)}
              </span>
              : digite também a cidade, por exemplo <span className="text-fg">“Campinas {faltaCidade.zona} {faltaCidade.secao}”</span>.
            </li>
          ) : null}
          {!vazio && !carregando && !faltaCidade && opcoes.length === 0 ? (
            <li className="px-3.5 py-3 text-[13.5px] text-fg-muted" role="presentation">
              Nenhuma cidade com esse nome. Confira a grafia ou{' '}
              <Link to="/apuracao/consulta" className="font-semibold text-brand-fg underline-offset-2 hover:underline">
                consulte passo a passo
              </Link>
              .
            </li>
          ) : null}
        </ul>
      ) : null}

      <p id={`${id}-dica`} className="mt-2 text-[12.5px] leading-snug text-fg-muted">
        Ex.: <span className="num text-fg">Campinas 33 120</span> (zona e seção) ·{' '}
        <Link to="/apuracao/consulta" {...propsPreCarregar('/apuracao/consulta')} className="font-medium text-brand-fg underline-offset-2 hover:underline">
          passo a passo
        </Link>
      </p>
    </div>
  );
}
