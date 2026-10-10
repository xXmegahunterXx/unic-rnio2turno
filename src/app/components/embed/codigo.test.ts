import { describe, expect, it } from 'vitest';
import { caminhoEmbed, caminhoPaginaCompleta, codigoIframe, lerOpcoesEmbed, MENSAGEM_ALTURA, normalizarTema, tituloEmbed } from './codigo';

const P = (s: string) => new URLSearchParams(s);

describe('lerOpcoesEmbed', () => {
  it('padrões seguros', () => {
    expect(lerOpcoesEmbed(undefined, P(''))).toEqual({ tipo: 'placar', race: 'pres', uf: 'SP', tema: 'auto' });
    expect(lerOpcoesEmbed('xyz', P('race=senado&uf=zz&tema=roxo'))).toEqual({ tipo: 'placar', race: 'pres', uf: 'SP', tema: 'auto' });
  });
  it('placar de governador só nas 7 UFs do 2º turno', () => {
    expect(lerOpcoesEmbed('placar', P('race=GOV-RJ')).race).toBe('gov-rj');
    expect(lerOpcoesEmbed('placar', P('race=gov-sp')).race).toBe('pres');
  });
  it('mapa é sempre do Presidente; uf aceita minúsculas', () => {
    expect(lerOpcoesEmbed('mapa', P('race=gov-rj')).race).toBe('pres');
    expect(lerOpcoesEmbed('uf', P('uf=pe&tema=light'))).toMatchObject({ tipo: 'uf', uf: 'PE', tema: 'claro' });
  });
  it('tema', () => {
    expect(normalizarTema('dark')).toBe('escuro');
    expect(normalizarTema('CLARO')).toBe('claro');
    expect(normalizarTema(null)).toBe('auto');
  });
});

describe('caminhos e títulos', () => {
  it('omite o que é padrão', () => {
    expect(caminhoEmbed({ tipo: 'placar', race: 'pres', uf: 'SP', tema: 'auto' })).toBe('/embed/placar');
    expect(caminhoEmbed({ tipo: 'placar', race: 'gov-am', uf: 'SP', tema: 'claro' })).toBe('/embed/placar?race=gov-am&tema=claro');
    expect(caminhoEmbed({ tipo: 'uf', race: 'pres', uf: 'MG', tema: 'escuro' })).toBe('/embed/uf?uf=mg&tema=escuro');
    expect(caminhoEmbed({ tipo: 'mapa', race: 'pres', uf: 'SP', tema: 'auto' })).toBe('/embed/mapa');
  });
  it('a ida e volta preserva as opções', () => {
    const o = { tipo: 'placar' as const, race: 'gov-to', uf: 'SP' as const, tema: 'claro' as const };
    const [path, qs] = caminhoEmbed(o).split('?');
    expect(lerOpcoesEmbed(path.split('/').pop(), P(qs))).toEqual(o);
  });
  it('página completa e título', () => {
    expect(caminhoPaginaCompleta({ tipo: 'placar', race: 'gov-rj', uf: 'SP' })).toBe('/apuracao/rj?race=gov-rj');
    expect(caminhoPaginaCompleta({ tipo: 'uf', race: 'pres', uf: 'BA' })).toBe('/apuracao/ba');
    expect(caminhoPaginaCompleta({ tipo: 'mapa', race: 'pres', uf: 'SP' })).toBe('/apuracao');
    expect(tituloEmbed({ tipo: 'placar', race: 'gov-rj', uf: 'SP' })).toBe('Governador · Rio de Janeiro · Sintonia');
    expect(tituloEmbed({ tipo: 'uf', race: 'pres', uf: 'BA' })).toBe('Apuração em Bahia · Sintonia');
  });
});

describe('codigoIframe', () => {
  const url = 'https://sintonia.app/embed/placar?race=gov-rj&tema=claro';
  const o = lerOpcoesEmbed('placar', P('race=gov-rj&tema=claro'));
  const cod = codigoIframe(o, url);
  it('iframe com src, título, lazy e marcador', () => {
    expect(cod).toContain('<iframe src="https://sintonia.app/embed/placar?race=gov-rj&amp;tema=claro"');
    expect(cod).toContain('title="Governador · Rio de Janeiro · Sintonia"');
    expect(cod).toContain('loading="lazy"');
    expect(cod).toContain('data-sintonia');
    expect(cod).toContain('max-width:640px');
  });
  it('script de altura só aceita a origem do widget e é idempotente', () => {
    expect(cod).toContain(`d.tipo!=="${MENSAGEM_ALTURA}"`);
    expect(cod).toContain('e.origin!=="https://sintonia.app"');
    expect(cod).toContain('window.__sintoniaAltura');
    // o script roda: simula a página que incorpora
    const script = cod.split('<script>')[1].split('</script>')[0];
    const ouvintes: ((e: unknown) => void)[] = [];
    const fonte = {};
    const iframe = { contentWindow: fonte, style: { height: '' } };
    const win: Record<string, unknown> = { addEventListener: (_: string, f: (e: unknown) => void) => ouvintes.push(f) };
    const doc = { querySelectorAll: () => [iframe] };
    new Function('window', 'document', script)(win, doc);
    new Function('window', 'document', script)(win, doc);
    expect(ouvintes.length).toBe(1);
    ouvintes[0]({ data: { tipo: MENSAGEM_ALTURA, altura: 412.3 }, origin: 'https://outro.site', source: fonte });
    expect(iframe.style.height).toBe('');
    ouvintes[0]({ data: { tipo: MENSAGEM_ALTURA, altura: 412.3 }, origin: 'https://sintonia.app', source: fonte });
    expect(iframe.style.height).toBe('413px');
  });
  it('escapa aspas no src', () => {
    expect(codigoIframe(o, 'https://x.y/embed/placar?a="b"')).toContain('src="https://x.y/embed/placar?a=&quot;b&quot;"');
  });
});
