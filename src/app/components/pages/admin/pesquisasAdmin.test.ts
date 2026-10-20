import { describe, expect, it } from 'vitest';
import { validaPesquisa } from '@/shared/pesquisas';
import { entradaDe, formDe, formVazio, numeroBr } from './pesquisasAdmin';

// Dados de TESTE (fictícios).
describe('formulário de pesquisas do painel', () => {
  it('números com vírgula, milhar nas entrevistas, vazio fica vazio (nada é completado)', () => {
    expect(numeroBr('45,5')).toBe(45.5);
    expect(numeroBr('2.004', true)).toBe(2004);
    expect(numeroBr('2004', true)).toBe(2004);
    expect(numeroBr('')).toBeUndefined();
    expect(numeroBr('abc')).toBeNaN();
  });

  it('formulário completo vira uma entrada válida; só os números da disputa entram', () => {
    const f = {
      ...formVazio('pres'),
      instituto: 'Instituto Fictício A',
      contratante: 'Veículo Fictício',
      registro: 'br-09001/2026',
      coletaInicio: '2026-10-14',
      coletaFim: '2026-10-16',
      divulgadaEm: '2026-10-17',
      entrevistas: '2.004',
      margemPp: '2,2',
      totais: { '13': '45', '22': '44', brancosNulos: '7', indecisos: '', '55': '30' },
      comValidos: true,
      validos: { '13': '51', '22': '49' },
      fontes: 'https://exemplo.com.br/a\n\n https://exemplo.com.br/b ',
    };
    const e = entradaDe(f, [13, 22]);
    expect(e.totais).toEqual({ '13': 45, '22': 44, brancosNulos: 7 });
    expect(e.registro).toBe('BR-09001/2026');
    expect(e.fontes).toEqual(['https://exemplo.com.br/a', 'https://exemplo.com.br/b']);
    const r = validaPesquisa(e, { candidatos: () => [13, 22], hoje: '2026-10-20' });
    expect('ok' in r).toBe(true);
    // ida e volta: editar mantém o id e os mesmos números
    if ('ok' in r) {
      const de = formDe(r.ok);
      expect(de.id).toBe(r.ok.id);
      expect(entradaDe(de, [13, 22])).toMatchObject({ id: r.ok.id, totais: r.ok.totais, validos: r.ok.validos, margemPp: 2.2, entrevistas: 2004 });
    }
  });

  it('sem válidos marcados, não manda válidos', () => {
    const e = entradaDe({ ...formVazio(), totais: { '13': '45', '22': '44' }, validos: { '13': '51', '22': '49' } }, [13, 22]);
    expect(e.validos).toBeUndefined();
  });
});
