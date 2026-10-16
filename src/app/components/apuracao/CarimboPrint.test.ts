import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CarimboPrint, ehInstanteReveja, partesCarimbo, textoCarimbo, type ResumoCarimbo } from './CarimboPrint';

/** 25/10/2026, hh:mm:ss de Brasília (UTC−3). */
const brt = (h: number, m: number, s = 0) => Date.UTC(2026, 9, 25, h + 3, m, s);
const HOST = 'sintonia2026.com.br';
const resumo = (tot: number, de = 10_000, t: number | null = brt(18, 47, 12)): ResumoCarimbo => ({ secoes: de, secoesTotalizadas: tot, ultimaAtualizacao: tot ? t : null });

describe('partesCarimbo / textoCarimbo (I10)', () => {
  it('ao vivo: domínio · % apurado (2 casas, como o TSE) · hora de Brasília com segundos — do resumo, não do relógio', () => {
    expect(textoCarimbo({ host: HOST, resumo: resumo(6321) })).toBe('sintonia2026.com.br · 63,21% apurado · 18:47:12 (Brasília)');
  });

  it('Reveja a noite: rótulo depois do domínio, hora do instante exibido', () => {
    expect(textoCarimbo({ host: HOST, resumo: resumo(4120, 10_000, brt(18, 12, 5)), reveja: true })).toBe(
      'sintonia2026.com.br · Reveja a noite · 41,20% apurado · 18:12:05 (Brasília)',
    );
  });

  it('simulação: selo na frente e SEM hora (hora fictícia num print fora de contexto)', () => {
    const p = partesCarimbo({ host: HOST, resumo: resumo(5000), simulado: true });
    expect(p.selo).toBe('SIMULAÇÃO · dados fictícios');
    expect(p.hora).toBeNull();
    expect(textoCarimbo({ host: HOST, resumo: resumo(5000), simulado: true })).toBe('SIMULAÇÃO · dados fictícios · sintonia2026.com.br · 50,00% apurado');
  });

  it('1º turno oficial: sem % nem hora (o dado é de 04/10)', () => {
    expect(textoCarimbo({ host: HOST, resumo: resumo(10_000), turno1: true, simulado: true, reveja: true })).toBe(
      'sintonia2026.com.br · 1º turno · resultado oficial (TSE)',
    );
  });

  it('nada apurado ainda: 0,00% e sem hora; sem domínio apresentável, a marca', () => {
    expect(textoCarimbo({ host: '', resumo: resumo(0) })).toBe('Sintonia · 0,00% apurado');
    expect(textoCarimbo({ host: HOST, resumo: { secoes: 0, secoesTotalizadas: 0, ultimaAtualizacao: null } })).toBe('sintonia2026.com.br · 0,00% apurado');
  });

  it('cabe no celular: cada uma das duas linhas tem até 40 caracteres', () => {
    const p = partesCarimbo({ host: HOST, resumo: resumo(9999), reveja: true });
    expect([p.marca, p.rotulo].join(' · ').length).toBeLessThanOrEqual(40);
    expect([p.apurado, p.hora].join(' · ').length).toBeLessThanOrEqual(40);
  });

  it('neutro: nenhum nome, partido ou adjetivo', () => {
    for (const d of [{ host: HOST, resumo: resumo(6321) }, { host: HOST, resumo: resumo(6321), simulado: true }]) {
      expect(textoCarimbo(d)).not.toMatch(/Lula|Bolsonaro|Flávio|Candidato|PT|PL|vence|lidera/i);
    }
  });
});

describe('ehInstanteReveja (?t= da URL)', () => {
  it('aceita os formatos de LinhaDoTempo e recusa o resto', () => {
    for (const ok of ['18h42', '18:42', '1842', '9h05', String(brt(19, 0))]) expect(ehInstanteReveja(ok), ok).toBe(true);
    for (const ruim of [null, '', 'agora', '25h00', '18h61', '12345', 'x18h42']) expect(ehInstanteReveja(ruim), String(ruim)).toBe(false);
  });
});

describe('<CarimboPrint> (marcação)', () => {
  const html = (url: string, props: Parameters<typeof CarimboPrint>[0]) =>
    renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, createElement(CarimboPrint, props)));

  it('placar ao vivo: .num, tokens, sem cor de candidato nem link', () => {
    const h = html('/apuracao', { resumo: resumo(6321), onde: 'placar' });
    expect(h).toContain('data-carimbo-print');
    expect(h).toContain('class="num ');
    expect(h).toContain('text-fg-subtle');
    expect(h).toContain('63,21% apurado');
    expect(h).toContain('18:47:12 (Brasília)');
    expect(h).not.toMatch(/cand-|#[0-9a-f]{3,6}\b|<a |sponsored|Publicidade/i);
  });

  it('?t= na URL vira "Reveja a noite"; o `instante` explícito também', () => {
    expect(html('/apuracao?t=18h12', { resumo: resumo(4120) })).toContain('Reveja a noite');
    expect(html('/apuracao', { resumo: resumo(4120), instante: brt(18, 12) })).toContain('Reveja a noite');
    expect(html('/apuracao?race=pres', { resumo: resumo(4120) })).not.toContain('Reveja a noite');
  });

  it('fora de um Router também funciona (só o instante explícito)', () => {
    const h = renderToStaticMarkup(createElement(CarimboPrint, { resumo: resumo(6321), onde: 'mapa' }));
    expect(h).toContain('63,21% apurado');
    expect(h).toContain('bg-surface/80');
  });

  it('sem resumo, nada', () => {
    expect(html('/apuracao', { resumo: undefined })).toBe('');
  });

  it('simulação no 2º turno: selo, sem hora; no 1º turno, "resultado oficial"', () => {
    const sim = html('/apuracao', { resumo: resumo(5000), simulado: true, turno: 2 });
    expect(sim).toContain('SIMULAÇÃO · dados fictícios');
    expect(sim).not.toContain('(Brasília)');
    const t1 = html('/apuracao', { resumo: resumo(10_000), simulado: true, turno: 1 });
    expect(t1).toContain('resultado oficial (TSE)');
    expect(t1).not.toContain('SIMULAÇÃO');
  });
});
