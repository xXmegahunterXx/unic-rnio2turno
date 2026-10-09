/**
 * Layout do mosaico de seções (puro, testável): blocos por zona em colunas de mesma largura, em ordem
 * (Zona 1, 2, 3…), cada uma na coluna mais baixa (masonry). O tamanho da célula
 * é o maior que faz o mosaico caber na altura-alvo (com mínimo legível).
 */

export interface MosaicBlock {
  /** Índice da zona na lista de entrada. */
  idx: number;
  zona: number;
  n: number;
  /** Canto do bloco (px CSS). A grade começa em y + labelH. */
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
}

export interface MosaicLayout {
  width: number;
  height: number;
  /** Passo da grade (célula + vão), em px inteiros. */
  pitch: number;
  /** Lado da célula pintada. */
  cell: number;
  labelH: number;
  blocks: MosaicBlock[];
}

export interface MosaicLayoutOpts {
  alturaAlvo?: number;
  minPitch?: number;
  maxPitch?: number;
  labelH?: number;
  gapX?: number;
  gapY?: number;
  minBlockW?: number;
}

export function cellDoPitch(p: number): number {
  return p >= 9 ? p - 2 : p - 1;
}

function tentar(zonas: { zona: number; n: number }[], width: number, p: number, c: number, o: Required<MosaicLayoutOpts>) {
  const blockW = Math.floor((width - (c - 1) * o.gapX) / c);
  const cols = Math.max(1, Math.floor((blockW + (p - cellDoPitch(p))) / p));
  const blocks: MosaicBlock[] = [];
  // "Masonry" em ordem: cada zona vai para a coluna mais baixa (empate → a mais à esquerda).
  // Mantém a leitura quase em linhas (Zona 1, 2, 3…) sem o vão das prateleiras.
  const alturas = new Array<number>(c).fill(0);
  for (let i = 0; i < zonas.length; i++) {
    let col = 0;
    for (let j = 1; j < c; j++) if (alturas[j] < alturas[col] - 0.5) col = j;
    const z = zonas[i];
    const rows = Math.max(1, Math.ceil(z.n / cols));
    const h = o.labelH + rows * p;
    blocks.push({ idx: i, zona: z.zona, n: z.n, x: col * (blockW + o.gapX), y: alturas[col], w: blockW, h, cols });
    alturas[col] += h + o.gapY;
  }
  return { blocks, height: Math.max(0, Math.max(...alturas) - o.gapY) };
}

export function layoutMosaico(zonas: { zona: number; n: number }[], width: number, opts: MosaicLayoutOpts = {}): MosaicLayout {
  const o: Required<MosaicLayoutOpts> = {
    alturaAlvo: 720,
    minPitch: 3,
    maxPitch: 22,
    labelH: 18,
    gapX: 14,
    gapY: 10,
    minBlockW: 92,
    ...opts,
  };
  const w = Math.max(40, Math.floor(width));
  const total = zonas.reduce((s, z) => s + z.n, 0);
  // Uma zona só (ou quase vazio): blocos largos.
  const cMax = Math.max(1, Math.min(zonas.length, Math.floor((w + o.gapX) / (o.minBlockW + o.gapX))));
  let melhor: { blocks: MosaicBlock[]; height: number; p: number } | null = null;
  // Nenhum passo acima deste cabe na altura-alvo (só a área das células já estoura).
  const pInicio = Math.max(o.minPitch, Math.min(o.maxPitch, Math.floor(Math.sqrt((w * o.alturaAlvo) / Math.max(1, total))) + 1));
  for (let p = pInicio; p >= o.minPitch; p--) {
    // Para cada passo, o nº de colunas de blocos que minimiza a altura.
    let best: { blocks: MosaicBlock[]; height: number } | null = null;
    for (let c = 1; c <= cMax; c++) {
      const r = tentar(zonas, w, p, c, o);
      if (!best || r.height < best.height - 0.5) best = r;
    }
    melhor = { ...best!, p };
    if (best!.height <= o.alturaAlvo) break;
  }
  return {
    width: w,
    height: melhor!.height,
    pitch: melhor!.p,
    cell: cellDoPitch(melhor!.p),
    labelH: o.labelH,
    blocks: melhor!.blocks,
  };
}

/** Seção sob o ponto (px CSS) ou null. */
export function hitMosaico(l: MosaicLayout, x: number, y: number): { block: MosaicBlock; i: number } | null {
  for (const b of l.blocks) {
    if (x < b.x || x >= b.x + b.w || y < b.y + l.labelH || y >= b.y + b.h) continue;
    const col = Math.floor((x - b.x) / l.pitch);
    const row = Math.floor((y - b.y - l.labelH) / l.pitch);
    if (col >= b.cols) return null;
    const i = row * b.cols + col;
    return i < b.n ? { block: b, i } : null;
  }
  return null;
}

/** Posição (px CSS) da célula i de um bloco. */
export function cellPos(l: MosaicLayout, b: MosaicBlock, i: number): { x: number; y: number } {
  return { x: b.x + (i % b.cols) * l.pitch, y: b.y + l.labelH + Math.floor(i / b.cols) * l.pitch };
}
