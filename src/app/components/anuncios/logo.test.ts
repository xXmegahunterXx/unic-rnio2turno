import { describe, expect, it } from 'vitest';
import type { AjusteImagem } from '@/shared/anuncios';
import { apresentacaoLogo, ehLogotipo, placaDaPeca, type LogoDoAnuncio } from './logo';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const PNG_ESCURA = 'data:image/png;base64,RVNDVVJB';
const URL_SERVIDOR = 'https://sintonia2026.com.br/api/anuncio/img?h=0123456789abcdef';

/** Lynx transparente (gabarito §4): 3,216; placa escura no claro, nenhuma no escuro. */
const LYNX: AjusteImagem = { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' };
/** Logotipo escuro (L04): nenhuma no claro, clara no escuro. */
const ESCURO: AjusteImagem = { proporcao: 5.377, placaClaro: 'nenhuma', placaEscuro: 'clara', origem: 'auto' };

describe('apresentacaoLogo', () => {
  it('sem ajuste (logo gravada antes): placa legado, quadrada, nos dois temas', () => {
    for (const tema of ['claro', 'escuro'] as const) {
      const ap = apresentacaoLogo({ logo: URL_SERVIDOR }, tema)!;
      expect(ap.placa).toBe('legado');
      expect(ap.ajuste).toBeNull();
      expect(ap.proporcao).toBe(1);
      expect(ap.icone).toBe(true);
      expect(ap.logotipo).toBe(false);
      expect(ap.src).toBe(URL_SERVIDOR);
    }
  });

  it('sem logo (ou imagem não aceita): null — quem desenha mostra o monograma', () => {
    expect(apresentacaoLogo({}, 'claro')).toBeNull();
    expect(apresentacaoLogo({ logo: 'https://terceiro.exemplo/logo.png', logoAjuste: LYNX }, 'escuro')).toBeNull();
  });

  it('com ajuste: proporção natural e a placa de cada tema', () => {
    const a: LogoDoAnuncio = { logo: PNG, logoAjuste: LYNX };
    const claro = apresentacaoLogo(a, 'claro')!;
    const escuro = apresentacaoLogo(a, 'escuro')!;
    expect(claro.placa).toBe('escura');
    expect(escuro.placa).toBe('nenhuma');
    expect(claro.proporcao).toBe(3.216);
    expect(claro.icone).toBe(false);
    expect(claro.logotipo).toBe(true);
    expect(apresentacaoLogo({ logo: PNG, logoAjuste: ESCURO }, 'claro')!.placa).toBe('nenhuma');
    expect(apresentacaoLogo({ logo: PNG, logoAjuste: ESCURO }, 'escuro')!.placa).toBe('clara');
  });

  it('no tema escuro usa a versão para fundo escuro com o ajuste dela; no claro, a logo', () => {
    const a: LogoDoAnuncio = {
      logo: PNG,
      logoAjuste: ESCURO,
      logoEscuro: PNG_ESCURA,
      logoEscuroAjuste: { proporcao: 4.1, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' },
    };
    const escuro = apresentacaoLogo(a, 'escuro')!;
    expect(escuro.src).toBe(PNG_ESCURA);
    expect(escuro.escura).toBe(true);
    expect(escuro.proporcao).toBe(4.1);
    expect(escuro.placa).toBe('nenhuma');
    const claro = apresentacaoLogo(a, 'claro')!;
    expect(claro.src).toBe(PNG);
    expect(claro.escura).toBe(false);
    expect(claro.proporcao).toBe(5.377);
  });

  it('versão escura sem ajuste cai no legado só no escuro', () => {
    const a: LogoDoAnuncio = { logo: PNG, logoAjuste: LYNX, logoEscuro: PNG_ESCURA };
    expect(apresentacaoLogo(a, 'escuro')!.placa).toBe('legado');
    expect(apresentacaoLogo(a, 'escuro')!.src).toBe(PNG_ESCURA);
    expect(apresentacaoLogo(a, 'claro')!.placa).toBe('escura');
    // só a versão escura: vale nos dois temas
    expect(apresentacaoLogo({ logoEscuro: PNG_ESCURA, logoEscuroAjuste: LYNX }, 'claro')!.src).toBe(PNG_ESCURA);
  });

  it('LOGO_NATURAL desligado: sempre o desenho antigo, com a logo de sempre', () => {
    const a: LogoDoAnuncio = { logo: PNG, logoAjuste: LYNX, logoEscuro: PNG_ESCURA, logoEscuroAjuste: ESCURO };
    for (const tema of ['claro', 'escuro'] as const) {
      const ap = apresentacaoLogo(a, tema, false)!;
      expect(ap.placa).toBe('legado');
      expect(ap.src).toBe(PNG);
      expect(ap.logotipo).toBe(false);
    }
    expect(placaDaPeca({ imagemAjuste: LYNX }, 'claro', false)).toBeNull();
  });

  it('ajuste com proporção inválida é tratado como sem ajuste', () => {
    expect(apresentacaoLogo({ logo: PNG, logoAjuste: { ...LYNX, proporcao: 0 } }, 'claro')!.placa).toBe('legado');
  });
});

describe('ehLogotipo', () => {
  it('só com ajuste e proporção ≥ 2', () => {
    expect(ehLogotipo({ logo: PNG }, 'claro')).toBe(false);
    expect(ehLogotipo({ logo: PNG, logoAjuste: LYNX }, 'claro')).toBe(true);
    expect(ehLogotipo({ logo: PNG, logoAjuste: { ...LYNX, proporcao: 2 } }, 'escuro')).toBe(true);
    expect(ehLogotipo({ logo: PNG, logoAjuste: { ...LYNX, proporcao: 1.99 } }, 'escuro')).toBe(false);
    expect(ehLogotipo({ logo: PNG, logoAjuste: { ...LYNX, proporcao: 1 } }, 'escuro')).toBe(false);
    expect(ehLogotipo({}, 'escuro')).toBe(false);
  });
  it('por tema: a versão escura pode ser ícone e a clara logotipo', () => {
    const a: LogoDoAnuncio = { logo: PNG, logoAjuste: LYNX, logoEscuro: PNG_ESCURA, logoEscuroAjuste: { ...LYNX, proporcao: 1 } };
    expect(ehLogotipo(a, 'claro')).toBe(true);
    expect(ehLogotipo(a, 'escuro')).toBe(false);
  });
  it('ícone: até 1,35', () => {
    expect(apresentacaoLogo({ logo: PNG, logoAjuste: { ...LYNX, proporcao: 1.35 } }, 'claro')!.icone).toBe(true);
    expect(apresentacaoLogo({ logo: PNG, logoAjuste: { ...LYNX, proporcao: 1.36 } }, 'claro')!.icone).toBe(false);
  });
});

describe('placaDaPeca', () => {
  it('só peça transparente com ajuste; opaca ou sem ajuste: o desenho de antes', () => {
    expect(placaDaPeca({}, 'claro')).toBeNull();
    expect(placaDaPeca({ imagemAjuste: { proporcao: 3.2, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'auto', comFundo: true } }, 'claro')).toBeNull();
    const p07: AjusteImagem = { proporcao: 2.928, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' };
    expect(placaDaPeca({ imagemAjuste: p07 }, 'claro')).toBe('escura');
    expect(placaDaPeca({ imagemAjuste: p07 }, 'escuro')).toBe('nenhuma');
  });
});
