/**
 * Hero da Home, pensado para quem chega do X no celular: em 3 segundos fica claro QUEM disputa (as duas fotos oficiais
 * lado a lado, com o resultado do 1º turno), QUANDO (a contagem para as 17h de 25/10) e O QUE FAZER (Teste Cego,
 * apuração, a sua cidade/seção, Lembrar, Compartilhar).
 *
 *  - Celular: sobrancelha → título → cartão do confronto (fotos, nomes, partido · número, % e votos do 1º turno,
 *    barra, contagem) → Teste Cego → Apuração → cidade/seção → texto → Lembrar · Compartilhar. As fotos, os nomes, os
 *    números e a contagem cabem na 1ª dobra em 390×844.
 *  - Desktop: texto, entradas e busca à esquerda; o cartão do confronto, maior, à direita.
 *  - Apurando/encerrada: o mesmo cartão vira o placar do 2º turno (foto só com dado real; na simulação, monograma).
 *
 * Nada de animação de entrada no título: ele aparece na hora (LCP), sem depender de dado. O cartão reserva o espaço
 * dos retratos (quadro 4:5) antes de as fotos chegarem: sem pulo de layout.
 * Neutralidade: corridas via `useRace` (anônimas na simulação), ordem da urna, cores que vêm dos dados.
 */
import type { ReactNode } from 'react';
import type { LiveStatus, Race, Summary } from '@/shared/types';
import { cn } from '@/app/lib/cn';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { Container } from '@/app/components/layout/Container';
import { BotaoCompartilharSite, BotaoLembrete, lembreteDisponivel } from './AcoesHome';
import { CtaApuracao, CtaBusca, CtaTeste } from './CtasHome';
import { FundoHero } from './FundoHero';
import { PainelDuelo } from './DueloPresidencia';
import { anteciparFotosHd } from './fotosHero';

// As fotos do confronto (~18 KB, o maior elemento da 1ª dobra) começam a baixar já na avaliação deste chunk, em
// paralelo com meta/status — não depois deles. Na simulação elas não aparecem (useFotosHero), mas o custo é pequeno;
// em produção (antes das 17h e na noite, fonte TSE) a foto sempre aparece.
if (typeof window !== 'undefined') void anteciparFotosHd().catch(() => undefined);

export interface HeroHomeProps {
  status: LiveStatus | undefined;
  /** `dataUpdatedAt` do status (interpola a contagem regressiva). */
  recebidoEm: number;
  /** Corrida do 2º turno ('pres'). */
  race: Race | undefined;
  /** Corrida do 1º turno ('pres-t1'), mostrada antes das 17h. */
  raceT1: Race | undefined;
  resumo: Summary | undefined;
  anonimizado: boolean;
}

export function HeroHome({ status, recebidoEm, race, raceT1, resumo, anonimizado }: HeroHomeProps) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const fase = status?.fase;
  const lembrete = lembreteDisponivel();

  const acoes = (
    // grade de 2 colunas que encolhe (min-w-0): em 360 px os dois botões cabem na largura, sem passar da borda
    <div className={lembrete ? 'grid grid-cols-2 gap-2.5 lg:flex' : 'flex gap-2.5'}>
      {lembrete ? <BotaoLembrete labelCurto="Lembrete" className="min-w-0 flex-1 lg:flex-none" /> : null}
      <BotaoCompartilharSite className="min-w-0 flex-1 lg:flex-none" label={lembrete ? 'Compartilhar' : 'Compartilhar o Sintonia'} />
    </div>
  );

  const titulo = (
    <h1
      id="home-titulo"
      className="mt-1 text-balance font-display text-[clamp(1.8rem,8.1vw,2.6rem)] font-semibold leading-[1] tracking-[-0.04em] text-fg sm:mt-5 sm:text-[52px] lg:text-[56px] xl:text-[64px]"
    >
      25 de outubro. <span className="text-grad">{fase === 'encerrada' ? 'Explore cada voto.' : 'Acompanhe cada voto.'}</span>
    </h1>
  );
  const descricao = (
    <p className="max-w-[36rem] text-pretty text-[14.5px] leading-snug text-fg-muted sm:text-[17px] sm:leading-relaxed">
      A apuração do 2º turno ao vivo, do Brasil inteiro até a urna da sua seção.{' '}
      <span className="text-fg">Apartidária, com os dados oficiais do TSE.</span>
    </p>
  );
  const selos = (
    <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-fg-muted sm:text-[13.5px]">
      <Selo icone="selo">Apartidário</Selo>
      <Selo icone="urna">Dados oficiais do TSE</Selo>
      <Selo icone="olho-fechado">Sem enquetes</Selo>
    </ul>
  );
  const painel = (largo: boolean, className?: string) => (
    <PainelDuelo
      status={status}
      recebidoEm={recebidoEm}
      race={race}
      raceT1={raceT1}
      resumo={resumo}
      anonimizado={anonimizado}
      largo={largo}
      className={className}
    />
  );

  return (
    <section aria-labelledby="home-titulo" className="relative isolate overflow-hidden">
      <FundoHero />
      <Container className="relative pb-8 pt-3 sm:pb-14 sm:pt-10 lg:pb-16 lg:pt-12">
        {desktop ? (
          // Desktop: texto, entradas e busca à esquerda; o confronto (fotos grandes) à direita.
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] items-start gap-10 xl:gap-14">
            <div className="min-w-0 pt-1">
              <Eyebrow fase={fase} simulacao={!!status?.simulacao} />
              {titulo}
              <div className="mt-5">{descricao}</div>
              <div className="mt-7 grid grid-cols-1 gap-3">
                <CtaTeste />
                <CtaApuracao fase={fase} />
                <CtaBusca fase={fase} />
              </div>
              <div className="mt-5">{acoes}</div>
              {selos}
            </div>
            {painel(true, 'min-w-0')}
          </div>
        ) : (
          // Celular e tablet: título → confronto (fotos + 1º turno + contagem) → Teste → Apuração → cidade/seção → ações.
          <div className="min-w-0">
            {/* No celular a sobrancelha sai: o cartão já diz "1º turno"/"2º turno" e o espaço vai para o Teste Cego. */}
            <Eyebrow fase={fase} simulacao={!!status?.simulacao} className="max-sm:hidden" />
            {titulo}
            {painel(false, 'mt-4 sm:mt-7')}
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:mt-5 sm:grid-cols-2 sm:gap-3">
              <CtaTeste />
              <CtaApuracao fase={fase} />
              <CtaBusca fase={fase} className="sm:col-span-2" />
            </div>
            <div className="mt-5">{descricao}</div>
            <div className="mt-4 sm:mt-5">{acoes}</div>
            {selos}
          </div>
        )}
      </Container>
    </section>
  );
}

function Eyebrow({ fase, simulacao, className }: { fase: LiveStatus['fase'] | undefined; simulacao: boolean; className?: string }) {
  const base = cn(
    'inline-flex h-[30px] items-center gap-2 rounded-full border px-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] sm:h-8 sm:px-3.5 sm:text-[12px]',
    className,
  );
  if (fase === 'apurando') {
    return (
      <span className={cn(base, 'border-brand/30 bg-brand/10 text-fg')}>
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
