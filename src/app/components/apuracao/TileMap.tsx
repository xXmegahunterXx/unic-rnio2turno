/**
 * Cartograma de blocos: as 27 UFs (e, opcionalmente, o Exterior) numa grade 6 × 8 que lembra a
 * geografia do Brasil. Todas as UFs têm o mesmo tamanho → ótimo no celular para os estados pequenos.
 * Mesmos modos e props do BrazilMap. Cada bloco é um <button> (teclado e leitor de tela de graça).
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Race, Summary, Tally, UF } from '@/shared/types';
import { REGIAO_NOMES, UF_NOMES, UF_REGIAO } from '@/shared/constants';
import { margem, pctTotalizadas, pctValidos } from '@/shared/calc';
import { fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { rgbSlot, slotDe } from '@/app/lib/raceUi';
import { valorModo, rotuloApurado, type MapMode, type ModeValue } from './mapModes';
import { inkToken, useTokenColors } from './mapColors';
import { hachuraStyle } from './MapHatch';
import { MapTooltip } from './MapTooltip';
import { useClickOutside, useElementSize } from './MapHooks';

/** Posição [coluna, linha] de cada UF na grade 6 × 8. */
export const TILE_LAYOUT: Record<UF, readonly [number, number]> = {
  RR: [1, 0],
  AP: [3, 0],
  AM: [1, 1],
  PA: [2, 1],
  MA: [3, 1],
  CE: [4, 1],
  RN: [5, 1],
  AC: [0, 2],
  RO: [1, 2],
  TO: [2, 2],
  PI: [3, 2],
  PE: [4, 2],
  PB: [5, 2],
  MT: [1, 3],
  GO: [2, 3],
  BA: [3, 3],
  SE: [4, 3],
  AL: [5, 3],
  MS: [1, 4],
  DF: [2, 4],
  MG: [3, 4],
  ES: [4, 4],
  PR: [1, 5],
  SP: [2, 5],
  RJ: [3, 5],
  SC: [1, 6],
  RS: [1, 7],
  ZZ: [5, 7],
};
const COLS = 6;
const ROWS = 8;

export interface TileMapProps {
  ufs: Partial<Record<UF, Summary>>;
  race: Pick<Race, 'candidatos'>;
  modo?: MapMode;
  selecionada?: UF | null;
  onSelect?: (uf: UF) => void;
  primeiroTurno?: Partial<Record<UF, Pick<Tally, 'votos'>>>;
  /** Bloco do Exterior (ZZ). Padrão: quando houver dados de ZZ. */
  exterior?: boolean;
  /** Valor do modo abaixo da sigla. Padrão: sim. */
  valores?: boolean;
  rotuloAcao?: (uf: UF) => string;
  className?: string;
  ariaLabel?: string;
}

export function TileMap({
  ufs,
  race,
  modo = 'vencedor',
  selecionada,
  onSelect,
  primeiroTurno,
  exterior,
  valores = true,
  rotuloAcao,
  className,
  ariaLabel,
}: TileMapProps) {
  const tokens = useTokenColors();
  const reduzir = useReducedMotion();
  const [boxRef, size, boxEl] = useElementSize<HTMLDivElement>();
  const [tip, setTip] = useState<{ uf: UF; x: number; y: number; fixo: boolean } | null>(null);
  const ultimo = useRef({ tipo: 'mouse', t: 0 });
  const comExterior = exterior ?? !!ufs.ZZ;

  const lista = useMemo(
    () => (Object.keys(TILE_LAYOUT) as UF[]).filter((uf) => uf !== 'ZZ' || comExterior),
    [comExterior],
  );

  const vals = useMemo(() => {
    const out = {} as Record<UF, ModeValue>;
    for (const uf of lista) out[uf] = valorModo(modo, ufs[uf], { race, primeiroTurno: primeiroTurno?.[uf] });
    return out;
  }, [lista, modo, ufs, race, primeiroTurno]);

  // Pulso na troca de líder.
  const lideres = useMemo(() => {
    const out: Partial<Record<UF, number | null>> = {};
    for (const uf of lista) out[uf] = ufs[uf] && ufs[uf]!.secoesTotalizadas > 0 ? margem(ufs[uf]!).lider : null;
    return out;
  }, [lista, ufs]);
  const lideresAnt = useRef(lideres);
  const [pulsos, setPulsos] = useState<Partial<Record<UF, number>>>({});
  useEffect(() => {
    const ant = lideresAnt.current;
    lideresAnt.current = lideres;
    if (ant === lideres || reduzir) return;
    const novos: Partial<Record<UF, number>> = {};
    for (const uf of lista) {
      const a = ant[uf];
      const b = lideres[uf];
      if (a != null && b != null && a !== b) novos[uf] = performance.now();
    }
    if (Object.keys(novos).length) setPulsos((p) => ({ ...p, ...novos }));
  }, [lideres, lista, reduzir]);

  useClickOutside(boxEl, !!tip?.fixo, () => setTip(null));

  const gap = size.w < 420 ? 4 : 6;
  const tile = size.w > 0 ? (size.w - gap * (COLS - 1)) / COLS : 0;
  const altura = tile > 0 ? tile * ROWS + gap * (ROWS - 1) : undefined;
  const fontSigla = tile < 52 ? 13 : tile < 70 ? 15 : 18;
  const fontValor = tile < 52 ? 9.5 : tile < 70 ? 10.5 : 12;
  const centro = (uf: UF) => {
    const [c, r] = TILE_LAYOUT[uf];
    return { x: c * (tile + gap) + tile / 2, y: r * (tile + gap) + tile * 0.2 };
  };

  function onPointerMove(e: PointerEvent, uf: UF) {
    if (e.pointerType === 'touch') return;
    const r = boxEl!.getBoundingClientRect();
    setTip({ uf, x: e.clientX - r.left, y: e.clientY - r.top, fixo: false });
  }
  function onClick(uf: UF) {
    const toque = ultimo.current.tipo === 'touch' && performance.now() - ultimo.current.t < 1500;
    if (toque) {
      if (tip?.fixo && tip.uf === uf) onSelect?.(uf);
      else setTip({ uf, ...centro(uf), fixo: true });
      return;
    }
    onSelect?.(uf);
  }

  const descr = (uf: UF) => {
    const t = ufs[uf];
    if (!t || t.secoesTotalizadas <= 0) return `${UF_NOMES[uf]}: nenhuma seção totalizada`;
    const partes = race.candidatos.map((c, i) => `${c.nomeUrna} ${fmtPct(pctValidos(t, i))}`).join(', ');
    return `${UF_NOMES[uf]}: ${rotuloApurado(pctTotalizadas(t))} apurado; ${partes}`;
  };

  return (
    <div
      ref={boxRef}
      className={cn('relative w-full select-none', className)}
      onPointerLeave={() => tip && !tip.fixo && setTip(null)}
    >
      <div
        role="group"
        aria-label={ariaLabel ?? 'Cartograma dos estados'}
        className="relative"
        style={{ height: altura, aspectRatio: altura ? undefined : `${COLS} / ${ROWS}` }}
      >
        {tile > 0
          ? lista.map((uf) => {
              const [c, r] = TILE_LAYOUT[uf];
              const v = vals[uf];
              const ink = inkToken(v.pendente ? 'rgb(var(--pending))' : v.fill, tokens);
              const sel = selecionada === uf;
              const ext = uf === 'ZZ';
              const encerrada = ufs[uf]?.status === 'encerrada';
              const lider = lideres[uf];
              return (
                <button
                  key={uf}
                  type="button"
                  data-uf={uf}
                  aria-label={descr(uf)}
                  aria-pressed={sel}
                  onPointerDown={(e) => (ultimo.current = { tipo: e.pointerType, t: performance.now() })}
                  onPointerMove={(e) => onPointerMove(e, uf)}
                  onFocus={() => {
                    if (performance.now() - ultimo.current.t > 400) setTip({ uf, ...centro(uf), fixo: false });
                  }}
                  onBlur={() => setTip((t) => (t && t.uf === uf && !t.fixo ? null : t))}
                  onKeyDown={(e) => e.key === 'Escape' && setTip(null)}
                  onClick={() => onClick(uf)}
                  className={cn(
                    'group absolute flex flex-col items-center justify-center overflow-visible rounded-[10px] outline-none [-webkit-tap-highlight-color:transparent]',
                    'transition-[background-color,transform,box-shadow] duration-500 ease-out hover:z-10 hover:scale-[1.06] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    sel && 'z-10 ring-2 ring-fg ring-offset-2 ring-offset-surface',
                    ink === 'fg' ? 'text-fg' : 'text-bg',
                  )}
                  style={{
                    left: c * (tile + gap),
                    top: r * (tile + gap),
                    width: tile,
                    height: tile,
                    ...(v.pendente ? hachuraStyle() : { backgroundColor: v.fill }),
                  }}
                >
                  {pulsos[uf] && lider != null ? (
                    <motion.span
                      key={pulsos[uf]}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-[inherit]"
                      initial={{ opacity: 0.9, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.45 }}
                      transition={{ duration: 1.4, ease: 'easeOut', repeat: 1 }}
                      style={{ boxShadow: `0 0 0 3px ${rgbSlot(slotDe(race, lider))}` }}
                    />
                  ) : null}
                  <span
                    className={cn('font-display font-semibold leading-none tracking-wide', ext && 'text-[0.72em]')}
                    style={{ fontSize: ext ? fontSigla * 0.72 : fontSigla }}
                  >
                    {ext ? 'Exterior' : uf}
                  </span>
                  {valores && v.rotulo ? (
                    <span className="num mt-1 leading-none opacity-80" style={{ fontSize: fontValor }}>
                      {v.rotulo}
                    </span>
                  ) : null}
                  {encerrada ? (
                    <span
                      aria-hidden
                      className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-current opacity-70"
                      title="Apuração encerrada"
                    />
                  ) : null}
                </button>
              );
            })
          : null}
      </div>

      {tip ? (
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
            modo === 'variacao' && vals[tip.uf]?.rotulo
              ? `Variação de ${race.candidatos[0]?.nomeUrna} vs 1º turno: ${vals[tip.uf].rotulo}`
              : modo === 'comparecimento' && vals[tip.uf]?.rotulo
                ? `Comparecimento: ${vals[tip.uf].rotulo}`
                : undefined
          }
        />
      ) : null}
    </div>
  );
}
