/**
 * /apuracao/:uf?race= — apuração de um estado (ou do exterior, 'zz').
 *
 * Placar da UF, progresso, participação, "o que falta", onde cada um lidera; mapa dos municípios com
 * modos, busca (destaca e enquadra) e seleção (painel lateral no desktop, Sheet no celular); destaques;
 * gráfico da apuração e eventos; tabela completa de municípios. No exterior não há mapa: lista de cidades
 * e países. Na fase 'pre' mostra o 1º turno oficial com contagem regressiva.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MunicipioResumo } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtCompact, fmtInt } from '@/shared/format';
import { useMunicipio, useUf } from '@/app/data/hooks';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { cn } from '@/app/lib/cn';
import { Badge, ButtonLink, Combobox, Icon, IconButton, Segmented, Sheet, type ComboOption } from '@/app/ui';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Section } from '@/app/components/layout/Section';
import { Placar } from '@/app/components/apuracao/Placar';
import { StatsGrid } from '@/app/components/apuracao/StatsGrid';
import { RestantePanel } from '@/app/components/apuracao/RestantePanel';
import { RaceSwitcher } from '@/app/components/apuracao/RaceSwitcher';
import { ShareButton } from '@/app/components/apuracao/ShareCard';
import { UfMap } from '@/app/components/apuracao/UfMap';
import { MapLegend } from '@/app/components/apuracao/MapLegend';
import { MapModeSwitch } from '@/app/components/apuracao/MapModeSwitch';
import { MunicipioTable } from '@/app/components/apuracao/MunicipioTable';
import { TimelineChart } from '@/app/components/apuracao/TimelineChart';
import { EventFeed } from '@/app/components/apuracao/EventFeed';
import { ErrorState } from '@/app/components/apuracao/States';
import { votosPorIbge, type MapMode } from '@/app/components/apuracao/mapModes';
import {
  ehNaoEncontrado,
  parseUf,
  rotaBrasil,
  rotaMun,
  rotaSecao,
  rotaUf,
  useDetalheRace,
} from '@/app/components/pages/detalhe/useDetalhe';
import { PreApuracaoAviso, PrimeiroTurnoAviso } from '@/app/components/pages/detalhe/FaseAviso';
import { GradeUfs, NaoEncontrado } from '@/app/components/pages/detalhe/NaoEncontrado';
import { EsqueletoUf } from '@/app/components/pages/detalhe/Esqueletos';
import { PanoramaMunicipios } from '@/app/components/pages/detalhe/PanoramaMunicipios';
import { Destaques } from '@/app/components/pages/detalhe/Destaques';
import { MunicipioPainel } from '@/app/components/pages/detalhe/MunicipioPainel';
import { ComparaTurnos } from '@/app/components/pages/detalhe/ComparaTurnos';
import { ExteriorTabela, usePaisesExterior } from '@/app/components/pages/detalhe/ExteriorTabela';
import { MunicipioUnico } from '@/app/components/pages/detalhe/MunicipioUnico';
import { ParticipacaoCartao } from '@/app/components/pages/detalhe/ParticipacaoCartao';
import { NomesOcultos } from '@/app/components/pages/detalhe/NomesOcultos';
import { emUf } from '@/app/components/pages/detalhe/fmt';

const MODOS_2T: MapMode[] = ['vencedor', 'margem', 'apurado', 'comparecimento', 'variacao'];
const MODOS_1T: MapMode[] = ['vencedor', 'margem', 'comparecimento'];

export default function UfPage() {
  const { uf: ufRaw } = useParams();
  const uf = parseUf(ufRaw);
  const ctx = useDetalheRace(uf);
  const navigate = useNavigate();
  const lg = useMediaQuery('(min-width: 1024px)');

  const q = useUf(ctx.id, uf ?? undefined);
  const qT1 = useUf(ctx.idT1, uf ?? undefined);
  const exterior = uf === 'ZZ';
  const paisesQ = usePaisesExterior(exterior);

  const [modo, setModo] = useState<MapMode>('vencedor');
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [eixo, setEixo] = useState<'secoes' | 'horario'>('secoes');

  // Troca de UF: limpa seleção e busca.
  useEffect(() => {
    setSel(null);
    setBusca(null);
    setSheet(false);
  }, [uf]);

  // Dados só valem se forem desta UF (o React Query mantém o anterior enquanto carrega).
  const snap = q.data && q.data.uf === uf ? q.data : undefined;
  const raceShown = snap ? ctx.races?.find((r) => r.id === snap.race) : undefined;
  const atualizando = !!snap && snap.race !== ctx.id;
  const snapT1 = qT1.data && qT1.data.uf === uf && qT1.data.race === ctx.idT1 ? qT1.data : undefined;

  const t1PorCod = useMemo(() => new Map((snapT1?.municipios ?? []).map((m) => [m.cod, m])), [snapT1]);
  const primeiroTurno = useMemo(() => (snapT1 ? votosPorIbge(snapT1.municipios) : undefined), [snapT1]);
  const porCod = useMemo(() => new Map((snap?.municipios ?? []).map((m) => [m.cod, m])), [snap]);
  const opcoes: ComboOption[] = useMemo(() => {
    const lista = [...(snap?.municipios ?? [])].sort((a, b) => Number(b.capital) - Number(a.capital) || b.eleitorado - a.eleitorado);
    return lista.map((m) => ({
      value: m.cod,
      label: m.nome,
      hint: m.capital ? 'Capital' : `${fmtCompact(m.eleitorado)} eleit.`,
    }));
  }, [snap]);

  const ufMeta = ctx.meta?.ufs.find((u) => u.uf === uf);
  const nomeUf = uf ? UF_NOMES[uf] : '';
  // UF de um município só (DF): no lugar do mapa, as seções do município.
  const codUnico = ufMeta && ufMeta.uf !== 'ZZ' && ufMeta.municipios === 1 && ufMeta.capitalCod ? ufMeta.capitalCod : undefined;
  const qUnico = useMunicipio(ctx.id, uf ?? undefined, codUnico);

  // ---------------------------------------------------------------- estados de erro/carregamento
  if (!uf) {
    return (
      <Container className="py-8 sm:py-12">
        <NaoEncontrado
          icon="mapa"
          titulo="Estado não encontrado"
          descricao={
            <>
              Não existe a sigla <span className="font-mono font-semibold text-fg">“{ufRaw}”</span>. Escolha um estado abaixo ou volte para
              o placar nacional.
            </>
          }
          acoes={
            <ButtonLink to="/apuracao" variant="primary" icon="seta-esquerda">
              Placar do Brasil
            </ButtonLink>
          }
        >
          <GradeUfs para={(s) => `/apuracao/${s}`} className="mx-auto max-w-xl" />
        </NaoEncontrado>
      </Container>
    );
  }

  const erro = q.error ?? q.failureReason;
  if (ehNaoEncontrado(erro) && !snap) {
    return (
      <Container className="py-8 sm:py-12">
        <NaoEncontrado
          icon="mapa"
          titulo={`Sem dados para ${nomeUf}`}
          descricao="Esta disputa não tem resultado para este estado. Veja o placar de Presidente ou escolha outro estado."
          acoes={
            <>
              <ButtonLink to={rotaUf(uf, 'pres')} variant="primary">
                Presidente em {uf}
              </ButtonLink>
              <ButtonLink to="/apuracao" variant="outline">
                Placar do Brasil
              </ButtonLink>
            </>
          }
        />
      </Container>
    );
  }
  if (q.isError && !snap) {
    return (
      <Container className="py-8">
        <ErrorState onRetry={() => q.refetch()} />
      </Container>
    );
  }
  if (!snap || !raceShown) {
    return (
      <Container>
        <EsqueletoUf />
      </Container>
    );
  }

  // ---------------------------------------------------------------- dados prontos
  const race = raceShown;
  const r = snap.resumo;
  const t1 = race.turno === 1;
  const raceT1 = ctx.raceT1;
  const local = emUf(uf, nomeUf);
  const unidade = exterior ? 'cidades' : 'municípios';
  const simulado = ctx.simulado && !t1;
  const apurando = !t1 && ctx.fase === 'apurando';
  const capital = snap.municipios.find((m) => m.capital);
  const selM = (sel ? porCod.get(sel) : undefined) ?? capital ?? snap.municipios[0];
  const modos = t1 ? MODOS_1T : MODOS_2T.filter((m) => m !== 'variacao' || !!primeiroTurno);
  const modoAtual = modos.includes(modo) ? modo : 'vencedor';
  const paraMun = (m: MunicipioResumo) => rotaMun(uf, m.cod, ctx.pedida);
  // "Eleito" só faz sentido onde a disputa se decide (governador na própria UF). Presidente num estado:
  // o selo fica "À frente" (o kit não tem rótulo "venceu aqui" — anotado no relatório).
  const resumoPlacar = race.abrangencia === uf ? r : { ...r, eleito: null };
  const temSerie = snap.serie.length > 1;
  // O feed da UF traz também eventos nacionais (início, "matematicamente eleito"): deixamos claro que são do país.
  const eventos = snap.eventos.map((e) =>
    e.abrangencia === 'BR' && e.tipo !== 'inicio' && e.detalhe ? { ...e, detalhe: `Resultado nacional. ${e.detalhe}` } : e,
  );
  const unico = codUnico ? snap.municipios.find((m) => m.cod === codUnico) : undefined;
  const snapUnico = qUnico.data && qUnico.data.cod === codUnico && qUnico.data.race === snap.race ? qUnico.data : undefined;
  const restanteVisivel = !t1 && r.eleito === null && r.status !== 'encerrada';

  // Ao lado do placar (desktop) ou depois do mapa (celular): o que falta, 1º × 2º turno ou a participação no 1º turno.
  const lateral = restanteVisivel ? (
    <RestantePanel race={race} resumo={r} restante={snap.restante} className="h-full" />
  ) : !t1 && raceT1 && snapT1 ? (
    <section className="h-full rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h3 className="mb-3.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">1º turno × 2º turno</h3>
      <ComparaTurnos race={race} raceT1={raceT1} t2={r} t1={snapT1.resumo} compacto />
    </section>
  ) : (
    <ParticipacaoCartao t={r} titulo="Participação no 1º turno" className="h-full" />
  );
  // No celular o mapa vem logo depois do placar; "o que falta" e a participação descem para depois dele.
  const lateralCelular = !lg ? (
    <div className={cn('space-y-3 py-5 transition-opacity', atualizando && 'opacity-60')}>
      {lateral}
      {!t1 ? <ParticipacaoCartao t={r} titulo="Participação" /> : null}
    </div>
  ) : null;

  function selecionar(cod: string) {
    setSel(cod);
    if (!lg) setSheet(true);
  }

  const subtitulo = ufMeta ? (
    <span className="num">
      {exterior ? (
        <>
          {fmtInt(ufMeta.municipios)} cidades
          {paisesQ.data ? <> em {fmtInt(new Set(Object.values(paisesQ.data)).size)} países</> : null}
        </>
      ) : (
        <>
          {fmtInt(ufMeta.municipios)} {ufMeta.municipios === 1 ? 'município' : 'municípios'}
        </>
      )}{' '}
      · {fmtCompact(ufMeta.eleitorado)} de eleitores · {fmtInt(ufMeta.secoes)} seções
    </span>
  ) : null;

  const tituloPlacar = (
    <>
      {race.cargo} · {exterior ? 'Exterior' : nomeUf}
      <span className="hidden sm:inline"> · {race.turno}º turno</span>
    </>
  );

  return (
    <Container>
      <PageHeader
        breadcrumbs={[{ label: 'Brasil', to: rotaBrasil(ctx.pedida) }, { label: exterior ? 'Exterior' : nomeUf }]}
        eyebrow={t1 ? 'Resultado oficial · 1º turno' : '2º turno · 25 de outubro'}
        title={exterior ? 'Votos no exterior' : nomeUf}
        subtitle={subtitulo}
        actions={
          <>
            {ctx.anonimizado ? <NomesOcultos /> : null}
            <ShareButton race={race} resumo={resumoPlacar} simulado={simulado} local={exterior ? 'Exterior' : nomeUf} size="sm" />
          </>
        }
      >
        {ctx.temGov && ctx.races ? (
          <RaceSwitcher races={ctx.races} uf={uf} value={ctx.id} onChange={ctx.setRace} incluirPrimeiroTurno={t1} />
        ) : null}
      </PageHeader>

      {ctx.fase === 'pre' && ctx.status ? (
        <PreApuracaoAviso inicio={ctx.status.inicioApuracao} agora={ctx.simNow} local={local} className="mb-4" />
      ) : t1 && !ctx.autoT1 ? (
        <PrimeiroTurnoAviso onVoltar={() => ctx.setRace(ctx.idT2)} className="mb-4" />
      ) : null}

      <div className={cn('transition-opacity', atualizando && 'opacity-60')}>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <Placar race={race} resumo={resumoPlacar} variant="default" titulo={tituloPlacar} simulado={simulado} live className="h-full" />
          </div>
          {lg ? <aside className="min-w-0 lg:col-span-4">{lateral}</aside> : null}
        </div>
        {lg && !t1 ? <StatsGrid t={r} className="mt-4" /> : null}
        {exterior ? <PanoramaMunicipios race={race} municipios={snap.municipios} unidade={unidade} className="mt-3 sm:mt-4" /> : null}
      </div>

      {/* ------------------------------------------------------------ mapa (ou as seções, no DF) */}
      {unico ? (
        <MunicipioUnico
          race={race}
          uf={uf}
          nomeUf={nomeUf}
          nome={unico.nome}
          snap={snapUnico}
          to={paraMun(unico)}
          onSecao={(z, s) => navigate(rotaSecao(uf, unico.cod, z, s, ctx.idT2))}
          className="py-5 sm:py-7"
        />
      ) : !exterior ? (
        <Section
          id="mapa"
          title="Mapa dos municípios"
          description={lg ? 'Clique num município para ver o placar ao lado.' : 'Toque num município para ver o placar.'}
          actions={<MapModeSwitch value={modoAtual} onChange={setModo} modos={modos} className="lg:pr-5" />}
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-5">
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-center md:gap-6">
                <div className="flex min-w-0 items-center gap-2">
                  <Combobox
                    options={opcoes}
                    value={busca}
                    onSelect={(o) => {
                      setBusca(o.value);
                      selecionar(o.value);
                    }}
                    placeholder="Buscar município"
                    ariaLabel={`Buscar entre ${fmtInt(snap.municipios.length)} municípios no mapa`}
                    maxResults={80}
                    className="min-w-0 flex-1"
                  />
                  {busca ? (
                    <IconButton
                      icon="fechar"
                      label="Limpar busca"
                      size="md"
                      variant="secondary"
                      onClick={() => setBusca(null)}
                      className="shrink-0"
                    />
                  ) : null}
                </div>
                <PanoramaMunicipios race={race} municipios={snap.municipios} unidade={unidade} variant="faixa" />
              </div>
              <UfMap
                uf={uf}
                municipios={snap.municipios}
                race={race}
                modo={modoAtual}
                selecionado={sel}
                destaque={busca ? [busca] : null}
                primeiroTurno={primeiroTurno}
                onSelect={(cod) => selecionar(cod)}
                rotuloAcao={(m) => `Ver ${m.nome}`}
                alturaMax={lg ? 640 : undefined}
              />
              <MapLegend modo={modoAtual} race={race} compacta className="mt-3 border-t border-line pt-3" />
            </div>

            {lg && selM ? (
              <aside className="min-w-0" aria-label="Município selecionado">
                <div className="sticky top-[calc(var(--app-header-h,64px)+16px)]">
                  <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                    {sel ? 'Selecionado' : capital ? 'Capital' : 'Município'}
                    {sel ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSel(null);
                          setBusca(null);
                        }}
                        className="ml-auto rounded-md px-1.5 py-0.5 text-[12px] font-medium normal-case tracking-normal text-fg-muted hover:bg-surface-2 hover:text-fg"
                      >
                        Limpar
                      </button>
                    ) : null}
                  </p>
                  <MunicipioPainel
                    race={race}
                    raceT1={raceT1}
                    municipio={selM}
                    municipioT1={t1PorCod.get(selM.cod)}
                    to={paraMun(selM)}
                    simulado={simulado}
                  />
                </div>
              </aside>
            ) : null}
          </div>
        </Section>
      ) : null}

      {lateralCelular}

      {/* ------------------------------------------------------------ destaques */}
      {!unico ? (
        <Section
          id="destaques"
          title="Destaques"
          description={
            exterior ? 'As cidades que mais chamam atenção nesta disputa.' : 'Os municípios que mais chamam atenção nesta disputa.'
          }
        >
          <Destaques
            race={race}
            municipios={snap.municipios}
            para={paraMun}
            apurando={apurando}
            unidade={unidade}
            rotulo={exterior ? (m) => paisesQ.data?.[m.cod] : undefined}
          />
        </Section>
      ) : null}

      {/* ------------------------------------------------------------ série e eventos */}
      {!t1 ? (
        <div className="grid grid-cols-1 gap-x-4 lg:grid-cols-12">
          <Section
            id="grafico"
            title={`A apuração ${local}`}
            description="% dos votos válidos conforme as seções são totalizadas."
            className="min-w-0 lg:col-span-8"
            actions={
              temSerie ? (
                <Segmented<'secoes' | 'horario'>
                  ariaLabel="Eixo horizontal"
                  size="sm"
                  value={eixo}
                  onChange={setEixo}
                  options={[
                    { value: 'secoes', label: '% seções' },
                    { value: 'horario', label: 'Horário' },
                  ]}
                />
              ) : null
            }
            card
          >
            {temSerie ? (
              <TimelineChart serie={snap.serie} race={race} eixoX={eixo} />
            ) : (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-2.5 px-4 text-center">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
                  <Icon name="grafico" size={20} />
                </span>
                <p className="max-w-xs text-pretty text-[14px] leading-snug text-fg-muted">
                  O gráfico começa a ser desenhado com as primeiras seções totalizadas.
                </p>
              </div>
            )}
          </Section>
          <Section id="eventos" title="Acontecimentos" className="min-w-0 lg:col-span-4" card>
            <EventFeed eventos={eventos} race={race} showUf={false} max={8} bleed={false} />
          </Section>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ tabela completa */}
      {!unico ? (
        <Section
          id="municipios"
          title={exterior ? 'Cidades e países' : 'Todos os municípios'}
          description={
            exterior
              ? 'Toque numa cidade para ver as seções; em “Países”, os totais por país.'
              : `Os ${fmtInt(snap.municipios.length)} municípios, do maior para o menor eleitorado. Toque para ver zonas e seções.`
          }
          card
        >
          {exterior ? (
            <ExteriorTabela race={race} municipios={snap.municipios} paises={paisesQ.data} onSelect={(m) => navigate(paraMun(m))} />
          ) : (
            <MunicipioTable race={race} municipios={snap.municipios} onSelect={(m) => navigate(paraMun(m))} />
          )}
        </Section>
      ) : null}

      {/* ------------------------------------------------------------ Sheet (celular/tablet) */}
      {!lg && selM ? (
        <Sheet
          open={sheet}
          onClose={() => setSheet(false)}
          title={
            <span className="flex items-center gap-2">
              {selM.nome}
              {selM.capital ? (
                <Badge tone="brand" size="xs">
                  Capital
                </Badge>
              ) : null}
            </span>
          }
          description={`${exterior ? 'Exterior' : nomeUf} · ${fmtCompact(selM.eleitorado)} eleitores · ${fmtInt(selM.secoes)} seções`}
          footer={
            <div className="pb-2">
              <ButtonLink to={paraMun(selM)} variant="primary" block iconRight="seta" size="lg">
                Abrir {exterior ? 'cidade' : 'município'}
              </ButtonLink>
            </div>
          }
        >
          <MunicipioPainel
            race={race}
            raceT1={raceT1}
            municipio={selM}
            municipioT1={t1PorCod.get(selM.cod)}
            to={paraMun(selM)}
            simulado={simulado}
            tituloPlacar={`${race.cargo} · ${race.turno}º turno`}
            semBotao
          />
        </Sheet>
      ) : null}
    </Container>
  );
}
