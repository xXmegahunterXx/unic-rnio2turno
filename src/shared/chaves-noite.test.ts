/** "Chaves da noite" (leva 3): padrões seguros, leitura de estado antigo/ruim e o freio como vai ao site. */
import { describe, expect, it } from 'vitest';
import { CHAVES_NOITE_PADRAO, COMANDO_CHAVE, FATORES_CARGA, cargaDoFreio, chavesNoite, ehFatorCarga, parseChavesNoite } from './chaves-noite';
import { PISO_PESSOAS_PUBLICO, TSE_LIMITE_POR_SEG } from './constants';
import type { ChavesNoite } from './types';

describe('chaves da noite', () => {
  it('padrões seguros: freio solto, HTML na borda DESLIGADO, o resto como hoje', () => {
    expect(CHAVES_NOITE_PADRAO).toEqual({
      freio: { fator: 1, leve: false },
      contadorPublico: true,
      htmlBorda: false,
      medirAnuncios: true,
      avisoNacional: 'auto',
      textoBots: true,
      contarLives: true,
    });
    expect(Object.isFrozen(CHAVES_NOITE_PADRAO) && Object.isFrozen(CHAVES_NOITE_PADRAO.freio)).toBe(true);
    expect(PISO_PESSOAS_PUBLICO).toBe(500);
    expect(TSE_LIMITE_POR_SEG).toEqual({ padrao: 40, min: 5, max: 90 });
  });

  it('estado anterior à leva 3 (sem o campo), null ou lixo → padrões (cópia, nunca o objeto congelado)', () => {
    for (const s of [undefined, null, {}, { noite: null }, { noite: undefined }]) {
      const c = chavesNoite(s as { noite?: ChavesNoite | null });
      expect(c).toEqual(CHAVES_NOITE_PADRAO);
      expect(c).not.toBe(CHAVES_NOITE_PADRAO);
      c.freio.fator = 5; // a cópia pode ser mudada sem tocar no padrão
      expect(CHAVES_NOITE_PADRAO.freio.fator).toBe(1);
    }
    expect(parseChavesNoite('x')).toEqual(CHAVES_NOITE_PADRAO);
    expect(parseChavesNoite([1, 2])).toEqual(CHAVES_NOITE_PADRAO);
  });

  it('campo a campo: inválido volta ao fallback, válido fica', () => {
    const fb: ChavesNoite = { ...CHAVES_NOITE_PADRAO, freio: { fator: 3, leve: true }, htmlBorda: true };
    const r = parseChavesNoite(
      { freio: { fator: 4, leve: 'sim' }, contadorPublico: false, htmlBorda: 'x', medirAnuncios: 0, avisoNacional: 'talvez', textoBots: false, contarLives: false, extra: 1 },
      fb,
    );
    expect(r).toEqual({ freio: { fator: 3, leve: true }, contadorPublico: false, htmlBorda: true, medirAnuncios: true, avisoNacional: 'auto', textoBots: false, contarLives: false });
    expect(parseChavesNoite({ freio: { fator: 5 }, avisoNacional: 'off' })).toMatchObject({ freio: { fator: 5, leve: false }, avisoNacional: 'off' });
  });

  it('fatores aceitos: 1, 2, 3 e 5', () => {
    expect(FATORES_CARGA).toEqual([1, 2, 3, 5]);
    for (const v of [0, 4, 6, 2.5, '2', null, NaN]) expect(ehFatorCarga(v)).toBe(false);
  });

  it('freio no site: ausente no ritmo normal; só o que foi puxado', () => {
    expect(cargaDoFreio(undefined)).toBeUndefined();
    expect(cargaDoFreio({ fator: 1, leve: false })).toBeUndefined();
    expect(cargaDoFreio({ fator: 2, leve: false })).toEqual({ fator: 2 });
    expect(cargaDoFreio({ fator: 5, leve: true })).toEqual({ fator: 5, leve: true });
    expect(cargaDoFreio({ fator: 1, leve: true })).toEqual({ fator: 1, leve: true });
    expect(cargaDoFreio({ fator: 7 as 1, leve: false })).toBeUndefined();
  });

  it('cada comando liga/desliga aponta para um campo booleano das chaves', () => {
    for (const campo of Object.values(COMANDO_CHAVE)) expect(typeof CHAVES_NOITE_PADRAO[campo]).toBe('boolean');
  });
});
