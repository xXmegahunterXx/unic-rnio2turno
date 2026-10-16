/** Utilidades puras da seção "Anunciantes" do painel. */
import { describe, expect, it } from 'vitest';
import { FORMATOS_ANUNCIO, validaAnuncio, type AnuncioConfig, type MetricaAnuncio } from '@/shared/anuncios';
import { NOITE_ELEICAO } from '@/shared/relatorio';
import {
  AVISO_APURACAO,
  FIM_VOTACAO,
  HORA_MS,
  aCreditar,
  atalhosData,
  avisosDoAnuncio,
  csvCampo,
  csvPorHora,
  csvRelatorio,
  ctr,
  deCampoData,
  duplicarAnuncio,
  fatiaDoAnuncio,
  linhasRelatorio,
  paraCampoData,
  participacao,
  pctInteiros,
  previsaoEntrega,
  serieHoras,
  situacaoDe,
  textoPrevisao,
  totais48h,
  totaisDe,
} from './anunciosAdmin';

const AGORA = Date.UTC(2026, 9, 15, 15, 30, 0); // 12:30 de Brasília
const H0 = Math.floor(AGORA / HORA_MS) * HORA_MS;

const metricas: MetricaAnuncio[] = [
  { id: 'lynx', formato: 'topo', impressoes: 1000, cliques: 12, porHora: [{ hora: H0 - HORA_MS, impressoes: 300, cliques: 2 }, { hora: H0, impressoes: 100, cliques: 1 }] },
  { id: 'lynx', formato: 'nativo', impressoes: 200, cliques: 8, porHora: [{ hora: H0, impressoes: 50, cliques: 3 }] },
  { id: 'velho', formato: 'topo', impressoes: 10, cliques: 0, porHora: [{ hora: H0 - 60 * HORA_MS, impressoes: 10, cliques: 0 }] },
];

describe('anunciosAdmin', () => {
  it('situação pelo relógio do servidor', () => {
    expect(situacaoDe({ ativo: false, inicio: null, fim: null }, AGORA)).toBe('pausado');
    expect(situacaoDe({ ativo: true, inicio: null, fim: null }, AGORA)).toBe('no-ar');
    expect(situacaoDe({ ativo: true, inicio: AGORA + 1, fim: null }, AGORA)).toBe('agendado');
    expect(situacaoDe({ ativo: true, inicio: null, fim: AGORA }, AGORA)).toBe('encerrado');
    expect(situacaoDe({ ativo: false, inicio: null, fim: AGORA }, AGORA)).toBe('pausado');
    // meta atingida: saiu do site sozinho (até a meta aumentar ou sair)
    expect(situacaoDe({ ativo: true, inicio: AGORA - 1, fim: null }, AGORA, AGORA - 10)).toBe('meta-atingida');
    expect(situacaoDe({ ativo: true, inicio: AGORA - 1, fim: AGORA }, AGORA, AGORA - 10)).toBe('encerrado');
  });

  it('campo datetime-local em horário de Brasília (independe do fuso do aparelho)', () => {
    expect(paraCampoData(Date.UTC(2026, 9, 25, 20, 0))).toBe('2026-10-25T17:00');
    expect(deCampoData('2026-10-25T17:00')).toBe(Date.UTC(2026, 9, 25, 20, 0));
    expect(deCampoData('')).toBeNull();
    expect(paraCampoData(null)).toBe('');
    expect(deCampoData('25/10/2026')).toBeNaN();
    for (const ms of [Date.UTC(2026, 0, 1, 2, 59), AGORA - (AGORA % 60_000)]) expect(deCampoData(paraCampoData(ms))).toBe(ms);
  });

  it('totais, 48 h e CTR', () => {
    expect(totaisDe(metricas, 'lynx')).toEqual({ impressoes: 1200, cliques: 20 });
    expect(totaisDe(metricas)).toEqual({ impressoes: 1210, cliques: 20 });
    expect(totais48h(metricas, AGORA, 'lynx')).toEqual({ impressoes: 450, cliques: 6 });
    expect(totais48h(metricas, AGORA)).toEqual({ impressoes: 450, cliques: 6 }); // a hora de 60 h atrás fica de fora
    const s = serieHoras(metricas, AGORA, 'lynx');
    expect(s).toHaveLength(48);
    expect(s[47]).toEqual({ hora: H0, impressoes: 150, cliques: 4 });
    expect(s[46].impressoes).toBe(300);
    expect(ctr({ impressoes: 0, cliques: 0 })).toBeNull();
    expect(ctr({ impressoes: 200, cliques: 3 })).toBeCloseTo(1.5);
  });

  it('relatório: por anúncio e formato, ids removidos marcados; CSV em pt-BR (";" e vírgula decimal, BOM)', () => {
    const linhas = linhasRelatorio(metricas, [{ id: 'lynx', marca: 'Lynx' }, { id: 'novo', marca: 'Novo' }]);
    expect(linhas.map((l) => [l.id, l.marca, l.removido, l.formatos.map((f) => f.formato)])).toEqual([
      ['lynx', 'Lynx', false, ['topo', 'nativo']],
      ['novo', 'Novo', false, []],
      ['velho', 'velho', true, ['topo']],
    ]);
    const csv = csvRelatorio(metricas, [{ id: 'lynx', marca: 'Lynx; "Pay"' }], AGORA - 86400_000, AGORA);
    expect(csv.startsWith('﻿anuncio;marca;formato;impressoes_visiveis;cliques;ctr_pct;desde;gerado_em\r\n')).toBe(true);
    expect(csv).toContain('lynx;"Lynx; ""Pay""";topo;1000;12;1,20;');
    expect(csv).toContain('lynx;"Lynx; ""Pay""";total;1200;20;1,67;');
    const ph = csvPorHora(metricas, [{ id: 'lynx', marca: 'Lynx' }]);
    expect(ph.split('\r\n').filter(Boolean)).toHaveLength(1 + 4);
    expect(ph).toContain(`lynx;Lynx;topo;${new Date(H0).toISOString()};100;1`);
  });

  it('CSV: texto que começa com = + - @ TAB ou CR não vira fórmula na planilha', () => {
    expect(csvCampo('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCampo('+5511')).toBe("'+5511");
    expect(csvCampo('-1')).toBe("'-1");
    expect(csvCampo('@soma')).toBe("'@soma");
    expect(csvCampo('\tx')).toBe(`"'\tx"`);
    // separador de outra planilha (vírgula, Excel em inglês): o trecho depois dela também não vira fórmula
    expect(csvCampo("ACME,=cmd|' /C calc'!A0")).toBe(`"ACME,'=cmd|' /C calc'!A0"`);
    expect(csvCampo('a;\n+b')).toBe(`"a;\n'+b"`);
    expect(csvCampo('Lynx')).toBe('Lynx');
    expect(csvCampo(-3)).toBe('-3'); // número vem do código
    const csv = csvRelatorio(metricas, [{ id: 'lynx', marca: '=cmd|calc' }], AGORA - 86400_000, AGORA);
    expect(csv).toContain("lynx;'=cmd|calc;topo;");
  });
});

// ---- vendas (anunciantes v2) -----------------------------------------------------------------------------------

/** Configuração de produção em 16/10 (b88dfe1; imagens omitidas): Lynx master (o antigo "patrocínio") e UPdePix apoio. */
const PRODUCAO: AnuncioConfig[] = [
  {
    id: 'patrocinio',
    marca: 'Lynx',
    titulo: 'Oferece a apuração ao vivo. Carteira digital com Pix em tem…',
    texto: 'Oferece a apuração ao vivo. Carteira digital com Pix em tempo real, cartão virtual e sem mensalidade.',
    cta: 'Saiba mais',
    url: 'https://lynxpix.cc',
    formatos: ['topo', 'rodape', 'nativo', 'teste', 'tv', 'compartilhamento'],
    peso: 5,
    cota: 'master',
    ativo: true,
    inicio: null,
    fim: null,
    naoPolitico: true,
    logo: '/api/anuncio/img?h=0123456789abcdef',
  },
  {
    id: 'updepix',
    marca: 'UPdepix',
    titulo: 'Pague com Pix e receba DePix na hora',
    texto: 'Gateway Pix para DePix na Liquid Network. Cadastro simples, saque de volta para Pix e suporte humano quando precisar.',
    cta: 'Começar agora',
    url: 'https://updepix.com',
    formatos: ['topo', 'rodape', 'nativo', 'teste', 'tv', 'compartilhamento'],
    peso: 5,
    cota: 'apoio',
    ativo: true,
    inicio: null,
    fim: null,
    naoPolitico: true,
    logo: '/api/anuncio/img?h=fedcba9876543210',
  },
];

describe('participacao ("Espaços agora")', () => {
  it('produção: Lynx master com 100% no topo, na TV e nas imagens; UPdePix 0% neles; chat e lives vazios', () => {
    for (const f of ['topo', 'tv', 'compartilhamento'] as const) expect(participacao(PRODUCAO, f, AGORA)).toEqual([{ id: 'patrocinio', marca: 'Lynx', cota: 'master', reserva: false, fatia: 1, pct: 100 }]);
    expect(fatiaDoAnuncio(PRODUCAO[1], 'topo', PRODUCAO, AGORA)).toEqual({ fatia: 0, pct: 0, motivo: 'O master Lynx tem prioridade neste formato.' });
    // rodapé, cartões e Teste Cego dividem pelo peso (master não tem prioridade ali)
    for (const f of ['rodape', 'nativo', 'teste'] as const) expect(participacao(PRODUCAO, f, AGORA).map((x) => [x.id, x.fatia])).toEqual([['patrocinio', 0.5], ['updepix', 0.5]]);
    expect(participacao(PRODUCAO, 'chat', AGORA)).toEqual([]);
    expect(participacao(PRODUCAO, 'live', AGORA)).toEqual([]);
  });

  it('percentuais inteiros somam 100 (maior resto): 5 + 5 + 4 → 36 + 36 + 28', () => {
    expect(pctInteiros([5 / 14, 5 / 14, 4 / 14])).toEqual([36, 36, 28]);
    expect(pctInteiros([1 / 3, 1 / 3, 1 / 3])).toEqual([34, 33, 33]);
    expect(pctInteiros([1])).toEqual([100]);
    const lista = [{ ...PRODUCAO[0], cota: 'apoio' as const }, PRODUCAO[1], { ...PRODUCAO[1], id: 'vulpix', marca: 'Vulpix', peso: 4 }];
    expect(participacao(lista, 'rodape', AGORA).map((x) => x.pct)).toEqual([36, 36, 28]);
  });

  it('só os no ar: pausado, fora da janela, meta atingida ou suspensão geral não contam', () => {
    const lista: AnuncioConfig[] = [
      { ...PRODUCAO[1], id: 'a', peso: 3 },
      { ...PRODUCAO[1], id: 'b', peso: 1, ativo: false },
      { ...PRODUCAO[1], id: 'c', peso: 1, inicio: AGORA + HORA_MS },
      { ...PRODUCAO[1], id: 'd', peso: 1, fim: AGORA },
      { ...PRODUCAO[1], id: 'e', peso: 1 },
    ];
    expect(participacao(lista, 'nativo', AGORA).map((x) => [x.id, x.fatia])).toEqual([['a', 0.75], ['e', 0.25]]);
    expect(participacao(lista, 'nativo', AGORA, { esgotados: ['e'] }).map((x) => x.id)).toEqual(['a']);
    expect(participacao(lista, 'nativo', AGORA, { suspenso: true })).toEqual([]);
  });

  it('reserva fica de fora quando há pago; sozinha, preenche o formato; master com reserva conta como apoio', () => {
    const lynxReserva: AnuncioConfig = { ...PRODUCAO[0], cota: 'apoio', reserva: true, formatos: [...FORMATOS_ANUNCIO] };
    const lista = [lynxReserva, PRODUCAO[1]];
    expect(participacao(lista, 'topo', AGORA).map((x) => [x.id, x.fatia])).toEqual([['updepix', 1]]);
    expect(participacao(lista, 'chat', AGORA).map((x) => [x.id, x.fatia, x.reserva])).toEqual([['patrocinio', 1, true]]);
    expect(fatiaDoAnuncio(lynxReserva, 'topo', lista, AGORA).motivo).toBe('Reserva: entra só onde nenhum anúncio pago está no ar.');
    // um "master" marcado como reserva não tem prioridade (o servidor grava cota apoio)
    const masterReserva = { ...PRODUCAO[0], reserva: true as const };
    expect(participacao([masterReserva, PRODUCAO[1]], 'topo', AGORA).map((x) => x.id)).toEqual(['updepix']);
  });
});

describe('avisosDoAnuncio', () => {
  it('título da Lynx em produção: reticências, repetição no texto e "apuração"; logo sem ajuste; formatos com 0%', () => {
    const lynx = PRODUCAO[0];
    const avisos = avisosDoAnuncio(lynx);
    expect(avisos.some((t) => /reticências/.test(t))).toBe(true);
    expect(avisos.some((t) => /repetindo o título/.test(t))).toBe(true);
    expect(avisos).toContain(AVISO_APURACAO);
    expect(avisos.some((t) => /Ajustar agora/.test(t))).toBe(true);
    // UPdePix: 0% em topo, TV e imagens (o master tem prioridade)
    const up = avisosDoAnuncio(PRODUCAO[1], { anuncios: PRODUCAO, agora: AGORA });
    expect(up).toContain('Aparece em 3 dos 6 formatos marcados: fora de Topo, Modo TV, Imagens agora.');
    expect(up).not.toContain(AVISO_APURACAO);
  });

  it('título reescrito, neutro e com logo ajustada: sem avisos', () => {
    const ok = {
      ...PRODUCAO[0],
      titulo: 'Carteira digital com Pix em tempo real e sem mensalidade',
      texto: 'Cartão virtual e conta em minutos.',
      logoAjuste: { proporcao: 3.216, placaClaro: 'escura' as const, placaEscuro: 'nenhuma' as const, origem: 'auto' as const },
    };
    expect(avisosDoAnuncio(ok, { anuncios: [ok, PRODUCAO[1]], agora: AGORA })).toEqual([]);
    expect(avisosDoAnuncio({ ...ok, titulo: 'Abra sua conta...' })[0]).toMatch(/reticências/);
    expect(avisosDoAnuncio({ ...ok, texto: 'Resultado garantido na urna' })).toContain(AVISO_APURACAO);
  });

  it('bebida alcoólica: aviso do painel (aceita fora de 25/10 até as 17h)', () => {
    const cerveja = { ...PRODUCAO[1], marca: 'Cervejaria Serra', titulo: 'Cerveja artesanal com entrega', texto: '', logo: undefined };
    expect(avisosDoAnuncio(cerveja).some((t) => /Bebida alcoólica/.test(t))).toBe(true);
  });
});

describe('duplicarAnuncio', () => {
  it('id único <id>-2 (ou o próximo livre), pausado, sem datas, sem meta e com a declaração desmarcada', () => {
    const base: AnuncioConfig = { ...PRODUCAO[0], inicio: AGORA, fim: AGORA + HORA_MS, limiteImpressoes: 50_000 };
    const d = duplicarAnuncio(base, PRODUCAO.map((a) => a.id));
    expect(d).toMatchObject({ id: 'patrocinio-2', ativo: false, inicio: null, fim: null, naoPolitico: false, marca: 'Lynx', logo: base.logo });
    expect('limiteImpressoes' in d).toBe(false);
    expect(duplicarAnuncio(base, ['patrocinio', 'patrocinio-2', 'patrocinio-3']).id).toBe('patrocinio-4');
    const longo = { ...base, id: 'a'.repeat(40) };
    expect(duplicarAnuncio(longo, [longo.id]).id).toBe(`${'a'.repeat(38)}-2`);
    // a cópia confirmada passa na validação (com a URL do servidor como imagem)
    expect('ok' in validaAnuncio({ ...d, naoPolitico: true })).toBe(true);
  });
});

describe('atalhosData', () => {
  const brt = (s: string) => Date.parse(`${s}-03:00`);
  it('datas em Brasília, "agora" arredondado para o minuto', () => {
    const agora = brt('2026-10-20T10:15:42');
    const a = Object.fromEntries(atalhosData(agora).map((t) => [t.id, t]));
    expect(a.agora).toMatchObject({ inicio: brt('2026-10-20T10:15:00'), desabilitado: false });
    expect(a.agora.fim).toBeUndefined();
    expect(a['ate-apuracao']).toMatchObject({ inicio: brt('2026-10-20T10:15:00'), fim: brt('2026-10-25T17:00:00'), desabilitado: false });
    expect(a.noite).toMatchObject({ inicio: NOITE_ELEICAO.inicio, fim: NOITE_ELEICAO.fim });
    expect(paraCampoData(a.noite.inicio)).toBe('2026-10-25T17:00');
    expect(paraCampoData(a.noite.fim)).toBe('2026-10-26T02:00');
    expect(paraCampoData(a.depois.inicio)).toBe('2026-10-26T02:00');
    expect(paraCampoData(a.depois.fim)).toBe('2026-11-02T23:59');
    expect(a.limpar).toMatchObject({ inicio: null, fim: null });
    expect(FIM_VOTACAO).toBe(Date.UTC(2026, 9, 25, 20, 0));
  });

  it('na virada do dia (23h59 de Brasília = dia seguinte em UTC) e quando a janela já passou', () => {
    const virada = Date.UTC(2026, 9, 25, 2, 59, 30); // 24/10, 23:59:30 em Brasília
    const a = Object.fromEntries(atalhosData(virada).map((t) => [t.id, t]));
    expect(paraCampoData(a.agora.inicio)).toBe('2026-10-24T23:59');
    expect(a['ate-apuracao'].desabilitado).toBe(false);
    const naApuracao = Object.fromEntries(atalhosData(FIM_VOTACAO).map((t) => [t.id, t]));
    expect(naApuracao['ate-apuracao'].desabilitado).toBe(true);
    expect(naApuracao.noite.desabilitado).toBe(false);
    const depois = Object.fromEntries(atalhosData(NOITE_ELEICAO.fim).map((t) => [t.id, t]));
    expect([depois.noite.desabilitado, depois.depois.desabilitado]).toEqual([true, false]);
  });
});

describe('meta de impressões', () => {
  const h0 = Math.floor(AGORA / HORA_MS) * HORA_MS; // AGORA = 12:30 (meia hora corrente)
  const serie = (porHora: number, corrente: number) => [
    { hora: h0 - 3 * HORA_MS, impressoes: 99_999 }, // fora da janela
    { hora: h0 - 2 * HORA_MS, impressoes: porHora },
    { hora: h0 - HORA_MS, impressoes: porHora },
    { hora: h0, impressoes: corrente },
  ];

  it('ritmo das 2 horas cheias + a fração da corrente; previsão do horário', () => {
    const p = previsaoEntrega(serie(8_000, 4_000), 41_200, 100_000, AGORA, null);
    expect(p.tipo).toBe('meta');
    if (p.tipo !== 'meta') return;
    expect(p.ritmo).toBeCloseTo(20_000 / 2.5, 6);
    expect(p.quando).toBe(AGORA + ((100_000 - 41_200) / 8_000) * HORA_MS);
    expect(textoPrevisao(p)).toMatch(/^No ritmo atual \(8\smil\/h\) atinge a meta por volta de \d{2}:\d{2}\.$/);
  });

  it('ritmo zero, meta já batida e fim antes da meta', () => {
    expect(previsaoEntrega(serie(0, 0), 10, 1_000, AGORA, null)).toEqual({ tipo: 'sem-ritmo' });
    expect(previsaoEntrega(serie(8_000, 4_000), 1_000, 1_000, AGORA, null)).toEqual({ tipo: 'atingida' });
    // 8 mil/h, faltam 58.800, fim em 3 h → entrega 41.200 + 24.000 = 65.200 (~65%)
    const p = previsaoEntrega(serie(8_000, 4_000), 41_200, 100_000, AGORA, AGORA + 3 * HORA_MS);
    expect(p).toMatchObject({ tipo: 'parcial', faltam: 34_800 });
    if (p.tipo === 'parcial') {
      expect(p.pct).toBeCloseTo(0.652, 3);
      expect(textoPrevisao(p)).toMatch(/^No ritmo atual entrega ~65% até o fim \(\d{2}\/\d{2},\s\d{2}:\d{2}\): faltam 34,8\smil\.$/);
    }
  });

  it('a creditar: só depois do fim, o que faltou para a meta', () => {
    const a = { fim: AGORA, limiteImpressoes: 100_000 };
    expect(aCreditar(a, 83_400, AGORA)).toBe(16_600);
    expect(aCreditar(a, 83_400, AGORA - 1)).toBe(0);
    expect(aCreditar(a, 120_000, AGORA)).toBe(0);
    expect(aCreditar({ fim: null, limiteImpressoes: 100_000 }, 10, AGORA)).toBe(0);
  });
});

