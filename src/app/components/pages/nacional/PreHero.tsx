/**
 * Fase 'pre': hero com a contagem regressiva grande até o início da divulgação (17h de Brasília) e o
 * convite para ver o 1º turno enquanto isso. Neutro: candidatos na ordem da urna, cores por slot.
 */
import type { ReactNode } from 'react';
import type { Race } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Button, ButtonLink } from '@/app/ui/Button';
import { Countdown } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';

export interface PreHeroProps {
  /** Instante do início da divulgação (epoch ms). */
  alvo: number;
  /** Relógio da contagem (simulação); sem ele usa o relógio local. */
  agora?: number;
  /** Disputa do 2º turno (mostra "quem disputa"). */
  race?: Race;
  titulo?: ReactNode;
  descricao?: ReactNode;
  /** Id do bloco do 1º turno, para o botão "Enquanto isso…". */
  ancora?: string;
  /** Conteúdo extra no lugar do duelo (ex.: siglas dos estados). */
  extra?: ReactNode;
  className?: string;
}

export function PreHero({
  alvo,
  agora,
  race,
  titulo = 'A apuração do 2º turno começa às 17h',
  descricao = 'Os resultados aparecem aqui ao vivo, estado por estado e seção por seção, assim que o TSE começar a divulgar os boletins de urna (horário de Brasília).',
  ancora,
  extra,
  className,
}: PreHeroProps) {
  const irPara = () => {
    if (!ancora) return;
    document.getElementById(ancora)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const finalistas = race?.candidatos.filter((c) => !c.agregado) ?? [];

  return (
    <section
      aria-label="Contagem regressiva para a apuração"
      className={cn('relative isolate overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-8 lg:p-10', className)}
    >
      {/* brilho da marca + grade sutil: noite de apuração */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-brand-2/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgb(var(--line)/var(--line-alpha))_1px,transparent_1px),linear-gradient(90deg,rgb(var(--line)/var(--line-alpha))_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_65%)]" />
      </div>

      {/*
        Celular: título → contagem → texto e ações (a contagem é o assunto principal, sobe para a 1ª dobra).
        Desktop: texto à esquerda e a contagem à direita, centrada na altura do cartão.
      */}
      <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[auto_auto] lg:gap-x-12 lg:gap-y-0">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">
            <Icon name="calendario" size={15} />
            2º turno · domingo, 25 de outubro
          </div>
          <h2 className="mt-2.5 text-balance font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[40px]">
            {titulo}
          </h2>
        </div>

        <div className="flex flex-col items-start lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-center lg:self-center">
          <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Faltam</div>
          <Countdown target={alvo} now={agora} size="lg" hideZeroDays doneLabel="A apuração começou" />
          <p className="mt-3 text-[12.5px] text-fg-muted">Horário de Brasília</p>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start">
          <p className="max-w-xl text-pretty text-[15px] leading-relaxed text-fg-muted lg:mt-3">{descricao}</p>

          {finalistas.length === 2 ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2" aria-label={`Quem disputa: ${finalistas.map((c) => c.nomeUrna).join(' e ')}`}>
              {finalistas.map((c, i) => (
                <span key={c.numero} className="contents">
                  {i === 1 ? <span aria-hidden className="text-[13px] font-semibold text-fg-subtle">×</span> : null}
                  <span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-line bg-surface-2/70 py-1 pl-1 pr-3">
                    <CandidateAvatar candidato={c} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold leading-tight text-fg">{c.nomeUrna}</span>
                      <span className={cn('num block text-[11.5px] font-medium leading-tight', corSlot(c.cor).text)}>
                        {c.partido} · {c.numero}
                      </span>
                    </span>
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          {extra}

          <div className="mt-6 flex flex-wrap gap-2.5">
            {ancora ? (
              <Button variant="primary" iconRight="seta-baixo" onClick={irPara}>
                Enquanto isso, veja o 1º turno
              </Button>
            ) : null}
            <ButtonLink to="/teste" variant="outline" icon="olho-fechado">
              Faça o Teste Cego
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
