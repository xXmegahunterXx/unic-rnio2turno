import { describe, expect, it } from 'vitest';
import { lerMemoriaVinheta, MEMORIA_VINHETA_VAZIA, proximaVinheta, type ProjecaoVinheta } from './vinheta';

const proj = (a: number): ProjecaoVinheta => ({ pct: [a, 100 - a], min: [a - 1, 99 - a], max: [a + 1, 101 - a] });

describe('vinheta da projeção', () => {
  it('aparece quando a projeção surge; repete só com mudança de 0,3 p.p. ou mais', () => {
    let r = proximaVinheta(MEMORIA_VINHETA_VAZIA, { projecao: null, eleito: null });
    expect(r.vinheta).toBeNull();
    r = proximaVinheta(r.memoria, { projecao: proj(50.2), eleito: null });
    expect(r.vinheta).toEqual({ tipo: 'projecao-nova', anterior: null });
    r = proximaVinheta(r.memoria, { projecao: proj(50.4), eleito: null });
    expect(r.vinheta).toBeNull();
    expect(r.memoria.projecao).toEqual([50.2, 49.8]);
    r = proximaVinheta(r.memoria, { projecao: proj(50.5), eleito: null });
    expect(r.vinheta).toEqual({ tipo: 'projecao-mudou', anterior: [50.2, 49.8] });
    expect(r.memoria.projecao).toEqual([50.5, 49.5]);
  });

  it('resultado definido: uma vez, com prioridade; depois, nada', () => {
    const r = proximaVinheta({ projecao: [50, 50], definido: false }, { projecao: null, eleito: 0 });
    expect(r.vinheta).toEqual({ tipo: 'definido', anterior: null });
    expect(proximaVinheta(r.memoria, { projecao: null, eleito: 0 }).vinheta).toBeNull();
  });

  it('projeção que some limpa a memória em silêncio (e volta como nova)', () => {
    const r = proximaVinheta({ projecao: [50, 50], definido: false }, { projecao: null, eleito: null });
    expect(r.vinheta).toBeNull();
    expect(proximaVinheta(r.memoria, { projecao: proj(51), eleito: null }).vinheta?.tipo).toBe('projecao-nova');
  });

  it('memória da sessão: aceita só o formato certo', () => {
    expect(lerMemoriaVinheta('{"projecao":[50.1,49.9],"definido":false}')).toEqual({ projecao: [50.1, 49.9], definido: false });
    expect(lerMemoriaVinheta('{"projecao":["x",1]}')).toEqual(MEMORIA_VINHETA_VAZIA);
    expect(lerMemoriaVinheta('lixo')).toEqual(MEMORIA_VINHETA_VAZIA);
    expect(lerMemoriaVinheta(null)).toEqual(MEMORIA_VINHETA_VAZIA);
  });
});
