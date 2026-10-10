/**
 * Leitura dos paths gerados por svgpath.ts ("M x y l dx dy … z", repetido por anel) de volta para anéis em
 * coordenadas absolutas. Usado nas conferências (área mínima, alinhamento entre camadas), não no app.
 */
type Pt = [number, number];

const NUM = /-?(?:\d+\.?\d*|\.\d+)/g;

/** Anéis (sem repetir o ponto inicial no fim) de um `d` com comandos M (absoluto), l (relativo) e z. */
export function lerPath(d: string): Pt[][] {
  const aneis: Pt[][] = [];
  for (const parte of d.split('M')) {
    if (!parte) continue;
    const [abs, rel = ''] = parte.replace(/z/g, '').split('l');
    const a = abs.match(NUM)!.map(Number);
    const r = (rel.match(NUM) ?? []).map(Number);
    let x = a[0];
    let y = a[1];
    const anel: Pt[] = [[x, y]];
    for (let i = 0; i + 1 < r.length; i += 2) {
      x = Math.round((x + r[i]) * 10) / 10;
      y = Math.round((y + r[i + 1]) * 10) / 10;
      anel.push([x, y]);
    }
    aneis.push(anel);
  }
  return aneis;
}

/** Área (px²) de um path: soma das áreas com sinal dos anéis (exteriores horários, buracos anti-horários). */
export function areaPath(d: string): number {
  let s = 0;
  for (const anel of lerPath(d)) {
    let a = 0;
    for (let i = 0, n = anel.length, j = n - 1; i < n; j = i++) a += anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
    s += a / 2;
  }
  return s;
}

/** Distância de um ponto ao segmento ab. */
export function distSegmento(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
