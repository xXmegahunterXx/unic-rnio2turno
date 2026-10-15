import { describe, expect, it } from 'vitest';
import type { MensagemChat } from '@/shared/chat';
import { contarNovas, gerarToken, intervaloConsulta, juntarMensagens, modoPainelDesktop, paginaDaSala, textoPessoasSala } from './nucleo';

const msg = (id: string, em: number, texto = id): MensagemChat => ({ id, apelido: 'Ana', texto, em });
const vazio = { mensagens: [], removidas: [], limpaEm: 0 };

describe('juntarMensagens', () => {
  it('acrescenta por id, sem duplicar, em ordem de horário', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('a', 1), msg('b', 2)] });
    const b = juntarMensagens(a, { ...vazio, mensagens: [msg('b', 2), msg('c', 3)] });
    expect(b.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    // mensagem que já saiu da janela do servidor continua no navegador
    const c = juntarMensagens(b, { ...vazio, mensagens: [msg('d', 4)] });
    expect(c.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('devolve o MESMO array quando nada muda (sem redesenho)', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('a', 1)] });
    expect(juntarMensagens(a, { ...vazio, mensagens: [msg('a', 1)] })).toBe(a);
  });
  it('tira removidas e as anteriores ao "limpar tudo"', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('a', 1), msg('b', 2), msg('c', 3)] });
    expect(juntarMensagens(a, { ...vazio, removidas: ['b'] }).map((m) => m.id)).toEqual(['a', 'c']);
    expect(juntarMensagens(a, { ...vazio, limpaEm: 2 }).map((m) => m.id)).toEqual(['c']);
    // removida que ainda vem na lista do servidor (cache da CDN) não volta
    expect(juntarMensagens([], { mensagens: [msg('x', 5)], removidas: ['x'], limpaEm: 0 })).toHaveLength(0);
  });
  it('resposta completa: o que a aba tinha dentro da janela recebida e não veio saiu (mesmo sem estar nas removidas)', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('a', 1), msg('b', 2), msg('c', 3), msg('d', 4)] });
    // servidor escondeu "c" e a lista de removidas já não a traz; "a" ficou fora da janela (antes da 1ª recebida)
    const b = juntarMensagens(a, { ...vazio, agora: 10, mensagens: [msg('b', 2), msg('d', 4), msg('e', 5)] });
    expect(b.map((m) => m.id)).toEqual(['a', 'b', 'd', 'e']);
    // a minha mensagem recém-publicada (depois do instante da resposta em cache) não some
    const c = juntarMensagens([...b, msg('minha', 12)], { ...vazio, agora: 10, mensagens: [msg('b', 2), msg('d', 4), msg('e', 5)] });
    expect(c.map((m) => m.id)).toContain('minha');
    // sala sem nenhuma visível: tudo o que a aba tinha até a resposta sai
    expect(juntarMensagens(b, { ...vazio, agora: 10, mensagens: [] }).map((m) => m.id)).toEqual([]);
  });
  it('aba parada por mais de 25 min recomeça só com o que veio', () => {
    const a = juntarMensagens([], { ...vazio, mensagens: [msg('velha1', 1), msg('velha2', 2)] });
    const b = juntarMensagens(a, { ...vazio, agora: 5_000_000, mensagens: [msg('n1', 4_000_000), msg('n2', 4_000_001)] }, undefined, 31 * 60_000);
    expect(b.map((m) => m.id)).toEqual(['n1', 'n2']);
    // parada curta: as antigas (fora da janela) continuam
    const c = juntarMensagens(a, { ...vazio, agora: 5_000_000, mensagens: [msg('n1', 4_000_000)] }, undefined, 60_000);
    expect(c.map((m) => m.id)).toEqual(['velha1', 'velha2', 'n1']);
  });
  it('guarda no máximo `max`, descartando as mais antigas', () => {
    const muitas = Array.from({ length: 10 }, (_, i) => msg(`m${i}`, i));
    expect(juntarMensagens([], { ...vazio, mensagens: muitas }, 4).map((m) => m.id)).toEqual(['m6', 'm7', 'm8', 'm9']);
  });
});

describe('contarNovas', () => {
  it('conta depois do visto, sem as próprias', () => {
    const l = [msg('a', 1), msg('b', 2), msg('c', 3), msg('d', 4)];
    expect(contarNovas(l, 2, new Set())).toBe(2);
    expect(contarNovas(l, 2, new Set(['d']))).toBe(1);
    expect(contarNovas(l, 9, new Set())).toBe(0);
  });
});

describe('intervaloConsulta', () => {
  it('rápido só com a sala na tela; devagar no botão; mais devagar fechada; recuo com falhas', () => {
    const aberta = { aberta: true, intervaloS: 2.5 };
    expect(intervaloConsulta(aberta, 'tela')).toBe(2500);
    expect(intervaloConsulta({ aberta: true, intervaloS: 6 }, 'tela')).toBe(6000);
    expect(intervaloConsulta(aberta, 'fundo')).toBe(10_000);
    expect(intervaloConsulta({ aberta: false, intervaloS: 2.5 }, 'tela')).toBe(15_000);
    expect(intervaloConsulta({ aberta: false, intervaloS: 2.5 }, 'fundo')).toBe(30_000);
    expect(intervaloConsulta(aberta, 'tela', 2)).toBe(10_000);
    expect(intervaloConsulta(aberta, 'tela', 20)).toBe(60_000);
    // o servidor nunca leva o navegador a consultar mais rápido que 2,5 s
    expect(intervaloConsulta({ aberta: true, intervaloS: 0.1 }, 'tela')).toBe(2500);
  });
});

describe('utilidades', () => {
  it('token aleatório no formato aceito pelo servidor', () => {
    const t = gerarToken((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
  it('pessoas na sala', () => {
    expect(textoPessoasSala(null)).toBeNull();
    expect(textoPessoasSala(0)).toBeNull();
    expect(textoPessoasSala(1)).toBe('1 pessoa na sala');
    expect(textoPessoasSala(7)).toBe('7 na sala');
    expect(textoPessoasSala(840)).toBe('≈ 840 na sala');
    expect(textoPessoasSala(12_300)).toMatch(/^≈ 12,3\smil na sala$/);
  });
  it('rotas com a sala', () => {
    expect(paginaDaSala('/apuracao')).toBe('nacional');
    expect(paginaDaSala('/apuracao/')).toBe('nacional');
    expect(paginaDaSala('/apuracao/sp')).toBe('uf');
    expect(paginaDaSala('/apuracao/consulta')).toBeNull();
    expect(paginaDaSala('/apuracao/sp/71072')).toBeNull();
    expect(paginaDaSala('/')).toBeNull();
  });
  it('painel do desktop: empurra a página só onde o layout continua o mesmo', () => {
    // estreito (< 1200): folha inferior centralizada — empurrar encavala o placar e uma gaveta cobriria só um lado dele
    expect(modoPainelDesktop(1024, 'nacional')).toBe('folha');
    expect(modoPainelDesktop(1100, 'nacional')).toBe('folha');
    expect(modoPainelDesktop(1280, 'nacional')).toBe('doca');
    // duas colunas: a gaveta (não modal) fica por cima da coluna do mapa
    expect(modoPainelDesktop(1440, 'nacional')).toBe('gaveta');
    expect(modoPainelDesktop(1920, 'nacional')).toBe('doca');
    expect(modoPainelDesktop(1100, 'uf')).toBe('doca');
    expect(modoPainelDesktop(1440, 'uf')).toBe('doca');
    expect(modoPainelDesktop(1024, 'uf')).toBe('folha');
  });
});
