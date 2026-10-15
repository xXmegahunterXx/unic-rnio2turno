import { describe, expect, it } from 'vitest';
import { anuncioNoAr, escolherAnuncio, idDaMarca, mediumUtm, urlComUtm, validaAnuncio, validaContatoAnuncie, type AnuncioPublico } from './anuncios';
import { escolherAnuncio as escolherDoModulo } from './anuncios-escolha';
import { motivoPolitico } from './anuncios-politica';

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

describe('barreira político-eleitoral', () => {
  const erro = (extra: Record<string, unknown>, nomes?: string[]) => {
    const r = validaAnuncio({ ...base, ...extra }, { nomesCandidatos: nomes });
    return 'erro' in r ? r.erro : null;
  };

  it('recusa o caso do revisor (nome, número e sigla) mesmo com a declaração marcada', () => {
    const e = erro({ marca: 'Lula Presidente 13', titulo: 'Vote 22 Bolsonaro no 2º turno', texto: 'PT e PL', url: 'https://lula.com.br', cta: 'Vote' });
    expect(e).toMatch(/político-eleitoral/);
  });

  it('nomes de candidatos (fixos e do dataset), sem diferenciar acento nem caixa', () => {
    expect(erro({ titulo: 'Promoção do LULA' })).toMatch(/nome de candidato/);
    expect(erro({ texto: 'bolsonaro na promo' })).toMatch(/nome de candidato/);
    expect(erro({ marca: 'Flavio Bolsonaro Store' })).toMatch(/nome de candidato/);
    expect(erro({ titulo: 'Café da Celina Leao' }, ['Celina Leão'])).toMatch(/nome de candidato/);
    expect(erro({ titulo: 'Café da Celina Leao' })).toBeNull(); // sem a lista do dataset (só o motor tem)
    expect(erro({ titulo: 'Pix na hora com Omar' }, ['Omar Aziz'])).toBeNull(); // frase inteira, não pedaço
  });

  it('termos eleitorais e número de urna como voto', () => {
    for (const titulo of ['Vote no melhor', 'Eleja quem você quer', 'Conheça o candidato', 'Filie-se ao partido', 'Coligação Brasil', 'Material eleitoral', 'Seu voto importa', 'Digite 13 e confirme', 'Aperte 22', '45 confirma', 'Somos petistas'])
      expect(erro({ titulo }), titulo).toMatch(/político-eleitoral/);
  });

  it('siglas de partido só em maiúsculas e como palavra inteira', () => {
    expect(erro({ texto: 'Apoio do PT' })).toMatch(/sigla de partido "PT"/);
    expect(erro({ cta: 'PSOL' })).toMatch(/sigla/);
    expect(erro({ texto: 'Optamos pelo melhor' })).toBeNull();
    expect(erro({ texto: 'Plano completo' })).toBeNull();
    expect(erro({ url: 'https://lynx.exemplo.com.br/pt-br/conta' })).toBeNull(); // locale no link não é sigla
  });

  it('destinos de governo, de partido e com nome de candidato', () => {
    expect(erro({ url: 'https://www.gov.br/secom' })).toMatch(/governo/);
    expect(erro({ url: 'https://portal.saude.gov.br/x' })).toMatch(/governo/);
    expect(erro({ url: 'https://www.camara.leg.br' })).toMatch(/governo/);
    expect(erro({ url: 'https://www.tse.jus.br' })).toMatch(/governo/);
    expect(erro({ url: 'https://pt.org.br/filie-se' })).toMatch(/partido/);
    expect(erro({ url: 'https://pl22.org.br' })).toMatch(/partido/);
    expect(erro({ url: 'https://lula.com.br' })).toMatch(/nome de candidato/);
    expect(erro({ url: 'https://flaviobolsonaro.com.br' })).toMatch(/nome de candidato/);
    expect(erro({ url: 'https://loja-bolsonaro.com.br' })).toMatch(/nome de candidato/);
    expect(erro({ url: 'https://linktr.ee/lula' })).toMatch(/nome de candidato/);
    expect(erro({ url: 'https://exemplo.com.br/vote-13' })).toMatch(/político-eleitoral/);
  });

  it('não recusa anúncio comum (marcas do dono e frases de varejo)', () => {
    for (const extra of [
      { marca: 'Lynx', titulo: 'Pix na hora, sem tarifa', url: 'https://lynx.com.br' },
      { marca: 'UPdePix', titulo: 'Receba por Pix em segundos', url: 'https://updepix.com.br' },
      { marca: 'Vulpix', titulo: '13º salário antecipado', texto: 'Ofertas de 22% até domingo', url: 'https://vulpix.com.br/promo' },
      { marca: 'Café Imaginário', titulo: 'Eleito o melhor café da cidade', cta: 'Pedir agora', url: 'https://cafe.exemplo.org' },
      { marca: 'Loja', titulo: 'Partida de futebol no telão', texto: 'Nossos votos de boas festas', url: 'https://loja.exemplo.net' },
    ])
      expect(erro(extra), JSON.stringify(extra)).toBeNull();
  });

  it('a mensagem diz o campo', () => {
    expect(motivoPolitico([{ campo: 'título', valor: 'Vote' }], 'https://x.com.br')).toContain('"título"');
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
  it('UTM do Teste Cego neutra (não conta ao anunciante que a visita fez o teste)', () => {
    expect(mediumUtm('teste')).toBe('conteudo');
    expect(mediumUtm('nativo')).toBe('nativo');
    expect(new URL(urlComUtm('https://x.com.br', 'lynx', 'teste')).searchParams.get('utm_medium')).toBe('conteudo');
  });
  it('a escolha mora num módulo próprio (JS inicial do site) e é a mesma reexportada pelo contrato', () => {
    expect(escolherDoModulo).toBe(escolherAnuncio);
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
