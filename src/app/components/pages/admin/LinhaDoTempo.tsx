/**
 * Linha do tempo da noite (scrubber): régua de 16:59 até o fim previsto, curva de % de seções totalizadas
 * (a partir dos marcos do motor), marcos 1/10/25/50/75/90/99/100% e o cursor do instante atual.
 * Arrastar (mouse/toque) ou usar as setas → comando `saltar-tempo`. Botões rápidos → `saltar-pct`/`saltar-tempo`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { area as d3area, curveMonotoneX, line as d3line } from 'd3-shape';
import { INICIO_APURACAO } from '@/shared/constants';
import { fmtHora, fmtHoraSeg, fmtPct } from '@/shared/format';
import { pctTotalizadas } from '@/shared/calc';
import { cn } from '@/app/lib/cn';
import { useNow } from '@/app/lib/useNow';
import { Button, Icon } from '@/app/ui';
import { useAdmin } from './dados';
import { Painel } from './kit';
import { dominioRegua, instanteDados, INICIO_SIMULACAO, pctNoInstante, relogioAgora } from './rotulos';

const H = 132;
const TOPO = 26; // espaço dos rótulos de marcos
const BASE = 104; // linha de base da curva
const PAD = 14;

/** Mede a largura de um elemento (ResizeObserver). */
function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setW(Math.round(el.getBoundingClientRect().width));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const HORA = 3600_000;
const ATALHOS_PCT = [10, 50, 90, 99, 100];
const ATALHOS_HORA = [17, 18, 19, 20].map((h) => ({ h, t: INICIO_APURACAO + (h - 17) * HORA }));

export function LinhaDoTempo({ className, extra }: { className?: string; extra?: ReactNode }) {
  const { snap, dados, nacional, run, pendente } = useAdmin();
  const sim = snap.state.fonte === 'simulacao';
  const rapido = sim && snap.state.relogio.rodando && snap.state.relogio.velocidade >= 5;
  const agora = useNow(rapido ? 250 : 1000);
  const simNow = relogioAgora(snap, dados.recebidoEm, agora);
  const tDados = instanteDados(snap, simNow);
  const [t0, t1] = dominioRegua(snap);
  const [ref, W] = useLargura<HTMLDivElement>();
  const [arraste, setArraste] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [teclado, setTeclado] = useState<number | null>(null);
  const timerTeclado = useRef<number | undefined>(undefined);

  const largura = Math.max(W, 200);
  const x = useCallback((t: number) => PAD + ((Math.min(t1, Math.max(t0, t)) - t0) / (t1 - t0)) * (largura - 2 * PAD), [t0, t1, largura]);
  const tDeX = useCallback(
    (px: number) => {
      const f = Math.min(1, Math.max(0, (px - PAD) / (largura - 2 * PAD)));
      return Math.round((t0 + f * (t1 - t0)) / 1000) * 1000;
    },
    [t0, t1, largura],
  );
  const y = (pct: number) => BASE - (pct / 100) * (BASE - TOPO - 6);

  // curva de % de seções ao longo da noite
  const pontos = useMemo(() => {
    const p: [number, number][] = [[t0, 0], [INICIO_APURACAO, 0]];
    for (const m of snap.marcos) p.push([m.t, m.pct]);
    p.push([t1, 100]);
    return p.filter((v, i, a) => i === 0 || v[0] > a[i - 1][0]);
  }, [snap.marcos, t0, t1]);
  const geradorArea = useMemo(
    () => d3area<[number, number]>().x((d) => x(d[0])).y0(BASE).y1((d) => y(d[1])).curve(curveMonotoneX),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [x],
  );
  const geradorLinha = useMemo(() => d3line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1])).curve(curveMonotoneX), [x]);
  const dArea = geradorArea(pontos) ?? '';
  const dLinha = geradorLinha(pontos) ?? '';

  const comitar = useCallback(
    (t: number) => run({ tipo: 'saltar-tempo', simNow: t }, { chave: 'saltar', sucesso: `Relógio em ${fmtHoraSeg(t)}` }),
    [run],
  );

  // ---- ponteiro ----
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!sim || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    setArraste(tDeX(e.clientX - r.left));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = tDeX(e.clientX - r.left);
    if (arraste !== null) setArraste(t);
    else if (e.pointerType === 'mouse') setHover(t);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (arraste === null) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const t = arraste;
    setArraste(null);
    void comitar(t).finally(() => setHover(null));
  };

  // ---- teclado (debounce: várias setas = um comando) ----
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!sim) return;
    const passo = (e.shiftKey ? 10 : 1) * 60_000;
    const base = teclado ?? simNow;
    let alvo: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') alvo = base + passo;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') alvo = base - passo;
    else if (e.key === 'Home') alvo = INICIO_SIMULACAO;
    else if (e.key === 'End') alvo = snap.fimPrevisto ?? t1;
    else if (e.key === 'PageUp') alvo = base + 30 * 60_000;
    else if (e.key === 'PageDown') alvo = base - 30 * 60_000;
    if (alvo === null) return;
    e.preventDefault();
    e.stopPropagation();
    const t = Math.round(Math.min(t1, Math.max(t0, alvo)) / 1000) * 1000;
    setTeclado(t);
    window.clearTimeout(timerTeclado.current);
    timerTeclado.current = window.setTimeout(() => {
      void comitar(t).finally(() => setTeclado(null));
    }, 450);
  };
  useEffect(() => () => window.clearTimeout(timerTeclado.current), []);

  const fantasma = arraste ?? teclado;
  const mostra = fantasma ?? hover;
  const pctReal = nacional ? pctTotalizadas(nacional.resumo) : pctNoInstante(snap, tDados);

  // marcas de hora e rótulos dos marcos (sem sobreposição)
  const horas = useMemo(() => {
    const out: { t: number; maior: boolean }[] = [];
    const q = 15 * 60_000;
    for (let t = Math.ceil(t0 / q) * q; t <= t1; t += q) out.push({ t, maior: (t - INICIO_APURACAO) % HORA === 0 });
    return out;
  }, [t0, t1]);
  const rotulosHora = useMemo(() => {
    let ultimo = -Infinity;
    return horas
      .filter((h) => h.maior)
      .filter((h) => {
        const px = x(h.t);
        if (px - ultimo < 40) return false;
        ultimo = px;
        return true;
      });
  }, [horas, x]);
  const rotulosMarcos = useMemo(() => {
    let ultimo = -Infinity;
    const visiveis = new Set<number>();
    // da direita para a esquerda: prioriza 100%, 99%, 90%… (os do começo se acumulam)
    const ordem = [...snap.marcos].sort((a, b) => b.t - a.t);
    let ultimoDir = Infinity;
    for (const m of ordem) {
      const px = x(m.t);
      if (ultimoDir - px >= 30) {
        visiveis.add(m.pct);
        ultimoDir = px;
      }
    }
    void ultimo;
    return visiveis;
  }, [snap.marcos, x]);

  const xAgora = x(simNow);
  const xDados = x(tDados);
  const idGrad = 'lt-grad';
  const idClip = 'lt-clip';

  return (
    <Painel
      className={className}
      titulo="Linha do tempo"
      icone="relogio"
      subtitulo={
        sim
          ? 'Arraste o cursor ou use as setas para saltar no tempo. Todos os visitantes saltam junto.'
          : 'A linha do tempo controla só a simulação. Troque a fonte para Simulação para usá-la.'
      }
      acoes={
        <span className="num inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-[12.5px] text-fg-muted">
          {mostra !== null ? (
            <>
              <Icon name="seta" size={14} className="text-brand-fg" />
              <span className="font-semibold text-fg">{fmtHoraSeg(mostra)}</span>
              <span>~{fmtPct(pctNoInstante(snap, mostra), 0)}</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-fg">{fmtHora(simNow)}</span>
              <span>{fmtPct(pctReal)} das seções</span>
            </>
          )}
        </span>
      }
    >
      <div
        ref={ref}
        role="slider"
        tabIndex={sim ? 0 : -1}
        aria-label="Linha do tempo da apuração"
        aria-valuemin={Math.round((t0 - INICIO_APURACAO) / 60_000)}
        aria-valuemax={Math.round((t1 - INICIO_APURACAO) / 60_000)}
        aria-valuenow={Math.round(((fantasma ?? simNow) - INICIO_APURACAO) / 60_000)}
        aria-valuetext={`${fmtHoraSeg(fantasma ?? simNow)}, cerca de ${fmtPct(pctNoInstante(snap, fantasma ?? simNow), 0)} das seções`}
        aria-disabled={!sim || undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setArraste(null)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        className={cn(
          'relative -mx-1 select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand',
          sim ? 'cursor-ew-resize touch-none' : 'cursor-not-allowed opacity-60',
        )}
        style={{ height: H }}
      >
        {W > 0 ? (
          <svg width={W} height={H} className="block overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: 'rgb(var(--brand))', stopOpacity: 0.55 }} />
                <stop offset="1" style={{ stopColor: 'rgb(var(--brand))', stopOpacity: 0.06 }} />
              </linearGradient>
              <clipPath id={idClip}>
                <rect x={0} y={0} width={Math.max(0, xDados)} height={H} />
              </clipPath>
            </defs>
            {/* faixas de hora */}
            {horas.map((h) => (
              <line
                key={h.t}
                x1={x(h.t)}
                x2={x(h.t)}
                y1={h.maior ? TOPO - 4 : BASE - 6}
                y2={BASE + (h.maior ? 6 : 3)}
                className={h.maior ? 'stroke-line' : 'stroke-line/[0.7]'}
                strokeDasharray={h.maior ? '2 4' : undefined}
              />
            ))}
            {/* curva: futuro (neutro) e passado (marca) */}
            <path d={dArea} className="fill-surface-3/70" />
            <path d={dLinha} fill="none" className="stroke-fg-subtle/60" strokeWidth={1.25} />
            <g clipPath={`url(#${idClip})`}>
              <path d={dArea} fill={`url(#${idGrad})`} />
              <path d={dLinha} fill="none" className="stroke-brand-2" strokeWidth={2} />
            </g>
            <line x1={PAD} x2={largura - PAD} y1={BASE} y2={BASE} className="stroke-line/[2]" />
            {/* marcos */}
            {snap.marcos.map((m) => {
              const px = x(m.t);
              const passou = tDados >= m.t;
              return (
                <g key={m.pct}>
                  <line x1={px} x2={px} y1={y(m.pct)} y2={BASE} className={passou ? 'stroke-brand-2/70' : 'stroke-fg-subtle/50'} strokeWidth={1} />
                  <circle cx={px} cy={y(m.pct)} r={2.75} className={passou ? 'fill-brand-2' : 'fill-surface stroke-fg-subtle'} strokeWidth={1.25} />
                  {rotulosMarcos.has(m.pct) ? (
                    <text
                      x={px}
                      y={TOPO - 10}
                      textAnchor={px > largura - 24 ? 'end' : 'middle'}
                      className={cn('num text-[10.5px] font-semibold', passou ? 'fill-brand-fg' : 'fill-fg-muted')}
                    >
                      {m.pct}%
                    </text>
                  ) : null}
                </g>
              );
            })}
            {/* rótulos de hora */}
            {rotulosHora.map((h) => (
              <text key={h.t} x={x(h.t)} y={BASE + 20} textAnchor="middle" className="num fill-fg-muted text-[11px] font-medium">
                {fmtHora(h.t)}
              </text>
            ))}
            {/* congelado: instante dos dados */}
            {snap.state.congelado ? (
              <line x1={xDados} x2={xDados} y1={TOPO - 4} y2={BASE} className="stroke-alert" strokeWidth={1.5} strokeDasharray="3 3" />
            ) : null}
            {/* hover / arraste */}
            {mostra !== null ? (
              <g>
                <line x1={x(mostra)} x2={x(mostra)} y1={TOPO - 2} y2={BASE} className="stroke-fg/60" strokeWidth={1.25} strokeDasharray={fantasma !== null ? undefined : '3 3'} />
                <circle cx={x(mostra)} cy={y(pctNoInstante(snap, mostra))} r={4} className="fill-fg" />
              </g>
            ) : null}
            {/* cursor do instante atual */}
            <g className={cn(fantasma !== null && 'opacity-40')}>
              <line x1={xAgora} x2={xAgora} y1={TOPO - 6} y2={BASE + 6} className="stroke-fg" strokeWidth={2} />
              <circle cx={xAgora} cy={y(sim ? pctNoInstante(snap, tDados) : 0)} r={5.5} className="fill-fg stroke-surface" strokeWidth={2.5} />
              <rect x={xAgora - 5} y={BASE + 2} width={10} height={6} rx={2} className="fill-fg" />
            </g>
          </svg>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ir para % das seções">
          <span className="mr-1 text-[12px] font-medium text-fg-muted">Ir para</span>
          {ATALHOS_PCT.map((p) => (
            <Button
              key={p}
              size="sm"
              variant="outline"
              disabled={!sim || pendente('saltar')}
              onClick={() => void run({ tipo: 'saltar-pct', pct: p }, { chave: 'saltar', sucesso: `Relógio no instante de ${p}% das seções` })}
              className="num"
            >
              {p}%
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ir para horário">
          <span className="mr-1 text-[12px] font-medium text-fg-muted">Horário</span>
          {ATALHOS_HORA.map(({ h, t }) => (
            <Button key={h} size="sm" variant="outline" disabled={!sim || pendente('saltar')} onClick={() => void comitar(t)} className="num">
              {String(h).padStart(2, '0')}:00
            </Button>
          ))}
        </div>
        {extra ? <div className="ml-auto max-w-full overflow-x-auto scrollbar-none">{extra}</div> : null}
      </div>
    </Painel>
  );
}
