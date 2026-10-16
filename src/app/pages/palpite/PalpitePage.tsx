/**
 * /palpite — "Qual é o seu palpite para o 2º turno?" (motor viral INDIVIDUAL).
 *
 *  - Até as 23h59 de 24/10 (relógio do servidor): a pessoa crava o % dos votos válidos de cada finalista com um divisor
 *    só (somam 100%) e recebe o cartão "Meu palpite" para postar (x/feed/story, gerado no navegador).
 *  - Dia da votação (25/10, 0h–17h): o palpite fica travado e NÃO se compartilha (art. 39, § 5º).
 *  - Depois das 17h: com o resultado OFICIAL do TSE, a página mostra a diferença ("Você errou por Z p.p." / "Na mosca")
 *    e o cartão do resultado. Números simulados nunca entram na comparação.
 *  - Link recebido (`/palpite#<código>`): mostra o palpite de quem mandou e compara com o seu (só os dois — como o
 *    Duelo do Teste Cego). O código vai depois do "#": não chega a servidor algum.
 *
 * Regras (ARCHITECTURE §1): nada é enviado ao servidor nem somado ao de outras pessoas (agregado de palpites = enquete,
 * Lei 9.504/97, art. 33, § 5º); textos neutros e simétricos, ordem da urna, cores dos dados, sem foto (números
 * hipotéticos; o número de urna não vai nos cartões nem no texto). Publicidade: "Palpite oferecido por" (formato 'teste') no
 * FIM da página, longe do divisor e dos números; nos cartões, nada (OFERECIMENTO_COM_CANDIDATOS desligado).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { escolherAnuncio } from '@/shared/anuncios-escolha';
import { OFERECIMENTO_COM_CANDIDATOS } from '@/shared/oferecimento';
import { fmtDataHora, fmtPct } from '@/shared/format';
import { useMeta, useNacional, useStatus } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { brilhoDuplo, corSlot } from '@/app/lib/raceUi';
import { Button, ButtonLink } from '@/app/ui/Button';
import { Badge } from '@/app/ui/Badge';
import { Icon } from '@/app/ui/Icon';
import { fmtFaltam } from '@/app/ui/Countdown';
import { toast } from '@/app/ui/Toast';
import { Container } from '@/app/components/layout/Container';
import { ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { useAnunciosDaPagina } from '@/app/components/anuncios/contexto';
import { OferecimentoPalpite } from '@/app/components/anuncios/OferecimentoPalpite';
import { BotaoCompartilhar } from '@/app/components/share/BotaoCompartilhar';
import { BotaoLembrete, lembreteDisponivel } from '@/app/components/pages/home/BotaoLembrete';
import { CartaoPalpite } from '@/app/components/palpite/CartaoPalpite';
import { useAgoraServidor, useFinalistas, usePalpiteSalvo } from '@/app/components/palpite/estado';
import {
  FIM_PALPITES,
  NA_MOSCA_PP,
  PALPITE_INICIAL,
  avaliarPalpite,
  caminhoPalpite,
  distanciaPalpites,
  hashInvalido,
  normalizarPalpite,
  palpiteDoHash,
  pctsDoPalpite,
  fasePalpite,
  prazoPalpite,
  resultadoOficial,
  type Palpite,
  type ResultadoOficial,
} from '@/app/components/palpite/nucleo';
import { BarraPalpite, LadosPalpite, type FinalistasPalpite } from '@/app/components/palpite/Pecas';
import { SliderPalpite } from '@/app/components/palpite/SliderPalpite';
import {
  HASHTAGS_PALPITE,
  NOME_ARQUIVO_PALPITE,
  NOME_ARQUIVO_RESULTADO_PALPITE,
  fmtDiferenca,
  fmtPalpite,
  mancheteResultado,
  textoMeuPalpite,
  textoSemPalpite,
  textoResultadoPalpite,
} from '@/app/components/palpite/textos';

export default function PalpitePage() {
  useTitulo('Palpite do 2º turno');
  const metaQ = useMeta();
  const finalistas = useFinalistas();
  const agora = useAgoraServidor();
  const aberto = prazoPalpite(agora) === 'aberto';
  const votacao = fasePalpite(agora) === 'votacao';
  const [salvo, gravar] = usePalpiteSalvo();
  return (
    <>
      <Hero finalistas={finalistas} aberto={aberto} temPalpite={!!salvo} />
      <Container className="pb-10">
        {metaQ.isError ? (
          <ErrorState onRetry={() => metaQ.refetch()} className="py-8" />
        ) : finalistas ? (
          <Conteudo finalistas={finalistas} agora={agora} aberto={aberto} votacao={votacao} salvo={salvo} gravar={gravar} />
        ) : (
          <LoadingState variant="placar" className="pt-2" />
        )}
      </Container>
    </>
  );
}

/**
 * "Individual e só seu": no celular, uma linha com "saiba mais" (a ação principal — o divisor e o "Cravar" — precisa
 * caber na 1ª tela); a partir de 640 px, o texto inteiro.
 */
function AvisoIndividual() {
  const [aberto, setAberto] = useState(false);
  const resto =
    'O palpite fica neste aparelho e só sai no link ou na imagem que você compartilhar. Não é pesquisa nem enquete: nada é enviado ao Sintonia nem somado ao de outras pessoas.';
  return (
    <p role="note" className="mt-3 flex max-w-[44rem] items-start gap-2.5 rounded-2xl border border-line bg-surface/70 px-3.5 py-2.5 text-[13.5px] leading-snug text-fg-muted sm:mt-4 sm:py-3 sm:text-[14.5px]">
      <Icon name="olho-fechado" size={18} className="mt-px shrink-0 text-brand-fg" />
      <span>
        <strong className="font-semibold text-fg">Individual e só seu.</strong> <span className={cn(aberto ? 'inline' : 'hidden sm:inline')}>{resto}</span>
        {aberto ? null : (
          <>
            <span className="sm:hidden">Fica neste aparelho. </span>
            <button type="button" onClick={() => setAberto(true)} className="toque relative font-medium text-fg underline decoration-line underline-offset-2 sm:hidden">
              Saiba mais
            </button>
          </>
        )}
      </span>
    </p>
  );
}

function Hero({ finalistas, aberto, temPalpite }: { finalistas: FinalistasPalpite | null; aberto: boolean; temPalpite: boolean }) {
  return (
    <section aria-labelledby="palpite-titulo" className="relative isolate overflow-hidden">
      {finalistas ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: brilhoDuplo([finalistas[0].cor, finalistas[1].cor], 0.12, '55% 70%') }} />
      ) : null}
      <Container className="pb-4 pt-4 sm:pb-8 sm:pt-10">
        <span className="inline-flex h-8 items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg">
          <Icon name="relogio" size={15} className="text-brand-fg" />
          {aberto ? 'Palpites até as 23h59 de 24/10' : 'Palpites encerrados em 24/10'}
        </span>
        <h1
          id="palpite-titulo"
          // tela baixa (360×740, 375×667): título menor e sem o parágrafo (repetido em "Como funciona"): o divisor e os
          // "+0,1" ficam na 1ª tela, acima da tab bar
          className="mt-3 text-balance font-display text-[30px] font-semibold leading-[1] tracking-[-0.045em] text-fg min-[400px]:text-[34px] sm:mt-5 sm:text-[56px] lg:text-[64px] [@media(max-height:760px)_and_(max-width:639px)]:text-[26px] [@media(max-height:700px)_and_(max-width:639px)]:mt-2.5 [@media(max-height:700px)_and_(max-width:639px)]:text-[24px]"
        >
          {aberto ? (
            <>
              Qual é o seu <span className="text-grad">palpite</span> para o 2º turno?
            </>
          ) : temPalpite ? (
            <>
              Como foi o seu <span className="text-grad">palpite</span>?
            </>
          ) : (
            <>
              <span className="text-grad">Palpite</span> do 2º turno
            </>
          )}
        </h1>
        <p
          className={cn(
            'mt-2.5 max-w-[44rem] text-pretty text-[15px] leading-relaxed text-fg-muted sm:mt-4 sm:text-[18px]',
            aberto && '[@media(max-height:760px)_and_(max-width:639px)]:hidden',
          )}
        >
          {aberto
            ? 'Crave o % dos votos válidos de cada candidato a presidente. Com o resultado do TSE, veja por quantos pontos errou.'
            : temPalpite
              ? 'Os palpites fecharam às 23h59 de 24/10, véspera da votação. Com o resultado oficial do TSE, veja por quantos pontos o palpite cravado neste aparelho errou.'
              : 'Os palpites fecharam às 23h59 de 24/10, véspera da votação. Quem cravou um palpite neste aparelho vê aqui a diferença para o resultado oficial do TSE.'}
        </p>
        <AvisoIndividual />
      </Container>
    </section>
  );
}

function Conteudo({
  finalistas,
  agora,
  aberto,
  votacao,
  salvo,
  gravar,
}: {
  finalistas: FinalistasPalpite;
  agora: number;
  aberto: boolean;
  /** 25/10 de 0h às 17h: travado e sem compartilhar */
  votacao: boolean;
  salvo: Palpite | null;
  gravar: (p: Palpite) => boolean;
}) {
  const { hash } = useLocation();
  const recebido = palpiteDoHash(hash);
  const linkQuebrado = hashInvalido(hash);
  const status = useStatus().data;
  const { data: meta } = useMeta();
  const pres = meta?.races.find((r) => r.id === 'pres');
  const q = useNacional('pres');
  const resumo = q.data && q.data.race === 'pres' ? q.data.resumo : undefined;
  const oficial = resultadoOficial(status, pres, resumo);
  const { anuncios } = useAnunciosDaPagina();
  // faixa "Oferecimento" dos cartões: a mesma escolha das imagens OG genéricas (formato 'compartilhamento', master vence),
  // só com OFERECIMENTO_COM_CANDIDATOS — os cartões têm nomes e percentuais (hoje desligado: src/shared/oferecimento.ts)
  const oferecimento = useMemo(
    () => (OFERECIMENTO_COM_CANDIDATOS ? (escolherAnuncio(anuncios, 'compartilhamento', 'og|palpite')?.marca ?? null) : null),
    [anuncios],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:gap-10">
      <div className="min-w-0 space-y-5">
        {linkQuebrado ? (
          <p role="alert" className="flex items-start gap-2.5 rounded-2xl border border-alert/40 bg-alert/10 px-3.5 py-3 text-[14px] leading-snug text-fg">
            <Icon name="alerta" size={18} className="mt-px shrink-0 text-alert-fg" />
            Este link de palpite não é válido (pode ter sido cortado ao copiar).
          </p>
        ) : null}
        {recebido !== null ? <Recebido finalistas={finalistas} a={recebido} salvo={salvo} aberto={aberto} oficial={oficial} /> : null}
        {aberto ? (
          <Editor finalistas={finalistas} salvo={salvo} gravar={gravar} agora={agora} oferecimento={oferecimento} />
        ) : salvo ? (
          <Travado finalistas={finalistas} salvo={salvo} oficial={oficial} simulacao={!!status?.simulacao} votacao={votacao} oferecimento={oferecimento} />
        ) : (
          <SemPalpite votacao={votacao} fase={status?.simulacao ? 'apurando' : status?.fase} />
        )}
        {/* I29: depois de cravar, o lembrete da apuração (o evento abre /palpite; o palpite nunca vai no link) */}
        {salvo ? <LembretePalpite agora={agora} /> : null}
      </div>
      <aside className="min-w-0 lg:pt-1">
        <ComoFunciona />
      </aside>
      {/* publicidade: no fim, longe do divisor e dos números (a marca fica com a ferramenta, nunca com um palpite) */}
      <OferecimentoPalpite className="border-t border-line pt-8 sm:pt-10 lg:col-span-2" />
    </div>
  );
}

// ---- lembrete da apuração (I29) ---------------------------------------------------------------------------------------

/**
 * "Compare com o resultado oficial": depois de cravar e até as 17h de 25/10 (relógio do servidor), o lembrete na agenda
 * gerado no aparelho, apontando para /palpite (+ utm_source=agenda). O palpite fica neste aparelho e a página o mostra
 * de volta: o código dele nunca vai no evento.
 */
function LembretePalpite({ agora }: { agora: number }) {
  if (!lembreteDisponivel(agora)) return null;
  return (
    <section
      aria-labelledby="lembrete-palpite"
      className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
          <Icon name="calendario" size={19} />
        </span>
        <div className="min-w-0">
          <h3 id="lembrete-palpite" className="text-[15px] font-semibold leading-snug text-fg">
            Compare com o resultado oficial
          </h3>
          <p className="mt-0.5 text-pretty text-[13.5px] leading-snug text-fg-muted">
            A apuração começa no domingo, 25/10, às 17h (Brasília). O lembrete abre esta página, que guarda o seu palpite neste aparelho.
          </p>
        </div>
      </div>
      <BotaoLembrete caminho="/palpite" variant="outline" className="w-full shrink-0 sm:w-auto" />
    </section>
  );
}

// ---- cravar (antes das 17h) -----------------------------------------------------------------------------------------

function Editor({
  finalistas,
  salvo,
  gravar,
  agora,
  oferecimento,
}: {
  finalistas: FinalistasPalpite;
  salvo: Palpite | null;
  gravar: (p: Palpite) => boolean;
  agora: number;
  oferecimento: string | null;
}) {
  const [a, setA] = useState(salvo?.a ?? PALPITE_INICIAL);
  // outra aba cravou: acompanha (só se esta não estiver no meio de uma mudança)
  const [base, setBase] = useState(salvo?.a ?? null);
  useEffect(() => {
    if (salvo && salvo.a !== base) {
      if (base === null || a === base) setA(salvo.a);
      setBase(salvo.a);
    }
  }, [salvo, base, a]);
  const cravado = !!salvo && salvo.a === a;
  const mudar = (v: number) => setA(normalizarPalpite(v));
  const cravar = () => {
    const ok = gravar({ a, em: agora });
    setBase(a);
    toast(ok ? 'Palpite cravado. Ele fica só neste aparelho.' : 'Palpite cravado nesta aba (o navegador não deixou guardar).', {
      tone: ok ? 'ok' : 'alert',
      icon: ok ? 'check-circulo' : 'alerta',
    });
  };
  const [p0, p1] = pctsDoPalpite(a);
  const [c0, c1] = finalistas;
  return (
    <section
      id="meu-palpite"
      aria-labelledby="meu-palpite-titulo"
      data-sem-anuncio-fixo
      className="relative scroll-mt-[calc(var(--app-header-h,56px)+16px)] overflow-hidden rounded-[28px] border border-line bg-surface p-4 shadow-card sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h2 id="meu-palpite-titulo" className="font-display text-[21px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[25px]">
            Seu palpite
          </h2>
          {/* tela bem baixa (375×667): sem esta linha (o "Como funciona" repete), o divisor e os "+0,1" ficam acima da tab bar */}
          <p className="mt-0.5 text-[12.5px] text-fg-muted sm:text-[13px] [@media(max-height:700px)_and_(max-width:639px)]:hidden">
            % dos votos válidos (sem brancos e nulos, como no TSE)
          </p>
        </div>
        {cravado ? (
          <Badge tone="ok" size="sm" icon="check">
            Cravado em <span className="num">{fmtDataHora(salvo!.em)}</span>
          </Badge>
        ) : salvo ? (
          <Badge tone="pending" size="sm" icon="relogio">
            Mudou: falta cravar
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Ainda não cravado
          </Badge>
        )}
      </div>

      <LadosPalpite finalistas={finalistas} a={a} className="mt-3.5 sm:mt-5" />
      <SliderPalpite valor={a} onChange={mudar} esquerda={{ nome: c0.nomeUrna, cor: c0.cor }} direita={{ nome: c1.nomeUrna, cor: c1.cor }} className="mt-3" />

      {/* ajuste fino, simétrico: +0,1 ponto para cada lado */}
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <AjusteFino c={c0} onClick={() => mudar(a + 1)} desabilitado={p0 >= 70} alinhar="esq" />
        <button
          type="button"
          onClick={() => mudar(PALPITE_INICIAL)}
          disabled={a === PALPITE_INICIAL}
          className="toque relative rounded-full px-3 py-1.5 text-[12.5px] font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
        >
          50% · 50%
        </button>
        <AjusteFino c={c1} onClick={() => mudar(a - 1)} desabilitado={p1 >= 70} alinhar="dir" />
      </div>

      <div className="mt-5 flex flex-col gap-2.5 border-t border-line pt-5 sm:flex-row sm:items-center">
        {cravado ? (
          <BotaoCompartilhar
            label="Compartilhar meu palpite"
            variant="primary"
            size="lg"
            className="w-full sm:w-auto"
            titulo="Compartilhar meu palpite"
            descricao="Imagem e link com o seu palpite. Quem abrir o link vê o palpite: ele vai no próprio link, não no Sintonia."
            texto={textoMeuPalpite(finalistas, a, true)}
            caminho={caminhoPalpite(a)}
            hashtags={HASHTAGS_PALPITE}
            nomeArquivo={NOME_ARQUIVO_PALPITE}
            cartao={(formato) => <CartaoPalpite formato={formato} modo="palpite" finalistas={finalistas} a={a} cravadoEm={salvo!.em} aberto oferecimento={oferecimento} />}
          />
        ) : (
          <Button variant="primary" size="lg" icon="check" onClick={cravar} className="w-full sm:w-auto">
            {salvo ? 'Cravar o novo palpite' : 'Cravar meu palpite'}
          </Button>
        )}
        <p className="text-pretty text-[13px] leading-snug text-fg-muted sm:ml-1">
          {cravado ? 'Dá para mudar' : 'Depois de cravar, dá para mudar'} até as <strong className="font-semibold text-fg">23h59 de 24/10</strong> (Brasília) ·{' '}
          faltam <span className="num">{fmtFaltam(FIM_PALPITES - agora)}</span>
        </p>
      </div>
      {/* para leitores de tela: o valor atual por extenso */}
      <p className="sr-only" aria-live="polite">
        {c0.nomeUrna} {fmtPalpite(p0)}, {c1.nomeUrna} {fmtPalpite(p1)}
      </p>
    </section>
  );
}

function AjusteFino({ c, onClick, desabilitado, alinhar }: { c: FinalistasPalpite[number]; onClick: () => void; desabilitado: boolean; alinhar: 'esq' | 'dir' }) {
  const s = corSlot(c.cor);
  return (
    <div className={cn('flex', alinhar === 'dir' ? 'justify-end' : 'justify-start')}>
      <button
        type="button"
        onClick={onClick}
        disabled={desabilitado}
        aria-label={`Mais 0,1 ponto para ${c.nomeUrna}`}
        className={cn(
          'inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[13.5px] font-semibold transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40',
          s.borderSoft,
          s.bgFaint,
          s.text,
        )}
      >
        <Icon name="mais" size={15} />
        <span className="num">0,1</span>
      </button>
    </div>
  );
}

// ---- travado (a partir de 0h de 25/10) -------------------------------------------------------------------------------

function Travado({
  finalistas,
  salvo,
  oficial,
  simulacao,
  votacao,
  oferecimento,
}: {
  finalistas: FinalistasPalpite;
  salvo: Palpite;
  oficial: ResultadoOficial | null;
  simulacao: boolean;
  /** 25/10 de 0h às 17h: sem compartilhar */
  votacao: boolean;
  oferecimento: string | null;
}) {
  const av = oficial ? avaliarPalpite(salvo.a, oficial.pct0) : null;
  return (
    <section aria-labelledby="meu-palpite-titulo" data-sem-anuncio-fixo className="overflow-hidden rounded-[28px] border border-line bg-surface p-4 shadow-card sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h2 id="meu-palpite-titulo" className="font-display text-[21px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[25px]">
          Seu palpite
        </h2>
        <Badge tone="neutral" size="sm" icon="relogio">
          {salvo.em ? (
            <>
              Cravado em <span className="num">{fmtDataHora(salvo.em)}</span>
            </>
          ) : (
            'Travado à 0h de 25/10'
          )}
        </Badge>
      </div>
      <LadosPalpite finalistas={finalistas} a={salvo.a} className="mt-5" />
      <BarraPalpite finalistas={finalistas} a={salvo.a} className="mt-4" />

      <div className="mt-6 border-t border-line pt-5">
        {oficial && av ? (
          <Comparacao finalistas={finalistas} a={salvo.a} oficial={oficial} />
        ) : (
          <p className="flex items-start gap-2.5 text-[14px] leading-snug text-fg-muted">
            <Icon name="info" size={18} className="mt-px shrink-0 text-brand-fg" />
            {simulacao
              ? 'A comparação usa só o resultado oficial do TSE: números simulados não contam.'
              : 'A comparação aparece aqui assim que o TSE começar a divulgar os números do 2º turno.'}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {votacao ? (
          <p className="flex items-start gap-2 text-pretty text-[13.5px] leading-snug text-fg-muted">
            <Icon name="relogio" size={16} className="mt-px shrink-0 text-brand-fg" />
            Hoje é dia de votação: para nenhum palpite com nome de candidato circular enquanto as urnas estão abertas, o compartilhar volta às 17h.
          </p>
        ) : oficial?.final && av ? (
          <BotaoCompartilhar
            label="Compartilhar o resultado do palpite"
            variant="primary"
            size="lg"
            className="w-full sm:w-auto"
            titulo="Compartilhar o resultado do meu palpite"
            descricao="Imagem com a diferença entre o seu palpite e o resultado oficial. O link leva o seu palpite."
            texto={textoResultadoPalpite(finalistas, salvo.a, av)}
            caminho={caminhoPalpite(salvo.a)}
            hashtags={HASHTAGS_PALPITE}
            nomeArquivo={NOME_ARQUIVO_RESULTADO_PALPITE}
            cartao={(formato) => (
              <CartaoPalpite
                formato={formato}
                modo="resultado"
                finalistas={finalistas}
                a={salvo.a}
                cravadoEm={salvo.em || null}
                aberto={false}
                avaliacao={av}
                pctSecoes={oficial.pctSecoes}
                oferecimento={oferecimento}
              />
            )}
          />
        ) : (
          <BotaoCompartilhar
            label="Compartilhar meu palpite"
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto"
            titulo="Compartilhar meu palpite"
            descricao="Imagem e link com o seu palpite, cravado até 24/10."
            texto={textoMeuPalpite(finalistas, salvo.a, false)}
            caminho={caminhoPalpite(salvo.a)}
            hashtags={HASHTAGS_PALPITE}
            nomeArquivo={NOME_ARQUIVO_PALPITE}
            cartao={(formato) => (
              <CartaoPalpite formato={formato} modo="palpite" finalistas={finalistas} a={salvo.a} cravadoEm={salvo.em || null} aberto={false} oferecimento={oferecimento} />
            )}
          />
        )}
        <ButtonLink to="/apuracao" variant="ghost" size="lg" iconRight="seta" className="w-full sm:w-auto">
          Acompanhar a apuração
        </ButtonLink>
      </div>
    </section>
  );
}

/** Palpite × resultado oficial (final ou parcial, sempre com o % de seções). */
function Comparacao({ finalistas, a, oficial }: { finalistas: FinalistasPalpite; a: number; oficial: ResultadoOficial }) {
  const av = avaliarPalpite(a, oficial.pct0);
  const [p0, p1] = pctsDoPalpite(a);
  const linhas: { rotulo: ReactNode; v: [string, string] }[] = [
    { rotulo: 'Seu palpite', v: [fmtPalpite(p0), fmtPalpite(p1)] },
    {
      rotulo: oficial.final ? (
        'Resultado oficial (TSE)'
      ) : (
        <>
          Apuração do TSE · <span className="num">{fmtPct(oficial.pctSecoes)}</span> das seções
        </>
      ),
      v: [fmtPct(oficial.pct0), fmtPct(100 - oficial.pct0)],
    },
  ];
  return (
    <div>
      {oficial.final ? (
        <div className="flex items-center gap-3">
          {av.naMosca ? <Alvo /> : null}
          <p className="num text-balance font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] text-fg sm:text-[44px]">
            {av.naMosca ? (
              mancheteResultado(av, 'voce')
            ) : (
              <>
                Você errou por <span className="whitespace-nowrap">{fmtDiferenca(av.erro)}</span>
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="text-[15px] leading-snug text-fg">
          Até agora, com <span className="num font-semibold">{fmtPct(oficial.pctSecoes)}</span> das seções apuradas, o seu palpite está a{' '}
          <span className="num font-semibold">{fmtDiferenca(av.erro)}</span> do resultado parcial. O número final sai quando o TSE concluir a apuração.
        </p>
      )}
      {oficial.final ? (
        <p className="mt-1.5 text-[13.5px] text-fg-muted">
          {av.naMosca ? (
            <>
              Diferença de <span className="num">{fmtDiferenca(av.erro)}</span> (menos de <span className="num">{fmtDiferenca(NA_MOSCA_PP)}</span>).
            </>
          ) : (
            'Diferença entre o seu palpite e o resultado oficial, em pontos percentuais dos votos válidos.'
          )}
        </p>
      ) : null}
      <TabelaComparacao finalistas={finalistas} linhas={linhas} />
    </div>
  );
}

function TabelaComparacao({ finalistas, linhas }: { finalistas: FinalistasPalpite; linhas: { rotulo: ReactNode; v: [string, string] }[] }) {
  return (
    <table className="mt-4 w-full border-collapse text-[14px]">
      <caption className="sr-only">Palpite e resultado, em % dos votos válidos</caption>
      <thead>
        <tr className="border-b border-line text-[12px] uppercase tracking-[0.1em] text-fg-subtle">
          <th scope="col" className="py-2 text-left font-semibold">
            <span className="sr-only">Linha</span>
          </th>
          {finalistas.map((c) => (
            <th key={c.numero} scope="col" className={cn('py-2 text-right font-semibold normal-case tracking-normal', corSlot(c.cor).text)}>
              {c.nomeUrna} <span className="num text-fg-subtle">({c.numero})</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            <th scope="row" className="py-2.5 pr-2 text-left font-medium text-fg-muted">
              {l.rotulo}
            </th>
            <td className="num py-2.5 text-right font-semibold text-fg">{l.v[0]}</td>
            <td className="num py-2.5 pl-3 text-right font-semibold text-fg">{l.v[1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Alvo() {
  return (
    <svg viewBox="0 0 24 24" width={40} height={40} aria-hidden className="shrink-0 text-brand-fg" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SemPalpite({ votacao, fase }: { votacao: boolean; fase?: 'pre' | 'apurando' | 'encerrada' }) {
  const t = textoSemPalpite(votacao, fase);
  return (
    <section className="rounded-[28px] border border-line bg-surface p-5 text-center shadow-card sm:p-8">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface-2 text-fg-muted">
        <Icon name="relogio" size={24} />
      </span>
      <h2 className="mt-3 font-display text-[22px] font-semibold tracking-[-0.02em] text-fg">{t.titulo}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-pretty text-[14.5px] leading-relaxed text-fg-muted">{t.texto}</p>
      <ButtonLink to="/apuracao" variant="primary" size="lg" iconRight="seta" className="mt-5">
        {t.botao}
      </ButtonLink>
    </section>
  );
}

// ---- palpite recebido por link ------------------------------------------------------------------------------------------

function Recebido({
  finalistas,
  a,
  salvo,
  aberto,
  oficial,
}: {
  finalistas: FinalistasPalpite;
  a: number;
  salvo: Palpite | null;
  aberto: boolean;
  oficial: ResultadoOficial | null;
}) {
  const final = oficial?.final ? oficial : null;
  const avR = final ? avaliarPalpite(a, final.pct0) : null;
  const avS = final && salvo ? avaliarPalpite(salvo.a, final.pct0) : null;
  let frase: ReactNode = null;
  if (avR) {
    frase = (
      <>
        Este palpite ficou {avR.naMosca ? 'na mosca, ' : ''}a <span className="num font-semibold text-fg">{fmtDiferenca(avR.erro)}</span> do resultado
        oficial do TSE.
        {avS ? (
          <>
            {' '}
            {avS.erro < avR.erro ? 'O seu ficou mais perto.' : avS.erro > avR.erro ? 'Este ficou mais perto que o seu.' : 'O seu ficou à mesma distância.'}
          </>
        ) : null}
      </>
    );
  } else if (salvo) {
    const d = distanciaPalpites(salvo.a, a);
    frase =
      d === 0 ? (
        'É o mesmo palpite que o seu.'
      ) : (
        <>
          Este palpite está a <span className="num font-semibold text-fg">{fmtDiferenca(d)}</span> do seu.
        </>
      );
  } else if (aberto) {
    frase = 'Faça o seu e compare os dois. O seu palpite começa no meio, em 50% para cada.';
  }
  return (
    <section aria-labelledby="recebido-titulo" data-sem-anuncio-fixo className="rounded-2xl border border-brand/30 bg-brand/[0.06] p-4 sm:p-5">
      <h2 id="recebido-titulo" className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">
        <Icon name="link" size={15} />
        Palpite recebido por link
      </h2>
      <LadosPalpite finalistas={finalistas} a={a} tamanho="medio" className="mt-3" />
      <BarraPalpite finalistas={finalistas} a={a} alto="h-2" className="mt-3" />
      {frase ? <p className="mt-3 text-pretty text-[14px] leading-snug text-fg-muted">{frase}</p> : null}
      {aberto && !salvo ? (
        <a
          href="#meu-palpite"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('meu-palpite')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Fazer o meu palpite
          <Icon name="seta-baixo" size={15} />
        </a>
      ) : null}
    </section>
  );
}

// ---- como funciona -------------------------------------------------------------------------------------------------------

function ComoFunciona() {
  const itens = [
    'Arraste o divisor na direção de um candidato para aumentar a parte dele, ou use os botões de 0,1 ponto. Os dois somam 100% dos votos válidos.',
    'Crave o palpite. Até as 23h59 de 24/10 (Brasília) dá para mudar; depois, ele fica travado neste aparelho. No dia da votação, até as 17h, o palpite não é compartilhado.',
    `Quando o TSE concluir a apuração, a página mostra a diferença entre o seu palpite e o resultado oficial, em pontos percentuais. Menos de ${fmtDiferenca(NA_MOSCA_PP)}: na mosca.`,
    'Compartilhe a imagem e o link: quem abrir vê o seu palpite e pode comparar com o dele.',
  ];
  const naoE = [
    'Não é pesquisa nem enquete. O Sintonia não recebe, não guarda e não soma palpites: não existe "palpite da maioria".',
    'O palpite fica só no seu aparelho. Ele vai no link depois do "#", parte do endereço que o navegador não envia a servidor algum.',
    'Comparação só com o resultado oficial do TSE: números simulados nunca contam.',
  ];
  return (
    <section aria-labelledby="como-palpite" className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6 lg:sticky lg:top-[calc(var(--app-header-h,64px)+16px)]">
      <h2 id="como-palpite" className="flex items-center gap-2 font-display text-[19px] font-semibold tracking-[-0.02em] text-fg">
        <Icon name="info" size={19} className="text-brand-fg" />
        Como funciona
      </h2>
      <ol className="mt-3.5 space-y-3 text-[14px] leading-relaxed text-fg-muted">
        {itens.map((t, i) => (
          <li key={t} className="flex gap-2.5">
            <span className="num mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11.5px] font-semibold text-brand-fg">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <h3 className="mt-5 border-t border-line pt-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">O que o Palpite não é</h3>
      <ul className="mt-2.5 space-y-2.5 text-[13.5px] leading-relaxed text-fg-muted">
        {naoE.map((t) => (
          <li key={t} className="flex gap-2.5">
            <Icon name="olho-fechado" size={16} className="mt-0.5 shrink-0 text-brand-fg" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
