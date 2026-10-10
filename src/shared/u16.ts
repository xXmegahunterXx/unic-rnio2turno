/** Colunas compactas: Uint16Array little-endian em base64 (isomórfico: Node e navegador). */

export function encodeU16(values: ArrayLike<number>): string {
  const buf = new Uint8Array(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(0, Math.min(0xffff, Math.round(values[i])));
    buf[i * 2] = v & 0xff;
    buf[i * 2 + 1] = v >> 8;
  }
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeU16(b64: string): Uint16Array {
  const bin = atob(b64);
  const out = new Uint16Array(bin.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
  return out;
}
