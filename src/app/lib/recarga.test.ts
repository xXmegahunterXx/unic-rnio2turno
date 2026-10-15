import { afterEach, describe, expect, it, vi } from 'vitest';
import { ehErroDeVersao, recarregarUmaVez } from './recarga';

describe('recarga depois de um deploy (aba aberta com pedaços antigos)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reconhece o erro de pedaço que sumiu (Chrome, Firefox, Safari) e ignora os demais', () => {
    expect(ehErroDeVersao(new TypeError('Failed to fetch dynamically imported module: https://x/assets/CuriosidadesPage-BBdVZop4.js'))).toBe(true);
    expect(ehErroDeVersao(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(ehErroDeVersao(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(ehErroDeVersao(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    expect(ehErroDeVersao(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(ehErroDeVersao(null)).toBe(false);
  });

  it('recarrega no máximo 1 vez a cada 60 s por aba; depois de 60 s, de novo (2º deploy com a mesma aba)', () => {
    const mapa = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => void mapa.set(k, v) });
    vi.stubGlobal('window', { location: { reload } });
    expect(recarregarUmaVez(1_000_000)).toBe(true);
    expect(recarregarUmaVez(1_030_000)).toBe(false);
    expect(recarregarUmaVez(1_061_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('sem sessionStorage não recarrega sozinho (sem risco de laço)', () => {
    const reload = vi.fn();
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => undefined,
    });
    vi.stubGlobal('window', { location: { reload } });
    expect(recarregarUmaVez()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
