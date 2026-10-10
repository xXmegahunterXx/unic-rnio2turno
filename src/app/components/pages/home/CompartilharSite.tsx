/**
 * "Compartilhar o Sintonia": o sheet do kit com o cartão-convite (data da apuração, quanto falta, o que há no site),
 * o texto neutro e o link da Home. Carregado sob demanda (acoesGlobais.tsx) — fora do JS inicial.
 */
import { useMemo } from 'react';
import { CompartilharSheet } from '@/app/components/share';
import { CartaoConvite } from './CartaoConvite';
import { HASHTAGS_HOME, textoConviteSite } from './textosHome';

export default function CompartilharSite({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  // Relógio de parede (nunca o simulado): o convite fala da data REAL da apuração.
  const agora = useMemo(() => Date.now(), [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <CompartilharSheet
      aberto={aberto}
      onFechar={onFechar}
      titulo="Compartilhar o Sintonia"
      descricao="Convite com a data da apuração e o Teste Cego. Sem números e sem candidatos."
      texto={textoConviteSite(agora)}
      caminho="/"
      hashtags={HASHTAGS_HOME}
      nomeArquivo="sintonia-apuracao-25-outubro"
      cartao={(f) => <CartaoConvite formato={f} agora={agora} />}
    />
  );
}
