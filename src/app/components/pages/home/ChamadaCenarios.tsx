/**
 * Chamada "E se…? Monte seu cenário" (/cenarios, calculadora feita por outra frente). Ilustração só com a cor da
 * marca (réguas de "para onde vão os votos"), nunca as cores dos candidatos. Aviso claro: não é pesquisa nem previsão.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/app/lib/cn';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { propsPreCarregar } from '@/app/components/layout/prefetch';

const REGUAS = [0.68, 0.4, 0.55, 0.22];

export function ChamadaCenarios({ className }: { className?: string }) {
  return (
    <section aria-labelledby="home-cenarios" className={cn('relative isolate overflow-hidden rounded-[28px] border border-line bg-surface shadow-card', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand/[0.14] blur-3xl" />
        <div className="absolute inset-0 bg-noise" />
      </div>
      <div className="grid grid-cols-1 items-center gap-7 p-5 sm:p-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-10 lg:p-10">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">Calculadora do 2º turno</p>
          <h2 id="home-cenarios" className="mt-1.5 text-balance font-display text-[28px] font-semibold leading-[1.04] tracking-[-0.03em] text-fg sm:text-[38px]">
            E se…? Monte seu cenário
          </h2>
          <p className="mt-3 max-w-[34rem] text-pretty text-[15px] leading-relaxed text-fg-muted">
            Decida para onde vão os votos de quem ficou de fora no 1º turno e veja o 2º turno resultante no Brasil e em cada estado, a partir do
            resultado oficial.
          </p>
          <p className="mt-3 inline-flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[12.5px] leading-snug text-fg-muted">
            <Icon name="info" size={15} className="mt-px shrink-0 text-brand-fg" />
            Cenário hipotético montado por você. Não é pesquisa nem previsão, e nada é coletado.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <ButtonLink to="/cenarios" {...propsPreCarregar('/cenarios')} variant="primary" size="lg" iconRight="seta" className="w-full sm:w-auto">
              Montar meu cenário
            </ButtonLink>
          </div>
        </div>

        <Link
          to="/cenarios"
          {...propsPreCarregar('/cenarios')}
          tabIndex={-1}
          aria-hidden
          className="relative mx-auto block w-full max-w-[400px] rounded-[22px] border border-line/[1.6] bg-surface-2/70 p-5 shadow-card"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            <span>Para onde vão os votos</span>
            <Icon name="troca" size={16} className="text-brand-fg" />
          </div>
          <ul className="mt-4 space-y-4">
            {REGUAS.map((v, i) => (
              <li key={i}>
                <div className="mb-1.5 flex justify-between">
                  <span className="h-2 rounded-full bg-surface-3" style={{ width: `${34 + i * 9}%` }} />
                  <span className="num text-[11px] font-semibold text-fg-muted">{Math.round(v * 100)}%</span>
                </div>
                <div className="relative h-2 rounded-full bg-surface-3">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-brand-grad" style={{ width: `${v * 100}%` }} />
                  <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand bg-surface shadow-card" style={{ left: `${v * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[12.5px] font-semibold text-brand-fg">
            Ver o resultado do meu cenário
            <Icon name="seta" size={15} />
          </div>
        </Link>
      </div>
    </section>
  );
}
