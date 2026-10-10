/**
 * /duelo/:codigo — Duelo do Teste Cego (formato v2). "Alguém te desafiou" (sem nome): a pessoa responde ao MESMO
 * teste (mesma semente ⇒ mesma ordem; se quem desafiou fez o modo rápido, as mesmas 12 afirmações) e depois compara:
 * em quantas afirmações ficaram do mesmo lado, a afinidade entre as duas (mesma fórmula do teste, entre respostas) e a
 * sintonia de cada uma com os candidatos. As respostas de quem desafiou chegam depois do "#" do link; as de quem
 * responde ficam só nesta aba (sessionStorage). Nada sai do navegador. Links do formato antigo caem numa tela amigável.
 *
 * Para quem chega pelo X: a abertura já traz a primeira afirmação respondível; o placar final ("concordamos em N de M")
 * vira um cartão para postar — só o placar entre as duas pessoas, nunca a sintonia de quem desafiou com candidatos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AFIRMACOES, calcularSintonia, type Resposta } from '@/app/content/afirmacoes';
import { Container } from '@/app/components/layout/Container';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { AfirmacaoEntrada } from '@/app/components/pages/teste/AfirmacaoEntrada';
import { ListaAfirmacoes, TituloSecao, type LinhaAfirmacao } from '@/app/components/pages/teste/AfirmacaoAAfirmacao';
import { useCandidatosTeste } from '@/app/components/pages/teste/candidatos';
import { caminhoResultado, codificar, ehDueloV1, lerDuelo } from '@/app/components/pages/teste/codigo';
import { AfinidadeEntreVoces, PlacarConcordancia, SintoniaEmBarras } from '@/app/components/pages/teste/ComparacaoDuelo';
import { PainelDuelo, PainelResultadoDuelo } from '@/app/components/pages/teste/Compartilhar';
import { DesafioInvalido, VersaoAnterior } from '@/app/components/pages/teste/Estados';
import { Aviso, Fato, IntroTeste } from '@/app/components/pages/teste/IntroTeste';
import { Quiz, type EstadoQuiz } from '@/app/components/pages/teste/Quiz';
import { useRevelacao } from '@/app/components/pages/teste/Revelacao';
import { apagarDuelo, completo, concluidas, gravarDuelo, lerDuelo as lerRespostasDuelo, type MapaRespostas } from '@/app/components/pages/teste/sessao';
import { compararDuelo, conjuntoRespondido, frasesConcordancia, minutosEstimados, ordemQuiz } from '@/app/components/pages/teste/sintonia';
import { Badge, Button } from '@/app/ui';

type Etapa = 'convite' | 'teste' | 'comparacao';

export default function DueloPage() {
  const { codigo } = useParams();
  const { hash } = useLocation();
  const desafio = useMemo(() => lerDuelo(codigo, hash), [codigo, hash]);
  useTitulo('Duelo · Teste Cego');
  if (!desafio) return ehDueloV1(codigo, hash) ? <VersaoAnterior duelo /> : <DesafioInvalido />;
  const chave = codificar(desafio.seed, desafio.respostas, desafio.importantes);
  return <Duelo key={chave} chave={chave} seed={desafio.seed} delas={desafio.respostas} importantesDelas={desafio.importantes} />;
}

interface Minhas {
  respostas: MapaRespostas;
  importantes: string[];
}

function Duelo({ chave, seed, delas, importantesDelas }: { chave: string; seed: number; delas: MapaRespostas; importantesDelas: string[] }) {
  // As afirmações do duelo: as que quem desafiou recebeu (24, ou as 12 do modo rápido).
  const { rapido, ids } = useMemo(() => conjuntoRespondido(delas), [delas]);
  const idsQuiz = rapido ? ids : null;
  const n = ids.length;
  const ordem = useMemo(() => ordemQuiz(seed, idsQuiz), [seed, idsQuiz]);
  const [salvo, setSalvo] = useState(() => lerRespostasDuelo(chave));
  const terminado = !!salvo && completo(salvo.respostas, ids);
  const [etapa, setEtapa] = useState<Etapa>(terminado ? 'comparacao' : 'convite');
  const [minhas, setMinhas] = useState<Minhas | null>(terminado ? { respostas: salvo!.respostas, importantes: salvo!.importantes } : null);
  const reduzir = useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduzir ? 'auto' : 'smooth' });
  }, [etapa, reduzir]);

  const onProgresso = useCallback((e: EstadoQuiz) => gravarDuelo(chave, { seed, ...e }), [chave, seed]);
  const onConcluir = useCallback(
    (respostas: MapaRespostas, importantes: string[]) => {
      gravarDuelo(chave, { seed, respostas, importantes, idx: n - 1 });
      setMinhas({ respostas, importantes });
      setEtapa('comparacao');
    },
    [chave, seed, n],
  );

  if (etapa === 'teste') {
    return (
      <Container className="pb-2 pt-0 sm:pt-4">
        <Quiz
          seed={seed}
          ids={idsQuiz}
          inicial={salvo}
          onProgresso={onProgresso}
          onConcluir={onConcluir}
          onSair={() => {
            setSalvo(lerRespostasDuelo(chave));
            setEtapa('convite');
          }}
          selo={
            <Badge tone="brand" size="xs" icon="usuarios">
              Duelo
            </Badge>
          }
        />
      </Container>
    );
  }
  if (etapa === 'comparacao' && minhas) {
    return (
      <Comparacao
        chave={chave}
        seed={seed}
        ids={ids}
        rapido={rapido}
        minhas={minhas}
        delas={delas}
        importantesDelas={importantesDelas}
        onRefazer={() => {
          apagarDuelo(chave);
          setSalvo(null);
          setMinhas(null);
          setEtapa('teste');
        }}
      />
    );
  }

  const feitas = salvo ? concluidas(salvo.respostas, ids) : 0;
  const proxima = Math.max(0, ordem.findIndex((a) => salvo?.respostas[a.id] === undefined));

  function responderVitrine(r: Resposta) {
    const a = ordem[proxima];
    const novo = {
      seed,
      respostas: { ...(salvo?.respostas ?? {}), [a.id]: r },
      importantes: salvo?.importantes ?? [],
      idx: Math.min(ordem.length - 1, proxima + 1),
    };
    gravarDuelo(chave, novo);
    setSalvo(novo);
    setEtapa('teste');
  }

  return (
    <Container className="pb-6">
      <IntroTeste
        eyebrow={
          <Badge tone="brand" size="md" icon="usuarios" caps>
            Duelo · Teste Cego
          </Badge>
        }
        titulo={
          <>
            Alguém te <span className="text-grad">desafiou.</span>
          </>
        }
        subtitulo={`Quanto vocês concordam? Responda às mesmas ${n} afirmações, sem saber de quem são as ideias nem o que a outra pessoa respondeu. No fim, vocês comparam.`}
        vitrine={
          <AfirmacaoEntrada
            afirmacao={ordem[proxima]}
            numero={proxima + 1}
            total={ordem.length}
            onResponder={responderVitrine}
            chamada={feitas > 0 ? 'Continue de onde parou' : 'Aceite respondendo a primeira'}
          />
        }
        acoes={
          <Button variant="primary" size="lg" iconRight="seta" onClick={() => setEtapa('teste')} className="w-full sm:w-auto">
            {feitas > 0 ? (
              <span>
                Continuar · <span className="num">{feitas}</span>/<span className="num">{n}</span>
              </span>
            ) : (
              'Aceitar o desafio'
            )}
          </Button>
        }
        fatos={
          <>
            <Fato icone="lista">
              <span className="num">{n}</span> afirmações{rapido ? ' (modo rápido)' : ''}
            </Fato>
            <Fato icone="relogio">
              ≈ <span className="num">{minutosEstimados(n)}</span> min
            </Fato>
            <Fato icone="olho-fechado">Nada sai do seu aparelho</Fato>
          </>
        }
        passos={[
          {
            icone: 'olho-fechado',
            titulo: 'Responda sem saber',
            texto: 'Você não vê de quem são as ideias nem as respostas de quem te desafiou enquanto responde.',
          },
          {
            icone: 'check-circulo',
            titulo: 'Mesmo teste, mesma ordem',
            texto: `As ${n} afirmações aparecem exatamente como apareceram para a outra pessoa.`,
          },
          {
            icone: 'usuarios',
            titulo: 'Compare lado a lado',
            texto: 'Em quantas ficaram do mesmo lado, a afinidade entre vocês e a sintonia de cada um com os candidatos.',
          },
        ]}
      />
    </Container>
  );
}

function Comparacao({
  chave,
  seed,
  ids,
  rapido,
  minhas,
  delas,
  importantesDelas,
  onRefazer,
}: {
  chave: string;
  seed: number;
  ids: string[];
  rapido: boolean;
  minhas: Minhas;
  delas: MapaRespostas;
  importantesDelas: string[];
  onRefazer: () => void;
}) {
  const navigate = useNavigate();
  const { lista, porNumero, fotos } = useCandidatosTeste();
  const minha = useMemo(() => calcularSintonia(minhas.respostas, minhas.importantes), [minhas]);
  const outra = useMemo(() => calcularSintonia(delas, importantesDelas), [delas, importantesDelas]);
  const ordem = useMemo(() => ordemQuiz(seed, rapido ? ids : null), [seed, rapido, ids]);
  const comp = useMemo(() => compararDuelo(minhas.respostas, delas, ordem), [minhas, delas, ordem]);
  const { fase, revelar, revelado, analisando } = useRevelacao(`duelo:${chave}:${codificar(seed, minhas.respostas, minhas.importantes)}`);
  const reduzir = useReducedMotion();
  const linhas = useMemo<LinhaAfirmacao[]>(() => {
    const porId = new Map(comp.itens.map((i) => [i.afirmacao.id, i]));
    const imp = new Set(minhas.importantes);
    return AFIRMACOES.filter((af) => porId.has(af.id)).map((af) => {
      const it = porId.get(af.id)!;
      return {
        afirmacao: af,
        minha: (minhas.respostas[af.id] ?? null) as Resposta | null,
        outra: it.outra,
        importante: imp.has(af.id),
        comparavel: it.comparavel,
        mesmoLado: it.mesmoLado,
      };
    });
  }, [comp, minhas]);

  return (
    <Container className="pb-4 pt-4 sm:pt-8">
      <section aria-labelledby="titulo-duelo" className="relative overflow-hidden rounded-[28px] border border-line bg-surface px-4 pb-6 pt-6 shadow-card sm:px-10 sm:pb-10 sm:pt-10">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[-140px] h-[320px] w-[620px] -translate-x-1/2 rounded-full bg-brand/15 blur-[80px]" />
          <div className="absolute inset-0 bg-noise opacity-60" />
        </div>
        <div className="relative">
          <div className="flex justify-center">
            <Badge tone="brand" size="sm" icon="usuarios" caps>
              Duelo · resultado
            </Badge>
          </div>
          <div className="mt-5 sm:mt-7">
            <PlacarConcordancia id="titulo-duelo" comp={comp} revelado={revelado} analisando={analisando} />
          </div>

          {fase === 'pronto' ? (
            <div className="mx-auto mt-6 flex max-w-[420px] flex-col items-center">
              <Button variant="primary" size="lg" icon="usuarios" onClick={revelar} className="w-full shadow-glow" data-acao="revelar-duelo">
                Ver em quantas concordamos
              </Button>
              <p className="mt-3 text-center text-[12.5px] leading-snug text-fg-subtle">A comparação é feita aqui no seu aparelho.</p>
            </div>
          ) : null}

          {revelado ? (
            <>
              <motion.p
                initial={reduzir ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduzir ? 0 : 1 }}
                className="mx-auto mt-5 max-w-[34rem] text-balance text-center text-[14.5px] leading-relaxed text-fg-muted sm:text-[16px]"
              >
                {frasesConcordancia(comp.iguais, comp.emComum)} “Concordar” aqui é ficar do mesmo lado da escala.
              </motion.p>

              <div className="mt-6 sm:mt-8">
                <AfinidadeEntreVoces comp={comp} revelado={revelado} />
              </div>

              <div className="mx-auto mt-4 grid max-w-[760px] grid-cols-1 gap-3 sm:mt-6 md:grid-cols-2 md:gap-4">
                <SintoniaEmBarras titulo="Você" resultado={minha} candidatos={lista} fotos={fotos} revelado={revelado} destaque />
                <SintoniaEmBarras titulo="Quem te desafiou" resultado={outra} candidatos={lista} fotos={fotos} revelado={revelado} />
              </div>

              <div className="mx-auto mt-7 flex max-w-[760px] flex-col gap-2.5 sm:mt-9 sm:flex-row sm:justify-center">
                <Button
                  variant="secondary"
                  size="lg"
                  icon="selo"
                  onClick={() => navigate(caminhoResultado(seed, minhas.respostas, minhas.importantes))}
                  className="w-full sm:w-auto"
                >
                  Ver meu resultado completo
                </Button>
                <Button variant="ghost" size="lg" icon="reset" onClick={onRefazer} className="w-full sm:w-auto">
                  Responder de novo
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {revelado ? (
        <motion.div initial={reduzir ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: reduzir ? 0 : 0.8 }}>
          <div className="mt-4 grid grid-cols-1 gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
            <PainelResultadoDuelo comp={comp} />
            <PainelDuelo seed={seed} respostas={minhas.respostas} importantes={minhas.importantes} n={ids.length} titulo="Desafie outra pessoa" />
          </div>

          <section aria-labelledby="duelo-afirmacoes" className="mt-10 sm:mt-14">
            <TituloSecao id="duelo-afirmacoes" titulo="Afirmação a afirmação">
              O que cada um respondeu e a posição documentada de cada candidato. Abra uma afirmação para ver o trecho do programa e a fonte.
            </TituloSecao>
            <div className="mt-4">
              <ListaAfirmacoes linhas={linhas} porNumero={porNumero} lista={lista} fotos={fotos} duelo />
            </div>
          </section>
        </motion.div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <Aviso icone="olho-fechado" titulo="Só entre vocês dois">
          A comparação é feita aqui no seu aparelho, com as respostas que vieram no link. Nenhuma resposta é enviada, somada ou guardada em
          servidor — o Sintonia não faz enquetes.
        </Aviso>
        <Aviso icone="info" titulo="Não é recomendação de voto">
          O teste compara respostas com o que está escrito nos programas de governo, não pessoas. Leia os documentos completos antes de
          decidir.
        </Aviso>
      </div>
    </Container>
  );
}
