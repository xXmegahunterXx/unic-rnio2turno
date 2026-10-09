/**
 * /teste — Teste Cego. Sem `?s=`: abertura. Com `?s=<semente>`: as 12 rodadas, na ordem determinada pela
 * semente (a mesma URL reproduz a mesma ordem). O progresso fica só nesta aba (sessionStorage).
 * Ao terminar, vai para /teste/resultado#<código> — as respostas nunca saem do navegador.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '@/app/components/layout/Container';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { caminhoResultado, caminhoTeste, novaSemente, textoParaSemente, type Escolha } from '@/app/components/pages/teste/codigo';
import { IntroTeste } from '@/app/components/pages/teste/IntroTeste';
import { Quiz } from '@/app/components/pages/teste/Quiz';
import { apagarProgresso, gravarProgresso, lerProgresso, respondidas, type Parcial } from '@/app/components/pages/teste/sessao';
import { Badge } from '@/app/ui/Badge';
import { Button } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';

export default function TestePage() {
  const [params] = useSearchParams();
  const seed = textoParaSemente(params.get('s'));
  useTitulo(seed === null ? 'Teste Cego' : 'Teste Cego · em andamento');
  return seed === null ? <Abertura /> : <Rodadas key={seed} seed={seed} />;
}

function Abertura() {
  const navigate = useNavigate();
  const salvo = useMemo(() => lerProgresso(), []);
  const feitas = salvo ? respondidas(salvo.respostas) : 0;
  const completo = salvo && feitas === salvo.respostas.length;

  function comecar() {
    apagarProgresso();
    navigate(caminhoTeste(novaSemente()));
  }

  return (
    <Container className="pb-6">
      <IntroTeste
        eyebrow={
          <Badge tone="brand" size="md" icon="olho-fechado" caps>
            Teste Cego · 2º turno
          </Badge>
        }
        titulo={
          <>
            Escolha propostas,
            <br className="hidden sm:block" /> <span className="text-grad">não candidatos.</span>
          </>
        }
        subtitulo="Em cada tema, duas propostas reais dos programas de governo dos dois candidatos à Presidência, sem nenhuma pista de quem é quem. No fim, você descobre com quem está mais em sintonia."
        acoes={
          <>
            <Button variant="primary" size="lg" iconRight="seta" onClick={comecar} className="w-full sm:w-auto">
              {salvo && feitas > 0 ? 'Começar de novo' : 'Começar o teste'}
            </Button>
            {salvo && feitas > 0 && !completo ? (
              <Button variant="secondary" size="lg" onClick={() => navigate(caminhoTeste(salvo.seed))} className="w-full sm:w-auto">
                Continuar · <span className="num">{feitas}</span>/<span className="num">{salvo.respostas.length}</span>
              </Button>
            ) : null}
            {salvo && completo ? (
              <Button
                variant="secondary"
                size="lg"
                icon="selo"
                onClick={() => navigate(caminhoResultado(salvo.seed, salvo.respostas as Escolha[]))}
                className="w-full sm:w-auto"
              >
                Ver meu resultado
              </Button>
            ) : null}
          </>
        }
        extra={
          <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
            <Icon name="info" size={15} />
            Sem cadastro e sem login. As propostas aparecem em ordem sorteada.
          </p>
        }
      />
    </Container>
  );
}

function Rodadas({ seed }: { seed: number }) {
  const navigate = useNavigate();
  const salvo = useMemo(() => lerProgresso(seed), [seed]);
  const onProgresso = useCallback((respostas: Parcial, idx: number) => gravarProgresso({ seed, respostas, idx }), [seed]);
  const onConcluir = useCallback(
    (respostas: Escolha[]) => {
      gravarProgresso({ seed, respostas, idx: respostas.length - 1 });
      navigate(caminhoResultado(seed, respostas));
    },
    [seed, navigate],
  );
  return (
    <Container className="pb-4 pt-4 sm:pt-8">
      <Quiz seed={seed} inicial={salvo?.respostas} inicialIdx={salvo?.idx} onProgresso={onProgresso} onConcluir={onConcluir} onSair={() => navigate('/teste')} />
    </Container>
  );
}
