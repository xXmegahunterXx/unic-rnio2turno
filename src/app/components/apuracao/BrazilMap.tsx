/**
 * Mapa do Brasil por UF (SVG, 27 UFs, geometria IBGE projetada em public/geo/br.json).
 *
 * - Coloração por modo (mapModes): vencedor/margem/% apurado/comparecimento/variação vs 1º turno.
 * - Transição suave de cor a cada atualização; "pulso" na UF que acabou de trocar de líder.
 * - Hover (mouse) com tooltip que segue o ponteiro; no toque, o 1º toque fixa o tooltip (com botão
 *   "Ver …") e o 2º toque na mesma UF seleciona.
 * - Teclado: Tab percorre as UFs (ordem alfabética do nome), Enter/Espaço seleciona, Esc fecha.
 * - Rótulos de sigla nos polos de inacessibilidade (cx, cy) com tinta automática (fg/bg pelo contraste).
 *   As UFs pequenas do litoral nordestino (RN, PB, PE, AL, SE) ganham caixas fora da costa, que também
 *   são alvos de toque; o DF tem um callout (alvo ≥ 36 px).
 * - Tabela equivalente para leitores de tela.
 */
import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Race, Summary, Tally, UF, UFBr } from '@/shared/types';
import { UFS } from '@/shared/types';
import { REGIAO_NOMES, UF_NOMES, UF_REGIAO } from '@/shared/constants';
import type { GeoBrasil } from '@/shared/dataset';
import { margem, pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { STROKE_DIVISA, rgbSlot, slotDe } from '@/app/lib/raceUi';
import { bboxes, parseViewBox, pontoMaisLeste, useGeo, type BBox } from './geo';
import { MAP_MODES, valorModo, rotuloApurado, type MapMode, type ModeValue } from './mapModes';
import { inkToken, useTokenColors } from './mapColors';
import { MapHatchPattern } from './MapHatch';
import { MapTooltip } from './MapTooltip';
import { MapDataTable } from './MapDataTable';
import { useClickOutside, useElementSize } from './MapHooks';

export interface BrazilMapProps {
  /** Resumo por UF (UFs ausentes ou sem seções totalizadas ficam como pendentes). */
  ufs: Partial<Record<UF, Summary>>;
  race: Pick<Race, 'candidatos'>;
  modo?: MapMode;
  /** UF selecionada (contorno forte). */
  selecionada?: UF | null;
  onSelect?: (uf: UFBr) => void;
  /** Votos do 1º turno por UF (modo 'variacao'). */
  primeiroTurno?: Partial<Record<UF, Pick<Tally, 'votos'>>>;
  /** Geometria já carregada (senão carrega public/geo/br.json). */
  geo?: GeoBrasil;
  /** Rótulos de sigla (padrão: sim). */
  rotulos?: boolean;
  /** Valor do modo sob a sigla nas UFs grandes. Padrão: automático (mapa ≥ 520 px). */
  valores?: boolean;
  /** Esmaece as demais UFs quando há uma selecionada. */
  realcarSelecionada?: boolean;
  /** Texto do botão do tooltip no toque. Padrão: "Ver {nome}". */
  rotuloAcao?: (uf: UFBr) => string;
  className?: string;
  ariaLabel?: string;
}

/** Espaço extra à direita do viewBox para as caixas das UFs pequenas do Nordeste. */
const EXTRA_DIREITA = 120;
const OFFSHORE: readonly UFBr[] = ['RN', 'PB', 'PE', 'AL', 'SE'];
const ORDEM_TAB: UFBr[] = [...UFS].sort((a, b) => UF_NOMES[a].localeCompare(UF_NOMES[b], 'pt-BR'));

interface Tip {
  uf: UFBr;
  x: number;
  y: number;
  fixo: boolean;
}

interface Caixa {
  uf: UFBr;
  ax: number;
  ay: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Distribui as caixas fora da costa: perto da altura da UF, sem sobreposição. */
function layoutCaixas(geo: GeoBrasil, bb: Map<string, BBox>, vbW: number, k: number): Caixa[] {
  const w = 27 * k;
  const h = 17 * k;
  const gap = 5 * k;
  const x = vbW - 6 * k - w;
  const itens = OFFSHORE.filter((uf) => geo.ufs[uf]).map((uf) => {
    const f = geo.ufs[uf];
    const b = bb.get(uf)!;
    const a = pontoMaisLeste(f.d, f.cy - b.h * 0.3, f.cy + b.h * 0.3) ?? [b.x + b.w, f.cy];
    return { uf, ax: a[0], ay: a[1], alvo: a[1] - h / 2 };
  });
  itens.sort((p, q) => p.alvo - q.alvo);
  const ys = itens.map((i) => i.alvo);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + h + gap);
  // Recentraliza o bloco em torno da média dos alvos.
  const desloc = itens.reduce((s, it, i) => s + (it.alvo - ys[i]), 0) / Math.max(1, itens.length);
  return itens.map((it, i) => ({ uf: it.uf, ax: it.ax, ay: it.ay, x, y: ys[i] + desloc, w, h }));
}

/** A UF comporta sigla + valor (duas linhas)? */
const cabeValor = (b: BBox, k: number) => b.w / k >= 60 && b.h / k >= 58;

/**
 * Posição do callout do DF: entre candidatos ao redor do DF (raios de 30–42 px), escolhe o que fica
 * mais longe dos rótulos das outras UFs — assim a bolha nunca cobre uma sigla, em qualquer largura.
 */
function posicionarCalloutDf(geo: GeoBrasil, bb: Map<string, BBox>, k: number, fontPx: number, valores: boolean) {
  const f = geo.ufs.DF;
  const r = 12.5 * k;
  if (!f) return { ax: 0, ay: 0, bx: 0, by: 0, r };
  const rotulos: { x: number; y: number; hw: number; hh: number }[] = [];
  for (const uf of UFS) {
    if (uf === 'DF' || OFFSHORE.includes(uf) || !geo.ufs[uf]) continue;
    const g = geo.ufs[uf];
    const duas = valores && cabeValor(bb.get(uf)!, k);
    rotulos.push({
      x: g.cx,
      y: g.cy,
      hw: (duas ? 2.1 : 1.05) * fontPx * k * 0.75 + 3 * k,
      hh: (duas ? 1.25 : 0.62) * fontPx * k + 2 * k,
    });
  }
  let melhor = { bx: f.cx + 30 * k, by: f.cy - 24 * k, score: -Infinity };
  for (const raio of [30, 36, 42]) {
    for (let a = 0; a < 360; a += 15) {
      const rad = (a * Math.PI) / 180;
      const bx = f.cx + Math.cos(rad) * raio * k;
      const by = f.cy - Math.sin(rad) * raio * k;
      let folga = Infinity;
      for (const l of rotulos) {
        const dx = Math.max(0, Math.abs(bx - l.x) - l.hw);
        const dy = Math.max(0, Math.abs(by - l.y) - l.hh);
        folga = Math.min(folga, Math.hypot(dx, dy) - r);
      }
      // Leve preferência por cima/à direita e por raios curtos (leitura natural do callout).
      const score = folga / k - raio * 0.08 + Math.sin(rad) * 1.5 + Math.cos(rad) * 0.5;
      if (score > melhor.score) melhor = { bx, by, score };
    }
  }
  return { ax: f.cx, ay: f.cy, bx: melhor.bx, by: melhor.by, r };
}

export function BrazilMap({
  ufs,
  race,
  modo = 'vencedor',
  selecionada,
  onSelect,
  primeiroTurno,
  geo: geoProp,
  rotulos = true,
  valores,
  realcarSelecionada,
  rotuloAcao,
  className,
  ariaLabel,
}: BrazilMapProps) {
  const { data: geoLoaded, error } = useGeo();
  const geo = geoProp ?? geoLoaded;
  const uid = useId().replace(/:/g, '');
  const tokens = useTokenColors();
  const reduzir = useReducedMotion();
  const [boxRef, size, boxEl] = useElementSize<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [focada, setFocada] = useState<UFBr | null>(null);
  const ultimoPonteiro = useRef<{ tipo: string; t: number }>({ tipo: 'mouse', t: 0 });

  const vb = useMemo(() => parseViewBox(geo?.viewBox ?? '0 0 996 1000'), [geo]);
  const vbW = vb.w + EXTRA_DIREITA;
  const vbH = vb.h;
  /** unidades do viewBox por px de tela */
  const k = size.w > 0 ? vbW / size.w : 2.5;
  const kq = Math.round(k * 20) / 20; // quantizado: evita recalcular layout a cada px

  const bb = useMemo(() => (geo ? bboxes(geo.ufs) : new Map<string, BBox>()), [geo]);
  const caixas = useMemo(() => (geo ? layoutCaixas(geo, bb, vbW, kq) : []), [geo, bb, vbW, kq]);

  // Valores por UF no modo atual.
  const vals = useMemo(() => {
    const out = {} as Record<UFBr, ModeValue>;
    for (const uf of UFS) out[uf] = valorModo(modo, ufs[uf], { race, primeiroTurno: primeiroTurno?.[uf] });
    return out;
  }, [modo, ufs, race, primeiroTurno]);

  // Pulso quando a UF troca de líder entre atualizações.
  const lideres = useMemo(() => {
    const out: Partial<Record<UFBr, number | null>> = {};
    for (const uf of UFS) {
      const t = ufs[uf];
      out[uf] = t && t.secoesTotalizadas > 0 ? margem(t).lider : null;
    }
    return out;
  }, [ufs]);
  const lideresAnt = useRef(lideres);
  const [pulsos, setPulsos] = useState<{ uf: UFBr; lider: number; key: number }[]>([]);
  useEffect(() => {
    const ant = lideresAnt.current;
    lideresAnt.current = lideres;
    if (ant === lideres || reduzir) return;
    const novos: { uf: UFBr; lider: number; key: number }[] = [];
    for (const uf of UFS) {
      const a = ant[uf];
      const b = lideres[uf];
      if (a !== null && a !== undefined && b !== null && b !== undefined && a !== b)
        novos.push({ uf, lider: b, key: performance.now() + Math.random() });
    }
    if (!novos.length) return;
    setPulsos((p) => [...p.filter((x) => !novos.some((n) => n.uf === x.uf)), ...novos]);
    const id = window.setTimeout(() => setPulsos((p) => p.filter((x) => !novos.includes(x))), 3200);
    return () => window.clearTimeout(id);
  }, [lideres, reduzir]);

  useClickOutside(boxEl, !!tip?.fixo, () => setTip(null));

  // ---------------------------------------------------------------- eventos
  const ufDoAlvo = (el: EventTarget | null): UFBr | null => {
    const n = (el as Element | null)?.closest?.('[data-uf]') as HTMLElement | SVGElement | null;
    return (n?.getAttribute('data-uf') as UFBr | null) ?? null;
  };
  const posRel = (e: PointerEvent) => {
    const r = boxEl!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const centroPx = (uf: UFBr) => {
    if (!geo) return { x: 0, y: 0 };
    if (uf === 'DF') return { x: dfCallout.bx / k, y: dfCallout.by / k };
    const cx = caixas.find((c) => c.uf === uf);
    if (cx && size.w < 520) return { x: (cx.x + cx.w / 2) / k, y: cx.y / k };
    return { x: geo.ufs[uf].cx / k, y: geo.ufs[uf].cy / k };
  };

  function onPointerDown(e: PointerEvent) {
    ultimoPonteiro.current = { tipo: e.pointerType, t: performance.now() };
  }
  function onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    const uf = ufDoAlvo(e.target);
    if (uf) setTip({ uf, ...posRel(e), fixo: false });
    else if (tip && !tip.fixo) setTip(null);
  }
  function onPointerLeave() {
    if (tip && !tip.fixo) setTip(null);
  }
  function onClick(e: MouseEvent) {
    const uf = ufDoAlvo(e.target);
    const toque = ultimoPonteiro.current.tipo === 'touch' && performance.now() - ultimoPonteiro.current.t < 1500;
    if (!uf) {
      if (toque) setTip(null);
      return;
    }
    if (toque) {
      if (tip?.fixo && tip.uf === uf) onSelect?.(uf);
      else setTip({ uf, ...centroPx(uf), fixo: true });
      return;
    }
    onSelect?.(uf);
  }
  function onFocus(uf: UFBr) {
    // Foco vindo de clique/toque não mostra anel nem tooltip de teclado.
    if (performance.now() - ultimoPonteiro.current.t < 400) return;
    setFocada(uf);
    setTip({ uf, ...centroPx(uf), fixo: false });
  }
  function onBlur(uf: UFBr) {
    setFocada((f) => (f === uf ? null : f));
    setTip((t) => (t && t.uf === uf && !t.fixo ? null : t));
  }
  function onKeyDown(e: KeyboardEvent, uf: UFBr) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(uf);
    } else if (e.key === 'Escape') setTip(null);
  }

  // Handlers estáveis para não invalidar o memo dos paths.
  const h = useRef({ onFocus, onBlur, onKeyDown });
  h.current = { onFocus, onBlur, onKeyDown };
  const estaveis = useMemo(
    () => ({
      onFocus: (uf: UFBr) => h.current.onFocus(uf),
      onBlur: (uf: UFBr) => h.current.onBlur(uf),
      onKeyDown: (e: KeyboardEvent, uf: UFBr) => h.current.onKeyDown(e, uf),
    }),
    [],
  );

  // ---------------------------------------------------------------- layout de rótulos
  const fontPx = size.w < 420 ? 9.5 : size.w < 640 ? 10.5 : 12;
  const mostrarValores = valores ?? size.w >= 520;
  const dfCallout = useMemo(
    () => (geo ? posicionarCalloutDf(geo, bb, kq, fontPx, mostrarValores) : { ax: 0, ay: 0, bx: 0, by: 0, r: 0 }),
    [geo, bb, kq, fontPx, mostrarValores],
  );

  const descr = (uf: UFBr) => {
    const t = ufs[uf];
    if (!t || t.secoesTotalizadas <= 0) return `${UF_NOMES[uf]}: nenhuma seção totalizada`;
    const partes = race.candidatos.map((c, i) => `${c.nomeUrna} ${fmtPct(pctValidos(t, i))}`).join(', ');
    return `${UF_NOMES[uf]}: ${rotuloApurado(pctTotalizadas(t))} apurado; ${partes}`;
  };

  const hatchId = `hatch-${uid}`;
  const fillDe = (uf: UFBr) => (vals[uf].pendente ? `url(#${hatchId})` : vals[uf].fill);
  const modoInfo = MAP_MODES.find((m) => m.id === modo);
  const destaque = tip?.uf ?? null;

  if (error && !geo) {
    return (
      <div
        className={cn(
          'flex aspect-square items-center justify-center rounded-2xl bg-surface-2 text-sm text-fg-muted',
          className,
        )}
      >
        Não foi possível carregar o mapa.
      </div>
    );
  }

  return (
    <div ref={boxRef} className={cn('relative w-full select-none', className)}>
      {!geo ? (
        <div
          className="w-full animate-pulse rounded-2xl bg-surface-2"
          style={{ aspectRatio: `${vbW} / ${vbH}` }}
          aria-busy="true"
        />
      ) : (
        <svg
          viewBox={`${vb.x} ${vb.y} ${vbW} ${vbH}`}
          className="block h-auto w-full overflow-visible [-webkit-tap-highlight-color:transparent]"
          style={{ aspectRatio: `${vbW} / ${vbH}` }}
          role="group"
          aria-label={ariaLabel ?? `Mapa do Brasil por estado — ${modoInfo?.label ?? modo}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <defs>
            <MapHatchPattern id={hatchId} escala={kq} />
          </defs>

          {/* UFs */}
          <g>
            {ORDEM_TAB.map((uf) => {
              const f = geo.ufs[uf];
              if (!f) return null;
              const esmaecida = realcarSelecionada && selecionada && selecionada !== uf;
              return (
                <UfPath
                  key={uf}
                  uf={uf}
                  d={f.d}
                  fill={fillDe(uf)}
                  esmaecida={!!esmaecida}
                  label={descr(uf)}
                  {...estaveis}
                />
              );
            })}
          </g>

          {/* Contornos: hover, foco e seleção */}
          <g pointerEvents="none">
            {destaque && destaque !== selecionada ? (
              <path
                d={geo.ufs[destaque]?.d}
                fill="none"
                vectorEffect="non-scaling-stroke"
                style={{ stroke: 'rgb(var(--fg) / 0.85)', strokeWidth: 1.5 }}
              />
            ) : null}
            {selecionada && selecionada !== 'ZZ' && geo.ufs[selecionada] ? (
              <path
                d={geo.ufs[selecionada].d}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                style={{ stroke: 'rgb(var(--fg))', strokeWidth: 2.25 }}
              />
            ) : null}
            {focada && geo.ufs[focada] ? (
              <path
                d={geo.ufs[focada].d}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                style={{ stroke: 'rgb(var(--brand))', strokeWidth: 2.75 }}
              />
            ) : null}
            {pulsos.map((p) =>
              geo.ufs[p.uf] ? (
                <motion.path
                  key={p.key}
                  d={geo.ufs[p.uf].d}
                  fill="none"
                  strokeLinejoin="round"
                  initial={{ opacity: 0.95, strokeWidth: 0 }}
                  animate={{ opacity: 0, strokeWidth: 16 * kq }}
                  transition={{ duration: 1.5, ease: 'easeOut', repeat: 1, repeatDelay: 0.1 }}
                  style={{ stroke: rgbSlot(slotDe(race, p.lider)) }}
                />
              ) : null,
            )}
          </g>

          {/* Rótulos */}
          {rotulos ? (
            <g pointerEvents="none" className="font-sans" style={{ fontWeight: 650, letterSpacing: '0.02em' }}>
              {UFS.map((uf) => {
                if (uf === 'DF' || OFFSHORE.includes(uf)) return null;
                const f = geo.ufs[uf];
                if (!f) return null;
                const b = bb.get(uf)!;
                const ink = inkToken(vals[uf].pendente ? 'rgb(var(--pending))' : vals[uf].fill, tokens);
                const grande = mostrarValores && cabeValor(b, k) && vals[uf].rotulo;
                const fs = fontPx * kq;
                return (
                  <text
                    key={uf}
                    x={f.cx}
                    y={f.cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: fs, fill: `rgb(var(--${ink}))`, transition: 'fill 400ms' }}
                  >
                    {grande ? (
                      <>
                        <tspan x={f.cx} dy={-fs * 0.55}>
                          {uf}
                        </tspan>
                        <tspan
                          x={f.cx}
                          dy={fs * 1.15}
                          className="num"
                          style={{ fontWeight: 500, fontSize: fs * 0.88, opacity: 0.85 }}
                        >
                          {vals[uf].rotulo}
                        </tspan>
                      </>
                    ) : (
                      uf
                    )}
                  </text>
                );
              })}
            </g>
          ) : null}

          {/* Caixas fora da costa (RN, PB, PE, AL, SE) */}
          <g>
            {caixas.map((c) => {
              const ink = inkToken(vals[c.uf].pendente ? 'rgb(var(--pending))' : vals[c.uf].fill, tokens);
              const ativo = destaque === c.uf || selecionada === c.uf;
              return (
                <g key={c.uf} data-uf={c.uf} className="cursor-pointer" aria-hidden>
                  <line
                    x1={c.ax}
                    y1={c.ay}
                    x2={c.x}
                    y2={c.y + c.h / 2}
                    vectorEffect="non-scaling-stroke"
                    style={{ stroke: ativo ? 'rgb(var(--fg) / 0.8)' : 'rgb(var(--fg-subtle) / 0.7)', strokeWidth: 1 }}
                  />
                  <circle cx={c.ax} cy={c.ay} r={1.6 * kq} style={{ fill: 'rgb(var(--fg-subtle))' }} />
                  {/* alvo de toque maior que a caixa */}
                  <rect
                    x={c.x - 8 * kq}
                    y={c.y - 2.5 * kq}
                    width={c.w + 14 * kq}
                    height={c.h + 5 * kq}
                    fill="transparent"
                  />
                  <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={4 * kq} style={{ fill: 'rgb(var(--surface))' }} />
                  <rect
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    rx={4 * kq}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      fill: fillDe(c.uf),
                      stroke: ativo ? 'rgb(var(--fg))' : STROKE_DIVISA,
                      strokeWidth: ativo ? 2 : 1,
                      transition: 'fill 600ms cubic-bezier(.2,.8,.2,1)',
                    }}
                  />
                  {rotulos ? (
                    <text
                      x={c.x + c.w / 2}
                      y={c.y + c.h / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="font-sans"
                      style={{
                        fontSize: fontPx * 0.95 * kq,
                        fontWeight: 650,
                        fill: `rgb(var(--${ink}))`,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {c.uf}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* Callout do DF */}
          {geo.ufs.DF ? (
            <g data-uf="DF" className="cursor-pointer" aria-hidden>
              <line
                x1={dfCallout.ax}
                y1={dfCallout.ay}
                x2={dfCallout.bx}
                y2={dfCallout.by}
                vectorEffect="non-scaling-stroke"
                style={{ stroke: 'rgb(var(--fg) / 0.7)', strokeWidth: 1 }}
              />
              <circle cx={dfCallout.ax} cy={dfCallout.ay} r={2 * kq} style={{ fill: 'rgb(var(--fg))' }} />
              <circle cx={dfCallout.bx} cy={dfCallout.by} r={dfCallout.r * 1.45} fill="transparent" />
              {/* fundo opaco: o preenchimento do modo é translúcido e o callout fica sobre outras UFs */}
              <circle cx={dfCallout.bx} cy={dfCallout.by} r={dfCallout.r} style={{ fill: 'rgb(var(--surface))' }} />
              <circle
                cx={dfCallout.bx}
                cy={dfCallout.by}
                r={dfCallout.r}
                vectorEffect="non-scaling-stroke"
                style={{
                  fill: fillDe('DF'),
                  stroke: destaque === 'DF' || selecionada === 'DF' ? 'rgb(var(--fg))' : 'rgb(var(--bg))',
                  strokeWidth: destaque === 'DF' || selecionada === 'DF' ? 2 : 1.5,
                  transition: 'fill 600ms cubic-bezier(.2,.8,.2,1)',
                }}
              />
              {rotulos ? (
                <text
                  x={dfCallout.bx}
                  y={dfCallout.by}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-sans"
                  style={{
                    fontSize: fontPx * 0.9 * kq,
                    fontWeight: 650,
                    fill: `rgb(var(--${inkToken(vals.DF.pendente ? 'rgb(var(--pending))' : vals.DF.fill, tokens)}))`,
                  }}
                >
                  DF
                </text>
              ) : null}
            </g>
          ) : null}
        </svg>
      )}

      {tip && geo ? (
        <MapTooltip
          titulo={UF_NOMES[tip.uf]}
          subtitulo={REGIAO_NOMES[UF_REGIAO[tip.uf]]}
          dados={ufs[tip.uf]}
          race={race}
          x={tip.x}
          y={tip.y}
          limites={size}
          fixo={tip.fixo}
          encaixado={tip.fixo && size.w < 520}
          onFechar={() => setTip(null)}
          acao={
            onSelect
              ? { label: rotuloAcao?.(tip.uf) ?? `Ver ${UF_NOMES[tip.uf]}`, onClick: () => onSelect(tip.uf) }
              : undefined
          }
          extra={
            modo === 'variacao' && vals[tip.uf].rotulo
              ? `Variação de ${race.candidatos[0]?.nomeUrna} vs 1º turno: ${vals[tip.uf].rotulo}`
              : modo === 'comparecimento' && vals[tip.uf].rotulo
                ? `Comparecimento: ${vals[tip.uf].rotulo}`
                : undefined
          }
        />
      ) : null}

      <MapDataTable
        caption={`Resultado por estado — ${modoInfo?.label ?? ''}`}
        race={race}
        linhas={ORDEM_TAB.map((uf) => ({ id: uf, nome: UF_NOMES[uf], dados: ufs[uf] }))}
      />
    </div>
  );
}

interface UfPathProps {
  uf: UFBr;
  d: string;
  fill: string;
  esmaecida: boolean;
  label: string;
  onFocus: (uf: UFBr) => void;
  onBlur: (uf: UFBr) => void;
  onKeyDown: (e: KeyboardEvent, uf: UFBr) => void;
}

const UfPath = memo(function UfPath({ uf, d, fill, esmaecida, label, onFocus, onBlur, onKeyDown }: UfPathProps) {
  return (
    <path
      d={d}
      data-uf={uf}
      tabIndex={0}
      role="button"
      aria-label={label}
      vectorEffect="non-scaling-stroke"
      strokeLinejoin="round"
      className="cursor-pointer outline-none"
      onFocus={() => onFocus(uf)}
      onBlur={() => onBlur(uf)}
      onKeyDown={(e) => onKeyDown(e, uf)}
      style={{
        fill,
        stroke: STROKE_DIVISA,
        strokeWidth: 1,
        opacity: esmaecida ? 0.4 : 1,
        transition: 'fill 600ms cubic-bezier(.2,.8,.2,1), opacity 300ms',
      }}
    />
  );
});
