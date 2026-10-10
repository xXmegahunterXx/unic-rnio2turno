/**
 * /duelo/:codigo — Duelo do Teste Cego (formato v2). "Alguém te desafiou" (sem nome): a pessoa responde ao MESMO
 * teste (mesma semente ⇒ mesma ordem das afirmações) e depois compara: em quantas afirmações ficaram do mesmo
 * lado, a afinidade entre as duas (mesma fórmula do teste, entre respostas) e a sintonia de cada uma com os
 * candidatos. As respostas de quem desafiou chegam depois do "#" do link; as de quem responde ficam só nesta
 * aba (sessionStorage). Nada sai do navegador. Links do formato antigo caem numa tela amigável.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AFIRMACOES, calcularSintonia, ordemDoTeste, type Resposta } from '@/app/content/afirmacoes';
import { Container } from '@/app/components/layout/Container';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { ListaAfirmacoes, TituloSecao, type LinhaAfirmacao } from '@/app/components/pages/teste/AfirmacaoAAfirmacao';
import { useCandidatosTeste } from '@/app/components/pages/teste/candidatos';
import { caminhoResultado, codificar, ehDueloV1, lerDuelo } from '@/app/components/pages/teste/codigo';
import { AfinidadeEntreVoces, PlacarConcordancia, SintoniaEmBarras } from '@/app/components/pages/teste/ComparacaoDuelo';
import { DesafiarAmigo } from '@/app/components/pages/teste/Compartilhar';
import { DesafioInvalido, VersaoAnterior } from '@/app/components/pages/teste/Estados';
import { Aviso, IntroTeste, N_AFIRMACOES } from '@/app/components/pages/teste/IntroTeste';
import { Quiz, type EstadoQuiz } from '@/app/components/pages/teste/Quiz';
import { useRevelado } from '@/app/components/pages/teste/Revelacao';
import { apagarDuelo, completo, concluidas, gravarDuelo, lerDuelo as lerRespostasDuelo, type MapaRespostas } from '@/app/components/pages/teste/sessao';
import { compararDuelo, frasesConcordancia } from '@/app/components/pages/teste/sintonia';
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
  const salvo = useMemo(() => lerRespostasDuelo(chave), [chave]);
  const terminado = !!salvo && completo(salvo.respostas);
  const [etapa, setEtapa] = useState<Etapa>(terminado ? 'comparacao' : 'convite');
  const [minhas, setMinhas] = useState<Minhas | null>(terminado ? { respostas: salvo!.respostas, importantes: salvo!.importantes } : null);
  const reduzir = useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduzir ? 'auto' : 'smooth' });
  }, [etapa, reduzir]);

  const onProgresso = useCallback((e: EstadoQuiz) => gravarDuelo(chave, { seed, ...e }), [chave, seed]);
  const onConcluir = useCallback(
    (respostas: MapaRespostas, importantes: string[]) => {
      gravarDuelo(chave, { seed, respostas, importantes, idx: N_AFIRMACOES - 1 });
      setMinhas({ respostas, importantes });
      setEtapa('comparacao');
    },
    [chave, seed],
  );

  if (etapa === 'teste') {
    return (
      <Container className="pb-2 pt-3 sm:pt-6">
        <div className="mb-2 flex justify-center sm:mb-3">
          <Badge tone="brand" size="sm" icon="usuarios" caps>
            Duelo · mesmas {N_AFIRMACOES} afirmações
          </Badge>
        </div>
        <Quiz seed={seed} inicial={salvo} onProgresso={onProgresso} onConcluir={onConcluir} onSair={() => setEtapa('convite')} />
      </Container>
    );
  }
  if (etapa === 'comparacao' && minhas) {
    return (
      <Comparacao
        seed={seed}
        minhas={minhas}
        delas={delas}
        importantesDelas={importantesDelas}
        onRefazer={() => {
          apagarDuelo(chave);
          setMinhas(null);
          setEtapa('teste');
        }}
      />
    );
  }
  const feitas = salvo ? concluidas(salvo.respostas) : 0;
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
        subtitulo={`Responda às mesmas ${N_AFIRMACOES} afirmações, na mesma ordem, dizendo o quanto concorda com cada uma — sem saber de quem são as ideias nem o que a outra pessoa respondeu. No fim, vocês comparam.`}
        acoes={
          <Button variant="primary" size="lg" iconRight="seta" onClick={() => setEtapa('teste')} className="w-full sm:w-auto">
            {feitas > 0 ? (
              <>
                Continuar · <span className="num">{feitas}</span>/<span className="num">{N_AFIRMACOES}</span>
              </>
            ) : (
              'Aceitar o desafio'
            )}
          </Button>
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
            texto: `As ${N_AFIRMACOES} afirmações aparecem exatamente como apareceram para a outra pessoa.`,
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
  seed,
  minhas,
  delas,
  importantesDelas,
  onRefazer,
}: {
  seed: number;
  minhas: Minhas;
  delas: MapaRespostas;
  importantesDelas: string[];
  onRefazer: () => void;
}) {
  const navigate = useNavigate();
  const { lista, porNumero, fotos } = useCandidatosTeste();
  const minha = useMemo(() => calcularSintonia(minhas.respostas, minhas.importantes), [minhas]);
  const outra = useMemo(() => calcularSintonia(delas, importantesDelas), [delas, importantesDelas]);
  const ordem = useMemo(() => ordemDoTeste(seed), [seed]);
  const comp = useMemo(() => compararDuelo(minhas.respostas, delas, ordem), [minhas, delas, ordem]);
  const revelado = useRevelado(400);
  const reduzir = useReducedMotion();
  const linhas = useMemo<LinhaAfirmacao[]>(() => {
    const porId = new Map(comp.itens.map((i) => [i.afirmacao.id, i]));
    const imp = new Set(minhas.importantes);
    return AFIRMACOES.map((af) => {
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
            <PlacarConcordancia id="titulo-duelo" comp={comp} revelado={revelado} />
          </div>
          <motion.p
            initial={reduzir ? false : { opacity: 0 }}
            animate={{ opacity: revelado ? 1 : 0 }}
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
              variant="primary"
              size="lg"
              icon="selo"
              onClick={() => navigate(caminhoResultado(seed, minhas.respostas, minhas.importantes))}
              className="w-full sm:w-auto"
            >
              Ver meu resultado completo
            </Button>
            <DesafiarAmigo seed={seed} respostas={minhas.respostas} importantes={minhas.importantes} label="Desafiar outra pessoa" className="w-full sm:w-auto" />
            <Button variant="ghost" size="lg" icon="reset" onClick={onRefazer} className="w-full sm:w-auto">
              Responder de novo
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="duelo-afirmacoes" className="mt-10 sm:mt-14">
        <TituloSecao id="duelo-afirmacoes" titulo="Afirmação a afirmação">
          O que cada um respondeu e a posição documentada de cada candidato. Abra uma afirmação para ver o trecho do programa e a fonte.
        </TituloSecao>
        <div className="mt-4">
          <ListaAfirmacoes linhas={linhas} porNumero={porNumero} lista={lista} fotos={fotos} duelo />
        </div>
      </section>

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
