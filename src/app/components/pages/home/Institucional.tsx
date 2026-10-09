/**
 * Moldura das páginas institucionais (/metodologia, /privacidade, /sobre): cabeçalho editorial, sumário
 * lateral fixo com destaque da seção visível (desktop) ou trilha rolável (celular), e blocos de texto
 * no mesmo padrão tipográfico. As âncoras funcionam no BrowserRouter e no HashRouter do demo: os links do
 * sumário usam `?#id` do react-router e a rolagem é feita aqui (nunca `href="#id"` cru).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';
import { Container } from '@/app/components/layout/Container';
import { useTitulo } from './useTitulo';

export interface ItemSumario {
  id: string;
  titulo: string;
}

/** Rola até o elemento do hash da URL (ao abrir a página e quando o hash muda), descontando o header. */
export function useRolarParaHash(pronto = true) {
  const { hash, key } = useLocation();
  const reduzir = useReducedMotion();
  useEffect(() => {
    if (!pronto || !hash || hash.length < 2) return;
    const id = decodeURIComponent(hash.slice(1));
    let tentativas = 0;
    let raf = 0;
    const rolar = () => {
      const el = document.getElementById(id);
      if (!el) {
        if (tentativas++ < 30) raf = window.requestAnimationFrame(rolar);
        return;
      }
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 64;
      const y = el.getBoundingClientRect().top + window.scrollY - header - 16;
      window.scrollTo({ top: Math.max(0, y), behavior: reduzir ? 'auto' : 'smooth' });
    };
    // Depois do ScrollRestoration (que leva ao topo em navegações novas).
    const t = window.setTimeout(() => (raf = window.requestAnimationFrame(rolar)), 60);
    return () => {
      window.clearTimeout(t);
      window.cancelAnimationFrame(raf);
    };
  }, [hash, key, pronto, reduzir]);
}

/** Id da seção visível (para o sumário). */
function useSecaoAtiva(ids: string[]): string | null {
  const [ativa, setAtiva] = useState<string | null>(ids[0] ?? null);
  const chave = ids.join('|');
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const visiveis = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visiveis.set(e.target.id, e.boundingClientRect.top);
          else visiveis.delete(e.target.id);
        }
        const primeira = ids.find((id) => visiveis.has(id));
        if (primeira) setAtiva(primeira);
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return ativa;
}

export interface PaginaInstitucionalProps {
  tituloAba: string;
  eyebrow: string;
  icone: IconName;
  titulo: ReactNode;
  lead: ReactNode;
  atualizado?: string;
  sumario: ItemSumario[];
  /** Conteúdo entre o cabeçalho e o corpo (ex.: cartões-resumo). */
  destaque?: ReactNode;
  children: ReactNode;
}

export function PaginaInstitucional({ tituloAba, eyebrow, icone, titulo, lead, atualizado, sumario, destaque, children }: PaginaInstitucionalProps) {
  useTitulo(tituloAba);
  useRolarParaHash();
  const ativa = useSecaoAtiva(sumario.map((s) => s.id));
  const reduzir = useReducedMotion();
  const entrar = (d: number) =>
    reduzir ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: d, ease: [0.22, 0.9, 0.24, 1] as const } };

  return (
    <div className="relative">
      <Container className="pt-8 sm:pt-14 lg:pt-16">
        <header className="max-w-[46rem]">
          <motion.p {...entrar(0)} className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">
            <Icon name={icone} size={16} />
            {eyebrow}
          </motion.p>
          <motion.h1
            {...entrar(0.05)}
            className="mt-3 text-balance font-display text-[38px] font-semibold leading-[1.0] tracking-[-0.04em] text-fg sm:text-[56px] lg:text-[64px]"
          >
            {titulo}
          </motion.h1>
          <motion.p {...entrar(0.1)} className="mt-4 text-pretty text-[16.5px] leading-relaxed text-fg-muted sm:mt-5 sm:text-[19px]">
            {lead}
          </motion.p>
          {atualizado ? (
            <motion.p {...entrar(0.14)} className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-fg-subtle">
              <Icon name="calendario" size={14} />
              Atualizado em {atualizado}
            </motion.p>
          ) : null}
        </header>

        {destaque ? <motion.div {...entrar(0.18)} className="mt-8 sm:mt-10">{destaque}</motion.div> : null}

        <SumarioCelular itens={sumario} ativa={ativa} />

        <div className="mt-8 grid grid-cols-1 gap-10 sm:mt-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav aria-label="Nesta página" className="sticky top-[calc(var(--app-header-h,64px)+24px)]">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Nesta página</p>
              <ol className="mt-3 space-y-0.5 border-l border-line">
                {sumario.map((s) => {
                  const on = ativa === s.id;
                  return (
                    <li key={s.id} className="relative">
                      {on ? (
                        <motion.span layoutId="sumario-ativo" className="absolute -left-px top-1 bottom-1 w-[2px] rounded-full bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                      ) : null}
                      <Link
                        to={{ hash: s.id }}
                        replace
                        aria-current={on ? 'location' : undefined}
                        className={cn(
                          'block rounded-r-lg py-1.5 pl-4 pr-2 text-[14px] leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                          on ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg',
                        )}
                      >
                        {s.titulo}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </aside>
          <div className="min-w-0 max-w-[46rem] space-y-14 sm:space-y-16">{children}</div>
        </div>
      </Container>
    </div>
  );
}

function SumarioCelular({ itens, ativa }: { itens: ItemSumario[]; ativa: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <nav aria-label="Nesta página" className="sticky top-[var(--app-header-h,56px)] z-20 -mx-4 mt-8 border-b border-line bg-bg/85 backdrop-blur-xl sm:-mx-6 lg:hidden">
      <div ref={ref} className="flex gap-1.5 overflow-x-auto px-4 py-2.5 scrollbar-none sm:px-6">
        {itens.map((s) => (
          <Link
            key={s.id}
            to={{ hash: s.id }}
            replace
            aria-current={ativa === s.id ? 'location' : undefined}
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              ativa === s.id ? 'border-brand/40 bg-brand/15 text-fg' : 'border-line bg-surface text-fg-muted',
            )}
          >
            {s.titulo}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** Seção com âncora (o `id` casa com o sumário). */
export function Secao({ id, titulo, eyebrow, children }: { id: string; titulo: ReactNode; eyebrow?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-28">
      {eyebrow ? <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">{eyebrow}</p> : null}
      <h2 id={`${id}-titulo`} className="mt-1 text-balance font-display text-[26px] font-semibold leading-tight tracking-[-0.03em] text-fg sm:text-[32px]">
        <Link to={{ hash: id }} replace className="group inline rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {titulo}
          <span aria-hidden className="ml-2 inline-block text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100">
            #
          </span>
        </Link>
      </h2>
      <div className="mt-4 space-y-4 text-pretty text-[15.5px] leading-[1.7] text-fg-muted sm:text-[16.5px] [&_strong]:font-semibold [&_strong]:text-fg">
        {children}
      </div>
    </section>
  );
}

export function Subtitulo({ children }: { children: ReactNode }) {
  return <h3 className="!mt-8 font-display text-[19px] font-semibold tracking-[-0.015em] text-fg sm:text-[21px]">{children}</h3>;
}

/** Lista com marcadores discretos. */
export function Lista({ itens, numerada }: { itens: ReactNode[]; numerada?: boolean }) {
  const Tag = numerada ? 'ol' : 'ul';
  return (
    <Tag className="space-y-2.5">
      {itens.map((it, i) => (
        <li key={i} className="flex gap-3">
          {numerada ? (
            <span className="num mt-[3px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[12px] font-bold text-brand-fg">{i + 1}</span>
          ) : (
            <span aria-hidden className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-2/70" />
          )}
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </Tag>
  );
}

/** Caixa de destaque (nota, aviso, regra). */
export function Destaque({ icone = 'info', titulo, children, tom = 'neutro' }: { icone?: IconName; titulo?: ReactNode; children: ReactNode; tom?: 'neutro' | 'marca' | 'alerta' }) {
  return (
    <div
      className={cn(
        'flex gap-3.5 rounded-2xl border p-4 text-[14.5px] leading-relaxed sm:p-5 sm:text-[15px]',
        tom === 'marca' ? 'border-brand/30 bg-brand/[0.07]' : tom === 'alerta' ? 'border-alert/30 bg-alert/[0.07]' : 'border-line bg-surface-2/60',
      )}
    >
      <span
        className={cn(
          'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
          tom === 'marca' ? 'bg-brand/15 text-brand-fg' : tom === 'alerta' ? 'bg-alert/15 text-alert-fg' : 'bg-surface-3 text-fg-muted',
        )}
      >
        <Icon name={icone} size={17} />
      </span>
      <div className="min-w-0 text-fg-muted">
        {titulo ? <p className="mb-1 font-semibold text-fg">{titulo}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** Tabela simples em cartão (rola na horizontal dentro do cartão se precisar). */
export function Ficha({ colunas, linhas, legenda }: { colunas: string[]; linhas: ReactNode[][]; legenda?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14px] leading-snug">
          {legenda ? <caption className="sr-only">{legenda}</caption> : null}
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              {colunas.map((c) => (
                <th key={c} scope="col" className="px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {linhas.map((l, i) => (
              <tr key={i} className="align-top">
                {l.map((cel, j) => (
                  <td key={j} className={cn('px-4 py-3', j === 0 ? 'font-medium text-fg' : 'text-fg-muted')}>
                    {cel}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Link externo com ícone. */
export function LinkExterno({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-baseline gap-1 font-medium text-fg underline decoration-line/[3] underline-offset-[3px] transition-colors hover:decoration-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      {children}
      <Icon name="externo" size={13} className="shrink-0 translate-y-[1px] text-fg-subtle" />
    </a>
  );
}

/** Link interno no corpo do texto. */
export function LinkInterno({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-fg underline decoration-line/[3] underline-offset-[3px] transition-colors hover:decoration-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      {children}
    </Link>
  );
}

/** Cartões-resumo com ícone (topo das páginas). */
export function Resumo({ itens }: { itens: { icone: IconName; titulo: string; texto: ReactNode }[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
      {itens.map((it) => (
        <li key={it.titulo} className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand/[0.1] blur-2xl" />
          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand/25 bg-brand/[0.12] text-brand-fg">
            <Icon name={it.icone} size={20} />
          </span>
          <h2 className="relative mt-3.5 font-display text-[17.5px] font-semibold leading-snug tracking-[-0.015em] text-fg">{it.titulo}</h2>
          <p className="relative mt-1.5 text-pretty text-[14px] leading-relaxed text-fg-muted">{it.texto}</p>
        </li>
      ))}
    </ul>
  );
}

/** Contato provisório (o produto ainda não tem endereços definitivos). */
export const CONTATO = {
  geral: 'contato@sintonia.example',
  privacidade: 'privacidade@sintonia.example',
  imprensa: 'imprensa@sintonia.example',
  correcoes: 'correcoes@sintonia.example',
} as const;

export function Email({ endereco }: { endereco: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <a href={`mailto:${endereco}`} className="break-all font-mono text-[0.92em] text-fg underline decoration-line/[3] underline-offset-[3px] hover:decoration-brand-fg">
        {endereco}
      </a>
      <span className="text-[12px] text-fg-subtle">(provisório)</span>
    </span>
  );
}
