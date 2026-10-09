import { describe, expect, it } from 'vitest';
import { comArtigo, emMun, emUf, fmt4, fmtEleitores } from './fmt';

describe('formatadores das páginas de detalhe', () => {
  it('preposição + artigo da UF', () => {
    expect(emUf('SP', 'São Paulo')).toBe('em São Paulo');
    expect(emUf('RJ', 'Rio de Janeiro')).toBe('no Rio de Janeiro');
    expect(emUf('BA', 'Bahia')).toBe('na Bahia');
    expect(emUf('DF', 'Distrito Federal')).toBe('no Distrito Federal');
    expect(emUf('ZZ', 'Exterior')).toBe('no exterior');
  });

  it('artigo no início de frase', () => {
    expect(comArtigo('DF', 'Distrito Federal')).toBe('O Distrito Federal');
    expect(comArtigo('PB', 'Paraíba')).toBe('A Paraíba');
    expect(comArtigo('SP', 'São Paulo')).toBe('São Paulo');
  });

  it('municípios', () => {
    expect(emMun('Campinas')).toBe('em Campinas');
    expect(emMun('Rio de Janeiro')).toBe('no Rio de Janeiro');
  });

  it('zona/seção com 4 dígitos e eleitorado legível', () => {
    expect(fmt4(1)).toBe('0001');
    expect(fmt4(2031)).toBe('2031');
    expect(fmtEleitores(1)).toBe('1 eleitor');
    expect(fmtEleitores(1094)).toBe('1.094 eleitores');
    expect(fmtEleitores(9_145_124).replace(/\s/g, ' ')).toBe('9,1 mi de eleitores');
  });
});
