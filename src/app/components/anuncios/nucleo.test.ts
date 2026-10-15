import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AnuncioPublico } from '@/shared/anuncios';
import { ANTECIPA_PX, FAIXA_BARRA_PX, alturaTela, margemDaFaixa, naFaixa } from './faixaLivre';
import { CASA, escolhaDaPagina, fmtWhatsApp, hrefDoAnuncio, imagemDoAnuncio, iniciaisDaMarca, linkEmail, linkWhatsApp, temContato, tituloCurto } from './nucleo';

const ad = (id: string, formatos: AnuncioPublico['formatos'], extra: Partial<AnuncioPublico> = {}): AnuncioPublico => ({
  id,
  marca: id.toUpperCase(),
  titulo: 't',
  texto: '',
  cta: 'Ver',
  href: `https://sintonia.exemplo/api/anuncio/ir/${id}`,
  destino: `${id}.exemplo`,
  formatos,
  peso: 5,
  cota: 'apoio',
  ...extra,
});

describe('escolhaDaPagina', () => {
  it('sem anúncios: topo/rodapé vazios e o nativo 1 vira o anúncio da casa (só um por página)', () => {
    const e = escolhaDaPagina([], 'v|/');
    expect(e.topo).toBeNull();
    expect(e.rodape).toBeNull();
    expect(e.teste).toBeNull();
    expect(e.tv).toBeNull();
    expect(e.nativo(1)).toBe(CASA);
    expect(e.nativo(2)).toBeNull();
    expect(e.nativo(3)).toBeNull();
    expect(escolhaDaPagina(undefined, 'x').nativo(1)).toBe(CASA);
  });

  it('master vence no topo e na tv; o rodapé evita o anunciante do topo quando há outro', () => {
    const lista = [ad('a', ['topo', 'rodape', 'tv']), ad('m', ['topo', 'rodape', 'tv'], { cota: 'master', peso: 1 }), ad('b', ['rodape'])];
    for (let i = 0; i < 30; i++) {
      const e = escolhaDaPagina(lista, `visita${i}|/`);
      expect(e.topo?.id).toBe('m');
      expect(e.tv?.id).toBe('m');
      expect(e.rodape?.id).not.toBe('m');
    }
  });

  it('nativos não repetem anunciante na mesma página; acabando os anunciantes, casa uma vez e depois nada', () => {
    const lista = [ad('a', ['nativo']), ad('b', ['nativo']), ad('c', ['nativo'])];
    for (let i = 0; i < 30; i++) {
      const e = escolhaDaPagina(lista, `s${i}|/curiosidades`);
      const ids = [1, 2, 3].map((k) => (e.nativo(k) as AnuncioPublico).id);
      expect(new Set(ids).size).toBe(3);
      expect(e.nativo(4)).toBe(CASA);
      expect(e.nativo(5)).toBeNull();
    }
  });

  it('nativo evita o anunciante do topo, mas pode repeti-lo se for o único com o formato', () => {
    const so = [ad('a', ['topo', 'nativo'])];
    const e = escolhaDaPagina(so, 's|/');
    expect(e.topo?.id).toBe('a');
    expect((e.nativo(1) as AnuncioPublico).id).toBe('a');
    expect(e.nativo(2)).toBe(CASA);
    const dois = [ad('a', ['topo', 'nativo'], { cota: 'master' }), ad('b', ['nativo'])];
    for (let i = 0; i < 20; i++) expect((escolhaDaPagina(dois, `t${i}`).nativo(1) as AnuncioPublico).id).toBe('b');
  });

  it('determinística pela semente (mesma posição não troca a cada renderização) e independente da ordem de consulta', () => {
    const lista = [ad('a', ['nativo']), ad('b', ['nativo']), ad('c', ['nativo']), ad('d', ['nativo'])];
    const e1 = escolhaDaPagina(lista, 'v1|/apuracao');
    const e2 = escolhaDaPagina(lista, 'v1|/apuracao');
    const p2 = (e2.nativo(2) as AnuncioPublico).id; // consulta a 2 antes da 1
    expect((e1.nativo(1) as AnuncioPublico).id).toBe((e2.nativo(1) as AnuncioPublico).id);
    expect((e1.nativo(2) as AnuncioPublico).id).toBe(p2);
    // páginas e visitas diferentes variam
    const vistos = new Set<string>();
    for (let i = 0; i < 40; i++) vistos.add((escolhaDaPagina(lista, `v${i}|/`).nativo(1) as AnuncioPublico).id);
    expect(vistos.size).toBeGreaterThan(1);
  });

  it('sem a barra do rodapé na tela (desktop), os cartões podem usar o anunciante dela', () => {
    const lista = [ad('r', ['rodape', 'nativo']), ad('n', ['nativo'])];
    let usouR = false;
    for (let i = 0; i < 40; i++) {
      const cel = escolhaDaPagina(lista, `d${i}`);
      expect(cel.rodape?.id).toBe('r');
      expect((cel.nativo(1) as AnuncioPublico).id).toBe('n');
      const desk = escolhaDaPagina(lista, `d${i}`, { rodapeNaTela: false });
      if ((desk.nativo(1) as AnuncioPublico).id === 'r') usouR = true;
    }
    expect(usouR).toBe(true);
  });

  it('teste evita topo e rodapé quando possível; posição inválida → nada', () => {
    const lista = [ad('m', ['topo', 'teste'], { cota: 'master' }), ad('x', ['teste'])];
    for (let i = 0; i < 20; i++) expect(escolhaDaPagina(lista, `q${i}`).teste?.id).toBe('x');
    const e = escolhaDaPagina(lista, 'q');
    expect(e.nativo(0)).toBeNull();
    expect(e.nativo(-1)).toBeNull();
    expect(e.nativo(99)).toBeNull();
  });
});

describe('hrefDoAnuncio', () => {
  it('no servidor acrescenta ?f=<formato> ao link de clique', () => {
    expect(hrefDoAnuncio('https://sintonia2026.com.br/api/anuncio/ir/marca-exemplo', 'topo', false)).toBe(
      'https://sintonia2026.com.br/api/anuncio/ir/marca-exemplo?f=topo',
    );
    expect(hrefDoAnuncio('http://localhost:8787/api/anuncio/ir/abc', 'nativo', false)).toBe('http://localhost:8787/api/anuncio/ir/abc?f=nativo');
    expect(hrefDoAnuncio('/api/anuncio/ir/abc', 'rodape', false)).toBe('/api/anuncio/ir/abc?f=rodape');
  });
  it('no demo usa o destino como veio (já com UTM)', () => {
    const u = 'https://marca.exemplo/?utm_source=sintonia&utm_medium=link&utm_campaign=x';
    expect(hrefDoAnuncio(u, 'teste', true)).toBe(u);
    expect(hrefDoAnuncio('/api/anuncio/ir/abc', 'rodape', true)).toBeNull();
  });
  it('recusa esquemas perigosos e vazios', () => {
    expect(hrefDoAnuncio('javascript:alert(1)', 'topo', false)).toBeNull();
    expect(hrefDoAnuncio('data:text/html,oi', 'topo', false)).toBeNull();
    expect(hrefDoAnuncio('', 'topo', false)).toBeNull();
    expect(hrefDoAnuncio(undefined, 'topo', false)).toBeNull();
    expect(hrefDoAnuncio('/outra/rota', 'topo', false)).toBeNull();
  });
});

describe('imagemDoAnuncio', () => {
  it('aceita data URI de imagem e a imagem do próprio servidor', () => {
    expect(imagemDoAnuncio('data:image/png;base64,iVBORw0KGgo=')).not.toBeNull();
    expect(imagemDoAnuncio('data:image/svg+xml;base64,PHN2Zz4=')).not.toBeNull();
    expect(imagemDoAnuncio('https://sintonia2026.com.br/api/anuncio/img?h=abcdef0123')).not.toBeNull();
    expect(imagemDoAnuncio('/api/anuncio/img?h=abcdef0123')).not.toBeNull();
  });
  it('recusa imagem de terceiros e esquemas estranhos', () => {
    expect(imagemDoAnuncio('https://outro.site/logo.png')).toBeNull();
    expect(imagemDoAnuncio('javascript:alert(1)')).toBeNull();
    expect(imagemDoAnuncio('data:text/html;base64,PGI+')).toBeNull();
    expect(imagemDoAnuncio('/api/anuncio/img?h=zz')).toBeNull();
    expect(imagemDoAnuncio(undefined)).toBeNull();
  });
});

describe('textos e contato', () => {
  it('iniciais e título curto', () => {
    expect(iniciaisDaMarca('Marca Exemplo')).toBe('ME');
    expect(iniciaisDaMarca('café')).toBe('C');
    expect(iniciaisDaMarca('  ')).toBe('?');
    expect(tituloCurto('Curto')).toBe('Curto');
    const t = tituloCurto('Uma chamada bem comprida que não cabe na faixa do celular', 34);
    expect(t.length).toBeLessThanOrEqual(34);
    expect(t.endsWith('…')).toBe(true);
  });
  it('WhatsApp e e-mail com mensagem pronta', () => {
    expect(linkWhatsApp('55 (11) 99999-0000')).toMatch(/^https:\/\/wa\.me\/5511999990000\?text=Ol%C3%A1/);
    expect(linkWhatsApp('123')).toBeNull();
    expect(linkEmail('comercial@exemplo.com.br')).toMatch(/^mailto:comercial@exemplo\.com\.br\?subject=Anunciar%20no%20Sintonia&body=/);
    expect(linkEmail('sem-arroba')).toBeNull();
    expect(fmtWhatsApp('5511999990000')).toBe('+55 11 99999-0000');
    expect(temContato({})).toBe(false);
    expect(temContato({ email: 'a@b.co' })).toBe(true);
    expect(temContato(null)).toBe(false);
  });
});

describe('barra fixa do rodapé: nunca sobre resultado ou candidato', () => {
  it('a raiz do observador é só a faixa de baixo da tela', () => {
    expect(margemDaFaixa(844)).toBe(`-${844 - FAIXA_BARRA_PX}px 0px ${ANTECIPA_PX}px 0px`);
    expect(margemDaFaixa(150)).toBe(`-0px 0px ${ANTECIPA_PX}px 0px`); // tela mais baixa que a faixa: a tela toda
  });
  it('altura da tela: o zoom reduzido do carregamento (innerHeight ~3.400 no celular) não vale — vale a tela do aparelho', () => {
    // durante o carregamento, antes do CSS, o celular reduz o zoom para caber uma página larga (achado da revisão)
    expect(alturaTela({ innerHeight: 3376, visualViewport: { height: 3376 }, screen: { height: 844 } })).toBe(844);
    expect(margemDaFaixa(alturaTela({ innerHeight: 3376, visualViewport: { height: 3376 }, screen: { height: 844 } }))).toBe(`-${844 - FAIXA_BARRA_PX}px 0px ${ANTECIPA_PX}px 0px`);
    // normal: a menor entre janela e visualViewport (teclado aberto, barra de endereço)
    expect(alturaTela({ innerHeight: 844, visualViewport: { height: 780 }, screen: { height: 844 } })).toBe(780);
    expect(alturaTela({ innerHeight: 900 })).toBe(900);
  });
  it('bloco na faixa de baixo → ocupado; acima dela → livre', () => {
    // 390×844: a faixa vai de 644 a 844
    expect(naFaixa({ top: 120, bottom: 760 }, 844)).toBe(true); // cartão do confronto descendo até a faixa
    expect(naFaixa({ top: 700, bottom: 1400 }, 844)).toBe(true); // placar começando no pé da tela
    expect(naFaixa({ top: -400, bottom: 600 }, 844)).toBe(false); // já subiu: só o topo dele na tela
    expect(naFaixa({ top: 848, bottom: 1300 }, 844)).toBe(true); // vai aparecer no pé da tela: a barra sai antes
    expect(naFaixa({ top: 844 + ANTECIPA_PX + 1, bottom: 1300 }, 844)).toBe(false); // ainda longe, abaixo da tela
  });
  it('os blocos com resultado, foto, nome ou número de candidato levam a marca', () => {
    const arquivos = [
      'src/app/components/pages/home/DueloPresidencia.tsx',
      'src/app/components/pages/home/EntradaApuracao.tsx',
      'src/app/components/pages/nacional/PreHero.tsx',
      'src/app/components/pages/nacional/GovernadorCard.tsx',
      'src/app/components/apuracao/Placar.tsx',
      'src/app/components/apuracao/CandidateAvatar.tsx',
      'src/app/components/apuracao/VoteSplitBar.tsx',
      'src/app/components/apuracao/BoletimUrna.tsx',
      'src/app/components/pages/cargos/FotoOficial.tsx',
      'src/app/components/pages/cenarios/Placar.tsx',
    ];
    for (const a of arquivos) expect(readFileSync(a, 'utf8'), a).toContain('data-sem-anuncio-fixo');
    // a barra não tem mais cronômetro: só entra depois da 1ª rolagem e com a faixa livre
    const barra = readFileSync('src/app/components/anuncios/BarraRodape.tsx', 'utf8');
    expect(barra).toContain('useFaixaLivre');
    expect(barra).not.toMatch(/setTimeout\(liberar/);
  });
});
