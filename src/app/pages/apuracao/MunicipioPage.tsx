/**
 * /apuracao/:uf/:cod?race=&zona= — apuração de um município (ou cidade no exterior).
 *
 * Placar, progresso, participação e a comparação 1º × 2º turno; mosaico com TODAS as seções (clique →
 * Boletim de Urna); zonas (ordenáveis) e, para a zona escolhida, a lista de seções com filtros.
 * 1º turno (race -t1 ou fase 'pre'): resumo do município; o mosaico vem pintado pelo vencedor municipal
 * (a base não tem resultado por seção do 1º turno) — explicamos isso na página.
 */
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt } from '@/shared/format';
import { useMunicipio } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { ButtonLink } from '@/app/ui';
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Section } from '@/app/components/layout/Section';
import { Placar } from '@/app/components/apuracao/Placar';
import { StatsGrid } from '@/app/components/apuracao/StatsGrid';
import { RaceSwitcher } from '@/app/components/apuracao/RaceSwitcher';
import { ShareButton } from '@/app/components/apuracao/ShareCard';
import { SecaoMosaic } from '@/app/components/apuracao/SecaoMosaic';
import { ErrorState } from '@/app/components/apuracao/States';
import { Icon } from '@/app/ui/Icon';
import { fmtEleitores } from '@/app/components/pages/detalhe/fmt';
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

export default function MunicipioPage() {
  const { uf: ufRaw, cod: codRaw = '' } = useParams();
  const uf = parseUf(ufRaw);
  const cod = /^\d+$/.test(codRaw) ? codRaw.padStart(5, '0') : codRaw;
  const ctx = useDetalheRace(uf);
  const navigate = useNavigate();
  const [zona, setZona] = useZonaParam();
  const q = useMunicipio(ctx.id, uf ?? undefined, cod || undefined);
  const exterior = uf === 'ZZ';
  const paisesQ = usePaisesExterior(exterior);

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
      <Container className="py-8 sm:py-12">
        <NaoEncontrado
          icon="pin"
          titulo={uf ? 'Município não encontrado' : 'Endereço não encontrado'}
          descricao={
            uf ? (
              <>
                Não há município com o código <span className="font-mono font-semibold text-fg">{codRaw}</span> em {nomeUf}. Busque pelo
                nome na página do estado ou consulte a sua seção.
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
      <Container className="py-8">
        <ErrorState onRetry={() => q.refetch()} />
      </Container>
    );
  }
  if (!snap || !raceShown) {
    return (
      <Container>
        <EsqueletoMunicipio />
      </Container>
    );
  }

  // ---------------------------------------------------------------- dados prontos
  const race = raceShown;
  const r = snap.resumo;
  const t1 = race.turno === 1;
  const simulado = ctx.simulado && !t1;
  const pais = exterior ? paisesQ.data?.[snap.cod] : undefined;
  const local = exterior ? `${snap.nome}${pais ? ` (${pais})` : ''}` : `${snap.nome} (${uf})`;
  const nZonas = snap.mosaico.length;
  const nSecoes = r.secoes;
  const unidade = exterior ? 'cidade' : 'município';

  const subtitulo = (
    <span className="num">
      {fmtInt(nZonas)} {nZonas === 1 ? 'zona eleitoral' : 'zonas eleitorais'} · {fmtInt(nSecoes)} seções · {fmtEleitores(r.eleitorado)}
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
    <Container>
      <PageHeader
        breadcrumbs={[
          { label: 'Brasil', to: rotaBrasil(ctx.pedida) },
          { label: exterior ? 'Exterior' : nomeUf, to: rotaUf(uf, ctx.pedida) },
          { label: snap.nome },
        ]}
        eyebrow={eyebrow}
        title={snap.nome}
        subtitle={subtitulo}
        actions={<ShareButton race={race} resumo={r} simulado={simulado} local={local} size="sm" />}
      >
        {ctx.temGov && ctx.races ? (
          <RaceSwitcher races={ctx.races} uf={uf} value={ctx.id} onChange={ctx.setRace} incluirPrimeiroTurno={t1} />
        ) : null}
      </PageHeader>

      {ctx.fase === 'pre' && ctx.status ? (
        <PreApuracaoAviso inicio={ctx.status.inicioApuracao} agora={ctx.simNow} local={`em ${snap.nome}`} className="mb-4" />
      ) : t1 && !ctx.autoT1 ? (
        <PrimeiroTurnoAviso onVoltar={() => ctx.setRace(ctx.idT2)} className="mb-4" />
      ) : null}

      <div className={cn('transition-opacity', atualizando && 'opacity-60')}>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <Placar race={race} resumo={r} variant="default" titulo={tituloPlacar} simulado={simulado} live className="h-full" />
          </div>
          <aside className="min-w-0 lg:col-span-4">
            {!t1 && ctx.raceT1 && snap.primeiroTurno ? (
              <section className="h-full rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
                <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">1º turno × 2º turno</h3>
                <p className="mb-4 text-[12.5px] text-fg-muted">% dos votos válidos em {snap.nome}</p>
                <ComparaTurnos race={race} raceT1={ctx.raceT1} t2={r} t1={snap.primeiroTurno} compacto />
              </section>
            ) : (
              <section className="h-full rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
                <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Participação no 1º turno</h3>
                <StatsGrid t={r} variant="list" />
              </section>
            )}
          </aside>
        </div>
        {!t1 ? <StatsGrid t={r} className="mt-3 sm:mt-4" /> : null}
      </div>

      {/* ------------------------------------------------------------ mosaico */}
      <Section
        id="secoes"
        title="Todas as seções"
        description={
          t1 ? (
            <>
              <span className="num">{fmtInt(nSecoes)}</span> seções em <span className="num">{fmtInt(nZonas)}</span>{' '}
              {nZonas === 1 ? 'zona' : 'zonas'}, pintadas pelo resultado do {unidade} no 1º turno.
            </>
          ) : (
            <>
              Cada quadrado é uma das <span className="num">{fmtInt(nSecoes)}</span> seções, agrupadas por zona. Toque numa seção para ver o
              boletim de urna.
            </>
          )
        }
      >
        {t1 ? (
          <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[13.5px] leading-relaxed text-fg-muted">
            <Icon name="info" size={18} className="mt-0.5 shrink-0" />
            <p>
              O TSE divulga o resultado do 1º turno por município nesta base; não há dado por seção. Por isso, todas as seções aparecem com a
              cor de quem venceu em {snap.nome}. No 2º turno, cada seção ganha a própria cor assim que for totalizada.
            </p>
          </div>
        ) : null}
        <div className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-5">
          {snap.mosaico.length > 0 ? (
            <SecaoMosaic mosaico={snap.mosaico} race={race} zonaDestaque={t1 ? null : zona} onSelect={irSecao} />
          ) : (
            <p className="py-10 text-center text-[14px] text-fg-muted">O mosaico de seções não está disponível para esta fonte de dados.</p>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------ zonas e seções */}
      {!t1 ? (
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
          />
        </Section>
      ) : null}

      <ConsultaCta to={`/apuracao/consulta?uf=${uf.toLowerCase()}&mun=${snap.cod}`} nome={snap.nome} />

    </Container>
  );
}

function ConsultaCta({ to, nome }: { to: string; nome: string }) {
  return (
    <section className="mt-6 flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
          <Icon name="urna" size={22} />
        </span>
        <div>
          <h2 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-fg">Você vota em {nome}?</h2>
          <p className="mt-0.5 text-[14px] text-fg-muted">Informe a zona e a seção do seu título para abrir o boletim da sua urna.</p>
        </div>
      </div>
      <ButtonLink to={to} variant="secondary" icon="busca" className="shrink-0">
        Consultar minha seção
      </ButtonLink>
    </section>
  );
}
