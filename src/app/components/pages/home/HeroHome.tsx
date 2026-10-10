/**
 * Hero da Home: marca, título forte sobre o 2º turno, chamada e o painel da fase (contagem regressiva ou
 * placar ao vivo). Fundo com ondas/aurora. Celular primeiro: título → painel → botões na 1ª dobra.
 */
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LiveStatus, Race, Summary } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { Container } from '@/app/components/layout/Container';
import { FundoHero } from './FundoHero';
import { PainelAoVivo } from './PainelAoVivo';

export interface HeroHomeProps {
  status: LiveStatus | undefined;
  /** `dataUpdatedAt` do status (interpola a contagem regressiva). */
  recebidoEm: number;
  race: Race | undefined;
  resumo: Summary | undefined;
  anonimizado: boolean;
}

const EASE = [0.22, 0.9, 0.24, 1] as const;

export function HeroHome({ status, recebidoEm, race, resumo, anonimizado }: HeroHomeProps) {
  const reduzir = useReducedMotion();
  const fase = status?.fase ?? 'pre';
  const entrar = (d: number) =>
    reduzir ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: d, ease: EASE } };

  const acoes = (
    <>
      <ButtonLink to="/apuracao" variant="primary" size="lg" icon="ao-vivo" className="w-full sm:w-auto">
        {fase === 'pre' ? 'Ver a apuração' : fase === 'apurando' ? 'Acompanhar ao vivo' : 'Ver o resultado'}
      </ButtonLink>
      <ButtonLink to="/teste" variant="secondary" size="lg" icon="olho-fechado" className="w-full sm:w-auto">
        Fazer o Teste Cego
      </ButtonLink>
    </>
  );

  return (
    <section aria-labelledby="home-titulo" className="relative isolate overflow-hidden">
      <FundoHero />
      <Container className="relative pb-10 pt-7 sm:pb-14 sm:pt-12 lg:pb-20 lg:pt-20">
        <div className="grid grid-cols-1 items-center gap-7 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-14">
          <div className="min-w-0">
            <motion.div {...entrar(0)}>
              <Eyebrow fase={fase} />
            </motion.div>
            <motion.h1
              id="home-titulo"
              {...entrar(0.06)}
              className="mt-4 text-balance font-display text-[44px] font-semibold leading-[0.96] tracking-[-0.045em] text-fg min-[400px]:text-[48px] sm:mt-6 sm:text-[72px] lg:text-[76px] xl:text-[88px]"
            >
              25 de outubro.
              <br />
              <span className="text-grad">
                {fase === 'encerrada' ? 'Explore' : 'Acompanhe'}
                <br /> cada voto.
              </span>
            </motion.h1>
            <motion.p {...entrar(0.12)} className="mt-4 max-w-[36rem] text-pretty text-[16px] leading-relaxed text-fg-muted sm:mt-6 sm:text-[19px]">
              A apuração do 2º turno em tempo real, do Brasil inteiro até a urna da sua seção.{' '}
              <span className="text-fg">Apartidária e com os dados oficiais do TSE.</span>
            </motion.p>
            <motion.div {...entrar(0.2)} className="mt-8 hidden flex-wrap items-center gap-3 lg:flex">
              {acoes}
            </motion.div>
            <motion.ul {...entrar(0.26)} className="mt-6 hidden flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-fg-muted lg:flex">
              <Selo icone="selo">Apartidário</Selo>
              <Selo icone="urna">Dados oficiais do TSE</Selo>
              <Selo icone="olho-fechado">Sem enquetes</Selo>
            </motion.ul>
          </div>

          <motion.div
            initial={reduzir ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: reduzir ? 0 : 0.14, ease: EASE }}
            className="min-w-0"
          >
            <PainelAoVivo status={status} recebidoEm={recebidoEm} race={race} resumo={resumo} anonimizado={anonimizado} />
          </motion.div>

          <motion.div {...entrar(0.24)} className="flex flex-col gap-2.5 sm:flex-row lg:hidden">
            {acoes}
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

function Eyebrow({ fase }: { fase: LiveStatus['fase'] }) {
  const base = 'inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold uppercase tracking-[0.14em]';
  if (fase === 'apurando') {
    return (
      <span className={cn(base, 'border-alert/30 bg-alert/10 text-fg')}>
        <LiveDot tone="live" />
        Ao vivo · apuração do 2º turno
      </span>
    );
  }
  if (fase === 'encerrada') {
    return (
      <span className={cn(base, 'border-line/[2] bg-surface/70 text-fg backdrop-blur')}>
        <Icon name="check-circulo" size={15} className="text-brand-fg" />
        Apuração encerrada
      </span>
    );
  }
  return (
    <span className={cn(base, 'border-brand/30 bg-brand/10 text-fg backdrop-blur')}>
      <Icon name="calendario" size={15} className="text-brand-fg" />
      2º turno · domingo
    </span>
  );
}

function Selo({ icone, children }: { icone: Parameters<typeof Icon>[0]['name']; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon name={icone} size={16} className="text-brand-fg" />
      {children}
    </li>
  );
}
