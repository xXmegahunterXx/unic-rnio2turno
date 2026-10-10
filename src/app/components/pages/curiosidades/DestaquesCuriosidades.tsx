/**
 * Três curiosidades em destaque, compactas — para a home (outra frente posiciona) e para o hero de /curiosidades.
 * Cada item leva ao cartão completo em /curiosidades?fato=id. Usa só fatos com número em destaque (impacto em
 * 3 segundos) e cai para os primeiros fatos com destaque se algum id não existir.
 *
 *   <DestaquesCuriosidades />                       // home: título + 3 cartões + "ver todas"
 *   <DestaquesCuriosidades variante="hero" />       // lista vertical, sem título (hero da página)
 */
import { Link } from 'react-router-dom';
import type { Curiosidade } from '@/shared/curiosidades';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { Skeleton } from '@/app/ui/Skeleton';
import { useCuriosidades } from './dados';
import { DESTAQUES_PADRAO, ICONE_TEMA, caminhoFato, escolherDestaques, fmtValor, nivelTamanho } from './formato';

export { escolherDestaques };

export interface DestaquesCuriosidadesProps {
  /** Ids dos fatos (padrão: DESTAQUES_PADRAO). */
  ids?: string[];
  variante?: 'compacto' | 'hero';
  className?: string;
}

export function DestaquesCuriosidades({ ids = DESTAQUES_PADRAO, variante = 'compacto', className }: DestaquesCuriosidadesProps) {
  const q = useCuriosidades();
  if (q.isError) return null;
  const hero = variante === 'hero';
  const fatos = q.data ? escolherDestaques(q.data.fatos, ids) : null;

  const lista = (
    <ul className={cn('grid gap-2.5', hero ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3 sm:gap-3')}>
      {fatos
        ? fatos.map((f, i) => (
            <li key={f.id} className="min-w-0">
              <ItemDestaque fato={f} hero={hero} indice={i} />
            </li>
          ))
        : [0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className={cn('w-full rounded-2xl', hero ? 'h-[112px]' : 'h-[124px]')} />
            </li>
          ))}
    </ul>
  );

  if (hero) return <div className={className}>{lista}</div>;

  return (
    <section aria-labelledby="destaques-curiosidades-titulo" className={cn('py-5 sm:py-7', className)}>
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 sm:mb-4">
        <div className="min-w-0">
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-muted">1º turno · dados oficiais</div>
          <h2 id="destaques-curiosidades-titulo" className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]">
            Curiosidades do 1º turno
          </h2>
        </div>
        <Link
          to="/curiosidades"
          className="inline-flex items-center gap-1 text-[14px] font-medium text-brand-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Ver {q.data ? <span className="num">{q.data.fatos.length}</span> : 'todas as'} curiosidades
          <Icon name="seta" size={16} />
        </Link>
      </div>
      {lista}
    </section>
  );
}

const TAM = ['text-[46px]', 'text-[42px]', 'text-[36px]', 'text-[30px]'] as const;
const TAM_HERO = ['text-[44px] sm:text-[52px]', 'text-[40px] sm:text-[46px]', 'text-[36px] sm:text-[42px]', 'text-[30px] sm:text-[36px]'] as const;

function ItemDestaque({ fato, hero, indice }: { fato: Curiosidade; hero: boolean; indice: number }) {
  const valor = fato.destaque ? fmtValor(fato.destaque) : '';
  const n = nivelTamanho(valor);
  const lugar = fato.lugares.filter((l) => l.nome !== 'Brasil').map((l) => l.nome).slice(0, 2).join(' · ');
  return (
    <Link
      to={caminhoFato(fato.id)}
      className={cn(
        'group relative flex h-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface/90 shadow-card transition-[border-color,transform] duration-200 hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]',
        hero ? 'p-4 pl-5 sm:p-5 sm:pl-6' : 'p-4 pl-5',
        hero && 'animate-fade-up',
      )}
      style={hero ? { animationDelay: `${120 + indice * 90}ms` } : undefined}
    >
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-brand-grad opacity-80" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5 text-[11px] font-semibold uppercase leading-snug tracking-[0.14em] text-fg-muted">
          <Icon name={ICONE_TEMA[fato.tema]} size={13} className="mt-px shrink-0 text-brand-fg" />
          <span className="min-w-0">{fato.titulo}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className={cn('num whitespace-nowrap font-display font-semibold leading-none tracking-[-0.03em] text-brand-fg', (hero ? TAM_HERO : TAM)[n])}>{valor}</span>
          {fato.destaque?.unidade ? (
            <span className={cn('font-semibold leading-snug text-fg', hero ? 'text-[15px] sm:text-[16px]' : 'text-[14px]')}>{fato.destaque.unidade}</span>
          ) : null}
        </div>
        {lugar ? <div className="mt-1.5 truncate text-[13px] text-fg-muted">{lugar}</div> : null}
      </div>
      <Icon name="chevron-direita" size={18} className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
