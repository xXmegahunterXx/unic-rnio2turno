/**
 * /duelo/:codigo — Duelo do Teste Cego. "Alguém te desafiou" (sem nome): a pessoa responde ao MESMO teste
 * (mesma semente ⇒ mesma ordem e mesmos lados) e depois compara: em quantos temas concordaram e a sintonia
 * de cada um. As escolhas de quem desafiou chegam depois do "#" do link; as de quem responde ficam só nesta
 * aba (sessionStorage). Nada sai do navegador.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Container } from '@/app/components/layout/Container';
import { EmptyState } from '@/app/components/apuracao/States';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { useCandidatosTeste } from '@/app/components/pages/teste/candidatos';
import { caminhoResultado, codificar, lerDuelo, type Escolha } from '@/app/components/pages/teste/codigo';
import { DueloTemaATema, frasesConcordancia, PlacarConcordancia, SintoniaEmBarras } from '@/app/components/pages/teste/ComparacaoDuelo';
import { DesafiarAmigo } from '@/app/components/pages/teste/Compartilhar';
import { Aviso, IntroTeste } from '@/app/components/pages/teste/IntroTeste';
import { Quiz } from '@/app/components/pages/teste/Quiz';
import { useRevelado } from '@/app/components/pages/teste/Revelacao';
import { apagarDuelo, gravarDuelo, lerDuelo as lerRespostasDuelo, respondidas, type Parcial } from '@/app/components/pages/teste/sessao';
import { calcularSintonia, comparar } from '@/app/components/pages/teste/sintonia';
import { Badge, Button, ButtonLink } from '@/app/ui';

type Etapa = 'convite' | 'teste' | 'comparacao';

export default function DueloPage() {
  const { codigo } = useParams();
  const { hash } = useLocation();
  const desafio = useMemo(() => lerDuelo(codigo, hash), [codigo, hash]);
  useTitulo('Duelo · Teste Cego');
  if (!desafio) return <DesafioInvalido />;
  const chave = codificar(desafio.seed, desafio.respostas);
  return <Duelo key={chave} chave={chave} seed={desafio.seed} delas={desafio.respostas} />;
}

function DesafioInvalido() {
  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto max-w-lg rounded-3xl border border-line bg-surface shadow-card">
        <EmptyState
          icon="usuarios"
          title="Este link de desafio está incompleto"
          description="As escolhas de quem te desafiou viajam no próprio link, depois do “#”. Peça o link de novo — ou faça o teste e desafie alguém."
          action={
            <ButtonLink to="/teste" variant="primary" iconRight="seta">
              Fazer o Teste Cego
            </ButtonLink>
          }
        />
      </div>
    </Container>
  );
}

function Duelo({ chave, seed, delas }: { chave: string; seed: number; delas: Escolha[] }) {
  const salvo = useMemo(() => lerRespostasDuelo(chave), [chave]);
  const completo = !!salvo && respondidas(salvo.respostas) === salvo.respostas.length;
  const [etapa, setEtapa] = useState<Etapa>(completo ? 'comparacao' : 'convite');
  const [minhas, setMinhas] = useState<Escolha[] | null>(completo ? (salvo!.respostas as Escolha[]) : null);
  const reduzir = useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduzir ? 'auto' : 'smooth' });
  }, [etapa, reduzir]);

  const onProgresso = useCallback((respostas: Parcial, idx: number) => gravarDuelo(chave, { seed, respostas, idx }), [chave, seed]);
  const onConcluir = useCallback(
    (r: Escolha[]) => {
      gravarDuelo(chave, { seed, respostas: r, idx: r.length - 1 });
      setMinhas(r);
      setEtapa('comparacao');
    },
    [chave, seed],
  );

  if (etapa === 'teste') {
    return (
      <Container className="pb-4 pt-4 sm:pt-8">
        <div className="mb-3 flex justify-center sm:mb-4">
          <Badge tone="brand" size="sm" icon="usuarios" caps>
            Duelo · mesmas 12 escolhas
          </Badge>
        </div>
        <Quiz seed={seed} inicial={salvo?.respostas} inicialIdx={salvo?.idx} onProgresso={onProgresso} onConcluir={onConcluir} onSair={() => setEtapa('convite')} />
      </Container>
    );
  }
  if (etapa === 'comparacao' && minhas) {
    return (
      <Comparacao
        seed={seed}
        minhas={minhas}
        delas={delas}
        onRefazer={() => {
          apagarDuelo(chave);
          setMinhas(null);
          setEtapa('teste');
        }}
      />
    );
  }
  const feitas = salvo ? respondidas(salvo.respostas) : 0;
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
        subtitulo="Responda às mesmas 12 escolhas, na mesma ordem: duas propostas reais por tema, sem saber de quem são — nem o que a outra pessoa escolheu. No fim, vocês comparam."
        acoes={
          <Button variant="primary" size="lg" iconRight="seta" onClick={() => setEtapa('teste')} className="w-full sm:w-auto">
            {feitas > 0 ? (
              <>
                Continuar · <span className="num">{feitas}</span>/<span className="num">12</span>
              </>
            ) : (
              'Aceitar o desafio'
            )}
          </Button>
        }
        passos={[
          {
            icone: 'olho-fechado',
            titulo: 'Escolha sem saber',
            texto: 'Você não vê o nome dos candidatos nem as respostas de quem te desafiou enquanto responde.',
          },
          {
            icone: 'check-circulo',
            titulo: 'Mesmo teste, mesma ordem',
            texto: 'As 12 rodadas aparecem exatamente como apareceram para a outra pessoa.',
          },
          {
            icone: 'usuarios',
            titulo: 'Compare lado a lado',
            texto: 'Em quantos temas vocês escolheram igual, tema a tema, e a sintonia de cada um.',
          },
        ]}
      />
    </Container>
  );
}

function Comparacao({ seed, minhas, delas, onRefazer }: { seed: number; minhas: Escolha[]; delas: Escolha[]; onRefazer: () => void }) {
  const navigate = useNavigate();
  const { lista, porNumero } = useCandidatosTeste();
  const minha = useMemo(() => calcularSintonia(seed, minhas), [seed, minhas]);
  const outra = useMemo(() => calcularSintonia(seed, delas), [seed, delas]);
  const comp = useMemo(() => comparar(minha, outra), [minha, outra]);
  const revelado = useRevelado(400);
  const reduzir = useReducedMotion();

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
            {frasesConcordancia(comp.iguais, comp.total)}
          </motion.p>

          <div className="mx-auto mt-7 grid max-w-[760px] grid-cols-1 gap-3 sm:mt-9 md:grid-cols-2 md:gap-4">
            <SintoniaEmBarras titulo="Você" sintonia={minha} candidatos={lista} revelado={revelado} destaque />
            <SintoniaEmBarras titulo="Quem te desafiou" sintonia={outra} candidatos={lista} revelado={revelado} />
          </div>

          <div className="mx-auto mt-7 flex max-w-[760px] flex-col gap-2.5 sm:mt-9 sm:flex-row sm:justify-center">
            <Button variant="primary" size="lg" icon="selo" onClick={() => navigate(caminhoResultado(seed, minhas))} className="w-full sm:w-auto">
              Ver meu resultado completo
            </Button>
            <DesafiarAmigo seed={seed} respostas={minhas} label="Desafiar outra pessoa" className="w-full sm:w-auto" />
            <Button variant="ghost" size="lg" icon="reset" onClick={onRefazer} className="w-full sm:w-auto">
              Responder de novo
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="duelo-temas" className="mt-10 sm:mt-14">
        <h2 id="duelo-temas" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
          Tema a tema
        </h2>
        <p className="mt-1 text-[14px] text-fg-muted">O que cada um escolheu — abra um tema para ver de quem era cada proposta e a fonte.</p>
        <div className="mt-2">
          <DueloTemaATema minha={minha} outra={outra} comp={comp} porNumero={porNumero} />
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <Aviso icone="olho-fechado" titulo="Só entre vocês dois">
          A comparação é feita aqui no seu aparelho, com as escolhas que vieram no link. Nenhuma resposta é enviada, somada ou guardada
          em servidor — o Sintonia não faz enquetes.
        </Aviso>
        <Aviso icone="info" titulo="Não é recomendação de voto">
          O teste compara propostas escritas, não pessoas. Leia os programas completos antes de decidir.
        </Aviso>
      </div>
    </Container>
  );
}
