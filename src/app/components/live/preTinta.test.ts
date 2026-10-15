/**
 * Script inline do index.html (antes da 1ª pintura): na /live, o tema e o fundo transparente saem da URL — a fonte do
 * OBS nunca "pisca" com o fundo do site ao ativar a cena. O script roda aqui de verdade (documento falso) e precisa
 * concordar com `lerOpcoesLive`, nos dois roteadores (BrowserRouter e o HashRouter do demo). Fora da /live, nada muda.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lerOpcoesLive } from './opcoes';

const INDEX = readFileSync(join(__dirname, '../../../../index.html'), 'utf8');
const SCRIPT = /<script>([\s\S]*?)<\/script>/.exec(INDEX)![1];

interface Resultado {
  tema: string | null;
  fundo: string | null;
  estilos: string[];
}

function rodar(pathname: string, search: string, hash = '', salvo: string | null = null): Resultado {
  const attrs = new Map<string, string>([['data-theme', 'dark']]);
  const estilos: string[] = [];
  const doc = {
    documentElement: {
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      getAttribute: (k: string) => attrs.get(k) ?? null,
    },
    createElement: () => ({ textContent: '' }),
    head: { appendChild: (el: { textContent: string }) => estilos.push(el.textContent) },
    querySelector: () => null,
  };
  const loc = { href: `https://sintonia2026.com.br${pathname}${search}${hash}`, pathname, search, hash };
  const ls = { getItem: () => salvo };
  const mm = () => ({ matches: false });
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('document', 'location', 'localStorage', 'matchMedia', SCRIPT)(doc, loc, ls, mm);
  return { tema: attrs.get('data-theme') ?? null, fundo: attrs.get('data-fundo') ?? null, estilos };
}

const CASOS = [
  '',
  'layout=placar',
  'layout=barra',
  'layout=canto&posicao=baixo-esquerda',
  'layout=mapa&fundo=transparente',
  'layout=barra&fundo=transparente&tema=claro',
  'layout=canto&tema=light',
  'layout=placar&fundo=claro',
  'layout=placar&fundo=claro&tema=escuro',
  'layout=barra&fundo=escuro&tema=claro',
  'layout=BARRA&fundo=Transparent',
  'fundo=dark',
  'fundo=light',
  'layout=xyz&fundo=verde&tema=roxo',
];

describe('index.html: tema e fundo da /live antes da 1ª pintura', () => {
  it.each(CASOS)('BrowserRouter: /live?%s concorda com lerOpcoesLive', (q) => {
    const o = lerOpcoesLive(new URLSearchParams(q));
    // o preferido salvo do site ("claro") nunca vale na live
    const r = rodar('/live', q ? `?${q}` : '', '', 'light');
    expect(r.tema).toBe(o.tema === 'claro' ? 'light' : 'dark');
    expect(r.fundo).toBe(o.fundo === 'transparente' ? 'transparente' : null);
    if (o.fundo === 'transparente') expect(r.estilos.join('')).toContain('background:transparent!important');
    else expect(r.estilos).toHaveLength(0);
  });

  it.each(CASOS)('HashRouter (demo): #/live?%s concorda com lerOpcoesLive', (q) => {
    const o = lerOpcoesLive(new URLSearchParams(q));
    const r = rodar('/sintonia/index.html', '', `#/live${q ? `?${q}` : ''}`, 'light');
    expect(r.tema).toBe(o.tema === 'claro' ? 'light' : 'dark');
    expect(r.fundo).toBe(o.fundo === 'transparente' ? 'transparente' : null);
  });

  it('fora da /live: preferência salva vale e nada fica transparente', () => {
    expect(rodar('/apuracao', '?fundo=transparente', '', 'light')).toEqual({ tema: 'light', fundo: null, estilos: [] });
    expect(rodar('/streamers', '', '', null)).toEqual({ tema: 'dark', fundo: null, estilos: [] });
    expect(rodar('/livex', '?fundo=transparente', '', null).fundo).toBeNull();
    expect(rodar('/anuncie', '', '#contato', 'light').fundo).toBeNull();
  });
});
