import { describe, expect, it } from 'vitest';
import { rodadas } from '@/app/content/propostas';
import {
  caminhoDuelo,
  caminhoResultado,
  codificar,
  codificarRespostas,
  codigoDesafio,
  decodificar,
  decodificarRespostas,
  lerDuelo,
  novaSemente,
  sementeParaTexto,
  textoParaSemente,
  type Escolha,
} from './codigo';
import { calcularSintonia, comparar } from './sintonia';

const R = (s: string) => s.split('').map(Number) as Escolha[];

describe('código do Teste Cego', () => {
  it('ida e volta da semente', () => {
    for (const s of [0, 1, 35, 36, 1234567, 60_466_175]) {
      const t = sementeParaTexto(s);
      expect(t).toHaveLength(5);
      expect(textoParaSemente(t)).toBe(s);
    }
    expect(textoParaSemente('ABCDE')).toBe(textoParaSemente('abcde'));
    expect(textoParaSemente('abc')).toBeNull();
    expect(textoParaSemente('ab-de')).toBeNull();
  });

  it('ida e volta das respostas (todas as combinações de borda)', () => {
    for (const r of ['000000000000', '333333333333', '012301230123', '321032103210', '000000000003', '300000000000']) {
      const c = codificarRespostas(R(r));
      expect(c).toHaveLength(5);
      expect(decodificarRespostas(c)).toEqual(R(r));
    }
    expect(() => codificarRespostas(R('0123'))).toThrow();
    expect(decodificarRespostas('zzzzz')).toBeNull(); // acima de 4^12
  });

  it('código completo tem 11 caracteres e volta igual', () => {
    for (let k = 0; k < 50; k++) {
      const seed = novaSemente();
      const resp = Array.from({ length: 12 }, (_, i) => ((seed + i * 7) % 4) as Escolha);
      const c = codificar(seed, resp);
      expect(c).toMatch(/^1[0-9a-z]{10}$/);
      expect(decodificar(c)).toEqual({ seed, respostas: resp });
      expect(decodificar(`#${c.toUpperCase()}`)).toEqual({ seed, respostas: resp });
    }
    expect(decodificar('2abcde00000')).toBeNull();
    expect(decodificar('')).toBeNull();
  });

  it('caminhos: respostas sempre depois do "#" (nunca chegam ao servidor)', () => {
    const resp = R('012301230123');
    const r = caminhoResultado(777, resp);
    expect(r.startsWith('/teste/resultado#')).toBe(true);
    const d = caminhoDuelo(777, resp);
    const [caminho, hash] = d.split('#');
    expect(caminho).toBe(`/duelo/${codigoDesafio(777)}`);
    expect(caminho).not.toContain(codificarRespostas(resp));
    expect(lerDuelo(caminho.split('/').pop(), `#${hash}`)).toEqual({ seed: 777, respostas: resp });
    // também aceita o código inteiro no caminho
    expect(lerDuelo(codificar(777, resp), '')).toEqual({ seed: 777, respostas: resp });
    expect(lerDuelo(codigoDesafio(777), '')).toBeNull();
    expect(lerDuelo('xyz', '#abc')).toBeNull();
  });
});

describe('sintonia', () => {
  const seed = 4242;
  const rs = rodadas(seed);
  /** Respostas que escolhem sempre o autor dado. */
  const sempre = (autor: 13 | 22) => rs.map((r) => (r.opcoes[0].autor === autor ? 0 : 1) as Escolha);

  it('escolher sempre o mesmo autor dá 100% × 0%', () => {
    const s = calcularSintonia(seed, sempre(13));
    expect(s.pct[13]).toBe(100);
    expect(s.pct[22]).toBe(0);
    expect(s.escolhas).toEqual({ 13: 12, 22: 0 });
  });

  it('tanto faz divide o ponto; nenhuma não pontua', () => {
    const resp = sempre(22);
    resp[0] = 3; // tanto faz
    resp[1] = 2; // nenhuma
    const s = calcularSintonia(seed, resp);
    expect(s.tantoFaz).toBe(1);
    expect(s.nenhuma).toBe(1);
    expect(s.pontos[22]).toBe(10.5);
    expect(s.pontos[13]).toBe(0.5);
    expect(s.pct[22]).toBeCloseTo(87.5);
  });

  it('a ordem dos temas segue a semente e cada tema aparece uma vez', () => {
    const s = calcularSintonia(seed, sempre(13));
    expect(s.temas.map((t) => t.rodada.tema.id)).toEqual(rs.map((r) => r.tema.id));
    expect(s.temas.every((t) => t.escolhida?.autor === 13)).toBe(true);
  });

  it('comparação conta temas iguais, mesmo com sementes diferentes', () => {
    const a = calcularSintonia(seed, sempre(13));
    const b = calcularSintonia(seed, sempre(13));
    expect(comparar(a, b).iguais).toBe(12);
    const c = calcularSintonia(99, rodadas(99).map((r) => (r.opcoes[0].autor === 22 ? 0 : 1) as Escolha));
    expect(comparar(a, c).iguais).toBe(0);
    const d = calcularSintonia(99, rodadas(99).map((r) => (r.opcoes[0].autor === 13 ? 0 : 1) as Escolha));
    expect(comparar(a, d).iguais).toBe(12);
  });
});
