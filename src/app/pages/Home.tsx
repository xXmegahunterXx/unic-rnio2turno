/**
 * Home (/): primeira impressão. Hero com a contagem regressiva para as 17h de 25/10 (vira "AO VIVO" com o
 * placar compacto quando a apuração começa), as duas entradas (Apuração ao vivo · Teste Cego), a faixa dos
 * 7 governadores, "Consulte sua seção" e a seção de confiança. O rodapé vem do AppShell.
 *
 * Neutralidade: corridas via `useRace` (anônimas na simulação), ordem da urna, cores por slot.
 */
import { useAnonimizado, useNacional, useRace, useStatus } from '@/app/data/hooks';
import { Container } from '@/app/components/layout/Container';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { ChamadaSecao } from '@/app/components/pages/home/ChamadaSecao';
import { Confianca } from '@/app/components/pages/home/Confianca';
import { EntradaApuracao } from '@/app/components/pages/home/EntradaApuracao';
import { EntradaTeste } from '@/app/components/pages/home/EntradaTeste';
import { FaixaGovernadores } from '@/app/components/pages/home/FaixaGovernadores';
import { HeroHome } from '@/app/components/pages/home/HeroHome';

export default function Home() {
  useTitulo('Sintonia · Apuração do 2º turno ao vivo e Teste Cego');
  const statusQ = useStatus();
  const status = statusQ.data;
  const anonimizado = useAnonimizado();
  const race = useRace('pres');
  const q = useNacional('pres');
  const resumo = q.data && q.data.race === 'pres' ? q.data.resumo : undefined;

  return (
    <>
      <HeroHome status={status} recebidoEm={statusQ.dataUpdatedAt} race={race} resumo={resumo} anonimizado={anonimizado} />
      <Container className="space-y-14 sm:space-y-20">
        <section aria-label="Comece por aqui" className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <EntradaApuracao status={status} anonimizado={anonimizado} />
          <EntradaTeste />
        </section>
        <FaixaGovernadores fase={status?.fase ?? 'pre'} />
        <ChamadaSecao />
        <Confianca />
      </Container>
    </>
  );
}
