/** Análise das imagens do anunciante no painel (pura): buffers RGBA sintéticos. */
import { describe, expect, it } from 'vitest';
import {
  LIMIAR,
  SUPERFICIE_CLARA,
  ajusteDe,
  analisarPixels,
  comFundoEscolhido,
  contraste,
  escolhaCodificacao,
  linhaDimensoes,
  luminancia,
  proporcaoValida,
} from './analiseLogo';

type RGBA = [number, number, number, number];

/** Buffer RGBA w×h preenchido por `cor(x, y)`. */
function img(w: number, h: number, cor: (x: number, y: number) => RGBA) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(cor(x, y), (y * w + x) * 4);
  return d;
}
const dentro = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const T: RGBA = [0, 0, 0, 0];
const BRANCO: RGBA = [255, 255, 255, 255];

/** Cinza cujo contraste com o branco (superfície clara) fica mais perto de `alvo`. */
function cinzaComContraste(alvo: number): number {
  const lb = luminancia(...SUPERFICIE_CLARA);
  let melhor = 0;
  for (let v = 0; v <= 255; v++) if (Math.abs(contraste(luminancia(v, v, v), lb) - alvo) < Math.abs(contraste(luminancia(melhor, melhor, melhor), lb) - alvo)) melhor = v;
  return melhor;
}

describe('analisarPixels', () => {
  it('logotipo largo com margem: recorta, caixa do conteúdo + 2% de respiro e proporção natural (3,5)', () => {
    // conteúdo 336 × 86 em 600 × 600 transparente; respiro de 2% do maior lado = 7 px → caixa 350 × 100
    const a = analisarPixels(img(600, 600, (x, y) => (dentro(x, y, 120, 250, 456, 336) ? [14, 120, 200, 255] : T)), 600, 600);
    expect(a.transparente).toBe(true);
    expect(a.recorte).toEqual({ x: 113, y: 243, w: 350, h: 100 });
    expect(a.proporcao).toBe(3.5);
    expect(ajusteDe(a)).toEqual({ proporcao: 3.5, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'auto' });
  });

  it('logo branca transparente: placa escura no tema claro, nenhuma no escuro', () => {
    const a = analisarPixels(img(300, 100, (x, y) => (dentro(x, y, 20, 30, 280, 70) ? BRANCO : T)), 300, 100);
    expect([a.placaClaro, a.placaEscuro]).toEqual(['escura', 'nenhuma']);
    expect(a.tom).toBe('clara');
    expect(ajusteDe(a).comFundo).toBeUndefined();
  });

  it('logotipo escuro transparente: nenhuma no claro, placa clara no escuro', () => {
    const a = analisarPixels(img(512, 512, (x, y) => (dentro(x, y, 60, 230, 460, 290) ? [26, 31, 54, 255] : T)), 512, 512);
    expect([a.placaClaro, a.placaEscuro]).toEqual(['nenhuma', 'clara']);
    expect(a.tom).toBe('escura');
    expect(a.proporcao).toBeGreaterThan(5);
  });

  it('colorido com detalhe branco na silhueta (caso Lynx): placa escura no claro, nada no escuro', () => {
    const a = analisarPixels(
      img(400, 160, (x, y) => (dentro(x, y, 20, 20, 380, 100) ? [14, 170, 240, 255] : dentro(x, y, 120, 110, 280, 130) ? BRANCO : T)),
      400,
      160,
    );
    expect(a.someNoClaro).toBeGreaterThan(LIMIAR.fracaoSome);
    expect([a.placaClaro, a.placaEscuro]).toEqual(['escura', 'nenhuma']);
  });

  it('ícone de app (quadrado laranja transparente em volta, letra branca DENTRO): o miolo branco não conta, sem placa', () => {
    const a = analisarPixels(
      img(256, 256, (x, y) => (dentro(x, y, 100, 100, 156, 156) ? BRANCO : dentro(x, y, 16, 16, 240, 240) ? [234, 88, 12, 255] : T)),
      256,
      256,
    );
    expect(a.transparente).toBe(true);
    expect(a.someNoClaro).toBe(0);
    expect([a.placaClaro, a.placaEscuro]).toEqual(['nenhuma', 'nenhuma']);
  });

  it('ícone opaco: imagem com fundo próprio, sem placa (comFundo)', () => {
    const a = analisarPixels(img(128, 128, (x, y) => (dentro(x, y, 40, 40, 88, 88) ? BRANCO : [234, 88, 12, 255])), 128, 128);
    expect(a.transparente).toBe(false);
    expect([a.placaClaro, a.placaEscuro]).toEqual(['nenhuma', 'nenhuma']);
    expect(ajusteDe(a).comFundo).toBe(true);
    expect(a.fundoClaro).toBe(false);
  });

  it('JPEG com fundo branco: fundo sólido, recorte com 30% da altura do conteúdo em volta, comFundo e fundo claro', () => {
    const a = analisarPixels(img(900, 300, (x, y) => (dentro(x, y, 100, 120, 800, 180) ? [16, 150, 72, 255] : BRANCO)), 900, 300);
    expect(a.transparente).toBe(false);
    expect(a.fundoSolido).toEqual([255, 255, 255]);
    expect(a.fundoClaro).toBe(true);
    const m = Math.round(60 * LIMIAR.respiroFundo); // 18 px
    expect(a.recorte).toEqual({ x: 100 - m, y: 120 - m, w: 700 + 2 * m, h: 60 + 2 * m });
    const aj = ajusteDe(a);
    expect(aj.comFundo).toBe(true);
    expect([aj.placaClaro, aj.placaEscuro]).toEqual(['nenhuma', 'nenhuma']);
  });

  it('peça (sem recortar fundo sólido): a imagem opaca fica inteira', () => {
    const a = analisarPixels(img(900, 300, (x, y) => (dentro(x, y, 100, 120, 800, 180) ? [16, 150, 72, 255] : BRANCO)), 900, 300, { recortarFundoSolido: false });
    expect(a.recorte).toBeNull();
    expect(a.proporcao).toBe(3);
  });

  it('não recorta abaixo de 3% (margem que tiraria menos)', () => {
    // conteúdo quase até a borda: tiraria 2% da largura e da altura (com o respiro, menos ainda)
    const quase = analisarPixels(img(200, 100, (x, y) => (dentro(x, y, 2, 1, 198, 99) ? [20, 20, 20, 255] : T)), 200, 100);
    expect(quase.recorte).toBeNull();
    expect(quase.proporcao).toBe(2);
    // margem maior: recorta
    const longe = analisarPixels(img(200, 100, (x, y) => (dentro(x, y, 20, 10, 180, 90) ? [20, 20, 20, 255] : T)), 200, 100);
    expect(longe.recorte).not.toBeNull();
  });

  it('mediana de contraste 2,2 dá placa; 2,7 não dá (ninguém "some")', () => {
    for (const [alvo, placa] of [
      [2.2, 'escura'],
      [2.7, 'nenhuma'],
    ] as const) {
      const v = cinzaComContraste(alvo);
      const k = contraste(luminancia(v, v, v), luminancia(...SUPERFICIE_CLARA));
      expect(Math.abs(k - alvo)).toBeLessThan(0.03);
      const a = analisarPixels(img(300, 100, (x, y) => (dentro(x, y, 20, 30, 280, 70) ? [v, v, v, 255] : T)), 300, 100);
      expect(a.someNoClaro).toBe(0);
      expect(a.contrasteClaro).toBeCloseTo(k, 5);
      expect(a.placaClaro).toBe(placa);
    }
  });

  it('some nos dois temas (metade preta, metade branca na silhueta): uma placa só, nos dois temas', () => {
    const a = analisarPixels(img(400, 100, (x, y) => (dentro(x, y, 20, 20, 200, 80) ? [0, 0, 0, 255] : dentro(x, y, 200, 20, 380, 80) ? BRANCO : T)), 400, 100);
    expect(a.someNoClaro).toBeGreaterThan(0.3);
    expect(a.someNoEscuro).toBeGreaterThan(0.3);
    expect(a.tom).toBe('mista');
    expect(a.placaClaro).toBe(a.placaEscuro);
    expect(a.placaClaro).not.toBe('nenhuma');
  });

  it('imagem toda transparente: sem placa e sem recorte', () => {
    const a = analisarPixels(img(50, 50, () => T), 50, 50);
    expect(a.recorte).toBeNull();
    expect([a.placaClaro, a.placaEscuro]).toEqual(['nenhuma', 'nenhuma']);
  });
});

describe('ajuste gravado', () => {
  const branca = analisarPixels(img(300, 100, (x, y) => (dentro(x, y, 20, 30, 280, 70) ? BRANCO : T)), 300, 100);

  it('escolha manual vale nos dois temas e grava origem manual; "Automático" volta à medida', () => {
    expect(ajusteDe(branca, 'clara')).toMatchObject({ placaClaro: 'clara', placaEscuro: 'clara', origem: 'manual' });
    const auto = ajusteDe(branca);
    expect(auto).toMatchObject({ placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' });
    const manual = comFundoEscolhido(auto, branca, 'nenhuma');
    expect(manual).toEqual({ proporcao: auto.proporcao, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'manual' });
    expect(comFundoEscolhido(manual, branca, 'auto')).toEqual(auto);
  });

  it('proporção da imagem gravada, dentro de 0,2–12 com 3 casas', () => {
    expect(ajusteDe(branca, 'auto', 431 / 134).proporcao).toBe(3.216);
    expect(proporcaoValida(40)).toBe(12);
    expect(proporcaoValida(0.01)).toBe(0.2);
    expect(proporcaoValida(Number.NaN)).toBe(1);
  });

  it('linha de dimensões do painel', () => {
    const uri = `data:image/png;base64,${'A'.repeat(Math.ceil((29 * 1024 * 4) / 3))}`;
    expect(linhaDimensoes({ original: { largura: 512, altura: 512 }, largura: 431, altura: 134, recortada: true, uri })).toBe(
      '512 × 512 px → 431 × 134 px (margens vazias cortadas) · 29 KB',
    );
    expect(linhaDimensoes({ original: { largura: 512, altura: 512 }, largura: 512, altura: 512, recortada: false, uri })).toBe('512 × 512 px · 29 KB');
  });
});

describe('escolhaCodificacao (peça)', () => {
  it('com transparência nunca JPEG; WebP só se o navegador gerar, senão PNG', () => {
    expect(escolhaCodificacao(true, true)).toEqual([
      ['image/webp', 0.9],
      ['image/png', undefined],
    ]);
    expect(escolhaCodificacao(true, false)).toEqual([['image/png', undefined]]);
    for (const webp of [true, false]) expect(escolhaCodificacao(true, webp).some(([t]) => t === 'image/jpeg')).toBe(false);
  });
  it('sem transparência: WebP 0,85, JPEG 0,85, WebP 0,7, JPEG 0,72 (sem WebP no Safari)', () => {
    expect(escolhaCodificacao(false, true).map(([t, q]) => `${t}:${q}`)).toEqual(['image/webp:0.85', 'image/jpeg:0.85', 'image/webp:0.7', 'image/jpeg:0.72']);
    expect(escolhaCodificacao(false, false).map(([t]) => t)).toEqual(['image/jpeg', 'image/jpeg']);
  });
});
