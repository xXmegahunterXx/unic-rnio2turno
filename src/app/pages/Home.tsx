/**
 * Home (/): primeira impressão — pensada para quem chega do X no celular (muitas vezes no navegador embutido).
 *
 *  - Hero (1ª dobra, no chunk da página): título e o confronto — as fotos oficiais de quem disputa, com o resultado
 *    oficial do 1º turno e a contagem regressiva para as 17h de 25/10 (vira o placar do 2º turno ao vivo) —, e as
 *    entradas (Teste Cego · Apuração · sua cidade/seção), Lembrar e Compartilhar.
 *  - Abaixo da dobra (chunk próprio, baixado quando o navegador fica ocioso e montado perto da tela): Curiosidades,
 *    entradas da Apuração e do Teste, "E se…?", governadores, sua seção, faixa final e confiança.
 *
 * Neutralidade: corridas via `useRace` (anônimas na simulação), ordem da urna, cores por slot.
 *
 * Estrutura em SEÇÕES irmãs (hero · abaixo da dobra): blocos de publicidade entram ENTRE seções, nunca dentro do hero
 * (que tem placar, fotos e nomes de candidatos): posição 1 logo depois do hero (separada dele pelas entradas e por
 * respiro próprio) e posição 2 no fim, depois de tudo.
 */
import { lazy, Suspense, useEffect } from 'react';
import { useAnonimizado, useNacional, useRace, useStatus } from '@/app/data/hooks';
import { useNaTela } from '@/app/lib/useNaTela';
import { Container } from '@/app/components/layout/Container';
import { preCarregarQuandoOcioso } from '@/app/components/layout/prefetch';
import { HeroHome } from '@/app/components/pages/home/HeroHome';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { AnuncioNativo } from '@/app/components/anuncios/AnuncioNativo';

const carregarAbaixo = () => import('@/app/components/pages/home/AbaixoDaDobra');
const AbaixoDaDobra = lazy(carregarAbaixo);

export default function Home() {
  useTitulo('Sintonia · Apuração do 2º turno ao vivo e Teste Cego');
  const statusQ = useStatus();
  const status = statusQ.data;
  const anonimizado = useAnonimizado();
  const race = useRace('pres');
  // Antes das 17h o hero mostra o resultado oficial do 1º turno (os números vêm do `meta`, já pré-carregado).
  const raceT1 = useRace('pres-t1');
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
      <HeroHome status={status} recebidoEm={statusQ.dataUpdatedAt} race={race} raceT1={raceT1} resumo={resumo} anonimizado={anonimizado} />
      <Container>
        {/* publicidade: entre o hero e o resto, nunca dentro do hero */}
        <AnuncioNativo posicao={1} className="mb-12 mt-4 sm:mb-16 sm:mt-2" />
        <div ref={sentinela} className="min-h-[60vh]">
          {perto ? (
            <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
              <AbaixoDaDobra status={status} anonimizado={anonimizado} />
            </Suspense>
          ) : null}
        </div>
        <AnuncioNativo posicao={2} className="mt-12 sm:mt-16" />
      </Container>
    </>
  );
}
