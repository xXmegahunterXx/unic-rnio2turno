/**
 * /governadores — as 7 disputas de governador do 2º turno lado a lado (AC, AM, DF, ES, RJ, RN, TO):
 * mini mapa por município, placar, diferença, progresso e selo de resultado definido; ordenável por
 * "mais apertadas". Na fase 'pre', contagem regressiva + o 1º turno real de governador nessas UFs.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import type { LiveStatus, UF } from '@/shared/types';
import { INICIO_APURACAO, UF_NOMES } from '@/shared/constants';
import { pctTotalizadas } from '@/shared/calc';
import { fmtPct, fmtPP } from '@/shared/format';
import { useAnonimizado, useMeta, useNacional, useRace, useRaces, useStatus } from '@/app/data/hooks';
import { useIsDesktop } from '@/app/lib/useMediaQuery';
import { useSimNow } from '@/app/lib/useNow';
import { compartilhar, urlAbsoluta } from '@/app/lib/share';
import { Badge } from '@/app/ui/Badge';
import { Button, IconButton } from '@/app/ui/Button';
import { Segmented } from '@/app/ui/Segmented';
import { Container } from '@/app/components/layout/Container';
import { ErrorState } from '@/app/components/apuracao/States';
import { Topo, SeloAnonimo, SeloFase } from '@/app/components/pages/nacional/Topo';
import { PreHero } from '@/app/components/pages/nacional/PreHero';
import { GovernadorCard, PresidenteCard, difFinalistas } from '@/app/components/pages/nacional/GovernadorCard';
import { GovernadorCartaoSk, GovernadoresEsqueleto } from '@/app/components/pages/nacional/Esqueletos';
import { useGovernadoresUf } from '@/app/components/pages/nacional/useGovernadores';
import { GOV_RACES, linkUf } from '@/app/components/pages/nacional/fase';
import { cn } from '@/app/lib/cn';

type Ordem = 'apertadas' | 'apuradas' | 'az';
const CHAVE_ORDEM = 'sintonia:governadores:ordem';

function ordemInicial(): Ordem {
  try {
    const v = localStorage.getItem(CHAVE_ORDEM);
    if (v === 'apertadas' || v === 'apuradas' || v === 'az') return v;
  } catch {
    /* sem armazenamento: padrão */
  }
  return 'apertadas';
}

export default function GovernadoresPage() {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const reduzir = useReducedMotion();
  const metaQ = useMeta();
  const statusQ = useStatus();
  const status = statusQ.data;
  const pre = status?.fase === 'pre';
  const govs = useGovernadoresUf(pre);
  const presQ = useNacional(pre ? 'pres-t1' : 'pres');
  // Corridas SEMPRE por useRace/useRaces: na simulação os nomes viram "Candidato A/B".
  const races = useRaces();
  const presRace = useRace(pre ? 'pres-t1' : 'pres');
  const anonimizado = useAnonimizado();
  const [ordem, setOrdemEstado] = useState<Ordem>(ordemInicial);
  const setOrdem = (o: Ordem) => {
    setOrdemEstado(o);
    try {
      localStorage.setItem(CHAVE_ORDEM, o);
    } catch {
      /* ignora */
    }
  };

  const meta = metaQ.data;
  // 7 itens: ordenar a cada render é trivial (sem memo).
  const itens = (() => {
    const lista = govs.map((g) => {
      const race = races?.find((r) => r.id === g.id);
      const snap = g.q.data && g.q.data.race === g.id ? g.q.data : undefined;
      return { ...g, race, snap };
    });
    const dif = (x: (typeof lista)[number]) => (x.snap ? (difFinalistas(x.snap.resumo) ?? Infinity) : Infinity);
    const apur = (x: (typeof lista)[number]) => (x.snap ? pctTotalizadas(x.snap.resumo) : -1);
    const az = (a: (typeof lista)[number], b: (typeof lista)[number]) => UF_NOMES[a.uf].localeCompare(UF_NOMES[b.uf], 'pt-BR');
    return [...lista].sort((a, b) => {
      if (ordem === 'apertadas') return dif(a) - dif(b) || az(a, b);
      if (ordem === 'apuradas') return apur(b) - apur(a) || az(a, b);
      return az(a, b);
    });
  })();

  const erroTotal = govs.every((g) => g.q.isError && !g.q.data);
  if (metaQ.isError || erroTotal) {
    return (
      <Container wide>
        <ErrorState
          onRetry={() => {
            metaQ.refetch();
            govs.forEach((g) => g.q.refetch());
          }}
        />
      </Container>
    );
  }
  if (!meta || !races || (!status && !statusQ.isError)) {
    return (
      <Container wide className="pb-10">
        <GovernadoresEsqueleto />
      </Container>
    );
  }

  const presData = presQ.data && presRace && presQ.data.race === presRace.id ? presQ.data : undefined;
  const resumos = itens.filter((x) => x.snap).map((x) => x.snap!.resumo);
  const definidas = pre ? 0 : resumos.filter((r) => r.eleito !== null).length;
  const comVotos = itens.filter((x) => x.snap && difFinalistas(x.snap.resumo) !== null);
  const maisApertada = comVotos.length ? comVotos.reduce((a, b) => (difFinalistas(a.snap!.resumo)! <= difFinalistas(b.snap!.resumo)! ? a : b)) : null;
  const secoes = resumos.reduce((s, r) => s + r.secoes, 0);
  const totalizadas = resumos.reduce((s, r) => s + r.secoesTotalizadas, 0);

  const compartilharPagina = () =>
    compartilhar({
      titulo: 'Sintonia · Governadores',
      texto: pre
        ? 'Governador no 2º turno em 7 estados (AC, AM, DF, ES, RJ, RN e TO): veja o 1º turno e acompanhe a apuração ao vivo.'
        : `${status?.simulacao ? '[SIMULAÇÃO] ' : ''}Apuração do 2º turno para governador em 7 estados, ao vivo e seção por seção.`,
      url: urlAbsoluta('/governadores'),
    });

  return (
    <Container wide className="pb-6 sm:pb-10">
      <Topo
        eyebrow={
          <>
            Apuração · {pre ? '4' : '25'} de outubro<span className="hidden sm:inline"> de 2026</span>
          </>
        }
        titulo="Governadores"
        contexto={pre ? '1º turno' : '2º turno'}
        selos={
          <>
            <SeloFase status={status} t1={pre} />
            {anonimizado ? <SeloAnonimo /> : null}
          </>
        }
        seletor={
          <Segmented<'pres' | 'gov'>
            ariaLabel="Disputa"
            size={desktop ? 'md' : 'sm'}
            value="gov"
            onChange={(v) => v === 'pres' && navigate('/apuracao')}
            options={[
              { value: 'pres', label: 'Presidente' },
              { value: 'gov', label: 'Governador' },
            ]}
          />
        }
        acoes={
          desktop ? (
            <Button icon="compartilhar" onClick={compartilharPagina}>
              Compartilhar
            </Button>
          ) : (
            <IconButton icon="compartilhar" label="Compartilhar" size="sm" onClick={compartilharPagina} />
          )
        }
      />

      {pre ? (
        <>
          <PreHeroGov status={status} />
          <div id="primeiro-turno-gov" className="mb-4 mt-8 scroll-mt-28 sm:mb-5 sm:mt-12">
            <Badge tone="brand" size="sm" icon="check-circulo" caps>
              Resultado oficial do 1º turno · TSE
            </Badge>
            <h2 className="mt-2.5 text-balance font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[32px]">
              Como foi o 1º turno nesses estados
            </h2>
            <p className="mt-1.5 max-w-2xl text-pretty text-[14.5px] leading-relaxed text-fg-muted">
              Votação de 4 de outubro. Ninguém passou de 50% dos válidos, por isso há 2º turno; os demais candidatos aparecem somados.
            </p>
          </div>
        </>
      ) : (
        <p className="-mt-1 mb-5 max-w-3xl text-pretty text-[14.5px] leading-relaxed text-fg-muted sm:mb-6">
          Sete estados escolhem o governador no 2º turno. Toque num cartão para ver o mapa por município, as zonas e o boletim de cada seção.
        </p>
      )}

      {!pre ? (
        <dl className="mb-6 grid grid-cols-2 gap-2 sm:mb-7 sm:grid-cols-3 sm:gap-3">
          <Resumo className="order-1" rotulo="Definidas" valor={`${definidas} de 7`} sub={definidas ? 'resultado matemático' : 'nenhuma ainda'} />
          <Resumo
            className="order-3 col-span-2 sm:order-2 sm:col-span-1"
            rotulo="Mais apertada"
            valor={maisApertada ? UF_NOMES[maisApertada.uf] : '—'}
            sub={maisApertada ? `${fmtPP(difFinalistas(maisApertada.snap!.resumo)!).replace('+', '')} de diferença entre os dois` : 'aguardando votos'}
          />
          <Resumo
            className="order-2 sm:order-3"
            rotulo="Seções"
            valor={secoes ? fmtPct(pctTotalizadas({ secoes, secoesTotalizadas: totalizadas })) : '—'}
            sub="totalizadas nos 7 estados"
          />
        </dl>
      ) : null}

      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 sm:mb-4">
        <h2 className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]">
          {pre ? 'As 7 disputas no 1º turno' : 'As 7 disputas'}
        </h2>
        <Segmented<Ordem>
          ariaLabel="Ordenar disputas"
          size="sm"
          value={ordem}
          onChange={setOrdem}
          options={[
            { value: 'apertadas', label: 'Mais apertadas' },
            { value: 'apuradas', label: 'Mais apuradas' },
            { value: 'az', label: 'A–Z' },
          ]}
        />
      </div>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
        {itens.map((x) => (
          <motion.li key={x.uf} layout={reduzir ? false : 'position'} transition={{ type: 'spring', stiffness: 260, damping: 32 }} className="min-w-0">
            {x.race && x.snap ? (
              <GovernadorCard uf={x.uf} race={x.race} resumo={x.snap.resumo} municipios={x.snap.municipios} to={linkUf(x.uf, x.base)} />
            ) : x.q.isError ? (
              <div className="flex h-full items-center rounded-2xl border border-line bg-surface p-4">
                <ErrorState compact title={`Não foi possível carregar ${UF_NOMES[x.uf]}`} message={null} onRetry={() => x.q.refetch()} />
              </div>
            ) : (
              <GovernadorCartaoSk />
            )}
          </motion.li>
        ))}
        <motion.li layout={reduzir ? false : 'position'} className="min-w-0">
          {presRace && presData ? (
            <PresidenteCard
              race={presRace}
              resumo={presData.resumo}
              ufs={presData.ufs}
              sub={pre ? '1º turno · resultado oficial' : 'Também neste domingo · Brasil'}
              to="/apuracao"
            />
          ) : (
            <GovernadorCartaoSk />
          )}
        </motion.li>
      </ul>

      <p className="mt-6 text-[12.5px] leading-snug text-fg-muted">
        Nas outras 20 unidades da federação o governador foi definido no 1º turno. Fonte dos dados reais: TSE.
      </p>
    </Container>
  );
}

function Resumo({ rotulo, valor, sub, className }: { rotulo: string; valor: string; sub: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card sm:px-4 sm:py-3.5', className)}>
      <dt className="truncate text-[11px] font-semibold uppercase leading-tight tracking-[0.1em] text-fg-muted sm:text-[11.5px]">{rotulo}</dt>
      <dd className="num mt-auto truncate pt-2 font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[26px]">{valor}</dd>
      <dd className="mt-1.5 truncate text-[12px] leading-snug text-fg-muted sm:text-[12.5px]">{sub}</dd>
    </div>
  );
}

function PreHeroGov({ status }: { status: LiveStatus | undefined }) {
  const statusQ = useStatus();
  const simNow = useSimNow(statusQ.data, statusQ.dataUpdatedAt);
  const agora = status?.fonte === 'pre' ? undefined : (simNow ?? undefined);
  return (
    <PreHero
      alvo={status?.inicioApuracao ?? INICIO_APURACAO}
      agora={agora}
      titulo="A apuração para governador começa às 17h"
      descricao="Acre, Amazonas, Distrito Federal, Espírito Santo, Rio de Janeiro, Rio Grande do Norte e Tocantins escolhem o governador no 2º turno. Os resultados aparecem aqui ao vivo, município por município."
      ancora="primeiro-turno-gov"
      extra={<SiglasGov />}
    />
  );
}

function SiglasGov() {
  return (
    <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Estados com 2º turno para governador">
      {GOV_RACES.map((g) => (
        <li key={g.uf} className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2/70 px-3 text-[13px] text-fg')}>
          <span className="font-mono text-[11.5px] font-semibold">{g.uf}</span>
          <span className="hidden text-fg-muted sm:inline">{UF_NOMES[g.uf as UF]}</span>
        </li>
      ))}
    </ul>
  );
}

