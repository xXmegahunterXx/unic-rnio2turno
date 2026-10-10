/**
 * Mapa nacional por MUNICÍPIO (5.571) em <canvas> — public/geo/br-mun.json (~2 MB, carregado só quando este
 * componente monta) + public/data/municipios-br.json (ordem dos arrays de `MunicipiosNacionalSnapshot`).
 *
 * Desempenho:
 *  - `Path2D` de cada município criado UMA vez por sessão (cache por objeto de geometria), com caixas
 *    envolventes (parser próprio, sem regex) e uma grade espacial para o hit-test (isPointInPath só nos
 *    candidatos da célula).
 *  - Três camadas: preenchimentos (redesenhados a cada atualização de dados, em lotes por cor), divisas
 *    (municípios + contorno das UFs; só mudam com zoom, tamanho ou tema) e destaque (hover/seleção).
 *  - devicePixelRatio (até 2). Zoom/pan pelo `useMapZoom` (transform CSS durante o gesto, redesenho nítido ao soltar).
 *  - Troca de dados com fade de cor (cópia do quadro anterior esmaecendo), respeitando movimento reduzido.
 *  - Tempos medidos em `data-prep-ms`, `data-fill-ms` e `data-borda-ms` no contêiner (e `console.debug('[medida] …')`).
 *
 * Cores: as mesmas escalas do mapa por UF (mapModes.valorMunBr), resolvidas dos tokens do tema (nunca hex).
 * Interação: hover mostra o município (nome, UF, placar); clique navega; no toque, 1º toque mostra e o 2º abre.
 * Zoom: Ctrl/⌘ + roda ou pinça, duplo clique, botões +/−/enquadrar, teclado `+ − 0` e setas. Busca por nome.
 */
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { MunicipiosNacionalSnapshot, Race, UF } from '@/shared/types';
import type { GeoBrasilMunicipios, MunicipiosBr } from '@/shared/dataset';
import { REGIAO_NOMES, UF_NOMES, UF_REGIAO } from '@/shared/constants';
import { fmtInt, fmtPct, fmtPP } from '@/shared/format';
import { useGeoBrMunicipios, useMunicipiosBrOrdem } from '@/app/data/estatico';
import { cn } from '@/app/lib/cn';
import { corSlot, FILL_PENDENTE } from '@/app/lib/raceUi';
import { resolveFill, rgbCss, tokenCss, useTokenColors, type TokenColors } from '@/app/lib/tokens';
import { Icon } from '@/app/ui/Icon';
import { Combobox, type ComboOption } from '@/app/ui/SearchBox';
import { parseViewBox, useGeo, type ViewBox } from './geo';
import { useMapZoom, type View } from './MapZoom';
import { useClickOutside, useElementSize, prefersReducedMotion } from './MapHooks';
import { MAP_MODES, pctsMunBr, rotuloApurado, valorMunBr, type MapMode } from './mapModes';

// =============================================================================================
// Preparo da geometria (uma vez por sessão)
// =============================================================================================

const CELULA = 20; // unidades do viewBox por célula da grade de hit-test

export interface PrepMunicipios {
  n: number;
  vb: ViewBox;
  paths: (Path2D | null)[];
  /** minx, miny, maxx, maxy por município (unidades do viewBox) */
  bbox: Float32Array;
  grade: number[][];
  cols: number;
  rows: number;
  /** todos os municípios num path só (divisas) */
  divisas: Path2D;
  /** contornos das UFs */
  ufs: Path2D;
  ms: number;
}

const cachePrep = new WeakMap<GeoBrasilMunicipios, WeakMap<MunicipiosBr, PrepMunicipios>>();

/** Caixa envolvente de um path com comandos M/m/L/l/H/h/V/v/Z (parser por código de caractere, sem regex). */
function bboxDe(d: string, out: Float32Array, o: number): void {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = 77; // 'M'
  let tem = false;
  let px = 0;
  const n = d.length;
  let i = 0;
  while (i < n) {
    const c = d.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
      cmd = c;
      tem = false;
      if (c === 90 || c === 122) {
        x = sx;
        y = sy;
      }
      i++;
      continue;
    }
    if (c === 32 || c === 44 || c === 10 || c === 13 || c === 9) {
      i++;
      continue;
    }
    // número: sinal, inteiro, fração (um segundo '.' começa outro número)
    let sinal = 1;
    if (c === 45) {
      sinal = -1;
      i++;
    } else if (c === 43) i++;
    let v = 0;
    while (i < n) {
      const ch = d.charCodeAt(i);
      if (ch < 48 || ch > 57) break;
      v = v * 10 + (ch - 48);
      i++;
    }
    if (i < n && d.charCodeAt(i) === 46) {
      i++;
      let f = 0.1;
      while (i < n) {
        const ch = d.charCodeAt(i);
        if (ch < 48 || ch > 57) break;
        v += (ch - 48) * f;
        f *= 0.1;
        i++;
      }
    }
    v *= sinal;
    if (cmd === 72) x = v; // H
    else if (cmd === 104) x += v; // h
    else if (cmd === 86) y = v; // V
    else if (cmd === 118) y += v; // v
    else if (!tem) {
      px = v;
      tem = true;
      continue;
    } else {
      tem = false;
      if (cmd === 77) {
        x = px;
        y = v;
        sx = x;
        sy = y;
        cmd = 76;
      } else if (cmd === 109) {
        x += px;
        y += v;
        sx = x;
        sy = y;
        cmd = 108;
      } else if (cmd === 76) {
        x = px;
        y = v;
      } else {
        x += px;
        y += v;
      }
    }
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  out[o] = minx;
  out[o + 1] = miny;
  out[o + 2] = maxx;
  out[o + 3] = maxy;
}

export function prepararMunicipios(geo: GeoBrasilMunicipios, ordem: MunicipiosBr): PrepMunicipios {
  let porOrdem = cachePrep.get(geo);
  const salvo = porOrdem?.get(ordem);
  if (salvo) return salvo;
  const t0 = performance.now();
  const vb = parseViewBox(geo.viewBox);
  const n = ordem.ordem.length;
  const paths: (Path2D | null)[] = new Array(n).fill(null);
  const bbox = new Float32Array(n * 4);
  const cols = Math.ceil(vb.w / CELULA) + 1;
  const rows = Math.ceil(vb.h / CELULA) + 1;
  const grade: number[][] = Array.from({ length: cols * rows }, () => []);
  const divisas = new Path2D();
  for (let i = 0; i < n; i++) {
    const d = geo.municipios[ordem.ordem[i]];
    if (!d) {
      bbox[i * 4] = Infinity;
      continue;
    }
    const p = new Path2D(d);
    paths[i] = p;
    divisas.addPath(p);
    bboxDe(d, bbox, i * 4);
    const c0 = Math.max(0, Math.floor((bbox[i * 4] - vb.x) / CELULA));
    const c1 = Math.min(cols - 1, Math.floor((bbox[i * 4 + 2] - vb.x) / CELULA));
    const r0 = Math.max(0, Math.floor((bbox[i * 4 + 1] - vb.y) / CELULA));
    const r1 = Math.min(rows - 1, Math.floor((bbox[i * 4 + 3] - vb.y) / CELULA));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grade[r * cols + c].push(i);
  }
  const ufs = new Path2D(Object.values(geo.ufs).join(' '));
  const prep: PrepMunicipios = { n, vb, paths, bbox, grade, cols, rows, divisas, ufs, ms: performance.now() - t0 };
  if (!porOrdem) {
    porOrdem = new WeakMap();
    cachePrep.set(geo, porOrdem);
  }
  porOrdem.set(ordem, prep);
  return prep;
}

let ctxHit: CanvasRenderingContext2D | null = null;
function hitCtx(): CanvasRenderingContext2D | null {
  if (!ctxHit && typeof document !== 'undefined') ctxHit = document.createElement('canvas').getContext('2d');
  return ctxHit;
}

/** Município sob o ponto (unidades do viewBox) ou -1. */
export function municipioEm(prep: PrepMunicipios, u: number, v: number): number {
  const c = Math.floor((u - prep.vb.x) / CELULA);
  const r = Math.floor((v - prep.vb.y) / CELULA);
  if (c < 0 || r < 0 || c >= prep.cols || r >= prep.rows) return -1;
  const ctx = hitCtx();
  const lista = prep.grade[r * prep.cols + c];
  for (const i of lista) {
    const o = i * 4;
    if (u < prep.bbox[o] || u > prep.bbox[o + 2] || v < prep.bbox[o + 1] || v > prep.bbox[o + 3]) continue;
    const p = prep.paths[i];
    if (p && ctx?.isPointInPath(p, u, v)) return i;
  }
  return -1;
}

// =============================================================================================
// Componente
// =============================================================================================

export interface MunicipioSelecionado {
  uf: UF;
  cod: string;
  ibge: string;
  nome: string;
}

export interface BrazilMunicipiosMapProps {
  /** Snapshot nacional por município (ausente = tudo pendente enquanto carrega). */
  snapshot: MunicipiosNacionalSnapshot | undefined;
  race: Pick<Race, 'candidatos'>;
  modo?: MapMode;
  /** Snapshot do 1º turno (modo 'variacao'). */
  primeiroTurno?: MunicipiosNacionalSnapshot | null;
  /** UFs da disputa (governador: só a UF); fora delas o município fica neutro. Padrão: todas. */
  ufsEscopo?: readonly UF[];
  onSelect?: (m: MunicipioSelecionado) => void;
  /** Texto do botão do tooltip no toque. */
  rotuloAcao?: (m: MunicipioSelecionado) => string;
  /** Altura máxima (px). Padrão: proporcional à largura. */
  alturaMax?: number;
  /** Sem tooltip/busca/controles (Modo TV). */
  estatico?: boolean;
  /** Busca por município (padrão sim, se não estático). */
  busca?: boolean;
  /** Recebe os tempos medidos (ms). */
  onMedida?: (m: { preparo: number; preenchimento: number; divisas: number }) => void;
  ariaLabel?: string;
  className?: string;
}

interface Tip {
  i: number;
  x: number;
  y: number;
  fixo: boolean;
}

const DUR_FADE = 360;

export const BrazilMunicipiosMap = memo(function BrazilMunicipiosMap({
  snapshot,
  race,
  modo = 'vencedor',
  primeiroTurno,
  ufsEscopo,
  onSelect,
  rotuloAcao,
  alturaMax,
  estatico,
  busca = true,
  onMedida,
  ariaLabel,
  className,
}: BrazilMunicipiosMapProps) {
  const uid = useId().replace(/:/g, '');
  const geoQ = useGeoBrMunicipios(true);
  const ordemQ = useMunicipiosBrOrdem(true);
  const geo = geoQ.data;
  const ordem = ordemQ.data;
  const tokens = useTokenColors();
  const [boxRef, size, boxEl] = useElementSize<HTMLDivElement>();
  const W = Math.round(size.w);
  const vbBase = useMemo(() => parseViewBox(geo?.viewBox ?? '0 0 996 1000'), [geo]);
  const H = W > 0 ? Math.round(Math.min((W * vbBase.h) / vbBase.w, alturaMax ?? Infinity)) : 0;
  const esc = W > 0 ? Math.min(W / vbBase.w, H / vbBase.h) : 1;
  const ox = (W - vbBase.w * esc) / 2 - vbBase.x * esc;
  const oy = (H - vbBase.h * esc) / 2 - vbBase.y * esc;
  const zoom = useMapZoom({ w: W, h: H, maxK: 28 });
  const view = zoom.view;
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;

  // ---------------------------------------------------------------- preparo (depois de pintar o esqueleto)
  const [prep, setPrep] = useState<PrepMunicipios | null>(() => (geo && ordem ? (cachePrep.get(geo)?.get(ordem) ?? null) : null));
  useEffect(() => {
    if (!geo || !ordem) return;
    const salvo = cachePrep.get(geo)?.get(ordem);
    if (salvo) {
      setPrep(salvo);
      return;
    }
    let vivo = true;
    // Dois quadros: deixa o esqueleto aparecer antes do trabalho pesado.
    const id = requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (!vivo) return;
        setPrep(prepararMunicipios(geo, ordem));
      }, 0),
    );
    return () => {
      vivo = false;
      cancelAnimationFrame(id);
    };
  }, [geo, ordem]);

  // ---------------------------------------------------------------- escopo e preenchimentos (em lotes por cor)
  const escopo = useMemo(() => {
    if (!ordem || !ufsEscopo) return null;
    const set = new Set<string>(ufsEscopo);
    return ordem.uf.map((u) => set.has(u));
  }, [ordem, ufsEscopo]);

  /** Chave de preenchimento de cada município ('hachura', 'fora' ou o CSS do token) e quantas cores distintas. */
  const chaves = useMemo(() => {
    if (!prep) return null;
    const out: string[] = new Array(prep.n).fill('');
    const ok = snapshot && snapshot.lider.length === prep.n;
    const ctx = { race, t1: primeiroTurno && primeiroTurno.lider.length === prep.n ? primeiroTurno : null };
    for (let i = 0; i < prep.n; i++) {
      if (!prep.paths[i]) continue;
      if (escopo && !escopo[i]) out[i] = 'fora';
      else if (!ok) out[i] = 'hachura';
      else {
        const v = valorMunBr(modo, snapshot!, i, ctx);
        out[i] = v.pendente ? 'hachura' : v.fill;
      }
    }
    return out;
  }, [prep, snapshot, modo, race, primeiroTurno, escopo]);

  // ---------------------------------------------------------------- desenho
  const cvFill = useRef<HTMLCanvasElement>(null);
  const cvFade = useRef<HTMLCanvasElement>(null);
  const cvBorda = useRef<HTMLCanvasElement>(null);
  const cvDest = useRef<HTMLCanvasElement>(null);
  const ultimoSnap = useRef<MunicipiosNacionalSnapshot | undefined>(undefined);
  const medidas = useRef({ preparo: 0, preenchimento: 0, divisas: 0 });

  const matriz = useCallback(
    (ctx: CanvasRenderingContext2D, v: View) => {
      const k = v.k * esc;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (v.x + v.k * ox), dpr * (v.y + v.k * oy));
      return k; // px de tela por unidade do viewBox
    },
    [dpr, esc, ox, oy],
  );

  // Preenchimentos: dados, modo, tema, vista, tamanho.
  // Com a mesma vista e o mesmo tema, uma atualização de dados repinta SÓ os municípios que mudaram de cor (as bordas
  // antisserrilhadas ficam sob o filete das divisas). Zoom, tamanho, tema ou troca de modo → redesenho completo.
  const desenhado = useRef<{ chave: string; cores: string[] } | null>(null);
  useLayoutEffect(() => {
    const cv = cvFill.current;
    if (!cv || !prep || !chaves || !tokens || W <= 0) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const chaveVista = `${W}x${H}@${dpr}|${view.k},${view.x},${view.y}|${JSON.stringify(tokens.surface)}|${JSON.stringify(tokens.pending)}`;
    const anterior = desenhado.current;
    const mesmaVista = !!anterior && anterior.chave === chaveVista && anterior.cores.length === chaves.length;
    const dadosNovos = !!ultimoSnap.current && ultimoSnap.current !== snapshot;
    ultimoSnap.current = snapshot;
    // Fade: o quadro anterior por cima, esmaecendo (só quando chegam dados novos — não no zoom, tema ou modo).
    const fade = cvFade.current;
    const t0 = performance.now();
    const mudados: number[] = [];
    if (mesmaVista) for (let i = 0; i < chaves.length; i++) if (chaves[i] !== anterior!.cores[i]) mudados.push(i);
    if (mesmaVista && mudados.length === 0) return;
    // Muita coisa mudou (troca de modo): redesenho completo, sem restos de cor nas bordas.
    const incremental = mesmaVista && mudados.length <= chaves.length * 0.3;
    if (incremental && dadosNovos && fade && !prefersReducedMotion()) {
      const fctx = fade.getContext('2d');
      if (fctx) {
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.clearRect(0, 0, fade.width, fade.height);
        fctx.drawImage(cv, 0, 0);
        fade.style.transition = 'none';
        fade.style.opacity = '1';
        void fade.offsetWidth;
        fade.style.transition = `opacity ${DUR_FADE}ms ease-out`;
        fade.style.opacity = '0';
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!incremental) ctx.clearRect(0, 0, cv.width, cv.height);
    const k = matriz(ctx, view);
    const resolvidas = new Map<string, string | CanvasPattern>();
    const estilo = (chave: string) => {
      let c = resolvidas.get(chave);
      if (!c) {
        c =
          chave === 'hachura'
            ? (padraoHachura(ctx, tokens, dpr * k) ?? rgbCss(resolveFill(FILL_PENDENTE, tokens)))
            : rgbCss(resolveFill(chave === 'fora' ? tokenCss('surface-3', 0.55) : chave, tokens));
        resolvidas.set(chave, c);
      }
      return c;
    };
    // Em lotes por cor (menos trocas de estado do contexto).
    const lotes = new Map<string, number[]>();
    const lista = incremental ? mudados : chaves.map((_, i) => i);
    for (const i of lista) {
      const c = chaves[i];
      if (!c) continue;
      const l = lotes.get(c);
      if (l) l.push(i);
      else lotes.set(c, [i]);
    }
    for (const [chave, idx] of lotes) {
      ctx.fillStyle = estilo(chave);
      for (const i of idx) ctx.fill(prep.paths[i]!);
    }
    desenhado.current = { chave: chaveVista, cores: chaves };
    const ms = performance.now() - t0;
    medidas.current.preenchimento = ms;
    medidas.current.preparo = prep.ms;
    boxEl?.setAttribute('data-fill-ms', ms.toFixed(1));
    boxEl?.setAttribute('data-fill-modo', incremental ? `incremental:${mudados.length}` : 'completo');
    boxEl?.setAttribute('data-prep-ms', prep.ms.toFixed(1));
    // Até o próximo quadro (inclui a rasterização que o navegador fizer na thread principal).
    const raf = requestAnimationFrame(() => {
      const q = performance.now() - t0;
      boxEl?.setAttribute('data-quadro-ms', q.toFixed(1));
      console.debug(
        `[medida] mapa municípios: ${incremental ? `${mudados.length} mudaram` : 'completo'} · comandos ${ms.toFixed(1)} ms · até o quadro ${q.toFixed(1)} ms (${lotes.size} cores)`,
      );
    });
    onMedida?.({ ...medidas.current });
    return () => cancelAnimationFrame(raf);
  }, [prep, chaves, tokens, W, H, dpr, view, matriz, boxEl, onMedida, snapshot]);

  // Divisas (municípios + UFs): vista, tamanho, tema.
  useLayoutEffect(() => {
    const cv = cvBorda.current;
    if (!cv || !prep || !tokens || W <= 0) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const t0 = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const k = matriz(ctx, view);
    ctx.lineJoin = 'round';
    // Divisas municipais: filete da cor da superfície, mais visível quanto maior o município na tela.
    const alfa = Math.max(0.18, Math.min(0.75, (k - 0.25) / 1.6));
    ctx.strokeStyle = rgbCss(tokens.surface, alfa);
    ctx.lineWidth = (k > 1.2 ? 0.7 : 0.45) / k;
    ctx.stroke(prep.divisas);
    // Contorno das UFs por cima.
    ctx.strokeStyle = rgbCss(tokens.surface, 0.95);
    ctx.lineWidth = 2.4 / k;
    ctx.stroke(prep.ufs);
    ctx.strokeStyle = rgbCss(tokens.fg, 0.42);
    ctx.lineWidth = 0.9 / k;
    ctx.stroke(prep.ufs);
    const ms = performance.now() - t0;
    medidas.current.divisas = ms;
    boxEl?.setAttribute('data-borda-ms', ms.toFixed(1));
  }, [prep, tokens, W, H, dpr, view, matriz, boxEl]);

  // ---------------------------------------------------------------- hover / toque / busca
  const [tip, setTip] = useState<Tip | null>(null);
  const [selBusca, setSelBusca] = useState<number | null>(null);
  const ultimoPonteiro = useRef<{ tipo: string; t: number }>({ tipo: 'mouse', t: 0 });
  const cliqueTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(cliqueTimer.current), []);
  useClickOutside(boxEl, !!tip?.fixo, () => setTip(null));

  // Destaque (contorno do município sob o ponteiro e do buscado).
  useLayoutEffect(() => {
    const cv = cvDest.current;
    if (!cv || !prep || !tokens || W <= 0) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const k = matriz(ctx, view);
    ctx.lineJoin = 'round';
    const contorno = (i: number, largura: number) => {
      const p = prep.paths[i];
      if (!p) return;
      ctx.strokeStyle = rgbCss(tokens.bg, 0.9);
      ctx.lineWidth = (largura + 2) / k;
      ctx.stroke(p);
      ctx.strokeStyle = rgbCss(tokens.fg);
      ctx.lineWidth = largura / k;
      ctx.stroke(p);
    };
    if (selBusca !== null && selBusca !== tip?.i) contorno(selBusca, 2);
    if (tip) contorno(tip.i, tip.fixo ? 2.25 : 1.75);
  }, [prep, tokens, W, H, dpr, view, matriz, tip, selBusca]);

  const paraConteudo = (px: number, py: number) => ({ u: ((px - view.x) / view.k - ox) / esc, v: ((py - view.y) / view.k - oy) / esc });
  const paraTela = (i: number) => {
    if (!prep) return { x: 0, y: 0 };
    const o = i * 4;
    const u = (prep.bbox[o] + prep.bbox[o + 2]) / 2;
    const v = prep.bbox[o + 1];
    return { x: view.x + view.k * (ox + esc * u), y: view.y + view.k * (oy + esc * v) };
  };
  const posRel = (e: { clientX: number; clientY: number }) => {
    const r = boxEl!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const municipioDe = (i: number): MunicipioSelecionado | null =>
    ordem && i >= 0 ? { uf: ordem.uf[i] as UF, cod: ordem.cod[i], ibge: ordem.ordem[i], nome: ordem.nome[i] } : null;

  function onPointerDown(e: PointerEvent) {
    ultimoPonteiro.current = { tipo: e.pointerType, t: performance.now() };
    zoom.handlers.onPointerDown(e);
  }
  function onPointerMove(e: PointerEvent) {
    zoom.handlers.onPointerMove(e);
    if (estatico || e.pointerType === 'touch' || !prep || e.buttons) return;
    const p = posRel(e);
    const { u, v } = paraConteudo(p.x, p.y);
    const i = municipioEm(prep, u, v);
    if (i >= 0 && !(escopo && !escopo[i])) setTip({ i, ...p, fixo: false });
    else if (tip && !tip.fixo) setTip(null);
  }
  function onPointerLeave() {
    if (tip && !tip.fixo) setTip(null);
  }
  function onClick(e: MouseEvent) {
    if (estatico || !prep || zoom.arrastou()) return;
    const p = posRel(e);
    const { u, v } = paraConteudo(p.x, p.y);
    const i = municipioEm(prep, u, v);
    const toque = ultimoPonteiro.current.tipo !== 'mouse' && performance.now() - ultimoPonteiro.current.t < 1500;
    if (i < 0 || (escopo && !escopo[i])) {
      if (toque) setTip(null);
      return;
    }
    const m = municipioDe(i);
    if (toque) {
      if (tip?.fixo && tip.i === i && m) onSelect?.(m);
      else setTip({ i, ...paraTela(i), fixo: true });
      return;
    }
    // Mouse: espera um instante para não confundir com o duplo clique (que amplia).
    if (m && onSelect) {
      window.clearTimeout(cliqueTimer.current);
      cliqueTimer.current = window.setTimeout(() => onSelect(m), 260);
    }
  }
  function onDoubleClick(e: MouseEvent) {
    window.clearTimeout(cliqueTimer.current);
    zoom.handlers.onDoubleClick(e);
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === '+' || e.key === '=') zoom.zoomPor(1.6);
    else if (e.key === '-' || e.key === '_') zoom.zoomPor(1 / 1.6);
    else if (e.key === '0') zoom.resetar();
    else if (e.key === 'Escape') {
      setTip(null);
      setSelBusca(null);
    } else if (e.key.startsWith('Arrow') && view.k > 1.001) {
      const d = 60;
      zoom.moverPor(e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0, e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0);
    } else if (e.key === 'Enter' && tip) {
      const m = municipioDe(tip.i);
      if (m) onSelect?.(m);
    } else return;
    e.preventDefault();
  }

  // Ao mudar a vista, o tooltip fixo acompanha o município.
  useEffect(() => {
    setTip((t) => (t && t.fixo ? { ...t, ...paraTela(t.i) } : t && !t.fixo ? null : t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, W]);

  // Busca
  const [buscando, setBuscando] = useState(false);
  const opcoes: ComboOption[] = useMemo(() => {
    if (!ordem || !buscando) return [];
    const lista: ComboOption[] = [];
    for (let i = 0; i < ordem.ordem.length; i++) {
      if (escopo && !escopo[i]) continue;
      lista.push({ value: String(i), label: ordem.nome[i], hint: ordem.uf[i], keywords: `${ordem.uf[i]} ${UF_NOMES[ordem.uf[i] as UF] ?? ''}` });
    }
    return lista;
  }, [ordem, buscando, escopo]);
  const buscaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (buscando) buscaRef.current?.querySelector('input')?.focus();
  }, [buscando]);
  function escolher(o: ComboOption) {
    const i = Number(o.value);
    if (!prep || !Number.isFinite(i)) return;
    setBuscando(false);
    setSelBusca(i);
    const b = i * 4;
    const caixa = {
      x: ox + esc * prep.bbox[b],
      y: oy + esc * prep.bbox[b + 1],
      w: esc * (prep.bbox[b + 2] - prep.bbox[b]),
      h: esc * (prep.bbox[b + 3] - prep.bbox[b + 1]),
    };
    zoom.enquadrar(caixa, 14);
    // depois da animação, fixa o tooltip no município
    window.setTimeout(() => setTip({ i, ...paraTelaCom(i, caixa), fixo: true }), 380);
  }
  // posição na tela após enquadrar (mesma conta do useMapZoom.enquadrar)
  const paraTelaCom = (i: number, b: { x: number; y: number; w: number; h: number }) => {
    const k = Math.min(14, Math.max(1, Math.min(W / (b.w * 2.2 || 1), H / (b.h * 2.2 || 1))));
    const x = Math.min(0, Math.max(W - W * k, W / 2 - k * (b.x + b.w / 2)));
    const y = Math.min(0, Math.max(H - H * k, H / 2 - k * (b.y + b.h / 2)));
    if (!prep) return { x: 0, y: 0 };
    const o = i * 4;
    return { x: x + k * (ox + esc * ((prep.bbox[o] + prep.bbox[o + 2]) / 2)), y: y + k * (oy + esc * prep.bbox[o + 1]) };
  };

  // ---------------------------------------------------------------- render
  const carregando = !prep || W <= 0;
  const erro = geoQ.isError || ordemQ.isError;
  const modoInfo = MAP_MODES.find((m) => m.id === modo);
  const tipM = tip ? municipioDe(tip.i) : null;
  const liderados = snapshot?.municipiosLiderados;
  const resumoSr = liderados
    ? race.candidatos
        .filter((c) => !c.agregado)
        .map((c, i) => `${c.nomeUrna} à frente em ${fmtInt(liderados[i] ?? 0)} municípios`)
        .join('; ')
    : '';

  return (
    <div ref={boxRef} className={cn('relative w-full select-none', className)} data-mapa-municipios="">
      <p id={`${uid}-dica`} className="sr-only">
        {`Mapa com ${fmtInt(ordem?.ordem.length ?? 5571)} municípios, modo ${modoInfo?.label ?? modo}. ${resumoSr}. `}
        Use a busca para encontrar um município; mais e menos ampliam, zero volta ao Brasil inteiro.
      </p>
      {erro ? (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-surface-2 px-6 text-center text-[14px] text-fg-muted">
          <Icon name="alerta" size={22} />
          Não foi possível carregar o mapa dos municípios.
          <button
            type="button"
            onClick={() => {
              void geoQ.refetch();
              void ordemQ.refetch();
            }}
            className="mt-1 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-brand-fg hover:bg-surface-3"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl" style={{ height: H || undefined, aspectRatio: H ? undefined : `${vbBase.w} / ${vbBase.h}` }}>
          {carregando ? <EsqueletoMunicipios baixando={!geo || !ordem} /> : null}
          <div
            ref={zoom.containerRef}
            tabIndex={estatico ? -1 : 0}
            role={estatico ? 'img' : 'application'}
            aria-roledescription="mapa"
            aria-label={ariaLabel ?? `Mapa do Brasil por município — ${modoInfo?.label ?? modo}`}
            aria-describedby={`${uid}-dica`}
            className={cn(
              'absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand [-webkit-tap-highlight-color:transparent]',
              carregando && 'invisible',
              view.k > 1.001 ? 'cursor-grab touch-none active:cursor-grabbing' : 'touch-pan-y',
              !estatico && view.k <= 1.001 && 'cursor-pointer',
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={zoom.handlers.onPointerUp}
            onPointerCancel={zoom.handlers.onPointerCancel}
            onPointerLeave={onPointerLeave}
            onDoubleClick={estatico ? undefined : onDoubleClick}
            onClick={onClick}
            onKeyDown={estatico ? undefined : onKeyDown}
          >
            <div ref={zoom.stageRef} className="absolute inset-0 origin-top-left">
              {(['fill', 'fade', 'borda', 'dest'] as const).map((c) => (
                <canvas
                  key={c}
                  ref={c === 'fill' ? cvFill : c === 'fade' ? cvFade : c === 'borda' ? cvBorda : cvDest}
                  width={Math.max(1, Math.round(W * dpr))}
                  height={Math.max(1, Math.round(H * dpr))}
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0"
                  style={{ width: W, height: H, opacity: c === 'fade' ? 0 : undefined }}
                />
              ))}
            </div>
          </div>

          {zoom.dica && !estatico ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg/40">
              <span className="glass rounded-full border border-line px-3 py-1.5 text-[12.5px] text-fg">{zoom.dica}</span>
            </div>
          ) : null}

          {!estatico && !carregando ? (
            <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1.5">
              {busca ? (
                <BotaoMapa label="Buscar município" ativo={buscando} onClick={() => setBuscando((b) => !b)}>
                  <Icon name="busca" size={17} />
                </BotaoMapa>
              ) : null}
              <BotaoMapa label="Ampliar" onClick={() => zoom.zoomPor(1.8)} disabled={view.k >= 27.9}>
                <Icon name="mais" size={17} />
              </BotaoMapa>
              <BotaoMapa label="Reduzir" onClick={() => zoom.zoomPor(1 / 1.8)} disabled={view.k <= 1.001}>
                <Icon name="menos" size={17} />
              </BotaoMapa>
              {view.k > 1.001 ? (
                <BotaoMapa
                  label="Ver o Brasil inteiro"
                  onClick={() => {
                    zoom.resetar();
                    setSelBusca(null);
                  }}
                >
                  <Icon name="reset" size={17} />
                </BotaoMapa>
              ) : null}
            </div>
          ) : null}

          {buscando && !estatico ? (
            <div ref={buscaRef} className="absolute inset-x-2 top-2 z-20 sm:left-auto sm:right-2 sm:w-[300px]">
              <div className="glass rounded-2xl border border-line p-1.5 shadow-card">
                <Combobox
                  options={opcoes}
                  onSelect={escolher}
                  placeholder="Buscar município…"
                  ariaLabel="Buscar município no mapa"
                  maxResults={40}
                  openOnFocus={false}
                  emptyText="Nenhum município com esse nome"
                />
              </div>
            </div>
          ) : null}

          {tip && tipM && !estatico && !(tip.fixo && W < 520) ? (
            <TooltipMunicipio
              m={tipM}
              i={tip.i}
              snapshot={snapshot}
              race={race}
              x={tip.x}
              y={tip.y}
              limites={{ w: W, h: H }}
              fixo={tip.fixo}
              onFechar={() => setTip(null)}
              acao={onSelect ? { label: rotuloAcao?.(tipM) ?? `Ver ${tipM.nome}`, onClick: () => onSelect(tipM) } : undefined}
            />
          ) : null}
        </div>
      )}
      {/* Celular: o tooltip fixo fica encaixado abaixo do mapa (não cobre os municípios). */}
      {tip && tipM && tip.fixo && W < 520 && !estatico ? (
        <TooltipMunicipio
          m={tipM}
          i={tip.i}
          snapshot={snapshot}
          race={race}
          x={0}
          y={0}
          limites={{ w: W, h: H }}
          fixo
          encaixado
          onFechar={() => setTip(null)}
          acao={onSelect ? { label: rotuloAcao?.(tipM) ?? `Ver ${tipM.nome}`, onClick: () => onSelect(tipM) } : undefined}
        />
      ) : null}
    </div>
  );
});

function BotaoMapa({ label, onClick, disabled, ativo, children }: { label: string; onClick: () => void; disabled?: boolean; ativo?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={ativo}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'glass flex h-9 w-9 items-center justify-center rounded-xl border border-line text-fg shadow-card transition-colors hover:bg-surface-3 disabled:opacity-40',
        ativo && 'border-brand/50 bg-brand/15',
      )}
    >
      {children}
    </button>
  );
}

// =============================================================================================
// Hachura (território sem seções apuradas) — padrão do canvas em px de tela
// =============================================================================================

const cachePadrao = new WeakMap<TokenColors, Map<string, CanvasPattern | null>>();

function padraoHachura(ctx: CanvasRenderingContext2D, tk: TokenColors, pxPorUnidade: number): CanvasPattern | null {
  let porTema = cachePadrao.get(tk);
  if (!porTema) {
    porTema = new Map();
    cachePadrao.set(tk, porTema);
  }
  const dprCanvas = Math.min(2, window.devicePixelRatio || 1);
  const chave = String(dprCanvas);
  let pat = porTema.get(chave);
  if (pat === undefined) {
    const s = Math.round(6 * dprCanvas);
    const tile = document.createElement('canvas');
    tile.width = s;
    tile.height = s;
    const t = tile.getContext('2d');
    if (t) {
      t.fillStyle = rgbCss(tk.pending);
      t.fillRect(0, 0, s, s);
      t.strokeStyle = rgbCss(tk.fg, 0.09);
      t.lineWidth = 1.3 * dprCanvas;
      t.beginPath();
      // diagonais contínuas entre ladrilhos
      for (const o of [-s, 0, s]) {
        t.moveTo(o, s);
        t.lineTo(o + s, 0);
      }
      t.stroke();
    }
    pat = ctx.createPattern(tile, 'repeat');
    porTema.set(chave, pat);
  }
  // O padrão segue o espaço do usuário (viewBox): escala inversa para ficar fixo em px de tela.
  pat?.setTransform(new DOMMatrix([1 / pxPorUnidade, 0, 0, 1 / pxPorUnidade, 0, 0]));
  return pat ?? null;
}

// =============================================================================================
// Esqueleto (enquanto baixa ~2 MB de geometria): silhueta das UFs com brilho
// =============================================================================================

function EsqueletoMunicipios({ baixando }: { baixando: boolean }) {
  const { data: br } = useGeo();
  const uid = useId().replace(/:/g, '');
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-busy="true" aria-live="polite">
      {br ? (
        <svg viewBox={br.viewBox} className="h-full w-auto max-w-full" aria-hidden>
          <defs>
            <linearGradient id={`${uid}-brilho`} x1="0" x2="996" y1="0" y2="420" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'rgb(var(--surface-3))' }} />
              <stop offset="0.4" style={{ stopColor: 'rgb(var(--surface-3))' }} />
              <stop offset="0.5" style={{ stopColor: 'rgb(var(--brand) / 0.35)' }} />
              <stop offset="0.6" style={{ stopColor: 'rgb(var(--surface-3))' }} />
              <stop offset="1" style={{ stopColor: 'rgb(var(--surface-3))' }} />
              <animateTransform attributeName="gradientTransform" type="translate" from="-996 0" to="996 0" dur="1.8s" repeatCount="indefinite" />
            </linearGradient>
          </defs>
          <g style={{ fill: `url(#${uid}-brilho)`, stroke: 'rgb(var(--surface))', strokeWidth: 1.6 }}>
            {Object.entries(br.ufs).map(([uf, f]) => (
              <path key={uf} d={f.d} />
            ))}
          </g>
        </svg>
      ) : (
        <div className="h-[70%] w-[70%] animate-pulse rounded-[40%] bg-surface-2" />
      )}
      <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
        <motion.span
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[12.5px] font-medium text-fg"
        >
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand/30 border-t-brand" aria-hidden />
          {baixando ? 'Carregando os 5.571 municípios…' : 'Desenhando o mapa…'}
        </motion.span>
      </div>
    </div>
  );
}

// =============================================================================================
// Tooltip do município (placar do snapshot nacional: só percentuais)
// =============================================================================================

function TooltipMunicipio({
  m,
  i,
  snapshot,
  race,
  x,
  y,
  limites,
  fixo,
  encaixado,
  acao,
  onFechar,
}: {
  m: MunicipioSelecionado;
  i: number;
  snapshot: MunicipiosNacionalSnapshot | undefined;
  race: Pick<Race, 'candidatos'>;
  x: number;
  y: number;
  limites: { w: number; h: number };
  fixo?: boolean;
  encaixado?: boolean;
  acao?: { label: string; onClick: () => void };
  onFechar?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [alt, setAlt] = useState(150);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight;
    if (h && Math.abs(h - alt) > 1) setAlt(h);
  });
  const w = Math.min(248, limites.w - 16);
  const left = Math.max(8, Math.min(limites.w - w - 8, x - w / 2));
  let top = y - 14 - alt;
  if (top < 8) top = y + 14;
  if (top + alt > limites.h - 8) top = Math.max(8, limites.h - alt - 8);

  const ok = !!snapshot && i < snapshot.lider.length;
  const apurado = ok ? snapshot!.apurado[i] / 10 : 0;
  const pcts = ok ? pctsMunBr(snapshot!, i, race.candidatos.length) : null;
  const lider = ok ? snapshot!.lider[i] : -1;
  const encerrada = apurado >= 100;
  const regiao = REGIAO_NOMES[UF_REGIAO[m.uf]];

  return (
    <motion.div
      ref={ref}
      role={fixo ? 'dialog' : 'tooltip'}
      aria-label={fixo ? m.nome : undefined}
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className={cn(
        'z-20 rounded-2xl border border-line p-3 text-left',
        encaixado ? 'relative mt-3 w-full bg-surface-2' : 'absolute bg-surface/95 shadow-card backdrop-blur-md',
        fixo ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      style={encaixado ? undefined : { left, top, width: w }}
    >
      <div className={cn('flex items-start justify-between gap-3', fixo && onFechar && 'pr-7')}>
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-semibold leading-tight text-fg">{m.nome}</p>
          {/* Quebra em vez de cortar ("Mato Grosso do Sul · Centro-Oeste" ao lado do selo de % apurado). */}
          <p className="mt-0.5 text-pretty text-[11.5px] leading-snug text-fg-subtle">
            {UF_NOMES[m.uf]} · {regiao}
          </p>
        </div>
        <span
          className={cn(
            'num mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
            encerrada ? 'bg-fg/10 text-fg' : apurado > 0 ? 'bg-brand/15 text-brand-fg' : 'bg-pending/60 text-fg-muted',
          )}
        >
          {encerrada ? 'Encerrada' : apurado > 0 ? `${rotuloApurado(apurado)} apurado` : 'Aguardando'}
        </span>
      </div>
      {pcts ? (
        <ul className="mt-2.5 space-y-1.5">
          {race.candidatos.map((c, k) => {
            const pct = pcts[k] ?? 0;
            const s = corSlot(c.cor);
            const lid = lider === k;
            return (
              <li key={c.numero}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className={cn('h-[3px] w-3 shrink-0 rounded-full', s.bg)} />
                    <span className={cn('truncate text-[12.5px]', lid ? 'font-medium text-fg' : 'text-fg-muted')}>{c.nomeUrna}</span>
                  </span>
                  <span className={cn('num text-[14px] font-semibold', lid ? 'text-fg' : 'text-fg-muted')}>{fmtPct(pct)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className={cn('h-full rounded-full', s.bg)} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2.5 text-[12.5px] text-fg-muted">{apurado > 0 ? 'Sem votos válidos nas seções apuradas.' : 'Nenhuma seção totalizada ainda.'}</p>
      )}
      {pcts && lider >= 0 && lider <= 1 ? (
        <p className="num mt-2.5 border-t border-line pt-2 text-[11.5px] text-fg-muted">
          Vantagem de <span className="font-semibold text-fg">{fmtPP(snapshot!.margem[i] / 10).replace(/^\+/, '')}</span>
          {snapshot!.comparecimento[i] > 0 ? <> · comparecimento {fmtPct(snapshot!.comparecimento[i] / 10, 1)}</> : null}
        </p>
      ) : pcts && lider === 2 ? (
        <p className="mt-2.5 border-t border-line pt-2 text-[11.5px] text-fg-muted">Empate</p>
      ) : null}
      {fixo && onFechar ? (
        <button
          type="button"
          aria-label="Fechar"
          onClick={onFechar}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <Icon name="fechar" size={16} />
        </button>
      ) : null}
      {fixo && acao ? (
        <button
          type="button"
          onClick={acao.onClick}
          className="mt-2.5 flex h-9 w-full items-center justify-center gap-1 rounded-xl bg-fg text-[13px] font-semibold text-bg transition-opacity hover:opacity-90"
        >
          {acao.label}
          <span aria-hidden>→</span>
        </button>
      ) : null}
    </motion.div>
  );
}
