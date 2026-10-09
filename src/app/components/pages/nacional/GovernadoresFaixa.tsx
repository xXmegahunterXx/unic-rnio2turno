/**
 * Faixa com as 7 disputas de governador na página nacional: placar compacto de cada uma (link para a
 * UF) e um cartão final para a página /governadores. Celular: carrossel com encaixe; desktop: grade 4×2.
 */
import { Link } from 'react-router-dom';
import type { Race } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { Placar } from '@/app/components/apuracao/Placar';
import { LoadingState } from '@/app/components/apuracao/States';
import { linkUf } from './fase';
import { useGovernadoresNacional } from './useGovernadores';

export interface GovernadoresFaixaProps {
  races: Race[];
  /** Mostra o 1º turno (fase pre ou pedido explícito). */
  t1: boolean;
  /** Links para o 1º turno explícito (`?race=gov-xx-t1`). */
  linkT1?: boolean;
  className?: string;
}

/**
 * Os cartões não levam o selo SIMULAÇÃO (7 selos truncariam os nomes das UFs): a faixa do AppShell e
 * o selo do placar principal já sinalizam a simulação na página.
 */
export function GovernadoresFaixa({ races, t1, linkT1, className }: GovernadoresFaixaProps) {
  const govs = useGovernadoresNacional(t1);
  return (
    <section aria-labelledby="gov-titulo" className={cn('min-w-0', className)}>
      <div className="mb-3.5 flex items-end justify-between gap-4 sm:mb-4">
        <div className="min-w-0">
          <h2 id="gov-titulo" className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]">
            Governadores
          </h2>
          <p className="mt-1 text-[13.5px] leading-snug text-fg-muted">
            {t1 ? '1º turno nos 7 estados que têm 2º turno para governador' : '2º turno em 7 estados: AC, AM, DF, ES, RJ, RN e TO'}
          </p>
        </div>
        <Link
          to="/governadores"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1 py-1 text-[13.5px] font-medium text-brand-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Ver todos
          <Icon name="chevron-direita" size={16} />
        </Link>
      </div>

      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:scroll-px-0 sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 min-[1360px]:grid-cols-4">
        {govs.map((g) => {
          const race = races.find((r) => r.id === g.id);
          const data = g.q.data && g.q.data.race === g.id ? g.q.data : undefined;
          return (
            <li key={g.uf} className="w-[84%] max-w-[340px] shrink-0 snap-start sm:w-auto sm:max-w-none">
              {race && data ? (
                <Placar
                  variant="compact"
                  race={race}
                  resumo={data.resumo}
                  titulo={UF_NOMES[g.uf]}
                  subtitulo={t1 ? 'Governador · 1º turno' : 'Governador'}
                  to={linkUf(g.uf, linkT1 ? g.id : g.base)}
                  className="h-full"
                />
              ) : (
                <LoadingState variant="placar-compacto" label={`Carregando ${UF_NOMES[g.uf]}`} />
              )}
            </li>
          );
        })}
        <li className="w-[84%] max-w-[340px] shrink-0 snap-start sm:w-auto sm:max-w-none">
          <Link
            to="/governadores"
            className="group flex h-full min-h-[180px] flex-col justify-between rounded-2xl border border-dashed border-line bg-surface-2/50 p-5 transition-colors hover:border-brand/40 hover:bg-brand/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
              <Icon name="grade" size={20} />
            </span>
            <span>
              <span className="block font-display text-[18px] font-semibold leading-tight tracking-[-0.015em] text-fg">As 7 disputas lado a lado</span>
              <span className="mt-1 block text-[13px] leading-snug text-fg-muted">Ordene pelas mais apertadas e veja o mapa de cada estado.</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[13.5px] font-medium text-brand-fg">
              Ver governadores
              <Icon name="seta" size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
