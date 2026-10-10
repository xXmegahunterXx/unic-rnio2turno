/**
 * /teste/resultado#<código> — resultado do Teste Cego (formato v2). O estado vem SÓ do hash da URL (nunca
 * enviado a servidor, nunca analytics).
 *
 * O "momento da revelação": a pessoa toca em "Revelar minha sintonia", o aparelho "compara" (~1,3 s) e os dois
 * medidores viram ao mesmo tempo (ordem da urna, cores por slot). Só depois aparecem o compartilhar (Desafio × Meu
 * resultado, cartões do kit nos 3 formatos), o Duelo, a quebra por tema e afirmação a afirmação com o trecho do plano
 * — nada disso antes do toque, para não estragar a surpresa nem expor o resultado a quem espia a tela.
 *
 * Modo rápido (12 afirmações): reconhecido pelas afirmações "não respondidas" do código; a página diz que o resultado
 * usa 12 afirmações e oferece completar as outras 12 (o progresso é retomado com as respostas já dadas).
 * Links do formato antigo (pares) caem numa tela amigável.
 */
import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { AFIRMACOES, calcularSintonia, DOCUMENTOS, type Resposta } from '@/app/content/afirmacoes';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Container } from '@/app/components/layout/Container';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { ListaAfirmacoes, TituloSecao, type LinhaAfirmacao } from '@/app/components/pages/teste/AfirmacaoAAfirmacao';
import { useCandidatosTeste } from '@/app/components/pages/teste/candidatos';
import { caminhoTeste, codificar, decodificar, ehCodigoV1, novaSemente } from '@/app/components/pages/teste/codigo';
import { PainelCompartilhar, PainelDuelo } from '@/app/components/pages/teste/Compartilhar';
import { SemResultado, VersaoAnterior } from '@/app/components/pages/teste/Estados';
import { Aviso, EM_REVISAO } from '@/app/components/pages/teste/IntroTeste';
import { PorTema } from '@/app/components/pages/teste/PorTema';
import { MedidorSintonia, resumoRespostas, TrilhaAnalise, useRevelacao } from '@/app/components/pages/teste/Revelacao';
import { apagarProgresso, gravarProgresso, type MapaRespostas } from '@/app/components/pages/teste/sessao';
import { conjuntoRespondido, contarPuladas, minutosEstimados, type Autor } from '@/app/components/pages/teste/sintonia';
import { Badge, Button, ButtonLink, Icon } from '@/app/ui';

export default function ResultadoPage() {
  const { hash } = useLocation();
  const dados = useMemo(() => decodificar(hash), [hash]);
  useTitulo('Seu resultado · Teste Cego');
  if (!dados) return ehCodigoV1(hash) ? <VersaoAnterior /> : <SemResultado />;
  return <Resultado key={hash} seed={dados.seed} respostas={dados.respostas} importantes={dados.importantes} />;
}

export function useRefazer() {
  const navigate = useNavigate();
  return (rapido = false) => {
    apagarProgresso();
    navigate(caminhoTeste(novaSemente(), rapido));
  };
}

function Resultado({ seed, respostas, importantes }: { seed: number; respostas: MapaRespostas; importantes: string[] }) {
  const navigate = useNavigate();
  const { lista, porNumero, fotos, carregando } = useCandidatosTeste();
  const { rapido, ids } = useMemo(() => conjuntoRespondido(respostas), [respostas]);
  const s = useMemo(() => calcularSintonia(respostas, importantes), [respostas, importantes]);
  const chave = useMemo(() => codificar(seed, respostas, importantes), [seed, respostas, importantes]);
  const { fase, revelar, revelado, analisando } = useRevelacao(chave);
  const refazer = useRefazer();
  const reduzir = useReducedMotion();
  const [a, b] = lista;
  const total = ids.length;
  const faltam = AFIRMACOES.length - total;
  const puladas = contarPuladas(respostas, ids);
  const imp = useMemo(() => new Set(importantes), [importantes]);
  const linhas = useMemo<LinhaAfirmacao[]>(
    () =>
      AFIRMACOES.filter((af) => ids.includes(af.id)).map((af) => ({
        afirmacao: af,
        minha: (respostas[af.id] ?? null) as Resposta | null,
        importante: imp.has(af.id),
        pct: s.porAfirmacao[af.id]?.pct,
      })),
    [respostas, imp, s, ids],
  );

  function completar() {
    // Retoma o teste completo com as respostas já dadas: o quiz abre na primeira afirmação ainda sem resposta.
    gravarProgresso({ seed, respostas, importantes, idx: 0 });
    navigate(caminhoTeste(seed));
  }

  if (s.respondidas === 0) {
    return (
      <Container className="py-10 sm:py-16">
        <div className="mx-auto max-w-lg rounded-3xl border border-line bg-surface p-8 text-center shadow-card">
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg">Você pulou todas as afirmações</h1>
          <p className="mt-2 text-pretty text-[14.5px] leading-relaxed text-fg-muted">
            Sem nenhuma resposta na escala não há o que comparar com os programas. Que tal tentar de novo? Dá para pular só as que preferir.
          </p>
          <Button variant="primary" size="lg" icon="reset" onClick={() => refazer()} className="mt-6">
            Refazer o teste
          </Button>
        </div>
      </Container>
    );
  }

  const tituloHero = revelado ? 'Sua sintonia com cada programa de governo' : analisando ? 'Comparando com os programas de governo…' : 'Pronto! Hora de descobrir.';

  return (
    <Container className="pb-4 pt-4 sm:pt-8">
      <section
        aria-labelledby="titulo-resultado"
        className="relative overflow-hidden rounded-[28px] border border-line bg-surface px-4 pb-6 pt-6 shadow-card sm:px-10 sm:pb-10 sm:pt-10"
      >
        {/* brilhos simétricos nos dois slots (ninguém em destaque) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.div
            className={cn('absolute -left-32 -top-32 h-80 w-80 rounded-full blur-3xl', a ? corSlot(a.cor).bgSoft : '')}
            initial={{ opacity: 0 }}
            animate={{ opacity: revelado ? 0.9 : analisando ? 0.35 : 0 }}
            transition={{ duration: 1.2 }}
          />
          <motion.div
            className={cn('absolute -right-32 -top-32 h-80 w-80 rounded-full blur-3xl', b ? corSlot(b.cor).bgSoft : '')}
            initial={{ opacity: 0 }}
            animate={{ opacity: revelado ? 0.9 : analisando ? 0.35 : 0 }}
            transition={{ duration: 1.2 }}
          />
          <div className="absolute inset-0 bg-noise opacity-60" />
        </div>

        <div className="relative">
          <div className="flex flex-wrap justify-center gap-2">
            <Badge tone="brand" size="sm" icon="olho-fechado" caps>
              Teste Cego · resultado
            </Badge>
            {rapido ? (
              <Badge tone="neutral" size="sm" icon="rapido" caps>
                Modo rápido
              </Badge>
            ) : null}
          </div>
          <h1
            id="titulo-resultado"
            aria-live="polite"
            className="mx-auto mt-4 max-w-[22ch] text-balance text-center font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] text-fg sm:text-[44px]"
          >
            {tituloHero}
          </h1>

          <div className="mx-auto mt-7 grid max-w-[720px] grid-cols-2 gap-3 sm:mt-10 sm:gap-10">
            {lista.map((c) => (
              <MedidorSintonia
                key={c.numero}
                candidato={c}
                foto={fotos[c.numero as Autor]}
                pct={s[c.numero as Autor]}
                consideradas={s.consideradas[c.numero as Autor]}
                revelado={revelado}
                analisando={analisando}
                ordem={0}
              />
            ))}
          </div>

          {fase === 'pronto' ? (
            <div className="mx-auto mt-6 flex max-w-[420px] flex-col items-center sm:mt-8">
              <Button variant="primary" size="lg" icon="olho-fechado" onClick={revelar} className="w-full shadow-glow" data-acao="revelar">
                Revelar minha sintonia
              </Button>
              <p className="mt-3 text-balance text-center text-[12.5px] leading-snug text-fg-subtle">
                A comparação com os programas registrados no TSE é feita aqui no seu aparelho. Nada é enviado.
              </p>
            </div>
          ) : null}

          {analisando ? (
            <div className="mx-auto mt-6 max-w-[420px] sm:mt-8">
              <TrilhaAnalise n={s.respondidas} ativo />
              <p className="num mt-3 text-center text-[12.5px] text-fg-muted">
                {fmtInt(s.respondidas)} respostas × <span className="whitespace-nowrap">2 programas de governo</span>
              </p>
            </div>
          ) : null}

          {revelado ? (
            <>
              <motion.p
                initial={reduzir ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: reduzir ? 0 : 0.9 }}
                className="mx-auto mt-6 max-w-[40rem] text-balance text-center text-[14.5px] leading-relaxed text-fg-muted sm:mt-8 sm:text-[16px]"
              >
                {resumoRespostas({ respondidas: s.respondidas, puladas, importantes: importantes.length, total, rapido })} Os dois números são
                independentes e não somam 100%.
              </motion.p>
              <motion.div
                initial={reduzir ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: reduzir ? 0 : 1.1 }}
                className="mt-4 flex flex-wrap justify-center gap-x-1 gap-y-1"
              >
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-medium text-brand-fg transition-colors hover:bg-surface-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  )}
                  onClick={() => document.getElementById('compartilhar')?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' })}
                >
                  <Icon name="compartilhar" size={16} />
                  Compartilhar ou desafiar
                </button>
                <Button variant="ghost" size="md" icon="reset" onClick={() => refazer()}>
                  Refazer
                </Button>
              </motion.div>
            </>
          ) : null}
        </div>
      </section>

      {revelado ? (
        <motion.div initial={reduzir ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: reduzir ? 0 : 0.6 }}>
          {rapido && faltam > 0 ? (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
                  <Icon name="rapido" size={18} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-fg">
                    Resultado com <span className="num">{fmtInt(total)}</span> de <span className="num">{fmtInt(AFIRMACOES.length)}</span> afirmações
                  </h2>
                  <p className="mt-0.5 text-pretty text-[13.5px] leading-snug text-fg-muted">
                    No modo rápido entra uma afirmação por tema. Responda as outras <span className="num">{fmtInt(faltam)}</span> (≈{' '}
                    <span className="num">{minutosEstimados(faltam)}</span> min) para um resultado mais preciso — as respostas que você já deu
                    continuam valendo.
                  </p>
                </div>
              </div>
              <Button variant="primary" size="md" iconRight="seta" onClick={completar} className="w-full shrink-0 sm:w-auto">
                Completar o teste
              </Button>
            </div>
          ) : null}

          <div id="compartilhar" className="mt-4 grid scroll-mt-[calc(var(--app-header-h,56px)+12px)] grid-cols-1 gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
            <PainelCompartilhar resultado={s} candidatos={lista} fotos={fotos} n={total} rapido={rapido} carregando={carregando} />
            <PainelDuelo seed={seed} respostas={respostas} importantes={importantes} n={total} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
            <Aviso icone="info" titulo="Não é recomendação de voto">
              O teste mede a distância entre suas respostas e o que está escrito nos programas de governo — não avalia pessoas, partidos ou
              trajetórias. Programas têm centenas de pontos: leia os documentos completos antes de decidir.
            </Aviso>
            <Aviso icone="grafico" titulo="Como calculamos">
              Em cada afirmação, sua resposta é comparada com a posição documentada do candidato: igual vale 100%, cada passo de distância na
              escala tira 25%. Afirmações que pesam mais para você contam em dobro; puladas e temas que o plano não trata ficam fora da conta.{' '}
              <Link to="/metodologia#teste-cego" className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-fg">
                Metodologia
              </Link>
            </Aviso>
          </div>

          <section aria-labelledby="por-tema" className="mt-10 sm:mt-14">
            <TituloSecao id="por-tema" titulo="Tema a tema">
              {rapido
                ? 'A mesma conta, separada pelos 12 temas do teste. No modo rápido há uma afirmação por tema; quando o plano não trata dela, aparece “—”.'
                : 'A mesma conta, separada pelos 12 temas do teste (duas afirmações em cada). Em alguns temas cada plano só trata de uma das duas afirmações; aí cada número se refere a uma afirmação diferente.'}
            </TituloSecao>
            <div className="mt-4">
              <PorTema resultado={s} candidatos={lista} fotos={fotos} revelado={revelado} />
            </div>
          </section>

          <section aria-labelledby="afirmacao-a-afirmacao" className="mt-10 sm:mt-14">
            <TituloSecao id="afirmacao-a-afirmacao" titulo="Afirmação a afirmação">
              Sua resposta e a posição de cada candidato, com o trecho original do programa de governo e o link para a página do documento.
            </TituloSecao>
            <div className="mt-4">
              <ListaAfirmacoes linhas={linhas} porNumero={porNumero} lista={lista} fotos={fotos} abertosInicial={linhas[0] ? [linhas[0].afirmacao.id] : []} />
            </div>
          </section>

          <section aria-labelledby="documentos" className="mt-10 sm:mt-14">
            <TituloSecao id="documentos" titulo="Leia os programas completos" />
            <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
              {lista.map((c) => {
                const d = DOCUMENTOS[c.numero as Autor];
                const sl = corSlot(c.cor);
                return (
                  <li key={c.numero}>
                    <a
                      href={d.pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-line/[2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-5"
                    >
                      <span className={cn('mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', sl.bgSoft, sl.text)}>
                        <Icon name="lista" size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-snug text-fg">{c.nomeUrna}</span>
                        <span className="mt-1 block text-pretty text-[13px] leading-snug text-fg-muted">{d.titulo}</span>
                        <span className="num mt-2 block text-[12px] text-fg-subtle">
                          PDF · {fmtInt(d.paginas)} páginas · cópia publicada por {d.publicadoPor}
                        </span>
                      </span>
                      <Icon name="externo" size={18} className="mt-1 shrink-0 text-fg-subtle transition-colors group-hover:text-fg" />
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12.5px] leading-snug text-fg-subtle">
              Documentos registrados no TSE.{' '}
              <Link to="/metodologia#teste-cego" className="underline decoration-line underline-offset-2 hover:text-fg">
                Como escrevemos as afirmações e identificamos as posições
              </Link>
              {EM_REVISAO ? ' · textos em revisão editorial final.' : '.'}
            </p>
          </section>

          <section className="mt-10 overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:mt-14 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">E no dia 25?</h2>
                <p className="mt-1 max-w-xl text-[14.5px] leading-relaxed text-fg-muted">
                  A partir das 17h, acompanhe a apuração ao vivo — do Brasil inteiro até a urna da sua seção.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <ButtonLink to="/apuracao" variant="secondary" size="lg" icon="ao-vivo">
                  Apuração
                </ButtonLink>
                <ButtonLink to="/apuracao/consulta" variant="ghost" size="lg" icon="busca">
                  Consulte sua seção
                </ButtonLink>
              </div>
            </div>
          </section>
        </motion.div>
      ) : (
        <div className="mt-4 md:mt-6">
          <Aviso icone="info" titulo="Não é pesquisa nem recomendação de voto">
            O teste compara suas respostas com o que está escrito nos programas de governo registrados no TSE — não com pessoas, trajetórias
            ou partidos.{' '}
            <Link to="/metodologia#teste-cego" className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-fg">
              Metodologia
            </Link>
          </Aviso>
        </div>
      )}
    </Container>
  );
}
