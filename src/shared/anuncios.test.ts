import { describe, expect, it } from 'vitest';
import { anuncioNoAr, escolherAnuncio, idDaMarca, urlComUtm, validaAnuncio, validaContatoAnuncie, type AnuncioPublico } from './anuncios';

const base = {
  id: 'lynx',
  marca: 'Lynx',
  titulo: 'Pix na hora',
  texto: 'Conta digital',
  cta: 'Abrir conta',
  url: 'https://lynx.exemplo.com.br/?a=1',
  formatos: ['topo', 'nativo'],
  peso: 5,
  cota: 'master',
  ativo: true,
  naoPolitico: true,
};

describe('validaAnuncio', () => {
  it('aceita e normaliza', () => {
    const r = validaAnuncio({ ...base, formatos: ['nativo', 'topo', 'xx'], marca: '  Lynx  ' });
    expect('ok' in r && r.ok.formatos).toEqual(['topo', 'nativo']);
    expect('ok' in r && r.ok.marca).toBe('Lynx');
  });
  it('exige https, declaração não política e formato', () => {
    expect('erro' in validaAnuncio({ ...base, url: 'http://x.com' })).toBe(true);
    expect('erro' in validaAnuncio({ ...base, naoPolitico: false })).toBe(true);
    expect('erro' in validaAnuncio({ ...base, formatos: [] })).toBe(true);
    expect('erro' in validaAnuncio({ ...base, id: 'A B' })).toBe(true);
  });
  it('imagens: data URI dentro do limite ou URL do servidor', () => {
    expect('ok' in validaAnuncio({ ...base, logo: 'data:image/png;base64,iVBORw0KGgo=' })).toBe(true);
    expect('ok' in validaAnuncio({ ...base, logo: '/api/anuncio/img?h=abcdef1234' })).toBe(true);
    expect('erro' in validaAnuncio({ ...base, logo: 'https://outro.site/logo.png' })).toBe(true);
    expect('erro' in validaAnuncio({ ...base, imagem: 'data:image/gif;base64,R0lGOD' })).toBe(true);
  });
});

describe('rotação', () => {
  const ads: AnuncioPublico[] = [
    { id: 'a', marca: 'A', titulo: 't', texto: '', cta: 'c', href: '#', destino: 'a.com', formatos: ['topo', 'nativo'], peso: 1, cota: 'apoio' },
    { id: 'b', marca: 'B', titulo: 't', texto: '', cta: 'c', href: '#', destino: 'b.com', formatos: ['topo', 'nativo'], peso: 9, cota: 'master' },
    { id: 'c', marca: 'C', titulo: 't', texto: '', cta: 'c', href: '#', destino: 'c.com', formatos: ['nativo'], peso: 5, cota: 'apoio' },
  ];
  it('master vence no topo', () => {
    for (let i = 0; i < 20; i++) expect(escolherAnuncio(ads, 'topo', `v${i}`)?.id).toBe('b');
  });
  it('determinística pela semente e respeita "evitar"', () => {
    expect(escolherAnuncio(ads, 'nativo', 'x')?.id).toBe(escolherAnuncio(ads, 'nativo', 'x')?.id);
    expect(escolherAnuncio(ads, 'nativo', 'x', ['a', 'b'])?.id).toBe('c');
    expect(escolherAnuncio(ads, 'teste', 'x')).toBeNull();
  });
  it('distribui pelo peso', () => {
    const cont: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const id = escolherAnuncio(ads, 'nativo', `s${i}`)!.id;
      cont[id] = (cont[id] ?? 0) + 1;
    }
    expect(cont.b).toBeGreaterThan(cont.c);
    expect(cont.c).toBeGreaterThan(cont.a);
  });
});

describe('utilitários', () => {
  it('UTM sem apagar parâmetros', () => {
    const u = new URL(urlComUtm('https://x.com.br/p?a=1&utm_source=meu', 'lynx', 'topo'));
    expect(u.searchParams.get('a')).toBe('1');
    expect(u.searchParams.get('utm_source')).toBe('meu');
    expect(u.searchParams.get('utm_medium')).toBe('topo');
    expect(u.searchParams.get('utm_campaign')).toBe('lynx');
  });
  it('janela e id', () => {
    expect(anuncioNoAr({ ativo: true, inicio: 10, fim: 20 }, 15)).toBe(true);
    expect(anuncioNoAr({ ativo: true, inicio: 10, fim: 20 }, 20)).toBe(false);
    expect(anuncioNoAr({ ativo: false }, 15)).toBe(false);
    expect(idDaMarca('Lynx Pay!')).toBe('lynx-pay');
    expect(idDaMarca('É')).toBe('anuncio-e');
  });
  it('contato', () => {
    expect(validaContatoAnuncie({ whatsapp: '+55 (11) 99999-9999', email: 'a@b.co' })).toEqual({ ok: { whatsapp: '5511999999999', email: 'a@b.co' } });
    expect('erro' in validaContatoAnuncie({ email: 'x' })).toBe(true);
  });
});
