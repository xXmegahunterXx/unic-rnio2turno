import { describe, expect, it } from 'vitest';
import { decodeU16, encodeU16 } from './u16';

describe('u16', () => {
  it('ida e volta', () => {
    const v = [0, 1, 255, 256, 999, 65535, 12345];
    expect(Array.from(decodeU16(encodeU16(v)))).toEqual(v);
  });
  it('grandes volumes', () => {
    const v = Array.from({ length: 100_000 }, (_, i) => (i * 7919) % 65536);
    expect(Array.from(decodeU16(encodeU16(v)))).toEqual(v);
  });
});
