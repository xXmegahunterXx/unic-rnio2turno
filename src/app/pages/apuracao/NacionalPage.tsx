/**
 * /apuracao — a vitrine da noite da eleição: placar nacional, mapa por UF, corrida da apuração, feed,
 * regiões, participação, todos os estados, exterior e as 7 disputas de governador.
 *
 * Fases: 'pre' → contagem regressiva + 1º turno real (corridas '-t1'); 'apurando' → ao vivo;
 * 'encerrada' → resultado final. `?race=gov-xx` redireciona para a página da UF.
 *
 * "Reveja a noite": `?t=18h42` mostra placar, mapa (estados e municípios), corrida e feed naquele instante
 * (LinhaDoTempo). Sem `t` = ao vivo. Também: link para o Modo TV, "N pessoas agora" (só no servidor) e o
 * patrocínio discreto quando configurado no admin.
 */
import { useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { LiveStatus, NationalSnapshot, Race, RaceId } from '@/shared/types';
import type { PublicMeta } from '@/shared/api';
import { INICIO_APURACAO } from '@/shared/constants';
import { useAnonimizado, useMeta, useNacional, useRace, useRaces, useStatus } from '@/app/data/hooks';
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
import { LinkModoTv, Topo, SeloAnonimo, SeloFase } from '@/app/components/pages/nacional/Topo';
import { LinhaDoTempo, comInstante, useInstanteParam } from '@/app/components/apuracao/LinhaDoTempo';
import { PessoasAgora } from '@/app/components/apuracao/PessoasAgora';
import { PatrocinioSlot } from '@/app/components/apuracao/PatrocinioSlot';
import { PreHero } from '@/app/components/pages/nacional/PreHero';
import { MapaPanel } from '@/app/components/pages/nacional/MapaPanel';
import { CorridaPanel } from '@/app/components/pages/nacional/CorridaPanel';
import { FeedPanel } from '@/app/components/pages/nacional/FeedPanel';
import { ComparacaoT1 } from '@/app/components/pages/nacional/ComparacaoT1';
import { ExteriorCard } from '@/app/components/pages/nacional/ExteriorCard';
import { EleitoradoT1 } from '@/app/components/pages/nacional/EleitoradoT1';
import { EleitoBanner } from '@/app/components/pages/nacional/EleitoBanner';
import { GovernadoresFaixa } from '@/app/components/pages/nacional/GovernadoresFaixa';
import { EstadosSecao, LiderancaCard, ParticipacaoSecao, RegioesCard } from '@/app/components/pages/nacional/Blocos';
import { NacionalEsqueleto } from '@/app/components/pages/nacional/Esqueletos';
import { ehSimulado, ehT1, raceExibida, semT1, ufDaRace } from '@/app/components/pages/nacional/fase';

/** Coluna do desktop largo (≥ 1360 px); abaixo disso os filhos entram direto na grade (ordem por `order-*`). */
const COLUNA = 'contents min-[1360px]:flex min-[1360px]:min-w-0 min-[1360px]:flex-col min-[1360px]:gap-6';

export default function NacionalPage() {
  const [raceParam, setRace] = useRaceParam();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const metaQ = useMeta();
  const statusQ = useStatus();
  const status = statusQ.data;

  const raceId = raceExibida(raceParam, status);
  const t1 = ehT1(raceId);
  // Corridas SEMPRE por useRace/useRaces: na simulação os nomes viram "Candidato A/B".
  const races = useRaces();
  const race = useRace(raceId);
  const raceT1 = useRace(`${semT1(raceId)}-t1`);
  const race2T = useRace(semT1(raceId));
  const anonimizado = useAnonimizado();
  // "Reveja a noite": instante passado na URL (só no 2º turno; o 1º turno é o resultado final).
  const { t: tUrl, setT } = useInstanteParam(status, statusQ.dataUpdatedAt);
  const t = t1 ? undefined : tUrl;
  const q = useNacional(raceId, t);
  // Série/eventos AO VIVO para os marcos da régua (mesma consulta de `q` quando não há `t`).
  const qVivo = useNacional(raceId);
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
  const statusPronto = !!status || statusQ.isError;

  if (races && !race) return <DisputaInexistente id={raceParam} />;
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
  if (!meta || !races || !race || !data || !statusPronto) {
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
  const semApuracao = resumo.secoesTotalizadas === 0;
  const vivo = qVivo.data && qVivo.data.race === raceId ? qVivo.data : undefined;
  const caminhoShare = t1 && !pre ? '/apuracao?race=pres-t1' : comInstante('/apuracao', t);
  const tvQs = raceParam !== 'pres' && !raceParam.endsWith('-t1') ? `?race=${raceParam}` : '';

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
        selos={
          <>
            <SeloFase status={status} resumo={resumo} t1={t1} revendo={t} />
            {!t ? <PessoasAgora status={status} /> : null}
            {anonimizado ? <SeloAnonimo /> : null}
            {/* No celular, só o cartão no fim da página (discreto, sem empurrar o placar). */}
            {status?.patrocinio ? <PatrocinioSlot patrocinio={status.patrocinio} className="hidden sm:ml-auto sm:inline-flex" /> : null}
          </>
        }
        seletor={<RaceSwitcher races={races} value={raceParam} onChange={trocarDisputa} size={desktop ? 'md' : 'sm'} />}
        acoes={
          <>
            {!pre ? <LinkModoTv compacto={!desktop} raceQs={tvQs} /> : null}
            <ShareButton race={race} resumo={resumo} simulado={simulado} caminho={caminhoShare} iconOnly={!desktop} size={desktop ? 'md' : 'sm'} />
          </>
        }
      />

      {!pre && !t1 && status && vivo ? (
        <LinhaDoTempo
          status={status}
          recebidoEm={statusQ.dataUpdatedAt}
          serie={vivo.serie}
          eventos={vivo.eventos}
          cores={race.candidatos.map((c) => c.cor)}
          t={t}
          onChange={setT}
          carregando={q.isPlaceholderData}
          className="mb-4 sm:mb-6"
        />
      ) : null}

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
        Celular, tablet e notebooks até 1359 px: uma coluna, na ordem das classes order-*
        (placar → o que falta → mapa → corrida → feed → tabelas). O placar "hero" precisa de ~750 px para
        os números gigantes não encostarem na diferença, por isso a divisão 7/5 só entra a partir de 1360 px.
        Desktop largo: grade de 12 colunas; as colunas laterais são flex (abaixo disso viram `contents` e
        os filhos entram direto na grade, o que permite reordenar sem duplicar componentes).
      */}
      {t1 ? (
        <div className="grid grid-cols-1 gap-4 min-[1360px]:grid-cols-12 min-[1360px]:gap-6">
          <div className={cn(COLUNA, 'min-[1360px]:col-span-7')}>
            <Placar race={race} resumo={resumo} variant="hero" simulado={simulado} titulo="Presidente · resultado do 1º turno" className="order-1 min-[1360px]:order-none" />
            <EleitoradoT1 className="order-3 min-[1360px]:order-none min-[1360px]:flex-1" race={race} resumo={resumo} />
          </div>
          <div className={cn(COLUNA, 'min-[1360px]:col-span-5')}>
            <MapaPanel className="order-2 min-[1360px]:order-none min-[1360px]:flex-1" race={race} ufs={data.ufs} raceLink={raceParam} simulado={simulado} anonimizado={anonimizado} />
            <LiderancaCard className="order-4 min-[1360px]:order-none" race={race} ufs={data.ufs} raceLink={raceParam} />
          </div>

          <ParticipacaoSecao className="order-6 pt-2 min-[1360px]:order-none min-[1360px]:col-span-12 min-[1360px]:pt-4" t={resumo} t1 />
          <GovernadoresFaixa className="order-7 pt-2 min-[1360px]:order-none min-[1360px]:col-span-12 min-[1360px]:pt-4" races={races} t1 linkT1={!pre} />

          <EstadosSecao className="order-8 pt-2 min-[1360px]:order-none min-[1360px]:col-span-8 min-[1360px]:pt-4" race={race} ufs={data.ufs} raceLink={raceParam} />
          <div className={cn(COLUNA, 'min-[1360px]:col-span-4 min-[1360px]:pt-[5.25rem]')}>
            <RegioesCard className="order-5 min-[1360px]:order-none" race={race} regioes={data.regioes} />
            <ExteriorResumo className="order-9 min-[1360px]:order-none" race={race} data={data} meta={meta} raceLink={raceParam} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[1360px]:grid-cols-12 min-[1360px]:gap-6">
          <div className={cn(COLUNA, 'min-[1360px]:col-span-7')}>
            <Placar race={race} resumo={resumo} variant="hero" simulado={simulado} className="order-1 min-[1360px]:order-none" />
            <CorridaPanel className="order-4 min-[1360px]:order-none min-[1360px]:flex-1" serie={data.serie} race={race} />
          </div>
          <div className={cn(COLUNA, 'min-[1360px]:col-span-5')}>
            <MapaPanel
              className="order-2 min-[1360px]:order-none min-[1360px]:flex-1"
              race={race}
              ufs={data.ufs}
              primeiroTurno={dataT1?.ufs}
              raceT1={raceT1}
              raceLink={raceParam}
              simulado={simulado}
              anonimizado={anonimizado}
              t={t}
            />
            {definido ? (
              <EleitoBanner className="order-3 min-[1360px]:order-none" race={race} resumo={resumo} restante={data.restante} />
            ) : (
              <RestantePanel className="order-3 min-[1360px]:order-none" race={race} resumo={resumo} restante={data.restante} />
            )}
          </div>

          {/* Antes da 1ª seção totalizada as regiões não têm o que mostrar: o feed ocupa a linha inteira. */}
          <FeedPanel className={cn('order-5 min-[1360px]:order-none', semApuracao ? 'min-[1360px]:col-span-12' : 'min-[1360px]:col-span-5')} eventos={data.eventos} race={race} largo={semApuracao} />
          {!semApuracao ? <RegioesCard className="order-7 min-[1360px]:order-none min-[1360px]:col-span-7" race={race} regioes={data.regioes} /> : null}

          <ParticipacaoSecao className="order-8 pt-2 min-[1360px]:order-none min-[1360px]:col-span-12 min-[1360px]:pt-4" t={resumo} />
          <GovernadoresFaixa className="order-9 pt-2 min-[1360px]:order-none min-[1360px]:col-span-12 min-[1360px]:pt-4" races={races} t1={false} />

          <EstadosSecao className="order-10 pt-2 min-[1360px]:order-none min-[1360px]:col-span-8 min-[1360px]:pt-4" race={race} ufs={data.ufs} raceLink={raceParam} t={t} />
          <div className={cn(COLUNA, 'min-[1360px]:col-span-4 min-[1360px]:pt-[5.25rem]')}>
            <ExteriorResumo className="order-11 min-[1360px]:order-none" race={race} data={data} meta={meta} raceLink={raceParam} t={t} />
            <ComparacaoT1 className="order-6 min-[1360px]:order-none" race={race} resumo={resumo} raceT1={raceT1} anonimizado={anonimizado} />
            <LiderancaCard className="order-12 min-[1360px]:order-none" race={race} ufs={data.ufs} raceLink={raceParam} t={t} />
          </div>
        </div>
      )}

      {status?.patrocinio ? <PatrocinioSlot patrocinio={status.patrocinio} variant="cartao" className="mt-8 sm:mt-10" /> : null}
    </Container>
  );
}

function ExteriorResumo({
  race,
  data,
  meta,
  raceLink,
  t,
  className,
}: {
  race: Race;
  data: Pick<NationalSnapshot, 'ufs'>;
  meta: Pick<PublicMeta, 'ufs'>;
  raceLink: RaceId;
  t?: number;
  className?: string;
}) {
  const zz = data.ufs.ZZ;
  if (!zz) return null;
  return <ExteriorCard className={className} race={race} resumo={zz} meta={meta.ufs.find((u) => u.uf === 'ZZ')} raceLink={raceLink} t={t} />;
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
