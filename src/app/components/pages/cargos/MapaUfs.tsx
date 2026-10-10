/**
 * Mapa do Brasil por UF (geometria IBGE real, public/geo/br.json) para os cargos do 1º turno.
 *
 * - Cada UF é pintada com 1 ou 2 cores (ex.: Senado = 2 vagas → listras com as cores dos dois eleitos;
 *   se os dois são do mesmo partido, cor cheia). Marcas especiais: "2º turno" (listras na cor da marca)
 *   e "pendente" (hachura neutra, dado ainda não divulgado).
 * - Sigla legível sobre qualquer cor (texto com halo); as UFs pequenas do litoral nordestino ganham caixas
 *   fora da costa e o DF um callout — os mesmos do mapa da apuração, que também são alvos de toque.
 * - Dica com nomes/partidos (hover, foco ou toque); clique/Enter seleciona. Uma parada de Tab no mapa,
 *   setas passeiam entre as UFs.
 * Identidade nunca só pela cor: a dica e a lista ao lado trazem partido e nome.
 */
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { UFBr } from '@/shared/types';
import { UFS } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { cn } from '@/app/lib/cn';
import { STROKE_DIVISA } from '@/app/lib/raceUi';
import { Tooltip } from '@/app/ui/Tooltip';
import { bboxes, parseViewBox, useGeo, type BBox } from '@/app/components/apuracao/geo';
import { EXTRA_DIREITA, OFFSHORE, layoutCaixas, posicionarCalloutDf } from '@/app/components/apuracao/BrazilMap';
import { MapHatchPattern } from '@/app/components/apuracao/MapHatch';
import { ehSeta, useElementSize, vizinhoNaDirecao } from '@/app/components/apuracao/MapHooks';

export interface CelulaUf {
  /** Cores CSS (1 ou 2; a 2ª vira listra). Vazio = neutro. */
  faixas: string[];
  /** Conteúdo da dica (nomes, partidos). */
  dica: ReactNode;
  /** Rótulo para leitores de tela. */
  rotulo: string;
  /** Marca no lugar das cores: disputa em 2º turno ou dado ainda não divulgado. */
  marca?: 'segundo-turno' | 'pendente';
}

const ORDEM_TAB: UFBr[] = [...UFS].sort((a, b) => UF_NOMES[a].localeCompare(UF_NOMES[b], 'pt-BR'));
const FILL_VAZIO = 'rgb(var(--surface-3))';

export function MapaUfs({
  celulas,
  selecionada,
  onSelect,
  ariaLabel,
  className,
}: {
  celulas: Partial<Record<UFBr, CelulaUf>>;
  selecionada?: UFBr | null;
  onSelect?: (uf: UFBr) => void;
  ariaLabel: string;
  className?: string;
}) {
  const { data: geo, error } = useGeo();
  const uid = useId().replace(/:/g, '');
  const [boxRef, size, boxEl] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<UFBr | null>(null);
  const [focada, setFocada] = useState<UFBr | null>(null);
  const [ativa, setAtiva] = useState<UFBr | null>(null);
  const ufTabulavel: UFBr = ativa ?? selecionada ?? ORDEM_TAB[0];

  const vb = useMemo(() => parseViewBox(geo?.viewBox ?? '0 0 996 1000'), [geo]);
  const vbW = vb.w + EXTRA_DIREITA;
  const vbH = vb.h;
  const k = size.w > 0 ? vbW / size.w : 2.5;
  const kq = Math.round(k * 20) / 20;
  const fontPx = size.w < 360 ? 9 : size.w < 440 ? 10 : 11.5;

  const bb = useMemo(() => (geo ? bboxes(geo.ufs) : new Map<string, BBox>()), [geo]);
  const caixas = useMemo(() => (geo ? layoutCaixas(geo, bb, vbW, kq) : []), [geo, bb, vbW, kq]);
  const df = useMemo(
    () => (geo ? posicionarCalloutDf(geo, bb, kq, fontPx, false) : { ax: 0, ay: 0, bx: 0, by: 0, r: 0 }),
    [geo, bb, kq, fontPx],
  );

  // Pares de cores distintos → um <pattern> de listras por par.
  const pares = useMemo(() => {
    const m = new Map<string, [string, string]>();
    for (const uf of UFS) {
      const f = celulas[uf]?.faixas ?? [];
      if (!celulas[uf]?.marca && f.length >= 2 && f[0] !== f[1]) m.set(`${f[0]}|${f[1]}`, [f[0], f[1]]);
    }
    return [...m.entries()].map(([chave, cores], i) => ({ chave, cores, id: `${uid}-par-${i}` }));
  }, [celulas, uid]);
  const idPar = useMemo(() => new Map(pares.map((p) => [p.chave, p.id])), [pares]);

  const idHatch = `${uid}-pend`;
  const idSegundo = `${uid}-t2`;
  const fillDe = (uf: UFBr): string => {
    const c = celulas[uf];
    if (!c) return FILL_VAZIO;
    if (c.marca === 'pendente') return `url(#${idHatch})`;
    if (c.marca === 'segundo-turno') return `url(#${idSegundo})`;
    const f = c.faixas;
    if (!f.length) return FILL_VAZIO;
    if (f.length === 1 || f[0] === f[1]) return f[0];
    return `url(#${idPar.get(`${f[0]}|${f[1]}`)})`;
  };

  function focarUf(uf: UFBr) {
    setAtiva(uf);
    boxEl?.querySelector<SVGPathElement>(`path[data-uf="${uf}"]`)?.focus();
  }
  function onKeyDown(e: KeyboardEvent, uf: UFBr) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(uf);
    } else if (ehSeta(e.key) && geo) {
      e.preventDefault();
      const pts: Partial<Record<UFBr, { x: number; y: number }>> = {};
      for (const u of ORDEM_TAB) if (geo.ufs[u]) pts[u] = { x: geo.ufs[u].cx, y: geo.ufs[u].cy };
      const prox = vizinhoNaDirecao(pts, uf, e.key);
      if (prox) focarUf(prox);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focarUf(e.key === 'Home' ? ORDEM_TAB[0] : ORDEM_TAB[ORDEM_TAB.length - 1]);
    }
  }

  const esmaecida = (uf: UFBr) => !!selecionada && selecionada !== uf && hover !== uf;
  const ativo = (uf: UFBr) => hover === uf || selecionada === uf;

  /** Sigla com halo: legível sobre qualquer cor de partido, nos dois temas. */
  const sigla = (uf: UFBr, x: number, y: number, escala = 1) => (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      pointerEvents="none"
      className="font-sans"
      style={{
        fontSize: fontPx * escala * kq,
        fontWeight: 650,
        letterSpacing: '0.02em',
        fill: 'rgb(var(--fg))',
        stroke: 'rgb(var(--bg) / 0.78)',
        strokeWidth: 2.6 * kq,
        strokeLinejoin: 'round',
        paintOrder: 'stroke',
      }}
    >
      {uf}
    </text>
  );

  if (error && !geo) {
    return (
      <div className={cn('flex aspect-square items-center justify-center rounded-2xl bg-surface-2 text-sm text-fg-muted', className)}>
        Não foi possível carregar o mapa.
      </div>
    );
  }

  return (
    <div ref={boxRef} className={cn('relative mx-auto w-full max-w-[480px] select-none', className)}>
      {!geo ? (
        <div className="w-full animate-pulse rounded-2xl bg-surface-2" style={{ aspectRatio: `${vbW} / ${vbH}` }} aria-busy="true" />
      ) : (
        <svg
          viewBox={`${vb.x} ${vb.y} ${vbW} ${vbH}`}
          className="block h-auto w-full overflow-visible [-webkit-tap-highlight-color:transparent]"
          style={{ aspectRatio: `${vbW} / ${vbH}` }}
          role="group"
          aria-label={ariaLabel}
          aria-roledescription="mapa"
        >
          <defs>
            <MapHatchPattern id={idHatch} escala={kq} />
            <pattern id={idSegundo} patternUnits="userSpaceOnUse" width={7 * kq} height={7 * kq} patternTransform="rotate(45)">
              <rect width={7 * kq} height={7 * kq} style={{ fill: 'rgb(var(--brand) / 0.14)' }} />
              <rect width={2.2 * kq} height={7 * kq} style={{ fill: 'rgb(var(--brand) / 0.55)' }} />
            </pattern>
            {pares.map((p) => (
              <pattern key={p.id} id={p.id} patternUnits="userSpaceOnUse" width={12 * kq} height={12 * kq} patternTransform="rotate(45)">
                <rect width={12 * kq} height={12 * kq} style={{ fill: p.cores[0] }} />
                <rect width={6 * kq} height={12 * kq} style={{ fill: p.cores[1] }} />
              </pattern>
            ))}
          </defs>

          {/* UFs */}
          <g>
            {ORDEM_TAB.map((uf) => {
              const f = geo.ufs[uf];
              if (!f) return null;
              const cel = celulas[uf];
              return (
                <Tooltip key={uf} content={cel?.dica ?? UF_NOMES[uf]} delay={60}>
                  <path
                    d={f.d}
                    data-uf={uf}
                    role="button"
                    tabIndex={uf === ufTabulavel ? 0 : -1}
                    aria-label={cel?.rotulo ?? UF_NOMES[uf]}
                    aria-pressed={selecionada === uf}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    className="cursor-pointer outline-none"
                    onClick={() => onSelect?.(uf)}
                    onKeyDown={(e) => onKeyDown(e, uf)}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(uf)}
                    onPointerLeave={() => setHover((h) => (h === uf ? null : h))}
                    onFocus={() => {
                      setAtiva(uf);
                      setFocada(uf);
                    }}
                    onBlur={() => setFocada((x) => (x === uf ? null : x))}
                    style={{
                      fill: fillDe(uf),
                      stroke: STROKE_DIVISA,
                      strokeWidth: 1,
                      opacity: esmaecida(uf) ? 0.42 : 1,
                      transition: 'opacity 250ms, fill 400ms',
                    }}
                  />
                </Tooltip>
              );
            })}
          </g>

          {/* Contornos: hover, seleção, foco */}
          <g pointerEvents="none">
            {hover && hover !== selecionada && geo.ufs[hover] ? (
              <path d={geo.ufs[hover].d} fill="none" vectorEffect="non-scaling-stroke" style={{ stroke: 'rgb(var(--fg) / 0.85)', strokeWidth: 1.5 }} />
            ) : null}
            {selecionada && geo.ufs[selecionada] ? (
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
          </g>

          {/* Siglas */}
          <g>
            {UFS.map((uf) => {
              if (uf === 'DF' || OFFSHORE.includes(uf) || !geo.ufs[uf]) return null;
              return <g key={uf}>{sigla(uf, geo.ufs[uf].cx, geo.ufs[uf].cy)}</g>;
            })}
          </g>

          {/* Caixas fora da costa (RN, PB, PE, AL, SE) */}
          <g>
            {caixas.map((c) => (
              <Tooltip key={c.uf} content={celulas[c.uf]?.dica ?? UF_NOMES[c.uf]} delay={60}>
                <g
                  data-uf={c.uf}
                  className="cursor-pointer"
                  aria-hidden
                  onClick={() => onSelect?.(c.uf)}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(c.uf)}
                  onPointerLeave={() => setHover((h) => (h === c.uf ? null : h))}
                  style={{ opacity: esmaecida(c.uf) ? 0.5 : 1, transition: 'opacity 250ms' }}
                >
                  <line
                    x1={c.ax}
                    y1={c.ay}
                    x2={c.x}
                    y2={c.y + c.h / 2}
                    vectorEffect="non-scaling-stroke"
                    style={{ stroke: ativo(c.uf) ? 'rgb(var(--fg) / 0.8)' : 'rgb(var(--fg-subtle) / 0.7)', strokeWidth: 1 }}
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
                    style={{ fill: fillDe(c.uf), stroke: ativo(c.uf) ? 'rgb(var(--fg))' : STROKE_DIVISA, strokeWidth: ativo(c.uf) ? 2 : 1 }}
                  />
                  {sigla(c.uf, c.x + c.w / 2, c.y + c.h / 2, 0.92)}
                </g>
              </Tooltip>
            ))}
          </g>

          {/* Callout do DF */}
          {geo.ufs.DF ? (
            <Tooltip content={celulas.DF?.dica ?? UF_NOMES.DF} delay={60}>
              <g
                data-uf="DF"
                className="cursor-pointer"
                aria-hidden
                onClick={() => onSelect?.('DF')}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setHover('DF')}
                onPointerLeave={() => setHover((h) => (h === 'DF' ? null : h))}
                style={{ opacity: esmaecida('DF') ? 0.5 : 1, transition: 'opacity 250ms' }}
              >
                <line
                  x1={df.ax}
                  y1={df.ay}
                  x2={df.bx}
                  y2={df.by}
                  vectorEffect="non-scaling-stroke"
                  style={{ stroke: 'rgb(var(--fg) / 0.7)', strokeWidth: 1 }}
                />
                <circle cx={df.ax} cy={df.ay} r={2 * kq} style={{ fill: 'rgb(var(--fg))' }} />
                <circle cx={df.bx} cy={df.by} r={df.r * 1.45} fill="transparent" />
                <circle cx={df.bx} cy={df.by} r={df.r} style={{ fill: 'rgb(var(--surface))' }} />
                <circle
                  cx={df.bx}
                  cy={df.by}
                  r={df.r}
                  vectorEffect="non-scaling-stroke"
                  style={{
                    fill: fillDe('DF'),
                    stroke: ativo('DF') ? 'rgb(var(--fg))' : 'rgb(var(--bg))',
                    strokeWidth: ativo('DF') ? 2 : 1.5,
                  }}
                />
                {sigla('DF', df.bx, df.by, 0.88)}
              </g>
            </Tooltip>
          ) : null}
        </svg>
      )}
    </div>
  );
}
