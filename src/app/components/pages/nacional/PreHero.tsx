/**
 * Fase 'pre': hero com a contagem regressiva grande até o início da divulgação (17h de Brasília) e o
 * convite para ver o 1º turno enquanto isso. Neutro: candidatos na ordem da urna, cores por slot.
 *
 * Com a disputa do 2º turno (`race`, Presidente): o confronto com as FOTOS oficiais grandes, lado a lado, do mesmo
 * tamanho e tratamento (`DueloPrimeiroTurno` da Home, variante compacta: nome, partido · número e o % oficial do
 * 1º turno — o placar completo vem logo abaixo). Foto só com dado real e nome real (`useFotosHero`): o 1º turno é
 * oficial; com os nomes ocultos na simulação, monograma. Nunca há número simulado aqui (fase 'pre').
 * Sem `race` (governadores), o layout de antes: título, contagem e o conteúdo `extra`.
 */
import type { ReactNode } from 'react';
import type { Race } from '@/shared/types';
import { useRace } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { Button, ButtonLink } from '@/app/ui/Button';
import { Countdown } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { DueloPrimeiroTurno } from '@/app/components/pages/home/DueloPresidencia';

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
  // A corrida do 1º turno correspondente ('pres' → 'pres-t1'): mesmos finalistas, com o resultado oficial.
  const raceT1 = useRace(race ? `${race.id.replace(/-t1$/, '')}-t1` : undefined);
  // O layout depende só de haver a disputa (nada pula quando o 1º turno chega: o confronto tem esqueleto próprio).
  const comDuelo = !!race && race.candidatos.filter((c) => !c.agregado).length === 2;

  const sobrancelha = (
    <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">
      <Icon name="calendario" size={15} />
      2º turno · domingo, 25 de outubro
    </div>
  );
  const tituloEl = (
    <h2 className="mt-2.5 text-balance font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[40px]">{titulo}</h2>
  );
  const contagem = (centro: boolean) => (
    <div className={cn('flex flex-col', centro ? 'items-start lg:items-center' : 'items-start')}>
      <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Faltam</div>
      <Countdown target={alvo} now={agora} size="lg" hideZeroDays doneLabel="A apuração começou" />
      <p className="mt-3 text-[12.5px] text-fg-muted">Horário de Brasília</p>
    </div>
  );
  const botoes = (
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
  );

  return (
    <section
      // fotos, nomes e 1º turno: sem barra fixa de anúncio por cima (anuncios/faixaLivre.ts)
      data-sem-anuncio-fixo
      aria-label="Contagem regressiva para a apuração"
      className={cn('relative isolate overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-8 lg:p-10', className)}
    >
      {/* brilho da marca + grade sutil: noite de apuração */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-brand-2/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgb(var(--line)/var(--line-alpha))_1px,transparent_1px),linear-gradient(90deg,rgb(var(--line)/var(--line-alpha))_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_65%)]" />
      </div>

      {comDuelo ? (
        /*
          Com o confronto. Celular: título → fotos → contagem → texto e ações.
          Desktop: título, texto, contagem e ações à esquerda; as fotos à direita, centradas na altura do cartão.
        */
        <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-x-12 xl:gap-x-16">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            {sobrancelha}
            {tituloEl}
          </div>
          <DueloPrimeiroTurno
            race={raceT1}
            variante="compacto"
            retratoClassName="max-w-[168px] sm:max-w-[200px] lg:max-w-[210px]"
            className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-center"
          />
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">{contagem(false)}</div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-3">
            <p className="max-w-xl text-pretty text-[15px] leading-relaxed text-fg-muted">{descricao}</p>
            {extra}
            {botoes}
          </div>
        </div>
      ) : (
        /*
          Celular: título → contagem → texto e ações (a contagem é o assunto principal, sobe para a 1ª dobra).
          Desktop: texto à esquerda e a contagem à direita, centrada na altura do cartão.
        */
        <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[auto_auto] lg:gap-x-12 lg:gap-y-0">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
            {sobrancelha}
            {tituloEl}
          </div>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">{contagem(true)}</div>

          <div className="min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start">
            <p className="max-w-xl text-pretty text-[15px] leading-relaxed text-fg-muted lg:mt-3">{descricao}</p>
            {extra}
            {botoes}
          </div>
        </div>
      )}
    </section>
  );
}
