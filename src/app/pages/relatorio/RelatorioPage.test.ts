/**
 * Página /relatorio (E17), renderização estática do conteúdo com um relatório sintético: números com `.num`, logo do
 * anunciante, nenhum anúncio do site (nenhum link patrocinado), sem conteúdo eleitoral, período padrão e rótulos de hora.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AnuncioPublico } from '@/shared/anuncios';
import { NOITE_ELEICAO, type RelatorioAnunciante } from '@/shared/relatorio';
import { TemaLocal } from '@/app/components/anuncios/pecas';
import { RelatorioConteudo, cruzaNoite, periodoPadrao, rotuloHora } from './RelatorioPage';

const HORA = 3_600_000;
const ANUNCIO: AnuncioPublico = {
  id: 'lynx',
  marca: 'Lynx',
  titulo: 'Carteira digital com Pix em tempo real e sem mensalidade',
  texto: '',
  cta: 'Abrir conta',
  href: '',
  destino: 'lynxpix.cc',
  logo: 'https://sintonia2026.com.br/api/anuncio/img?h=0123456789abcdef',
  logoAjuste: { proporcao: 3.216, placaClaro: 'escura', placaEscuro: 'nenhuma', origem: 'auto' },
  formatos: ['topo', 'nativo', 'tv', 'chat'],
  peso: 5,
  cota: 'master',
};

function relatorio(agora: number, extra: Partial<RelatorioAnunciante> = {}): RelatorioAnunciante {
  const horas: RelatorioAnunciante['horas'] = [];
  for (let h = NOITE_ELEICAO.inicio; h < NOITE_ELEICAO.fim && h <= agora; h += HORA) {
    horas.push({ hora: h, formato: 'topo', impressoes: 12_000 + (h % 7) * 900, cliques: 140 });
    horas.push({ hora: h, formato: 'tv', impressoes: 3_100, cliques: 0 });
  }
  return {
    geradoEm: agora,
    desde: NOITE_ELEICAO.inicio - 72 * HORA,
    anuncio: ANUNCIO,
    situacao: 'no-ar',
    inicio: NOITE_ELEICAO.inicio - 48 * HORA,
    fim: NOITE_ELEICAO.fim,
    horas,
    dias: [],
    alcance: { campanha: 61_000, noite: 52_000 },
    ...extra,
  };
}

const render = (r: RelatorioAnunciante, tema: 'claro' | 'escuro' = 'escuro') =>
  renderToStaticMarkup(createElement(TemaLocal.Provider, { value: tema }, createElement(MemoryRouter, null, createElement(RelatorioConteudo, { r }))));

describe('RelatorioConteudo', () => {
  const agora = NOITE_ELEICAO.inicio + 5.5 * HORA;

  it('blocos de números com .num, a logo do anunciante e a situação', () => {
    const html = render(relatorio(agora));
    for (const t of ['Impressões visíveis', 'Pessoas alcançadas', 'Frequência média', 'Cliques', 'Taxa de cliques', 'Por hora', 'Por formato', 'Como medimos', 'Baixar CSV', 'Imprimir / salvar PDF'])
      expect(html).toContain(t);
    expect(html).toContain('No ar');
    expect(html).toContain('Ao vivo');
    expect(html).toMatch(/class="num[^"]*"[^>]*>52\.000</); // alcance da noite (período padrão: a noite já começou)
    expect(html).toContain('data-logo-placa="nenhuma"');
    expect(html).toContain('Pico:');
  });

  it('nenhum anúncio do site: nenhum link patrocinado, nenhum rótulo "Anuncie"', () => {
    const html = render(relatorio(agora), 'claro');
    expect(html).not.toContain('rel="sponsored');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('Anuncie no Sintonia');
    // sem conteúdo eleitoral (a vitrine do chat mostra o nome da sala, "Sala da apuração", onde a faixa aparece)
    expect(html.replace(/Sala da apuração/g, '')).not.toMatch(/candidat|apura|Lula|Bolsonaro|placar|turno/i);
  });

  it('meta só quando vem no relatório', () => {
    expect(render(relatorio(agora))).not.toContain('contratado');
    const html = render(relatorio(agora, { meta: { limite: 100_000, entregue: 41_200 } }));
    expect(html).toContain('contratado');
    expect(html).toContain('100.000');
    expect(html).toContain('41.200');
    expect(html).toContain('41%');
  });

  it('reinício do servidor no período: o alcance avisa que a estimativa é conservadora', () => {
    expect(render(relatorio(agora))).not.toContain('Estimativa conservadora');
    expect(render(relatorio(agora, { alcance: { campanha: 61_000, noite: 52_000, segmentos: { campanha: 2, noite: 1 } } }))).not.toContain('Estimativa conservadora');
    expect(render(relatorio(agora, { alcance: { campanha: 61_000, noite: 52_000, segmentos: { campanha: 1, noite: 2 } } }))).toContain(
      'Estimativa conservadora: o servidor reiniciou no período',
    );
  });

  it('sem impressões: mensagem no lugar do gráfico; sem alcance, travessão', () => {
    const html = render(relatorio(NOITE_ELEICAO.inicio - 10 * HORA, { horas: [], alcance: { campanha: null, noite: null } }));
    expect(html).toContain('Ainda sem impressões contadas neste período.');
    expect(html).toContain('>—<');
  });
});

describe('ajudas da página', () => {
  it('período padrão: a noite, se a campanha a cruza e ela já começou; senão, a campanha', () => {
    const r = { inicio: NOITE_ELEICAO.inicio - 48 * HORA, fim: null };
    expect(cruzaNoite(r)).toBe(true);
    expect(periodoPadrao(r, NOITE_ELEICAO.inicio - HORA)).toBe('campanha');
    expect(periodoPadrao(r, NOITE_ELEICAO.inicio)).toBe('noite');
    const depois = { inicio: NOITE_ELEICAO.fim, fim: null };
    expect(cruzaNoite(depois)).toBe(false);
    expect(periodoPadrao(depois, NOITE_ELEICAO.fim + HORA)).toBe('campanha');
    expect(cruzaNoite({ inicio: null, fim: NOITE_ELEICAO.inicio })).toBe(false);
  });
  it('rótulo da hora em Brasília', () => {
    expect(rotuloHora(Date.parse('2026-10-25T20:00:00-03:00'))).toBe('20h–21h');
    expect(rotuloHora(Date.parse('2026-10-25T23:00:00-03:00'))).toBe('23h–0h');
    expect(rotuloHora(Date.parse('2026-10-26T01:00:00-03:00'), true)).toBe('26/10, 1h–2h');
  });
});
