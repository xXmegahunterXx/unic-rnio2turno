/**
 * Mapa do cenário: as 27 UFs coloridas por quem fica à frente NO CENÁRIO (cor do slot, intensidade pela margem em 4
 * faixas, como nos mapas da apuração). Mesma geometria e mesmos encaixes do BrazilMap (caixas das UFs pequenas do
 * Nordeste fora da costa e callout do DF), mas sem nada de "apuração" (não há seções nem % apurado aqui).
 *
 *  - Interativo (página): toque/clique seleciona a UF; o mouse realça. A alternativa acessível é a lista de UFs.
 *  - Estático (cartão de compartilhar): `largura` em px, sem transições nem eventos.
 *  - `mudancas`: contorno tracejado nas UFs em que fica à frente quem estava atrás no 1º turno.
 */
import { memo, useMemo, type MouseEvent, type PointerEvent } from 'react';
import type { UFBr } from '@/shared/types';
import { UFS } from '@/shared/types';
import type { GeoBrasil } from '@/shared/dataset';
import type { ResultadoCenario, ResultadoUfCenario } from '@/shared/cenarios';
import { margemArea, vencedorArea } from '@/shared/cenarios';
import { bucketMargem } from '@/shared/calc';
import { MARGEM_BUCKETS } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { FILL_EMPATE, FILL_PENDENTE, STROKE_DIVISA, fillMargem } from '@/app/lib/raceUi';
import { inkToken, useTokenColors } from '@/app/lib/tokens';
import { bboxes, parseViewBox } from '@/app/components/apuracao/geo';
import { EXTRA_DIREITA, OFFSHORE, layoutCaixas, posicionarCalloutDf } from '@/app/components/apuracao/BrazilMap';
import { useElementSize } from '@/app/components/apuracao/MapHooks';

/** Preenchimento de uma UF no cenário (tokens, nunca hex). */
export function fillUfCenario(r: ResultadoUfCenario | undefined): string {
  if (!r || r.votos[0] + r.votos[1] <= 0) return FILL_PENDENTE;
  const v = vencedorArea(r);
  if (v === null) return FILL_EMPATE;
  return fillMargem(v === 0 ? 'a' : 'b', bucketMargem(margemArea(r).pp));
}

export interface MapaCenarioProps {
  geo: GeoBrasil;
  resultado: ResultadoCenario;
  /** Largura fixa em px (cartão). Sem ela, o mapa mede o contêiner. */
  largura?: number;
  selecionada?: UFBr | null;
  destaque?: UFBr | null;
  onSelect?: (uf: UFBr) => void;
  onHover?: (uf: UFBr | null) => void;
  rotulos?: boolean;
  /** Tamanho da sigla em px de tela. Padrão: automático pela largura. */
  fontePx?: number;
  mudancas?: boolean;
  estatico?: boolean;
  ariaLabel: string;
  className?: string;
}

export function MapaCenario(props: MapaCenarioProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const w = props.largura ?? size.w;
  return (
    <div ref={props.largura ? undefined : ref} className={cn('relative w-full select-none', props.className)} style={props.largura ? { width: props.largura } : undefined}>
      {w > 0 ? <Svg {...props} larguraPx={w} /> : <div className="aspect-square w-full" />}
    </div>
  );
}

const Svg = memo(function Svg({
  geo,
  resultado,
  larguraPx,
  selecionada,
  destaque,
  onSelect,
  onHover,
  rotulos = true,
  fontePx,
  mudancas,
  estatico,
  ariaLabel,
}: MapaCenarioProps & { larguraPx: number }) {
  const tokens = useTokenColors();
  const vb = useMemo(() => parseViewBox(geo.viewBox), [geo]);
  const vbW = vb.w + EXTRA_DIREITA;
  const vbH = vb.h;
  const k = vbW / larguraPx;
  const kq = Math.round(k * 20) / 20;
  const bb = useMemo(() => bboxes(geo.ufs), [geo]);
  const caixas = useMemo(() => layoutCaixas(geo, bb, vbW, kq), [geo, bb, vbW, kq]);
  const fontPx = fontePx ?? (larguraPx < 420 ? 9.5 : larguraPx < 640 ? 10.5 : 12);
  const df = useMemo(() => posicionarCalloutDf(geo, bb, kq, fontPx, false), [geo, bb, kq, fontPx]);

  const porUf = useMemo(() => {
    const m = new Map<string, ResultadoUfCenario>();
    for (const u of resultado.ufs) m.set(u.uf, u);
    return m;
  }, [resultado]);
  const mudou = useMemo(() => new Set<string>(resultado.mudaram), [resultado]);
  const fill = (uf: UFBr) => fillUfCenario(porUf.get(uf));
  const tinta = (uf: UFBr) => `rgb(var(--${inkToken(fill(uf), tokens)}))`;
  const transicao = estatico ? undefined : 'fill 450ms cubic-bezier(.2,.8,.2,1)';

  const ufDoAlvo = (el: EventTarget | null): UFBr | null => {
    const n = (el as Element | null)?.closest?.('[data-uf]');
    return (n?.getAttribute('data-uf') as UFBr | null) ?? null;
  };
  const interativo = !estatico && (onSelect || onHover);
  const eventos = interativo
    ? {
        onClick: (e: MouseEvent) => {
          const uf = ufDoAlvo(e.target);
          if (uf) onSelect?.(uf);
        },
        onPointerMove: (e: PointerEvent) => {
          if (e.pointerType !== 'mouse') return;
          onHover?.(ufDoAlvo(e.target));
        },
        onPointerLeave: () => onHover?.(null),
      }
    : {};

  const fs = fontPx * kq;
  const contorno = destaque && destaque !== selecionada ? destaque : null;

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vbW} ${vbH}`}
      width={estatico ? larguraPx : undefined}
      height={estatico ? (larguraPx * vbH) / vbW : undefined}
      className={cn('block h-auto w-full overflow-visible [-webkit-tap-highlight-color:transparent]', interativo && 'cursor-pointer')}
      style={{ aspectRatio: `${vbW} / ${vbH}` }}
      role="img"
      aria-label={ariaLabel}
      {...eventos}
    >
      <g>
        {UFS.map((uf) => {
          const f = geo.ufs[uf];
          if (!f) return null;
          return (
            <path
              key={uf}
              d={f.d}
              data-uf={uf}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              style={{ fill: fill(uf), stroke: STROKE_DIVISA, strokeWidth: 1, transition: transicao }}
            />
          );
        })}
      </g>

      <g pointerEvents="none">
        {mudancas
          ? resultado.mudaram.map((uf) =>
              geo.ufs[uf] ? (
                <path
                  key={`m-${uf}`}
                  d={geo.ufs[uf].d}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeDasharray="3 2.5"
                  style={{ stroke: 'rgb(var(--fg))', strokeWidth: 1.6 }}
                />
              ) : null,
            )
          : null}
        {contorno && geo.ufs[contorno] ? (
          <path d={geo.ufs[contorno].d} fill="none" vectorEffect="non-scaling-stroke" style={{ stroke: 'rgb(var(--fg) / 0.85)', strokeWidth: 1.5 }} />
        ) : null}
        {selecionada && geo.ufs[selecionada] ? (
          <path d={geo.ufs[selecionada].d} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ stroke: 'rgb(var(--fg))', strokeWidth: 2.5 }} />
        ) : null}
      </g>

      {rotulos ? (
        <g pointerEvents="none" className="font-sans" style={{ fontWeight: 650, letterSpacing: '0.02em' }}>
          {UFS.map((uf) => {
            if (uf === 'DF' || OFFSHORE.includes(uf)) return null;
            const f = geo.ufs[uf];
            if (!f) return null;
            return (
              <text key={uf} x={f.cx} y={f.cy} textAnchor="middle" dominantBaseline="central" style={{ fontSize: fs, fill: tinta(uf) }}>
                {uf}
              </text>
            );
          })}
        </g>
      ) : null}

      {/* UFs pequenas do Nordeste: caixas fora da costa (também são alvo de toque) */}
      <g>
        {caixas.map((c) => {
          const ativo = selecionada === c.uf || destaque === c.uf;
          return (
            <g key={c.uf} data-uf={c.uf}>
              <line
                x1={c.ax}
                y1={c.ay}
                x2={c.x}
                y2={c.y + c.h / 2}
                vectorEffect="non-scaling-stroke"
                style={{ stroke: ativo ? 'rgb(var(--fg) / 0.8)' : 'rgb(var(--fg-subtle) / 0.7)', strokeWidth: 1 }}
              />
              <circle cx={c.ax} cy={c.ay} r={1.6 * kq} style={{ fill: 'rgb(var(--fg-subtle))' }} />
              <rect x={c.x - 8 * kq} y={c.y - 2.5 * kq} width={c.w + 14 * kq} height={c.h + 5 * kq} fill="transparent" />
              <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={4 * kq} style={{ fill: 'rgb(var(--surface))' }} />
              <rect
                x={c.x}
                y={c.y}
                width={c.w}
                height={c.h}
                rx={4 * kq}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={mudancas && mudou.has(c.uf) && !ativo ? '3 2.5' : undefined}
                style={{
                  fill: fill(c.uf),
                  stroke: ativo || (mudancas && mudou.has(c.uf)) ? 'rgb(var(--fg))' : STROKE_DIVISA,
                  strokeWidth: ativo ? 2 : mudancas && mudou.has(c.uf) ? 1.6 : 1,
                  transition: transicao,
                }}
              />
              {rotulos ? (
                <text
                  x={c.x + c.w / 2}
                  y={c.y + c.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-sans"
                  style={{ fontSize: fs * 0.95, fontWeight: 650, fill: tinta(c.uf), letterSpacing: '0.02em' }}
                >
                  {c.uf}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>

      {/* DF: callout com alvo de toque maior */}
      {geo.ufs.DF ? (
        <g data-uf="DF">
          <line x1={df.ax} y1={df.ay} x2={df.bx} y2={df.by} vectorEffect="non-scaling-stroke" style={{ stroke: 'rgb(var(--fg) / 0.7)', strokeWidth: 1 }} />
          <circle cx={df.ax} cy={df.ay} r={2 * kq} style={{ fill: 'rgb(var(--fg))' }} />
          <circle cx={df.bx} cy={df.by} r={df.r * 1.45} fill="transparent" />
          <circle cx={df.bx} cy={df.by} r={df.r} style={{ fill: 'rgb(var(--surface))' }} />
          <circle
            cx={df.bx}
            cy={df.by}
            r={df.r}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={mudancas && mudou.has('DF') && selecionada !== 'DF' ? '3 2.5' : undefined}
            style={{
              fill: fill('DF'),
              stroke: selecionada === 'DF' || destaque === 'DF' || (mudancas && mudou.has('DF')) ? 'rgb(var(--fg))' : 'rgb(var(--bg))',
              strokeWidth: selecionada === 'DF' ? 2 : 1.5,
              transition: transicao,
            }}
          />
          {rotulos ? (
            <text
              x={df.bx}
              y={df.by}
              textAnchor="middle"
              dominantBaseline="central"
              className="font-sans"
              style={{ fontSize: fs * 0.9, fontWeight: 650, fill: tinta('DF') }}
            >
              DF
            </text>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
});

const FAIXAS = ['< 5', '5–15', '15–30', '≥ 30'];

/** Legenda: as 4 faixas de margem para cada finalista (identidade sempre com o nome, nunca só pela cor). */
export function LegendaMapaCenario({ nomes, mudancas, className }: { nomes: { a: string; b: string }; mudancas?: boolean; className?: string }) {
  return (
    <div className={cn('text-[12px] text-fg-muted', className)}>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
        {(['a', 'b'] as const).map((s) => (
          <div key={s} className="contents">
            <span className="truncate font-medium text-fg">{s === 'a' ? nomes.a : nomes.b}</span>
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2, 3].map((bkt) => (
                <span key={bkt} className="h-3 flex-1 rounded-[4px] ring-1 ring-inset ring-line" style={{ background: fillMargem(s, bkt as 0 | 1 | 2 | 3) }} />
              ))}
            </span>
          </div>
        ))}
        <span />
        <span className="num flex gap-1 text-[10.5px] text-fg-subtle">
          {FAIXAS.map((f) => (
            <span key={f} className="flex-1 text-center">
              {f}
            </span>
          ))}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] text-fg-subtle">
        Vantagem em pontos percentuais dos votos válidos (faixas de <span className="num">{MARGEM_BUCKETS.join(', ')}</span> p.p.).
        {mudancas ? ' Contorno tracejado: estado em que fica à frente quem estava atrás no 1º turno.' : ''}
      </p>
    </div>
  );
}
