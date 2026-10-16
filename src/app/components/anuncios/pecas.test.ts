/**
 * Peças dos formatos de anúncio (renderização estática, como em live/layouts.test.ts): a logo na proporção natural com a
 * placa certa por tema (anunciantes v2, E2), o rótulo e o link patrocinado de cada formato, o nome que sai do texto
 * quando a logo é um logotipo (e continua no rótulo de leitor de tela), a faixa do topo premium (E9) e a peça
 * transparente na placa do contraste (E5).
 */
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AjusteImagem, AnuncioPublico } from '@/shared/anuncios';
import { AnuncioNativoPeca } from './AnuncioNativoPeca';
import { BarraRodapePeca } from './BarraRodape';
import { FaixaTopoPeca } from './FaixaTopoPeca';
import { OferecimentoTestePeca, OferecimentoTvPeca } from './Oferecimento';
import { OferecimentoChatPeca } from './OferecimentoChat';
import { OferecimentoLivePeca } from './OferecimentoLive';
import { VitrineFormato } from './Vitrine';
import { LogoMarca, TemaLocal } from './pecas';
import type { TemaLogo } from './logo';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
/** A classe da placa branca antiga (montada aqui para o `grep` do aceite na pasta dar 0). */
const PLACA_ANTIGA = ['bg', 'brand', 'ink'].join('-');
const TITULO = 'Carteira digital com Pix em tempo real e sem mensalidade';
/** Lynx transparente (gabarito §4): 3,216; placa escura no claro, nenhuma no escuro. */
const AJUSTE_LYNX: AjusteImagem = { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' };

const LYNX: AnuncioPublico = {
  id: 'lynx',
  marca: 'Lynx',
  titulo: TITULO,
  texto: 'Conta digital gratuita.',
  cta: 'Abrir conta',
  href: 'https://sintonia2026.com.br/api/anuncio/ir/lynx',
  destino: 'lynxpix.cc',
  logo: PNG,
  logoAjuste: AJUSTE_LYNX,
  formatos: ['topo', 'rodape', 'nativo', 'teste', 'tv', 'compartilhamento', 'chat', 'live'],
  peso: 5,
  cota: 'master',
};

const noTema = (tema: TemaLogo, el: ReactElement) =>
  renderToStaticMarkup(createElement(TemaLocal.Provider, { value: tema }, createElement(MemoryRouter, null, el)));

/** Texto visível (sem tags nem atributos). */
const textoVisivel = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const placasDaLogo = (html: string) => [...html.matchAll(/data-logo-placa="([a-z]+)"/g)].map((m) => m[1]);

interface Caso {
  nome: string;
  rotulo: string;
  link: boolean;
  el: (a: AnuncioPublico) => ReactElement;
}

const CASOS: Caso[] = [
  { nome: 'FaixaTopoPeca', rotulo: 'Publicidade', link: true, el: (a) => createElement(FaixaTopoPeca, { anuncio: a }) },
  { nome: 'BarraRodapePeca', rotulo: 'Publicidade', link: true, el: (a) => createElement(BarraRodapePeca, { anuncio: a }) },
  { nome: 'AnuncioNativoPeca (faixa)', rotulo: 'Patrocinado', link: true, el: (a) => createElement(AnuncioNativoPeca, { anuncio: a, variante: 'faixa' }) },
  { nome: 'OferecimentoTestePeca', rotulo: 'Teste Cego oferecido por', link: true, el: (a) => createElement(OferecimentoTestePeca, { anuncio: a }) },
  { nome: 'OferecimentoTvPeca (cabeçalho)', rotulo: 'Oferecimento', link: false, el: (a) => createElement(OferecimentoTvPeca, { anuncio: a, variante: 'cabecalho' }) },
  { nome: 'OferecimentoTvPeca (quadro)', rotulo: 'Oferecimento', link: false, el: (a) => createElement(OferecimentoTvPeca, { anuncio: a, variante: 'quadro' }) },
  { nome: 'OferecimentoChatPeca', rotulo: 'Sala oferecida por', link: true, el: (a) => createElement(OferecimentoChatPeca, { anuncio: a }) },
  { nome: 'OferecimentoLivePeca (cabeçalho)', rotulo: 'Oferecido por', link: false, el: (a) => createElement(OferecimentoLivePeca, { anuncio: a, variante: 'cabecalho' }) },
  { nome: 'OferecimentoLivePeca (aba)', rotulo: 'Oferecido por', link: false, el: (a) => createElement(OferecimentoLivePeca, { anuncio: a, variante: 'aba' }) },
];

describe('peças com a Lynx ajustada (logotipo), nos dois temas', () => {
  for (const c of CASOS)
    for (const tema of ['claro', 'escuro'] as const)
      it(`${c.nome} · ${tema}`, () => {
        const html = noTema(tema, c.el(LYNX));
        expect(html).not.toContain(PLACA_ANTIGA);
        expect(textoVisivel(html)).toContain(c.rotulo);
        // rótulo de leitor de tela com a marca (o nome saiu do texto visível)
        expect(html).toMatch(/aria-label="[^"]*Lynx/);
        expect(textoVisivel(html)).not.toContain('Lynx');
        if (c.link) {
          expect(html).toContain('rel="sponsored noopener noreferrer"');
          expect(html).toContain('target="_blank"');
        } else expect(html).not.toContain('<a ');
        // a placa por tema (gabarito da Lynx): sem placa no escuro, placa escura no claro
        const placas = placasDaLogo(html);
        expect(placas.length).toBeGreaterThan(0);
        expect(new Set(placas)).toEqual(new Set([tema === 'escuro' ? 'nenhuma' : 'escura']));
        expect(html).toContain(`data-logo-tema="${tema}"`);
        // largura e proporção reservadas no estilo (nada pula quando a imagem chega)
        expect(html).toMatch(/aspect-ratio:3\.216/);
      });
});

describe('peças com logo antiga, ícone e sem logo', () => {
  it('logo sem ajuste: o desenho antigo (placa clara quadrada) e o nome em texto, nos dois temas', () => {
    const antiga = { ...LYNX, logoAjuste: undefined };
    for (const tema of ['claro', 'escuro'] as const)
      for (const c of CASOS) {
        const html = noTema(tema, c.el(antiga));
        expect(placasDaLogo(html), c.nome).toEqual(expect.arrayContaining(['legado']));
        expect(html).toContain('bg-placa-clara');
        expect(html).not.toContain(PLACA_ANTIGA);
        expect(textoVisivel(html), c.nome).toContain('Lynx');
      }
  });

  it('ícone com ajuste (proporção 1): nome em texto ao lado', () => {
    const icone = { ...LYNX, logoAjuste: { proporcao: 1, placaClaro: 'nenhuma', placaEscuro: 'clara', origem: 'auto' } as AjusteImagem };
    const escuro = noTema('escuro', createElement(FaixaTopoPeca, { anuncio: icone }));
    expect(placasDaLogo(escuro)).toEqual(['clara']);
    expect(textoVisivel(escuro)).toContain('Lynx');
    expect(escuro).toContain('bg-placa-clara');
    const claro = noTema('claro', createElement(FaixaTopoPeca, { anuncio: icone }));
    expect(placasDaLogo(claro)).toEqual(['nenhuma']);
  });

  it('sem logo: monograma com as iniciais', () => {
    const sem = { ...LYNX, logo: undefined, logoAjuste: undefined };
    const html = noTema('escuro', createElement(OferecimentoTvPeca, { anuncio: sem, variante: 'cabecalho' }));
    expect(placasDaLogo(html)).toEqual(['monograma']);
    expect(textoVisivel(html)).toContain('Lynx');
  });

  it('fundo próprio (JPEG com fundo branco): sem placa, cantos e filete na própria imagem', () => {
    const mercado = { ...LYNX, logoAjuste: { proporcao: 5.211, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'auto', comFundo: true } as AjusteImagem };
    const html = renderToStaticMarkup(createElement(TemaLocal.Provider, { value: 'escuro' }, createElement(LogoMarca, { anuncio: mercado })));
    expect(placasDaLogo(html)).toEqual(['nenhuma']);
    expect(html).toMatch(/<img[^>]*class="[^"]*rounded-\[calc\(var\(--lh\)\*0\.18\)\][^"]*ring-1/);
  });

  it('versão para fundo escuro: usada só no tema escuro', () => {
    const ESCURA = 'data:image/png;base64,RVNDVVJB';
    const a = { ...LYNX, logoEscuro: ESCURA, logoEscuroAjuste: { ...AJUSTE_LYNX, placaClaro: 'nenhuma' } as AjusteImagem };
    expect(noTema('escuro', createElement(LogoMarca, { anuncio: a }))).toContain(ESCURA);
    expect(noTema('claro', createElement(LogoMarca, { anuncio: a }))).not.toContain(ESCURA);
  });

  it('prioridade: a logo do topo não espera a rolagem (sem loading=lazy)', () => {
    expect(noTema('escuro', createElement(LogoMarca, { anuncio: LYNX, prioridade: true }))).not.toContain('loading="lazy"');
    expect(noTema('escuro', createElement(LogoMarca, { anuncio: LYNX }))).toContain('loading="lazy"');
  });
});

describe('faixa do topo premium (E9)', () => {
  it('título inteiro, "Publicidade", link patrocinado e o rótulo com a marca', () => {
    for (const tema of ['claro', 'escuro'] as const) {
      const html = noTema(tema, createElement(FaixaTopoPeca, { anuncio: LYNX }));
      expect(textoVisivel(html)).toContain(TITULO);
      expect(html).not.toContain('…');
      expect(textoVisivel(html)).toContain('Publicidade');
      expect(html).toContain('rel="sponsored noopener noreferrer"');
      expect(html).toMatch(/aria-label="Publicidade de Lynx: Carteira digital com Pix em tempo real e sem mensalidade\. Abrir conta em lynxpix\.cc \(abre em nova aba\)"/);
      // 60 px abaixo de 1024 px e 64 px a partir dele; a logo grande sem lazy
      expect(html).toContain('h-[60px] lg:h-16');
      expect(html).toContain('[--logo-h:34px]');
      expect(html).toContain('lg:[--logo-h:40px]');
      expect(html).not.toMatch(/<img[^>]*data-logo[^>]*loading="lazy"/);
    }
  });
  it('compacta (vitrine/prévia): só a versão do celular, 60 px', () => {
    const html = noTema('escuro', createElement(FaixaTopoPeca, { anuncio: LYNX, compacta: true, previa: true }));
    expect(html).toContain('h-[60px]');
    for (const c of ['lg:h-16', 'lg:[--logo-h', 'lg:hidden', 'lg:inline', 'lg:block']) expect(html).not.toContain(c);
    expect(html).not.toContain('<a ');
    expect(html).toContain('Prévia: Publicidade de Lynx');
  });
});

describe('peça do cartão nativo (E5)', () => {
  const P07: AjusteImagem = { proporcao: 2.928, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' };
  const comPeca = (imagemAjuste?: AjusteImagem) => ({ ...LYNX, imagem: PNG, imagemAjuste });
  const cartao = (tema: TemaLogo, a: AnuncioPublico) => noTema(tema, createElement(AnuncioNativoPeca, { anuncio: a, variante: 'cartao' }));
  const copiasDesfocadas = (html: string) => (html.match(/blur-2xl/g) ?? []).length;

  it('transparente com placa: área na placa do tema, sem a cópia desfocada, proporção reservada', () => {
    const html = cartao('claro', comPeca(P07));
    expect(html).toContain('data-peca-placa="escura"');
    expect(html).toContain('bg-placa-escura');
    expect(copiasDesfocadas(html)).toBe(0);
    expect(html).toMatch(/aspect-ratio:2\.928/);
  });
  it('transparente sem placa no tema: superfície (e a cópia desfocada de antes)', () => {
    const html = cartao('escuro', comPeca(P07));
    expect(html).toContain('data-peca-placa="nenhuma"');
    expect(html).toContain('bg-surface-2');
    expect(copiasDesfocadas(html)).toBe(1);
  });
  it('opaca ou sem ajuste: como antes', () => {
    const opaca = cartao('claro', comPeca({ proporcao: 3.2, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'auto', comFundo: true }));
    expect(opaca).toContain('data-peca-placa="legado"');
    expect(copiasDesfocadas(opaca)).toBe(1);
    expect(opaca).toMatch(/aspect-ratio:3\.2/);
    const antiga = cartao('claro', comPeca());
    expect(antiga).toContain('data-peca-placa="legado"');
    expect(antiga).toContain('max-h-[320px]');
    expect(antiga).not.toMatch(/alt="Peça publicitária de Lynx"[^>]*style=/);
  });
});

describe('vitrine das imagens de compartilhamento', () => {
  it('logo ajustada no tema escuro (como o servidor); sem ajuste, o texto "Oferecimento: marca"', () => {
    const com = noTema('claro', createElement(VitrineFormato, { anuncio: LYNX, formato: 'compartilhamento' }));
    expect(com).toContain('data-tema-local="escuro"');
    expect(placasDaLogo(com)).toEqual(['nenhuma']);
    expect(textoVisivel(com)).toContain('Oferecimento');
    const sem = noTema('claro', createElement(VitrineFormato, { anuncio: { ...LYNX, logoAjuste: undefined }, formato: 'compartilhamento' }));
    expect(textoVisivel(sem)).toContain('Oferecimento: Lynx');
    expect(placasDaLogo(sem)).toEqual([]);
  });
});
