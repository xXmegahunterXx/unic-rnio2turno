/**
 * Codificação compacta de anéis em path SVG com 1 casa decimal.
 *
 * Trabalha em décimos inteiros (sem erro de ponto flutuante): cada anel vira "M x y" absoluto seguido de
 * deltas relativos ("l dx dy ...") e "z". Os deltas são calculados entre coordenadas JÁ arredondadas, então
 * não há deriva: dois polígonos vizinhos que compartilham um arco produzem exatamente os mesmos vértices
 * (sem frestas). Separadores mínimos: "l1.2-3.4.5 6".
 */
type Pt = [number, number];
/** Anel em décimos inteiros. */
export type AnelInt = Pt[];

export function paraDecimos(anel: [number, number][]): AnelInt {
  const out: AnelInt = [];
  for (const [x, y] of anel) {
    const p: Pt = [Math.round(x * 10), Math.round(y * 10)];
    const u = out[out.length - 1];
    if (!u || u[0] !== p[0] || u[1] !== p[1]) out.push(p);
  }
  // remove o fechamento repetido
  while (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
    else break;
  }
  return out;
}

/** Área com sinal (unidades²), em coordenadas de tela (y para baixo): positiva = sentido horário na tela. */
export function areaAssinada(anel: [number, number][]): number {
  let s = 0;
  for (let i = 0, n = anel.length, j = n - 1; i < n; j = i++) {
    s += anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
  }
  return s / 2;
}

function num(t: number): string {
  // t em décimos inteiros
  const neg = t < 0;
  const a = Math.abs(t);
  const int = Math.floor(a / 10);
  const dec = a % 10;
  let s = dec ? `${int === 0 ? '' : int}.${dec}` : `${int}`;
  if (neg) s = `-${s}`;
  return s;
}

/** Concatena números com o menor separador válido no path SVG. */
function juntar(nums: string[]): string {
  let out = '';
  let prev = '';
  for (const s of nums) {
    if (prev && !(s[0] === '-' || (s[0] === '.' && prev.includes('.')))) out += ' ';
    out += s;
    prev = s;
  }
  return out;
}

/**
 * Converte anéis (em décimos inteiros) para o atributo `d`. `exterior[i]` indica se o anel i é exterior:
 * exteriores saem no sentido horário (tela) e buracos no anti-horário, então funciona com `fill-rule`
 * nonzero ou evenodd.
 */
export function aneisParaPath(aneis: AnelInt[], exterior: boolean[]): string {
  let d = '';
  aneis.forEach((anel0, k) => {
    if (anel0.length < 3) return;
    const area = areaAssinada(anel0);
    const anel = (area > 0) === exterior[k] ? anel0 : [...anel0].reverse();
    const [x0, y0] = anel[0];
    const nums: string[] = [];
    for (let i = 1; i < anel.length; i++) {
      nums.push(num(anel[i][0] - anel[i - 1][0]), num(anel[i][1] - anel[i - 1][1]));
    }
    d += `M${juntar([num(x0), num(y0)])}l${juntar(nums)}z`;
  });
  return d;
}
