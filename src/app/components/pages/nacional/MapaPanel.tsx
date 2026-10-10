/**
 * Cartão do mapa nacional: modo de coloração, alternância Estados | Municípios | Blocos (cartograma), legenda e
 * resumo. "Municípios" (5.571, canvas) só baixa a geometria (~2 MB) quando escolhido e não fica salvo como padrão
 * entre visitas (dados móveis), só na sessão.
 *
 * - Desktop (mouse/teclado): hover mostra o tooltip do mapa; clique navega para a UF.
 * - Toque: abre um Sheet com o placar compacto da UF e o botão "Ver <UF>" (interceptamos o clique na
 *   fase de captura para não cair no tooltip "toque duplo" do componente de mapa).
 * - Memoizado: só re-renderiza quando os dados das UFs (referência estável do React Query, que faz
 *   structural sharing) ou o modo mudam — não a cada poll do status.
 */
import { lazy, memo, Suspense, useCallback, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Race, RaceId, Summary, Tally, UF } from '@/shared/types';
import { REGIAO_NOMES, UF_NOMES, UF_REGIAO } from '@/shared/constants';
import { margem, pctAbstencao, pctComparecimento, pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { ButtonLink } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { Segmented } from '@/app/ui/Segmented';
import { Sheet } from '@/app/ui/Sheet';
import { BrazilMap } from '@/app/components/apuracao/BrazilMap';
import { useMunicipiosBr } from '@/app/data/hooks';
import { comInstante } from '@/app/components/apuracao/LinhaDoTempo';

import type { MunicipioSelecionado } from '@/app/components/apuracao/BrazilMunicipiosMap';
import { TileMap } from '@/app/components/apuracao/TileMap';
import { MapLegend } from '@/app/components/apuracao/MapLegend';
import { MapModeSwitch } from '@/app/components/apuracao/MapModeSwitch';
import { Placar } from '@/app/components/apuracao/Placar';
import { EmptyState } from '@/app/components/apuracao/States';
import type { MapMode } from '@/app/components/apuracao/mapModes';
import { linkUf, qsRace, semT1 } from './fase';

// Canvas dos municípios num pedaço à parte (só baixa quando a pessoa escolhe "Municípios").
const BrazilMunicipiosMap = lazy(() => import('@/app/components/apuracao/BrazilMunicipiosMap').then((m) => ({ default: m.BrazilMunicipiosMap })));

type Vista = 'mapa' | 'municipios' | 'cartograma';
// v2: o padrão passou a ser sempre o mapa geográfico do Brasil (escolhas antigas do padrão automático são descartadas).
const CHAVE_VISTA = 'sintonia:nacional:vista:v2';
/** "Municípios" vale só na sessão (não força ~2 MB de geometria a cada visita). */
const CHAVE_VISTA_SESSAO = 'sintonia:nacional:vista:sessao';

function vistaInicial(): Vista {
  try {
    if (sessionStorage.getItem(CHAVE_VISTA_SESSAO) === 'municipios') return 'municipios';
    const v = localStorage.getItem(CHAVE_VISTA);
    if (v === 'mapa' || v === 'cartograma') return v;
  } catch {
    /* armazenamento indisponível: segue o padrão */
  }
  // Padrão em todas as telas: o mapa do Brasil de verdade. O cartograma fica como alternativa opcional.
  return 'mapa';
}

const MODOS_2T: MapMode[] = ['vencedor', 'margem', 'apurado', 'comparecimento', 'variacao'];
const MODOS_2T_SEM_T1: MapMode[] = ['vencedor', 'margem', 'apurado', 'comparecimento'];
const MODOS_1T: MapMode[] = ['vencedor', 'margem', 'comparecimento'];

export interface MapaPanelProps {
  race: Race;
  ufs: Partial<Record<UF, Summary>>;
  /** Resumos do 1º turno por UF (modo "variação" e comparação no Sheet). */
  primeiroTurno?: Partial<Record<UF, Summary>>;
  /** Corrida do 1º turno (rótulos da comparação no Sheet). */
  raceT1?: Race;
  /** Corrida usada nos links (a que o usuário pediu). */
  raceLink: RaceId;
  simulado?: boolean;
  /** Simulação com nomes ocultos: o Sheet não mostra os números (reais) do 1º turno. */
  anonimizado?: boolean;
  /** "Reveja a noite": instante exibido (undefined = ao vivo) — vale também para o mapa por município e os links. */
  t?: number;
  className?: string;
}

export const MapaPanel = memo(function MapaPanel({ race, ufs, primeiroTurno, raceT1, raceLink, simulado, anonimizado, t, className }: MapaPanelProps) {
  const navigate = useNavigate();
  const t1 = race.turno === 1;
  const modos = t1 ? MODOS_1T : primeiroTurno ? MODOS_2T : MODOS_2T_SEM_T1;
  const [modoEscolhido, setModo] = useState<MapMode>('vencedor');
  const modo = modos.includes(modoEscolhido) ? modoEscolhido : 'vencedor';
  const [vista, setVistaEstado] = useState<Vista>(vistaInicial);
  const setVista = useCallback((v: Vista) => {
    setVistaEstado(v);
    try {
      if (v === 'municipios') sessionStorage.setItem(CHAVE_VISTA_SESSAO, v);
      else {
        sessionStorage.removeItem(CHAVE_VISTA_SESSAO);
        localStorage.setItem(CHAVE_VISTA, v);
      }
    } catch {
      /* ignora */
    }
  }, []);

  // Mapa por município: só consulta com a vista ativa (e o 1º turno só no modo "variação").
  const municipios = vista === 'municipios';
  const tMapa = t1 ? undefined : t;
  const brMun = useMunicipiosBr(race.id, tMapa, municipios);
  const brMunT1 = useMunicipiosBr(`${semT1(race.id)}-t1`, undefined, municipios && modo === 'variacao' && !t1);
  const snapMun = brMun.data && brMun.data.race === race.id ? brMun.data : undefined;
  const abrirMunicipio = useCallback(
    (m: MunicipioSelecionado) => navigate(comInstante(`/apuracao/${m.uf.toLowerCase()}/${m.cod}${qsRace(raceLink)}`, tMapa)),
    [navigate, raceLink, tMapa],
  );

  // Sheet do toque (guarda a última UF para a animação de saída).
  const [sheet, setSheet] = useState<{ uf: UF; aberto: boolean } | null>(null);
  const toqueEm = useRef(0);
  const abrirUf = useCallback((uf: UF) => navigate(linkUf(uf, raceLink, t)), [navigate, raceLink, t]);

  function onPointerDownCapture(e: PointerEvent) {
    toqueEm.current = e.pointerType === 'touch' ? performance.now() : 0;
  }
  function onClickCapture(e: MouseEvent) {
    if (!toqueEm.current || performance.now() - toqueEm.current > 1500) return;
    const alvo = (e.target as Element | null)?.closest?.('[data-uf]');
    const uf = alvo?.getAttribute('data-uf') as UF | null | undefined;
    if (!uf) return;
    e.stopPropagation();
    e.preventDefault();
    setSheet({ uf, aberto: true });
  }

  // Variação vs 1º turno: os mapas só precisam dos votos.
  const votosT1 = useMemo(() => {
    if (!primeiroTurno) return undefined;
    const out: Partial<Record<UF, Pick<Tally, 'votos'>>> = {};
    for (const [uf, s] of Object.entries(primeiroTurno) as [UF, Summary][]) out[uf] = { votos: s.votos };
    return out;
  }, [primeiroTurno]);

  const resumoMapa = useMemo(() => {
    let comVotos = 0;
    let encerradas = 0;
    let total = 0;
    for (const [uf, s] of Object.entries(ufs) as [UF, Summary][]) {
      if (!s || uf === 'ZZ') continue;
      total++;
      if (s.secoesTotalizadas > 0) comVotos++;
      if (s.status === 'encerrada') encerradas++;
    }
    return { comVotos, encerradas, total };
  }, [ufs]);

  const props = {
    ufs,
    race,
    modo,
    primeiroTurno: modo === 'variacao' ? votosT1 : undefined,
    rotuloAcao: (uf: UF) => `Ver ${UF_NOMES[uf]}`,
  };

  return (
    <section aria-labelledby="mapa-titulo" className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface shadow-card', className)}>
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="mapa-titulo" className="font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[21px]">
              {t1 ? 'Mapa do 1º turno' : 'Mapa da apuração'}
            </h2>
            <p className="mt-0.5 text-[12.5px] leading-snug text-fg-muted">
              {municipios ? (
                <>
                  <span className="hidden md:inline">Os 5.571 municípios · clique para abrir</span>
                  <span className="md:hidden">Os 5.571 municípios · toque para ver</span>
                </>
              ) : (
                <>
                  <span className="hidden md:inline">Clique num estado para ver municípios e seções</span>
                  <span className="md:hidden">Toque num estado para ver o placar</span>
                </>
              )}
            </p>
          </div>
          <Segmented<Vista>
            ariaLabel="Forma do mapa"
            size="sm"
            value={vista}
            onChange={setVista}
            className="hidden shrink-0 sm:inline-flex"
            options={OPCOES_VISTA}
          />
        </div>
        <Segmented<Vista> ariaLabel="Forma do mapa" size="sm" value={vista} onChange={setVista} block className="mt-3 sm:hidden" options={OPCOES_VISTA} />
        <MapModeSwitch className="mt-3" value={modo} onChange={setModo} modos={modos} />
      </div>

      <div
        className={cn(
          'relative flex flex-1 flex-col justify-center px-3 pb-3 pt-3 sm:px-5',
          // Cartograma: blocos de tamanho confortável. Mapa: limitado a 640 px quando o cartão ocupa a largura toda (tablet).
          vista === 'cartograma' ? 'mx-auto w-full max-w-[460px] pt-4 lg:max-w-[400px]' : 'mx-auto w-full max-w-[680px]',
        )}
        onPointerDownCapture={onPointerDownCapture}
        onClickCapture={onClickCapture}
      >
        {vista === 'mapa' ? (
          <BrazilMap {...props} onSelect={abrirUf} ariaLabel={`Mapa do Brasil por estado · ${race.titulo}`} />
        ) : vista === 'municipios' ? (
          <Suspense fallback={<div className="aspect-square w-full animate-pulse rounded-xl bg-surface-2" aria-busy="true" />}>
            <BrazilMunicipiosMap
              snapshot={snapMun}
              race={race}
              modo={modo}
              primeiroTurno={modo === 'variacao' ? brMunT1.data : undefined}
              onSelect={abrirMunicipio}
              rotuloAcao={(m) => `Ver ${m.nome}`}
              ariaLabel={`Mapa do Brasil por município · ${race.titulo}`}
            />
          </Suspense>
        ) : (
          <TileMap {...props} onSelect={abrirUf} ariaLabel={`Cartograma dos estados · ${race.titulo}`} />
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6 sm:px-5">
        <MapLegend modo={modo} race={race} compacta semTitulo={modo === 'vencedor'} />
        {municipios ? (
          <Liderados race={race} liderados={snapMun?.municipiosLiderados} />
        ) : !t1 ? (
          <p className="num text-[12px] leading-snug text-fg-muted sm:ml-auto sm:text-right">
            <span className="font-semibold text-fg">{resumoMapa.comVotos}</span> de {resumoMapa.total} estados com seções totalizadas
            {resumoMapa.encerradas > 0 ? (
              <>
                <br className="hidden sm:block" />
                <span className="sm:hidden"> · </span>
                <span className="font-semibold text-fg">{resumoMapa.encerradas}</span> {resumoMapa.encerradas === 1 ? 'concluído' : 'concluídos'}
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {sheet ? (
        <UfSheet
          uf={sheet.uf}
          aberto={sheet.aberto}
          onClose={() => setSheet((s) => (s ? { ...s, aberto: false } : s))}
          race={race}
          resumo={ufs[sheet.uf]}
          t1={anonimizado ? undefined : primeiroTurno?.[sheet.uf]}
          raceT1={raceT1}
          raceLink={raceLink}
          t={t}
          simulado={simulado}
        />
      ) : null}
    </section>
  );
});

const OPCOES_VISTA = [
  { value: 'mapa' as const, label: 'Estados', icon: 'mapa' as const, ariaLabel: 'Mapa por estado' },
  { value: 'municipios' as const, label: 'Municípios', icon: 'pin' as const, ariaLabel: 'Mapa por município' },
  { value: 'cartograma' as const, label: <span className="hidden min-[1500px]:inline">Blocos</span>, icon: 'grade' as const, ariaLabel: 'Cartograma de blocos' },
];

/** "Candidato A à frente em N municípios · Candidato B em M" (1º turno: "mais votado"). */
function Liderados({ race, liderados }: { race: Race; liderados: number[] | undefined }) {
  const fin = race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);
  const verbo = race.turno === 1 ? 'mais votado' : 'à frente';
  if (!liderados) return <p className="text-[12px] text-fg-subtle sm:ml-auto">Contando municípios…</p>;
  return (
    <p className="num flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] leading-snug text-fg-muted sm:ml-auto sm:justify-end">
      {fin.map(({ c, i }, k) => (
        <span key={c.numero} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className={cn('h-2 w-2 rounded-full', corSlot(c.cor).bg)} />
          <span className="font-semibold text-fg">{c.nomeUrna}</span>
          {k === 0 ? `${verbo} em` : 'em'} <span className="font-semibold text-fg">{fmtInt(liderados[i] ?? 0)}</span>
          {k === 0 ? 'municípios' : ''}
        </span>
      ))}
    </p>
  );
}

/** Sheet do toque: placar compacto da UF, participação e comparação com o 1º turno. */
function UfSheet({
  uf,
  aberto,
  onClose,
  race,
  resumo,
  t1,
  raceT1,
  raceLink,
  t,
  simulado,
}: {
  uf: UF;
  t?: number;
  aberto: boolean;
  onClose: () => void;
  race: Race;
  resumo: Summary | undefined;
  t1?: Summary;
  raceT1?: Race;
  raceLink: RaceId;
  simulado?: boolean;
}) {
  const nome = UF_NOMES[uf];
  const tem = !!resumo && resumo.secoesTotalizadas > 0;
  const mostrarT1 = race.turno === 2 && t1 && raceT1;
  return (
    <Sheet
      open={aberto}
      onClose={onClose}
      title={nome}
      description={
        uf === 'ZZ'
          ? 'Votos de brasileiros no exterior (só para Presidente)'
          : `${REGIAO_NOMES[UF_REGIAO[uf]]}${resumo ? ` · ${fmtInt(resumo.eleitorado)} eleitores` : ''}`
      }
      footer={
        <ButtonLink to={linkUf(uf, raceLink, t)} variant="primary" size="lg" block iconRight="seta" className="mb-3">
          Ver {nome}
        </ButtonLink>
      }
    >
      {resumo ? (
        <div className="space-y-4">
          <Placar variant="compact" race={race} resumo={resumo} titulo={race.cargo === 'Presidente' ? `Presidente · ${race.turno}º turno` : race.titulo} simulado={simulado} />
          {tem ? (
            <dl className="grid grid-cols-3 gap-2">
              <MiniStat rotulo="Diferença" valor={margem(resumo).lider === null ? '—' : fmtPP(margem(resumo).pp).replace('+', '')} />
              <MiniStat rotulo="Comparec." valor={fmtPct(pctComparecimento(resumo), 1)} />
              <MiniStat rotulo="Abstenção" valor={fmtPct(pctAbstencao(resumo), 1)} />
            </dl>
          ) : null}
          {mostrarT1 ? <ComparacaoUf race={race} resumo={resumo} t1={t1!} raceT1={raceT1!} /> : null}
          <p className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-muted">
            <Icon name="info" size={15} className="mt-px shrink-0" />
            Na página do estado: mapa por município, zonas eleitorais e o boletim de cada seção.
          </p>
        </div>
      ) : (
        <EmptyState compact icon="mapa" title="Sem dados para este estado" description="Os números aparecem assim que houver seções totalizadas." />
      )}
    </Sheet>
  );
}

function MiniStat({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted">{rotulo}</dt>
      <dd className="num mt-1 text-[16px] font-semibold leading-none text-fg">{valor}</dd>
    </div>
  );
}

/** % de cada finalista no 1º turno (na UF) vs agora. */
function ComparacaoUf({ race, resumo, t1, raceT1 }: { race: Race; resumo: Summary; t1: Summary; raceT1: Race }) {
  const tem = validos(resumo) > 0;
  return (
    <div className="rounded-2xl border border-line p-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Comparação com o 1º turno</p>
      <ul className="mt-2.5 space-y-2">
        {race.candidatos.map((c, i) => {
          const j = raceT1.candidatos.findIndex((x) => x.numero === c.numero);
          if (j < 0) return null;
          const antes = pctValidos(t1, j);
          const agora = pctValidos(resumo, i);
          return (
            <li key={c.numero} className="flex items-center justify-between gap-3 text-[13.5px]">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', corSlot(c.cor).bg)} />
                <span className="truncate text-fg">{c.nomeUrna}</span>
              </span>
              <span className="num shrink-0 text-fg-muted">
                {fmtPct(antes, 1)}
                <Icon name="seta" size={13} className="mx-1 inline -translate-y-px text-fg-subtle" />
                <span className="font-semibold text-fg">{tem ? fmtPct(agora, 1) : '—'}</span>
                {tem ? <span className="ml-1.5 text-[12px]">({fmtPP(agora - antes)})</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[11.5px] leading-snug text-fg-subtle">1º turno: % dos válidos com todos os candidatos. 2º turno: só os dois.</p>
    </div>
  );
}
