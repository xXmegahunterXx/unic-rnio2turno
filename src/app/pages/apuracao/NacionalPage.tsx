/**
 * /apuracao — a vitrine da noite da eleição: placar nacional, mapa por UF, corrida da apuração, feed,
 * regiões, participação, todos os estados, exterior e as 7 disputas de governador.
 *
 * Fases: 'pre' → contagem regressiva + 1º turno real (corridas '-t1'); 'apurando' → ao vivo;
 * 'encerrada' → resultado final. `?race=gov-xx` redireciona para a página da UF.
 */
import { useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { LiveStatus, NationalSnapshot, Race, RaceId } from '@/shared/types';
import type { PublicMeta } from '@/shared/api';
import { INICIO_APURACAO } from '@/shared/constants';
import { useMeta, useNacional, useStatus } from '@/app/data/hooks';
import { useRaceParam } from '@/app/lib/useRaceParam';
import { useIsDesktop } from '@/app/lib/useMediaQuery';
import { useSimNow } from '@/app/lib/useNow';
import { Button, ButtonLink } from '@/app/ui/Button';
import { Badge } from '@/app/ui/Badge';
import { Icon } from '@/app/ui/Icon';
import { Container } from '@/app/components/layout/Container';
import { cn } from '@/app/lib/cn';
import { Placar } from '@/app/components/apuracao/Placar';
import { RaceSwitcher } from '@/app/components/apuracao/RaceSwitcher';
import { RestantePanel } from '@/app/components/apuracao/RestantePanel';
import { ShareButton } from '@/app/components/apuracao/ShareCard';
import { EmptyState, ErrorState } from '@/app/components/apuracao/States';
import { Topo, SeloFase } from '@/app/components/pages/nacional/Topo';
import { PreHero } from '@/app/components/pages/nacional/PreHero';
import { MapaPanel } from '@/app/components/pages/nacional/MapaPanel';
import { CorridaPanel } from '@/app/components/pages/nacional/CorridaPanel';
import { FeedPanel } from '@/app/components/pages/nacional/FeedPanel';
import { ComparacaoT1 } from '@/app/components/pages/nacional/ComparacaoT1';
import { ExteriorCard } from '@/app/components/pages/nacional/ExteriorCard';
import { EleitoBanner } from '@/app/components/pages/nacional/EleitoBanner';
import { GovernadoresFaixa } from '@/app/components/pages/nacional/GovernadoresFaixa';
import { EstadosSecao, LiderancaCard, ParticipacaoSecao, RegioesCard } from '@/app/components/pages/nacional/Blocos';
import { NacionalEsqueleto } from '@/app/components/pages/nacional/Esqueletos';
import { ehSimulado, ehT1, raceExibida, semT1, ufDaRace } from '@/app/components/pages/nacional/fase';

/** Coluna lateral do desktop; no celular os filhos entram direto na grade (ordem por `order-*`). */
const COLUNA = 'contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6';

export default function NacionalPage() {
  const [raceParam, setRace] = useRaceParam();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const metaQ = useMeta();
  const statusQ = useStatus();
  const status = statusQ.data;

  const raceId = raceExibida(raceParam, status);
  const t1 = ehT1(raceId);
  const q = useNacional(raceId);
  // 1º turno sempre à mão: modo "variação" do mapa, comparação e Sheet da UF (em t1 é a mesma consulta).
  const qT1 = useNacional(`${semT1(raceId)}-t1`);

  const trocarDisputa = useCallback(
    (id: RaceId) => {
      if (id.startsWith('gov')) navigate('/governadores');
      else setRace(id);
    },
    [navigate, setRace],
  );

  // ?race=gov-xx → página da UF (o placar de governador vive lá).
  const ufGov = ufDaRace(raceParam);
  if (ufGov) return <Navigate to={`/apuracao/${ufGov.toLowerCase()}?race=${raceParam}`} replace />;

  const meta = metaQ.data;
  const race = meta?.races.find((r) => r.id === raceId);
  const raceT1 = meta?.races.find((r) => r.id === `${semT1(raceId)}-t1`);
  const race2T = meta?.races.find((r) => r.id === semT1(raceId));
  const statusPronto = !!status || statusQ.isError;

  if (meta && !race) return <DisputaInexistente id={raceParam} />;
  const naoEncontrado = (q.error as { name?: string; status?: number } | null)?.name === 'NotFoundError' || (q.error as { status?: number } | null)?.status === 404;
  if (naoEncontrado) return <DisputaInexistente id={raceParam} />;

  const data = q.data && q.data.race === raceId ? q.data : undefined;
  if (!data && (q.isError || metaQ.isError)) {
    return (
      <Container wide>
        <ErrorState
          onRetry={() => {
            q.refetch();
            metaQ.refetch();
          }}
        />
      </Container>
    );
  }
  if (!meta || !race || !data || !statusPronto) {
    return (
      <Container wide className="pb-10">
        <NacionalEsqueleto />
      </Container>
    );
  }

  const pre = status?.fase === 'pre';
  const simulado = ehSimulado(status, race);
  const dataT1 = qT1.data && qT1.data.race === `${semT1(raceId)}-t1` ? qT1.data : undefined;
  const resumo = data.resumo;
  const definido = race.turno === 2 && resumo.eleito !== null;

  return (
    <Container wide className="pb-6 sm:pb-10">
      <Topo
        eyebrow={
          <>
            Apuração · {t1 ? '4' : '25'} de outubro<span className="hidden sm:inline"> de 2026</span>
          </>
        }
        titulo="Presidente"
        contexto={t1 ? '1º turno' : '2º turno'}
        selos={<SeloFase status={status} resumo={resumo} t1={t1} />}
        seletor={<RaceSwitcher races={meta.races} value={raceParam} onChange={trocarDisputa} size={desktop ? 'md' : 'sm'} />}
        acoes={<ShareButton race={race} resumo={resumo} simulado={simulado} caminho={t1 && !pre ? '/apuracao?race=pres-t1' : '/apuracao'} iconOnly={!desktop} size={desktop ? 'md' : 'sm'} />}
      />

      {pre ? (
        <>
          <PreHeroVivo status={status} race={race2T} />
          <div id="primeiro-turno" className="mb-4 mt-8 scroll-mt-28 sm:mb-5 sm:mt-12">
            <Badge tone="brand" size="sm" icon="check-circulo" caps>
              Resultado oficial do 1º turno · TSE
            </Badge>
            <h2 className="mt-2.5 text-balance font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[32px]">
              Enquanto isso, veja como foi o 1º turno
            </h2>
            <p className="mt-1.5 max-w-2xl text-pretty text-[14.5px] leading-relaxed text-fg-muted">
              Votação de 4 de outubro, com 100% das seções totalizadas. Os dois mais votados disputam o 2º turno; os demais aparecem somados em
              “Outros”.
            </p>
          </div>
        </>
      ) : t1 ? (
        <AvisoPrimeiroTurno onVoltar={() => setRace('pres')} />
      ) : null}

      {/*
        Celular: uma coluna na ordem placar → o que falta → mapa → corrida → feed → tabelas (classes order-*).
        Desktop: grade de 12 colunas; as colunas laterais são flex (no celular viram `contents` e os
        filhos entram direto na grade, o que permite reordenar sem duplicar componentes).
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <div className={cn(COLUNA, 'lg:col-span-7')}>
          <Placar
            race={race}
            resumo={resumo}
            variant="hero"
            simulado={simulado}
            titulo={t1 ? 'Presidente · resultado do 1º turno' : undefined}
            className={cn('order-1 lg:order-none', t1 && 'lg:flex-1')}
          />
          {!t1 ? <CorridaPanel className="order-4 lg:order-none lg:flex-1" serie={data.serie} race={race} /> : null}
        </div>

        <div className={cn(COLUNA, 'lg:col-span-5')}>
          <MapaPanel
            className={cn(t1 ? 'order-2' : 'order-3', 'lg:order-none lg:flex-1')}
            race={race}
            ufs={data.ufs}
            primeiroTurno={!t1 ? dataT1?.ufs : undefined}
            raceT1={raceT1}
            raceLink={raceParam}
            simulado={simulado}
          />
          {!t1 && definido ? <EleitoBanner className="order-2 lg:order-none" race={race} resumo={resumo} restante={data.restante} /> : null}
          {!t1 && !definido ? <RestantePanel className="order-2 lg:order-none" race={race} resumo={resumo} restante={data.restante} /> : null}
        </div>

        {!t1 ? (
          <>
            <FeedPanel className="order-5 lg:order-none lg:col-span-5" eventos={data.eventos} race={race} />
            <RegioesCard className="order-7 lg:order-none lg:col-span-7" race={race} regioes={data.regioes} />
          </>
        ) : null}

        <ParticipacaoSecao className={cn(t1 ? 'order-5' : 'order-8', 'pt-2 lg:order-none lg:col-span-12 lg:pt-4')} t={resumo} t1={t1} />

        <GovernadoresFaixa className={cn(t1 ? 'order-6' : 'order-9', 'pt-2 lg:order-none lg:col-span-12 lg:pt-4')} races={meta.races} t1={t1} linkT1={t1 && !pre} />

        <EstadosSecao className={cn(t1 ? 'order-7' : 'order-10', 'pt-2 lg:order-none lg:col-span-8 lg:pt-4')} race={race} ufs={data.ufs} raceLink={raceParam} />
        <div className={cn(COLUNA, 'lg:col-span-4 lg:pt-[5.25rem]')}>
          {!t1 ? (
            <>
              <ExteriorResumo className="order-11 lg:order-none" race={race} data={data} meta={meta} raceLink={raceParam} />
              <ComparacaoT1 className="order-6 lg:order-none" race={race} resumo={resumo} raceT1={raceT1} />
              <LiderancaCard className="order-12 lg:order-none" race={race} ufs={data.ufs} raceLink={raceParam} />
            </>
          ) : (
            <>
              <LiderancaCard className="order-3 lg:order-none" race={race} ufs={data.ufs} raceLink={raceParam} />
              <RegioesCard className="order-4 lg:order-none" race={race} regioes={data.regioes} />
              <ExteriorResumo className="order-8 lg:order-none" race={race} data={data} meta={meta} raceLink={raceParam} />
            </>
          )}
        </div>
      </div>
    </Container>
  );
}

function ExteriorResumo({
  race,
  data,
  meta,
  raceLink,
  className,
}: {
  race: Race;
  data: Pick<NationalSnapshot, 'ufs'>;
  meta: Pick<PublicMeta, 'ufs'>;
  raceLink: RaceId;
  className?: string;
}) {
  const zz = data.ufs.ZZ;
  if (!zz) return null;
  return <ExteriorCard className={className} race={race} resumo={zz} meta={meta.ufs.find((u) => u.uf === 'ZZ')} raceLink={raceLink} />;
}

/** Hero da contagem regressiva com o próprio relógio (o tique não re-renderiza a página). */
function PreHeroVivo({ status, race }: { status: LiveStatus | undefined; race?: Race }) {
  const statusQ = useStatus();
  const simNow = useSimNow(statusQ.data, statusQ.dataUpdatedAt);
  // Fonte 'pre' (produção antes do dia): relógio real. Simulação antes das 17h: relógio simulado.
  const agora = status?.fonte === 'pre' ? undefined : (simNow ?? undefined);
  return <PreHero alvo={status?.inicioApuracao ?? INICIO_APURACAO} agora={agora} race={race} ancora="primeiro-turno" />;
}

function AvisoPrimeiroTurno({ onVoltar }: { onVoltar: () => void }) {
  return (
    <div role="note" className="mb-4 flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand/[0.07] p-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2.5 text-[14px] leading-snug text-fg">
        <Icon name="info" size={18} className="mt-px shrink-0 text-brand-fg" />
        <span>
          Você está vendo o <strong className="font-semibold">resultado oficial do 1º turno</strong> (4 de outubro). A apuração do 2º turno está em
          outra visão.
        </span>
      </p>
      <Button variant="primary" size="sm" iconRight="seta" onClick={onVoltar} className="shrink-0 self-start sm:self-auto">
        Ver o 2º turno
      </Button>
    </div>
  );
}

function DisputaInexistente({ id }: { id: string }) {
  return (
    <Container className="py-6 sm:py-12">
      <EmptyState
        icon="busca"
        title="Disputa não encontrada"
        description={
          <>
            Não há uma disputa chamada <span className="font-mono text-[13px] text-fg">“{id}”</span>. Escolha uma das apurações disponíveis:
          </>
        }
        action={
          <div className="flex flex-wrap justify-center gap-2.5">
            <ButtonLink to="/apuracao" variant="primary" icon="urna">
              Presidente
            </ButtonLink>
            <ButtonLink to="/governadores" variant="outline" icon="grade">
              Governadores
            </ButtonLink>
          </div>
        }
      />
    </Container>
  );
}
