/**
 * "A corrida da apuração": % de votos válidos de cada candidato (eixo Y) conforme as seções são
 * totalizadas (eixo X, 0–100%) — ou pelo horário de Brasília.
 *
 * - Uma linha por candidato (cor do slot), faixa sombreada sutil entre as linhas na cor de quem lidera.
 * - Linha de referência em 50%; viradas (cruzamentos) marcadas e rotuladas.
 * - Crosshair interativo (mouse, arrastar no celular, setas do teclado) com os valores no ponto.
 * - Animação de desenho na primeira exibição (respeita prefers-reduced-motion).
 * - Rótulos de valor na ponta de cada linha; legenda sempre visível; tabela para leitores de tela.
 */
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { area as d3area, curveMonotoneX, line as d3line } from 'd3-shape';
import type { Race, SeriePoint } from '@/shared/types';
import { fmtHora, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot, rgbSlot } from '@/app/lib/raceUi';
import { useClickOutside, useElementSize } from './MapHooks';

export interface TimelineChartProps {
  serie: SeriePoint[];
  race: Pick<Race, 'candidatos'>;
  /** Eixo X: % de seções totalizadas (padrão) ou horário. */
  eixoX?: 'secoes' | 'horario';
  /** Altura do gráfico em px. Padrão: 220 no celular, 300 no desktop. */
  altura?: number;
  /** Marca e rotula as viradas (padrão: sim). */
  viradas?: boolean;
  /** Ignora cruzamentos antes deste % de seções (ruído do começo). Padrão: 1. */
  minPstVirada?: number;
  /** Animação de desenho na primeira exibição (padrão: sim). */
  animar?: boolean;
  /** Esconde a legenda acima do gráfico. */
  semLegenda?: boolean;
  className?: string;
  ariaLabel?: string;
}

interface Virada {
  x: number;
  pst: number;
  t: number;
  lider: number;
  rotulo: boolean;
}

const M = { top: 14, right: 62, bottom: 26, left: 34 };

export function TimelineChart({
  serie,
  race,
  eixoX = 'secoes',
  altura,
  viradas = true,
  minPstVirada = 1,
  animar = true,
  semLegenda,
  className,
  ariaLabel,
}: TimelineChartProps) {
  const uid = useId().replace(/:/g, '');
  const reduzir = useReducedMotion();
  const [boxRef, size, boxEl] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; fixo: boolean } | null>(null);
  useClickOutside(boxEl, !!hover?.fixo, () => setHover(null));

  const W = Math.max(0, size.w);
  const H = altura ?? (W < 480 ? 220 : 300);
  const pw = Math.max(10, W - M.left - M.right);
  const ph = Math.max(10, H - M.top - M.bottom);
  const n = race.candidatos.length;
  const dois = n === 2;

  const xVal = (p: SeriePoint) => (eixoX === 'horario' ? p.t : p.pst);

  const { x, y, yTicks, xTicks, fmtX } = useMemo(() => {
    // Y: simétrico em torno de 50% na disputa a dois; 0–máx no 1º turno.
    let y;
    let yTicks: number[];
    const relevantes = serie.filter((p) => p.pst >= 2);
    const base = relevantes.length ? relevantes : serie;
    if (dois) {
      let d = 0;
      for (const p of base) d = Math.max(d, Math.abs(p.pv[0] - 50));
      const passo = d < 2.5 ? 1 : d < 5 ? 2 : d < 16 ? 5 : 10;
      const lim = Math.min(50, Math.max(passo * 2, Math.ceil((d + passo * 0.35) / passo) * passo));
      y = scaleLinear()
        .domain([50 - lim, 50 + lim])
        .range([ph, 0]);
      yTicks = [];
      const stepT = ph < 160 && lim / passo > 2 ? passo * 2 : passo;
      for (let v = 50 - lim; v <= 50 + lim + 1e-9; v += stepT) yTicks.push(Math.round(v * 100) / 100);
      if (!yTicks.includes(50)) yTicks.push(50);
    } else {
      let mx = 0;
      for (const p of base) for (const v of p.pv) mx = Math.max(mx, v);
      y = scaleLinear()
        .domain([0, Math.min(100, Math.ceil((mx + 4) / 10) * 10)])
        .range([ph, 0]);
      yTicks = y.ticks(4);
    }
    if (eixoX === 'horario') {
      const t0 = serie[0]?.t ?? Date.now();
      const t1 = Math.max(serie[serie.length - 1]?.t ?? t0, t0 + 60 * 60 * 1000);
      const x = scaleUtc().domain([t0, t1]).range([0, pw]);
      const xTicks = x.ticks(pw < 300 ? 3 : 6).map((d) => +d);
      return {
        x: (v: number) => x(v),
        y,
        yTicks,
        xTicks,
        fmtX: (v: number) => fmtHora(v),
        inv: (px: number) => +x.invert(px),
      };
    }
    const x = scaleLinear().domain([0, 100]).range([0, pw]);
    const xTicks = pw < 320 ? [0, 50, 100] : [0, 25, 50, 75, 100];
    return { x: (v: number) => x(v), y, yTicks, xTicks, fmtX: (v: number) => `${v}%` };
  }, [serie, dois, ph, pw, eixoX]);

  // Pontos com cruzamentos inseridos (para a faixa entre as linhas fechar exatamente na virada).
  const { linhas, faixas, cruz } = useMemo(() => {
    const pts = serie.map((p) => ({ x: x(xVal(p)), pv: p.pv, pst: p.pst, t: p.t }));
    const linhas = race.candidatos.map(
      (_, ci) =>
        d3line<(typeof pts)[number]>()
          .x((p) => p.x)
          .y((p) => y(p.pv[ci] ?? 0))
          .curve(curveMonotoneX)(pts) ?? '',
    );
    const cruz: Virada[] = [];
    let faixas: string[] = [];
    if (dois && pts.length > 1) {
      const aug: { x: number; a: number; b: number }[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (i > 0) {
          const q = pts[i - 1];
          const d0 = q.pv[0] - q.pv[1];
          const d1 = p.pv[0] - p.pv[1];
          if (d0 !== 0 && d1 !== 0 && Math.sign(d0) !== Math.sign(d1)) {
            const f = d0 / (d0 - d1);
            const xc = q.x + (p.x - q.x) * f;
            aug.push({ x: xc, a: 50, b: 50 });
            const pst = q.pst + (p.pst - q.pst) * f;
            if (pst >= minPstVirada)
              cruz.push({ x: xc, pst, t: q.t + (p.t - q.t) * f, lider: d1 > 0 ? 0 : 1, rotulo: true });
          }
        }
        aug.push({ x: p.x, a: p.pv[0], b: p.pv[1] });
      }
      const mk = (ci: 0 | 1) =>
        d3area<(typeof aug)[number]>()
          .x((p) => p.x)
          .y0((p) => y(ci === 0 ? p.b : p.a))
          .y1((p) => y(Math.max(p.a, p.b)))(aug) ?? '';
      faixas = [mk(0), mk(1)];
      // Rótulo só na última virada de cada grupo próximo (evita amontoar no começo).
      for (let i = 0; i < cruz.length - 1; i++)
        if (cruz[i + 1].x - cruz[i].x < Math.max(48, pw * 0.12)) cruz[i].rotulo = false;
    }
    return { linhas, faixas, cruz };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, x, y, dois, race.candidatos, minPstVirada, pw]);

  const ultimo = serie[serie.length - 1];
  const fimX = ultimo ? x(xVal(ultimo)) : 0;
  /** Rótulos de ponta logo depois do último ponto (ou na margem direita no fim da apuração). */
  const rotX = Math.min(fimX + 12, pw + 10);

  // Rótulos de ponta sem colisão (afasta simetricamente quando as linhas estão juntas).
  const pontas = useMemo(() => {
    if (!ultimo) return [];
    const arr = race.candidatos.map((c, i) => ({ i, cor: c.cor, v: ultimo.pv[i] ?? 0, y: y(ultimo.pv[i] ?? 0) }));
    const ord = [...arr].sort((a, b) => a.y - b.y);
    const minSep = 17;
    for (let k = 1; k < ord.length; k++) {
      if (ord[k].y - ord[k - 1].y < minSep) {
        const meio = (ord[k].y + ord[k - 1].y) / 2;
        ord[k - 1].y = meio - minSep / 2;
        ord[k].y = meio + minSep / 2;
      }
    }
    return arr;
  }, [ultimo, race.candidatos, y]);

  // ------------------------------------------------------------- interação
  const indicePorX = (px: number) => {
    if (!serie.length) return -1;
    let lo = 0;
    let hi = serie.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (x(xVal(serie[mid])) < px) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(x(xVal(serie[lo - 1])) - px) < Math.abs(x(xVal(serie[lo])) - px)) lo--;
    return lo;
  };
  function onPointer(e: PointerEvent<SVGRectElement>, fixo: boolean) {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const i = indicePorX(e.clientX - r.left);
    if (i >= 0) setHover({ i, fixo: fixo || e.pointerType === 'touch' });
  }
  function onKey(e: KeyboardEvent) {
    if (!serie.length) return;
    const atual = hover?.i ?? serie.length - 1;
    let i = atual;
    if (e.key === 'ArrowLeft') i = Math.max(0, atual - (e.shiftKey ? 10 : 1));
    else if (e.key === 'ArrowRight') i = Math.min(serie.length - 1, atual + (e.shiftKey ? 10 : 1));
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = serie.length - 1;
    else if (e.key === 'Escape') return setHover(null);
    else return;
    e.preventDefault();
    setHover({ i, fixo: true });
  }

  const hp = hover && serie[hover.i] ? serie[hover.i] : null;
  const hx = hp ? x(xVal(hp)) : 0;
  const animado = animar && !reduzir;
  const descricao = ultimo
    ? `Com ${fmtPct(ultimo.pst)} das seções totalizadas: ${race.candidatos.map((c, i) => `${c.nomeUrna} ${fmtPct(ultimo.pv[i] ?? 0)}`).join(', ')}.` +
      (cruz.length ? ` ${cruz.length} ${cruz.length === 1 ? 'virada' : 'viradas'} ao longo da apuração.` : '')
    : 'Aguardando as primeiras seções.';

  // Checkpoints para a tabela acessível (a cada 10% de seções).
  const checkpoints = useMemo(() => {
    const out: SeriePoint[] = [];
    let alvo = 10;
    for (const p of serie) {
      if (p.pst >= alvo) {
        out.push(p);
        while (alvo <= p.pst) alvo += 10;
      }
    }
    if (ultimo && out[out.length - 1] !== ultimo) out.push(ultimo);
    return out;
  }, [serie, ultimo]);

  return (
    <div className={cn('w-full', className)}>
      {!semLegenda ? (
        <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-fg-muted">
          {race.candidatos.map((c) => (
            <li key={c.numero} className="flex items-center gap-1.5">
              <span aria-hidden className={cn('h-[3px] w-4 rounded-full', corSlot(c.cor).bg)} />
              <span className="text-fg">{c.nomeUrna}</span>
            </li>
          ))}
          <li className="ml-auto text-[11px] text-fg-subtle">
            % dos votos válidos × {eixoX === 'horario' ? 'horário de Brasília' : '% das seções totalizadas'}
          </li>
        </ul>
      ) : null}

      <div ref={boxRef} className="relative w-full select-none" style={{ height: H }}>
        {W > 0 ? (
          <svg
            width={W}
            height={H}
            className="block overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-brand"
            role="img"
            tabIndex={0}
            aria-label={ariaLabel ?? `Gráfico da apuração. ${descricao}`}
            onKeyDown={onKey}
            onBlur={() => setHover((h) => (h?.fixo ? null : h))}
          >
            <defs>
              <clipPath id={`clip-${uid}`}>
                <rect x={0} y={-2} width={pw + 2} height={ph + 4} />
              </clipPath>
            </defs>
            <g transform={`translate(${M.left},${M.top})`}>
              {/* grade */}
              {yTicks.map((v) => (
                <g key={v} transform={`translate(0,${y(v)})`}>
                  <line
                    x2={pw}
                    style={{
                      stroke: v === 50 && dois ? 'rgb(var(--fg-subtle) / 0.9)' : 'rgb(var(--line) / var(--line-alpha))',
                      strokeWidth: 1,
                    }}
                  />
                  <text
                    x={-8}
                    dy="0.32em"
                    textAnchor="end"
                    className="num font-sans"
                    style={{
                      fontSize: 10.5,
                      fill: v === 50 && dois ? 'rgb(var(--fg-muted))' : 'rgb(var(--fg-subtle))',
                    }}
                  >
                    {v}%
                  </text>
                </g>
              ))}
              {xTicks.map((v, i) => (
                <text
                  key={v}
                  x={x(v)}
                  y={ph + 18}
                  textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 && eixoX === 'secoes' ? 'end' : 'middle'}
                  className="num font-sans"
                  style={{ fontSize: 10.5, fill: 'rgb(var(--fg-subtle))' }}
                >
                  {fmtX(v)}
                </text>
              ))}
              <line y1={ph} y2={ph} x2={pw} style={{ stroke: 'rgb(var(--line) / var(--line-alpha))' }} />

              <g clipPath={`url(#clip-${uid})`}>
                {/* faixa entre as linhas */}
                {faixas.map((d, ci) => (
                  <motion.path
                    key={ci}
                    d={d}
                    initial={animado ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: animado ? 0.7 : 0 }}
                    style={{ fill: rgbSlot(race.candidatos[ci].cor, 0.1) }}
                  />
                ))}
                {/* linhas (líder por cima) */}
                {race.candidatos
                  .map((c, ci) => ({ c, ci }))
                  .sort((a, b) => (ultimo ? (ultimo.pv[a.ci] ?? 0) - (ultimo.pv[b.ci] ?? 0) : 0))
                  .map(({ c, ci }) => (
                    <motion.path
                      key={c.numero}
                      d={linhas[ci]}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={animado ? { pathLength: 0 } : false}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
                      style={{ stroke: rgbSlot(c.cor), strokeWidth: 2.25 }}
                    />
                  ))}
              </g>

              {/* viradas: marcador no cruzamento + anotação no rodapé do gráfico (longe das linhas) */}
              {viradas
                ? cruz.map((v, k) => {
                    const yc = y(50);
                    const yRot = ph - 8;
                    const ancora = v.x > pw - 50 ? 'end' : v.x < 50 ? 'start' : 'middle';
                    return (
                      <g key={k} pointerEvents="none">
                        {v.rotulo ? (
                          <>
                            <line
                              x1={v.x}
                              x2={v.x}
                              y1={yc + 7}
                              y2={yRot - 13}
                              style={{ stroke: 'rgb(var(--fg-subtle) / 0.55)', strokeWidth: 1 }}
                            />
                            <text
                              x={v.x}
                              y={yRot}
                              textAnchor={ancora}
                              className="num font-sans"
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                fill: 'rgb(var(--fg-muted))',
                                paintOrder: 'stroke',
                                stroke: 'rgb(var(--surface))',
                                strokeWidth: 3,
                                strokeLinejoin: 'round',
                              }}
                            >
                              {eixoX === 'horario' ? `Virada às ${fmtHora(v.t)}` : `Virada · ${fmtPct(v.pst, 1)}`}
                            </text>
                          </>
                        ) : null}
                        <circle
                          cx={v.x}
                          cy={yc}
                          r={4.5}
                          style={{
                            fill: rgbSlot(race.candidatos[v.lider].cor),
                            stroke: 'rgb(var(--surface))',
                            strokeWidth: 2,
                          }}
                        />
                      </g>
                    );
                  })
                : null}

              {/* pontas */}
              {ultimo
                ? pontas.map((p) => (
                    <g key={p.i} pointerEvents="none">
                      <circle
                        cx={fimX}
                        cy={y(ultimo.pv[p.i] ?? 0)}
                        r={4}
                        style={{ fill: rgbSlot(p.cor), stroke: 'rgb(var(--surface))', strokeWidth: 2 }}
                      />
                      <text
                        x={rotX}
                        y={p.y}
                        dy="0.34em"
                        className="num font-sans"
                        style={{ fontSize: 12, fontWeight: 650, fill: 'rgb(var(--fg))' }}
                      >
                        {fmtPct(p.v)}
                      </text>
                      {Math.abs(p.y - y(ultimo.pv[p.i] ?? 0)) > 2 ? (
                        <line
                          x1={fimX + 5}
                          x2={rotX - 3}
                          y1={y(ultimo.pv[p.i] ?? 0)}
                          y2={p.y}
                          style={{ stroke: rgbSlot(p.cor, 0.6), strokeWidth: 1 }}
                        />
                      ) : null}
                    </g>
                  ))
                : null}

              {/* crosshair */}
              {hp ? (
                <g pointerEvents="none">
                  <line x1={hx} x2={hx} y1={0} y2={ph} style={{ stroke: 'rgb(var(--fg) / 0.45)', strokeWidth: 1 }} />
                  {race.candidatos.map((c, ci) => (
                    <circle
                      key={c.numero}
                      cx={hx}
                      cy={y(hp.pv[ci] ?? 0)}
                      r={4.5}
                      style={{ fill: rgbSlot(c.cor), stroke: 'rgb(var(--surface))', strokeWidth: 2 }}
                    />
                  ))}
                </g>
              ) : null}

              {/* área de captura do ponteiro (arrastar horizontal no celular; rolagem vertical continua) */}
              <rect
                width={pw}
                height={ph}
                fill="transparent"
                style={{ touchAction: 'pan-y' }}
                onPointerDown={(e) => onPointer(e, e.pointerType === 'touch')}
                onPointerMove={(e) => (e.pointerType !== 'touch' || e.buttons ? onPointer(e, false) : undefined)}
                onPointerLeave={(e) => e.pointerType !== 'touch' && setHover((h) => (h?.fixo ? h : null))}
              />
            </g>
          </svg>
        ) : null}

        {!serie.length ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-fg-subtle">
            Aguardando as primeiras seções totalizadas
          </div>
        ) : null}

        {hp ? (
          <div
            className="pointer-events-none absolute z-10 min-w-[150px] rounded-xl border border-line bg-surface/95 px-2.5 py-2 shadow-card backdrop-blur-md"
            style={{
              top: 4,
              left: Math.min(Math.max(4, M.left + hx + (M.left + hx > W - 180 ? -170 : 12)), W - 164),
            }}
            role="status"
          >
            <p className="num text-[11px] text-fg-subtle">
              {fmtPct(hp.pst)} das seções · {fmtHora(hp.t)}
            </p>
            <ul className="mt-1 space-y-0.5">
              {race.candidatos
                .map((c, ci) => ({ c, ci }))
                .sort((a, b) => (hp.pv[b.ci] ?? 0) - (hp.pv[a.ci] ?? 0))
                .map(({ c, ci }) => (
                  <li key={c.numero} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
                      <span aria-hidden className={cn('h-[3px] w-3 shrink-0 rounded-full', corSlot(c.cor).bg)} />
                      <span className="truncate">{c.nomeUrna}</span>
                    </span>
                    <span className="num font-semibold text-fg">{fmtPct(hp.pv[ci] ?? 0)}</span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="sr-only">
        <table>
          <caption>Evolução da apuração</caption>
          <thead>
            <tr>
              <th scope="col">Seções totalizadas</th>
              <th scope="col">Horário</th>
              {race.candidatos.map((c) => (
                <th key={c.numero} scope="col">
                  {c.nomeUrna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {checkpoints.map((p) => (
              <tr key={p.t}>
                <td>{fmtPct(p.pst)}</td>
                <td>{fmtHora(p.t)}</td>
                {race.candidatos.map((c, ci) => (
                  <td key={c.numero}>{fmtPct(p.pv[ci] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
