/**
 * Cartão "Projeção do Sintonia" (Projecao.tsx), partes puras: leitura defensiva do payload (rota de outra versão, proxy,
 * cache velho → nada na tela), janela do eixo em torno de 50% e endereço das rotas.
 */
import { describe, expect, it } from 'vitest';
import { lerProjecao, meiaJanela, urlProjecao } from './Projecao';

const ok = {
  projecao: {
    race: 'pres',
    abrangencia: 'BR',
    disponivel: true,
    fracaoApurada: 0.43,
    pctSecoes: 42.7,
    candidatos: [
      { indice: 0, numero: 13, pct: 49.1, min: 48.5, max: 49.7 },
      { indice: 1, numero: 22, pct: 50.9, min: 50.3, max: 51.5 },
    ],
    simNow: 1,
  },
};

describe('lerProjecao', () => {
  it('aceita o contrato', () => {
    const p = lerProjecao(ok);
    expect(p?.disponivel).toBe(true);
    expect(p?.candidatos).toHaveLength(2);
    expect(p?.candidatos[1]).toEqual({ indice: 1, numero: 22, pct: 50.9, min: 50.3, max: 51.5 });
  });

  it('indisponível com motivo e sem candidatos', () => {
    const p = lerProjecao({ projecao: { ...ok.projecao, disponivel: false, motivo: 'cedo', candidatos: [] } });
    expect(p).toMatchObject({ disponivel: false, motivo: 'cedo', candidatos: [] });
  });

  it('fora do contrato → null (nunca quebra a página)', () => {
    expect(lerProjecao(null)).toBeNull();
    expect(lerProjecao({ erro: 'Rota da API inexistente.' })).toBeNull();
    expect(lerProjecao({ projecao: { ...ok.projecao, candidatos: 'x' } })).toBeNull();
    expect(lerProjecao({ projecao: { ...ok.projecao, disponivel: 'sim' } })).toBeNull();
    expect(lerProjecao({ projecao: { ...ok.projecao, candidatos: [{ indice: 0, numero: 13, pct: Number.NaN, min: 1, max: 2 }] } })).toBeNull();
  });
});

describe('meiaJanela', () => {
  it('disputa apertada: 45–55%', () => {
    expect(meiaJanela(ok.projecao.candidatos)).toBe(5);
  });
  it('folgada: cabe a faixa inteira, de 5 em 5', () => {
    expect(meiaJanela([{ pct: 57.7, min: 57.1, max: 58.3 }, { pct: 42.3, min: 41.7, max: 42.9 }])).toBe(10);
    expect(meiaJanela([{ pct: 80, min: 78, max: 82 }, { pct: 20, min: 18, max: 22 }])).toBe(35);
  });
  it('nunca passa de 50', () => {
    expect(meiaJanela([{ pct: 100, min: 99, max: 100 }, { pct: 0, min: 0, max: 1 }])).toBe(50);
  });
});

describe('urlProjecao', () => {
  it('Brasil e UF (sigla minúscula, como as outras rotas)', () => {
    expect(urlProjecao('pres', 'BR')).toBe('/api/apuracao/pres/br/projecao');
    expect(urlProjecao('gov-es', 'ES')).toBe('/api/apuracao/gov-es/es/projecao');
  });
});
