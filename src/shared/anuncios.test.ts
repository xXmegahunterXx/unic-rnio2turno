import { describe, expect, it } from 'vitest';
import {
  ANUNCIO_LIMITES,
  anuncioNoAr,
  conflitoMaster,
  ERRO_IMAGEM_ANIMADA,
  escolherAnuncio,
  FORMATOS_MASTER_PRIORITARIO,
  idDaMarca,
  imagemAnimada,
  LOGO_NATURAL,
  mediumUtm,
  PLACAS_LOGO,
  urlComUtm,
  validaAjusteImagem,
  validaAnuncio,
  validaContatoAnuncie,
  validaLogoAnuncio,
  type AnuncioConfig,
  type AnuncioPublico,
} from './anuncios';
import { escolherAnuncio as escolherDoModulo, FORMATOS_MASTER_PRIORITARIO as prioritariosDoModulo } from './anuncios-escolha';
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
    // endereço provisório (domínio reservado) nunca vai para o site
    expect(validaContatoAnuncie({ email: 'contato@example.com' })).toMatchObject({ erro: expect.stringMatching(/reservado/) });
    expect(validaContatoAnuncie({ email: 'comercial@sintonia.example' })).toMatchObject({ erro: expect.stringMatching(/reservado/) });
  });
});

// ---- contrato v2 (anunciantes v2, §3) -------------------------------------------------------------------------------

/** Bytes → data URI. */
const uri = (tipo: string, bytes: Uint8Array | string) => `data:${tipo};base64,${Buffer.from(bytes as Uint8Array).toString('base64')}`;
/** PNG com os chunks dados (o CRC não importa para a detecção). */
function png(...chunks: [string, number][]): Uint8Array {
  const partes: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [tipo, tam] of chunks) {
    const c = Buffer.alloc(12 + tam);
    c.writeUInt32BE(tam, 0);
    c.write(tipo, 4, 'latin1');
    partes.push(c);
  }
  return Buffer.concat(partes);
}
/** WebP: "RIFF" <tam> "WEBP" + chunks (tipo, dados). */
function webp(...chunks: [string, number[]][]): Uint8Array {
  const corpo = Buffer.concat(
    chunks.map(([tipo, dados]) => {
      const c = Buffer.alloc(8 + dados.length + (dados.length % 2));
      c.write(tipo, 0, 'latin1');
      c.writeUInt32LE(dados.length, 4);
      Buffer.from(dados).copy(c, 8);
      return c;
    }),
  );
  const cab = Buffer.alloc(12);
  cab.write('RIFF', 0, 'latin1');
  cab.writeUInt32LE(4 + corpo.length, 4);
  cab.write('WEBP', 8, 'latin1');
  return Buffer.concat([cab, corpo]);
}
const vp8x = (flags: number) => ['VP8X', [flags, 0, 0, 0, 9, 0, 0, 9, 0, 0]] as [string, number[]];

/** Os 4 arquivos animados do material de teste (anv2-criativos/animadas), inteiros: X01 APNG, X02 WebP animado,
 *  X03 SVG com <animate>, X04 SVG com @keyframes. */
const X01 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAABkCAIAAACzY5qXAAAACGFjVEwAAAADAAAAAM7tusAAAAAaZmNUTAAAAAAAAAEsAAAAZAAAAAAAAAAAAAMAGQAAO65YnAAAAS9JREFUeJzt0zEBACAMwDCGf88go8cSBX067wClWwfAdiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkh9gGK+AHHtnlYHQAAABpmY1RMAAAAAQAAASwAAABkAAAAAAAAAAAAAwAZAACg3bJIAAABNGZkQVQAAAACeJzt0zEBACAMwDDAv+dNRg8SBX16Z+YAnVcHwO9MCDETQsyEEDMhxEwIMRNCzIQQMyHETAgxE0LMhBAzIcRMCDETQsyEEDMhxEwIMRNCzIQQMyHETAgxE0LMhBAzIcRMCDETQsyEEDMhxEwIMRNCzIQQMyHETAgxE0LMhBAzIcRMCDETQsyEEDMhxEwIMRNCzIQQMyHETAgxE0LMhBAzIcRMCDETQsyEEDMhxEwIMRNCzIQQMyHETAgxE0LMhBAzIcRMCDETQsyEEDMhxEwIMRNCzIQQMyHETAgxE0LMhBAzIcRMCDETQsyEEDMhxEwIMRNCzIQQMyHETAgxE0LMhBAzIcRMCDETQsyEEDMhxEwIMRNCzIQQMyHETAgxE0LMhBAzIcRMCDETQsyEEDMhxEwIMRNCzIQQMyHETAgxE0LMhBAzIcRMCDETQmwB1ygDxWwLi1wAAAAaZmNUTAAAAAMAAAEsAAAAZAAAAAAAAAAAAAMAGQAATUthoQAAAHJmZEFUAAAABHic7cExAQAAAMKg9U9tB2+gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeA1gAwAB+67ztQAAAABJRU5ErkJggg==';
const X02 =
  'data:image/webp;base64,UklGRnQCAABXRUJQVlA4WAoAAAACAAAAKwEAYwAAQU5JTQYAAAAAAAAAAABBTk1G0AAAAAAAAAAAACsBAGMAAHgAAAJWUDgguAAAANAPAJ0BKiwBZAA+bTaaSaQjIqEgSACADYlpbt/wL0C8AfoBI+00B+AALgIeO8yOTPizX3mRyZXnypFxu9kWNb0i5bvlSLjd7Isa3pFy3fKkXG72RY1vSLlu+VIuN3sixrekXLd8qRcbvZFjW9IuW75Ui43eyLGt6Rct3ypFxu9kWNb0i5akAAD+8KIv//kFywuuRr//8gP+QH/ID/+PxaS9A991CLqEXUIuoRdQi6hF1CLpfiBAAABBTk1GtAAAAAAAAAAAACsBAGMAAHgAAABWUDggnAAAAFQOAJ0BKiwBZAAuTTabTYAABMS0t2/4F6BeAP0AkfUI4VzHKFyYNL6a5MGpFX5MLxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4qoAD+/Pcvl8nD0x9Hpj6PTH0emPo9MfR6Y+j0x9HpiYAAAEFOTUa0AAAAAAAAAAAAKwEAYwAAeAAAAFZQOCCcAAAAVA4AnQEqLAFkAC5NNptNgAAExLS3b/gXoF4A/QCR9QjhXMcoXJg0vprkwakVfkwvFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXivFeK8V4rxXiqgAP79OPTIrAPoUMWAfQoYsA+hQxYB9ChiwD6FDFgHKAAA';
const X03 = uri(
  'image/svg+xml',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><rect width="300" height="100" fill="#ef4444"><animate attributeName="fill" values="#ef4444;#ffffff;#000000" dur="0.36s" repeatCount="indefinite"/></rect><text x="20" y="64" font-family="Arial" font-size="40" font-weight="700" fill="#111">PISCA</text></svg>',
);
const X04 = uri('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><style>@keyframes p{0%{opacity:1}50%{opacity:0}}rect{animation:p .3s infinite}</style><rect width="300" height="100" fill="#2563eb"/></svg>');

const PNG_PARADO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SVG_PARADO = uri('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>rect{fill:#123}</style><rect width="10" height="10"/><text>settings</text></svg>');
const WEBP_PARADO = uri('image/webp', webp(vp8x(0x30), ['ALPH', [0, 1, 2]], ['VP8 ', [1, 2, 3, 4]])); // ICC + alfa, como a logo da Lynx no ar
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/';

describe('contrato v2: validaAjusteImagem', () => {
  it('normaliza: proporção 0,2–12 com 3 casas, placa desconhecida → "nenhuma", origem → "auto", comFundo só true', () => {
    expect(validaAjusteImagem({ proporcao: 3.21649, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' })).toStrictEqual({
      proporcao: 3.216,
      placaClaro: 'escura',
      placaEscuro: 'nenhuma',
      origem: 'auto',
    });
    expect(validaAjusteImagem({ proporcao: 1, placaClaro: 'azul', placaEscuro: 7, origem: 'manual', comFundo: true, extra: 'x' })).toStrictEqual({
      proporcao: 1,
      placaClaro: 'nenhuma',
      placaEscuro: 'nenhuma',
      origem: 'manual',
      comFundo: true,
    });
    expect(validaAjusteImagem({ proporcao: 12, placaClaro: 'clara', placaEscuro: 'clara', origem: 'qualquer', comFundo: 'true' })).toStrictEqual({
      proporcao: 12,
      placaClaro: 'clara',
      placaEscuro: 'clara',
      origem: 'auto',
    });
    expect(validaAjusteImagem({ proporcao: 0.2 })?.proporcao).toBe(0.2);
  });
  it('inválido → undefined (nunca lança)', () => {
    for (const v of [null, undefined, 'x', 3, [], {}, { proporcao: 0.19 }, { proporcao: 12.01 }, { proporcao: Number.NaN }, { proporcao: Infinity }, { proporcao: '3' }])
      expect(validaAjusteImagem(v), JSON.stringify(v)).toBeUndefined();
  });
  it('placas e interruptor do desenho novo', () => {
    expect(PLACAS_LOGO).toEqual(['nenhuma', 'clara', 'escura']);
    expect(LOGO_NATURAL).toBe(true);
    expect(ANUNCIO_LIMITES.limiteImpressoes).toEqual({ min: 1_000, max: 50_000_000 });
  });
});

describe('contrato v2: imagemAnimada', () => {
  it('recusa os 4 arquivos animados do material de teste (APNG, WebP animado, SVG <animate> e @keyframes)', () => {
    for (const [nome, u] of [['X01', X01], ['X02', X02], ['X03', X03], ['X04', X04]]) expect(imagemAnimada(u), nome).toBe(true);
  });
  it('PNG: acTL antes do IDAT é animado; depois do IDAT (ou sem acTL), parado', () => {
    expect(imagemAnimada(uri('image/png', png(['IHDR', 13], ['acTL', 8], ['IDAT', 10], ['IEND', 0])))).toBe(true);
    expect(imagemAnimada(uri('image/png', png(['IHDR', 13], ['IDAT', 10], ['acTL', 8], ['IEND', 0])))).toBe(false);
    // arquivo grande: só o começo é decodificado (o acTL vem antes do IDAT)
    expect(imagemAnimada(uri('image/png', png(['IHDR', 13], ['acTL', 8], ['IDAT', 300_000], ['IEND', 0])))).toBe(true);
    expect(imagemAnimada(uri('image/png', png(['IHDR', 13], ['IDAT', 300_000], ['IEND', 0])))).toBe(false);
    // metadado grande (tEXt/iTXt de 60 KB) ANTES do acTL: o acTL fica fora dos primeiros 64 KB do base64 — lê o resto
    expect(imagemAnimada(uri('image/png', png(['IHDR', 13], ['tEXt', 60_000], ['acTL', 8], ['IDAT', 10], ['IEND', 0])))).toBe(true);
    expect(imagemAnimada(uri('image/png', png(['IHDR', 13], ['iTXt', 60_000], ['IDAT', 10], ['IEND', 0])))).toBe(false);
    expect(imagemAnimada(PNG_PARADO)).toBe(false);
  });
  it('WebP: bit de animação do VP8X ou chunk ANIM/ANMF', () => {
    expect(imagemAnimada(uri('image/webp', webp(vp8x(0x02), ['VP8 ', [1, 2]])))).toBe(true);
    expect(imagemAnimada(uri('image/webp', webp(vp8x(0x10), ['ANIM', [0, 0, 0, 0, 0, 0]])))).toBe(true);
    expect(imagemAnimada(uri('image/webp', webp(['VP8L', [1, 2, 3]], ['ANMF', [1, 2]])))).toBe(true);
    expect(imagemAnimada(WEBP_PARADO)).toBe(false);
    expect(imagemAnimada(uri('image/webp', webp(['VP8L', [1, 2, 3]])))).toBe(false);
  });
  it('SVG parado, JPEG, URL do servidor e base64 quebrado passam; GIF disfarçado é tratado como animado', () => {
    expect(imagemAnimada(SVG_PARADO)).toBe(false);
    expect(imagemAnimada(JPEG)).toBe(false);
    expect(imagemAnimada('/api/anuncio/img?h=0123456789abcdef')).toBe(false);
    expect(imagemAnimada('data:image/png;base64,@@@@')).toBe(false);
    expect(imagemAnimada('data:image/png;base64,R0lGODlhAQABAAAAACw=')).toBe(true); // bytes de GIF com rótulo de PNG (lado seguro)
  });
  it('na validação: logo, versão escura e peça animadas são recusadas com a mesma mensagem', () => {
    expect(ERRO_IMAGEM_ANIMADA).toBe('Anúncio: use uma imagem parada (sem animação).');
    expect(validaAnuncio({ ...base, logo: X01 })).toEqual({ erro: ERRO_IMAGEM_ANIMADA });
    expect(validaAnuncio({ ...base, logo: X03 })).toEqual({ erro: ERRO_IMAGEM_ANIMADA });
    expect(validaAnuncio({ ...base, logoEscuro: X04 })).toEqual({ erro: ERRO_IMAGEM_ANIMADA });
    expect(validaAnuncio({ ...base, imagem: X02 })).toEqual({ erro: ERRO_IMAGEM_ANIMADA });
    expect('ok' in validaAnuncio({ ...base, logo: PNG_PARADO, logoEscuro: SVG_PARADO, imagem: WEBP_PARADO })).toBe(true);
  });
});

describe('contrato v2: validaLogoAnuncio', () => {
  const ajuste = { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' } as const;
  it('logo e versão escura com os ajustes; ajuste só fica com a imagem dele', () => {
    expect(validaLogoAnuncio({ logo: PNG_PARADO, logoAjuste: ajuste, logoEscuro: WEBP_PARADO, logoEscuroAjuste: { ...ajuste, placaClaro: 'clara' } })).toStrictEqual({
      ok: { logo: PNG_PARADO, logoAjuste: ajuste, logoEscuro: WEBP_PARADO, logoEscuroAjuste: { ...ajuste, placaClaro: 'clara' } },
    });
    expect(validaLogoAnuncio({ logoAjuste: ajuste, logoEscuroAjuste: ajuste })).toStrictEqual({ ok: {} });
    expect(validaLogoAnuncio({ logo: PNG_PARADO, logoAjuste: { proporcao: 40 } })).toStrictEqual({ ok: { logo: PNG_PARADO } });
    expect(validaLogoAnuncio(null)).toStrictEqual({ ok: {} });
  });
  it('mesma regra da logo de antes: data URI até 150 KB ou URL do servidor; nada de endereço externo', () => {
    expect(validaLogoAnuncio({ logo: '/api/anuncio/img?h=abcdef1234', logoEscuro: 'https://sintonia2026.com.br/api/anuncio/img?h=abcdef12345678' })).toStrictEqual({
      ok: { logo: '/api/anuncio/img?h=abcdef1234', logoEscuro: 'https://sintonia2026.com.br/api/anuncio/img?h=abcdef12345678' },
    });
    expect(validaLogoAnuncio({ logo: 'https://outro.site/logo.png' })).toEqual({ erro: 'Anúncio: logo em PNG, JPEG, WebP ou SVG de até 150 KB.' });
    expect(validaLogoAnuncio({ logoEscuro: 'data:image/gif;base64,R0lGOD' })).toEqual({ erro: 'Anúncio: versão para fundo escuro em PNG, JPEG, WebP ou SVG de até 150 KB.' });
    const grande = `data:image/png;base64,${'A'.repeat(ANUNCIO_LIMITES.logoDataUri)}`;
    expect('erro' in validaLogoAnuncio({ logoEscuro: grande })).toBe(true);
    expect(validaLogoAnuncio({ logo: X01 })).toEqual({ erro: ERRO_IMAGEM_ANIMADA });
  });
});

describe('contrato v2: validaAnuncio', () => {
  const T = Date.UTC(2026, 9, 20, 12);
  const ajuste = { proporcao: 3.21649, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' };
  const completo = {
    ...base,
    logo: PNG_PARADO,
    logoAjuste: ajuste,
    logoEscuro: SVG_PARADO,
    logoEscuroAjuste: { ...ajuste, placaClaro: 'nenhuma', origem: 'manual' },
    imagem: WEBP_PARADO,
    imagemAjuste: { proporcao: 3.2, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'auto', comFundo: true },
    reserva: true,
    limiteImpressoes: 100_000,
    inicio: T,
    fim: null,
  };

  it('anúncio com todos os campos novos sai inteiro (o painel envia `validacao.ok`)', () => {
    expect(validaAnuncio(completo)).toStrictEqual({
      ok: {
        id: 'lynx',
        marca: 'Lynx',
        titulo: 'Pix na hora',
        texto: 'Conta digital',
        cta: 'Abrir conta',
        url: 'https://lynx.exemplo.com.br/?a=1',
        formatos: ['topo', 'nativo'],
        peso: 5,
        cota: 'apoio', // reserva força 'apoio'
        ativo: true,
        inicio: T,
        fim: null,
        naoPolitico: true,
        logo: PNG_PARADO,
        logoAjuste: { ...ajuste, proporcao: 3.216 },
        logoEscuro: SVG_PARADO,
        logoEscuroAjuste: { proporcao: 3.216, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'manual' },
        imagem: WEBP_PARADO,
        imagemAjuste: { proporcao: 3.2, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'auto', comFundo: true },
        reserva: true,
        limiteImpressoes: 100_000,
      },
    });
  });

  it('payload antigo (b88dfe1) continua igual: nenhum campo novo aparece', () => {
    const r = validaAnuncio({ ...base, logo: PNG_PARADO, imagem: JPEG, inicio: null, fim: null });
    expect(r).toStrictEqual({
      ok: {
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
        inicio: null,
        fim: null,
        naoPolitico: true,
        logo: PNG_PARADO,
        imagem: JPEG,
      },
    });
  });

  it('reserva só com true; ajustes só com a imagem deles', () => {
    for (const reserva of [false, 'true', 1, null]) {
      const r = validaAnuncio({ ...base, reserva });
      expect('ok' in r && r.ok.cota).toBe('master');
      expect('ok' in r && 'reserva' in r.ok).toBe(false);
    }
    const r = validaAnuncio({ ...base, logoAjuste: ajuste, logoEscuroAjuste: ajuste, imagemAjuste: ajuste, logoEscuro: '' });
    expect('ok' in r && Object.keys(r.ok).filter((k) => /Ajuste|Escuro/.test(k))).toEqual([]);
  });

  it('meta de impressões: inteiro de 1.000 a 50 milhões, com início; null/ausente é omitido', () => {
    const meta = (limiteImpressoes: unknown, inicio: number | null = T) => validaAnuncio({ ...base, limiteImpressoes, inicio });
    expect(meta(1_000)).toMatchObject({ ok: { limiteImpressoes: 1_000 } });
    expect(meta(50_000_000)).toMatchObject({ ok: { limiteImpressoes: 50_000_000 } });
    for (const v of [999, 50_000_001, 1500.5, '5000', Number.NaN, 0, -1])
      expect(meta(v), String(v)).toEqual({ erro: 'Anúncio: meta de impressões de 1.000 a 50.000.000.' });
    expect(meta(10_000, null)).toEqual({ erro: 'Anúncio: com meta de impressões, informe o início.' });
    for (const v of [null, undefined]) {
      const r = meta(v, null);
      expect('ok' in r && 'limiteImpressoes' in r.ok).toBe(false);
    }
  });
});

describe('contrato v2: conflitoMaster', () => {
  type A = Pick<AnuncioConfig, 'id' | 'marca' | 'formatos' | 'cota' | 'ativo' | 'inicio' | 'fim' | 'reserva'>;
  const H = 3_600_000;
  /** dd/10/2026, hh:00 de Brasília (UTC−3). */
  const brt = (dia: number, h: number) => Date.UTC(2026, 9, dia, h + 3);
  const m = (id: string, extra: Partial<A> = {}): A => ({ id, marca: id.toUpperCase(), formatos: ['topo', 'nativo'], cota: 'master', ativo: true, inicio: null, fim: null, ...extra });

  it('dois masters ativos, sem reserva, no mesmo formato prioritário e com janelas que se cruzam', () => {
    expect(conflitoMaster([m('lynx')], m('outra'))).toEqual({ id: 'lynx', marca: 'LYNX', formato: 'topo' });
    expect(conflitoMaster([m('lynx', { formatos: ['nativo', 'tv'] })], m('outra', { formatos: ['tv', 'live'] }))).toEqual({ id: 'lynx', marca: 'LYNX', formato: 'tv' });
    expect(conflitoMaster([m('lynx', { inicio: brt(25, 17), fim: brt(26, 2) })], m('outra', { inicio: brt(25, 20) }))).not.toBeNull();
  });

  it('sem conflito: apoio, reserva, pausado, mesmo id, só formato não prioritário', () => {
    expect(conflitoMaster([m('lynx', { cota: 'apoio' })], m('outra'))).toBeNull();
    expect(conflitoMaster([m('lynx')], m('outra', { cota: 'apoio' }))).toBeNull();
    expect(conflitoMaster([m('lynx', { reserva: true })], m('outra'))).toBeNull();
    expect(conflitoMaster([m('lynx')], m('outra', { reserva: true }))).toBeNull();
    expect(conflitoMaster([m('lynx', { ativo: false })], m('outra'))).toBeNull();
    expect(conflitoMaster([m('lynx', { ativo: true })], m('outra', { ativo: false }))).toBeNull();
    expect(conflitoMaster([m('lynx')], m('lynx'))).toBeNull(); // editar o próprio anúncio
    expect(conflitoMaster([m('lynx', { formatos: ['nativo', 'rodape'] })], m('outra', { formatos: ['nativo', 'chat'] }))).toBeNull();
    expect(FORMATOS_MASTER_PRIORITARIO).toEqual(['topo', 'tv', 'live', 'compartilhamento']);
    expect(prioritariosDoModulo).toBe(FORMATOS_MASTER_PRIORITARIO);
  });

  it('janelas encostadas não se cruzam (inclusive na virada das 23h para 0h em UTC−3)', () => {
    // 24/10 21h → 25/10 0h (Brasília) e 25/10 0h → 2h: encostadas na meia-noite de Brasília (03:00 UTC)
    const a = m('lynx', { inicio: brt(24, 21), fim: brt(25, 0) });
    expect(new Date(brt(25, 0)).toISOString()).toBe('2026-10-25T03:00:00.000Z');
    expect(conflitoMaster([a], m('outra', { inicio: brt(25, 0), fim: brt(25, 2) }))).toBeNull();
    expect(conflitoMaster([a], m('outra', { inicio: brt(24, 23), fim: brt(25, 1) }))).toEqual({ id: 'lynx', marca: 'LYNX', formato: 'topo' });
    expect(conflitoMaster([a], m('outra', { inicio: brt(25, 0) - H / 60 }))).not.toBeNull(); // 1 min antes da meia-noite
    expect(conflitoMaster([m('lynx', { fim: brt(25, 17) })], m('outra', { inicio: brt(25, 17) }))).toBeNull(); // janela aberta antes
    expect(conflitoMaster([m('lynx', { inicio: brt(25, 17) })], m('outra', { fim: brt(25, 17) }))).toBeNull();
  });
});

describe('contrato v2: escolha com a cota Reserva', () => {
  const ad = (id: string, extra: Partial<AnuncioPublico> = {}): AnuncioPublico => ({
    id,
    marca: id,
    titulo: 't',
    texto: '',
    cta: 'c',
    href: '#',
    destino: `${id}.com`,
    formatos: ['topo', 'nativo', 'chat'],
    peso: 5,
    cota: 'apoio',
    ...extra,
  });

  it('reserva nunca vence um pago elegível (nem com peso maior)', () => {
    const lista = [ad('lynx', { reserva: true, peso: 10 }), ad('updepix', { peso: 1 })];
    for (const f of ['topo', 'nativo', 'chat'] as const) for (let i = 0; i < 200; i++) expect(escolherAnuncio(lista, f, `s${i}`)?.id).toBe('updepix');
  });

  it('reserva preenche o formato sem pago', () => {
    const lista = [ad('lynx', { reserva: true, formatos: ['chat', 'live'] }), ad('updepix', { formatos: ['topo'] })];
    expect(escolherAnuncio(lista, 'chat', 'x')?.id).toBe('lynx');
    expect(escolherAnuncio(lista, 'live', 'x')?.id).toBe('lynx');
    expect(escolherAnuncio(lista, 'topo', 'x')?.id).toBe('updepix');
  });

  it('reserva preenche o 3º cartão quando os pagos já apareceram na página (depois do "evitar")', () => {
    const lista = [ad('a'), ad('b'), ad('lynx', { reserva: true })];
    for (let i = 0; i < 50; i++) expect(escolherAnuncio(lista, 'nativo', `n3-${i}`, ['a', 'b'])?.id).toBe('lynx');
    // com um pago ainda não visto, ele vence a reserva
    for (let i = 0; i < 50; i++) expect(escolherAnuncio(lista, 'nativo', `n2-${i}`, ['a'])?.id).toBe('b');
  });

  it('master com reserva é tratado como apoio (não tira o pago do topo)', () => {
    const lista = [ad('lynx', { cota: 'master', reserva: true }), ad('updepix')];
    for (let i = 0; i < 100; i++) expect(escolherAnuncio(lista, 'topo', `t${i}`)?.id).toBe('updepix');
    // master pago continua com a prioridade nos formatos prioritários
    const comMaster = [ad('m', { cota: 'master' }), ad('updepix'), ad('lynx', { reserva: true })];
    for (let i = 0; i < 100; i++) expect(escolherAnuncio(comMaster, 'topo', `t${i}`)?.id).toBe('m');
  });
});
