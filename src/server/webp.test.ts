/**
 * Decodificador WebP (VP8 com perdas) e codificador PNG: saída idêntica à da libwebp nos retratos oficiais do TSE
 * (hashes de referência obtidos com a libwebp/Pillow sobre os mesmos arquivos), PNG válido e entrada inválida → null.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { codificarPng, decodificarWebp, webpParaPngDataUri, type ImagemRgb } from './webp';
import { RAIZ } from './test-helpers';

const fotos = (grupo: string) =>
  (JSON.parse(readFileSync(join(RAIZ, 'public/data/fotos', `${grupo}.json`), 'utf8')) as { fotos: Record<string, string> }).fotos;
const bytesDe = (uri: string) => new Uint8Array(Buffer.from(uri.split(',')[1], 'base64'));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Hashes SHA-256 do RGB decodificado pela libwebp (Pillow 12, upsampling "fancy" padrão). */
const REFERENCIA: [string, string, string][] = [
  ['senado', '10002548050', '004fe65a08666ba8b5b0a5d4d3e53987a9c78941ab2319ba9cc91c45ab3134a7'],
  ['camara-sp', '250002530115', '23e9a10a23500e118f46f9e97dacde8ab16c054cbba82de9267ba4d3f2f54238'],
  ['governadores', '100002545679', 'dceac4c2cdf5ae22d254dc3055660b8e45af93069801096998b7200da30a7ec3'],
];

/** Lê um PNG RGB 8 bits (os 5 filtros) — só para conferir o codificador. */
function lerPng(png: Buffer): ImagemRgb {
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let o = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (o < png.length) {
    const tam = png.readUInt32BE(o);
    const tipo = png.toString('ascii', o + 4, o + 8);
    const dados = png.subarray(o + 8, o + 8 + tam);
    if (tipo === 'IHDR') {
      w = dados.readUInt32BE(0);
      h = dados.readUInt32BE(4);
      expect([dados[8], dados[9]]).toEqual([8, 2]);
    } else if (tipo === 'IDAT') idat.push(dados);
    o += 12 + tam;
  }
  const bruto = inflateSync(Buffer.concat(idat));
  const lin = w * 3;
  const rgb = new Uint8Array(lin * h);
  for (let y = 0; y < h; y++) {
    const f = bruto[y * (lin + 1)];
    for (let i = 0; i < lin; i++) {
      const x = bruto[y * (lin + 1) + 1 + i];
      const a = i >= 3 ? rgb[y * lin + i - 3] : 0;
      const b = y > 0 ? rgb[(y - 1) * lin + i] : 0;
      const c = y > 0 && i >= 3 ? rgb[(y - 1) * lin + i - 3] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth;
      rgb[y * lin + i] = (x + pred) & 0xff;
    }
  }
  return { largura: w, altura: h, rgb };
}

describe('decodificarWebp (VP8 com perdas)', () => {
  it.each(REFERENCIA)('retrato oficial %s/%s: idêntico à libwebp', (grupo, sq, hash) => {
    const img = decodificarWebp(bytesDe(fotos(grupo)[sq]));
    expect(img).not.toBeNull();
    expect([img!.largura, img!.altura]).toEqual([120, 160]);
    expect(sha(img!.rgb)).toBe(hash);
  });

  it('decodifica todos os retratos de um pacote inteiro, rápido', () => {
    const lista = Object.values(fotos('senado'));
    const t0 = performance.now();
    const ok = lista.filter((u) => decodificarWebp(bytesDe(u)) !== null).length;
    expect(ok).toBe(lista.length);
    expect((performance.now() - t0) / lista.length).toBeLessThan(40);
  });

  it('entrada inválida → null (nunca lança nem trava)', () => {
    const boa = bytesDe(fotos('senado')['10002548050']);
    expect(decodificarWebp(new Uint8Array(0))).toBeNull();
    expect(decodificarWebp(new Uint8Array(64).fill(7))).toBeNull();
    // truncado em vários pontos: devolve null ou uma imagem (o leitor booleano completa com zeros), sem lançar
    for (const n of [12, 20, 30, 40, 200, 600, boa.length - 1]) expect(() => decodificarWebp(boa.subarray(0, n))).not.toThrow();
    // VP8L (sem perdas) não é suportado
    const vp8l = Uint8Array.from(boa);
    vp8l.set([0x56, 0x50, 0x38, 0x4c], 12);
    expect(decodificarWebp(vp8l)).toBeNull();
    // dimensões absurdas (65535×65535 não cabem nos 14 bits; 16383 passa do limite de 2048)
    const grande = Uint8Array.from(boa);
    grande[26] = 0xff;
    grande[27] = 0x3f;
    expect(decodificarWebp(grande)).toBeNull();
    // bytes aleatórios depois do cabeçalho: sem exceção
    const lixo = Uint8Array.from(boa);
    for (let i = 40; i < lixo.length; i++) lixo[i] = (i * 2654435761) >>> 24;
    expect(() => decodificarWebp(lixo)).not.toThrow();
  });
});

describe('codificarPng', () => {
  it('PNG válido que volta aos mesmos pixels', () => {
    const img = decodificarWebp(bytesDe(fotos('governadores')['100002545679']))!;
    const png = codificarPng(img);
    const lido = lerPng(png);
    expect([lido.largura, lido.altura]).toEqual([120, 160]);
    expect(Buffer.from(lido.rgb).equals(Buffer.from(img.rgb))).toBe(true);
    expect(png.length).toBeLessThan(80_000);
  });

  it('data URI WebP → PNG (e outros formatos → null)', () => {
    const uri = webpParaPngDataUri(fotos('senado')['10002548050']);
    expect(uri).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
    expect(webpParaPngDataUri('data:image/jpeg;base64,/9j/4AAQ')).toBeNull();
    expect(webpParaPngDataUri('data:image/webp;base64,UklGRg==')).toBeNull();
  });
});
