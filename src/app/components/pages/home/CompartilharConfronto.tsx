/**
 * "Compartilhar resultado/placar" do cartão do confronto da Home: o sheet do kit com o MESMO cartão do placar da
 * apuração (`ShareCard`: 1º turno oficial com foto; 2º turno com o selo SIMULAÇÃO e sem foto quando simulado), o texto
 * neutro (`textoCompartilhamento`) e o link da apuração. Carregado sob demanda no 1º toque (fora do JS inicial).
 */
import type { Race } from '@/shared/types';
import { useNacional } from '@/app/data/hooks';
import { CompartilharSheet } from '@/app/components/share';
import { hashtags } from '@/app/components/share/textos';
import { ShareCard, textoCompartilhamento } from '@/app/components/apuracao/ShareCard';

export interface CompartilharConfrontoProps {
  aberto: boolean;
  onFechar: () => void;
  /** Corrida exibida no cartão ('pres-t1' antes das 17h; 'pres' ao vivo), já anônima quando for o caso. */
  race: Race;
  /** Números simulados (2º turno na simulação): selo e marca-d'água, sem foto. */
  simulado: boolean;
}

export default function CompartilharConfronto({ aberto, onFechar, race, simulado }: CompartilharConfrontoProps) {
  // Mesma consulta da página (já em cache: a Home pré-carrega 'pres' e 'pres-t1').
  const q = useNacional(race.id);
  const resumo = q.data && q.data.race === race.id ? q.data.resumo : undefined;
  const t1 = race.turno === 1;
  // Antes das 17h, /apuracao mostra o 1º turno (o mesmo link da página nacional).
  const caminho = '/apuracao';
  return (
    <CompartilharSheet
      aberto={aberto}
      onFechar={onFechar}
      titulo={t1 ? 'Compartilhar resultado' : 'Compartilhar placar'}
      descricao={t1 ? 'Resultado oficial do 1º turno (TSE), com o link da apuração.' : undefined}
      texto={resumo ? textoCompartilhamento(race, resumo, simulado && !t1) : ''}
      caminho={caminho}
      hashtags={t1 ? hashtags('primeiroTurno') : hashtags('apuracao')}
      nomeArquivo={`sintonia-${race.id}`}
      simulado={simulado && !t1}
      carregando={!resumo}
      cartao={resumo ? (f) => <ShareCard race={race} resumo={resumo} formato={f} simulado={simulado && !t1} caminho={caminho} /> : undefined}
    />
  );
}
