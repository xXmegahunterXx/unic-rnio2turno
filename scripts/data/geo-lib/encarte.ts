/**
 * Posiciona um encarte (ex.: Fernando de Noronha no mapa de PE) num espaço vazio do viewBox, o mais perto
 * possível da direção real da ilha. Testa retângulos encostados nas quatro bordas; um retângulo é livre se
 * nenhum segmento do mapa cruza a área (com folga) e se ele não está dentro de nenhum polígono.
 */
type Pt = [number, number];

function segmentoCruzaRet(a: Pt, b: Pt, x0: number, y0: number, x1: number, y1: number): boolean {
  // Liang–Barsky
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - x0, x1 - a[0], a[1] - y0, y1 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

function dentroAnel(x: number, y: number, anel: Pt[]): boolean {
  let dentro = false;
  for (let i = 0, n = anel.length, j = n - 1; i < n; j = i++) {
    const a = anel[i];
    const b = anel[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) dentro = !dentro;
  }
  return dentro;
}

export function posicionarEncarte(opts: {
  /** Linhas do mapa (arcos projetados). */
  linhas: Pt[][];
  /** Anéis exteriores do mapa (para saber se o retângulo cairia dentro de um polígono). */
  aneis: Pt[][];
  largura: number;
  altura: number;
  w: number;
  h: number;
  margem: number;
  folga: number;
  /** Posição real (projetada) do que vai no encarte: preferimos o vão mais próximo dela. */
  alvo: Pt;
}): { x: number; y: number } | null {
  const { linhas, aneis, largura, altura, w, h, margem, folga, alvo } = opts;
  if (w + 2 * margem > largura || h + 2 * margem > altura) return null;
  const cand: { x: number; y: number; d: number }[] = [];
  const passo = 4;
  const add = (x: number, y: number) => cand.push({ x, y, d: Math.hypot(x + w / 2 - alvo[0], y + h / 2 - alvo[1]) });
  for (let x = margem; x <= largura - margem - w; x += passo) {
    add(x, margem);
    add(x, altura - margem - h);
  }
  for (let y = margem; y <= altura - margem - h; y += passo) {
    add(margem, y);
    add(largura - margem - w, y);
  }
  cand.sort((a, b) => a.d - b.d);

  const segs: [Pt, Pt][] = [];
  for (const l of linhas) for (let i = 1; i < l.length; i++) segs.push([l[i - 1], l[i]]);

  for (const c of cand) {
    const x0 = c.x - folga;
    const y0 = c.y - folga;
    const x1 = c.x + w + folga;
    const y1 = c.y + h + folga;
    let livre = true;
    for (const [a, b] of segs) {
      if (Math.max(a[0], b[0]) < x0 || Math.min(a[0], b[0]) > x1 || Math.max(a[1], b[1]) < y0 || Math.min(a[1], b[1]) > y1) continue;
      if (segmentoCruzaRet(a, b, x0, y0, x1, y1)) {
        livre = false;
        break;
      }
    }
    if (livre && aneis.some((anel) => dentroAnel(c.x + w / 2, c.y + h / 2, anel))) livre = false;
    if (livre) return { x: c.x, y: c.y };
  }
  return null;
}
