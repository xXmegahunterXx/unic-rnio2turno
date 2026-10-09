/**
 * Matemática determinística do motor.
 *
 * `Math.exp`/`Math.log` não são obrigatoriamente idênticos entre motores JS (V8, SpiderMonkey, JSC): a
 * especificação permite resultados "aproximados". Para que o mesmo cenário produza EXATAMENTE os mesmos
 * números em qualquer máquina (servidor Node, Worker no Chrome, Safari…), o motor usa só operações IEEE-754
 * exatas (+, −, ×, ÷, sqrt, floor, round) e implementa aqui `dexp`/`dlog` com redução de faixa + polinômio
 * (erro ≈ 1 ulp, igual ao fdlibm na prática). Nada aqui depende de Node ou do DOM.
 */

const LN2_HI = 6.93147180369123816490e-1; // 33 bits significativos: k·LN2_HI é exato para |k| < 2^20
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const SQRT2 = 1.4142135623730951;

/** 2^k exato para k ∈ [−1074, 1023], construído só com multiplicações por 2 (exatas). */
const POW2_OFFSET = 1074;
const POW2 = (() => {
  const t = new Float64Array(1074 + 1024);
  t[POW2_OFFSET] = 1;
  for (let k = 1; k <= 1023; k++) t[POW2_OFFSET + k] = t[POW2_OFFSET + k - 1] * 2;
  for (let k = 1; k <= 1074; k++) t[POW2_OFFSET - k] = t[POW2_OFFSET - k + 1] * 0.5;
  return t;
})();

/** Coeficientes 1/n! (n = 2..11) para exp(r), |r| ≤ ln2/2 (erro relativo de truncamento < 7e-15). */
const E2 = 1 / 2, E3 = 1 / 6, E4 = 1 / 24, E5 = 1 / 120, E6 = 1 / 720, E7 = 1 / 5040, E8 = 1 / 40320;
const E9 = 1 / 362880, E10 = 1 / 3628800, E11 = 1 / 39916800;

/** exp(x) determinístico. */
export function dexp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  let p = E10 + r * E11;
  p = E9 + r * p;
  p = E8 + r * p;
  p = E7 + r * p;
  p = E6 + r * p;
  p = E5 + r * p;
  p = E4 + r * p;
  p = E3 + r * p;
  p = E2 + r * p;
  p = 1 + r * p;
  p = 1 + r * p;
  if (k >= -1022) return p * POW2[POW2_OFFSET + k];
  // faixa subnormal: duas etapas para não perder precisão desnecessariamente
  return p * POW2[POW2_OFFSET + k + 60] * POW2[POW2_OFFSET - 60];
}

const dv = new DataView(new ArrayBuffer(8));

/** Coeficientes 2/(2n+1) para log(m) = 2·atanh(s), s = (m−1)/(m+1), |s| ≤ 0,1716. */
const L3 = 1 / 3, L5 = 1 / 5, L7 = 1 / 7, L9 = 1 / 9, L11 = 1 / 11, L13 = 1 / 13, L15 = 1 / 15;
const L17 = 1 / 17, L19 = 1 / 19, L21 = 1 / 21, L23 = 1 / 23, L25 = 1 / 25;

/** log natural determinístico. */
export function dlog(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0;
  if (x < 2.2250738585072014e-308) {
    x *= 18014398509481984; // 2^54
    e = -54;
  }
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0);
  e += ((hi >>> 20) & 0x7ff) - 1023;
  dv.setUint32(0, (hi & 0x000fffff) | 0x3ff00000);
  let m = dv.getFloat64(0); // [1, 2)
  if (m > SQRT2) {
    m *= 0.5;
    e += 1;
  }
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let poly = L23 + s2 * L25;
  poly = L21 + s2 * poly;
  poly = L19 + s2 * poly;
  poly = L17 + s2 * poly;
  poly = L15 + s2 * poly;
  poly = L13 + s2 * poly;
  poly = L11 + s2 * poly;
  poly = L9 + s2 * poly;
  poly = L7 + s2 * poly;
  poly = L5 + s2 * poly;
  poly = L3 + s2 * poly;
  poly = 1 + s2 * poly;
  return e * LN2_HI + (e * LN2_LO + 2 * s * poly);
}

/** Logística 1/(1+e^−x). */
export function sigmoid(x: number): number {
  return 1 / (1 + dexp(-x));
}

/** logit(p) = ln(p/(1−p)), com p limitado a [1e-6, 1 − 1e-6]. */
export function logit(p: number): number {
  const q = p < 1e-6 ? 1e-6 : p > 1 - 1e-6 ? 1 - 1e-6 : p;
  return dlog(q / (1 - q));
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// Inversa da normal padrão (algoritmo de Acklam, erro relativo < 1,2e-9). Na faixa central (95% dos casos)
// usa só uma função racional; nas caudas, dlog + sqrt.
const A1 = -3.969683028665376e1, A2 = 2.209460984245205e2, A3 = -2.759285104469687e2;
const A4 = 1.38357751867269e2, A5 = -3.066479806614716e1, A6 = 2.506628277459239;
const B1 = -5.447609879822406e1, B2 = 1.615858368580409e2, B3 = -1.556989798598866e2;
const B4 = 6.680131188771972e1, B5 = -1.328068155288572e1;
const C1 = -7.784894002430293e-3, C2 = -3.223964580411365e-1, C3 = -2.400758277161838;
const C4 = -2.549732539343734, C5 = 4.374664141464968, C6 = 2.938163982698783;
const D1 = 7.784695709041462e-3, D2 = 3.224671290700398e-1, D3 = 2.445134137142996, D4 = 3.754408661907416;
const P_LOW = 0.02425;
const P_HIGH = 1 - P_LOW;

/** Φ⁻¹(p) para p ∈ (0, 1). */
export function invNorm(p: number): number {
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * dlog(p));
    return (((((C1 * q + C2) * q + C3) * q + C4) * q + C5) * q + C6) / ((((D1 * q + D2) * q + D3) * q + D4) * q + 1);
  }
  if (p <= P_HIGH) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((A1 * r + A2) * r + A3) * r + A4) * r + A5) * r + A6) * q) / (((((B1 * r + B2) * r + B3) * r + B4) * r + B5) * r + 1);
  }
  const q = Math.sqrt(-2 * dlog(1 - p));
  return -(((((C1 * q + C2) * q + C3) * q + C4) * q + C5) * q + C6) / ((((D1 * q + D2) * q + D3) * q + D4) * q + 1);
}

/** Arredonda a `casas` decimais (meio para cima, determinístico). */
export function round(x: number, casas: number): number {
  const f = casas === 2 ? 100 : casas === 3 ? 1000 : casas === 1 ? 10 : 10 ** casas;
  return Math.round(x * f) / f;
}

/**
 * Argsort estável (radix LSD, 2 passadas de 16 bits) para chaves inteiras em [0, 2^32).
 * Empates mantêm a ordem dos índices. O(n), determinístico.
 */
export function radixArgsort(keys: ArrayLike<number>, n = keys.length): Int32Array {
  const a = new Int32Array(n);
  const b = new Int32Array(n);
  const cnt = new Int32Array(65537);
  for (let i = 0; i < n; i++) cnt[(keys[i] & 0xffff) + 1]++;
  for (let d = 1; d <= 65536; d++) cnt[d] += cnt[d - 1];
  for (let i = 0; i < n; i++) b[cnt[keys[i] & 0xffff]++] = i;
  cnt.fill(0);
  for (let i = 0; i < n; i++) cnt[(keys[i] >>> 16) + 1]++;
  for (let d = 1; d <= 65536; d++) cnt[d] += cnt[d - 1];
  for (let j = 0; j < n; j++) {
    const i = b[j];
    a[cnt[keys[i] >>> 16]++] = i;
  }
  return a;
}

/** Primeiro índice j em [0, n) com a[j] > x (a ordenado crescente). = quantidade de elementos ≤ x. */
export function upperBound(a: ArrayLike<number>, x: number, n = a.length): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
