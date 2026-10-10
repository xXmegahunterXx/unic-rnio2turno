/**
 * /curiosidades — "Curiosidades do 1º turno": fatos neutros, surpreendentes e verificáveis calculados dos dados
 * oficiais do TSE (public/data/curiosidades.json, gerado por scripts/data/curiosidades.ts), cada um com cartão para
 * compartilhar (imagem nos 3 formatos + texto + link) pelo kit `@/app/components/share`.
 *
 *  ?tema=finalistas|brasil|…  filtra por tema · ?fato=<id>  rola até o cartão e o realça (link dos posts).
 *  Números reais do 1º turno: nomes dos finalistas permitidos, sempre em par simétrico; sem fotos.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import type { CuriosidadesDataset, TemaCuriosidade } from '@/shared/curiosidades';
import { TEMAS_CURIOSIDADES } from '@/shared/curiosidades';
import { fmtDataHora, fmtInt } from '@/shared/format';
import { assetUrl } from '@/app/lib/assets';
import { Icon } from '@/app/ui/Icon';
import { Container } from '@/app/components/layout/Container';
import { ErrorState, LoadingState } from '@/app/components/apuracao/States';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { FundoHero } from '@/app/components/pages/home/FundoHero';
import { BotaoCompartilhar } from '@/app/components/share';
import { useCuriosidades } from '@/app/components/pages/curiosidades/dados';
import { CartaoFato } from '@/app/components/pages/curiosidades/CartaoFato';
import { ComNumeros } from '@/app/components/pages/curiosidades/ComNumeros';
import { FiltroTemas } from '@/app/components/pages/curiosidades/FiltroTemas';
import { DestaquesCuriosidades, escolherDestaques } from '@/app/components/pages/curiosidades/DestaquesCuriosidades';
import { CartaoResumoCuriosidades } from '@/app/components/pages/curiosidades/CartaoResumoCuriosidades';
import { DESTAQUES_PADRAO, HASHTAGS_CURIOSIDADES, ICONE_TEMA, fatosDoTema, temaDoParam, temasComContagem, textoPagina } from '@/app/components/pages/curiosidades/formato';

export default function CuriosidadesPage() {
  useTitulo('Curiosidades do 1º turno');
  const q = useCuriosidades();
  const [params, setParams] = useSearchParams();
  const tema = temaDoParam(params.get('tema'));
  const fatoParam = params.get('fato');
  const [foco, setFoco] = useState<string | null>(null);
  const reduzir = useReducedMotion();
  const listaRef = useRef<HTMLDivElement>(null);

  const escolher = useCallback(
    (t: TemaCuriosidade | 'todos') => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('fato');
          if (t === 'todos') p.delete('tema');
          else p.set('tema', t);
          return p;
        },
        { replace: true, preventScrollReset: true },
      );
      // Se o filtro já está grudado no topo, volta ao início da lista (senão o usuário fica no meio do nada).
      const el = listaRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
    },
    [setParams, reduzir],
  );

  // Deep link (?fato=id): garante o fato visível, rola até ele e realça por alguns segundos.
  useEffect(() => {
    if (!q.data || !fatoParam) return;
    const f = q.data.fatos.find((x) => x.id === fatoParam);
    if (!f) return;
    if (tema !== 'todos' && f.tema !== tema) {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('tema');
          return p;
        },
        { replace: true, preventScrollReset: true },
      );
      return;
    }
    setFoco(f.id);
    const raf = requestAnimationFrame(() =>
      document.getElementById(`fato-${f.id}`)?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' }),
    );
    const t = window.setTimeout(() => setFoco(null), 4500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [q.data, fatoParam, tema, setParams, reduzir]);

  if (q.isError) {
    return (
      <Container wide className="py-8">
        <ErrorState onRetry={() => q.refetch()} />
      </Container>
    );
  }

  return (
    <>
      <Hero ds={q.data} />
      <Container wide className="pb-10">
        {q.data ? (
          <>
            <FiltroTemas temas={temasComContagem(q.data.fatos)} total={q.data.fatos.length} atual={tema} onEscolher={escolher} />
            <div ref={listaRef} className="scroll-mt-[calc(var(--app-header-h,56px)+8px)]">
              <ListaFatos ds={q.data} tema={tema} foco={foco} />
            </div>
            <ComoCalculamos ds={q.data} />
          </>
        ) : (
          <LoadingState variant="lista" rows={6} className="pt-6" />
        )}
      </Container>
    </>
  );
}

function Hero({ ds }: { ds: CuriosidadesDataset | undefined }) {
  const total = ds?.fatos.length;
  const destaques = useMemo(() => (ds ? escolherDestaques(ds.fatos, DESTAQUES_PADRAO) : []), [ds]);
  const irParaMetodo = () => document.getElementById('como-calculamos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <section aria-labelledby="curiosidades-titulo" className="relative isolate overflow-hidden">
      <FundoHero />
      <Container wide className="relative pb-6 pt-6 sm:pb-10 sm:pt-12 lg:pb-14 lg:pt-16">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-14">
          <div className="min-w-0 animate-fade-up">
            <span className="inline-flex h-8 items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg backdrop-blur">
              <Icon name="selo" size={15} className="text-brand-fg" />
              1º turno · dados oficiais do TSE
            </span>
            <h1
              id="curiosidades-titulo"
              className="mt-4 text-balance font-display text-[42px] font-semibold leading-[0.98] tracking-[-0.045em] text-fg min-[400px]:text-[46px] sm:mt-6 sm:text-[64px] lg:text-[72px]"
            >
              O 1º turno <span className="text-grad">em {total ? <span className="num">{total}</span> : ''} curiosidades</span>
            </h1>
            <p className="mt-4 max-w-[36rem] text-pretty text-[16px] leading-relaxed text-fg-muted sm:mt-5 sm:text-[18px]">
              Empates voto a voto, a maior seção do país, onde mais e menos se votou.{' '}
              <span className="text-fg">Fatos verificáveis, calculados dos dados oficiais, prontos para compartilhar.</span>
            </p>
            <div className="mt-6 flex items-center gap-2.5">
              {ds ? (
                <BotaoCompartilhar
                  variant="primary"
                  size="lg"
                  label="Compartilhar"
                  titulo="Compartilhar curiosidades"
                  descricao="Imagem com três destaques, texto e link"
                  texto={textoPagina(ds)}
                  caminho="/curiosidades"
                  hashtags={HASHTAGS_CURIOSIDADES}
                  nomeArquivo="sintonia-curiosidades-1-turno"
                  cartao={(formato) => <CartaoResumoCuriosidades fatos={destaques} total={ds.fatos.length} formato={formato} />}
                  className="flex-1 sm:flex-none"
                />
              ) : null}
              <button
                type="button"
                onClick={irParaMetodo}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[16px] border border-line px-4 text-[15px] font-medium sm:px-5 text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Icon name="info" size={18} className="hidden min-[400px]:block" />
                Como calculamos
              </button>
            </div>
          </div>
          <DestaquesCuriosidades variante="hero" />
        </div>
      </Container>
    </section>
  );
}

function ListaFatos({ ds, tema, foco }: { ds: CuriosidadesDataset; tema: TemaCuriosidade | 'todos'; foco: string | null }) {
  const grupos = TEMAS_CURIOSIDADES.filter((t) => tema === 'todos' || t.id === tema)
    .map((t) => ({ ...t, fatos: fatosDoTema(ds.fatos, t.id) }))
    .filter((g) => g.fatos.length);
  const { a, b } = ds.finalistas;
  return (
    <>
      {grupos.map((g) => (
        <section key={g.id} aria-labelledby={`tema-${g.id}`} className="pt-7 sm:pt-10">
          <header className="mb-3.5 sm:mb-4">
            <h2 id={`tema-${g.id}`} className="flex items-center gap-2 font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[26px]">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-fg">
                <Icon name={ICONE_TEMA[g.id]} size={18} />
              </span>
              {g.rotulo}
              <span className="num ml-1 text-[15px] font-medium text-fg-subtle">{g.fatos.length}</span>
            </h2>
            <p className="mt-1 max-w-2xl text-[14px] leading-snug text-fg-muted sm:text-[15px]">{g.descricao}</p>
            {g.id === 'finalistas' ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-cand-a" />
                  {a.nomeUrna} <span className="num">({a.numero})</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-cand-b" />
                  {b.nomeUrna} <span className="num">({b.numero})</span>
                </span>
                <span>Cores pela ordem do número na urna; o mesmo critério para os dois.</span>
              </p>
            ) : null}
          </header>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.fatos.map((f) => (
              <CartaoFato key={f.id} fato={f} finalistas={ds.finalistas} emFoco={foco === f.id} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function ComoCalculamos({ ds }: { ds: CuriosidadesDataset }) {
  const itens = [
    'Fonte: dados oficiais do TSE do 1º turno de 4 de outubro de 2026: resultado por município e por seção, locais de votação, perfil do eleitorado, candidaturas e resultados de Câmara, Senado e Governador.',
    'Percentuais como os do TSE: votos válidos não incluem brancos e nulos; brancos e nulos são calculados sobre o comparecimento; comparecimento e abstenção, sobre o eleitorado apto.',
    `Recordes por município consideram só cidades com pelo menos ${fmtInt(ds.pisos.eleitoradoMunicipio)} eleitores aptos, para não destacar oscilações de cidades muito pequenas. Não destacamos seções unânimes, para preservar o sigilo do voto.`,
    'Perfil do eleitorado: quando parte do cadastro não informa gênero ou idade, mostramos o número com menos casas ou arredondado para baixo ("mais de…"), para nunca exibir um valor que possa estar errado.',
    'Todo fato sobre os dois finalistas aparece em par, com o mesmo critério para cada um. Nenhum número vem da simulação do 2º turno.',
  ];
  return (
    <section id="como-calculamos" aria-labelledby="como-calculamos-titulo" className="scroll-mt-[calc(var(--app-header-h,56px)+16px)] pt-10 sm:pt-14">
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7">
        <h2 id="como-calculamos-titulo" className="flex items-center gap-2 font-display text-[20px] font-semibold tracking-[-0.02em] text-fg sm:text-[24px]">
          <Icon name="info" size={20} className="text-brand-fg" />
          Como calculamos
        </h2>
        <ul className="mt-4 grid gap-3 text-[14.5px] leading-relaxed text-fg-muted md:grid-cols-2 md:gap-x-8">
          {itens.map((t) => (
            <li key={t} className="flex gap-2.5">
              <Icon name="check" size={18} className="mt-0.5 shrink-0 text-ok-fg" />
              <span>
                <ComNumeros texto={t} />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[13.5px] text-fg-muted">
          <a
            href={assetUrl('data/curiosidades.json')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-brand-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="download" size={16} />
            Números brutos de cada fato (JSON)
          </a>
          <span>
            Calculado em <span className="num">{fmtDataHora(Date.parse(ds.geradoEm))}</span> (Brasília)
          </span>
        </div>
      </div>
    </section>
  );
}
