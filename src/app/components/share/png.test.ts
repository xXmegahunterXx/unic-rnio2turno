import { describe, expect, it } from 'vitest';
import { faixasUnicode, subconjuntoNecessario } from './png';

// unicode-range como o Chrome devolve (sem zeros à esquerda) e como está no CSS do fontsource.
const LATIN_CHROME = 'U+0-FF, U+131, U+152-153, U+2BB-2BC, U+2C6, U+2DA, U+2DC, U+304, U+308, U+329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_CSS = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const CIRILICO = 'U+301, U+400-45F, U+490-491, U+4B0-4B1, U+2116';
const VIETNAMITA = 'U+102-103, U+110-111, U+128-129, U+168-169, U+1A0-1A1, U+1AF-1B0, U+300-301, U+303-304, U+308-309, U+323, U+329, U+1EA0-1EF9, U+20AB';

const cps = (s: string) => new Set(Array.from(s).map((c) => c.codePointAt(0)!));

describe('subconjuntos de fonte do cartão', () => {
  it('lê faixas nos dois formatos e com curinga', () => {
    expect(faixasUnicode('U+0-FF, U+131')).toEqual([
      [0, 255],
      [0x131, 0x131],
    ]);
    expect(faixasUnicode(LATIN_CSS)[0]).toEqual([0, 255]);
    expect(faixasUnicode('U+4??')).toEqual([[0x400, 0x4ff]]);
    expect(faixasUnicode('')).toEqual([]);
  });

  it('português usa só o subconjunto latino', () => {
    const texto = cps('Presidente · 2º turno: Candidato A 51,23% × Candidato B — São João, Ação − …');
    expect(subconjuntoNecessario(LATIN_CHROME, texto)).toBe(true);
    expect(subconjuntoNecessario(LATIN_CSS, texto)).toBe(true);
    expect(subconjuntoNecessario(CIRILICO, texto)).toBe(false);
    expect(subconjuntoNecessario(VIETNAMITA, texto)).toBe(false);
  });

  it('sem unicode-range a regra vale para tudo', () => {
    expect(subconjuntoNecessario('', cps('abc'))).toBe(true);
  });
});
