/**
 * /apuracao/:uf/:cod?race=&zona= — apuração de um município (ou cidade no exterior).
 *
 * Placar, progresso, participação e a comparação 1º × 2º turno; mosaico com TODAS as seções (clique →
 * Boletim de Urna), agrupável por zona ou por local de votação; zonas (ordenáveis) e, para a zona escolhida, a
 * lista de seções com filtros; locais de votação (busca por escola/bairro) e o perfil do eleitorado.
 * 1º turno (race -t1 ou fase 'pre'): resultado OFICIAL por seção (dados abertos do TSE). Se a base de uma UF não
 * tiver o resultado por seção, o mosaico vem pintado pelo vencedor municipal — e explicamos isso na página.
 */
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { RaceId, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtHora, fmtInt } from '@/shared/format';
import { useMunicipio, useStatus } from '@/app/data/hooks';
import { useInstanteParam } from '@/app/components/apuracao/LinhaDoTempo';
import { cn } from '@/app/lib/cn';
import { Badge, Button, ButtonLink, Segmented } from '@/app/ui';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Section } from '@/app/components/layout/Section';
import { Placar } from '@/app/components/apuracao/Placar';
import { StatsGrid } from '@/app/components/apuracao/StatsGrid';
import { RaceSwitcher } from '@/app/components/apuracao/RaceSwitcher';
import { ShareButton } from '@/app/components/apuracao/ShareCard';
import { BotaoCompartilharMunicipioT1 } from '@/app/components/share/cartoes/MunicipioT1';
import { SecaoMosaic } from '@/app/components/apuracao/SecaoMosaic';
import { ErrorState } from '@/app/components/apuracao/States';
import { Icon } from '@/app/ui/Icon';
import { emMun, emUf, fmt4, fmtEleitores } from '@/app/components/pages/detalhe/fmt';
import { useMinhaSecao } from '@/app/components/pages/detalhe/minhaSecao';
import {
  ehNaoEncontrado,
  parseUf,
  rotaBrasil,
  rotaSecao,
  rotaUf,
  useDetalheRace,
  useZonaParam,
} from '@/app/components/pages/detalhe/useDetalhe';
import { PreApuracaoAviso, PrimeiroTurnoAviso } from '@/app/components/pages/detalhe/FaseAviso';
import { NaoEncontrado } from '@/app/components/pages/detalhe/NaoEncontrado';
import { EsqueletoMunicipio } from '@/app/components/pages/detalhe/Esqueletos';
import { ComparaTurnos } from '@/app/components/pages/detalhe/ComparaTurnos';
import { ZonasExplorer } from '@/app/components/pages/detalhe/ZonasExplorer';
import { usePaisesExterior } from '@/app/components/pages/detalhe/ExteriorTabela';
import { NomesOcultos } from '@/app/components/pages/detalhe/NomesOcultos';
import { ParticipacaoCartao } from '@/app/components/pages/detalhe/ParticipacaoCartao';
import { Recolhivel } from '@/app/components/pages/detalhe/Recolhivel';
import { useMediaQuery } from '@/app/lib/useMediaQuery';
import { LocaisVotacao } from '@/app/components/pages/detalhe/LocaisVotacao';
import { PerfilEleitorado } from '@/app/components/pages/detalhe/PerfilEleitorado';

type Agrupar = 'zona' | 'local';

export default function MunicipioPage() {
  const { uf: ufRaw, cod: codRaw = '' } = useParams();
  const uf = parseUf(ufRaw);
  const cod = /^\d+$/.test(codRaw) ? codRaw.padStart(5, '0') : codRaw;
  const ctx = useDetalheRace(uf);
  const navigate = useNavigate();
  const lg = useMediaQuery('(min-width: 1024px)');
  const [zona, setZona] = useZonaParam();
  // "Reveja a noite": o clique no mapa nacional/da UF durante a reprise traz o `?t=` (só no 2º turno).
  const statusQ = useStatus();
  const { t: tUrl, setT } = useInstanteParam(statusQ.data, statusQ.dataUpdatedAt);
  const t = ctx.t1 ? undefined : tUrl;
  const q = useMunicipio(ctx.id, uf ?? undefined, cod || undefined, t);
  const exterior = uf === 'ZZ';
  const paisesQ = usePaisesExterior(exterior);
  const [agrupar, setAgrupar] = useState<Agrupar>('zona');

  const irSecao = useCallback(
    (z: number, s: number) => {
      if (!uf) return;
      navigate(rotaSecao(uf, cod, z, s, ctx.idT2));
    },
    [navigate, uf, cod, ctx.idT2],
  );

  const nomeUf = uf ? UF_NOMES[uf] : '';
  const snap = q.data && q.data.uf === uf && q.data.cod === cod ? q.data : undefined;
  const raceShown = snap ? ctx.races?.find((r) => r.id === snap.race) : undefined;
  const atualizando = !!snap && snap.race !== ctx.id;
  const erro = q.error ?? q.failureReason;

  if (!uf || (ehNaoEncontrado(erro) && !snap)) {
    return (
      <Container wide className="py-8 sm:py-12">
        <NaoEncontrado
          icon="pin"
          titulo={uf ? 'Município não encontrado' : 'Endereço não encontrado'}
          descricao={
            uf ? (
              <>
                Não há município com o código <span className="font-mono font-semibold text-fg">{codRaw}</span> {emUf(uf, nomeUf)}. Busque
                pelo nome na página do estado ou consulte a sua seção.
              </>
            ) : (
              'Este endereço não corresponde a nenhum estado. Comece pelo placar nacional ou consulte a sua seção.'
            )
          }
          acoes={
            <>
              <ButtonLink to={uf ? rotaUf(uf, ctx.pedida) : '/apuracao'} variant="primary" icon="seta-esquerda">
                {uf ? `Municípios de ${nomeUf}` : 'Placar do Brasil'}
              </ButtonLink>
              <ButtonLink to={`/apuracao/consulta${uf ? `?uf=${uf.toLowerCase()}` : ''}`} variant="outline" icon="busca">
                Consulte sua seção
              </ButtonLink>
            </>
          }
        />
      </Container>
    );
  }
  if (q.isError && !snap) {
    return (
      <Container wide className="py-8">
        <ErrorState onRetry={() => q.refetch()} />
      </Container>
    );
  }
  if (!snap || !raceShown) {
    return (
      <Container wide>
        <EsqueletoMunicipio />
      </Container>
    );
  }

  // ---------------------------------------------------------------- dados prontos
  const race = raceShown;
  const r = snap.resumo;
  // Um município não elege presidente nem governador: o selo "Eleito" do placar vira "À frente".
  const resumoPlacar = { ...r, eleito: null };
  const t1 = race.turno === 1;
  // 1º turno com resultado real por seção (senão o motor devolve uma "zona 0" com o agregado do município).
  const t1PorSecao = t1 && !(snap.zonas.length === 1 && snap.zonas[0].zona === 0);
  const simulado = ctx.simulado && !t1;
  const pais = exterior ? paisesQ.data?.[snap.cod] : undefined;
  const local = exterior ? `${snap.nome}${pais ? ` (${pais})` : ''}` : `${snap.nome} (${uf})`;
  const nZonas = snap.mosaico.length;
  const nSecoes = r.secoes;
  const unidade = exterior ? 'cidade' : 'município';
  // "Minha cidade no 1º turno" (resultado oficial): imagem e texto prontos para postar.
  const caminhoMun = `/apuracao/${uf.toLowerCase()}/${snap.cod}?race=${ctx.idT1}`;
  const compara =
    !t1 && ctx.raceT1 && snap.primeiroTurno ? (
      <section className="h-full rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">1º turno × 2º turno</h3>
          <BotaoCompartilharMunicipioT1
            nome={snap.nome}
            uf={uf}
            race={ctx.raceT1}
            t={snap.primeiroTurno}
            caminho={caminhoMun}
            soIcone
            size="sm"
            label="Compartilhar: minha cidade no 1º turno"
            className="-mr-2 -mt-2"
          />
        </div>
        <p className="mb-4 text-[12.5px] text-fg-muted">% dos votos válidos {emMun(snap.nome)}</p>
        <ComparaTurnos race={race} raceT1={ctx.raceT1} t2={r} t1={snap.primeiroTurno} compacto />
      </section>
    ) : null;

  const subtitulo = (
    <span className="num">
      {fmtInt(nZonas)} {nZonas === 1 ? 'zona eleitoral' : 'zonas eleitorais'} · {fmtInt(nSecoes)} {nSecoes === 1 ? 'seção' : 'seções'} ·{' '}
      {fmtEleitores(r.eleitorado)}
    </span>
  );
  const eyebrow = exterior ? (
    <>Cidade no exterior{pais ? ` · ${pais}` : ''}</>
  ) : (
    <>
      {snap.capital ? 'Capital' : 'Município'} · {nomeUf}
    </>
  );

  const tituloPlacar = (
    <>
      {race.cargo}
      <span className="hidden min-[400px]:inline"> · {snap.nome}</span>
      <span className="hidden sm:inline"> · {race.turno}º turno</span>
    </>
  );

  return (
    <Container wide>
      <PageHeader
        breadcrumbs={[
          { label: 'Brasil', to: rotaBrasil(ctx.pedida) },
          { label: exterior ? 'Exterior' : nomeUf, to: rotaUf(uf, ctx.pedida) },
          { label: snap.nome },
        ]}
        eyebrow={eyebrow}
        title={snap.nome}
        subtitle={subtitulo}
        actions={
          <>
            {ctx.anonimizado ? <NomesOcultos /> : null}
            {t1 ? (
              <BotaoCompartilharMunicipioT1 nome={snap.nome} uf={uf} race={race} t={r} caminho={caminhoMun} size="sm" label="Compartilhar" />
            ) : (
              <ShareButton race={race} resumo={resumoPlacar} simulado={simulado} local={local} size="sm" />
            )}
          </>
        }
      >
        {ctx.temGov && ctx.races ? (
          <RaceSwitcher races={ctx.races} uf={uf} value={ctx.id} onChange={ctx.setRace} incluirPrimeiroTurno={t1} />
        ) : null}
      </PageHeader>

      {t !== undefined ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-brand/40 bg-brand/[0.06] px-4 py-3">
          <Badge tone="brand" size="sm" icon="relogio">
            Revendo a apuração às <span className="num">{fmtHora(t)}</span>
          </Badge>
          <span className="text-[12.5px] text-fg-muted">Os números mostram {emMun(snap.nome)} naquele instante.</span>
          <Button size="sm" variant="secondary" onClick={() => setT(undefined)} className="ml-auto">
            Voltar ao vivo
          </Button>
        </div>
      ) : null}

      {ctx.fase === 'pre' && ctx.status ? (
        <PreApuracaoAviso inicio={ctx.status.inicioApuracao} agora={ctx.simNow} local={emMun(snap.nome)} className="mb-4" />
      ) : t1 && !ctx.autoT1 ? (
        <PrimeiroTurnoAviso onVoltar={() => ctx.setRace(ctx.idT2)} className="mb-4" />
      ) : null}

      <div className={cn('transition-opacity', atualizando && 'opacity-60')}>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <Placar race={race} resumo={resumoPlacar} variant="default" titulo={tituloPlacar} simulado={simulado} live className="h-full" />
          </div>
          {/* No celular só a comparação com o 1º turno fica junto do placar; a participação desce para o fim. */}
          {lg || compara ? (
            <aside className="min-w-0 lg:col-span-4">
              {compara ?? <ParticipacaoCartao t={r} titulo="Participação no 1º turno" className="h-full" />}
            </aside>
          ) : null}
        </div>
        {lg && !t1 ? <StatsGrid t={r} className="mt-4" /> : null}
      </div>

      {/* ------------------------------------------------------------ mosaico */}
      <Section
        id="secoes"
        title="Todas as seções"
        description={
          t1 && !t1PorSecao ? (
            <>
              <span className="num">{fmtInt(nSecoes)}</span> seções em <span className="num">{fmtInt(nZonas)}</span>{' '}
              {nZonas === 1 ? 'zona' : 'zonas'}, pintadas pelo resultado do {unidade} no 1º turno.
            </>
          ) : t1 ? (
            <>
              Cada quadrado é uma das <span className="num">{fmtInt(nSecoes)}</span> seções, com o resultado oficial dela no 1º turno. Toque
              numa seção para ver o boletim.
            </>
          ) : (
            nSecoes === 1 ? (
              <>Esta cidade tem uma única seção. Toque nela para ver o boletim de urna.</>
            ) : (
              <>
                Cada quadrado é uma das <span className="num">{fmtInt(nSecoes)}</span> seções. Toque numa seção para ver o boletim de urna.
              </>
            )
          )
        }
        actions={
          snap.mosaico.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-fg-muted">Agrupar por</span>
              <Segmented<Agrupar>
                size="sm"
                ariaLabel="Agrupar seções por"
                value={agrupar}
                onChange={setAgrupar}
                options={[
                  { value: 'zona', label: 'Zona' },
                  { value: 'local', label: 'Local' },
                ]}
              />
            </div>
          ) : null
        }
      >
        {t1 && !t1PorSecao ? (
          <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[13.5px] leading-relaxed text-fg-muted">
            <Icon name="info" size={18} className="mt-0.5 shrink-0" />
            <p>
              O resultado do 1º turno por seção não está disponível para este {unidade}; todas as seções aparecem com a cor de quem venceu em{' '}
              {snap.nome}. No 2º turno, cada seção ganha a própria cor assim que for totalizada.
            </p>
          </div>
        ) : null}
        <div className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-5">
          {snap.mosaico.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-fg-muted">O mosaico de seções não está disponível para esta fonte de dados.</p>
          ) : agrupar === 'local' ? (
            <LocaisVotacao
              variante="mosaico"
              uf={uf}
              cod={snap.cod}
              nomeMunicipio={snap.nome}
              mosaico={snap.mosaico}
              race={race}
              onSecao={irSecao}
            />
          ) : (
            <Recolhivel alturaMax={lg ? null : 560} rotulo={`Ver as ${fmtInt(nZonas)} zonas`}>
              <SecaoMosaic mosaico={snap.mosaico} race={race} zonaDestaque={t1 ? null : zona} onSelect={irSecao} />
            </Recolhivel>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------ zonas e seções */}
      {!t1 || t1PorSecao ? (
        <Section
          id="zonas"
          title="Zonas e seções"
          description="Resultado por zona eleitoral. Escolha uma zona para ver a lista de seções e abrir o boletim de cada uma."
        >
          <ZonasExplorer
            race={race}
            uf={uf}
            cod={snap.cod}
            nomeMunicipio={snap.nome}
            zonas={snap.zonas}
            zona={zona}
            onZona={setZona}
            onSecao={irSecao}
            t={t}
          />
        </Section>
      ) : null}

      <Section
        id="locais"
        title="Locais de votação"
        description={`Escolas e prédios onde se vota ${emMun(snap.nome)}, com as seções de cada um. Toque numa seção para ver o boletim.`}
      >
        <LocaisVotacao uf={uf} cod={snap.cod} nomeMunicipio={snap.nome} mosaico={snap.mosaico} race={race} onSecao={irSecao} />
      </Section>

      {!exterior ? (
        <Section id="eleitorado" title="Quem vota aqui" description={`Perfil do eleitorado ${emMun(snap.nome)}: idade, sexo e escolaridade.`}>
          <PerfilEleitorado uf={uf} cod={snap.cod} nome={snap.nome} />
        </Section>
      ) : null}

      {!lg ? <ParticipacaoCartao t={r} titulo={t1 ? 'Participação no 1º turno' : 'Participação'} className="mt-5" /> : null}

      <ConsultaCta uf={uf} cod={snap.cod} nome={snap.nome} race={ctx.idT2} />
    </Container>
  );
}

function ConsultaCta({ uf, cod, nome, race }: { uf: UF; cod: string; nome: string; race: RaceId }) {
  const [minha] = useMinhaSecao();
  const aqui = minha && minha.uf === uf && minha.cod === cod ? minha : null;
  return (
    <section className="mt-6 flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
          <Icon name="urna" size={22} />
        </span>
        {aqui ? (
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-fg">Minha seção</p>
            <h2 className="mt-0.5 font-mono text-[17px] font-semibold text-fg">
              Seção {fmt4(aqui.secao)} · Zona {fmt4(aqui.zona)}
            </h2>
            <p className="mt-0.5 text-[14px] text-fg-muted">Guardada neste aparelho. Abra o boletim da sua urna.</p>
          </div>
        ) : (
          <div>
            <h2 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-fg">Você vota {emMun(nome)}?</h2>
            <p className="mt-0.5 text-[14px] text-fg-muted">Informe a zona e a seção do seu título para abrir o boletim da sua urna.</p>
          </div>
        )}
      </div>
      {aqui ? (
        <ButtonLink to={rotaSecao(uf, cod, aqui.zona, aqui.secao, race)} variant="primary" iconRight="seta" className="shrink-0">
          Ver minha seção
        </ButtonLink>
      ) : (
        <ButtonLink to={`/apuracao/consulta?uf=${uf.toLowerCase()}&mun=${cod}`} variant="secondary" icon="busca" className="shrink-0">
          Consultar minha seção
        </ButtonLink>
      )}
    </section>
  );
}
