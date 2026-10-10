/**
 * Decodificador de WebP com perdas (VP8, quadro-chave) + codificador PNG mínimo, em TypeScript puro.
 *
 * Por quê: os pacotes de fotos oficiais do TSE (public/data/fotos/*.json) guardam a maioria dos retratos em WebP
 * (120×160), e o satori/resvg das imagens de compartilhamento só lê JPEG e PNG. Converter WebP → PNG aqui mantém a
 * foto OFICIAL sem edição (os mesmos pixels decodificados, só muda o contêiner) e sem dependência nova.
 *
 * Implementação fiel ao decodificador de referência do RFC 6386 ("dixie", seção 20): leitor booleano, cabeçalhos,
 * modos intra do quadro-chave, tokens DCT com contextos, dequantização, WHT/IDCT, predição intra 16×16/8×8/4×4
 * (com as bordas 127/129 e o "copy down" do canto superior direito) e o filtro de laço (normal e simples), aplicado
 * depois da reconstrução do quadro inteiro (§15: a predição intra usa os pixels ainda não filtrados).
 * Cor: BT.601 com o "fancy upsampling" do croma, como a libwebp (o que os navegadores mostram).
 *
 * Segurança: entrada não confiável — dimensões limitadas, tamanhos de partição conferidos, laços limitados pelo
 * número de macroblocos; qualquer inconsistência → null (nunca lança para fora). Só VP8 com perdas; VP8L (sem perdas)
 * e animação → null (o chamador cai no monograma).
 */
import { codificarPng, type ImagemRgb } from './png';
import { AC_Q, COEF_DEFAULT, COEF_UPDATE, DC_Q, KF_BMODE } from './webp-tabelas';

export { codificarPng, type ImagemRgb };

const MAX_LADO = 2048;

// ---------------------------------------------------------------------------------------------
// Leitor booleano (RFC 6386 §7)
// ---------------------------------------------------------------------------------------------

class LeitorBool {
  private pos: number;
  private readonly fim: number;
  private range = 255;
  private value = 0;
  private bitCount = 0;

  constructor(
    private readonly d: Uint8Array,
    ini: number,
    tam: number,
  ) {
    this.fim = Math.min(d.length, ini + tam);
    if (tam >= 2 && ini + 1 < d.length) {
      this.value = (d[ini] << 8) | d[ini + 1];
      this.pos = ini + 2;
    } else {
      this.pos = this.fim;
    }
  }

  bool(prob: number): number {
    const split = 1 + (((this.range - 1) * prob) >> 8);
    const SPLIT = split << 8;
    let r: number;
    if (this.value >= SPLIT) {
      r = 1;
      this.range -= split;
      this.value -= SPLIT;
    } else {
      r = 0;
      this.range = split;
    }
    while (this.range < 128) {
      this.value <<= 1;
      this.range <<= 1;
      if (++this.bitCount === 8) {
        this.bitCount = 0;
        if (this.pos < this.fim) this.value |= this.d[this.pos++];
      }
    }
    return r;
  }

  bit(): number {
    return this.bool(128);
  }

  uint(n: number): number {
    let z = 0;
    for (let b = n - 1; b >= 0; b--) z |= this.bit() << b;
    return z;
  }

  int(n: number): number {
    const z = this.uint(n);
    return this.bit() ? -z : z;
  }

  talvezInt(n: number): number {
    return this.bit() ? this.int(n) : 0;
  }

  /** Lê um símbolo pela árvore `t` (folhas ≤ 0) com as probabilidades `p[off + i/2]`. */
  arvore(t: readonly number[], p: ArrayLike<number>, off = 0): number {
    let i = 0;
    while ((i = t[i + this.bool(p[off + (i >> 1)])]) > 0);
    return -i;
  }
}

// ---------------------------------------------------------------------------------------------
// Modos, árvores e constantes
// ---------------------------------------------------------------------------------------------

const DC_PRED = 0;
const V_PRED = 1;
const H_PRED = 2;
const TM_PRED = 3;
const B_PRED = 4;

const B_DC = 0;
const B_TM = 1;
const B_VE = 2;
const B_HE = 3;
const B_LD = 4;
const B_RD = 5;
const B_VR = 6;
const B_VL = 7;
const B_HD = 8;
const B_HU = 9;

const KF_Y_TREE = [-B_PRED, 2, 4, 6, -DC_PRED, -V_PRED, -H_PRED, -TM_PRED];
const KF_Y_PROBS = [145, 156, 163, 128];
const UV_TREE = [-DC_PRED, 2, -V_PRED, 4, -H_PRED, -TM_PRED];
const KF_UV_PROBS = [142, 114, 183];
const B_TREE = [-B_DC, 2, -B_TM, 4, -B_VE, 6, 8, 12, -B_HE, 10, -B_RD, -B_VR, -B_LD, 14, -B_VL, 16, -B_HD, -B_HU];
/** Submodo 4×4 implícito de um macrobloco 16×16 (contexto dos vizinhos). */
const IMPLICITO = [B_DC, B_VE, B_HE, B_TM];

const ZIGZAG = [0, 1, 4, 8, 5, 2, 3, 6, 9, 12, 13, 10, 7, 11, 14, 15];
const BANDA_X = [0, 1, 2, 3, 6, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 7].map((b) => b * 33);
const CTX_ESQ = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8];
const CTX_ACIMA = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 4, 5, 4, 5, 6, 7, 6, 7, 8];
/** Bits extras das categorias de tokens (bit mais significativo primeiro) e o valor mínimo de cada uma. */
const PCAT = [[159], [165, 145], [173, 148, 140], [176, 155, 140, 135], [180, 157, 141, 134, 130], [254, 254, 243, 230, 196, 177, 153, 140, 133, 130, 129]];
const CAT_MIN = [5, 7, 11, 19, 35, 67];

const s16 = (x: number) => (x << 16) >> 16;
const clamp255 = (x: number) => (x < 0 ? 0 : x > 255 ? 255 : x);
const clampQ = (q: number) => (q < 0 ? 0 : q > 127 ? 127 : q);

// ---------------------------------------------------------------------------------------------
// Tokens DCT (porte de decode_mb_tokens do dixie)
// ---------------------------------------------------------------------------------------------

interface Fatores {
  y1: [number, number];
  uv: [number, number];
  y2: [number, number];
}

/**
 * Lê os coeficientes de um bloco (já dequantizados, em ordem natural) e devolve se houve dado não nulo e a posição
 * final (para a máscara de "eob").
 */
function lerBloco(br: LeitorBool, probs: Uint8Array, tipo: number, ctx: number, out: Int16Array, off: number, dc: number, ac: number): number {
  const tp = tipo * 264;
  let c = tipo === 0 ? 1 : 0;
  let p = tp + ctx * 11 + BANDA_X[c];
  if (!br.bool(probs[p])) return c; // EOB logo de cara
  for (;;) {
    if (!br.bool(probs[p + 1])) {
      // token ZERO: próxima posição sem checar EOB
      if (c >= 15) return c;
      c++;
      p = tp + BANDA_X[c];
      continue;
    }
    let v: number;
    let proxCtx: number;
    if (!br.bool(probs[p + 2])) {
      v = 1;
      proxCtx = 1;
    } else {
      proxCtx = 2;
      if (!br.bool(probs[p + 3])) {
        if (!br.bool(probs[p + 4])) v = 2;
        else v = br.bool(probs[p + 5]) ? 4 : 3;
      } else {
        let cat: number;
        if (!br.bool(probs[p + 6])) cat = br.bool(probs[p + 7]) ? 1 : 0;
        else if (!br.bool(probs[p + 8])) cat = br.bool(probs[p + 9]) ? 3 : 2;
        else cat = br.bool(probs[p + 10]) ? 5 : 4;
        let x = 0;
        for (const pr of PCAT[cat]) x = x + x + br.bool(pr);
        v = CAT_MIN[cat] + x;
      }
    }
    if (br.bit()) v = -v;
    out[off + ZIGZAG[c]] = s16(v * (c > 0 ? ac : dc));
    if (c >= 15) return c;
    c++;
    p = tp + proxCtx * 11 + BANDA_X[c];
    if (!br.bool(probs[p])) return c; // EOB
  }
}

/** Todos os blocos de um macrobloco; devolve a "eob mask" (≠ 0 se houve algum coeficiente). */
function lerMacrobloco(br: LeitorBool, esq: Int32Array, acima: Int32Array, ao: number, coefs: Int16Array, temY2: boolean, probs: Uint8Array, f: Fatores): number {
  let mascara = 0;
  const bloco = (i: number, tipo: number, dc: number, ac: number) => {
    const ctx = esq[CTX_ESQ[i]] + acima[ao + CTX_ACIMA[i]];
    const c = lerBloco(br, probs, tipo, ctx, coefs, i * 16, dc, ac);
    const inicio = tipo === 0 ? 1 : 0;
    const t = c !== inicio ? 1 : 0;
    if (c > 1) mascara |= 1 << i;
    if (t) mascara |= 1 << 30;
    esq[CTX_ESQ[i]] = t;
    acima[ao + CTX_ACIMA[i]] = t;
  };
  if (temY2) {
    bloco(24, 1, f.y2[0], f.y2[1]);
    for (let i = 0; i < 16; i++) bloco(i, 0, f.y1[0], f.y1[1]);
  } else {
    for (let i = 0; i < 16; i++) bloco(i, 3, f.y1[0], f.y1[1]);
  }
  for (let i = 16; i < 24; i++) bloco(i, 2, f.uv[0], f.uv[1]);
  return mascara;
}

// ---------------------------------------------------------------------------------------------
// Transformadas (idct_add.c)
// ---------------------------------------------------------------------------------------------

function walsh(inp: Int16Array, off: number, out: Int16Array): void {
  const t = new Int32Array(16);
  for (let i = 0; i < 4; i++) {
    const a1 = inp[off + i] + inp[off + 12 + i];
    const b1 = inp[off + 4 + i] + inp[off + 8 + i];
    const c1 = inp[off + 4 + i] - inp[off + 8 + i];
    const d1 = inp[off + i] - inp[off + 12 + i];
    t[i] = s16(a1 + b1);
    t[4 + i] = s16(c1 + d1);
    t[8 + i] = s16(a1 - b1);
    t[12 + i] = s16(d1 - c1);
  }
  for (let i = 0; i < 4; i++) {
    const a1 = t[i * 4] + t[i * 4 + 3];
    const b1 = t[i * 4 + 1] + t[i * 4 + 2];
    const c1 = t[i * 4 + 1] - t[i * 4 + 2];
    const d1 = t[i * 4] - t[i * 4 + 3];
    out[i * 4] = s16((a1 + b1 + 3) >> 3);
    out[i * 4 + 1] = s16((c1 + d1 + 3) >> 3);
    out[i * 4 + 2] = s16((a1 - b1 + 3) >> 3);
    out[i * 4 + 3] = s16((d1 - c1 + 3) >> 3);
  }
}

const C1 = 20091; // cos(π/8)·√2 − 1, Q16
const S1 = 35468; // sin(π/8)·√2, Q16
const tmpIdct = new Int32Array(16);

/** IDCT 4×4 somada à predição (in place em `px`, a partir de `pos`, passo `stride`). */
function idctSoma(coefs: Int16Array, off: number, px: Uint8Array, pos: number, stride: number): void {
  const t = tmpIdct;
  for (let i = 0; i < 4; i++) {
    const i0 = coefs[off + i];
    const i4 = coefs[off + 4 + i];
    const i8 = coefs[off + 8 + i];
    const i12 = coefs[off + 12 + i];
    const a1 = i0 + i8;
    const b1 = i0 - i8;
    let temp1 = (i4 * S1) >> 16;
    let temp2 = i12 + ((i12 * C1) >> 16);
    const c1 = temp1 - temp2;
    temp1 = i4 + ((i4 * C1) >> 16);
    temp2 = (i12 * S1) >> 16;
    const d1 = temp1 + temp2;
    t[i] = s16(a1 + d1);
    t[12 + i] = s16(a1 - d1);
    t[4 + i] = s16(b1 + c1);
    t[8 + i] = s16(b1 - c1);
  }
  for (let i = 0; i < 4; i++) {
    const k = i * 4;
    const a1 = t[k] + t[k + 2];
    const b1 = t[k] - t[k + 2];
    let temp1 = (t[k + 1] * S1) >> 16;
    let temp2 = t[k + 3] + ((t[k + 3] * C1) >> 16);
    const c1 = temp1 - temp2;
    temp1 = t[k + 1] + ((t[k + 1] * C1) >> 16);
    temp2 = (t[k + 3] * S1) >> 16;
    const d1 = temp1 + temp2;
    const r = pos + i * stride;
    px[r] = clamp255(px[r] + ((a1 + d1 + 4) >> 3));
    px[r + 3] = clamp255(px[r + 3] + ((a1 - d1 + 4) >> 3));
    px[r + 1] = clamp255(px[r + 1] + ((b1 + c1 + 4) >> 3));
    px[r + 2] = clamp255(px[r + 2] + ((b1 - c1 + 4) >> 3));
  }
}

// ---------------------------------------------------------------------------------------------
// Predição intra (predict.c) — in place no plano com borda
// ---------------------------------------------------------------------------------------------

function predH(px: Uint8Array, pos: number, s: number, n: number) {
  for (let i = 0; i < n; i++) px.fill(px[pos + i * s - 1], pos + i * s, pos + i * s + n);
}

function predV(px: Uint8Array, pos: number, s: number, n: number) {
  for (let i = 0; i < n; i++) px.copyWithin(pos + i * s, pos - s, pos - s + n);
}

function predTm(px: Uint8Array, pos: number, s: number, n: number) {
  const p = px[pos - s - 1];
  for (let j = 0; j < n; j++) {
    const l = px[pos + j * s - 1];
    for (let i = 0; i < n; i++) px[pos + j * s + i] = clamp255(l + px[pos - s + i] - p);
  }
}

function predDc(px: Uint8Array, pos: number, s: number, n: number) {
  let dc = 0;
  for (let i = 0; i < n; i++) dc += px[pos + i * s - 1] + px[pos - s + i];
  const sh = n === 16 ? 5 : n === 8 ? 4 : 3;
  dc = (dc + (n >> 0)) >> sh;
  for (let i = 0; i < n; i++) px.fill(dc, pos + i * s, pos + i * s + n);
}

/** Submodos 4×4 (predict_*_4x4). `A(k)` = acima (k = −1…7), `L(k)` = esquerda (k = 0…3). */
function pred4(px: Uint8Array, pos: number, s: number, modo: number) {
  const A = (k: number) => px[pos - s + k];
  const L = (k: number) => px[pos + k * s - 1];
  const P = (x: number, y: number, v: number) => (px[pos + y * s + x] = v);
  const m3 = (a: number, b: number, c: number) => (a + 2 * b + c + 2) >> 2;
  const m2 = (a: number, b: number) => (a + b + 1) >> 1;
  switch (modo) {
    case B_DC:
      predDc(px, pos, s, 4);
      return;
    case B_TM:
      predTm(px, pos, s, 4);
      return;
    case B_VE: {
      const v = [m3(A(-1), A(0), A(1)), m3(A(0), A(1), A(2)), m3(A(1), A(2), A(3)), m3(A(2), A(3), A(4))];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) P(x, y, v[x]);
      return;
    }
    case B_HE: {
      const v = [m3(A(-1), L(0), L(1)), m3(L(0), L(1), L(2)), m3(L(1), L(2), L(3)), m3(L(2), L(3), L(3))];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) P(x, y, v[y]);
      return;
    }
    case B_LD: {
      const p = [m3(A(0), A(1), A(2)), m3(A(1), A(2), A(3)), m3(A(2), A(3), A(4)), m3(A(3), A(4), A(5)), m3(A(4), A(5), A(6)), m3(A(5), A(6), A(7)), m3(A(6), A(7), A(7))];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) P(x, y, p[x + y]);
      return;
    }
    case B_RD: {
      // diagonal de baixo-esquerda para cima-direita: e[0..6] = L3, L2, L1, L0, A-1, A0 … A3 suavizados
      const e = [L(3), L(2), L(1), L(0), A(-1), A(0), A(1), A(2), A(3)];
      const d = (k: number) => m3(e[k], e[k + 1], e[k + 2]);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) P(x, y, d(3 - y + x));
      return;
    }
    case B_VR: {
      P(0, 0, m2(A(-1), A(0)));
      P(1, 0, m2(A(0), A(1)));
      P(2, 0, m2(A(1), A(2)));
      P(3, 0, m2(A(2), A(3)));
      P(0, 1, m3(L(0), A(-1), A(0)));
      P(1, 1, m3(A(-1), A(0), A(1)));
      P(2, 1, m3(A(0), A(1), A(2)));
      P(3, 1, m3(A(1), A(2), A(3)));
      P(0, 2, m3(L(1), L(0), A(-1)));
      P(1, 2, m2(A(-1), A(0)));
      P(2, 2, m2(A(0), A(1)));
      P(3, 2, m2(A(1), A(2)));
      P(0, 3, m3(L(2), L(1), L(0)));
      P(1, 3, m3(L(0), A(-1), A(0)));
      P(2, 3, m3(A(-1), A(0), A(1)));
      P(3, 3, m3(A(0), A(1), A(2)));
      return;
    }
    case B_VL: {
      P(0, 0, m2(A(0), A(1)));
      P(1, 0, m2(A(1), A(2)));
      P(2, 0, m2(A(2), A(3)));
      P(3, 0, m2(A(3), A(4)));
      P(0, 1, m3(A(0), A(1), A(2)));
      P(1, 1, m3(A(1), A(2), A(3)));
      P(2, 1, m3(A(2), A(3), A(4)));
      P(3, 1, m3(A(3), A(4), A(5)));
      P(0, 2, m2(A(1), A(2)));
      P(1, 2, m2(A(2), A(3)));
      P(2, 2, m2(A(3), A(4)));
      P(3, 2, m3(A(4), A(5), A(6)));
      P(0, 3, m3(A(1), A(2), A(3)));
      P(1, 3, m3(A(2), A(3), A(4)));
      P(2, 3, m3(A(3), A(4), A(5)));
      P(3, 3, m3(A(5), A(6), A(7)));
      return;
    }
    case B_HD: {
      P(0, 0, m2(L(0), A(-1)));
      P(1, 0, m3(L(0), A(-1), A(0)));
      P(2, 0, m3(A(-1), A(0), A(1)));
      P(3, 0, m3(A(0), A(1), A(2)));
      P(0, 1, m2(L(1), L(0)));
      P(1, 1, m3(L(1), L(0), A(-1)));
      P(2, 1, m2(L(0), A(-1)));
      P(3, 1, m3(L(0), A(-1), A(0)));
      P(0, 2, m2(L(2), L(1)));
      P(1, 2, m3(L(2), L(1), L(0)));
      P(2, 2, m2(L(1), L(0)));
      P(3, 2, m3(L(1), L(0), A(-1)));
      P(0, 3, m2(L(3), L(2)));
      P(1, 3, m3(L(3), L(2), L(1)));
      P(2, 3, m2(L(2), L(1)));
      P(3, 3, m3(L(2), L(1), L(0)));
      return;
    }
    case B_HU: {
      P(0, 0, m2(L(0), L(1)));
      P(1, 0, m3(L(0), L(1), L(2)));
      P(2, 0, m2(L(1), L(2)));
      P(3, 0, m3(L(1), L(2), L(3)));
      P(0, 1, m2(L(1), L(2)));
      P(1, 1, m3(L(1), L(2), L(3)));
      P(2, 1, m2(L(2), L(3)));
      P(3, 1, m3(L(2), L(3), L(3)));
      P(0, 2, m2(L(2), L(3)));
      P(1, 2, m3(L(2), L(3), L(3)));
      P(2, 2, L(3));
      P(3, 2, L(3));
      P(0, 3, L(3));
      P(1, 3, L(3));
      P(2, 3, L(3));
      P(3, 3, L(3));
      return;
    }
    default:
      throw new Error('submodo inválido');
  }
}

function pred16(px: Uint8Array, pos: number, s: number, n: number, modo: number) {
  if (modo === DC_PRED) predDc(px, pos, s, n);
  else if (modo === V_PRED) predV(px, pos, s, n);
  else if (modo === H_PRED) predH(px, pos, s, n);
  else if (modo === TM_PRED) predTm(px, pos, s, n);
  else throw new Error('modo inválido');
}

/** Bordas fora do quadro (fixup_left/fixup_above do dixie): 129 à esquerda, 127 acima; DC usa só o lado disponível. */
function bordaEsquerda(px: Uint8Array, pos: number, s: number, n: number, linha: number, modo: number) {
  if (modo === DC_PRED && linha) {
    for (let i = 0; i < n; i++) px[pos + i * s - 1] = px[pos - s + i];
  } else {
    for (let i = -1; i < n; i++) px[pos + i * s - 1] = 129;
  }
}

function bordaAcima(px: Uint8Array, pos: number, s: number, n: number, coluna: number, modo: number) {
  if (modo === DC_PRED && coluna) {
    for (let i = 0; i < n; i++) px[pos - s + i] = px[pos + i * s - 1];
  } else {
    px.fill(127, pos - s - 1, pos - s + n);
  }
  px.fill(127, pos - s + n, pos - s + n + 4);
}

// ---------------------------------------------------------------------------------------------
// Filtro de laço (dixie_loopfilter.c)
// ---------------------------------------------------------------------------------------------

const abs = (x: number) => (x < 0 ? -x : x);
const s8 = (x: number) => (x < -128 ? -128 : x > 127 ? 127 : x);

function limiarSimples(px: Uint8Array, i: number, st: number, lim: number): boolean {
  return abs(px[i - st] - px[i]) * 2 + (abs(px[i - 2 * st] - px[i + st]) >> 1) <= lim;
}

function limiarNormal(px: Uint8Array, i: number, st: number, E: number, I: number): boolean {
  const p3 = px[i - 4 * st];
  const p2 = px[i - 3 * st];
  const p1 = px[i - 2 * st];
  const p0 = px[i - st];
  const q0 = px[i];
  const q1 = px[i + st];
  const q2 = px[i + 2 * st];
  const q3 = px[i + 3 * st];
  return (
    abs(p0 - q0) * 2 + (abs(p1 - q1) >> 1) <= 2 * E + I &&
    abs(p3 - p2) <= I &&
    abs(p2 - p1) <= I &&
    abs(p1 - p0) <= I &&
    abs(q3 - q2) <= I &&
    abs(q2 - q1) <= I &&
    abs(q1 - q0) <= I
  );
}

const hev = (px: Uint8Array, i: number, st: number, t: number) => abs(px[i - 2 * st] - px[i - st]) > t || abs(px[i + st] - px[i]) > t;

function filtroComum(px: Uint8Array, i: number, st: number, externos: boolean) {
  const p1 = px[i - 2 * st];
  const p0 = px[i - st];
  const q0 = px[i];
  const q1 = px[i + st];
  let a = 3 * (q0 - p0);
  if (externos) a += s8(p1 - q1);
  a = s8(a);
  const f1 = (a + 4 > 127 ? 127 : a + 4) >> 3;
  const f2 = (a + 3 > 127 ? 127 : a + 3) >> 3;
  px[i - st] = clamp255(p0 + f2);
  px[i] = clamp255(q0 - f1);
  if (!externos) {
    const b = (f1 + 1) >> 1;
    px[i - 2 * st] = clamp255(p1 + b);
    px[i + st] = clamp255(q1 - b);
  }
}

function filtroBordaMb(px: Uint8Array, i: number, st: number) {
  const p2 = px[i - 3 * st];
  const p1 = px[i - 2 * st];
  const p0 = px[i - st];
  const q0 = px[i];
  const q1 = px[i + st];
  const q2 = px[i + 2 * st];
  const w = s8(s8(p1 - q1) + 3 * (q0 - p0));
  let a = (27 * w + 63) >> 7;
  px[i - st] = clamp255(p0 + a);
  px[i] = clamp255(q0 - a);
  a = (18 * w + 63) >> 7;
  px[i - 2 * st] = clamp255(p1 + a);
  px[i + st] = clamp255(q1 - a);
  a = (9 * w + 63) >> 7;
  px[i - 3 * st] = clamp255(p2 + a);
  px[i + 2 * st] = clamp255(q2 - a);
}

/** Uma borda de `n` pixels: `ao` = passo ao longo da borda; `st` = passo através dela. */
function bordaMb(px: Uint8Array, i: number, ao: number, st: number, n: number, E: number, I: number, t: number) {
  for (let k = 0; k < n; k++, i += ao) {
    if (!limiarNormal(px, i, st, E, I)) continue;
    if (hev(px, i, st, t)) filtroComum(px, i, st, true);
    else filtroBordaMb(px, i, st);
  }
}

function bordaSub(px: Uint8Array, i: number, ao: number, st: number, n: number, E: number, I: number, t: number) {
  for (let k = 0; k < n; k++, i += ao) {
    if (limiarNormal(px, i, st, E, I)) filtroComum(px, i, st, hev(px, i, st, t));
  }
}

function bordaSimples(px: Uint8Array, i: number, ao: number, st: number, lim: number) {
  for (let k = 0; k < 16; k++, i += ao) if (limiarSimples(px, i, st, lim)) filtroComum(px, i, st, true);
}

// ---------------------------------------------------------------------------------------------
// Quadro VP8
// ---------------------------------------------------------------------------------------------

interface Segmentacao {
  ativa: boolean;
  atualizaMapa: boolean;
  absoluto: boolean;
  quant: number[];
  filtro: number[];
  probs: number[];
}

/** Decodifica um quadro-chave VP8 (dados do chunk "VP8 "). Lança em erro (quem chama converte em null). */
function decodificarVp8(d: Uint8Array): ImagemRgb {
  if (d.length < 10) throw new Error('VP8 curto');
  const raw = d[0] | (d[1] << 8) | (d[2] << 16);
  if (raw & 1) throw new Error('não é quadro-chave');
  const part0 = (raw >>> 5) & 0x7ffff;
  if (d[3] !== 0x9d || d[4] !== 0x01 || d[5] !== 0x2a) throw new Error('assinatura VP8');
  const w = (d[6] | (d[7] << 8)) & 0x3fff;
  const h = (d[8] | (d[9] << 8)) & 0x3fff;
  if (!w || !h || w > MAX_LADO || h > MAX_LADO) throw new Error('dimensões');
  if (10 + part0 > d.length) throw new Error('partição 0');
  const br = new LeitorBool(d, 10, part0);
  br.uint(2); // espaço de cor e tipo de clamping (sempre limitamos a 0–255)

  // segmentação
  const seg: Segmentacao = { ativa: false, atualizaMapa: false, absoluto: false, quant: [0, 0, 0, 0], filtro: [0, 0, 0, 0], probs: [255, 255, 255] };
  seg.ativa = !!br.bit();
  if (seg.ativa) {
    seg.atualizaMapa = !!br.bit();
    const atualizaDados = br.bit();
    if (atualizaDados) {
      seg.absoluto = !!br.bit();
      for (let i = 0; i < 4; i++) seg.quant[i] = br.talvezInt(7);
      for (let i = 0; i < 4; i++) seg.filtro[i] = br.talvezInt(6);
    }
    if (seg.atualizaMapa) for (let i = 0; i < 3; i++) seg.probs[i] = br.bit() ? br.uint(8) : 255;
  }

  // filtro de laço
  const simples = !!br.bit();
  const nivel = br.uint(6);
  const nitidez = br.uint(3);
  const deltaRef = [0, 0, 0, 0];
  const deltaModo = [0, 0, 0, 0];
  if (br.bit() && br.bit()) {
    for (let i = 0; i < 4; i++) deltaRef[i] = br.talvezInt(6);
    for (let i = 0; i < 4; i++) deltaModo[i] = br.talvezInt(6);
  }

  // partições de tokens
  const nPart = 1 << br.uint(2);
  let pos = 10 + part0;
  let resto = d.length - pos;
  if (resto < 3 * (nPart - 1)) throw new Error('tamanhos de partição');
  resto -= 3 * (nPart - 1);
  const tamanhos: number[] = [];
  for (let i = 0; i < nPart; i++) {
    let t: number;
    if (i < nPart - 1) {
      t = d[pos + i * 3] | (d[pos + i * 3 + 1] << 8) | (d[pos + i * 3 + 2] << 16);
    } else t = resto;
    if (t > resto) throw new Error('partição truncada');
    resto -= t;
    tamanhos.push(t);
  }
  pos += 3 * (nPart - 1);
  const parts: LeitorBool[] = [];
  for (let i = 0; i < nPart; i++) {
    parts.push(new LeitorBool(d, pos, tamanhos[i]));
    pos += tamanhos[i];
  }

  // quantização
  const qIdx = br.uint(7);
  const y1dc = br.talvezInt(4);
  const y2dc = br.talvezInt(4);
  const y2ac = br.talvezInt(4);
  const uvdc = br.talvezInt(4);
  const uvac = br.talvezInt(4);
  br.bit(); // refresh_entropy_probs (irrelevante num quadro isolado)

  // probabilidades dos coeficientes
  const probs = Uint8Array.from(COEF_DEFAULT);
  for (let i = 0; i < 1056; i++) if (br.bool(COEF_UPDATE[i])) probs[i] = br.uint(8);
  const comSkip = !!br.bit();
  const probSkip = comSkip ? br.uint(8) : 0;

  const fatores: Fatores[] = [];
  for (let s = 0; s < (seg.ativa ? 4 : 1); s++) {
    let q = qIdx;
    if (seg.ativa) q = seg.absoluto ? seg.quant[s] : q + seg.quant[s];
    const dcq = (x: number) => DC_Q[clampQ(x)];
    const acq = (x: number) => AC_Q[clampQ(x)];
    let y2a = Math.floor((acq(q + y2ac) * 155) / 100);
    if (y2a < 8) y2a = 8;
    let uvd = dcq(q + uvdc);
    if (uvd > 132) uvd = 132;
    fatores.push({ y1: [dcq(q + y1dc), acq(q)], uv: [uvd, acq(q + uvac)], y2: [dcq(q + y2dc) * 2, y2a] });
  }

  const mbw = (w + 15) >> 4;
  const mbh = (h + 15) >> 4;
  const B = 16;
  const sy = mbw * 16 + 2 * B;
  const suv = mbw * 8 + 2 * B;
  const Y = new Uint8Array(sy * (mbh * 16 + 2 * B));
  const U = new Uint8Array(suv * (mbh * 8 + 2 * B));
  const V = new Uint8Array(suv * (mbh * 8 + 2 * B));
  const oy = (r: number, c: number) => (B + r * 16) * sy + B + c * 16;
  const ouv = (r: number, c: number) => (B + r * 8) * suv + B + c * 8;

  const nMb = mbw * mbh;
  const modoY = new Uint8Array(nMb);
  const segId = new Uint8Array(nMb);
  const mascara = new Int32Array(nMb);
  const bModos = new Uint8Array(nMb * 16); // submodos (implícitos para 16×16), contexto dos vizinhos
  const acimaTok = new Int32Array(mbw * 9);
  const esqTok = new Int32Array(9);
  const coefs = new Int16Array(25 * 16);
  const y2 = new Int16Array(16);

  for (let r = 0; r < mbh; r++) {
    esqTok.fill(0);
    const tok = parts[r & (nPart - 1)];
    for (let c = 0; c < mbw; c++) {
      const m = r * mbw + c;
      // ---- modos (partição 0)
      if (seg.atualizaMapa) segId[m] = br.bool(seg.probs[0]) ? 2 + br.bool(seg.probs[2]) : br.bool(seg.probs[1]);
      const pula = comSkip ? br.bool(probSkip) : 0;
      const ym = br.arvore(KF_Y_TREE, KF_Y_PROBS);
      modoY[m] = ym;
      if (ym === B_PRED) {
        for (let i = 0; i < 16; i++) {
          const a = i < 4 ? (r > 0 ? bModos[(m - mbw) * 16 + i + 12] : B_DC) : bModos[m * 16 + i - 4];
          const l = (i & 3) === 0 ? (c > 0 ? bModos[(m - 1) * 16 + i + 3] : B_DC) : bModos[m * 16 + i - 1];
          bModos[m * 16 + i] = br.arvore(B_TREE, KF_BMODE, (a * 10 + l) * 9);
        }
      } else bModos.fill(IMPLICITO[ym], m * 16, m * 16 + 16);
      const uvm = br.arvore(UV_TREE, KF_UV_PROBS);

      // ---- tokens (partição da linha)
      coefs.fill(0);
      const temY2 = ym !== B_PRED;
      if (pula) {
        esqTok.fill(0, 0, 8);
        acimaTok.fill(0, c * 9, c * 9 + 8);
        if (temY2) {
          esqTok[8] = 0;
          acimaTok[c * 9 + 8] = 0;
        }
        mascara[m] = 0;
      } else {
        mascara[m] = lerMacrobloco(tok, esqTok, acimaTok, c * 9, coefs, temY2, probs, fatores[seg.ativa ? segId[m] : 0]);
      }

      // ---- predição + resíduo
      const py = oy(r, c);
      const pu = ouv(r, c);
      const pv = pu; // U e V têm a mesma geometria
      if (c === 0) {
        bordaEsquerda(Y, py, sy, 16, r, ym);
        bordaEsquerda(U, pu, suv, 8, r, uvm);
        bordaEsquerda(V, pv, suv, 8, r, uvm);
        if (r === 0) Y[py - sy - 1] = 127;
      }
      if (r === 0) {
        bordaAcima(Y, py, sy, 16, c, ym);
        bordaAcima(U, pu, suv, 8, c, uvm);
        bordaAcima(V, pv, suv, 8, c, uvm);
      }
      if (ym === B_PRED) {
        // "copy down": os 4 pixels acima-direita do subbloco 3 servem aos subblocos 7, 11 e 15
        for (let k = 1; k <= 3; k++) Y.copyWithin(py + 16 + (4 * k - 1) * sy, py + 16 - sy, py + 20 - sy);
        for (let i = 0; i < 16; i++) {
          const p = py + (i >> 2) * 4 * sy + (i & 3) * 4;
          pred4(Y, p, sy, bModos[m * 16 + i]);
          idctSoma(coefs, i * 16, Y, p, sy);
        }
      } else {
        pred16(Y, py, sy, 16, ym);
        walsh(coefs, 24 * 16, y2);
        for (let i = 0; i < 16; i++) coefs[i * 16] = y2[i];
        for (let i = 0; i < 16; i++) idctSoma(coefs, i * 16, Y, py + (i >> 2) * 4 * sy + (i & 3) * 4, sy);
      }
      pred16(U, pu, suv, 8, uvm);
      pred16(V, pv, suv, 8, uvm);
      for (let i = 0; i < 4; i++) {
        const o = (i >> 1) * 4 * suv + (i & 1) * 4;
        idctSoma(coefs, (16 + i) * 16, U, pu + o, suv);
        idctSoma(coefs, (20 + i) * 16, V, pv + o, suv);
      }
    }
    // estende a última linha da fileira em 4 pixels (acima-direita do último macrobloco da fileira seguinte)
    const fimLinha = oy(r, mbw) + 15 * sy;
    Y.fill(Y[fimLinha - 1], fimLinha, fimLinha + 4);
  }

  // ---- filtro de laço, depois do quadro inteiro reconstruído
  if (nivel) {
    for (let r = 0; r < mbh; r++) {
      for (let c = 0; c < mbw; c++) {
        const m = r * mbw + c;
        let lvl = nivel;
        if (seg.ativa) lvl = seg.absoluto ? seg.filtro[segId[m]] : lvl + seg.filtro[segId[m]];
        lvl = lvl > 63 ? 63 : lvl < 0 ? 0 : lvl;
        if (deltaRef.some(Boolean) || deltaModo.some(Boolean)) {
          lvl += deltaRef[0];
          if (modoY[m] === B_PRED) lvl += deltaModo[0];
          lvl = lvl > 63 ? 63 : lvl < 0 ? 0 : lvl;
        }
        if (!lvl) continue;
        let I = lvl;
        if (nitidez) {
          I >>= nitidez > 4 ? 2 : 1;
          if (I > 9 - nitidez) I = 9 - nitidez;
        }
        if (I < 1) I = 1;
        const t = (lvl >= 15 ? 1 : 0) + (lvl >= 40 ? 1 : 0);
        const internas = mascara[m] !== 0 || modoY[m] === B_PRED;
        const py = oy(r, c);
        const pu = ouv(r, c);
        if (simples) {
          const mbLim = (lvl + 2) * 2 + I;
          const bLim = lvl * 2 + I;
          if (c) bordaSimples(Y, py, sy, 1, mbLim);
          if (internas) for (const k of [4, 8, 12]) bordaSimples(Y, py + k, sy, 1, bLim);
          if (r) bordaSimples(Y, py, 1, sy, mbLim);
          if (internas) for (const k of [4, 8, 12]) bordaSimples(Y, py + k * sy, 1, sy, bLim);
          continue;
        }
        if (c) {
          bordaMb(Y, py, sy, 1, 16, lvl + 2, I, t);
          bordaMb(U, pu, suv, 1, 8, lvl + 2, I, t);
          bordaMb(V, pu, suv, 1, 8, lvl + 2, I, t);
        }
        if (internas) {
          for (const k of [4, 8, 12]) bordaSub(Y, py + k, sy, 1, 16, lvl, I, t);
          bordaSub(U, pu + 4, suv, 1, 8, lvl, I, t);
          bordaSub(V, pu + 4, suv, 1, 8, lvl, I, t);
        }
        if (r) {
          bordaMb(Y, py, 1, sy, 16, lvl + 2, I, t);
          bordaMb(U, pu, 1, suv, 8, lvl + 2, I, t);
          bordaMb(V, pu, 1, suv, 8, lvl + 2, I, t);
        }
        if (internas) {
          for (const k of [4, 8, 12]) bordaSub(Y, py + k * sy, 1, sy, 16, lvl, I, t);
          bordaSub(U, pu + 4 * suv, 1, suv, 8, lvl, I, t);
          bordaSub(V, pu + 4 * suv, 1, suv, 8, lvl, I, t);
        }
      }
    }
  }

  return { largura: w, altura: h, rgb: yuvParaRgb(Y, U, V, w, h, sy, suv, oy(0, 0), ouv(0, 0)) };
}

// ---------------------------------------------------------------------------------------------
// YUV 4:2:0 → RGB (BT.601, "fancy upsampling" da libwebp)
// ---------------------------------------------------------------------------------------------

const multHi = (v: number, c: number) => (v * c) >> 8;
const clip8 = (v: number) => ((v & ~16383) === 0 ? v >> 6 : v < 0 ? 0 : 255);

function pixel(out: Uint8Array, o: number, y: number, u: number, v: number) {
  out[o] = clip8(multHi(y, 19077) + multHi(v, 26149) - 14234);
  out[o + 1] = clip8(multHi(y, 19077) - multHi(u, 6419) - multHi(v, 13320) + 8708);
  out[o + 2] = clip8(multHi(y, 19077) + multHi(u, 33050) - 17685);
}

/**
 * Um par de linhas de luma (`yTop`, `yBot` ou −1) com as linhas de croma de cima (`ucT`) e do meio (`ucC`) —
 * porte de UpsampleRgbLinePair da libwebp (pesos 9-3-3-1 com os mesmos arredondamentos).
 */
function linhaPar(
  Y: Uint8Array,
  U: Uint8Array,
  V: Uint8Array,
  yTop: number,
  yBot: number,
  ucT: number,
  ucC: number,
  w: number,
  out: Uint8Array,
  oTop: number,
  oBot: number,
) {
  let tlu = U[ucT];
  let tlv = V[ucT];
  let lu = U[ucC];
  let lv = V[ucC];
  pixel(out, oTop, Y[yTop], (3 * tlu + lu + 2) >> 2, (3 * tlv + lv + 2) >> 2);
  if (yBot >= 0) pixel(out, oBot, Y[yBot], (3 * lu + tlu + 2) >> 2, (3 * lv + tlv + 2) >> 2);
  const ultimoPar = (w - 1) >> 1;
  for (let x = 1; x <= ultimoPar; x++) {
    const tu = U[ucT + x];
    const tv = V[ucT + x];
    const cu = U[ucC + x];
    const cv = V[ucC + x];
    const au = tlu + tu + lu + cu + 8;
    const av = tlv + tv + lv + cv + 8;
    const d12u = (au + 2 * (tu + lu)) >> 3;
    const d12v = (av + 2 * (tv + lv)) >> 3;
    const d03u = (au + 2 * (tlu + cu)) >> 3;
    const d03v = (av + 2 * (tlv + cv)) >> 3;
    pixel(out, oTop + (2 * x - 1) * 3, Y[yTop + 2 * x - 1], (d12u + tlu) >> 1, (d12v + tlv) >> 1);
    pixel(out, oTop + 2 * x * 3, Y[yTop + 2 * x], (d03u + tu) >> 1, (d03v + tv) >> 1);
    if (yBot >= 0) {
      pixel(out, oBot + (2 * x - 1) * 3, Y[yBot + 2 * x - 1], (d03u + lu) >> 1, (d03v + lv) >> 1);
      pixel(out, oBot + 2 * x * 3, Y[yBot + 2 * x], (d12u + cu) >> 1, (d12v + cv) >> 1);
    }
    tlu = tu;
    tlv = tv;
    lu = cu;
    lv = cv;
  }
  if (!(w & 1)) {
    pixel(out, oTop + (w - 1) * 3, Y[yTop + w - 1], (3 * tlu + lu + 2) >> 2, (3 * tlv + lv + 2) >> 2);
    if (yBot >= 0) pixel(out, oBot + (w - 1) * 3, Y[yBot + w - 1], (3 * lu + tlu + 2) >> 2, (3 * lv + tlv + 2) >> 2);
  }
}

function yuvParaRgb(Y: Uint8Array, U: Uint8Array, V: Uint8Array, w: number, h: number, sy: number, suv: number, y0: number, uv0: number): Uint8Array {
  const out = new Uint8Array(w * h * 3);
  const ly = (j: number) => y0 + j * sy;
  const lc = (k: number) => uv0 + k * suv;
  // 1ª linha: só a 1ª linha de croma
  linhaPar(Y, U, V, ly(0), -1, lc(0), lc(0), w, out, 0, -1);
  // pares (2k−1, 2k) entre as linhas de croma k−1 e k; altura par → a última linha usa só a última de croma
  for (let k = 1; 2 * k - 1 < h; k++) {
    const top = 2 * k - 1;
    if (2 * k < h) linhaPar(Y, U, V, ly(top), ly(top + 1), lc(k - 1), lc(k), w, out, top * w * 3, (top + 1) * w * 3);
    else linhaPar(Y, U, V, ly(top), -1, lc(k - 1), lc(k - 1), w, out, top * w * 3, -1);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Contêiner RIFF/WebP
// ---------------------------------------------------------------------------------------------

const fourcc = (d: Uint8Array, o: number) => String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]);
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

/** Decodifica um WebP com perdas (RIFF/WEBP com chunk "VP8 "). null se não suportado ou inválido. */
export function decodificarWebp(arq: Uint8Array): ImagemRgb | null {
  try {
    if (arq.length < 20 || fourcc(arq, 0) !== 'RIFF' || fourcc(arq, 8) !== 'WEBP') return null;
    const fimRiff = Math.min(arq.length, 8 + u32(arq, 4));
    let o = 12;
    while (o + 8 <= fimRiff) {
      const tipo = fourcc(arq, o);
      const tam = u32(arq, o + 4);
      const ini = o + 8;
      if (ini + tam > arq.length) return null;
      if (tipo === 'VP8 ') return decodificarVp8(arq.subarray(ini, ini + tam));
      if (tipo === 'VP8L' || tipo === 'ANIM') return null;
      o = ini + tam + (tam & 1);
    }
    return null;
  } catch {
    return null;
  }
}

/** data:image/webp;base64,… → data:image/png;base64,… (mesmos pixels), ou null se não der para decodificar. */
export function webpParaPngDataUri(uri: string): string | null {
  const m = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
  if (!m) return null;
  const img = decodificarWebp(new Uint8Array(Buffer.from(m[1], 'base64')));
  return img ? `data:image/png;base64,${codificarPng(img).toString('base64')}` : null;
}
