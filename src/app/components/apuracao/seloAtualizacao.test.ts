/** Selo de atualização: o que aparece em cada fonte (o TSE só é citado com dado oficial). */
import { describe, expect, it } from 'vitest';
import { partesSelo } from './SeloAtualizacao';

const resumo = { secoes: 1000, secoesTotalizadas: 632, ultimaAtualizacao: 1_000_000, votos: [10, 9] };

describe('partesSelo', () => {
  it('fonte TSE: % apurado, última leitura do servidor e hora do dado oficial', () => {
    const p = partesSelo({ fonte: 'tse', simulacao: false, frescor: { pres: { marca: 'a', conferidoEm: 2_000_000 } } }, 'pres', resumo);
    expect(p).toEqual({ pct: 63.2, atualizadoEm: 2_000_000, dadoTseEm: 1_000_000, tse: true, bloqueadoAte: null, nacionalParadoDesde: null });
  });

  it('fonte TSE sem leitura boa ainda e sem totalização: nada inventado', () => {
    const p = partesSelo({ fonte: 'tse', simulacao: false }, 'pres', { ...resumo, secoesTotalizadas: 0, ultimaAtualizacao: null });
    expect(p).toEqual({ pct: 0, atualizadoEm: null, dadoTseEm: null, tse: true, bloqueadoAte: null, nacionalParadoDesde: null });
  });

  it('simulação: nunca cita o TSE; "Atualizado às" = instante dos números exibidos', () => {
    const p = partesSelo({ fonte: 'simulacao', simulacao: true }, 'pres', resumo, 3_000_000);
    expect(p).toEqual({ pct: 63.2, atualizadoEm: 3_000_000, dadoTseEm: null, tse: false, bloqueadoAte: null, nacionalParadoDesde: null });
    expect(partesSelo({ fonte: 'simulacao', simulacao: true }, 'pres', resumo).atualizadoEm).toBeNull();
  });

  it('leva 3: TSE limitando (I03) e arquivo nacional parado (I18) só na fonte TSE', () => {
    const frescor = { pres: { marca: 'a', conferidoEm: 2_000_000, tseBloqueadoAte: 5_000_000, nacionalParadoDesde: 1_500_000 } };
    const p = partesSelo({ fonte: 'tse', simulacao: false, frescor }, 'pres', resumo);
    expect(p).toMatchObject({ bloqueadoAte: 5_000_000, nacionalParadoDesde: 1_500_000, atualizadoEm: 2_000_000 });
    // outra disputa não herda o aviso do arquivo nacional de Presidente
    expect(partesSelo({ fonte: 'tse', simulacao: false, frescor }, 'gov-df', resumo)).toMatchObject({ bloqueadoAte: null, nacionalParadoDesde: null });
    // simulação nunca cita o TSE
    expect(partesSelo({ fonte: 'simulacao', simulacao: true, frescor }, 'pres', resumo)).toMatchObject({ bloqueadoAte: null, nacionalParadoDesde: null });
  });
});
