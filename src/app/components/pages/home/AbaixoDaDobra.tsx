/**
 * Tudo o que fica abaixo da 1ª dobra da Home, num chunk próprio: só é baixado depois da 1ª pintura (quando o
 * navegador fica ocioso) e só é montado perto da tela. Assim mapas, ilustrações e as consultas dos governadores não
 * disputam rede nem CPU com o hero no celular (3G/4G fraco, navegador embutido do X).
 */
import type { Fase, LiveStatus } from '@/shared/types';
import { DestaquesCuriosidades } from '@/app/components/pages/curiosidades/DestaquesCuriosidades';
import { ChamadaCenarios } from './ChamadaCenarios';
import { ChamadaSecao } from './ChamadaSecao';
import { Confianca } from './Confianca';
import { EntradaApuracao } from './EntradaApuracao';
import { EntradaTeste } from './EntradaTeste';
import { FaixaFinal } from './FaixaFinal';
import { FaixaGovernadores } from './FaixaGovernadores';

export default function AbaixoDaDobra({ status, anonimizado }: { status: LiveStatus | undefined; anonimizado: boolean }) {
  const fase: Fase = status?.fase ?? 'pre';
  return (
    <div className="space-y-12 sm:space-y-16">
      <DestaquesCuriosidades className="!py-0" />
      <section aria-label="Apuração e Teste Cego" className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <EntradaApuracao status={status} anonimizado={anonimizado} />
        <EntradaTeste />
      </section>
      <ChamadaCenarios />
      <FaixaGovernadores fase={fase} />
      <ChamadaSecao />
      <FaixaFinal />
      <Confianca />
    </div>
  );
}
