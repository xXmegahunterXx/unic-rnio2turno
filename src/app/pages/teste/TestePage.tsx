/**
 * /teste — Teste Cego (formato v2: afirmações únicas com escala de concordância).
 * Sem `?s=`: abertura. Com `?s=<semente>`: as 24 afirmações, uma por tela, na ordem determinada pela semente
 * (a mesma URL reproduz a mesma ordem). O progresso fica só nesta aba (sessionStorage).
 * Ao terminar, vai para /teste/resultado#<código> — as respostas nunca saem do navegador.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '@/app/components/layout/Container';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { caminhoResultado, caminhoTeste, novaSemente, textoParaSemente } from '@/app/components/pages/teste/codigo';
import { IntroTeste, N_AFIRMACOES } from '@/app/components/pages/teste/IntroTeste';
import { Quiz, type EstadoQuiz } from '@/app/components/pages/teste/Quiz';
import { apagarProgresso, completo, concluidas, gravarProgresso, lerProgresso, type MapaRespostas } from '@/app/components/pages/teste/sessao';
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
  const feitas = salvo ? concluidas(salvo.respostas) : 0;
  const terminado = !!salvo && completo(salvo.respostas);

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
            Ideias primeiro,
            <br className="hidden sm:block" /> <span className="text-grad">candidatos depois.</span>
          </>
        }
        subtitulo={`${N_AFIRMACOES} afirmações sobre temas do país, uma por vez. Diga o quanto concorda com cada uma — no fim, comparamos suas respostas com o que os dois candidatos à Presidência defendem nos programas registrados no TSE.`}
        acoes={
          <>
            <Button variant="primary" size="lg" iconRight="seta" onClick={comecar} className="w-full sm:w-auto">
              {salvo && feitas > 0 ? 'Começar de novo' : 'Começar o teste'}
            </Button>
            {salvo && feitas > 0 && !terminado ? (
              <Button variant="secondary" size="lg" onClick={() => navigate(caminhoTeste(salvo.seed))} className="w-full sm:w-auto">
                Continuar · <span className="num">{feitas}</span>/<span className="num">{N_AFIRMACOES}</span>
              </Button>
            ) : null}
            {salvo && terminado ? (
              <Button
                variant="secondary"
                size="lg"
                icon="selo"
                onClick={() => navigate(caminhoResultado(salvo.seed, salvo.respostas, salvo.importantes))}
                className="w-full sm:w-auto"
              >
                Ver meu resultado
              </Button>
            ) : null}
          </>
        }
        extra={
          <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
            <Icon name="info" size={15} className="shrink-0" />
            Sem cadastro e sem login. As afirmações aparecem em ordem sorteada.
          </p>
        }
      />
    </Container>
  );
}

function Rodadas({ seed }: { seed: number }) {
  const navigate = useNavigate();
  const salvo = useMemo(() => lerProgresso(seed), [seed]);
  const onProgresso = useCallback((e: EstadoQuiz) => gravarProgresso({ seed, ...e }), [seed]);
  const onConcluir = useCallback(
    (respostas: MapaRespostas, importantes: string[]) => {
      gravarProgresso({ seed, respostas, importantes, idx: N_AFIRMACOES - 1 });
      navigate(caminhoResultado(seed, respostas, importantes));
    },
    [seed, navigate],
  );
  return (
    <Container className="pb-2 pt-3 sm:pt-6">
      <Quiz seed={seed} inicial={salvo} onProgresso={onProgresso} onConcluir={onConcluir} onSair={() => navigate('/teste')} />
    </Container>
  );
}
