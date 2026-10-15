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
