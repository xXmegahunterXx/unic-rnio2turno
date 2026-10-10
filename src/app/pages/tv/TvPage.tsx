/**
 * /tv — Modo TV: tela cheia para transmissão, telões e bares (fora do AppShell).
 *
 *  - Placar gigante (fotos oficiais quando não anonimizado), mapa grande (estados ou municípios), ticker de
 *    eventos, relógio da apuração (Brasília), QR + endereço do site, faixa SIMULAÇÃO quando for o caso e o
 *    patrocínio discreto ("Oferecido por").
 *  - Rodízio opcional (padrão ligado): a cada 12 s o mapa mostra uma das UFs mais disputadas (menor diferença,
 *    com seções apuradas), alternando com o Brasil.
 *  - "Tela cheia" pela Fullscreen API (tolera recusa: o navegador pode não deixar); mantém a tela acesa (Wake Lock)
 *    quando possível. Controles somem depois de 3 s sem mexer o mouse.
 *  - Legível a 3 m em 1920×1080 e 1280×720: todas as medidas derivam de `--u` (≈ 1% da altura útil); também
 *    funciona em tablet (retrato empilha placar e mapa).
 *  - Parâmetros: `?race=` (padrão pres; gov-xx mostra a UF), `?mapa=municipios`, `?rodizio=0`.
 *  - Na fase 'pre' mostra a contagem regressiva e o 1º turno oficial.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import type { FeedEvent, Patrocinio, Race, RaceId, Summary, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { margem, pctTotalizadas, pctValidos, validos } from '@/shared/calc';
import { fmtHora, fmtHoraSeg, fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { useMunicipiosBr, useNacional, useRace, useStatus, useUf } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot, fillMargem } from '@/app/lib/raceUi';
import { estimarSimNow, useNow } from '@/app/lib/useNow';
import { useInterval } from '@/app/lib/useInterval';
import { hostExibicao, urlAbsoluta } from '@/app/lib/share';
import { partesTempo } from '@/app/ui/Countdown';
import { Icon } from '@/app/ui/Icon';
import { NumberRoll } from '@/app/ui/NumberRoll';
import { LogoMark } from '@/app/components/layout/Logo';
import { CandidateAvatar } from '@/app/components/apuracao/CandidateAvatar';
import { VoteSplitBar } from '@/app/components/apuracao/VoteSplitBar';
import { BrazilMap } from '@/app/components/apuracao/BrazilMap';
import { UfMap } from '@/app/components/apuracao/UfMap';
import { hachuraStyle } from '@/app/components/apuracao/MapHatch';
import { PatrocinioSlot } from '@/app/components/apuracao/PatrocinioSlot';
import { useFotosRace } from '@/app/components/apuracao/fotos';
import { useElementSize } from '@/app/components/apuracao/MapHooks';
import { gerarQr, qrPath } from '@/app/components/apuracao/qr';

const BrazilMunicipiosMap = lazy(() => import('@/app/components/apuracao/BrazilMunicipiosMap').then((m) => ({ default: m.BrazilMunicipiosMap })));

const RODIZIO_MS = 12_000;
const OCIOSO_MS = 3_000;
/** Proporção do viewBox do BrazilMap (996 + 120 de caixas fora da costa × 1000). */
const AR_BRASIL = 1116 / 1000;

type Foco = 'BR' | UF;

// Unidade da tela (`--u`): ~1% da altura útil na TV (paisagem); em retrato (tablet), guiada pela largura.
const UNIDADE = '[--u:min(1dvh,0.6vw)] portrait:[--u:min(0.72dvh,1vw)]';

export default function TvPage() {
  const [params, setParams] = useSearchParams();
  const statusQ = useStatus();
  const status = statusQ.data;
  const pre = status?.fase === 'pre';
  const pedida = (params.get('race') || 'pres').toLowerCase();
  const gov = /^gov-[a-z]{2}$/.test(pedida) ? pedida : null;
  const ufGov = gov ? (gov.slice(4).toUpperCase() as UF) : null;
  const raceId: RaceId = pre ? `${gov ?? 'pres'}-t1` : (gov ?? 'pres');
  const race = useRace(raceId);
  const q = useNacional(raceId);
  const dados = q.data && q.data.race === raceId ? q.data : undefined;
  const t1 = raceId.endsWith('-t1');

  const mapaMun = params.get('mapa') === 'municipios';
  const rodizio = params.get('rodizio') !== '0' && !gov;
  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === null) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  useEffect(() => {
    const ant = document.title;
    document.title = 'Modo TV · Sintonia';
    return () => {
      document.title = ant;
    };
  }, []);

  // ---------------------------------------------------------------- rodízio pelas UFs mais disputadas
  const disputadas = useMemo(() => maisDisputadas(dados?.ufs), [dados?.ufs]);
  const ciclo = useRef<Foco[]>(['BR']);
  const [passo, setPasso] = useState(0);
  useInterval(
    () =>
      setPasso((p) => {
        const prox = p + 1;
        if (prox >= ciclo.current.length) {
          ciclo.current = ['BR', ...disputadas];
          return 0;
        }
        return prox;
      }),
    rodizio && disputadas.length ? RODIZIO_MS : null,
  );
  useEffect(() => {
    if (ciclo.current.length <= 1) ciclo.current = ['BR', ...disputadas];
  }, [disputadas]);
  const foco: Foco = gov ? (ufGov as UF) : rodizio ? (ciclo.current[passo] ?? 'BR') : 'BR';

  // ---------------------------------------------------------------- tela cheia, tela acesa, controles
  const [cheia, setCheia] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setCheia(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const alternarCheia = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      else throw new Error('sem suporte');
    } catch {
      setAviso('Este navegador não permitiu a tela cheia. Use o modo de tela cheia do próprio navegador (F11).');
      window.setTimeout(() => setAviso(null), 5000);
    }
  }, []);
  useTelaAcesa();
  const ocioso = useOcioso(OCIOSO_MS);

  const agora = useNow(1000);
  const simNow = status ? estimarSimNow(status, statusQ.dataUpdatedAt || agora, agora) : agora;
  const simulado = !!status?.simulacao && !t1;

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('relative flex h-dvh w-full flex-col overflow-hidden bg-bg text-fg', UNIDADE, ocioso && cheia && 'cursor-none')}>
        <FundoTv />
        <BarraTopo
          race={race}
          t1={t1}
          pre={pre}
          simNow={simNow}
          inicio={status?.inicioApuracao}
          ao_vivo={!!status && status.fase === 'apurando' && !status.pausado && !status.congelado}
          simulacao={!!status?.simulacao}
          controles={
            <Controles
              visivel={!ocioso || !cheia}
              podeMapa={!gov}
              mapaMun={mapaMun}
              setMapaMun={(v) => setParam('mapa', v ? 'municipios' : null)}
              rodizio={rodizio}
              podeRodizio={!gov}
              setRodizio={(v) => setParam('rodizio', v ? null : '0')}
              cheia={cheia}
              alternarCheia={alternarCheia}
            />
          }
        />
        {simulado ? <FaixaSimulacao /> : null}

        <main className="relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-[calc(var(--u)*2)] px-[calc(var(--u)*3)] pb-[calc(var(--u)*1.5)] pt-[calc(var(--u)*2)] landscape:grid-cols-[minmax(0,46fr)_minmax(0,54fr)] landscape:grid-rows-1">
          <section aria-label="Placar" className="flex min-h-0 flex-col">
            {race && dados ? (
              <PlacarTv race={race} resumo={dados.resumo} pre={pre} simulado={simulado} />
            ) : (
              <div className="flex-1 animate-pulse rounded-[calc(var(--u)*2.5)] bg-surface" />
            )}
            <Rodape patrocinio={status?.patrocinio ?? null} />
          </section>

          <section aria-label="Mapa" className="relative min-h-0 min-w-0">
            {race && dados ? (
              <PainelMapa
                race={race}
                raceId={raceId}
                ufs={dados.ufs}
                foco={foco}
                mapaMun={mapaMun && foco === 'BR'}
                rodizio={rodizio && !gov}
                passo={passo}
                total={ciclo.current.length}
                gov={!!gov}
              />
            ) : (
              <div className="h-full animate-pulse rounded-[calc(var(--u)*2.5)] bg-surface" />
            )}
          </section>
        </main>

        <Ticker eventos={dados?.eventos ?? []} race={race} vazio={pre ? 'A apuração começa às 17h (horário de Brasília).' : 'Os acontecimentos da apuração aparecem aqui.'} />

        {aviso ? (
          <div role="alert" className="absolute left-1/2 top-[calc(var(--u)*11)] z-50 max-w-[90vw] -translate-x-1/2 rounded-2xl border border-alert/40 bg-surface px-5 py-3 text-[16px] text-fg shadow-card">
            {aviso}
          </div>
        ) : null}
      </div>
    </MotionConfig>
  );
}

// =============================================================================================
// Peças
// =============================================================================================

/** UFs com seções apuradas, da menor para a maior diferença (até 5). */
function maisDisputadas(ufs: Partial<Record<UF, Summary>> | undefined): UF[] {
  if (!ufs) return [];
  return (Object.entries(ufs) as [UF, Summary][])
    .filter(([uf, s]) => uf !== 'ZZ' && s && s.secoesTotalizadas > 0 && pctTotalizadas(s) >= 5 && validos(s) > 0)
    .map(([uf, s]) => ({ uf, pp: margem(s).pp }))
    .sort((a, b) => a.pp - b.pp)
    .slice(0, 5)
    .map((x) => x.uf);
}

function FundoTv() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-noise opacity-70" />
      <div className="absolute left-1/2 top-[-40%] h-[80%] w-[70%] -translate-x-1/2 rounded-full bg-brand/[0.08] blur-[120px]" />
    </div>
  );
}

function BarraTopo({
  race,
  t1,
  pre,
  simNow,
  inicio,
  ao_vivo,
  simulacao,
  controles,
}: {
  race: Race | undefined;
  t1: boolean;
  pre: boolean;
  simNow: number;
  inicio?: number;
  ao_vivo: boolean;
  simulacao: boolean;
  controles: ReactNode;
}) {
  const falta = pre && inicio ? partesTempo(Math.max(0, inicio - simNow)) : null;
  return (
    <header className="relative z-20 flex flex-wrap items-center gap-x-[calc(var(--u)*2)] gap-y-3 px-[calc(var(--u)*3)] pt-[calc(var(--u)*2)]">
      <div className="flex min-w-0 items-center gap-[calc(var(--u)*1.4)]">
        <LogoMark size={44} className="h-[calc(var(--u)*5)] w-[calc(var(--u)*5)]" />
        <div className="min-w-0">
          <div className="font-display text-[length:calc(var(--u)*3.2)] font-semibold leading-none tracking-[-0.025em]">Sintonia</div>
          <div className="mt-[calc(var(--u)*0.5)] truncate text-[length:calc(var(--u)*1.7)] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            {race ? (race.cargo === 'Presidente' ? 'Presidente' : race.titulo) : 'Apuração'} · {t1 ? '1º turno · resultado oficial' : '2º turno'}
          </div>
        </div>
      </div>
      <div className="order-3 flex w-full justify-end min-[1100px]:order-none min-[1100px]:ml-auto min-[1100px]:w-auto">{controles}</div>
      <div className="ml-auto flex items-center gap-[calc(var(--u)*2)] min-[1100px]:ml-0">
        {pre && falta ? (
          <div className="text-right">
            <div className="text-[length:calc(var(--u)*1.5)] font-semibold uppercase tracking-[0.14em] text-fg-muted">Apuração começa em</div>
            <div className="num font-display text-[length:calc(var(--u)*4)] font-semibold leading-none tracking-[-0.02em]">
              {falta.dias > 0 ? `${falta.dias}d ` : ''}
              {String(falta.horas).padStart(2, '0')}:{String(falta.min).padStart(2, '0')}:{String(falta.seg).padStart(2, '0')}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-[calc(var(--u)*1.2)]">
            <span
              className={cn(
                'inline-flex items-center gap-[calc(var(--u)*0.7)] rounded-full border px-[calc(var(--u)*1.2)] py-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*1.6)] font-bold uppercase tracking-[0.14em]',
                simulacao ? 'border-brand/40 bg-brand/15 text-brand-fg' : 'border-line bg-surface-2 text-fg',
              )}
            >
              <span className={cn('h-[calc(var(--u)*0.9)] w-[calc(var(--u)*0.9)] rounded-full', simulacao ? 'bg-brand-2' : 'bg-alert', ao_vivo && 'animate-pulse-dot')} />
              {t1 ? 'Oficial' : simulacao ? 'Simulação' : ao_vivo ? 'Ao vivo' : 'Apuração'}
            </span>
            <div className="text-right">
              <div className="num font-display text-[length:calc(var(--u)*4.2)] font-semibold leading-none tracking-[-0.02em]">{fmtHoraSeg(simNow)}</div>
              <div className="mt-[calc(var(--u)*0.3)] text-[length:calc(var(--u)*1.3)] font-medium uppercase tracking-[0.14em] text-fg-subtle">Horário de Brasília</div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function Controles({
  visivel,
  podeMapa,
  mapaMun,
  setMapaMun,
  rodizio,
  podeRodizio,
  setRodizio,
  cheia,
  alternarCheia,
}: {
  visivel: boolean;
  podeMapa: boolean;
  mapaMun: boolean;
  setMapaMun: (v: boolean) => void;
  rodizio: boolean;
  podeRodizio: boolean;
  setRodizio: (v: boolean) => void;
  cheia: boolean;
  alternarCheia: () => void;
}) {
  const btn =
    'inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2/90 px-3 text-[14px] font-semibold text-fg transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
  return (
    <div className={cn('flex items-center gap-2 transition-opacity duration-500', visivel ? 'opacity-100' : 'pointer-events-none opacity-0')}>
      <div role="radiogroup" aria-label="Mapa" className={cn('inline-flex rounded-xl border border-line bg-surface-2/90 p-1', !podeMapa && 'hidden')}>
        {[
          { v: false, r: 'Estados' },
          { v: true, r: 'Municípios' },
        ].map((o) => (
          <button
            key={o.r}
            type="button"
            role="radio"
            aria-checked={mapaMun === o.v}
            onClick={() => setMapaMun(o.v)}
            className={cn('h-8 rounded-lg px-3 text-[14px] font-semibold transition-colors', mapaMun === o.v ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg')}
          >
            {o.r}
          </button>
        ))}
      </div>
      {podeRodizio ? (
        <button type="button" aria-pressed={rodizio} onClick={() => setRodizio(!rodizio)} className={cn(btn, rodizio && 'border-brand/50 bg-brand/15')} title="Alterna o mapa entre o Brasil e as UFs mais disputadas a cada 12 s">
          <Icon name="troca" size={17} />
          <span className="hidden min-[1100px]:inline">Rodízio {rodizio ? 'ligado' : 'desligado'}</span>
          <span className="sr-only min-[1100px]:hidden">Rodízio {rodizio ? 'ligado' : 'desligado'}</span>
        </button>
      ) : null}
      <button type="button" onClick={alternarCheia} className={btn}>
        <Icon name={cheia ? 'recolher' : 'expandir'} size={17} />
        <span className="hidden min-[1100px]:inline">{cheia ? 'Sair da tela cheia' : 'Tela cheia'}</span>
        <span className="sr-only min-[1100px]:hidden">{cheia ? 'Sair da tela cheia' : 'Tela cheia'}</span>
      </button>
      <Link to="/apuracao" className={btn} aria-label="Sair do Modo TV">
        <Icon name="fechar" size={17} />
      </Link>
    </div>
  );
}

function FaixaSimulacao() {
  return (
    <div
      role="note"
      aria-label="Simulação: dados fictícios"
      className="relative isolate z-10 mx-[calc(var(--u)*3)] mt-[calc(var(--u)*1.6)] flex items-center justify-center gap-[calc(var(--u)*1.5)] overflow-hidden rounded-[calc(var(--u)*1.2)] border border-brand/40 bg-surface py-[calc(var(--u)*0.8)] text-[length:calc(var(--u)*1.9)] font-bold uppercase tracking-[0.18em] text-brand-fg"
    >
      <span aria-hidden className="absolute inset-0 -z-10 bg-brand/[0.14]" />
      <span aria-hidden className="absolute inset-0 -z-10 opacity-70 [background-image:repeating-linear-gradient(-45deg,rgb(var(--brand)/0.12)_0_10px,transparent_10px_20px)]" />
      <span className="h-[calc(var(--u)*0.9)] w-[calc(var(--u)*0.9)] rounded-full bg-current" />
      Simulação · dados fictícios
      <span className="font-medium normal-case tracking-normal text-fg-muted">— não são resultados reais</span>
    </div>
  );
}

function PlacarTv({ race, resumo, pre, simulado }: { race: Race; resumo: Summary; pre: boolean; simulado: boolean }) {
  const fotos = useFotosRace(race, { real: race.turno === 1 });
  const fin = race.candidatos.map((c, i) => ({ c, i })).filter(({ c }) => !c.agregado);
  const iOutros = race.candidatos.findIndex((c) => c.agregado);
  const tem = validos(resumo) > 0;
  const m = margem(resumo);
  const eleito = race.turno === 2 && resumo.eleito !== null ? race.candidatos[resumo.eleito] : null;
  const pst = pctTotalizadas(resumo);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[calc(var(--u)*2.5)] border border-line bg-surface px-[calc(var(--u)*2.8)] py-[calc(var(--u)*2.2)] shadow-card">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className={cn('absolute -left-[20%] -top-[30%] h-[70%] w-[60%] rounded-full blur-[90px]', corSlot(fin[0]?.c.cor ?? 'a').bgSoft)} />
        <div className={cn('absolute -bottom-[30%] -right-[20%] h-[70%] w-[60%] rounded-full blur-[90px]', corSlot(fin[1]?.c.cor ?? 'b').bgSoft)} />
      </div>
      <div className="relative flex items-center justify-between gap-4">
        <span className="text-[length:calc(var(--u)*1.7)] font-semibold uppercase tracking-[0.14em] text-fg-muted">
          {pre ? 'Resultado do 1º turno · 4 de outubro' : race.turno === 1 ? 'Resultado oficial' : 'Votos válidos'}
        </span>
        {eleito ? (
          <span className={cn('inline-flex items-center gap-2 rounded-full px-[calc(var(--u)*1.4)] py-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*1.7)] font-bold uppercase tracking-[0.1em]', corSlot(eleito.cor).bgSoft, corSlot(eleito.cor).text)}>
            <Icon name="check-circulo" size={20} />
            {resumo.status === 'encerrada' ? 'Eleito' : 'Matematicamente eleito'}
          </span>
        ) : simulado ? (
          <span className="rounded-full border border-brand/40 bg-brand/15 px-[calc(var(--u)*1.2)] py-[calc(var(--u)*0.4)] text-[length:calc(var(--u)*1.4)] font-bold uppercase tracking-[0.14em] text-brand-fg">
            Simulação
          </span>
        ) : null}
      </div>

      <ul className="relative mt-[calc(var(--u)*1.2)] flex min-h-0 flex-1 flex-col justify-center gap-[calc(var(--u)*2)]">
        {fin.map(({ c, i }) => {
          const s = corSlot(c.cor);
          const lider = tem && resumo.lider === i;
          return (
            <li key={c.numero} className="flex items-center gap-[calc(var(--u)*2)]">
              <CandidateAvatar
                candidato={c}
                foto={fotos[i]}
                size="xl"
                eleito={eleito === c}
                className="!h-[calc(var(--u)*10)] !w-[calc(var(--u)*10)] !text-[length:calc(var(--u)*3.6)]"
              />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-balance break-words font-display text-[length:calc(var(--u)*4.6)] font-semibold leading-[1.02] tracking-[-0.025em]">{c.nomeUrna}</div>
                <div className="num mt-[calc(var(--u)*0.4)] truncate text-[length:calc(var(--u)*2.2)] text-fg-muted">
                  {c.partido} · {c.numero}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <NumberRoll
                  value={pctValidos(resumo, i)}
                  format={(n) => fmtPct(n)}
                  smallChars="%"
                  smallClassName="text-[0.42em] ml-[0.05em]"
                  className={cn(
                    'font-display text-[length:calc(var(--u)*10)] font-semibold leading-none tracking-[-0.045em]',
                    tem ? s.textDisplay : 'text-fg-subtle',
                    tem && !lider && 'opacity-90',
                  )}
                />
                <div className="num mt-[calc(var(--u)*0.6)] text-[length:calc(var(--u)*2.1)] text-fg-muted">
                  <span className="font-semibold text-fg">{fmtInt(resumo.votos[i] ?? 0)}</span> votos
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="relative mt-[calc(var(--u)*1.6)]">
        <VoteSplitBar
          votos={resumo.votos}
          cores={race.candidatos.map((c) => c.cor)}
          size="lg"
          nomes={race.candidatos.map((c) => c.nomeUrna)}
          className="[&>div>div:first-child]:!h-[calc(var(--u)*2.2)]"
        />
        <div className="mt-[calc(var(--u)*1.6)] flex items-end justify-between gap-6 border-t border-line pt-[calc(var(--u)*1.4)]">
          <div>
            <div className="num font-display text-[length:calc(var(--u)*5)] font-semibold leading-none tracking-[-0.03em]">{fmtPct(pst)}</div>
            <div className="mt-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*1.8)] text-fg-muted">das seções totalizadas</div>
          </div>
          {iOutros >= 0 ? (
            <div className="text-right">
              <div className="num font-display text-[length:calc(var(--u)*3.4)] font-semibold leading-none">{fmtPct(pctValidos(resumo, iOutros))}</div>
              <div className="mt-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*1.8)] text-fg-muted">demais candidatos</div>
            </div>
          ) : m.lider !== null ? (
            <div className="text-right">
              <div className="num font-display text-[length:calc(var(--u)*3.4)] font-semibold leading-none">{fmtInt(m.votos)}</div>
              <div className="mt-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*1.8)] text-fg-muted">votos de diferença · {fmtPP(m.pp).replace('+', '')}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PainelMapa({
  race,
  raceId,
  ufs,
  foco,
  mapaMun,
  rodizio,
  passo,
  total,
  gov,
}: {
  race: Race;
  raceId: RaceId;
  ufs: Partial<Record<UF, Summary>>;
  foco: Foco;
  mapaMun: boolean;
  rodizio: boolean;
  passo: number;
  total: number;
  /** Disputa de governador: o mapa é sempre o da UF (sem "em foco"). */
  gov?: boolean;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const ufQ = useUf(raceId, foco === 'BR' ? undefined : foco);
  const ufSnap = foco !== 'BR' && ufQ.data && ufQ.data.uf === foco && ufQ.data.race === raceId ? ufQ.data : undefined;
  const mun = useMunicipiosBr(raceId, undefined, mapaMun && foco === 'BR');
  const snapMun = mun.data && mun.data.race === raceId ? mun.data : undefined;
  const W = size.w;
  const H = size.h;
  const wBr = Math.min(W, H * AR_BRASIL);
  const resumoUf = foco !== 'BR' ? ufs[foco] : undefined;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[calc(var(--u)*2.5)] border border-line bg-surface p-[calc(var(--u)*2)] shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[length:calc(var(--u)*1.6)] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            {foco === 'BR' ? (mapaMun ? 'Brasil · por município' : 'Brasil · por estado') : gov ? 'Por município' : 'Em foco · disputa mais apertada'}
          </div>
          <div className="mt-[calc(var(--u)*0.3)] truncate font-display text-[length:calc(var(--u)*3.4)] font-semibold leading-tight tracking-[-0.02em]">
            {foco === 'BR' ? 'Quem está à frente' : UF_NOMES[foco]}
          </div>
        </div>
        {resumoUf && !gov ? <MiniPlacarUf race={race} resumo={resumoUf} /> : null}
      </div>
      <div ref={ref} className="relative mt-[calc(var(--u)*1.2)] flex min-h-0 flex-1 items-center justify-center">
        {W > 0 && H > 0 ? (
          foco === 'BR' ? (
            mapaMun ? (
              <div style={{ width: Math.min(W, H * 0.996) }}>
                <Suspense fallback={null}>
                  <BrazilMunicipiosMap snapshot={snapMun} race={race} estatico alturaMax={H} ariaLabel="Mapa do Brasil por município" />
                </Suspense>
              </div>
            ) : (
              <div style={{ width: wBr }}>
                <BrazilMap ufs={ufs} race={race} valores ariaLabel="Mapa do Brasil por estado" />
              </div>
            )
          ) : ufSnap ? (
            <div className="w-full [&_button]:hidden" key={foco}>
              <UfMap uf={foco} municipios={ufSnap.municipios} race={race} alturaMax={H} zoomNoDestaque={false} ariaLabel={`Mapa de ${UF_NOMES[foco]} por município`} />
            </div>
          ) : (
            <div className="h-full w-full animate-pulse rounded-2xl bg-surface-2" />
          )
        ) : null}
      </div>
      <div className="mt-[calc(var(--u)*1)] flex items-end justify-between gap-4">
        <LegendaTv race={race} />
        {rodizio && total > 1 ? (
          <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={cn('h-[calc(var(--u)*0.8)] rounded-full transition-all duration-500', i === passo ? 'w-[calc(var(--u)*3)] bg-brand' : 'w-[calc(var(--u)*0.8)] bg-fg/25')} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Legenda grande (legível a distância): cor de cada candidato, intensidade = vantagem, hachura = sem seções. */
function LegendaTv({ race }: { race: Race }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-[calc(var(--u)*2.4)] gap-y-[calc(var(--u)*0.8)] text-[length:calc(var(--u)*1.7)] text-fg-muted">
      {race.candidatos.map((c) =>
        c.agregado ? null : (
          <li key={c.numero} className="flex items-center gap-[calc(var(--u)*0.8)]">
            <span className="flex overflow-hidden rounded-[calc(var(--u)*0.4)]" aria-hidden>
              {[0, 1, 2, 3].map((b) => (
                <span key={b} className="h-[calc(var(--u)*1.6)] w-[calc(var(--u)*1.2)]" style={{ background: fillMargem(c.cor, b as 0 | 1 | 2 | 3) }} />
              ))}
            </span>
            <span className="font-semibold text-fg">{c.nomeUrna}</span>
          </li>
        ),
      )}
      <li className="text-fg-subtle">mais forte = maior vantagem</li>
      <li className="flex items-center gap-[calc(var(--u)*0.8)]">
        <span className="h-[calc(var(--u)*1.6)] w-[calc(var(--u)*1.6)] rounded-[calc(var(--u)*0.4)]" style={hachuraStyle()} aria-hidden />
        sem seções apuradas
      </li>
    </ul>
  );
}

function MiniPlacarUf({ race, resumo }: { race: Race; resumo: Summary }) {
  const tem = validos(resumo) > 0;
  return (
    <div className="shrink-0 text-right">
      <div className="flex items-baseline justify-end gap-[calc(var(--u)*1.6)]">
        {race.candidatos.map((c, i) =>
          c.agregado ? null : (
            <span key={c.numero} className={cn('num font-display text-[length:calc(var(--u)*3.6)] font-semibold leading-none', tem ? corSlot(c.cor).textDisplay : 'text-fg-subtle')}>
              {fmtPct(pctValidos(resumo, i), 1)}
            </span>
          ),
        )}
      </div>
      <div className="num mt-[calc(var(--u)*0.5)] text-[length:calc(var(--u)*1.6)] text-fg-muted">{fmtPct(pctTotalizadas(resumo), 1)} das seções</div>
    </div>
  );
}

function Rodape({ patrocinio }: { patrocinio: Patrocinio | null }) {
  const url = urlAbsoluta('/apuracao');
  const host = hostExibicao() || 'sintonia';
  const qr = useMemo(() => {
    try {
      return gerarQr(url, 'M');
    } catch {
      return null;
    }
  }, [url]);
  return (
    // Em retrato (tablet) o espaço vai para o mapa: o QR fica só na TV (paisagem).
    <div className="mt-[calc(var(--u)*1.6)] flex shrink-0 items-center gap-[calc(var(--u)*2)] rounded-[calc(var(--u)*2.5)] border border-line bg-surface/80 p-[calc(var(--u)*1.4)] portrait:hidden">
      {qr ? (
        <svg
          viewBox={`0 0 ${qr.tamanho + 4} ${qr.tamanho + 4}`}
          className="h-[calc(var(--u)*12)] w-[calc(var(--u)*12)] shrink-0 rounded-[calc(var(--u)*0.8)]"
          role="img"
          aria-label={`QR Code para ${url}`}
          shapeRendering="crispEdges"
        >
          {/* QR sempre escuro sobre claro (as câmeras leem melhor), nos dois temas — só tokens */}
          <rect width={qr.tamanho + 4} height={qr.tamanho + 4} className="fill-surface dark:fill-fg" />
          <path d={qrPath(qr, 2)} className="fill-fg dark:fill-bg" />
        </svg>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-[length:calc(var(--u)*1.6)] font-semibold uppercase tracking-[0.14em] text-fg-muted">Acompanhe no celular</div>
        <div className="mt-[calc(var(--u)*0.4)] truncate font-display text-[length:calc(var(--u)*3)] font-semibold leading-tight tracking-[-0.02em]">{host}</div>
        <div className="mt-[calc(var(--u)*0.4)] text-[length:calc(var(--u)*1.7)] text-fg-muted">Estado, município e seção por seção · fonte TSE</div>
        {patrocinio ? <PatrocinioSlot patrocinio={patrocinio} tv className="mt-[calc(var(--u)*1)]" /> : null}
      </div>
    </div>
  );
}

function Ticker({ eventos, race, vazio }: { eventos: FeedEvent[]; race: Race | undefined; vazio: string }) {
  const lista = eventos.slice(0, 12);
  const dur = Math.max(40, lista.reduce((s, e) => s + e.titulo.length, 0) * 0.32);
  const item = (e: FeedEvent, k: string) => {
    const c = e.candidato !== undefined ? race?.candidatos[e.candidato] : undefined;
    return (
      <li key={k} className="flex shrink-0 items-center gap-[calc(var(--u)*1)] pr-[calc(var(--u)*5)]">
        <span className={cn('h-[calc(var(--u)*1)] w-[calc(var(--u)*1)] shrink-0 rounded-full', c ? corSlot(c.cor).bg : 'bg-brand-2')} />
        <span className="num font-semibold text-fg-muted">{fmtHora(e.t)}</span>
        {e.abrangencia !== 'BR' ? <span className="rounded-md bg-surface-3 px-[calc(var(--u)*0.6)] font-mono text-[0.8em] font-semibold text-fg">{e.abrangencia}</span> : null}
        <span className={cn('whitespace-nowrap text-fg', (e.tipo === 'eleito' || e.tipo === 'virada') && 'font-semibold')}>{e.titulo}</span>
      </li>
    );
  };
  return (
    <footer className="relative z-10 flex h-[calc(var(--u)*6.5)] shrink-0 items-center overflow-hidden border-t border-line bg-surface/90 text-[length:calc(var(--u)*2.3)]">
      <div className="flex h-full shrink-0 items-center gap-2 bg-brand-cta px-[calc(var(--u)*2.4)] text-[length:calc(var(--u)*1.7)] font-bold uppercase tracking-[0.16em] text-white">
        Agora
      </div>
      {lista.length === 0 ? (
        <p className="px-[calc(var(--u)*3)] text-fg-muted">{vazio}</p>
      ) : lista.length < 3 ? (
        // Poucos eventos: lista parada (rolar um item só repetido fica estranho).
        <ul className="flex min-w-0 flex-1 items-center overflow-hidden px-[calc(var(--u)*3)]">{lista.map((e) => item(e, e.id))}</ul>
      ) : (
        <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_4%,black_96%,transparent)]">
          <ul className="flex w-max animate-[tv-ticker_var(--dur)_linear_infinite] motion-reduce:animate-none" style={{ ['--dur' as string]: `${dur}s` }}>
            {lista.map((e) => item(e, e.id))}
            {lista.map((e) => item(e, `${e.id}-b`))}
          </ul>
          <style>{'@keyframes tv-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
        </div>
      )}
    </footer>
  );
}

// =============================================================================================
// Hooks
// =============================================================================================

/** Mantém a tela acesa (Wake Lock API), quando o navegador permite. */
function useTelaAcesa() {
  useEffect(() => {
    type Sentinela = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinela> } };
    if (!nav.wakeLock) return;
    let s: Sentinela | null = null;
    let vivo = true;
    const pedir = async () => {
      try {
        if (document.visibilityState === 'visible') s = await nav.wakeLock!.request('screen');
        if (!vivo) void s?.release();
      } catch {
        /* recusado: segue sem */
      }
    };
    void pedir();
    const onVis = () => void pedir();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', onVis);
      void s?.release().catch(() => undefined);
    };
  }, []);
}

/** true depois de `ms` sem mexer o mouse/tocar/teclar. */
function useOcioso(ms: number): boolean {
  const [ocioso, setOcioso] = useState(false);
  useEffect(() => {
    let id = window.setTimeout(() => setOcioso(true), ms);
    const acorda = () => {
      setOcioso(false);
      window.clearTimeout(id);
      id = window.setTimeout(() => setOcioso(true), ms);
    };
    const evs = ['mousemove', 'pointerdown', 'keydown', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, acorda, { passive: true }));
    return () => {
      window.clearTimeout(id);
      evs.forEach((e) => window.removeEventListener(e, acorda));
    };
  }, [ms]);
  return ocioso;
}
