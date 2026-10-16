/**
 * Anúncios no motor (src/shared/anuncios.ts): comandos 'anuncio-salvar' | 'anuncio-remover' | 'anuncio-ativo' |
 * 'anuncie-contato', `status().anuncios` (no ar pelo relógio REAL), imagens que voltam do admin como URL do servidor,
 * persistência (ida e volta) e limites.
 */
import { describe, expect, it, vi } from 'vitest';
import { ANUNCIO_LIMITES, type AnuncioConfig } from '../../shared/anuncios';
import type { AdminState } from '../../shared/types';
import { CommandError, type LoadedDataset } from '../api';
import { createController } from '../controller';
import { cenarioPadrao } from '../scenario';
import { estadoPadrao, parseAdminState } from '../state';
import { buildStructure } from '../structure';
import { dataset, relogio } from './helpers';
import { semSecao } from './secao-sintetica';

const ds: LoadedDataset = semSecao(await dataset());
const st = buildStructure(ds);
/** 15/10/2026 12:00 de Brasília. */
const AGORA = Date.UTC(2026, 9, 15, 15, 0, 0);

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SVG = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>').toString('base64')}`;

function anuncio(id: string, extra: Partial<AnuncioConfig> = {}): AnuncioConfig {
  return {
    id,
    marca: `Marca ${id}`,
    titulo: 'Pix na hora, sem taxa',
    texto: 'Abra sua conta em minutos.',
    cta: 'Abrir conta',
    url: `https://${id}.com.br/conta?ref=site`,
    formatos: ['topo', 'nativo'],
    peso: 5,
    cota: 'apoio',
    ativo: true,
    inicio: null,
    fim: null,
    naoPolitico: true,
    ...extra,
  };
}

function novo(modo: 'demo' | 'servidor' = 'servidor', initialState?: AdminState) {
  const r = relogio(AGORA);
  const onStateChange = vi.fn();
  const c = createController(ds, { modo, now: r.now, onStateChange, initialState });
  return { c, r, onStateChange };
}

describe('anúncios: comandos', () => {
  it('padrão: nenhum anúncio e nenhum contato', () => {
    const { c } = novo();
    expect(c.state().anuncios).toEqual([]);
    expect(c.state().anuncie).toBeNull();
    expect(c.status().anuncios).toEqual([]);
    expect(c.status().anuncie).toBeNull();
    expect(c.status().patrocinio).toBeNull();
  });

  it('salvar cria; status leva o anúncio público (link com UTM, domínio, sem a URL crua nem a declaração)', () => {
    const { c, onStateChange } = novo();
    const v0 = c.state().versao;
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: PNG, imagem: PNG, cota: 'master', formatos: ['topo', 'tv', 'compartilhamento'] }) });
    expect(c.state().versao).toBe(v0 + 1);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(c.state().anuncios).toHaveLength(1);
    const [p] = c.status().anuncios!;
    expect(p).toEqual({
      id: 'lynx',
      marca: 'Marca lynx',
      titulo: 'Pix na hora, sem taxa',
      texto: 'Abra sua conta em minutos.',
      cta: 'Abrir conta',
      href: 'https://lynx.com.br/conta?ref=site&utm_source=sintonia&utm_medium=link&utm_campaign=lynx',
      destino: 'lynx.com.br',
      logo: PNG,
      imagem: PNG,
      formatos: ['topo', 'tv', 'compartilhamento'],
      peso: 5,
      cota: 'master',
    });
    // legado: o master com 'topo' vira o patrocínio das telas antigas
    expect(c.status().patrocinio).toEqual({
      marca: 'Marca lynx',
      texto: 'Abra sua conta em minutos.',
      url: 'https://lynx.com.br/conta?ref=site&utm_source=sintonia&utm_medium=topo&utm_campaign=lynx',
      imagem: PNG,
    });
  });

  it('salvar substitui pelo id (mantém a ordem) e normaliza (id em minúsculas, textos aparados)', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('a1') });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('b2') });
    c.command({ tipo: 'anuncio-salvar', anuncio: { ...anuncio('a1'), id: ' A1 ', titulo: '  Novo   título ' } });
    expect(c.state().anuncios!.map((a) => a.id)).toEqual(['a1', 'b2']);
    expect(c.state().anuncios![0].titulo).toBe('Novo título');
  });

  it('imagem que volta como URL do servidor mantém a imagem que o anúncio já tem; sem anterior, fica sem imagem', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: SVG, imagem: PNG }) });
    c.command({
      tipo: 'anuncio-salvar',
      anuncio: anuncio('lynx', { titulo: 'Outro', logo: 'https://sintonia2026.com.br/api/anuncio/img?h=0123456789abcdef', imagem: '/api/anuncio/img?h=fedcba9876543210' }),
    });
    const a = c.state().anuncios![0];
    expect(a.titulo).toBe('Outro');
    expect(a.logo).toBe(SVG);
    expect(a.imagem).toBe(PNG);
    // sem logo/imagem no comando = tirou
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    expect(c.state().anuncios![0].logo).toBeUndefined();
    expect(c.state().anuncios![0].imagem).toBeUndefined();
    // anúncio novo com URL do servidor (o servidor não reconheceu o hash): sem imagem
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('novo', { logo: '/api/anuncio/img?h=0123456789abcdef' }) });
    expect(c.state().anuncios!.find((x) => x.id === 'novo')!.logo).toBeUndefined();
  });

  it.each([
    ['sem declaração', { naoPolitico: false }, /político-eleitoral/],
    ['link http', { url: 'http://lynx.com.br' }, /https/],
    ['link javascript', { url: 'javascript:alert(1)' }, /https/],
    ['sem formato', { formatos: [] }, /formato/],
    ['formato inventado', { formatos: ['popup'] }, /formato/],
    ['peso 11', { peso: 11 }, /peso/],
    ['fim antes do início', { inicio: AGORA, fim: AGORA - 1 }, /fim/],
    ['marca vazia', { marca: ' ' }, /marca/],
    ['id inválido', { id: 'Lynx Pay!' }, /id/],
    ['logo GIF', { logo: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }, /logo/],
    ['peça SVG', { imagem: SVG }, /peça/],
    ['peça > 400 KB', { imagem: `data:image/webp;base64,${'A'.repeat(560_000)}` }, /peça/],
  ])('inválido (%s) → CommandError sem alterar o estado', (_n, extra, re) => {
    const { c, onStateChange } = novo();
    const antes = c.state();
    const cmd = { tipo: 'anuncio-salvar', anuncio: { ...anuncio('lynx'), ...extra } } as never;
    expect(() => c.command(cmd)).toThrow(CommandError);
    expect(() => c.command(cmd)).toThrow(re);
    expect(c.state()).toEqual(antes);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('conteúdo político-eleitoral é recusado mesmo com a declaração; o motor confere os nomes dos candidatos do dataset', () => {
    const { c } = novo();
    const nomes = [...new Set(ds.meta.races.flatMap((r) => r.candidatos.filter((x) => !x.agregado).map((x) => x.nomeUrna)))];
    // um finalista de governador (só a lista do dataset tem o nome)
    const gov = nomes.find((n) => !/lula|bolsonaro/i.test(n))!;
    expect(gov).toBeTruthy();
    expect(() => c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('loja', { titulo: `Promoção com ${gov}` }) })).toThrow(CommandError);
    expect(() => c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('loja', { marca: 'Lula Presidente 13', titulo: 'Vote 22' }) })).toThrow(/político-eleitoral/);
    expect(() => c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('gov', { url: 'https://www.gov.br/x' }) })).toThrow(/governo/);
    // patrocínio legado também passa pela barreira
    expect(() => c.command({ tipo: 'patrocinio', patrocinio: { marca: 'PT', texto: 'Apoio', url: 'https://x.com.br' } })).toThrow(CommandError);
    expect(c.state().anuncios).toEqual([]);
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { marca: 'Lynx', titulo: 'Pix na hora, sem tarifa' }) });
    expect(c.state().anuncios!.map((a) => a.id)).toEqual(['lynx']);
  });

  it(`limite de ${ANUNCIO_LIMITES.maxAnuncios} anúncios cadastrados (substituir continua valendo)`, () => {
    const { c } = novo();
    for (let i = 0; i < ANUNCIO_LIMITES.maxAnuncios; i++) c.command({ tipo: 'anuncio-salvar', anuncio: anuncio(`a${i}`) });
    expect(() => c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('mais-um') })).toThrow(/Limite/);
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('a3', { titulo: 'Trocado' }) });
    expect(c.state().anuncios).toHaveLength(ANUNCIO_LIMITES.maxAnuncios);
    expect(() => c.command({ tipo: 'patrocinio', patrocinio: { marca: 'X', texto: 'Y', url: 'https://x.com.br' } })).toThrow(/Limite/);
  });

  it('pausar/ativar e remover; id desconhecido → CommandError', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('vulpix') });
    c.command({ tipo: 'anuncio-ativo', id: 'lynx', ativo: false });
    expect(c.state().anuncios!.find((a) => a.id === 'lynx')!.ativo).toBe(false);
    expect(c.status().anuncios!.map((a) => a.id)).toEqual(['vulpix']);
    c.command({ tipo: 'anuncio-ativo', id: 'lynx', ativo: true });
    expect(c.status().anuncios!.map((a) => a.id)).toEqual(['lynx', 'vulpix']);
    c.command({ tipo: 'anuncio-remover', id: 'lynx' });
    expect(c.state().anuncios!.map((a) => a.id)).toEqual(['vulpix']);
    expect(() => c.command({ tipo: 'anuncio-remover', id: 'lynx' })).toThrow(/não encontrado/);
    expect(() => c.command({ tipo: 'anuncio-ativo', id: 'nada', ativo: true })).toThrow(/não encontrado/);
  });

  it('janela de exibição pelo relógio REAL (a simulação a 20× não adianta nem atrasa o anúncio)', () => {
    const { c, r } = novo('demo');
    // demo: relógio da simulação rodando a 20× a partir de 16:59:30 de 25/10
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('agendado', { inicio: AGORA + 60 * 60_000, fim: AGORA + 2 * 60 * 60_000 }) });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('ja', { fim: AGORA + 30 * 60_000 }) });
    expect(c.status().simNow).toBeGreaterThan(AGORA + 9 * 86400_000); // a simulação está na noite da eleição
    expect(c.status().anuncios!.map((a) => a.id)).toEqual(['ja']);
    r.add(30 * 60_000 - 1);
    expect(c.status().anuncios!.map((a) => a.id)).toEqual(['ja']);
    r.add(1); // fim é exclusivo
    expect(c.status().anuncios!.map((a) => a.id)).toEqual([]);
    r.add(30 * 60_000); // início é inclusivo
    expect(c.status().anuncios!.map((a) => a.id)).toEqual(['agendado']);
    r.add(60 * 60_000);
    expect(c.status().anuncios).toEqual([]);
    // relógio voltando (outra instância/ajuste) também recalcula
    r.set(AGORA);
    expect(c.status().anuncios!.map((a) => a.id)).toEqual(['ja']);
  });

  it('contato da página Anuncie: valida, normaliza o WhatsApp e limpa com null', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncie-contato', contato: { email: ' comercial@sintonia2026.com.br ', whatsapp: '+55 (11) 99999-0000', chamada: 'Fale com a gente' } });
    expect(c.state().anuncie).toEqual({ email: 'comercial@sintonia2026.com.br', whatsapp: '5511999990000', chamada: 'Fale com a gente' });
    expect(c.status().anuncie).toEqual(c.state().anuncie);
    expect(() => c.command({ tipo: 'anuncie-contato', contato: { email: 'sem-arroba' } })).toThrow(/e-mail/);
    expect(() => c.command({ tipo: 'anuncie-contato', contato: { whatsapp: '123' } })).toThrow(/WhatsApp/);
    c.command({ tipo: 'anuncie-contato', contato: {} });
    expect(c.state().anuncie).toBeNull();
    c.command({ tipo: 'anuncie-contato', contato: { email: 'a@b.com' } });
    c.command({ tipo: 'anuncie-contato', contato: null });
    expect(c.status().anuncie).toBeNull();
  });
});

describe('anúncios: persistência e cópias', () => {
  const fb = estadoPadrao('servidor', AGORA, cenarioPadrao(st), st);

  it('ida e volta pelo JSON salvo (servidor) e pelo setState (abas do demo)', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: SVG, inicio: AGORA - 1000, fim: AGORA + 86400_000 }) });
    c.command({ tipo: 'anuncie-contato', contato: { whatsapp: '5511999990000' } });
    const json = c.toJSON();
    const parsed = parseAdminState(json, fb, st);
    expect(JSON.stringify(parsed)).toBe(json);
    const c2 = novo('servidor', parsed).c;
    expect(c2.status().anuncios).toEqual(c.status().anuncios);
    expect(c2.status().anuncie).toEqual({ whatsapp: '5511999990000' });
    const c3 = novo().c;
    c3.setState(parsed);
    expect(c3.state().anuncios).toEqual(parsed.anuncios);
    expect(c3.status().anuncios!.map((a) => a.id)).toEqual(['lynx']);
  });

  it('estado salvo com lixo: anúncios inválidos/repetidos saem, nunca lança', () => {
    const s = {
      ...fb,
      anuncios: [anuncio('ok'), { id: 'x' }, anuncio('ok', { titulo: 'repetido' }), 'lixo', anuncio('dois', { logo: '/api/anuncio/img?h=0123456789abcdef' })],
      anuncie: { email: 'invalido' },
    } as unknown as AdminState;
    const p = parseAdminState(s, fb, st);
    expect(p.anuncios!.map((a) => [a.id, a.titulo])).toEqual([
      ['ok', 'Pix na hora, sem taxa'],
      ['dois', 'Pix na hora, sem taxa'],
    ]);
    expect(p.anuncios![1].logo).toBeUndefined(); // no estado, imagem só em data URI
    expect(p.anuncie).toBeNull();
    expect(parseAdminState({ ...fb, anuncios: 'x' } as unknown as AdminState, fb, st).anuncios).toEqual([]);
    const muitos = { ...fb, anuncios: Array.from({ length: 40 }, (_, i) => anuncio(`a${i}`)) } as AdminState;
    expect(parseAdminState(muitos, fb, st).anuncios).toHaveLength(ANUNCIO_LIMITES.maxAnuncios);
  });

  it('state()/adminSnapshot() devolvem cópias (mexer nelas não altera o motor)', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: PNG }) });
    const s = c.state();
    s.anuncios![0].formatos.push('tv');
    s.anuncios![0].marca = 'Outra';
    c.adminSnapshot().state.anuncios!.pop();
    expect(c.state().anuncios![0]).toMatchObject({ marca: 'Marca lynx', formatos: ['topo', 'nativo'], logo: PNG });
  });

  it('status() barato com muitos anúncios e imagens grandes (memorizado até o próximo início/fim)', () => {
    const { c } = novo();
    const grande = `data:image/webp;base64,${'A'.repeat(500_000)}`;
    for (let i = 0; i < 12; i++) c.command({ tipo: 'anuncio-salvar', anuncio: anuncio(`a${i}`, { imagem: grande, logo: PNG }) });
    const s1 = c.status();
    const s2 = c.status();
    expect(s2.anuncios).toBe(s1.anuncios);
    const t0 = performance.now();
    for (let i = 0; i < 2_000; i++) c.status();
    for (let i = 0; i < 200; i++) c.state();
    expect(performance.now() - t0).toBeLessThan(1_500);
  });
});

describe('anúncios: compatibilidade do contrato v2 com o estado gravado', () => {
  const fb = estadoPadrao('servidor', AGORA, cenarioPadrao(st), st);
  /** WebP como a logo da Lynx no ar: VP8X com ICC + alfa (flags 0x30), sem animação. */
  const WEBP = (() => {
    const chunk = (tipo: string, dados: number[]) => {
      const c = Buffer.alloc(8 + dados.length + (dados.length % 2));
      c.write(tipo, 0, 'latin1');
      c.writeUInt32LE(dados.length, 4);
      Buffer.from(dados).copy(c, 8);
      return c;
    };
    const corpo = Buffer.concat([chunk('VP8X', [0x30, 0, 0, 0, 0xff, 1, 0, 0xff, 1, 0]), chunk('ALPH', [0, 1, 2]), chunk('VP8 ', [1, 2, 3, 4])]);
    const cab = Buffer.alloc(12);
    cab.write('RIFF', 0, 'latin1');
    cab.writeUInt32LE(4 + corpo.length, 4);
    cab.write('WEBP', 8, 'latin1');
    return `data:image/webp;base64,${Buffer.concat([cab, corpo]).toString('base64')}`;
  })();
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/';
  const D = 86_400_000;

  /**
   * Os anúncios como a versão no ar (b88dfe1) grava em STATE_DIR/admin.json: os mesmos campos, na mesma ordem, imagens
   * em data URI (a Lynx com a logo WebP e o título cortado de produção). Nenhum campo do contrato v2.
   */
  const gravadosNoAr = (): AnuncioConfig[] => [
    {
      ...anuncio('patrocinio', {
        marca: 'Lynx',
        titulo: 'Oferece a apuração ao vivo. Carteira digital com Pix em tem…',
        texto: 'Oferece a apuração ao vivo. Carteira digital com Pix em tempo real, cartão virtual e sem mensalidade.',
        cta: 'Saiba mais',
        url: 'https://lynxpix.cc',
        formatos: ['topo', 'rodape', 'nativo', 'teste', 'tv', 'compartilhamento'],
        cota: 'master',
      }),
      logo: WEBP,
      imagem: PNG,
    },
    {
      ...anuncio('updepix', {
        marca: 'UPdepix',
        titulo: 'Pague com Pix e receba DePix na hora',
        texto: 'Gateway Pix para DePix na Liquid Network. Cadastro simples, saque de volta para Pix e suporte humano quando precisar.',
        cta: 'Começar agora',
        url: 'https://updepix.com',
        formatos: ['topo', 'rodape', 'nativo', 'teste', 'tv', 'compartilhamento'],
      }),
      logo: PNG,
      imagem: PNG,
    },
    { ...anuncio('vulpix', { marca: 'Vulpix', titulo: 'Números virtuais para verificação', texto: 'Receba SMS em segundos, sem chip.', cta: 'Conhecer', formatos: ['rodape', 'nativo', 'chat'], peso: 4 }), logo: PNG },
    { ...anuncio('cafe-aurora', { marca: 'Café Aurora', titulo: 'Café especial torrado na semana', formatos: ['nativo'], peso: 3 }), logo: PNG },
    { ...anuncio('mercado-bom', { marca: 'Mercado Bom', titulo: 'Ofertas da semana no app', texto: '', formatos: ['nativo'], peso: 3, inicio: AGORA - D }), logo: PNG },
    { ...anuncio('otica-visao', { marca: 'Ótica Visão', titulo: 'Exame de vista sem custo', formatos: ['nativo'], peso: 3, ativo: false }), logo: JPEG },
    { ...anuncio('livraria-pagina', { marca: 'Livraria Página', titulo: 'Frete grátis acima de R$ 99', texto: '', formatos: ['nativo'], peso: 3, inicio: AGORA - 3 * D, fim: AGORA - 2 * D }), logo: SVG },
  ];

  it('o estado gravado pela versão no ar (b88dfe1) continua carregando inteiro, sem campos novos', () => {
    const salvo = JSON.parse(JSON.stringify({ ...fb, patrocinio: null, anuncios: gravadosNoAr(), anuncie: { whatsapp: '5511999990000' } }));
    const p = parseAdminState(salvo, fb, st);
    expect(p.anuncios).toStrictEqual(gravadosNoAr());
    const c = novo('servidor', p).c;
    expect(c.state().anuncios).toHaveLength(7);
    // no ar: todos menos o pausado (Ótica) e o que já terminou (Livraria)
    expect(c.status().anuncios!.map((a) => a.id)).toEqual(['patrocinio', 'updepix', 'vulpix', 'cafe-aurora', 'mercado-bom']);
    expect(c.status().anuncios!.find((a) => a.id === 'patrocinio')).toMatchObject({ cota: 'master', logo: WEBP });
    // e a ida e volta não muda nada
    expect(JSON.parse(c.toJSON()).anuncios).toStrictEqual(gravadosNoAr());
  });

  it('um anúncio com todos os campos v2 sobrevive à persistência (serialize → parse)', () => {
    const { c } = novo();
    const ajuste = { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' } as const;
    c.command({
      tipo: 'anuncio-salvar',
      anuncio: anuncio('lynx', {
        logo: PNG,
        logoAjuste: ajuste,
        logoEscuro: SVG,
        logoEscuroAjuste: { ...ajuste, placaClaro: 'nenhuma' },
        imagem: PNG,
        imagemAjuste: { proporcao: 3.2, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'manual', comFundo: true },
        reserva: true,
        cota: 'master',
        limiteImpressoes: 100_000,
        inicio: AGORA,
      }),
    });
    const salvo = c.state().anuncios![0];
    expect(salvo).toMatchObject({ cota: 'apoio', reserva: true, limiteImpressoes: 100_000, logoAjuste: ajuste, logoEscuro: SVG });
    const json = c.toJSON();
    const parsed = parseAdminState(JSON.parse(json), fb, st);
    expect(parsed.anuncios).toStrictEqual([salvo]);
    expect(JSON.stringify(parsed)).toBe(json);
  });
});

// ---- contrato v2 no motor: anuncio-logo, interruptor geral, master sobreposto, reserva e imagem animada ----------

/** APNG mínimo (acTL antes do IDAT): a detecção só olha a ordem dos chunks. */
const APNG = (() => {
  const partes: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [tipo, tam] of [['IHDR', 13], ['acTL', 8], ['IDAT', 10], ['IEND', 0]] as const) {
    const c = Buffer.alloc(12 + tam);
    c.writeUInt32BE(tam, 0);
    c.write(tipo, 4, 'latin1');
    partes.push(c);
  }
  return `data:image/png;base64,${Buffer.concat(partes).toString('base64')}`;
})();
const AJUSTE = { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' } as const;

describe('anúncios v2: comando anuncio-logo ("Ajustar agora")', () => {
  it('troca SÓ a logo (e o ajuste); o resto do anúncio fica igual, sem pedir a declaração de novo', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: SVG, imagem: PNG, cota: 'master', peso: 7, formatos: ['topo', 'tv'] }) });
    const antes = c.state().anuncios![0];
    const v0 = c.state().versao;
    c.command({ tipo: 'anuncio-logo', id: 'lynx', logo: PNG, logoAjuste: AJUSTE });
    const depois = c.state().anuncios![0];
    expect(c.state().versao).toBe(v0 + 1);
    expect(depois).toStrictEqual({ ...antes, logo: PNG, logoAjuste: AJUSTE });
    expect(c.status().anuncios![0]).toMatchObject({ logo: PNG, logoAjuste: AJUSTE, imagem: PNG });
    expect(c.metrics().log.at(-1)?.msg).toBe('Logo ajustada: Marca lynx (lynx)');
  });

  it('campo ausente mantém; null apaga a imagem E o ajuste dela; o ajuste sozinho pode ser trocado ou apagado', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: PNG, logoAjuste: AJUSTE, logoEscuro: SVG, logoEscuroAjuste: { ...AJUSTE, placaEscuro: 'clara' } }) });
    // só a versão escura muda; a logo e o ajuste dela ficam
    c.command({ tipo: 'anuncio-logo', id: 'lynx', logoEscuro: PNG });
    expect(c.state().anuncios![0]).toMatchObject({ logo: PNG, logoAjuste: AJUSTE, logoEscuro: PNG, logoEscuroAjuste: { ...AJUSTE, placaEscuro: 'clara' } });
    // o desfazer do painel: o data URI original com o ajuste apagado
    c.command({ tipo: 'anuncio-logo', id: 'lynx', logo: SVG, logoAjuste: null });
    expect(c.state().anuncios![0].logo).toBe(SVG);
    expect(c.state().anuncios![0].logoAjuste).toBeUndefined();
    // null apaga a imagem e o ajuste
    c.command({ tipo: 'anuncio-logo', id: 'lynx', logoEscuro: null });
    expect(c.state().anuncios![0].logoEscuro).toBeUndefined();
    expect(c.state().anuncios![0].logoEscuroAjuste).toBeUndefined();
    expect(c.status().anuncios![0].logoEscuro).toBeUndefined();
    c.command({ tipo: 'anuncio-logo', id: 'lynx', logo: null });
    expect(c.state().anuncios![0]).not.toHaveProperty('logo');
    // ajuste sem imagem não fica
    c.command({ tipo: 'anuncio-logo', id: 'lynx', logoAjuste: AJUSTE });
    expect(c.state().anuncios![0]).not.toHaveProperty('logoAjuste');
  });

  it('imagem animada é recusada (logo e versão escura); id desconhecido → CommandError; nada muda', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: PNG }) });
    const v0 = c.state().versao;
    expect(() => c.command({ tipo: 'anuncio-logo', id: 'lynx', logo: APNG })).toThrow(/imagem parada/);
    expect(() => c.command({ tipo: 'anuncio-logo', id: 'lynx', logoEscuro: APNG })).toThrow(/imagem parada/);
    expect(() => c.command({ tipo: 'anuncio-logo', id: 'nao-existe', logo: PNG })).toThrow(CommandError);
    expect(() => c.command({ tipo: 'anuncio-logo', id: 'lynx', logo: 'data:image/gif;base64,R0lGODlh' })).toThrow(/150 KB/);
    expect(c.state().versao).toBe(v0);
    expect(c.state().anuncios![0].logo).toBe(PNG);
  });

  it('URL do servidor que não foi resolvida mantém a logo que o anúncio já tem (como no salvar)', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logo: PNG, logoEscuro: SVG }) });
    c.command({ tipo: 'anuncio-logo', id: 'lynx', logo: '/api/anuncio/img?h=0123456789abcdef', logoAjuste: AJUSTE, logoEscuro: '/api/anuncio/img?h=fedcba9876543210' });
    expect(c.state().anuncios![0]).toMatchObject({ logo: PNG, logoAjuste: AJUSTE, logoEscuro: SVG });
  });
});

describe('anúncios v2: interruptor geral (anuncios-suspensao)', () => {
  it('suspender tira todos do ar (e o patrocínio legado); voltar devolve exatamente o que estava; ativo intacto', () => {
    const { c, r } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { cota: 'master', formatos: ['topo', 'tv'] }) });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('vulpix', { formatos: ['nativo', 'chat'] }) });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('pausado', { ativo: false }) });
    const noAr = c.status().anuncios;
    expect(noAr!.map((a) => a.id)).toEqual(['lynx', 'vulpix']);
    expect(c.status().patrocinio).not.toBeNull();
    expect(c.status().anunciosSuspensos).toBeUndefined();

    c.command({ tipo: 'anuncios-suspensao', suspender: true, motivo: '  teste   do interruptor ' });
    expect(c.state().anunciosSuspensos).toEqual({ desde: AGORA, motivo: 'teste do interruptor' });
    expect(c.status().anuncios).toEqual([]);
    expect(c.status().patrocinio).toBeNull();
    expect(c.status().anunciosSuspensos).toBe(true);
    expect(c.state().anuncios!.map((a) => [a.id, a.ativo])).toEqual([['lynx', true], ['vulpix', true], ['pausado', false]]);
    // suspenso, pausar/ativar continua funcionando e define o que volta
    c.command({ tipo: 'anuncio-ativo', id: 'pausado', ativo: true });
    expect(c.status().anuncios).toEqual([]);
    // suspender de novo não muda o "desde"
    r.add(60_000);
    c.command({ tipo: 'anuncios-suspensao', suspender: true });
    expect(c.state().anunciosSuspensos!.desde).toBe(AGORA);

    c.command({ tipo: 'anuncios-suspensao', suspender: false });
    expect(c.state().anunciosSuspensos).toBeNull();
    expect(c.status().anunciosSuspensos).toBeUndefined();
    expect(c.status().anuncios!.map((a) => a.id)).toEqual(['lynx', 'vulpix', 'pausado']);
    expect(c.status().anuncios!.slice(0, 2)).toStrictEqual(noAr);
  });

  it('o estado da suspensão persiste (serialize → parse) e ausente vira null', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx') });
    c.command({ tipo: 'anuncios-suspensao', suspender: true, motivo: 'manutenção' });
    const fb = estadoPadrao('servidor', AGORA, cenarioPadrao(st), st);
    const p = parseAdminState(JSON.parse(c.toJSON()), fb, st);
    expect(p.anunciosSuspensos).toEqual({ desde: AGORA, motivo: 'manutenção' });
    const c2 = novo('servidor', p).c;
    expect(c2.status().anuncios).toEqual([]);
    expect(c2.status().anunciosSuspensos).toBe(true);
    // estado antigo (sem o campo) e lixo → desligado
    const { anunciosSuspensos: _, ...semCampo } = JSON.parse(c.toJSON());
    expect(parseAdminState(semCampo, fb, st).anunciosSuspensos).toBeNull();
    expect(parseAdminState({ ...semCampo, anunciosSuspensos: { desde: 'ontem' } }, fb, st).anunciosSuspensos).toBeNull();
    expect(fb.anunciosSuspensos).toBeNull();
  });

  it('motivo com mais de 140 caracteres é recusado; o demo (motor no navegador) aceita o comando', () => {
    const { c } = novo('demo');
    expect(() => c.command({ tipo: 'anuncios-suspensao', suspender: true, motivo: 'x'.repeat(141) })).toThrow(/140/);
    c.command({ tipo: 'anuncios-suspensao', suspender: true });
    expect(c.status().anunciosSuspensos).toBe(true);
    expect(c.state().anunciosSuspensos).toEqual({ desde: AGORA });
  });
});

describe('anúncios v2: master sobreposto, reserva e campos públicos', () => {
  const H = 3_600_000;
  /** 25/10/2026 23:00 de Brasília (UTC−3) = 26/10 02:00 UTC. */
  const V23 = Date.parse('2026-10-25T23:00:00-03:00');

  it('master sobreposto no mesmo formato prioritário é recusado; horários encostados passam (virada 23h → 0h em UTC−3)', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { marca: 'Lynx', cota: 'master', formatos: ['topo', 'nativo'], inicio: V23 - 2 * H, fim: V23 + H }) });
    expect(() =>
      c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('alvorada', { cota: 'master', formatos: ['topo'], inicio: V23, fim: V23 + 2 * H }) }),
    ).toThrow('Já há um master em Topo nesse horário (Lynx). Mude o horário, use Apoio ou ponha Lynx como Reserva.');
    // encostado: começa à 0h de 26/10 (= fim da Lynx)
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('alvorada', { cota: 'master', formatos: ['topo'], inicio: V23 + H, fim: V23 + 3 * H }) });
    // formato sem prioridade (nativo) não conflita; apoio e reserva não conflitam
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('kappa', { cota: 'master', formatos: ['nativo'] }) });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('vulpe', { cota: 'apoio', formatos: ['topo'] }) });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('grupo', { cota: 'master', reserva: true, formatos: ['topo'] }) });
    expect(c.state().anuncios!.find((a) => a.id === 'grupo')).toMatchObject({ cota: 'apoio', reserva: true });
    // editar o próprio master não conflita com ele mesmo
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { marca: 'Lynx', cota: 'master', formatos: ['topo', 'nativo'], inicio: V23 - 2 * H, fim: V23 + H, peso: 9 }) });
    // reativar um master pausado que se sobrepõe também é recusado
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('tv-master', { cota: 'master', formatos: ['tv'], ativo: false }) });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('tv-outro', { marca: 'Outro', cota: 'master', formatos: ['tv'] }) });
    expect(() => c.command({ tipo: 'anuncio-ativo', id: 'tv-master', ativo: true })).toThrow(/master em Modo TV nesse horário \(Outro\)/);
  });

  it('status leva os campos v2 (ajustes, versão escura, reserva) e NUNCA a meta de impressões', () => {
    const { c } = novo();
    c.command({
      tipo: 'anuncio-salvar',
      anuncio: anuncio('lynx', {
        logo: PNG,
        logoAjuste: AJUSTE,
        logoEscuro: SVG,
        logoEscuroAjuste: { ...AJUSTE, placaClaro: 'nenhuma' },
        imagem: PNG,
        imagemAjuste: { proporcao: 3.2, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'auto', comFundo: true },
        reserva: true,
        limiteImpressoes: 50_000,
        inicio: AGORA - 1000,
      }),
    });
    const p = c.status().anuncios![0];
    expect(p).toMatchObject({ logoAjuste: AJUSTE, logoEscuro: SVG, logoEscuroAjuste: { ...AJUSTE, placaClaro: 'nenhuma' }, reserva: true, cota: 'apoio' });
    expect(p.imagemAjuste).toEqual({ proporcao: 3.2, placaClaro: 'nenhuma', placaEscuro: 'nenhuma', origem: 'auto', comFundo: true });
    expect(p).not.toHaveProperty('limiteImpressoes');
    expect(JSON.stringify(c.status())).not.toContain('limiteImpressoes');
  });

  it('patrocínio legado prefere o pago: master sem reserva, depois o 1º pago, por último a reserva', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('grupo', { marca: 'Grupo', reserva: true, formatos: ['topo'] }) });
    expect(c.status().patrocinio?.marca).toBe('Grupo');
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('pago', { marca: 'Pago', formatos: ['topo'] }) });
    expect(c.status().patrocinio?.marca).toBe('Pago');
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('master', { marca: 'Master', cota: 'master', formatos: ['topo'] }) });
    expect(c.status().patrocinio?.marca).toBe('Master');
  });
});

describe('anúncios v2: imagens no estado restaurado', () => {
  const fb = estadoPadrao('servidor', AGORA, cenarioPadrao(st), st);

  it('imagem animada num estado salvo sai SÓ a imagem (com o ajuste dela); o anúncio fica, e o log diz por quê', () => {
    const salvo = {
      ...fb,
      anuncios: [
        { ...anuncio('lynx', { marca: 'Lynx' }), logo: APNG, logoAjuste: AJUSTE, imagem: PNG },
        { ...anuncio('alvorada'), logo: PNG, imagem: APNG, imagemAjuste: AJUSTE, logoEscuro: APNG },
      ],
    };
    const avisos: string[] = [];
    const p = parseAdminState(JSON.parse(JSON.stringify(salvo)), fb, st, { aviso: (m) => avisos.push(m) });
    expect(p.anuncios!.map((a) => a.id)).toEqual(['lynx', 'alvorada']);
    expect(p.anuncios![0]).not.toHaveProperty('logo');
    expect(p.anuncios![0]).not.toHaveProperty('logoAjuste');
    expect(p.anuncios![0].imagem).toBe(PNG);
    expect(p.anuncios![1]).toMatchObject({ logo: PNG });
    expect(p.anuncios![1]).not.toHaveProperty('imagem');
    expect(p.anuncios![1]).not.toHaveProperty('imagemAjuste');
    expect(p.anuncios![1]).not.toHaveProperty('logoEscuro');
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toMatch(/Lynx \(lynx\): imagem animada removida \(logo\)/);
    expect(avisos[1]).toMatch(/peça|versão para fundo escuro/);
    // e o motor criado com esse estado registra no log do monitor
    const c = novo('servidor', JSON.parse(JSON.stringify(salvo))).c;
    expect(c.metrics().log.some((l) => /imagem animada removida/.test(l.msg))).toBe(true);
  });

  it('anúncio que deixou de passar na validação (regra endurecida) não volta, mas o log diz qual e por quê', () => {
    const salvo = {
      ...fb,
      anuncios: [
        { ...anuncio('bet', { marca: 'Bet Rápida' }) },
        { ...anuncio('lynx', { marca: 'Lynx' }), limiteImpressoes: 5000 }, // meta sem início
        anuncio('ok'),
        anuncio('ok'),
      ],
    };
    const avisos: string[] = [];
    const p = parseAdminState(JSON.parse(JSON.stringify(salvo)), fb, st, { aviso: (m) => avisos.push(m) });
    expect(p.anuncios!.map((a) => a.id)).toEqual(['ok']);
    expect(avisos).toHaveLength(3);
    expect(avisos[0]).toMatch(/^Anúncio Bet Rápida \(bet\) não restaurado: Anúncio recusado: o Sintonia não aceita anúncios de apostas/);
    expect(avisos[1]).toMatch(/^Anúncio Lynx \(lynx\) não restaurado: .*início/);
    expect(avisos[2]).toMatch(/repetido/);
  });

  it('salvar com a versão escura como URL do servidor não resolvida mantém a anterior; sem anterior, sai com o ajuste', () => {
    const { c } = novo();
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logoEscuro: SVG }) });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('lynx', { logoEscuro: '/api/anuncio/img?h=0123456789abcdef', logoEscuroAjuste: AJUSTE }) });
    expect(c.state().anuncios![0]).toMatchObject({ logoEscuro: SVG, logoEscuroAjuste: AJUSTE });
    c.command({ tipo: 'anuncio-salvar', anuncio: anuncio('novo', { logoEscuro: '/api/anuncio/img?h=0123456789abcdef', logoEscuroAjuste: AJUSTE, imagem: '/api/anuncio/img?h=0123456789abcdee', imagemAjuste: AJUSTE }) });
    const n = c.state().anuncios!.find((a) => a.id === 'novo')!;
    expect(n).not.toHaveProperty('logoEscuro');
    expect(n).not.toHaveProperty('logoEscuroAjuste');
    expect(n).not.toHaveProperty('imagem');
    expect(n).not.toHaveProperty('imagemAjuste');
  });
});
