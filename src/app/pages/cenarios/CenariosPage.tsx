/**
 * /cenarios — "E se…? Monte seu cenário": calculadora do 2º turno a partir do resultado OFICIAL do 1º turno para
 * Presidente. A pessoa decide para onde vão os eleitores de cada candidato eliminado (e, se quiser, quem votou
 * branco/nulo e quanto muda o comparecimento); a página mostra o 2º turno resultante no Brasil e em cada estado.
 *
 * NÃO é pesquisa nem previsão (aviso permanente). Nada é coletado nem agregado: o cenário vive no aparelho e no link
 * (?c=…, codec em src/shared/cenarios.ts) que a pessoa decidir compartilhar. Nomes reais do 1º turno são dados
 * oficiais; cores de identificação dos finalistas (Lula vermelho, Flávio Bolsonaro azul — cenarios/cores.ts); sem
 * fotos (os números são hipotéticos).
 *
 * Celular: placar → mapa → controles → estados (com mini-placar fixo enquanto o placar está fora da tela).
 * Desktop: controles à esquerda; placar e mapa fixos à direita.
 */
import { useEffect, useMemo, useState } from 'react';
import type { UF } from '@/shared/types';
import {
  AVISO_CENARIO,
  calcularCenario,
  codificarCenario,
  eliminadosDe,
  finalistasDe,
  type Cenario,
  type PresidenteT1Dataset,
} from '@/shared/cenarios';
import { fmtCompact, fmtDataHora, fmtInt } from '@/shared/format';
import { assetUrl } from '@/app/lib/assets';
import { cn } from '@/app/lib/cn';
import { brilhoDuplo } from '@/app/lib/raceUi';
import { Icon } from '@/app/ui/Icon';
import { Container } from '@/app/components/layout/Container';
import { ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { useGeo } from '@/app/components/apuracao/geo';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { useCenario, usePresidenteT1 } from '@/app/components/pages/cenarios/dados';
import { ControleBrancos, ControleComparecimento, ControleTodos, ListaEliminados, Presets, nomesDe } from '@/app/components/pages/cenarios/Controles';
import { BarraFixa, MiniPlacar, PlacarCenario, type CompartilharCenario } from '@/app/components/pages/cenarios/Placar';
import { ListaUfs, PainelMapa } from '@/app/components/pages/cenarios/Estados';
import { CartaoCenario } from '@/app/components/pages/cenarios/CartaoCenario';
import { coresCenario } from '@/app/components/pages/cenarios/cores';
import { HASHTAGS_CENARIO, NOME_ARQUIVO_CENARIO, textoCenario } from '@/app/components/pages/cenarios/textos';

export default function CenariosPage() {
  useTitulo('E se…? Monte seu cenário do 2º turno');
  const q = usePresidenteT1();
  const ds = q.data;
  return (
    <>
      <Hero ds={ds} />
      <Container wide className="pb-10">
        {q.isError ? (
          <ErrorState onRetry={() => q.refetch()} className="py-8" />
        ) : ds ? (
          <Calculadora ds={ds} />
        ) : (
          <LoadingState variant="placar" className="pt-2" />
        )}
      </Container>
    </>
  );
}

function Hero({ ds }: { ds: PresidenteT1Dataset | undefined }) {
  const elim = ds ? eliminadosDe(ds) : [];
  const total = elim.reduce((s, c) => s + c.votos, 0);
  return (
    <section aria-labelledby="cenarios-titulo" className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: brilhoDuplo(coresCenario(ds), 0.12, '55% 70%') }} />
      <Container wide className="pb-5 pt-5 sm:pb-8 sm:pt-10">
        <span className="inline-flex h-8 items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg">
          <Icon name="ajustes" size={15} className="text-brand-fg" />
          Calculadora · não é pesquisa
        </span>
        <h1
          id="cenarios-titulo"
          className="mt-3 text-balance font-display text-[36px] font-semibold leading-[1] tracking-[-0.045em] text-fg min-[400px]:text-[40px] sm:mt-5 sm:text-[56px] lg:text-[64px]"
        >
          E se…? <span className="text-grad">Monte seu cenário</span> do 2º turno
        </h1>
        <p className="mt-3 max-w-[44rem] text-pretty text-[15.5px] leading-relaxed text-fg-muted sm:mt-4 sm:text-[18px]">
          Para onde vão os{' '}
          <span className="num font-semibold text-fg">{ds ? `${fmtCompact(total)} de votos` : 'votos'}</span> dos outros{' '}
          {ds ? <span className="num">{elim.length}</span> : null} candidatos? Você decide, e vê o resultado no Brasil e em cada estado.
        </p>
        <p role="note" className="mt-4 flex max-w-[44rem] items-start gap-2.5 rounded-2xl border border-brand/30 bg-brand/[0.08] px-3.5 py-3 text-[13.5px] font-medium leading-snug text-fg sm:text-[14.5px]">
          <Icon name="alerta" size={18} className="mt-px shrink-0 text-brand-fg" />
          {AVISO_CENARIO}
        </p>
      </Container>
    </section>
  );
}

function Calculadora({ ds }: { ds: PresidenteT1Dataset }) {
  const { cenario, setCenario } = useCenario(ds);
  const { data: geo } = useGeo();
  const [selecionada, setSelecionada] = useState<UF | null>(null);
  const nomes = useMemo(() => nomesDe(ds), [ds]);
  const resultado = useMemo(() => (cenario ? calcularCenario(ds, cenario) : null), [ds, cenario]);
  const [placarVisivel, setPlacarVisivel] = useState(true);
  const [placarEl, setPlacarEl] = useState<HTMLDivElement | null>(null);

  // Mini-placar fixo: aparece quando o placar principal sai por cima da tela.
  useEffect(() => {
    if (!placarEl || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setPlacarVisivel(e.isIntersecting || e.boundingClientRect.top > 0), { threshold: 0 });
    io.observe(placarEl);
    return () => io.disconnect();
  }, [placarEl]);

  if (!cenario || !resultado) return <LoadingState variant="placar" className="pt-2" />;

  const set = (c: Cenario) => setCenario(c);
  const caminho = `/cenarios?c=${codificarCenario(cenario)}`;
  const compartilhar: CompartilharCenario = {
    titulo: 'Compartilhar meu cenário',
    descricao: 'Imagem com o placar, o mapa e as premissas, texto pronto e o link do seu cenário',
    texto: textoCenario(ds, resultado),
    caminho,
    hashtags: HASHTAGS_CENARIO,
    nomeArquivo: NOME_ARQUIVO_CENARIO,
    carregando: !geo,
    cartao: (formato) => <CartaoCenario formato={formato} ds={ds} cenario={cenario} resultado={resultado} geo={geo} caminho={caminho} />,
  };

  return (
    <>
      <BarraFixa ds={ds} resultado={resultado} visivel={!placarVisivel} compartilhar={compartilhar} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-x-8 lg:gap-y-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
        {/* Placar: primeiro em tudo (no desktop, no alto da coluna dos controles) */}
        <div ref={setPlacarEl} className="min-w-0 lg:col-start-1 lg:row-start-1">
          <PlacarCenario ds={ds} cenario={cenario} resultado={resultado} compartilhar={compartilhar} />
        </div>

        {/* Mapa: logo abaixo do placar no celular; coluna fixa à direita no desktop, com o mini-placar ao vivo */}
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="space-y-3 lg:sticky lg:top-[calc(var(--app-header-h,64px)+16px)] lg:max-h-[calc(100dvh-var(--app-header-h,64px)-24px)] lg:overflow-y-auto lg:overscroll-contain lg:pb-2 lg:[scrollbar-width:thin]">
            <MiniPlacar ds={ds} resultado={resultado} className="hidden lg:flex" />
            <PainelMapa geo={geo} resultado={resultado} nomes={nomes} selecionada={selecionada} onSelect={setSelecionada} />
          </div>
        </div>

        {/* Controles */}
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          <Presets ds={ds} cenario={cenario} nomes={nomes} onEscolher={set} />
          <section aria-labelledby="eliminados-titulo" className="space-y-3">
            <div>
              <h2 id="eliminados-titulo" className="font-display text-[19px] font-semibold tracking-[-0.02em] text-fg sm:text-[21px]">
                Para onde vão os eleitores dos demais candidatos
              </h2>
              <p className="mt-1 text-[13.5px] leading-snug text-fg-muted">
                Arraste o divisor na direção de um candidato para dar mais votos a ele: para a esquerda, mais para {nomes.a}; para a direita, mais
                para {nomes.b}. No meio, metade para cada. A mesma divisão vale em todos os estados.
              </p>
            </div>
            <ControleTodos ds={ds} cenario={cenario} nomes={nomes} onChange={set} />
            <ListaEliminados ds={ds} cenario={cenario} nomes={nomes} onChange={set} />
          </section>
          <section aria-labelledby="extras-titulo" className="space-y-3">
            <div>
              <h2 id="extras-titulo" className="font-display text-[19px] font-semibold tracking-[-0.02em] text-fg sm:text-[21px]">
                Brancos, nulos e comparecimento
              </h2>
              <p className="mt-1 text-[13.5px] leading-snug text-fg-muted">Opcional: quem anulou no 1º turno muda de ideia? Mais ou menos gente vai votar?</p>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <ControleBrancos ds={ds} cenario={cenario} nomes={nomes} onChange={set} />
              <ControleComparecimento ds={ds} cenario={cenario} nomes={nomes} onChange={set} />
            </div>
          </section>
        </div>
      </div>

      <div className="mt-10 sm:mt-14">
        <ListaUfs resultado={resultado} nomes={nomes} selecionada={selecionada} onSelect={setSelecionada} />
      </div>
      <ComoFunciona ds={ds} />
    </>
  );
}

function ComoFunciona({ ds }: { ds: PresidenteT1Dataset }) {
  const { a, b } = finalistasDe(ds);
  const conta = [
    `Base: resultado oficial do 1º turno para Presidente (TSE, 4 de outubro de 2026), estado por estado e no exterior: ${fmtInt(ds.totais.eleitorado)} eleitores aptos e ${fmtInt(ds.totais.comparecimento)} votos.`,
    `Quem votou em ${a.nomeUrna} ou em ${b.nomeUrna} no 1º turno repete o voto. Os eleitores de cada candidato eliminado se dividem como você escolher, com a mesma divisão em todos os estados.`,
    'A variação do comparecimento é aplicada sobre o eleitorado de cada estado, com a taxa de brancos e nulos do 1º turno daquele estado.',
    'Percentuais como os do TSE: votos válidos não incluem brancos e nulos; brancos e nulos são calculados sobre o comparecimento.',
  ];
  const naoE = [
    'Não é pesquisa eleitoral nem previsão: o resultado é só a consequência matemática das hipóteses de quem monta o cenário.',
    'Nada do que você escolhe é enviado, guardado em servidor ou somado ao de outras pessoas. O cenário fica no seu aparelho e no link que você decidir compartilhar.',
    'Os pontos de partida são neutros e iguais para os dois finalistas; nenhum se baseia em pesquisa.',
  ];
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="mt-10 scroll-mt-[calc(var(--app-header-h,56px)+16px)] sm:mt-14">
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7">
        <h2 id="como-funciona-titulo" className="flex items-center gap-2 font-display text-[20px] font-semibold tracking-[-0.02em] text-fg sm:text-[24px]">
          <Icon name="info" size={20} className="text-brand-fg" />
          Como a conta é feita
        </h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2 md:gap-10">
          <ul className="space-y-3 text-[14.5px] leading-relaxed text-fg-muted">
            {conta.map((t) => (
              <li key={t} className="flex gap-2.5">
                <Icon name="check" size={18} className="mt-0.5 shrink-0 text-ok-fg" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div>
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">O que esta calculadora não é</h3>
            <ul className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-fg-muted">
              {naoE.map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Icon name="alerta" size={18} className="mt-0.5 shrink-0 text-brand-fg" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className={cn('mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[13.5px] text-fg-muted')}>
          <a
            href={assetUrl('data/presidente-t1.json')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-brand-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="download" size={16} />
            Dados do 1º turno por estado (JSON)
          </a>
          <span>
            Gerado em <span className="num">{fmtDataHora(Date.parse(ds.geradoEm))}</span> (Brasília) · Fonte: TSE
          </span>
        </div>
      </div>
    </section>
  );
}
