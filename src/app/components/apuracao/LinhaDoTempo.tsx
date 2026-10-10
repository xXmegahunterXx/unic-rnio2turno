/**
 * "Reveja a noite" — régua pública do tempo da apuração (contrato `Instante` de src/shared/api.ts).
 *
 *  - Estado na URL: `?t=18h42` (horário de Brasília do dia da apuração; aceita também epoch ms). Sem `t` = ao vivo.
 *    O link é compartilhável: quem abre vê o placar e o mapa naquele instante.
 *  - Nunca há instante futuro: o limite é o relógio da apuração (`status.simNow`, interpolado). Um `t` à frente
 *    do agora vira "ao vivo".
 *  - Play acelera a noite (1 h em 30 s) em passos de 1 minuto simulado por quadro de ~0,5 s, sem martelar o
 *    servidor: os instantes são múltiplos de 1 min (cacheáveis na CDN) e o próximo passo só sai quando o
 *    anterior chegou (`carregando`).
 *  - Arrastar mostra o horário na hora e confirma o instante no máximo a cada 350 ms (e ao soltar).
 *  - Marcos: 1%, 25%, 50%, 75% e 99% das seções (da série ao vivo) e "eleito" (evento).
 *  - O trilho é a "faixa da noite": a cor de quem estava à frente em cada momento (slot do candidato, intensidade
 *    pela margem, como no mapa) — as viradas ficam visíveis. O trecho depois do instante exibido fica esmaecido.
 *  - Teclado: ←/→ ±1 min, Shift ou PageUp/PageDown ±10 min, Home = início, End = ao vivo, Espaço = play/pause.
 *  - Na fase 'pre' (ou sem nada apurado ainda) não aparece.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient, type Query } from '@tanstack/react-query';
import { instanteChave } from '@/app/data/hooks';
import type { CorCandidato, FeedEvent, LiveStatus, SeriePoint } from '@/shared/types';
import { BRT_OFFSET_MS, INICIO_APURACAO } from '@/shared/constants';
import { fmtHora, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { FILL_PENDENTE, rgbSlot } from '@/app/lib/raceUi';
import { estimarSimNow, useNow } from '@/app/lib/useNow';
import { Icon } from '@/app/ui/Icon';
import { LiveDot } from '@/app/ui/LiveDot';
import { useElementSize } from './MapHooks';

const MIN = 60_000;
/** Quanto a noite anda por passo do play (1 min simulado)… */
const PASSO_SIM = MIN;
/** …e a cada quantos ms de relógio: 1 h em 30 s. */
const PASSO_MS = 500;
const ARRASTO_MS = 350;
const MARCOS = [1, 25, 50, 75, 99] as const;

// =============================================================================================
// ?t= na URL
// =============================================================================================

const q = (t: number) => Math.floor(t / MIN) * MIN;

/** "18h42" (Brasília). Fora do dia da apuração ou com segundos, cai no epoch (sempre exato). */
export function formatarInstante(t: number): string {
  const brt = new Date(t + BRT_OFFSET_MS);
  const dia = new Date(INICIO_APURACAO + BRT_OFFSET_MS);
  const mesmoDia = brt.getUTCFullYear() === dia.getUTCFullYear() && brt.getUTCMonth() === dia.getUTCMonth() && brt.getUTCDate() === dia.getUTCDate();
  const madrugada = !mesmoDia && t > INICIO_APURACAO && t - INICIO_APURACAO < 18 * 3600_000 && brt.getUTCHours() < 12;
  if ((!mesmoDia && !madrugada) || t % MIN !== 0) return String(t);
  return `${String(brt.getUTCHours()).padStart(2, '0')}h${String(brt.getUTCMinutes()).padStart(2, '0')}`;
}

/** Lê `?t=`: "18h42", "18:42", "1842" (Brasília, dia da apuração; antes do meio-dia = madrugada seguinte) ou epoch ms. */
export function lerInstante(v: string | null | undefined, inicio = INICIO_APURACAO): number | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  if (/^\d{10,}$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const m = /^(\d{1,2})(?:h|:)?(\d{2})$/.exec(s);
  if (!m) return undefined;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return undefined;
  const dia = new Date(inicio + BRT_OFFSET_MS);
  const base = Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate()) - BRT_OFFSET_MS;
  return base + (hh < 12 ? 24 : 0) * 3600_000 + hh * 3600_000 + mm * MIN;
}

/** Acrescenta `t` a um caminho (preservando a query). */
export function comInstante(caminho: string, t: number | undefined): string {
  if (t === undefined) return caminho;
  const [p, qs = ''] = caminho.split('?');
  const params = new URLSearchParams(qs);
  params.set('t', formatarInstante(t));
  return `${p}?${params.toString()}`;
}

/** Relógio da apuração agora (limite da régua), interpolado entre polls. */
export function agoraApuracao(status: LiveStatus | undefined, recebidoEm: number, agora = Date.now()): number | undefined {
  if (!status) return undefined;
  return estimarSimNow(status, recebidoEm || agora, agora);
}

/**
 * `?t=` da página (instante passado ou undefined = ao vivo). Sem status, ou na fase 'pre', é sempre ao vivo;
 * instante no futuro (ou a menos de 1 min do agora) também.
 */
export function useInstanteParam(status: LiveStatus | undefined, recebidoEm: number) {
  const [params, setParams] = useSearchParams();
  const bruto = params.get('t');
  const pedido = lerInstante(bruto, status?.inicioApuracao);
  const limite = agoraApuracao(status, recebidoEm);
  let t: number | undefined = pedido;
  if (!status || status.fase === 'pre' || limite === undefined || pedido === undefined) t = undefined;
  else if (pedido >= limite - MIN / 2) t = undefined;
  else if (pedido < status.inicioApuracao) t = status.inicioApuracao;
  const setT = useCallback(
    (novo: number | undefined, opts?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (novo === undefined) p.delete('t');
          else p.set('t', formatarInstante(q(novo)));
          return p;
        },
        { replace: opts?.replace ?? true, preventScrollReset: true },
      );
    },
    [setParams],
  );
  return { t, setT, pedidoInvalido: !!bruto && pedido === undefined };
}

// =============================================================================================
// Cache dos instantes (React Query)
// =============================================================================================

/** Tamanho da chave COM instante, por consulta (hooks.ts: `[...base, t]`). */
const CHAVE_COM_T: Record<string, number> = { nacional: 3, brmun: 3, uf: 4, mun: 5, zona: 6, secao: 7 };
const ehConsultaDeInstante = (q: Pick<Query, 'queryKey'>) => {
  const k = q.queryKey;
  return typeof k[0] === 'string' && CHAVE_COM_T[k[0]] === k.length && typeof k[k.length - 1] === 'number';
};

/**
 * Reprise sem acumular memória: descarta os snapshots de instantes passados que ninguém mais observa (uma noite
 * inteira em passos de 1 min seriam centenas de snapshots nacionais + mapas por município).
 */
function useLimparInstantes(t: number | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    const atual = instanteChave(t);
    const id = window.setTimeout(
      () =>
        qc.removeQueries({
          predicate: (q) => ehConsultaDeInstante(q) && q.queryKey[q.queryKey.length - 1] !== atual && q.getObserversCount() === 0,
        }),
      1500,
    );
    return () => window.clearTimeout(id);
  }, [t, qc]);
}

// =============================================================================================
// Componente
// =============================================================================================

export interface LinhaDoTempoProps {
  status: LiveStatus;
  /** `dataUpdatedAt` da consulta do status (interpolação do relógio). */
  recebidoEm: number;
  /** Série AO VIVO (sem `t`) — fonte dos marcos de % de seções. */
  serie: SeriePoint[];
  /** Eventos AO VIVO — o de "eleito" vira marco. */
  eventos?: FeedEvent[];
  /** Slots dos candidatos (ordem da urna) para a faixa de quem estava à frente. */
  cores?: CorCandidato[];
  /** Instante exibido (undefined = ao vivo). */
  t: number | undefined;
  onChange: (t: number | undefined) => void;
  /** Os dados do instante atual ainda estão chegando (o play espera). */
  carregando?: boolean;
  /** Fixa no topo enquanto revendo (padrão true). */
  grudar?: boolean;
  className?: string;
}

interface Marco {
  t: number;
  rotulo: string;
  eleito?: boolean;
}

/** % de seções num instante (interpolado da série). */
function pstEm(serie: SeriePoint[], t: number): number {
  if (!serie.length || t < serie[0].t) return 0;
  let lo = 0;
  let hi = serie.length - 1;
  if (t >= serie[hi].t) return serie[hi].pst;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (serie[m].t <= t) lo = m;
    else hi = m;
  }
  const a = serie[lo];
  const b = serie[hi];
  return a.pst + ((t - a.t) / Math.max(1, b.t - a.t)) * (b.pst - a.pst);
}

/** Trechos da faixa: [x0, x1) em 0–1000 e o preenchimento (cor de quem estava à frente, pela margem). */
function faixaDaNoite(serie: SeriePoint[], cores: CorCandidato[], ini: number, fim: number): { x: number; w: number; fill: string }[] {
  const out: { x: number; w: number; fill: string }[] = [];
  const span = Math.max(1, fim - ini);
  const X = (t: number) => Math.max(0, Math.min(1000, ((t - ini) / span) * 1000));
  let atual: { x: number; fill: string } | null = null;
  for (let i = 0; i < serie.length; i++) {
    const p = serie[i];
    let fill = FILL_PENDENTE;
    if (p.pst > 0 && p.pv.length >= 2) {
      const [a, b] = p.pv;
      if (a !== b) {
        const lider = a > b ? 0 : 1;
        // Faixa fina: cor viva; a margem (até 15 p.p.) só modula a intensidade, em degraus (poucos trechos).
        const alfa = 0.5 + 0.5 * Math.min(1, Math.round((Math.abs(a - b) / 15) * 4) / 4);
        fill = rgbSlot(cores[lider] ?? (lider === 0 ? 'a' : 'b'), alfa);
      }
    }
    const x = X(p.t);
    if (!atual) atual = { x, fill };
    else if (atual.fill !== fill) {
      out.push({ x: atual.x, w: x - atual.x, fill: atual.fill });
      atual = { x, fill };
    }
  }
  if (atual) out.push({ x: atual.x, w: X(fim) - atual.x, fill: atual.fill });
  return out.filter((s) => s.w > 0);
}

export const LinhaDoTempo = memo(function LinhaDoTempo({ status, recebidoEm, serie, eventos, cores = ['a', 'b'], t, onChange, carregando, grudar = true, className }: LinhaDoTempoProps) {
  const agora = useNow(status.velocidade > 1 ? 500 : 1000);
  const simNow = agoraApuracao(status, recebidoEm, agora) ?? status.simNow;
  const ini = status.inicioApuracao ?? INICIO_APURACAO;
  // Fim da régua: o agora — ou, com a apuração encerrada, logo depois de 100% (o resto da noite é igual).
  const t100 = serie.find((p) => p.pst >= 100)?.t;
  const fim = Math.max(ini + 5 * MIN, t100 !== undefined ? Math.min(simNow, t100 + 10 * MIN) : simNow);
  const ultimo = q(fim);
  const vivo = t === undefined;

  const [tocando, setTocando] = useState(false);
  const [arrasto, setArrasto] = useState<number | null>(null);
  useLimparInstantes(t);
  // O play só avança quando nada do instante atual está a caminho (placar, mapa por município, UF…).
  const buscando = useIsFetching({ predicate: ehConsultaDeInstante }) > 0;
  const exibido = arrasto ?? (vivo ? fim : Math.min(t!, fim));
  const pos = (exibido - ini) / Math.max(1, fim - ini);

  const marcos = useMemo<Marco[]>(() => {
    const out: Marco[] = [];
    let j = 0;
    for (const p of serie) {
      while (j < MARCOS.length && p.pst >= MARCOS[j]) {
        out.push({ t: p.t, rotulo: `${MARCOS[j]}%` });
        j++;
      }
      if (j >= MARCOS.length) break;
    }
    const el = eventos?.find((e) => e.tipo === 'eleito');
    if (el) out.push({ t: el.t, rotulo: 'Eleito', eleito: true });
    return out;
  }, [serie, eventos]);

  // Faixa: recalcula quando a série cresce ou o fim da régua anda (quantizado a 1 min).
  const fimQ = q(fim);
  const faixa = useMemo(() => faixaDaNoite(serie, cores, ini, fimQ), [serie, cores, ini, fimQ]);

  // ---------------------------------------------------------------- play
  const ref = useRef({ t, carregando: carregando || buscando, ultimo, onChange });
  ref.current = { t, carregando: carregando || buscando, ultimo, onChange };
  useEffect(() => {
    if (!tocando) return;
    const id = window.setInterval(() => {
      const r = ref.current;
      if (r.carregando) return;
      const atual = r.t ?? ini;
      const prox = q(atual) + PASSO_SIM;
      if (prox >= r.ultimo) {
        setTocando(false);
        r.onChange(undefined);
      } else r.onChange(prox);
    }, PASSO_MS);
    return () => window.clearInterval(id);
  }, [tocando, ini]);

  const alternarPlay = () => {
    if (tocando) {
      setTocando(false);
      return;
    }
    // Ao vivo (ou no fim): recomeça do início da noite.
    if (vivo || (t !== undefined && t >= ultimo - MIN)) onChange(ini);
    setTocando(true);
  };

  // ---------------------------------------------------------------- arrastar
  const [trilhoRef, trilho, trilhoEl] = useElementSize<HTMLDivElement>();
  const ultimoEnvio = useRef(0);
  const pendente = useRef<number | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const instanteDoPonteiro = (clientX: number) => {
    const r = trilhoEl!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    return ini + f * (fim - ini);
  };
  const confirmar = (tt: number, final = false) => {
    const alvo = tt >= ultimo - MIN / 2 ? undefined : Math.max(ini, q(tt));
    const agoraMs = performance.now();
    window.clearTimeout(timer.current);
    if (final || agoraMs - ultimoEnvio.current >= ARRASTO_MS) {
      ultimoEnvio.current = agoraMs;
      onChange(alvo);
    } else {
      pendente.current = alvo;
      timer.current = window.setTimeout(() => {
        ultimoEnvio.current = performance.now();
        onChange(pendente.current);
      }, ARRASTO_MS - (agoraMs - ultimoEnvio.current));
    }
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setTocando(false);
    const tt = instanteDoPonteiro(e.clientX);
    setArrasto(tt);
    confirmar(tt);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (arrasto === null) return;
    const tt = instanteDoPonteiro(e.clientX);
    setArrasto(tt);
    confirmar(tt);
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (arrasto === null) return;
    const tt = instanteDoPonteiro(e.clientX);
    setArrasto(null);
    confirmar(tt, true);
  }
  function onKeyDown(e: KeyboardEvent) {
    const base = vivo ? ultimo : t!;
    const passo = e.shiftKey || e.key === 'PageUp' || e.key === 'PageDown' ? 10 * MIN : MIN;
    let alvo: number | undefined | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') alvo = Math.max(ini, q(base) - passo);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') alvo = vivo ? undefined : q(base) + passo >= ultimo ? undefined : q(base) + passo;
    else if (e.key === 'Home') alvo = ini;
    else if (e.key === 'End') alvo = undefined;
    else if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      alternarPlay();
      return;
    } else return;
    e.preventDefault();
    setTocando(false);
    onChange(alvo === null ? undefined : alvo);
  }

  // Rótulos dos marcos sem colisão (o mais antigo vence; "Eleito" sempre aparece).
  const rotulos = useMemo(() => {
    const largura = trilho.w || 300;
    const visiveis: { m: Marco; x: number; mostra: boolean }[] = [];
    let ultimoX = -Infinity;
    for (const m of [...marcos].sort((a, b) => a.t - b.t)) {
      if (m.t < ini || m.t > fim) continue;
      const x = ((m.t - ini) / Math.max(1, fim - ini)) * largura;
      const mostra = m.eleito || x - ultimoX >= 30;
      if (mostra && !m.eleito) ultimoX = x;
      visiveis.push({ m, x, mostra });
    }
    return visiveis;
  }, [marcos, ini, fim, trilho.w]);

  if (status.fase === 'pre' || simNow < ini + 3 * MIN || serie.length < 2) return null;

  const pst = pstEm(serie, exibido);
  const revendo = !vivo || arrasto !== null;
  const textoValor = vivo && arrasto === null ? `Ao vivo, ${fmtHora(simNow)}` : `${fmtHora(exibido)}, ${fmtPct(pst, 0)} das seções`;

  return (
    <section
      aria-label="Reveja a noite: linha do tempo da apuração"
      className={cn(
        'relative z-30 rounded-2xl border px-3 pb-2 pt-2.5 transition-[border-color,background-color,box-shadow] duration-300 sm:px-4',
        revendo ? 'border-brand/40 bg-surface/95 shadow-card backdrop-blur-md' : 'border-line bg-surface',
        revendo && grudar && 'sticky top-[calc(var(--app-header-h,56px)+8px)]',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={alternarPlay}
          aria-label={tocando ? 'Pausar a reprise' : vivo ? 'Rever a noite desde o início' : 'Continuar a reprise'}
          title={tocando ? 'Pausar' : 'Rever a noite (1 h em 30 s)'}
          className={cn(
            'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            tocando ? 'bg-brand-cta text-white' : 'bg-surface-3 text-fg hover:bg-brand/20',
          )}
        >
          <Icon name={tocando ? 'pause' : 'play'} size={18} strokeWidth={2.2} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[12.5px] leading-tight">
              {revendo ? (
                <>
                  <span className="font-semibold uppercase tracking-[0.12em] text-brand-fg">{tocando ? 'Reprise' : 'Revendo'}</span>
                  <span className="num ml-2 font-display text-[15px] font-semibold text-fg">{fmtHora(exibido)}</span>
                  <span className="num ml-1.5 text-fg-muted">
                    · {fmtPct(pst, pst < 10 ? 1 : 0)}
                    <span className="hidden min-[400px]:inline"> das seções</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold uppercase tracking-[0.12em] text-fg-muted">Reveja a noite</span>
                  <span className="ml-2 hidden text-fg-subtle sm:inline">arraste ou aperte play</span>
                </>
              )}
            </p>
            {revendo ? (
              <button
                type="button"
                onClick={() => {
                  setTocando(false);
                  onChange(undefined);
                }}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-[12px] font-semibold text-fg transition-colors hover:border-line/[2] hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <LiveDot tone={status.simulacao ? 'brand' : 'live'} size={6} />
                <span className="hidden min-[420px]:inline">Voltar ao vivo</span>
                <span className="min-[420px]:hidden">Ao vivo</span>
              </button>
            ) : (
              <span className="inline-flex h-7 shrink-0 items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">
                <LiveDot tone={status.simulacao ? 'brand' : 'live'} size={6} />
                <span className="num">{fmtHora(simNow)}</span>
              </span>
            )}
          </div>

          {/* trilho */}
          <div
            ref={trilhoRef}
            role="slider"
            tabIndex={0}
            aria-label="Instante da apuração"
            aria-valuemin={ini}
            aria-valuemax={fim}
            aria-valuenow={Math.round(exibido)}
            aria-valuetext={textoValor}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className="group relative mt-1.5 h-7 cursor-pointer touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-surface-3" title="Quem estava à frente em cada momento da noite">
              <svg viewBox="0 0 1000 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
                {faixa.map((f) => (
                  <rect key={`${f.x}-${f.fill}`} x={f.x} y={0} width={f.w + 0.6} height={1} style={{ fill: f.fill }} />
                ))}
              </svg>
              {/* depois do instante exibido: esmaecido */}
              <div
                className={cn('absolute inset-y-0 right-0 bg-surface/75', tocando && 'transition-[left] duration-500 ease-linear')}
                style={{ left: `${pos * 100}%` }}
              />
            </div>
            {rotulos.map(({ m, x }) => (
              <span
                key={m.rotulo}
                aria-hidden
                className={cn(
                  'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                  m.eleito ? 'h-3 w-3 bg-fg ring-2 ring-surface' : 'h-2.5 w-[2px] bg-fg/35',
                )}
                style={{ left: x }}
              />
            ))}
            <span
              aria-hidden
              className={cn(
                'absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface shadow-card transition-transform group-active:scale-110',
                revendo ? 'bg-brand' : 'bg-fg',
                tocando && 'transition-[left] duration-500 ease-linear',
              )}
              style={{ left: `${pos * 100}%` }}
            />
            {arrasto !== null ? (
              <span
                aria-hidden
                className="num pointer-events-none absolute -top-7 -translate-x-1/2 rounded-lg bg-fg px-1.5 py-0.5 text-[12px] font-semibold text-bg shadow-card"
                style={{ left: `${Math.min(0.94, Math.max(0.06, pos)) * 100}%` }}
              >
                {fmtHora(exibido)}
              </span>
            ) : null}
          </div>
          {/* rótulos dos marcos */}
          <div aria-hidden className="relative h-3.5">
            {rotulos
              .filter((r) => r.mostra)
              .map(({ m, x }) => (
                <span
                  key={m.rotulo}
                  className={cn(
                    'num absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none',
                    m.eleito ? 'font-semibold text-fg' : 'text-fg-subtle',
                  )}
                  style={{ left: Math.min(Math.max(x, 10), (trilho.w || 300) - 10) }}
                >
                  {m.eleito ? '✓ Eleito' : m.rotulo}
                </span>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
});
