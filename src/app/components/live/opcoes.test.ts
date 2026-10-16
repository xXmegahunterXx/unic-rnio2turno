/**
 * Modo streamer (/live): leitura das opções da URL (padrões, apelidos em inglês, valores inválidos), URL que a página
 * /streamers monta (ida e volta), tema × fundo, disputas aceitas (derivadas de UFS_GOV_2T), relógio da contagem e o
 * site exibido na live.
 */
import { describe, expect, it } from 'vitest';
import { UFS_GOV_2T } from '@/shared/constants';
import {
  ajustarOpcoes,
  caminhoLive,
  DOMINIO_PADRAO,
  LAYOUTS_LIVE,
  lerOpcoesLive,
  opcoesPadrao,
  RACES_LIVE,
  rotuloRaceLive,
  temaEfetivo,
  type OpcoesLive,
} from './opcoes';
import { relogioLive, rotaApuracao, siteDaLive, urlQrLive } from './useQuadroLive';
import { corpoBatimento, idFonteLive, layoutContado } from './batimento';
import { LAYOUTS_CONTADOS, LIVES } from '@/shared/lives';

const ler = (s: string) => lerOpcoesLive(new URLSearchParams(s));

describe('lerOpcoesLive', () => {
  it('sem parâmetros: placar, fundo escuro, Presidente', () => {
    expect(ler('')).toEqual({ layout: 'placar', fundo: 'escuro', tema: 'escuro', race: 'pres', posicao: 'baixo', mapa: 'estados', uf: null, pessoas: true });
  });

  it('fundo padrão: tela cheia (placar, mapa) escuro; sobrepostos (barra, canto) transparentes', () => {
    expect(ler('layout=placar').fundo).toBe('escuro');
    expect(ler('layout=mapa').fundo).toBe('escuro');
    expect(ler('layout=barra').fundo).toBe('transparente');
    expect(ler('layout=canto').fundo).toBe('transparente');
  });

  it('aceita os nomes em inglês e maiúsculas', () => {
    expect(ler('layout=BARRA&fundo=Transparent').fundo).toBe('transparente');
    expect(ler('fundo=dark').fundo).toBe('escuro');
    expect(ler('fundo=light')).toMatchObject({ fundo: 'claro', tema: 'claro' });
    expect(ler('layout=barra&tema=light')).toMatchObject({ fundo: 'transparente', tema: 'claro' });
  });

  it('valores desconhecidos caem no padrão (a live nunca fica em branco por parâmetro errado)', () => {
    expect(ler('layout=xyz&fundo=verde&tema=roxo&race=gov-sp&posicao=meio')).toEqual(ler(''));
    expect(ler('layout=canto&posicao=baixo').posicao).toBe('topo-direita');
    expect(ler('layout=barra&posicao=topo-direita').posicao).toBe('baixo');
  });

  it('com fundo sólido o tema acompanha o fundo; transparente usa o tema pedido (padrão escuro)', () => {
    expect(temaEfetivo('escuro', 'claro')).toBe('escuro');
    expect(temaEfetivo('claro', 'escuro')).toBe('claro');
    expect(temaEfetivo('transparente', null)).toBe('escuro');
    expect(temaEfetivo('transparente', 'claro')).toBe('claro');
    expect(ler('fundo=escuro&tema=claro').tema).toBe('escuro');
  });

  it('disputas: Presidente + governador do 2º turno (fonte única UFS_GOV_2T); o resto cai em Presidente', () => {
    expect(RACES_LIVE).toEqual(['pres', ...UFS_GOV_2T.map((u) => `gov-${u.toLowerCase()}`)]);
    for (const r of RACES_LIVE) expect(ler(`race=${r.toUpperCase()}`).race).toBe(r);
    expect(ler('race=gov-rj').race).toBe('pres');
    expect(ler('race=pres-t1').race).toBe('pres');
    expect(rotuloRaceLive('pres')).toBe('Presidente');
    expect(rotuloRaceLive('gov-df')).toBe('Governador · Distrito Federal');
  });

  it('mapa por município só no layout mapa de Presidente', () => {
    expect(ler('layout=mapa&mapa=municipios').mapa).toBe('municipios');
    expect(ler(`layout=mapa&mapa=municipios&race=gov-${UFS_GOV_2T[0].toLowerCase()}`).mapa).toBe('estados');
    expect(ler('layout=placar&mapa=municipios').mapa).toBe('estados');
  });
});

describe('estado fixo (?uf=) e "pessoas agora" (?pessoas=)', () => {
  it('uf: as 27 UFs (qualquer caixa), só com Presidente; o resto cai no Brasil', () => {
    expect(ler('uf=pe').uf).toBe('PE');
    expect(ler('uf=SP&layout=barra').uf).toBe('SP');
    expect(ler('uf=zz').uf).toBeNull();
    expect(ler('uf=xx').uf).toBeNull();
    expect(ler('uf=pernambuco').uf).toBeNull();
    expect(ler(`uf=pe&race=gov-${UFS_GOV_2T[0].toLowerCase()}`).uf).toBeNull();
    // com estado fixo, o mapa é o do estado (o "por município do Brasil" não vale)
    expect(ler('layout=mapa&uf=pe&mapa=municipios')).toMatchObject({ uf: 'PE', mapa: 'estados' });
  });

  it('pessoas: padrão ligado; 0/não/false esconde', () => {
    expect(ler('').pessoas).toBe(true);
    expect(ler('pessoas=1').pessoas).toBe(true);
    for (const v of ['0', 'nao', 'false', 'OFF']) expect(ler(`pessoas=${v}`).pessoas).toBe(false);
  });

  it('a URL leva uf e pessoas=0 só quando valem', () => {
    expect(caminhoLive({ ...opcoesPadrao('barra'), uf: 'PE' })).toBe('/live?layout=barra&fundo=transparente&uf=pe');
    expect(caminhoLive({ ...opcoesPadrao('placar'), pessoas: false })).toBe('/live?layout=placar&fundo=escuro&pessoas=0');
    expect(caminhoLive({ ...opcoesPadrao('placar'), race: 'gov-df', uf: 'PE' })).toBe('/live?layout=placar&fundo=escuro&race=gov-df');
    expect(caminhoLive({ ...opcoesPadrao('mapa'), uf: 'RS', mapa: 'municipios' })).toBe('/live?layout=mapa&fundo=escuro&uf=rs');
    for (const o of [{ ...opcoesPadrao('canto'), uf: 'BA' as const, pessoas: false }, { ...opcoesPadrao('mapa'), uf: 'DF' as const }]) {
      expect(ler(caminhoLive(o).split('?')[1])).toEqual(ajustarOpcoes(o));
    }
  });
});

describe('caminhoLive (URL que vai para o OBS)', () => {
  it('layout e fundo sempre explícitos; o resto só quando difere do padrão', () => {
    expect(caminhoLive(opcoesPadrao('placar'))).toBe('/live?layout=placar&fundo=escuro');
    expect(caminhoLive(opcoesPadrao('barra'))).toBe('/live?layout=barra&fundo=transparente');
    expect(caminhoLive({ ...opcoesPadrao('canto'), posicao: 'baixo-esquerda', tema: 'claro', race: 'gov-df' })).toBe(
      '/live?layout=canto&fundo=transparente&tema=claro&race=gov-df&posicao=baixo-esquerda',
    );
    expect(caminhoLive({ ...opcoesPadrao('mapa'), mapa: 'municipios' })).toBe('/live?layout=mapa&fundo=escuro&mapa=municipios');
  });

  it('ida e volta: o que a /streamers monta é o que a /live lê', () => {
    const combos: OpcoesLive[] = [];
    for (const layout of LAYOUTS_LIVE)
      for (const fundo of ['transparente', 'escuro', 'claro'] as const)
        for (const tema of ['escuro', 'claro'] as const)
          for (const race of RACES_LIVE.slice(0, 2))
            combos.push(ajustarOpcoes({ ...opcoesPadrao(layout), fundo, tema, race, posicao: layout === 'canto' ? 'baixo-direita' : layout === 'barra' ? 'topo' : 'baixo' }));
    for (const o of combos) expect(ler(caminhoLive(o).split('?')[1])).toEqual(o);
  });

  it('ajustarOpcoes: trocar o fundo para sólido leva o tema junto', () => {
    expect(ajustarOpcoes({ ...opcoesPadrao('barra'), fundo: 'claro', tema: 'escuro' }).tema).toBe('claro');
    expect(ajustarOpcoes({ ...opcoesPadrao('barra'), fundo: 'escuro', tema: 'claro' }).tema).toBe('escuro');
  });
});

describe('relógio, QR e site da live', () => {
  const base = { simNow: 1_000_000, pausado: false, congelado: false, velocidade: 1 };
  it('a contagem anda entre uma consulta e outra (também na fase pre); pausado/congelado param', () => {
    expect(relogioLive(base, 10_000, 13_000)).toBe(1_003_000);
    expect(relogioLive({ ...base, velocidade: 20 }, 10_000, 11_000)).toBe(1_020_000);
    expect(relogioLive({ ...base, pausado: true }, 10_000, 13_000)).toBe(1_000_000);
    expect(relogioLive({ ...base, congelado: true }, 10_000, 13_000)).toBe(1_000_000);
    expect(relogioLive(base, 13_000, 10_000)).toBe(1_000_000);
  });

  it('QR leva à apuração da disputa (ou do estado fixo), com utm_source=live', () => {
    expect(rotaApuracao('pres')).toBe('/apuracao');
    expect(rotaApuracao('pres', 'PE')).toBe('/apuracao/pe');
    expect(rotaApuracao('gov-df')).toBe('/apuracao/df?race=gov-df');
    expect(rotaApuracao('gov-df', 'PE')).toBe('/apuracao/df?race=gov-df');
    expect(urlQrLive('https://sintonia2026.com.br', 'pres')).toBe('https://sintonia2026.com.br/apuracao?utm_source=live');
    expect(urlQrLive('https://sintonia2026.com.br', 'pres', 'PE')).toBe('https://sintonia2026.com.br/apuracao/pe?utm_source=live');
    expect(urlQrLive('https://sintonia2026.com.br', 'gov-df')).toBe('https://sintonia2026.com.br/apuracao/df?race=gov-df&utm_source=live');
  });

  it('sem VITE_SITE_URL, a live mostra o endereço do produto', () => {
    expect(siteDaLive()).toEqual({ site: `https://${DOMINIO_PADRAO}`, dominio: DOMINIO_PADRAO });
    expect(DOMINIO_PADRAO).toBe('sintonia2026.com.br');
  });
});

describe('batimento da /live (contagem anônima)', () => {
  it('id aleatório de 12 caracteres [a-z0-9]', () => {
    const id = idFonteLive();
    expect(id).toMatch(/^[a-z0-9]{12}$/);
    expect(idFonteLive()).not.toBe(id);
    expect(idFonteLive((n) => new Uint8Array(n))).toBe('aaaaaaaaaaaa');
  });

  it('layout contado: os da /live e "vertical" para placar e mapa em pé', () => {
    expect(LAYOUTS_CONTADOS.filter((l) => l !== 'vertical')).toEqual([...LAYOUTS_LIVE]);
    expect(layoutContado('placar', true)).toBe('vertical');
    expect(layoutContado('mapa', true)).toBe('vertical');
    expect(layoutContado('barra', true)).toBe('barra');
    expect(layoutContado('canto', false)).toBe('canto');
  });

  it('corpo cabe no limite do servidor e não leva nada além do id, layout e anúncio', () => {
    const c = corpoBatimento('abcdefghijkl', 'vertical', 'um-anuncio-com-id-bem-comprido-de-40-car');
    expect(new TextEncoder().encode(c).length).toBeLessThanOrEqual(LIVES.corpoMax);
    expect(JSON.parse(c)).toEqual({ id: 'abcdefghijkl', layout: 'vertical', a: ['um-anuncio-com-id-bem-comprido-de-40-car'] });
    expect(JSON.parse(corpoBatimento('abcdefghijkl', 'barra', null))).toEqual({ id: 'abcdefghijkl', layout: 'barra' });
  });
});
