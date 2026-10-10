/**
 * Hero da Home, pensado para quem chega do X no celular: em 3 segundos fica claro O QUE é (a apuração do 2º turno
 * ao vivo, do Brasil até a sua seção, + o Teste Cego) e O QUE FAZER (três entradas grandes na 1ª dobra).
 *
 *  - Celular: sobrancelha → título → faixa da fase (contagem regressiva ou placar compacto) → Teste Cego →
 *    "Como votou sua cidade ou seção" (busca ali mesmo) → Apuração → Lembrar · Compartilhar.
 *  - Desktop: texto e entradas à esquerda; painel da fase completo à direita (contagem + quem disputa, ou placar).
 *
 * Nada de animação de entrada no texto: o título é o maior elemento da 1ª dobra (LCP) e precisa aparecer na hora.
 * Neutralidade: corridas via `useRace` (anônimas na simulação), ordem da urna, cores por slot.
 */
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LiveStatus, Race, Summary } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { Container } from '@/app/components/layout/Container';
import { BotaoCompartilharSite, BotaoLembrete, lembreteDisponivel } from './AcoesHome';
import { CtaApuracao, CtaBusca, CtaTeste } from './CtasHome';
import { FaixaFase } from './FaixaFase';
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

export function HeroHome({ status, recebidoEm, race, resumo, anonimizado }: HeroHomeProps) {
  const reduzir = useReducedMotion();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const fase = status?.fase;
  const lembrete = lembreteDisponivel();

  const acoes = (
    <div className="flex gap-2.5">
      {lembrete ? <BotaoLembrete className="flex-1 lg:flex-none" /> : null}
      <BotaoCompartilharSite className="flex-1 lg:flex-none" label={lembrete ? 'Compartilhar' : 'Compartilhar o Sintonia'} />
    </div>
  );

  return (
    <section aria-labelledby="home-titulo" className="relative isolate overflow-hidden">
      <FundoHero />
      <Container className="relative pb-8 pt-4 sm:pb-14 sm:pt-10 lg:pb-16 lg:pt-14">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)] lg:gap-12 xl:gap-16">
          <div className="min-w-0">
            <Eyebrow fase={fase} simulacao={!!status?.simulacao} />
            <h1
              id="home-titulo"
              className="mt-3 text-balance font-display text-[clamp(2rem,9.4vw,2.6rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-fg sm:mt-5 sm:text-[60px] lg:text-[62px] xl:text-[70px]"
            >
              25 de outubro. <span className="text-grad">{fase === 'encerrada' ? 'Explore cada voto.' : 'Acompanhe cada voto.'}</span>
            </h1>
            <p className="mt-2.5 max-w-[36rem] text-pretty text-[14.5px] leading-snug text-fg-muted sm:mt-5 sm:text-[18px] sm:leading-relaxed">
              A apuração do 2º turno ao vivo, do Brasil inteiro até a urna da sua seção.{' '}
              <span className="text-fg">Apartidária, com os dados oficiais do TSE.</span>
            </p>

            {/* Celular e tablet: faixa compacta da fase logo abaixo do título. */}
            {!desktop ? <FaixaFase status={status} recebidoEm={recebidoEm} race={race} resumo={resumo} className="mt-4 sm:mt-7" /> : null}

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:mt-5 sm:grid-cols-2 sm:gap-3 lg:mt-8">
              <CtaTeste />
              <CtaApuracao fase={fase} className="order-last sm:order-none" />
              <CtaBusca fase={fase} className="sm:col-span-2" />
            </div>

            <div className="mt-4 sm:mt-5">{acoes}</div>

            <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-fg-muted sm:text-[13.5px]">
              <Selo icone="selo">Apartidário</Selo>
              <Selo icone="urna">Dados oficiais do TSE</Selo>
              <Selo icone="olho-fechado">Sem enquetes</Selo>
            </ul>
          </div>

          {desktop ? (
            <motion.div
              initial={reduzir ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 0.9, 0.24, 1] }}
              className="min-w-0 lg:sticky lg:top-[calc(var(--app-header-h)+24px)] lg:mt-2"
            >
              <PainelAoVivo status={status} recebidoEm={recebidoEm} race={race} resumo={resumo} anonimizado={anonimizado} />
            </motion.div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

function Eyebrow({ fase, simulacao }: { fase: LiveStatus['fase'] | undefined; simulacao: boolean }) {
  const base = 'inline-flex h-[30px] items-center gap-2 rounded-full border px-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] sm:h-8 sm:px-3.5 sm:text-[12px]';
  if (fase === 'apurando') {
    return (
      <span className={cn(base, 'border-alert/30 bg-alert/10 text-fg')}>
        <LiveDot tone={simulacao ? 'brand' : 'live'} />
        {simulacao ? 'Simulação · apuração do 2º turno' : 'Ao vivo · apuração do 2º turno'}
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
      Eleições 2026 · 2º turno
    </span>
  );
}

function Selo({ icone, children }: { icone: Parameters<typeof Icon>[0]['name']; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon name={icone} size={15} className="text-brand-fg" />
      {children}
    </li>
  );
}
