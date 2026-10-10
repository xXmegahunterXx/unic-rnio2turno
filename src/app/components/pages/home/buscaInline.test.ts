import { describe, expect, it } from 'vitest';
import { itensMunicipios, itensUfs } from '@/app/components/busca/indice';
import { resultadosInline } from './buscaInline';

const MUNS = itensMunicipios([
  { uf: 'SP', cod: '62910', nome: 'Campinas' },
  { uf: 'SP', cod: '71072', nome: 'São Paulo', capital: true },
  { uf: 'PE', cod: '25313', nome: 'Recife', capital: true },
  { uf: 'RJ', cod: '60011', nome: 'Rio de Janeiro', capital: true },
  { uf: 'MG', cod: '41238', nome: 'Campina Verde' },
]);
const UFS = itensUfs();

describe('resultadosInline', () => {
  it('vazio não sugere nada', () => {
    expect(resultadosInline('  ', MUNS, UFS)).toEqual({ opcoes: [], faltaCidade: null });
  });
  it('cidade sem acento e sem caixa, municípios antes dos estados', () => {
    const r = resultadosInline('sao paulo', MUNS, UFS);
    expect(r.opcoes[0].rotulo).toBe('São Paulo');
    expect(r.opcoes[0].to).toBe('/apuracao/sp/71072');
    expect(r.opcoes.some((o) => o.tipo === 'uf' && o.to === '/apuracao/sp')).toBe(true);
  });
  it('prefixo encontra as duas "Campina…"', () => {
    const r = resultadosInline('campin', MUNS, UFS);
    expect(r.opcoes.map((o) => o.rotulo)).toEqual(expect.arrayContaining(['Campinas', 'Campina Verde']));
  });
  it('cidade + zona + seção vai direto ao boletim', () => {
    const r = resultadosInline('Campinas 33 120', MUNS, UFS);
    expect(r.faltaCidade).toBeNull();
    expect(r.opcoes[0].to).toBe('/apuracao/sp/62910/33/120');
    expect(r.opcoes[0].rotulo).toBe('Zona 0033 · Seção 0120');
  });
  it('sigla da UF restringe o município', () => {
    const r = resultadosInline('zona 5 seção 12 recife pe', MUNS, UFS);
    expect(r.opcoes[0].to).toBe('/apuracao/pe/25313/5/12');
  });
  it('zona e seção sem cidade pede a cidade', () => {
    const r = resultadosInline('33 120', MUNS, UFS);
    expect(r.opcoes).toEqual([]);
    expect(r.faltaCidade).toMatchObject({ zona: 33, secao: 120 });
  });
});
