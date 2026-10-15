/** Selo de atualização: o que aparece em cada fonte (o TSE só é citado com dado oficial). */
import { describe, expect, it } from 'vitest';
import { partesSelo } from './SeloAtualizacao';

const resumo = { secoes: 1000, secoesTotalizadas: 632, ultimaAtualizacao: 1_000_000, votos: [10, 9] };

describe('partesSelo', () => {
  it('fonte TSE: % apurado, última leitura do servidor e hora do dado oficial', () => {
    const p = partesSelo({ fonte: 'tse', simulacao: false, frescor: { pres: { marca: 'a', conferidoEm: 2_000_000 } } }, 'pres', resumo);
    expect(p).toEqual({ pct: 63.2, atualizadoEm: 2_000_000, dadoTseEm: 1_000_000, tse: true });
  });

  it('fonte TSE sem leitura boa ainda e sem totalização: nada inventado', () => {
    const p = partesSelo({ fonte: 'tse', simulacao: false }, 'pres', { ...resumo, secoesTotalizadas: 0, ultimaAtualizacao: null });
    expect(p).toEqual({ pct: 0, atualizadoEm: null, dadoTseEm: null, tse: true });
  });

  it('simulação: nunca cita o TSE; "Atualizado às" = instante dos números exibidos', () => {
    const p = partesSelo({ fonte: 'simulacao', simulacao: true }, 'pres', resumo, 3_000_000);
    expect(p).toEqual({ pct: 63.2, atualizadoEm: 3_000_000, dadoTseEm: null, tse: false });
    expect(partesSelo({ fonte: 'simulacao', simulacao: true }, 'pres', resumo).atualizadoEm).toBeNull();
  });
});
