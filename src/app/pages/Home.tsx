/**
 * Home (/): primeira impressão — pensada para quem chega do X no celular (muitas vezes no navegador embutido).
 *
 *  - Hero (1ª dobra, no chunk da página): título, contagem regressiva para as 17h de 25/10 (vira "AO VIVO" com o
 *    placar compacto), as três entradas (Teste Cego · sua cidade/seção · Apuração), Lembrar e Compartilhar.
 *  - Abaixo da dobra (chunk próprio, baixado quando o navegador fica ocioso e montado perto da tela): Curiosidades,
 *    entradas da Apuração e do Teste, "E se…?", governadores, sua seção, faixa final e confiança.
 *
 * Neutralidade: corridas via `useRace` (anônimas na simulação), ordem da urna, cores por slot.
 */
import { lazy, Suspense, useEffect } from 'react';
import { useAnonimizado, useNacional, useRace, useStatus } from '@/app/data/hooks';
import { useNaTela } from '@/app/lib/useNaTela';
import { Container } from '@/app/components/layout/Container';
import { preCarregarQuandoOcioso } from '@/app/components/layout/prefetch';
import { HeroHome } from '@/app/components/pages/home/HeroHome';
import { useTitulo } from '@/app/components/pages/home/useTitulo';

const carregarAbaixo = () => import('@/app/components/pages/home/AbaixoDaDobra');
const AbaixoDaDobra = lazy(carregarAbaixo);

export default function Home() {
  useTitulo('Sintonia · Apuração do 2º turno ao vivo e Teste Cego');
  const statusQ = useStatus();
  const status = statusQ.data;
  const anonimizado = useAnonimizado();
  const race = useRace('pres');
  const q = useNacional('pres');
  const resumo = q.data && q.data.race === 'pres' ? q.data.resumo : undefined;
  const [sentinela, perto] = useNaTela<HTMLDivElement>('700px');

  // Depois da 1ª pintura: baixa o resto da Home e a página do CTA principal (só em rede boa) sem disputar o hero.
  useEffect(() => {
    let id = 0;
    const t = window.setTimeout(() => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) id = ric(() => void carregarAbaixo(), { timeout: 2500 });
      else void carregarAbaixo();
    }, 600);
    const cancelarTeste = preCarregarQuandoOcioso('/teste', 3000);
    return () => {
      window.clearTimeout(t);
      const cic = (window as Window & { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback;
      if (id && cic) cic(id);
      cancelarTeste();
    };
  }, []);

  return (
    <>
      <HeroHome status={status} recebidoEm={statusQ.dataUpdatedAt} race={race} resumo={resumo} anonimizado={anonimizado} />
      <Container>
        <div ref={sentinela} className="min-h-[60vh]">
          {perto ? (
            <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
              <AbaixoDaDobra status={status} anonimizado={anonimizado} />
            </Suspense>
          ) : null}
        </div>
      </Container>
    </>
  );
}
