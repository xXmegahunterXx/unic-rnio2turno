/**
 * /teste — Teste Cego (formato v2: afirmações únicas com escala de concordância).
 * Sem `?s=`: abertura, com a primeira afirmação já respondível (um toque e o teste começa).
 * Com `?s=<semente>`: as 24 afirmações (ou 12, no modo rápido: `&r=1`), uma por tela, na ordem determinada pela
 * semente (a mesma URL reproduz a mesma ordem). O progresso fica só nesta aba (sessionStorage) e é retomado de onde
 * parou. Ao terminar, vai para /teste/resultado#<código> — as respostas nunca saem do navegador.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Resposta } from '@/app/content/afirmacoes';
import { Container } from '@/app/components/layout/Container';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { AfirmacaoEntrada } from '@/app/components/pages/teste/AfirmacaoEntrada';
import { caminhoResultado, caminhoTeste, novaSemente, textoParaSemente } from '@/app/components/pages/teste/codigo';
import { Fato, IntroTeste, MINUTOS_TESTE, N_AFIRMACOES } from '@/app/components/pages/teste/IntroTeste';
import { Quiz, type EstadoQuiz } from '@/app/components/pages/teste/Quiz';
import { apagarProgresso, concluidas, gravarProgresso, lerProgresso, type MapaRespostas, type Progresso } from '@/app/components/pages/teste/sessao';
import { minutosEstimados, N_RAPIDO, ordemQuiz, selecaoRapida } from '@/app/components/pages/teste/sintonia';
import { Badge } from '@/app/ui/Badge';
import { Button } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { toast } from '@/app/ui/Toast';

export default function TestePage() {
  const [params] = useSearchParams();
  const seed = textoParaSemente(params.get('s'));
  const rapidoUrl = params.get('r') === '1';
  useTitulo(seed === null ? 'Teste Cego' : 'Teste Cego · em andamento');
  return seed === null ? <Abertura /> : <Rodadas key={`${seed}-${rapidoUrl}`} seed={seed} rapidoUrl={rapidoUrl} />;
}

/** Afirmações do progresso salvo (as 12 do modo rápido ou todas). */
const idsDo = (p: Pick<Progresso, 'seed' | 'rapido'>) => (p.rapido ? selecaoRapida(p.seed) : null);

function Abertura() {
  const navigate = useNavigate();
  const salvo = useMemo(() => lerProgresso(), []);
  const ids = salvo ? idsDo(salvo) : null;
  const totalSalvo = ids ? ids.length : N_AFIRMACOES;
  const feitas = salvo ? concluidas(salvo.respostas, ids ?? undefined) : 0;
  const terminado = !!salvo && feitas === totalSalvo;
  const emAndamento = !!salvo && feitas > 0 && !terminado;

  // A afirmação da vitrine: a próxima do teste em andamento, ou a primeira de um teste novo (semente sorteada agora).
  const vitrine = useMemo(() => {
    if (emAndamento && salvo) {
      const ordem = ordemQuiz(salvo.seed, ids);
      const i = Math.max(0, ordem.findIndex((a) => salvo.respostas[a.id] === undefined));
      return { seed: salvo.seed, rapido: !!salvo.rapido, ordem, i };
    }
    const seed = novaSemente();
    return { seed, rapido: false, ordem: ordemQuiz(seed), i: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function comecar(rapido = false) {
    apagarProgresso();
    navigate(caminhoTeste(novaSemente(), rapido));
  }

  function responderVitrine(r: Resposta) {
    const a = vitrine.ordem[vitrine.i];
    const base = emAndamento && salvo ? salvo : { seed: vitrine.seed, respostas: {}, importantes: [] as string[], idx: 0 };
    gravarProgresso({
      seed: vitrine.seed,
      respostas: { ...base.respostas, [a.id]: r },
      importantes: base.importantes,
      idx: Math.min(vitrine.ordem.length - 1, vitrine.i + 1),
      ...(vitrine.rapido ? { rapido: true } : {}),
    });
    navigate(caminhoTeste(vitrine.seed, vitrine.rapido));
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
        subtitulo={`${N_AFIRMACOES} afirmações sobre o país, sem nomes nem partidos. Diga o quanto concorda e descubra com qual programa de governo você tem mais sintonia.`}
        vitrine={
          <AfirmacaoEntrada
            afirmacao={vitrine.ordem[vitrine.i]}
            numero={vitrine.i + 1}
            total={vitrine.ordem.length}
            onResponder={responderVitrine}
            chamada={emAndamento ? 'Continue de onde parou' : 'Comece agora: responda a primeira'}
          />
        }
        acoes={
          <>
            {emAndamento && salvo ? (
              <Button variant="primary" size="lg" iconRight="seta" onClick={() => navigate(caminhoTeste(salvo.seed, !!salvo.rapido))} className="w-full sm:w-auto">
                <span>
                  Continuar · <span className="num">{feitas}</span>/<span className="num">{totalSalvo}</span>
                </span>
              </Button>
            ) : null}
            {salvo && terminado ? (
              <Button
                variant="primary"
                size="lg"
                icon="selo"
                onClick={() => navigate(caminhoResultado(salvo.seed, salvo.respostas, salvo.importantes))}
                className="w-full sm:w-auto"
              >
                Ver meu resultado
              </Button>
            ) : null}
            <Button
              variant={emAndamento || terminado ? 'secondary' : 'primary'}
              size="lg"
              iconRight={emAndamento || terminado ? undefined : 'seta'}
              icon={emAndamento || terminado ? 'reset' : undefined}
              onClick={() => comecar()}
              className="w-full sm:w-auto"
            >
              {emAndamento || terminado ? 'Começar de novo' : 'Começar o teste'}
            </Button>
            <Button variant="ghost" size="lg" icon="rapido" onClick={() => comecar(true)} className="w-full sm:w-auto" data-acao="modo-rapido">
              <span>
                Modo rápido · <span className="num">{N_RAPIDO}</span> afirmações
              </span>
            </Button>
          </>
        }
        fatos={
          <>
            <Fato icone="relogio">
              ≈ <span className="num">{MINUTOS_TESTE}</span> min (rápido: <span className="num">{minutosEstimados(N_RAPIDO)}</span>)
            </Fato>
            <Fato icone="usuarios">Sem cadastro</Fato>
            <Fato icone="olho-fechado">Nada sai do seu aparelho</Fato>
          </>
        }
        extra={
          <p className="flex items-start gap-2 text-[13px] leading-snug text-fg-subtle">
            <Icon name="info" size={15} className="mt-px shrink-0" />
            Ordem sorteada. O modo rápido tem uma afirmação de cada tema; dá para completar as outras depois.
          </p>
        }
      />
    </Container>
  );
}

function Rodadas({ seed, rapidoUrl }: { seed: number; rapidoUrl: boolean }) {
  const navigate = useNavigate();
  const salvo = useMemo(() => lerProgresso(seed), [seed]);
  // Modo rápido pela URL ou pelo progresso salvo desta semente (ex.: "Continuar" vindo da Home).
  const rapido = rapidoUrl || !!salvo?.rapido;
  const ids = useMemo(() => (rapido ? selecaoRapida(seed) : null), [rapido, seed]);
  const total = ids ? ids.length : N_AFIRMACOES;

  // Retomada: avisa discretamente que o teste continua de onde parou.
  useEffect(() => {
    const feitas = salvo ? concluidas(salvo.respostas, ids ?? undefined) : 0;
    if (feitas > 1 && feitas < total) toast(`Retomando de onde você parou: ${feitas} de ${total}`, { icon: 'reset' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onProgresso = useCallback((e: EstadoQuiz) => gravarProgresso({ seed, ...e, ...(rapido ? { rapido: true } : {}) }), [seed, rapido]);
  const onConcluir = useCallback(
    (respostas: MapaRespostas, importantes: string[]) => {
      gravarProgresso({ seed, respostas, importantes, idx: total - 1, ...(rapido ? { rapido: true } : {}) });
      navigate(caminhoResultado(seed, respostas, importantes));
    },
    [seed, navigate, total, rapido],
  );
  return (
    <Container className="pb-2 pt-0 sm:pt-4">
      <Quiz
        seed={seed}
        ids={ids}
        inicial={salvo}
        onProgresso={onProgresso}
        onConcluir={onConcluir}
        onSair={() => navigate('/teste')}
        selo={rapido ? <Badge tone="neutral" size="xs" icon="rapido">Rápido</Badge> : undefined}
      />
    </Container>
  );
}
