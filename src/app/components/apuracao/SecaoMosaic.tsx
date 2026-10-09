/**
 * Mosaico de TODAS as seções de um município, agrupadas por zona (canvas com devicePixelRatio).
 *
 * Cada seção é um quadradinho: pendente (não totalizada), cor do candidato com intensidade pela margem
 * ('a'..'d' slot do candidato 0, 'e'..'h' do candidato 1), empate ('x'), sem válidos ('z') ou
 * totalizada sem vencedor informado ('t', fonte TSE ao vivo). Ver `ZonaMosaico` em src/shared/types.ts.
 *
 * - Desenho em lote por cor (dezenas de milhares de seções em poucos ms); camada-base em canvas
 *   fora da tela e animação de "acendimento" só nas seções que mudaram de estado.
 * - Hover/toque mostra "Zona 1 · Seção 123"; clique/Enter → onSelect(zona, secao).
 * - Teclado: setas percorrem as seções, PageUp/PageDown trocam de zona, Enter seleciona.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import type { Race, ZonaMosaico } from '@/shared/types';
import { decodeFaixas, pctTotalizadas } from '@/shared/calc';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { FILL_EMPATE, FILL_NEUTRO, FILL_PENDENTE, MARGEM_ROTULOS, fillMosaico, fillMargem } from '@/app/lib/raceUi';
import { resolveFill, rgbCss, useTokenColors, type TokenColors } from './mapColors';
import { cellPos, hitMosaico, layoutMosaico, type MosaicBlock, type MosaicLayout } from './MosaicLayout';
import { useClickOutside, useElementSize, prefersReducedMotion } from './MapHooks';

export interface SecaoMosaicProps {
  mosaico: ZonaMosaico[];
  race: Pick<Race, 'candidatos'>;
  selecionada?: { zona: number; secao: number } | null;
  onSelect?: (zona: number, secao: number) => void;
  /** Esmaece as outras zonas. */
  zonaDestaque?: number | null;
  /** Altura-alvo em px para escolher o tamanho das células (padrão: 85% da janela, até 900). */
  alturaAlvo?: number;
  /** Cabeçalho com totais (padrão: sim). */
  resumo?: boolean;
  /** Legenda abaixo (padrão: sim). */
  legenda?: boolean;
  /** Animação de acendimento quando seções mudam de estado (padrão: sim). */
  animar?: boolean;
  className?: string;
}

interface ZonaDec {
  zona: number;
  secoes: number[];
  estado: string;
}

const DUR_ANIM = 900;
const ATRASO_MAX = 700;

const decCache = new Map<string, number[]>();
function decode(faixas: string): number[] {
  let r = decCache.get(faixas);
  if (!r) {
    r = decodeFaixas(faixas);
    if (decCache.size > 4000) decCache.clear();
    decCache.set(faixas, r);
  }
  return r;
}

function descreverEstado(ch: string, race: Pick<Race, 'candidatos'>): string {
  const c0 = race.candidatos[0]?.nomeUrna ?? 'Candidato 1';
  const c1 = race.candidatos[1]?.nomeUrna ?? 'Candidato 2';
  if (ch === '0' || !ch) return 'Aguardando totalização';
  const code = ch.charCodeAt(0);
  if (code >= 97 && code <= 100) return `${c0} à frente (${MARGEM_ROTULOS[code - 97]})`;
  if (code >= 101 && code <= 104) return `${c1} à frente (${MARGEM_ROTULOS[code - 101]})`;
  if (ch === 'x') return 'Empate';
  if (ch === 'z') return 'Totalizada, sem votos válidos';
  if (ch === 't') return 'Totalizada';
  return 'Totalizada';
}

export function SecaoMosaic({
  mosaico,
  race,
  selecionada,
  onSelect,
  zonaDestaque,
  alturaAlvo,
  resumo = true,
  legenda = true,
  animar = true,
  className,
}: SecaoMosaicProps) {
  const tokens = useTokenColors();
  const [boxRef, size, boxEl] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ bi: number; i: number; fixo: boolean } | null>(null);
  const [cursor, setCursor] = useState<{ bi: number; i: number } | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const ultimoTipo = useRef('mouse');
  useClickOutside(boxEl, !!hover?.fixo, () => setHover(null));

  const zonas: ZonaDec[] = useMemo(
    () => mosaico.map((z) => ({ zona: z.zona, secoes: decode(z.faixas), estado: z.estado })),
    [mosaico],
  );
  const totais = useMemo(() => {
    let secoes = 0;
    let tot = 0;
    const presentes = new Set<string>();
    for (const z of zonas) {
      secoes += z.secoes.length;
      for (let i = 0; i < z.estado.length; i++) {
        const ch = z.estado[i];
        if (ch !== '0') tot++;
        presentes.add(ch);
      }
    }
    return { secoes, tot, presentes };
  }, [zonas]);

  // Altura da janela lida uma vez (a barra de endereço do celular muda innerHeight ao rolar).
  const [hJanela] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 900));
  const alvo = alturaAlvo ?? Math.min(900, Math.max(360, hJanela * 0.85));
  // O layout só depende da ESTRUTURA (zonas e nº de seções), não do estado — assim as atualizações
  // ao vivo reaproveitam a camada-base e repintam apenas as seções que mudaram.
  const estrutura = useMemo(() => zonas.map((z) => `${z.zona}:${z.secoes.length}`).join(','), [zonas]);
  const layout: MosaicLayout | null = useMemo(() => {
    if (size.w <= 0 || !estrutura) return null;
    const estreito = size.w < 480;
    const tamanhos = estrutura.split(',').map((p) => {
      const [zona, n] = p.split(':').map(Number);
      return { zona, n };
    });
    return layoutMosaico(tamanhos, size.w, {
      alturaAlvo: alvo,
      labelH: 18,
      gapX: estreito ? 10 : 16,
      gapY: estreito ? 10 : 14,
      minBlockW: estreito ? 76 : 110,
    });
  }, [estrutura, size.w, alvo]);

  // Paleta resolvida (canvas não entende var()).
  const paleta = useMemo(() => {
    if (!tokens) return null;
    const cores = race.candidatos.map((c) => c.cor);
    const p: Record<string, string> = {};
    for (const ch of '0abcdefghxzt') p[ch] = rgbCss(resolveFill(fillMosaico(ch, cores), tokens));
    return {
      p,
      label: rgbCss(tokens['fg-muted']),
      labelSub: rgbCss(tokens['fg-subtle']),
      flash: rgbCss(tokens.fg),
      tk: tokens as TokenColors,
    };
  }, [tokens, race.candidatos]);

  // ------------------------------------------------------------------ desenho
  const dpr = useMemo(() => {
    if (!layout || typeof window === 'undefined') return 1;
    const d = Math.min(2, window.devicePixelRatio || 1);
    const area = layout.width * layout.height * d * d;
    return area > 16e6 ? Math.max(1, Math.sqrt(16e6 / (layout.width * layout.height))) : d;
  }, [layout]);

  // Fontes carregadas depois do primeiro desenho → redesenha os rótulos.
  const [fontesV, setFontes] = useState(0);
  useEffect(() => {
    let vivo = true;
    document.fonts?.ready.then(() => vivo && setFontes((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Camada-base (canvas fora da tela) com o estado final de todas as seções. Entre atualizações só as
   * células que mudaram são repintadas (e os rótulos das zonas afetadas); o redesenho completo acontece
   * apenas quando muda o layout, o tema, o DPR, a zona em destaque ou as fontes.
   */
  const baseInfo = useRef<{
    layout: MosaicLayout;
    paleta: NonNullable<typeof paleta>;
    dpr: number;
    zonaDestaque: number | null | undefined;
    fontesV: number;
    estados: string[];
  } | null>(null);
  const raf = useRef(0);

  useLayoutEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !layout || !paleta) return;
    const t0 = performance.now();
    const W = Math.ceil(layout.width * dpr);
    const H = Math.ceil(Math.max(1, layout.height) * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    let base = baseRef.current;
    if (!base) base = baseRef.current = document.createElement('canvas');
    const bctx = base.getContext('2d')!;
    const { pitch, cell, labelH } = layout;
    const redondo = cell >= 7;
    const raio = Math.min(2.5, cell / 4);
    const esmaecida = (zona: number) => zonaDestaque != null && zona !== zonaDestaque;

    const pintar = (ctx: CanvasRenderingContext2D, ch: string, x: number, y: number) => {
      if (ch === 'x') {
        ctx.fillStyle = paleta.p.a;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cell, y);
        ctx.lineTo(x, y + cell);
        ctx.fill();
        ctx.fillStyle = paleta.p.e;
        ctx.beginPath();
        ctx.moveTo(x + cell, y);
        ctx.lineTo(x + cell, y + cell);
        ctx.lineTo(x, y + cell);
        ctx.fill();
        return;
      }
      ctx.fillStyle = paleta.p[ch] ?? paleta.p['0'];
      if (redondo && ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, cell, cell, raio);
        ctx.fill();
      } else ctx.fillRect(x, y, cell, cell);
    };

    const rotulo = (b: MosaicBlock) => {
      const z = zonas[b.idx];
      bctx.clearRect(b.x - 1, b.y, b.w + 2, labelH);
      bctx.globalAlpha = esmaecida(z.zona) ? 0.35 : 1;
      bctx.textBaseline = 'middle';
      bctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
      bctx.fillStyle = paleta.label;
      bctx.textAlign = 'left';
      bctx.fillText(`Zona ${z.zona}`, b.x, b.y + labelH / 2 - 1);
      if (b.w >= 104) {
        let tot = 0;
        for (let i = 0; i < z.estado.length; i++) if (z.estado.charCodeAt(i) !== 48) tot++;
        bctx.font = '400 10.5px "JetBrains Mono", ui-monospace, monospace';
        bctx.fillStyle = paleta.labelSub;
        bctx.textAlign = 'right';
        bctx.fillText(
          `${fmtInt(tot)}/${fmtInt(z.secoes.length)}`,
          b.x + b.cols * pitch - (pitch - cell),
          b.y + labelH / 2 - 1,
        );
      }
      bctx.globalAlpha = 1;
    };

    const ant = baseInfo.current;
    const completo =
      !ant ||
      ant.layout !== layout ||
      ant.paleta !== paleta ||
      ant.dpr !== dpr ||
      ant.zonaDestaque !== zonaDestaque ||
      ant.fontesV !== fontesV ||
      ant.estados.length !== zonas.length;
    const anims: { x: number; y: number; ch: string; start: number }[] = [];

    if (completo) {
      if (base.width !== W || base.height !== H) {
        base.width = W;
        base.height = H;
      }
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, layout.width, layout.height);
      for (const b of layout.blocks) rotulo(b);
      // Células em lote por cor (um path por cor).
      const porCor = new Map<string, number[]>();
      for (const b of layout.blocks) {
        const z = zonas[b.idx];
        const esm = esmaecida(z.zona);
        for (let i = 0; i < b.n; i++) {
          const ch = z.estado[i] ?? '0';
          const chave = esm ? `~${ch}` : ch;
          let arr = porCor.get(chave);
          if (!arr) porCor.set(chave, (arr = []));
          arr.push(b.x + (i % b.cols) * pitch, b.y + labelH + Math.floor(i / b.cols) * pitch);
        }
      }
      for (const [chave, pts] of porCor) {
        const esm = chave.charCodeAt(0) === 126; // '~'
        const ch = esm ? chave.slice(1) : chave;
        bctx.globalAlpha = esm ? 0.3 : 1;
        if (ch === 'x') {
          for (let k = 0; k < pts.length; k += 2) pintar(bctx, ch, pts[k], pts[k + 1]);
          continue;
        }
        bctx.fillStyle = paleta.p[ch] ?? paleta.p['0'];
        bctx.beginPath();
        for (let k = 0; k < pts.length; k += 2) {
          if (redondo && bctx.roundRect) bctx.roundRect(pts[k], pts[k + 1], cell, cell, raio);
          else bctx.rect(pts[k], pts[k + 1], cell, cell);
        }
        bctx.fill();
      }
      bctx.globalAlpha = 1;
    } else {
      // Incremental: só as seções que mudaram.
      const anima = animar && !prefersReducedMotion();
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const b of layout.blocks) {
        const novo = zonas[b.idx].estado;
        const velho = ant!.estados[b.idx] ?? '';
        if (novo === velho) continue;
        const esm = esmaecida(zonas[b.idx].zona);
        bctx.globalAlpha = esm ? 0.3 : 1;
        for (let i = 0; i < b.n; i++) {
          const a = velho.charCodeAt(i);
          const n = novo.charCodeAt(i);
          if (a === n) continue;
          const x = b.x + (i % b.cols) * pitch;
          const y = b.y + labelH + Math.floor(i / b.cols) * pitch;
          bctx.clearRect(x, y, cell, cell);
          const ch = novo[i] ?? '0';
          pintar(bctx, ch, x, y);
          if (anima && n !== 48 && !esm) anims.push({ x, y, ch, start: 0 });
        }
        bctx.globalAlpha = 1;
        rotulo(b);
      }
    }
    baseInfo.current = { layout, paleta, dpr, zonaDestaque, fontesV, estados: zonas.map((z) => z.estado) };
    cancelAnimationFrame(raf.current);

    const ctx = cv.getContext('2d')!;
    const copiarBase = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(base!, 0, 0);
    };
    copiarBase();
    if (!anims.length || anims.length > 60000) {
      registrar(t0);
      return;
    }

    // "Acendimento": as seções novas começam pendentes e acendem com um clarão, em ordem aleatória.
    const agora = performance.now();
    for (const a of anims) a.start = agora + Math.random() * ATRASO_MAX;
    const flash = paleta.flash;
    const pend = paleta.p['0'];
    const passo = () => {
      const now = performance.now();
      copiarBase();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let vivos = 0;
      for (const a of anims) {
        const t = (now - a.start) / DUR_ANIM;
        if (t >= 1) continue;
        vivos++;
        if (t < 0) {
          ctx.fillStyle = pend;
          ctx.fillRect(a.x, a.y, cell, cell);
          continue;
        }
        const pop = 1 + 0.9 * Math.pow(1 - t, 3);
        const sz = cell * pop;
        const off = (sz - cell) / 2;
        ctx.fillStyle = paleta.p[a.ch] ?? pend;
        ctx.fillRect(a.x - off, a.y - off, sz, sz);
        ctx.globalAlpha = 0.85 * Math.pow(1 - t, 2.2);
        ctx.fillStyle = flash;
        ctx.fillRect(a.x - off, a.y - off, sz, sz);
        ctx.globalAlpha = 1;
      }
      if (vivos > 0) raf.current = requestAnimationFrame(passo);
      else copiarBase();
    };
    passo();
    registrar(t0);
  }, [layout, paleta, zonas, dpr, animar, fontesV, zonaDestaque]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // ------------------------------------------------------------------ interação
  const alvoDe = (e: { clientX: number; clientY: number }) => {
    if (!layout || !canvasRef.current) return null;
    const r = canvasRef.current.getBoundingClientRect();
    const h = hitMosaico(layout, e.clientX - r.left, e.clientY - r.top);
    return h ? { bi: layout.blocks.indexOf(h.block), i: h.i } : null;
  };
  function onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    const h = alvoDe(e);
    setHover(h ? { ...h, fixo: false } : null);
  }
  function onPointerDown(e: PointerEvent) {
    ultimoTipo.current = e.pointerType;
  }
  function onClick(e: MouseEvent) {
    const h = alvoDe(e);
    if (!h || !layout) return setHover(null);
    const z = zonas[layout.blocks[h.bi].idx];
    const secao = z.secoes[h.i];
    if (ultimoTipo.current === 'touch') {
      if (hover?.fixo && hover.bi === h.bi && hover.i === h.i) onSelect?.(z.zona, secao);
      else setHover({ ...h, fixo: true });
      return;
    }
    onSelect?.(z.zona, secao);
  }
  function onKeyDown(e: KeyboardEvent) {
    if (!layout || !layout.blocks.length) return;
    const c = cursor ?? { bi: 0, i: 0 };
    const b = layout.blocks[c.bi];
    let { bi, i } = c;
    switch (e.key) {
      case 'ArrowRight':
        i = Math.min(b.n - 1, i + 1);
        break;
      case 'ArrowLeft':
        i = Math.max(0, i - 1);
        break;
      case 'ArrowDown':
        i = Math.min(b.n - 1, i + b.cols);
        break;
      case 'ArrowUp':
        i = Math.max(0, i - b.cols);
        break;
      case 'PageDown':
        bi = Math.min(layout.blocks.length - 1, bi + 1);
        i = 0;
        break;
      case 'PageUp':
        bi = Math.max(0, bi - 1);
        i = 0;
        break;
      case 'Home':
        i = 0;
        break;
      case 'End':
        i = b.n - 1;
        break;
      case 'Enter':
      case ' ': {
        const z = zonas[b.idx];
        onSelect?.(z.zona, z.secoes[i]);
        e.preventDefault();
        return;
      }
      case 'Escape':
        setCursor(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    setCursor({ bi, i });
    const z = zonas[layout.blocks[bi].idx];
    setAnuncio(`Zona ${z.zona}, seção ${z.secoes[i]}: ${descreverEstado(z.estado[i], race)}`);
  }

  const marcador = (bi: number, i: number) => {
    if (!layout) return null;
    const b: MosaicBlock | undefined = layout.blocks[bi];
    if (!b) return null;
    return cellPos(layout, b, i);
  };
  const selPos = useMemo(() => {
    if (!selecionada || !layout) return null;
    const bi = layout.blocks.findIndex((b) => zonas[b.idx].zona === selecionada.zona);
    if (bi < 0) return null;
    const i = zonas[layout.blocks[bi].idx].secoes.indexOf(selecionada.secao);
    return i >= 0 ? marcador(bi, i) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionada, layout, zonas]);

  const ativo = hover ?? (cursor ? { ...cursor, fixo: false } : null);
  const ativoPos = ativo ? marcador(ativo.bi, ativo.i) : null;
  const ativoZona = ativo && layout ? zonas[layout.blocks[ativo.bi]?.idx] : null;
  const pitch = layout?.pitch ?? 0;
  const cell = layout?.cell ?? 0;
  const anel = Math.max(2, Math.round(cell * 0.18));

  return (
    <div className={cn('w-full', className)}>
      {resumo ? (
        <p className="num mb-3 text-[12.5px] text-fg-muted">
          <span className="font-semibold text-fg">{fmtInt(totais.secoes)}</span> seções ·{' '}
          <span className="font-semibold text-fg">{fmtInt(zonas.length)}</span> {zonas.length === 1 ? 'zona' : 'zonas'}{' '}
          · <span className="font-semibold text-fg">{fmtInt(totais.tot)}</span> totalizadas (
          {fmtPct(pctTotalizadas({ secoes: totais.secoes, secoesTotalizadas: totais.tot }))})
        </p>
      ) : null}

      <div
        ref={boxRef}
        className="relative w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
        style={{ height: layout ? layout.height : 160 }}
        tabIndex={0}
        role="grid"
        aria-label={`Mosaico de ${fmtInt(totais.secoes)} seções em ${zonas.length} zonas; ${fmtInt(totais.tot)} totalizadas. Use as setas para percorrer e Enter para abrir uma seção.`}
        aria-rowcount={-1}
        onKeyDown={onKeyDown}
        onBlur={() => setCursor(null)}
      >
        <canvas
          ref={canvasRef}
          className="absolute left-0 top-0 cursor-pointer [-webkit-tap-highlight-color:transparent]"
          style={{ width: layout?.width ?? 0, height: layout?.height ?? 0 }}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerLeave={() => hover && !hover.fixo && setHover(null)}
          onClick={onClick}
          aria-hidden
        />
        {selPos ? (
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-[3px]"
            style={{
              left: selPos.x - anel - 1,
              top: selPos.y - anel - 1,
              width: cell + 2 * anel + 2,
              height: cell + 2 * anel + 2,
              boxShadow: `0 0 0 ${anel}px rgb(var(--fg)), 0 0 0 ${anel + 2}px rgb(var(--bg))`,
            }}
          />
        ) : null}
        {ativoPos ? (
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-[2px]"
            style={{
              left: ativoPos.x - 1.5,
              top: ativoPos.y - 1.5,
              width: cell + 3,
              height: cell + 3,
              boxShadow: '0 0 0 1.5px rgb(var(--fg)), 0 0 0 3px rgb(var(--bg) / 0.8)',
            }}
          />
        ) : null}
        {ativo && ativoPos && ativoZona && layout ? (
          <div
            className={cn(
              'absolute z-10 rounded-xl border border-line bg-surface/95 px-2.5 py-1.5 text-[12px] shadow-card backdrop-blur-md',
              ativo.fixo ? 'pointer-events-auto' : 'pointer-events-none',
            )}
            style={{
              left: Math.min(Math.max(0, ativoPos.x + pitch / 2 - 115), layout.width - 230),
              ...(ativoPos.y > 90 ? { bottom: layout.height - ativoPos.y + 8 } : { top: ativoPos.y + pitch + 8 }),
              width: 230,
            }}
            role="status"
          >
            <p className="font-mono text-[12px] font-semibold text-fg">
              Zona {ativoZona.zona} · Seção {ativoZona.secoes[ativo.i]}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-fg-muted">
              {descreverEstado(ativoZona.estado[ativo.i], race)}
            </p>
            {ativo.fixo && onSelect ? (
              <button
                type="button"
                className="mt-1.5 w-full rounded-lg bg-fg py-1 text-[12px] font-semibold text-bg"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(ativoZona.zona, ativoZona.secoes[ativo.i]);
                }}
              >
                Ver boletim →
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
      </div>

      {legenda ? <MosaicLegend race={race} presentes={totais.presentes} className="mt-4" /> : null}
    </div>
  );
}

/** Mede o desenho (User Timing) — visível no painel de desempenho e nos testes do kit. */
function registrar(t0: number) {
  try {
    performance.measure('sintonia:mosaico', { start: t0, end: performance.now() });
  } catch {
    /* navegadores antigos */
  }
}

export interface MosaicLegendProps {
  race: Pick<Race, 'candidatos'>;
  /** Estados presentes nos dados (mostra itens opcionais só quando aparecem). */
  presentes?: Set<string>;
  className?: string;
}

/** Legenda do mosaico de seções. */
export function MosaicLegend({ race, presentes, className }: MosaicLegendProps) {
  const cores = race.candidatos.map((c) => c.cor);
  const linhas = race.candidatos.slice(0, 2).map((c, ci) => ({
    nome: c.nomeUrna,
    fills: [0, 1, 2, 3].map((b) => fillMargem(cores[ci] ?? (ci === 0 ? 'a' : 'b'), b as 0 | 1 | 2 | 3)),
  }));
  const extras: { label: string; fill: string; split?: boolean }[] = [{ label: 'Não totalizada', fill: FILL_PENDENTE }];
  if (presentes?.has('t'))
    extras.push({ label: 'Totalizada (sem resultado por seção)', fill: fillMosaico('t', cores) });
  if (presentes?.has('x')) extras.push({ label: 'Empate', fill: FILL_EMPATE, split: true });
  if (presentes?.has('z')) extras.push({ label: 'Sem votos válidos', fill: FILL_NEUTRO });
  return (
    <div className={cn('flex flex-wrap items-start gap-x-8 gap-y-3 text-[11.5px] text-fg-muted', className)}>
      <div className="inline-grid grid-cols-[auto_repeat(4,14px)] items-center gap-x-1 gap-y-1">
        {linhas.map((l) => (
          <div key={l.nome} className="contents">
            <span className="max-w-[140px] truncate pr-2 text-[12px] text-fg">{l.nome}</span>
            {l.fills.map((f, i) => (
              <span key={i} className="h-3.5 w-3.5 rounded-[3px]" style={{ background: f }} title={MARGEM_ROTULOS[i]} />
            ))}
          </div>
        ))}
        <span />
        <span className="num col-span-4 whitespace-nowrap text-[10.5px] text-fg-subtle">{'<5 → ≥30 p.p.'}</span>
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {extras.map((x) => (
          <li key={x.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-[3px]"
              style={{
                background: x.split
                  ? `linear-gradient(135deg, ${fillMosaico('a', cores)} 50%, ${fillMosaico('e', cores)} 50%)`
                  : x.fill,
              }}
            />
            {x.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
