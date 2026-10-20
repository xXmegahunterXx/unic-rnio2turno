/**
 * Bloco "Pesquisas registradas" (home, abaixo da dobra; /apuracao na fase 'pre'): as 3 pesquisas de Presidente mais
 * recentes, cada uma com os dois percentuais e a linha das informações obrigatórias, e o link para /pesquisas.
 *
 * Só aparece na fase 'pre' e antes do dia da votação (`mostrarBlocoPesquisas`); nunca na simulação com nomes ocultos;
 * sem nenhuma pesquisa publicada, não aparece. Bloco com candidato: `data-sem-anuncio-fixo` (a barra de anúncio do
 * celular e o popup do chat se recolhem diante dele). Quem monta coloca o bloco ENTRE seções, nunca colado a anúncio.
 * Chunk próprio (carregado sob demanda): nada disto entra no JS inicial.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { AVISO_PESQUISAS, pesquisasDoCargo } from '@/shared/pesquisas';
import { useFasePesquisas, usePesquisas } from './dados';
import { LinhaPesquisa } from './pecas';

export default function BlocoPesquisas({ className }: { className?: string }) {
  const { bloco } = useFasePesquisas();
  const q = usePesquisas(bloco);
  if (!bloco || !q.data || q.data.suspensas) return null;
  const pres = pesquisasDoCargo(q.data.pesquisas, 'pres').slice(0, 3);
  if (!pres.length) return null;
  return (
    <section
      aria-labelledby="bloco-pesquisas"
      data-sem-anuncio-fixo
      className={cn('rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6', className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-fg">Presidente · 2º turno</p>
          <h2 id="bloco-pesquisas" className="mt-0.5 font-display text-[21px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]">
            Pesquisas registradas
          </h2>
        </div>
        <Link
          to="/pesquisas"
          className="toque relative inline-flex items-center gap-1 rounded-lg text-[14px] font-semibold text-brand-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Ver todas
          <Icon name="chevron-direita" size={16} />
        </Link>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-fg-muted">{AVISO_PESQUISAS}</p>
      <ul className={cn('mt-4 divide-y divide-line lg:grid lg:gap-x-8 lg:divide-y-0', pres.length >= 3 ? 'lg:grid-cols-3' : pres.length === 2 ? 'lg:grid-cols-2' : '')}>
        {pres.map((p) => (
          <LinhaPesquisa key={p.id} p={p} to={`/pesquisas?p=${encodeURIComponent(p.id)}`} />
        ))}
      </ul>
      <Link
        to="/pesquisas"
        className="mt-4 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2/60 text-[14px] font-semibold text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Todas as pesquisas registradas
        <Icon name="chevron-direita" size={16} />
      </Link>
    </section>
  );
}
