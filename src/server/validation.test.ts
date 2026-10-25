/**
 * Validação dos comandos do admin (src/server/validation.ts), contrato v2 dos anunciantes: campos novos do anúncio
 * (`CAMPOS_ANUNCIO`), 'anuncio-logo' ("Ajustar agora" e o desfazer) e 'anuncios-suspensao' (interruptor geral).
 */
import { describe, expect, it } from 'vitest';
import { ERRO_IMAGEM_ANIMADA } from '../shared/anuncios';
import { ErroValidacao, parseAdminCommand } from './validation';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SVG_ANIMADO = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect><animate attributeName="x" dur="1s"/></rect></svg>').toString('base64')}`;
const AJUSTE = { proporcao: 3.21649, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' };

const anuncio = (extra: Record<string, unknown> = {}) => ({
  id: 'lynx',
  marca: 'Lynx',
  titulo: 'Carteira digital com Pix em tempo real',
  texto: 'Cartão virtual e sem mensalidade.',
  cta: 'Saiba mais',
  url: 'https://lynxpix.cc',
  formatos: ['topo', 'nativo'],
  peso: 5,
  cota: 'master',
  ativo: true,
  inicio: null,
  fim: null,
  naoPolitico: true,
  ...extra,
});

/** Mensagem do ErroValidacao (ou null se passou). */
function erro(body: unknown): string | null {
  try {
    parseAdminCommand(body);
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(ErroValidacao);
    return (e as Error).message;
  }
}

describe("'anuncio-salvar' com os campos v2", () => {
  it('aceita ajustes, versão escura, reserva e meta (antes: 400 "campo desconhecido")', () => {
    const body = {
      tipo: 'anuncio-salvar',
      anuncio: anuncio({
        logo: PNG,
        logoAjuste: AJUSTE,
        logoEscuro: PNG,
        logoEscuroAjuste: AJUSTE,
        imagem: PNG,
        imagemAjuste: { ...AJUSTE, comFundo: true },
        reserva: true,
        limiteImpressoes: 50_000,
        inicio: Date.UTC(2026, 9, 20, 12),
      }),
    };
    expect(erro(body)).toBeNull();
    expect(erro({ tipo: 'anuncio-salvar', anuncio: anuncio({ limiteImpressoes: null }) })).toBeNull();
  });

  it('campo fora do contrato continua recusado; mensagens da validação única saem limpas', () => {
    expect(erro({ tipo: 'anuncio-salvar', anuncio: anuncio({ logoClaro: PNG }) })).toBe('Anúncio: campo desconhecido "logoClaro".');
    expect(erro({ tipo: 'anuncio-salvar', anuncio: anuncio({ limiteImpressoes: 10 }) })).toBe('Anúncio: meta de impressões de 1.000 a 50.000.000.');
    expect(erro({ tipo: 'anuncio-salvar', anuncio: anuncio({ limiteImpressoes: 10_000 }) })).toBe('Anúncio: com meta de impressões, informe o início.');
    expect(erro({ tipo: 'anuncio-salvar', anuncio: anuncio({ logoEscuro: SVG_ANIMADO }) })).toBe(ERRO_IMAGEM_ANIMADA);
  });

  it('categorias sensíveis recusadas no servidor (mesma validação)', () => {
    expect(erro({ tipo: 'anuncio-salvar', anuncio: anuncio({ marca: 'Bet Brasil' }) })).toMatch(/^Anúncio recusado: o Sintonia não aceita anúncios de apostas/);
    expect(erro({ tipo: 'anuncio-salvar', anuncio: anuncio({ url: 'https://polymarket.com' }) })).toMatch(/mercados de previsão/);
    expect(erro({ tipo: 'anuncio-salvar', anuncio: anuncio({ titulo: 'Cerveja gelada' }) })).toMatch(/bebida alcoólica.*25\/10 até as 19h/);
  });
});

describe("'anuncio-logo'", () => {
  it('troca só a logo: campos ausentes ficam de fora; ajuste normalizado', () => {
    expect(parseAdminCommand({ tipo: 'anuncio-logo', id: ' Lynx ' })).toEqual({ tipo: 'anuncio-logo', id: 'lynx' });
    expect(parseAdminCommand({ tipo: 'anuncio-logo', id: 'lynx', logo: ` ${PNG} `, logoAjuste: AJUSTE })).toEqual({
      tipo: 'anuncio-logo',
      id: 'lynx',
      logo: PNG,
      logoAjuste: { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' },
    });
  });

  it('null apaga (desfazer volta o original com logoAjuste: null)', () => {
    expect(parseAdminCommand({ tipo: 'anuncio-logo', id: 'lynx', logo: PNG, logoAjuste: null, logoEscuro: null, logoEscuroAjuste: null })).toEqual({
      tipo: 'anuncio-logo',
      id: 'lynx',
      logo: PNG,
      logoAjuste: null,
      logoEscuro: null,
      logoEscuroAjuste: null,
    });
  });

  it('URL do próprio servidor passa (o motor resolve); imagem externa, vazia ou animada não', () => {
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', logoEscuro: '/api/anuncio/img?h=0123456789abcdef' })).toBeNull();
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', logo: 'https://outro.site/logo.png' })).toBe('Anúncio: logo em PNG, JPEG, WebP ou SVG de até 150 KB.');
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', logoEscuro: 'data:image/gif;base64,R0lGOD' })).toBe(
      'Anúncio: versão para fundo escuro em PNG, JPEG, WebP ou SVG de até 150 KB.',
    );
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', logo: '' })).toBe('Anúncio: logo inválida.');
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', logo: 42 })).toBe('Anúncio: logo inválida.');
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', logo: SVG_ANIMADO })).toBe(ERRO_IMAGEM_ANIMADA);
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', logo: `data:image/png;base64,${'A'.repeat(210_000)}` })).toMatch(/150 KB/);
  });

  it('ajuste inválido, id inválido e campo a mais são recusados', () => {
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', logoAjuste: { proporcao: 40 } })).toBe('Anúncio: ajuste da logo inválido (proporção de 0,2 a 12).');
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', logoEscuroAjuste: 'auto' })).toMatch(/ajuste da logo inválido/);
    expect(erro({ tipo: 'anuncio-logo', id: 'Não Existe!' })).toMatch(/^Comando inválido — id: id de anúncio inválido/);
    expect(erro({ tipo: 'anuncio-logo', id: 'lynx', titulo: 'x' })).toMatch(/^Comando inválido/);
    expect(erro({ tipo: 'anuncio-logo' })).toMatch(/^Comando inválido — id/);
  });
});

describe("'anuncios-suspensao'", () => {
  it('suspender/voltar, com motivo opcional (até 140 caracteres, aparado)', () => {
    expect(parseAdminCommand({ tipo: 'anuncios-suspensao', suspender: true, motivo: '  pedido do jurídico ' })).toEqual({
      tipo: 'anuncios-suspensao',
      suspender: true,
      motivo: 'pedido do jurídico',
    });
    expect(parseAdminCommand({ tipo: 'anuncios-suspensao', suspender: false })).toEqual({ tipo: 'anuncios-suspensao', suspender: false });
    expect(erro({ tipo: 'anuncios-suspensao', suspender: true, motivo: 'x'.repeat(140) })).toBeNull();
    expect(erro({ tipo: 'anuncios-suspensao', suspender: true, motivo: 'x'.repeat(141) })).toBe('Comando inválido — motivo: máximo de 140 caracteres');
  });

  it('"suspender" é obrigatório e booleano; nada a mais', () => {
    expect(erro({ tipo: 'anuncios-suspensao' })).toMatch(/^Comando inválido — suspender/);
    expect(erro({ tipo: 'anuncios-suspensao', suspender: 'sim' })).toMatch(/^Comando inválido — suspender/);
    expect(erro({ tipo: 'anuncios-suspensao', suspender: true, motivo: 3 })).toMatch(/^Comando inválido — motivo/);
    expect(erro({ tipo: 'anuncios-suspensao', suspender: true, desde: 1 })).toMatch(/^Comando inválido/);
  });
});
