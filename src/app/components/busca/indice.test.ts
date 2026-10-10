import { describe, expect, it } from 'vitest';
import { buscar, interpretarSecao, itensMunicipios, itensUfs, pontuarChave } from './indice';

describe('interpretarSecao', () => {
  it('UF + zona + seção', () => {
    expect(interpretarSecao('SP 1 123')).toEqual({ zona: 1, secao: 123, uf: 'SP', resto: '' });
  });
  it('rótulos explícitos e acentos', () => {
    expect(interpretarSecao('zona 1 seção 123')).toEqual({ zona: 1, secao: 123, uf: null, resto: '' });
    expect(interpretarSecao('Zona 0004, Seção 0012 Rio de Janeiro')).toEqual({ zona: 4, secao: 12, uf: 'RJ', resto: 'rio de janeiro' });
  });
  it('município no texto', () => {
    expect(interpretarSecao('campinas 33 120')).toEqual({ zona: 33, secao: 120, uf: null, resto: 'campinas' });
    expect(interpretarSecao('z5 s7 recife pe')).toEqual({ zona: 5, secao: 7, uf: 'PE', resto: 'recife' });
  });
  it('nome da UF por extenso', () => {
    expect(interpretarSecao('bahia 10 20')).toMatchObject({ uf: 'BA', resto: 'bahia' });
  });
  it('não é zona/seção', () => {
    expect(interpretarSecao('campinas')).toBeNull();
    expect(interpretarSecao('sp 12')).toBeNull();
    expect(interpretarSecao('1 2 3')).toBeNull();
    expect(interpretarSecao('zona 0 secao 5')).toBeNull();
  });
});

describe('buscar', () => {
  const muns = itensMunicipios([
    { uf: 'SP', cod: '71072', nome: 'São Paulo', capital: true },
    { uf: 'SP', cod: '70998', nome: 'São Paulo do Potengi' },
    { uf: 'PE', cod: '25313', nome: 'Paulista' },
    { uf: 'ZZ', cod: '29254', nome: 'Abidjã', pais: 'Costa do Marfim' },
  ]);
  it('sem acento e sem caixa; capital primeiro', () => {
    const r = buscar(muns, 'SAO PAULO', 5);
    expect(r.map((x) => x.rotulo)).toEqual(['São Paulo', 'São Paulo do Potengi']);
  });
  it('início de palavra pontua mais que meio', () => {
    expect(pontuarChave('sao paulo', 'paulo')).toBeGreaterThan(pontuarChave('sao paulo', 'aulo'));
  });
  it('acha cidade do exterior pelo país', () => {
    expect(buscar(muns, 'marfim', 5)[0]?.rotulo).toBe('Abidjã');
  });
  it('UFs pela sigla', () => {
    expect(buscar(itensUfs(), 'rj', 3)[0]?.to).toBe('/apuracao/rj');
  });
});
