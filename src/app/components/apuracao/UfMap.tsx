/**
 * Mapa dos municípios de uma UF (SVG, geometria IBGE em public/geo/mun/{uf}.json).
 *
 * - Mesmos modos de coloração do mapa nacional; municípios sem seções → hachura.
 * - Zoom/pan suaves: Ctrl/⌘ + roda (ou pinça no trackpad), pinça e arrastar no celular, duplo clique,
 *   botões +/−/enquadrar e teclado (+, −, 0, setas). Ver MapZoom.ts.
 * - Tooltip com o placar do município (hover; no toque, 1º toque mostra e 2º toque seleciona).
 * - Capital com contorno e rótulo; município selecionado e resultados de busca (`destaque`) realçados.
 * - Encartes (ilhas fora de escala, ex.: Fernando de Noronha) com moldura tracejada e rótulo.
 * - Desempenho (MG = 853 paths): os paths são memoizados e só o `fill` muda entre atualizações;
 *   hover/seleção ficam numa camada separada; o gesto de zoom não re-renderiza nada.
 */
import { memo, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import type { MunicipioResumo, Race, Tally, UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { STROKE_DIVISA } from '@/app/lib/raceUi';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import { bboxes, parseViewBox, useGeo, type GeoUfExt } from './geo';
import { MAP_MODES, valorModo, type MapMode } from './mapModes';
import { MapHatchPattern } from './MapHatch';
import { MapTooltip } from './MapTooltip';
import { useClickOutside, useElementSize } from './MapHooks';
import { useMapZoom } from './MapZoom';

export interface UfMapProps {
  uf: UF;
  /** Resumo por município (ligado à geometria pelo código IBGE). */
  municipios: MunicipioResumo[];
  race: Pick<Race, 'candidatos'>;
  modo?: MapMode;
  /** Código TSE do município selecionado. */
  selecionado?: string | null;
  onSelect?: (cod: string, municipio: MunicipioResumo) => void;
  /** Códigos TSE realçados (ex.: resultado da busca). Os demais esmaecem. Um só → o mapa enquadra. */
  destaque?: readonly string[] | null;
  /** Votos do 1º turno por município, chave = código IBGE (modo 'variacao'). */
  primeiroTurno?: Record<string, Pick<Tally, 'votos'>>;
  /** Geometria já carregada (senão carrega public/geo/mun/{uf}.json). */
  geo?: GeoUfExt;
  /** Altura máxima em px (o mapa mantém a proporção). Padrão: 70% da altura da janela, até 680. */
  alturaMax?: number;
  /** Enquadra automaticamente o destaque único (padrão: sim). */
  zoomNoDestaque?: boolean;
  rotuloAcao?: (m: MunicipioResumo) => string;
  className?: string;
  ariaLabel?: string;
}

export function UfMap({
  uf,
  municipios,
  race,
  modo = 'vencedor',
  selecionado,
  onSelect,
  destaque,
  primeiroTurno,
  geo: geoProp,
  alturaMax,
  zoomNoDestaque = true,
  rotuloAcao,
  className,
  ariaLabel,
}: UfMapProps) {
  const { data: geoLoaded, error } = useGeo(uf);
  const geo = geoProp ?? geoLoaded;
  const uid = useId().replace(/:/g, '');
  const [sizeRef, size, boxEl] = useElementSize<HTMLDivElement>();
  const vb = useMemo(() => parseViewBox(geo?.viewBox ?? '0 0 1000 1000'), [geo]);
  const ar = vb.h / vb.w;
  const W = size.w;
  const hMax = alturaMax ?? (typeof window !== 'undefined' ? Math.min(680, Math.max(320, window.innerHeight * 0.7)) : 600);
  const H = W > 0 ? Math.min(W * ar, hMax) : 0;
  const s0 = W > 0 ? Math.min(W / vb.w, H / vb.h) : 1;
  const ox = (W - vb.w * s0) / 2;
  const oy = (H - vb.h * s0) / 2;

  const zoom = useMapZoom({ w: W, h: H, maxK: 14 });
  const { view } = zoom;
  /** unidades do viewBox por px de tela no zoom consolidado */
  const upx = 1 / (s0 * view.k);

  const [tip, setTip] = useState<{ ibge: string; x: number; y: number; fixo: boolean } | null>(null);
  const ultimo = useRef({ tipo: 'mouse', t: 0 });
  useClickOutside(boxEl, !!tip?.fixo, () => setTip(null));

  // Índices
  const porIbge = useMemo(() => new Map(municipios.map((m) => [m.ibge, m])), [municipios]);
  const ibgeDoCod = useMemo(() => new Map(municipios.map((m) => [m.cod, m.ibge])), [municipios]);
  const capital = useMemo(() => municipios.find((m) => m.capital), [municipios]);
  const bb = useMemo(() => (geo ? bboxes(geo.municipios) : null), [geo]);

  const hatchId = `hatch-${uid}`;
  const fills = useMemo(() => {
    const out: Record<string, string> = {};
    if (!geo) return out;
    for (const ibge of Object.keys(geo.municipios)) {
      const v = valorModo(modo, porIbge.get(ibge), { race, primeiroTurno: primeiroTurno?.[ibge] });
      out[ibge] = v.pendente ? `url(#${hatchId})` : v.fill;
    }
    return out;
  }, [geo, porIbge, modo, race, primeiroTurno, hatchId]);

  const destaqueIbge = useMemo(() => {
    if (!destaque || !destaque.length) return null;
    const s = new Set<string>();
    for (const c of destaque) {
      const i = ibgeDoCod.get(c);
      if (i) s.add(i);
    }
    return s;
  }, [destaque, ibgeDoCod]);

  // Enquadra o destaque único.
  const chaveDestaque = destaqueIbge && destaqueIbge.size === 1 ? [...destaqueIbge][0] : null;
  useEffect(() => {
    if (!zoomNoDestaque || !bb || W <= 0) return;
    if (!chaveDestaque) return;
    const b = bb.get(chaveDestaque);
    if (b) zoom.enquadrar({ x: ox + b.x * s0, y: oy + b.y * s0, w: b.w * s0, h: b.h * s0 }, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDestaque, bb, W]);

  // ------------------------------------------------------------------ eventos
  const ibgeDoAlvo = (el: EventTarget | null) =>
    ((el as Element | null)?.closest?.('[data-ibge]')?.getAttribute('data-ibge') as string | null) ?? null;
  const posRel = (e: { clientX: number; clientY: number }) => {
    const r = boxEl!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    ultimo.current = { tipo: e.pointerType, t: performance.now() };
    zoom.handlers.onPointerDown(e);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    zoom.handlers.onPointerMove(e);
    if (e.pointerType === 'touch' || e.buttons) {
      if (e.buttons && tip && !tip.fixo) setTip(null);
      return;
    }
    const ibge = ibgeDoAlvo(e.target);
    if (ibge) setTip({ ibge, ...posRel(e), fixo: false });
    else if (tip && !tip.fixo) setTip(null);
  }
  function onClick(e: MouseEvent<HTMLDivElement>) {
    if (zoom.arrastou()) return;
    const ibge = ibgeDoAlvo(e.target);
    const m = ibge ? porIbge.get(ibge) : undefined;
    const toque = ultimo.current.tipo === 'touch' && performance.now() - ultimo.current.t < 1500;
    if (!ibge) {
      if (toque) setTip(null);
      return;
    }
    if (toque) {
      if (tip?.fixo && tip.ibge === ibge && m) onSelect?.(m.cod, m);
      else setTip({ ibge, ...posRel(e), fixo: true });
      return;
    }
    if (m) onSelect?.(m.cod, m);
  }
  function onKeyDown(e: KeyboardEvent) {
    const passo = 60;
    if (e.key === '+' || e.key === '=') zoom.zoomPor(1.6);
    else if (e.key === '-' || e.key === '_') zoom.zoomPor(1 / 1.6);
    else if (e.key === '0') zoom.resetar();
    else if (e.key === 'Escape') setTip(null);
    else if (e.key.startsWith('Arrow') && view.k > 1) {
      const dx = e.key === 'ArrowLeft' ? passo : e.key === 'ArrowRight' ? -passo : 0;
      const dy = e.key === 'ArrowUp' ? passo : e.key === 'ArrowDown' ? -passo : 0;
      zoom.moverPor(dx, dy);
    } else return;
    e.preventDefault();
  }

  // ------------------------------------------------------------------ render
  const modoInfo = MAP_MODES.find((m) => m.id === modo);
  const tipMun = tip ? porIbge.get(tip.ibge) : undefined;
  const gTransform = `translate(${(view.x + (view.k - 1) * ox) / s0} ${(view.y + (view.k - 1) * oy) / s0}) scale(${view.k})`;
  const fs = (px: number) => px * upx;
  const selIbge = selecionado ? ibgeDoCod.get(selecionado) ?? null : null;
  const hoverIbge = tip?.ibge ?? null;

  if (error && !geo) {
    return (
      <div className={cn('flex h-64 items-center justify-center rounded-2xl bg-surface-2 text-sm text-fg-muted', className)}>
        Não foi possível carregar o mapa de {UF_NOMES[uf]}.
      </div>
    );
  }

  return (
    <div className={cn('relative w-full', className)}>
      <div
        ref={(el) => {
          sizeRef(el);
          zoom.containerRef.current = el;
        }}
        className="relative w-full select-none overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand [-webkit-tap-highlight-color:transparent]"
        style={{ height: H || Math.min(hMax, 360), touchAction: view.k > 1.001 ? 'none' : 'pan-y' }}
        tabIndex={0}
        role="group"
        aria-label={ariaLabel ?? `Mapa dos municípios de ${UF_NOMES[uf]} — ${modoInfo?.label ?? modo}. Use + e − para ampliar.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={zoom.handlers.onPointerUp}
        onPointerCancel={zoom.handlers.onPointerCancel}
        onPointerLeave={() => tip && !tip.fixo && setTip(null)}
        onDoubleClick={zoom.handlers.onDoubleClick}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {!geo || W <= 0 ? (
          <div className="absolute inset-0 animate-pulse rounded-xl bg-surface-2" aria-busy="true" />
        ) : (
          <div ref={zoom.stageRef} className="absolute inset-0 origin-top-left">
            <svg width={W} height={H} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="block overflow-visible">
              <defs>
                <MapHatchPattern id={hatchId} escala={upx} />
              </defs>
              <g transform={gTransform}>
                <MunPaths geo={geo} fills={fills} realce={destaqueIbge} />

                <path
                  d={geo.contorno}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  pointerEvents="none"
                  style={{ stroke: 'rgb(var(--fg) / 0.35)', strokeWidth: 1 }}
                />

                {/* Encartes (ilhas fora de escala) */}
                {geo.encartes?.map((enc) => (
                  <g key={enc.cod} pointerEvents="none">
                    <rect
                      x={enc.x}
                      y={enc.y}
                      width={enc.w}
                      height={enc.h}
                      rx={6 * upx}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      style={{ stroke: 'rgb(var(--fg-subtle) / 0.8)', strokeWidth: 1, strokeDasharray: '4 3' }}
                    />
                    <text
                      x={enc.x + enc.w / 2}
                      y={enc.y - 6 * upx}
                      textAnchor="middle"
                      className="font-sans"
                      style={{
                        fontSize: fs(10.5),
                        fill: 'rgb(var(--fg-muted))',
                        paintOrder: 'stroke',
                        stroke: 'rgb(var(--surface) / 0.9)',
                        strokeWidth: 3 * upx,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {enc.nome} (fora de escala)
                    </text>
                  </g>
                ))}

                {/* Realces: busca, capital, hover, seleção */}
                <g pointerEvents="none">
                  {destaqueIbge
                    ? [...destaqueIbge].map((i) =>
                        geo.municipios[i] ? (
                          <path
                            key={i}
                            d={geo.municipios[i].d}
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                            style={{ stroke: 'rgb(var(--brand))', strokeWidth: 2 }}
                          />
                        ) : null,
                      )
                    : null}
                  {capital && geo.municipios[capital.ibge] ? (
                    <path
                      d={geo.municipios[capital.ibge].d}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                      style={{ stroke: 'rgb(var(--fg) / 0.9)', strokeWidth: 1.5 }}
                    />
                  ) : null}
                  {hoverIbge && hoverIbge !== selIbge && geo.municipios[hoverIbge] ? (
                    <path
                      d={geo.municipios[hoverIbge].d}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                      style={{ stroke: 'rgb(var(--fg))', strokeWidth: 1.75 }}
                    />
                  ) : null}
                  {selIbge && geo.municipios[selIbge] ? (
                    <>
                      <path
                        d={geo.municipios[selIbge].d}
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        style={{ stroke: 'rgb(var(--bg))', strokeWidth: 4.5 }}
                      />
                      <path
                        d={geo.municipios[selIbge].d}
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        style={{ stroke: 'rgb(var(--fg))', strokeWidth: 2.25 }}
                      />
                    </>
                  ) : null}
                </g>

                {/* Rótulos: capital e selecionado */}
                <g pointerEvents="none" className="font-sans">
                  {[capital, selIbge && selIbge !== capital?.ibge ? porIbge.get(selIbge) : undefined].map((m) => {
                    if (!m) return null;
                    const f = geo.municipios[m.ibge];
                    if (!f) return null;
                    return (
                      <g key={m.ibge}>
                        <circle cx={f.cx} cy={f.cy} r={3 * upx} style={{ fill: 'rgb(var(--fg))', stroke: 'rgb(var(--bg))', strokeWidth: 1.5 * upx }} />
                        <text
                          x={f.cx}
                          y={f.cy - 7 * upx}
                          textAnchor="middle"
                          style={{
                            fontSize: fs(11.5),
                            fontWeight: 600,
                            fill: 'rgb(var(--fg))',
                            paintOrder: 'stroke',
                            stroke: 'rgb(var(--bg) / 0.85)',
                            strokeWidth: 3.5 * upx,
                            strokeLinejoin: 'round',
                          }}
                        >
                          {m.nome}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>
          </div>
        )}

        {zoom.dica ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg/40 transition-opacity">
            <span className="glass rounded-full border border-line px-3 py-1.5 text-[12.5px] text-fg">{zoom.dica}</span>
          </div>
        ) : null}
      </div>

      {/* Controles de zoom */}
      {geo && W > 0 ? (
        <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1.5">
          <ZoomBtn label="Ampliar" onClick={() => zoom.zoomPor(1.8)} disabled={view.k >= 13.9}>
            <path d="M12 6v12M6 12h12" />
          </ZoomBtn>
          <ZoomBtn label="Reduzir" onClick={() => zoom.zoomPor(1 / 1.8)} disabled={view.k <= 1.001}>
            <path d="M6 12h12" />
          </ZoomBtn>
          {view.k > 1.001 ? (
            <button
              type="button"
              aria-label="Ver o estado inteiro"
              onClick={zoom.resetar}
              className="glass flex h-9 w-9 items-center justify-center rounded-xl border border-line text-fg shadow-card transition-colors hover:bg-surface-3"
            >
              <Icon name="reset" size={17} />
            </button>
          ) : null}
        </div>
      ) : null}

      {tip && geo ? (
        <MapTooltip
          titulo={tipMun?.nome ?? 'Município'}
          subtitulo={`${tipMun?.capital ? 'Capital · ' : ''}${UF_NOMES[uf]}`}
          dados={tipMun}
          race={race}
          x={tip.x}
          y={tip.y}
          limites={{ w: W, h: H }}
          fixo={tip.fixo}
          acao={
            onSelect && tipMun
              ? { label: rotuloAcao?.(tipMun) ?? `Ver ${tipMun.nome}`, onClick: () => onSelect(tipMun.cod, tipMun) }
              : undefined
          }
          extra={
            tipMun && (modo === 'variacao' || modo === 'comparecimento')
              ? (() => {
                  const v = valorModo(modo, tipMun, { race, primeiroTurno: primeiroTurno?.[tipMun.ibge] });
                  return v.rotulo ? `${modo === 'variacao' ? `Variação de ${race.candidatos[0]?.nomeUrna} vs 1º turno` : 'Comparecimento'}: ${v.rotulo}` : undefined;
                })()
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function ZoomBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="glass flex h-9 w-9 items-center justify-center rounded-xl border border-line text-fg shadow-card transition-colors hover:bg-surface-3 disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

/** Camada dos municípios: memoizada; cada path só re-renderiza quando o próprio fill muda. */
const MunPaths = memo(function MunPaths({
  geo,
  fills,
  realce,
}: {
  geo: GeoUfExt;
  fills: Record<string, string>;
  realce: Set<string> | null;
}) {
  const entradas = useMemo(() => Object.entries(geo.municipios), [geo]);
  // Transição de cor só em UFs menores (em MG/SP, ~850 transições simultâneas custam frames no celular).
  const transicao = entradas.length <= 450;
  return (
    <g>
      {entradas.map(([ibge, f]) => (
        <MunPath key={ibge} ibge={ibge} d={f.d} fill={fills[ibge]} dim={!!realce && !realce.has(ibge)} transicao={transicao} />
      ))}
    </g>
  );
});

const MunPath = memo(function MunPath({
  ibge,
  d,
  fill,
  dim,
  transicao,
}: {
  ibge: string;
  d: string;
  fill: string;
  dim: boolean;
  transicao: boolean;
}) {
  return (
    <path
      d={d}
      data-ibge={ibge}
      vectorEffect="non-scaling-stroke"
      strokeLinejoin="round"
      className="cursor-pointer"
      style={{
        fill,
        stroke: STROKE_DIVISA,
        strokeWidth: 0.6,
        opacity: dim ? 0.28 : 1,
        transition: transicao ? 'fill 500ms ease, opacity 250ms' : 'opacity 250ms',
      }}
    />
  );
});
