/**
 * Codificador PNG mínimo (RGB 8 bits, sem alfa), sem dependências:
 *
 *  - `codificarPng`: filtro adaptativo por linha (o de menor soma absoluta entre os 5 do PNG) + deflate nível 9,
 *    síncrono — para imagens pequenas (retratos 120×160 convertidos de WebP).
 *  - `pngDeRgba`: para as imagens de compartilhamento (1200×630) vindas do resvg — descarta o alfa (o fundo é
 *    opaco), filtro "Sub" em todas as linhas e deflate nível 9 no pool de threads (não trava o servidor). Sai ~30%
 *    menor que o PNG RGBA do resvg: o WhatsApp não mostra prévia de imagens pesadas.
 */
import { deflate, deflateSync } from 'node:zlib';
import { promisify } from 'node:util';

const deflateP = promisify(deflate);

/** Imagem RGB 8 bits (3 bytes por pixel, sem alfa). */
export interface ImagemRgb {
  largura: number;
  altura: number;
  rgb: Uint8Array;
}

let tabelaCrc: Uint32Array | null = null;
export function crc32(dados: Uint8Array): number {
  if (!tabelaCrc) {
    tabelaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelaCrc[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = tabelaCrc[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo: string, dados: Uint8Array): Buffer {
  const b = Buffer.alloc(12 + dados.length);
  b.writeUInt32BE(dados.length, 0);
  b.write(tipo, 4, 'ascii');
  Buffer.from(dados.buffer, dados.byteOffset, dados.byteLength).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + dados.length)), 8 + dados.length);
  return b;
}

function montarPng(w: number, h: number, idat: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

const abs = (x: number) => (x < 0 ? -x : x);
const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = abs(p - a);
  const pb = abs(p - b);
  const pc = abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** PNG com filtro adaptativo (síncrono; imagens pequenas). */
export function codificarPng(img: ImagemRgb): Buffer {
  const { largura: w, altura: h, rgb } = img;
  const lin = w * 3;
  const bruto = new Uint8Array((lin + 1) * h);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(lin));
  for (let y = 0; y < h; y++) {
    const cur = rgb.subarray(y * lin, (y + 1) * lin);
    const ant = y > 0 ? rgb.subarray((y - 1) * lin, y * lin) : null;
    let melhor = 0;
    let menor = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let soma = 0;
      for (let i = 0; i < lin; i++) {
        const a = i >= 3 ? cur[i - 3] : 0;
        const b = ant ? ant[i] : 0;
        const c = ant && i >= 3 ? ant[i - 3] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (cur[i] - pred) & 0xff;
        out[i] = v;
        soma += v < 128 ? v : 256 - v;
      }
      if (soma < menor) [menor, melhor] = [soma, f];
    }
    bruto[y * (lin + 1)] = melhor;
    bruto.set(cand[melhor], y * (lin + 1) + 1);
  }
  return montarPng(w, h, deflateSync(bruto, { level: 9 }));
}

/** RGBA (opaco) → PNG RGB com filtro "Sub" e deflate assíncrono. */
export async function pngDeRgba(rgba: Uint8Array, w: number, h: number): Promise<Buffer> {
  const lin = w * 3;
  const bruto = new Uint8Array((lin + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (lin + 1);
    bruto[o] = 1; // Sub
    let src = y * w * 4;
    let ar = 0;
    let ag = 0;
    let ab = 0;
    for (let x = 0; x < w; x++, src += 4) {
      const r = rgba[src];
      const g = rgba[src + 1];
      const b = rgba[src + 2];
      const d = o + 1 + x * 3;
      bruto[d] = (r - ar) & 0xff;
      bruto[d + 1] = (g - ag) & 0xff;
      bruto[d + 2] = (b - ab) & 0xff;
      ar = r;
      ag = g;
      ab = b;
    }
  }
  return montarPng(w, h, await deflateP(bruto, { level: 9, memLevel: 9 }));
}
