/**
 * Zoom/pan suave para mapas SVG grandes (UfMap).
 *
 * Estratégia de desempenho: durante o gesto (arrastar, pinça, roda) só mudamos o `transform` CSS de uma
 * camada (`stage`, composta na GPU) — nenhum render do React. Ao terminar, o resultado é "consolidado"
 * no `<g transform>` do SVG (re-rasterização nítida, traços com espessura correta) e a camada volta ao
 * transform identidade no mesmo frame (useLayoutEffect).
 *
 * Coordenadas: `view = { k, x, y }` em px de tela — um ponto p do conteúdo (px com k = 1) aparece em
 * `x + k·p`. Para o SVG: `translate(x/s0, y/s0) scale(k)` em unidades do viewBox (s0 = px por unidade).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
} from 'react';

export interface View {
  k: number;
  x: number;
  y: number;
}

export interface MapZoomOptions {
  maxK?: number;
  /** Tamanho do conteúdo em px (com k = 1) — normalmente o tamanho do contêiner. */
  w: number;
  h: number;
}

const IDENT: View = { k: 1, x: 0, y: 0 };
const DUR = 320;

export function useMapZoom({ maxK = 12, w, h }: MapZoomOptions) {
  const [view, setView] = useState<View>(IDENT);
  const committed = useRef<View>(IDENT);
  const live = useRef<View>(IDENT);
  const stage = useRef<HTMLDivElement | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ start: View; p0: { x: number; y: number }; d0: number; m0: { x: number; y: number } } | null>(
    null,
  );
  const moveu = useRef(false);
  const wheelTimer = useRef<number | undefined>(undefined);
  const animTimer = useRef<number | undefined>(undefined);
  const [dica, setDica] = useState<string | null>(null);
  const dicaTimer = useRef<number | undefined>(undefined);
  const dims = useRef({ w, h, maxK });
  dims.current = { w, h, maxK };

  const clampView = useCallback((v: View): View => {
    const { w, h, maxK } = dims.current;
    const k = Math.min(maxK, Math.max(1, v.k));
    const minX = w - w * k;
    const minY = h - h * k;
    return { k, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
  }, []);

  /** Aplica um transform "ao vivo" na camada (relativo ao consolidado). */
  const aplicarLive = useCallback((v: View, transicao = false) => {
    live.current = v;
    const c = committed.current;
    const gk = v.k / c.k;
    const gx = v.x - gk * c.x;
    const gy = v.y - gk * c.y;
    const el = stage.current;
    if (!el) return;
    el.style.transition = transicao ? `transform ${DUR}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    el.style.willChange = 'transform';
    el.style.transform = `translate3d(${gx}px, ${gy}px, 0) scale(${gk})`;
  }, []);

  const consolidar = useCallback(() => {
    const v = live.current;
    committed.current = v;
    setView(v);
  }, []);

  // Depois do render com o novo <g transform>, zera a camada no mesmo frame (sem piscar).
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = '';
    el.style.willChange = '';
  }, [view]);

  // Largura do contêiner mudou (rotação, redimensionamento) → volta ao enquadramento inicial.
  const wAnt = useRef(w);
  useEffect(() => {
    if (Math.abs(wAnt.current - w) < 1) return;
    wAnt.current = w;
    committed.current = IDENT;
    live.current = IDENT;
    setView(IDENT);
  }, [w]);

  const animarPara = useCallback(
    (alvo: View) => {
      const v = clampView(alvo);
      const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      aplicarLive(v, !reduzir);
      window.clearTimeout(animTimer.current);
      animTimer.current = window.setTimeout(consolidar, reduzir ? 0 : DUR + 20);
    },
    [aplicarLive, clampView, consolidar],
  );

  /** Zoom por fator em torno de um ponto (px do contêiner; padrão: centro). */
  const zoomPor = useCallback(
    (f: number, cx = dims.current.w / 2, cy = dims.current.h / 2, animar = true) => {
      const v = live.current;
      const k = Math.min(dims.current.maxK, Math.max(1, v.k * f));
      const p = { x: (cx - v.x) / v.k, y: (cy - v.y) / v.k };
      const alvo = { k, x: cx - k * p.x, y: cy - k * p.y };
      if (animar) animarPara(alvo);
      else aplicarLive(clampView(alvo));
    },
    [animarPara, aplicarLive, clampView],
  );

  const resetar = useCallback(() => animarPara(IDENT), [animarPara]);

  /** Desloca a vista (px). */
  const moverPor = useCallback(
    (dx: number, dy: number) => animarPara({ ...live.current, x: live.current.x + dx, y: live.current.y + dy }),
    [animarPara],
  );

  /** Enquadra uma caixa (em px de conteúdo, k = 1). */
  const enquadrar = useCallback(
    (b: { x: number; y: number; w: number; h: number }, kMax = 6) => {
      const { w, h } = dims.current;
      const k = Math.min(kMax, Math.max(1, Math.min(w / (b.w * 2.2 || 1), h / (b.h * 2.2 || 1))));
      animarPara({ k, x: w / 2 - k * (b.x + b.w / 2), y: h / 2 - k * (b.y + b.h / 2) });
    },
    [animarPara],
  );

  const mostrarDica = useCallback((t: string) => {
    setDica(t);
    window.clearTimeout(dicaTimer.current);
    dicaTimer.current = window.setTimeout(() => setDica(null), 1400);
  }, []);

  // ------------------------------------------------------------------ ponteiros
  const rel = (e: { clientX: number; clientY: number }) => {
    const r = container.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = useCallback((e: RPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, rel(e));
    moveu.current = false;
    const n = pointers.current.size;
    const zoomado = live.current.k > 1.001;
    if (n === 2 || (n === 1 && (zoomado || e.pointerType === 'mouse'))) {
      const pts = [...pointers.current.values()];
      const m0 = n === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
      const d0 = n === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
      gesto.current = { start: { ...live.current }, p0: pts[0], d0, m0 };
    }
  }, []);

  const capturar = (e: RPointerEvent) => {
    // Captura só quando o gesto começa de fato (assim um clique simples continua indo para o path).
    const el = e.currentTarget as Element;
    for (const id of pointers.current.keys()) {
      try {
        if (!el.hasPointerCapture?.(id)) el.setPointerCapture?.(id);
      } catch {
        /* ponteiro já liberado */
      }
    }
  };

  const onPointerMove = useCallback(
    (e: RPointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, rel(e));
      const g = gesto.current;
      if (!g) return;
      const pts = [...pointers.current.values()];
      if (pts.length >= 2 && g.d0 > 0) {
        const m = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const k = Math.min(dims.current.maxK, Math.max(1, g.start.k * (d / g.d0)));
        const p = { x: (g.m0.x - g.start.x) / g.start.k, y: (g.m0.y - g.start.y) / g.start.k };
        if (!moveu.current) capturar(e);
        aplicarLive(clampView({ k, x: m.x - k * p.x, y: m.y - k * p.y }));
        moveu.current = true;
      } else if (pts.length === 1 && g.start.k > 1.001) {
        const dx = pts[0].x - g.p0.x;
        const dy = pts[0].y - g.p0.y;
        if (!moveu.current && Math.hypot(dx, dy) < 4) return;
        if (!moveu.current) capturar(e);
        moveu.current = true;
        aplicarLive(clampView({ k: g.start.k, x: g.start.x + dx, y: g.start.y + dy }));
      }
    },
    [aplicarLive, clampView],
  );

  const onPointerUp = useCallback(
    (e: RPointerEvent) => {
      pointers.current.delete(e.pointerId);
      const g = gesto.current;
      if (!g) return;
      if (pointers.current.size === 1) {
        // Pinça → arrastar com o dedo que ficou.
        const p = [...pointers.current.values()][0];
        gesto.current = { start: { ...live.current }, p0: p, d0: 0, m0: p };
        return;
      }
      if (pointers.current.size === 0) {
        gesto.current = null;
        if (moveu.current) consolidar();
      }
    },
    [consolidar],
  );

  /** true se o último gesto arrastou (o clique deve ser ignorado). */
  const arrastou = useCallback(() => moveu.current, []);

  const onDoubleClick = useCallback(
    (e: RMouseEvent) => {
      const p = rel(e);
      zoomPor(e.shiftKey ? 0.5 : 2, p.x, p.y);
    },
    [zoomPor],
  );

  // Roda do mouse: Ctrl/⌘ + roda (ou pinça no trackpad) amplia; sem modificador mostra a dica.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        if (live.current.k <= 1.001) mostrarDica('Use Ctrl + rolagem (ou a pinça) para ampliar');
        else {
          e.preventDefault();
          aplicarLive(clampView({ ...live.current, x: live.current.x - e.deltaX, y: live.current.y - e.deltaY }));
          window.clearTimeout(wheelTimer.current);
          wheelTimer.current = window.setTimeout(consolidar, 160);
        }
        return;
      }
      e.preventDefault();
      const p = rel(e);
      const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
      zoomPor(f, p.x, p.y, false);
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(consolidar, 160);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [aplicarLive, clampView, consolidar, mostrarDica, zoomPor]);

  useEffect(
    () => () => {
      window.clearTimeout(wheelTimer.current);
      window.clearTimeout(animTimer.current);
      window.clearTimeout(dicaTimer.current);
    },
    [],
  );

  return {
    view,
    containerRef: container,
    stageRef: stage,
    zoomPor,
    resetar,
    moverPor,
    enquadrar,
    arrastou,
    dica,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
    },
  };
}
