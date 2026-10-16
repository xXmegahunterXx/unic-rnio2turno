/**
 * Layouts do modo streamer (renderização estática): marca e endereço sempre visíveis, anúncio 'live' rotulado, sem
 * link e FORA do placar, cores vindas dos dados (Lula vermelho, Flávio azul; governador e simulação com nomes ocultos em
 * turquesa/âmbar), fotos só quando permitidas, faixa de simulação, contagem regressiva na fase pre e posições.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnuncioPublico } from '@/shared/anuncios';
import type { DatasetMeta } from '@/shared/dataset';
import type { Race, Summary } from '@/shared/types';
import { anonimizarRace } from '@/shared/anon';
import { UFS_GOV_2T } from '@/shared/constants';
import { anuncioDaLive, ROTACAO_LIVE_MS } from '@/app/components/anuncios/OferecimentoLive';
import { LayoutLive } from './Layouts';
import { LAYOUTS_LIVE, lerOpcoesLive, type LayoutLive as TipoLayout } from './opcoes';
import type { QuadroLive } from './pecas';

const meta = JSON.parse(readFileSync(join(__dirname, '../../../../public/data/meta.json'), 'utf8')) as DatasetMeta;
const race = (id: string) => meta.races.find((r) => r.id === id) as Race;
const GOV = `gov-${UFS_GOV_2T[0].toLowerCase()}`;

function resumo(votos: number[], pst = 0.4, extra: Partial<Summary> = {}): Summary {
  const secoes = 1000;
  const comp = votos.reduce((a, b) => a + b, 0) + 300;
  return {
    secoes,
    secoesTotalizadas: Math.round(secoes * pst),
    eleitorado: 100_000,
    eleitoradoTotalizado: 40_000,
    comparecimento: comp,
    abstencao: 40_000 - comp,
    votos,
    brancos: 100,
    nulos: 200,
    status: pst >= 1 ? 'encerrada' : 'apurando',
    lider: votos[0] >= votos[1] ? 0 : 1,
    eleito: null,
    ultimaAtualizacao: Date.UTC(2026, 9, 25, 21, 42, 10),
    ...extra,
  };
}

const FOTO_A = 'data:image/webp;base64,QUFB';
const FOTO_B = 'data:image/webp;base64,QkJC';

function quadro(over: Partial<QuadroLive> = {}): QuadroLive {
  return {
    race: race('pres'),
    resumo: resumo([20_000, 19_000]),
    ufs: {},
    pre: false,
    t1: false,
    simulado: false,
    aoVivo: true,
    fotos: [FOTO_A, FOTO_B],
    faltaMs: null,
    atualizadoEm: Date.UTC(2026, 9, 25, 21, 42, 10),
    dominio: 'sintonia2026.com.br',
    urlQr: 'https://sintonia2026.com.br/apuracao',
    ...over,
  };
}

const ANUNCIO: AnuncioPublico = {
  id: 'marca-teste',
  marca: 'Marca Teste',
  titulo: 'Chamada',
  texto: '',
  cta: 'Saiba mais',
  href: '/api/anuncio/ir/marca-teste',
  destino: 'exemplo.com.br',
  formatos: ['live'],
  peso: 5,
  cota: 'master',
};

const html = (layout: TipoLayout, q: QuadroLive = quadro(), anuncio: AnuncioPublico | null = ANUNCIO, params = '') =>
  renderToStaticMarkup(
    createElement(LayoutLive, {
      q,
      opcoes: lerOpcoesLive(new URLSearchParams(`layout=${layout}&${params}`)),
      anuncio,
      previa: true,
      mapa: layout === 'mapa' ? createElement('div', { 'data-mapa': '1' }) : undefined,
    }),
  );

/** Trecho do bloco do placar (section/aside com aria-label="Placar"). Não há section/aside aninhados dentro dele. */
function placarDe(h: string): string {
  const i = h.indexOf('aria-label="Placar"');
  expect(i).toBeGreaterThan(-1);
  const resto = h.slice(i);
  const fim = Math.min(...['</section>', '</aside>'].map((t) => resto.indexOf(t)).filter((n) => n >= 0));
  return resto.slice(0, fim);
}

describe('layouts da live', () => {
  it.each(LAYOUTS_LIVE)('%s: endereço do site sempre visível, anúncio rotulado, sem link e fora do placar', (l) => {
    const h = html(l);
    expect(h).toContain(`data-layout="${l}"`);
    expect(h).toContain('sintonia2026.com.br');
    expect(h).toContain('Oferecido por');
    expect(h).toContain('Marca Teste');
    expect(h).toContain('aria-label="Publicidade: oferecido por Marca Teste"');
    // a live é vídeo: nenhum link na fonte do OBS (nem no anúncio)
    expect(h).not.toMatch(/<a[\s>]/);
    expect(h).not.toContain('/api/anuncio/ir/');
    // nunca dentro do placar
    expect(placarDe(h)).not.toContain('data-anuncio-live');
    expect(placarDe(h)).not.toContain('Oferecido por');
  });

  it.each(LAYOUTS_LIVE)('%s: sem anúncio no ar, nenhum "Oferecido por"', (l) => {
    const h = html(l, quadro(), null);
    expect(h).not.toContain('Oferecido por');
    expect(h).toContain('sintonia2026.com.br');
  });

  it.each(LAYOUTS_LIVE)('%s: Presidente com cores de identificação vindas dos dados; percentuais e votos', (l) => {
    const h = html(l);
    expect(h).toContain('text-cand-vermelho');
    expect(h).toContain('text-cand-azul');
    expect(h).not.toMatch(/\bcand-a\b|\bcand-b\b/);
    expect(h).toContain('Lula');
    expect(h).toContain('Flávio Bolsonaro');
    // 20.000 × 19.000 → 51,28% e 48,72% (calc.ts), com a classe .num dos números
    expect(h).toContain('51,28%');
    expect(h).toContain('48,72%');
    expect(h).toContain('class="num');
  });

  it.each(LAYOUTS_LIVE)('%s: governador em turquesa/âmbar (nunca vermelho/azul)', (l) => {
    const h = html(l, quadro({ race: race(GOV), fotos: [] }));
    expect(h).toMatch(/text-cand-a\b/);
    expect(h).toMatch(/text-cand-b\b/);
    expect(h).not.toMatch(/cand-vermelho|cand-azul/);
  });

  it.each(LAYOUTS_LIVE)('%s: fotos oficiais quando permitidas; simulação (nomes ocultos) sem foto, com a faixa', (l) => {
    const com = html(l);
    expect(com).toContain(FOTO_A);
    expect(com).toContain(FOTO_B);
    const anon = anonimizarRace(race('pres'));
    const sim = html(l, quadro({ race: anon, simulado: true, fotos: [] }));
    expect(sim).not.toContain('<img src="data:image/webp');
    expect(sim).toContain('Simulação · dados fictícios');
    expect(sim).toContain('Candidato A');
    expect(sim).not.toMatch(/cand-vermelho|cand-azul|Lula|Bolsonaro/);
  });

  it('número simulado nunca sai com "Fonte: TSE"', () => {
    expect(html('placar')).toContain('Fonte: <span');
    const sim = html('placar', quadro({ simulado: true }));
    expect(sim).not.toContain('Fonte: <span');
  });

  it.each(LAYOUTS_LIVE)('%s: fase pre mostra o 1º turno oficial e a contagem regressiva', (l) => {
    const falta = ((10 * 24 + 2) * 3600 + 13 * 60 + 45) * 1000;
    const t1 = race('pres-t1');
    const h = html(l, quadro({ race: t1, t1: true, pre: true, aoVivo: false, faltaMs: falta, atualizadoEm: null, resumo: resumo([45, 47, 8], 1) }));
    expect(h).toContain('10d 02:13:45');
    expect(h).toContain('1º turno');
    expect(h).toContain('45,00%');
  });

  it('último dado no horário de Brasília', () => {
    expect(html('placar')).toContain('18:42:10');
    expect(html('barra')).toContain('18:42:10');
    expect(html('canto')).toContain('18:42:10');
  });

  it('eleito: selo neutro', () => {
    const h = html('placar', quadro({ resumo: resumo([20_000, 19_000], 1, { eleito: 0, status: 'encerrada' }) }));
    expect(h).toContain('Eleito');
    expect(h).not.toMatch(/vitória|venceu|derrot/i);
  });

  it('posições: barra embaixo/em cima; canto nos quatro cantos', () => {
    expect(html('barra')).toContain('bottom-[calc(var(--u)*3)]');
    expect(html('barra', quadro(), ANUNCIO, 'posicao=topo')).toContain('top-[calc(var(--u)*3)]');
    expect(html('canto')).toContain('right-[calc(var(--u)*3)] top-[calc(var(--u)*3)]');
    expect(html('canto', quadro(), ANUNCIO, 'posicao=baixo-esquerda')).toContain('bottom-[calc(var(--u)*3)] left-[calc(var(--u)*3)]');
  });

  it('canto: a faixa da marca fica sempre entre o anúncio e as linhas dos candidatos', () => {
    for (const p of ['topo-direita', 'topo-esquerda', 'baixo-direita', 'baixo-esquerda']) {
      const h = html('canto', quadro(), ANUNCIO, `posicao=${p}`);
      const anuncio = h.indexOf('data-anuncio-live');
      const marca = h.lastIndexOf('sintonia2026.com.br');
      const lula = h.indexOf('Lula');
      // em cima: anúncio < marca < candidatos; embaixo: candidatos < marca < anúncio
      if (p.startsWith('baixo')) expect(anuncio < marca && marca < lula).toBe(true);
      else expect(lula < marca && marca < anuncio).toBe(true);
    }
  });

  it('mapa: desenho do mapa vem de fora e a legenda usa as cores dos dados', () => {
    const h = html('mapa');
    expect(h).toContain('data-mapa="1"');
    expect(h).toContain('Quem está à frente em cada estado');
    expect(h).toContain('cand-vermelho');
    expect(h).toContain('mais forte = maior vantagem');
  });
});

describe('anúncio da live', () => {
  const ap = (id: string, cota: 'master' | 'apoio', formatos: AnuncioPublico['formatos'] = ['live'], peso = 5): AnuncioPublico => ({
    ...ANUNCIO,
    id,
    marca: id,
    cota,
    formatos,
    peso,
  });

  it('só anúncios com o formato live; a cota master vence', () => {
    expect(anuncioDaLive([], 'v', 0)).toBeNull();
    expect(anuncioDaLive([ap('tv-so', 'master', ['tv'])], 'v', 0)).toBeNull();
    for (let k = 0; k < 20; k++) expect(anuncioDaLive([ap('apoio-1', 'apoio'), ap('master-1', 'master')], `v${k}`, 0)?.id).toBe('master-1');
  });

  it('revezamento por janela de 5 min entre os elegíveis (determinístico)', () => {
    const lista = [ap('a1', 'apoio'), ap('a2', 'apoio'), ap('a3', 'apoio')];
    const vistos = new Set<string>();
    for (let j = 0; j < 30; j++) vistos.add(anuncioDaLive(lista, 'visita', j * ROTACAO_LIVE_MS)!.id);
    expect(vistos.size).toBeGreaterThan(1);
    // dentro da mesma janela, não troca
    expect(anuncioDaLive(lista, 'visita', 1000)?.id).toBe(anuncioDaLive(lista, 'visita', ROTACAO_LIVE_MS - 1)?.id);
  });
});

describe('live vertical (janela em pé: TikTok, Shorts, Kick no celular)', () => {
  const vert = (layout: TipoLayout, q: QuadroLive = quadro(), anuncio: AnuncioPublico | null = ANUNCIO) =>
    renderToStaticMarkup(createElement(LayoutLive, { q, opcoes: lerOpcoesLive(new URLSearchParams(`layout=${layout}`)), anuncio, previa: true, vertical: true }));
  it.each(['placar', 'mapa'] as TipoLayout[])('%s vira o placar em pé: marca, QR, números e anúncio fora do placar', (l) => {
    const h = vert(l);
    expect(h).toContain('data-layout="placar-vertical"');
    expect(h).toContain('sintonia2026.com.br');
    expect(h).toContain('51,28%');
    expect(h).toContain('48,72%');
    expect(h).toContain('text-cand-vermelho');
    expect(h).toContain('text-cand-azul');
    expect(h).toContain('Oferecido por');
    expect(placarDe(h)).not.toContain('Oferecido por');
    expect(h).not.toMatch(/<a[\s>]/);
  });
  it('simulação: faixa, sem "Fonte: TSE" e sem foto', () => {
    const h = vert('placar', quadro({ simulado: true, fotos: [] }));
    expect(h).toContain('Simulação');
    expect(h).not.toContain('Fonte: <span');
    expect(h).not.toContain(FOTO_A);
  });
  it('barra e canto continuam iguais (sobrepostos à câmera)', () => {
    expect(vert('barra')).toContain('data-layout="barra"');
    expect(vert('canto')).toContain('data-layout="canto"');
  });
});

describe('barra: a aba "Oferecido por" nunca passa da largura da marca do Sintonia', () => {
  it('max-w da aba = largura da célula da marca (33u)', () => {
    const src = readFileSync('src/app/components/live/Layouts.tsx', 'utf8');
    const aba = /data-aba-anuncio className=\{cn\(PAINEL, '[^']*max-w-\[calc\(var\(--u\)\*(\d+)\)\]/.exec(src);
    const marca = /flex w-\[calc\(var\(--u\)\*(\d+)\)\] shrink-0 items-center border-r/.exec(src);
    expect(aba?.[1]).toBeDefined();
    expect(Number(aba![1])).toBeLessThanOrEqual(Number(marca![1]));
  });
});
