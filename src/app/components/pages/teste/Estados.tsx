/**
 * Telas de estado do Teste Cego: link sem resultado, link de uma versão anterior do teste (formato de pares)
 * e "pulou todas". Sempre com o caminho de volta para o teste — nunca uma tela quebrada.
 */
import type { ReactNode } from 'react';
import { Container } from '@/app/components/layout/Container';
import { EmptyState } from '@/app/components/apuracao/States';
import { ButtonLink } from '@/app/ui/Button';
import type { IconName } from '@/app/ui/Icon';

function Cartao({ icone, titulo, texto, acao }: { icone: IconName; titulo: ReactNode; texto: ReactNode; acao?: ReactNode }) {
  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto max-w-lg rounded-3xl border border-line bg-surface shadow-card">
        <EmptyState
          icon={icone}
          title={titulo}
          description={texto}
          action={
            acao ?? (
              <ButtonLink to="/teste" variant="primary" iconRight="seta">
                Fazer o Teste Cego
              </ButtonLink>
            )
          }
        />
      </div>
    </Container>
  );
}

export function SemResultado() {
  return (
    <Cartao
      icone="olho-fechado"
      titulo="Nenhum resultado neste link"
      texto="O resultado do Teste Cego fica só no próprio link, depois do “#”. Este parece incompleto — faça o teste em uns 3 minutos."
    />
  );
}

/** Link do formato antigo (pares de propostas): não quebra, explica e convida a refazer. */
export function VersaoAnterior({ duelo }: { duelo?: boolean }) {
  return (
    <Cartao
      icone="reset"
      titulo={duelo ? 'Este desafio é de uma versão anterior do teste' : 'Este resultado é de uma versão anterior do teste'}
      texto={
        <>
          O Teste Cego mudou: agora são afirmações únicas, em que você diz o quanto concorda, em vez de pares de propostas. Links antigos
          não podem ser convertidos — {duelo ? 'faça o teste novo e desafie a pessoa de volta.' : 'refaça o teste para ver seu resultado.'}
        </>
      }
      acao={
        <ButtonLink to="/teste" variant="primary" icon="reset">
          Refazer o teste
        </ButtonLink>
      }
    />
  );
}

export function DesafioInvalido() {
  return (
    <Cartao
      icone="usuarios"
      titulo="Este link de desafio está incompleto"
      texto="As respostas de quem te desafiou viajam no próprio link, depois do “#”. Peça o link de novo — ou faça o teste e desafie alguém."
    />
  );
}
