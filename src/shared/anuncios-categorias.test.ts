/**
 * Categorias sensíveis (src/shared/anuncios-categorias.ts): apostas, cassino e mercados de previsão recusados; bebida
 * alcoólica com aviso no painel e recusada se a janela cobrir 25/10 até as 19h (Brasília, com a prorrogação). Também pela validação
 * única (`validaAnuncio`), logo depois da barreira político-eleitoral.
 */
import { describe, expect, it } from 'vitest';
import { validaAnuncio } from './anuncios';
import { avisoCategoria, categoriaDoAnuncio, JANELA_SEM_ALCOOL, mensagemCategoria, motivoCategoria, recusaAlcoolNaJanela } from './anuncios-categorias';

const base = {
  id: 'loja',
  marca: 'Loja Exemplo',
  titulo: 'Ofertas da semana',
  texto: 'Entrega em todo o Brasil.',
  cta: 'Ver ofertas',
  url: 'https://loja.exemplo.com.br/ofertas',
  formatos: ['nativo'],
  peso: 5,
  cota: 'apoio',
  ativo: true,
  naoPolitico: true,
};

const campos = (extra: Partial<Record<'marca' | 'titulo' | 'texto' | 'cta', string>>) => {
  const a = { marca: base.marca, titulo: base.titulo, texto: base.texto, cta: base.cta, ...extra };
  return [
    { campo: 'marca', valor: a.marca },
    { campo: 'título', valor: a.titulo },
    { campo: 'texto', valor: a.texto },
    { campo: 'botão', valor: a.cta },
  ];
};
const cat = (extra: Partial<Record<'marca' | 'titulo' | 'texto' | 'cta', string>>, url = base.url) => categoriaDoAnuncio(campos(extra), url)?.categoria ?? null;

/** 25/10/2026, hh:mm de Brasília (UTC−3). */
const brt = (dia: number, h: number, m = 0) => Date.UTC(2026, 9, dia, h + 3, m);

describe('categorias recusadas', () => {
  it('apostas: termos, marcas e "bet" como palavra', () => {
    for (const extra of [
      { titulo: 'Aposte agora e ganhe bônus' },
      { texto: 'As melhores odds do Brasileirão' },
      { marca: 'Bet365' },
      { marca: 'PixBet' },
      { marca: 'Estrela Bet' },
      { titulo: 'Bolão da Copa' },
      { titulo: 'Resultado da Mega-Sena' },
      { texto: 'Raspadinha online' },
      { marca: 'Betano' },
      { marca: 'KTO' },
      { cta: 'Apostar' },
    ])
      expect(cat(extra), JSON.stringify(extra)).toBe('apostas');
  });

  it('apostas pelo destino: .bet.br, .bet, rótulo "bet" e nomes de operadoras', () => {
    for (const url of ['https://galera.bet.br', 'https://www.algo.bet', 'https://bet365.com/br', 'https://www.betano.com', 'https://1xbet.com', 'https://stake.com', 'https://loja.com.br/?r=apostas'])
      expect(cat({}, url), url).toBe('apostas');
  });

  it('cassino e jogos de azar', () => {
    for (const extra of [
      { titulo: 'Cassino online com bônus' },
      { texto: 'Caça-níquel ao vivo' },
      { texto: 'Jogo do Tigrinho' },
      { marca: 'Fortune Tiger' },
      { titulo: 'Roleta ao vivo' },
      { titulo: 'Torneio de pôquer' },
      { titulo: 'Bingo da sorte' },
      { texto: 'Jogos de azar' },
    ])
      expect(cat(extra), JSON.stringify(extra)).toBe('cassino');
    expect(cat({}, 'https://sorte.casino')).toBe('cassino');
    expect(cat({}, 'https://meucassino.com.br')).toBe('cassino');
  });

  it('mercados de previsão (Polymarket, Kalshi e afins)', () => {
    for (const extra of [{ marca: 'Polymarket' }, { marca: 'Kalshi' }, { titulo: 'O maior mercado de previsões do mundo' }, { texto: 'Prediction markets' }, { marca: 'PredictIt' }])
      expect(cat(extra), JSON.stringify(extra)).toBe('previsao');
    for (const url of ['https://polymarket.com', 'https://kalshi.com/markets', 'https://www.predictit.org', 'https://smarkets.com'])
      expect(cat({}, url), url).toBe('previsao');
  });

  it('não recusa anúncio comum (falsos positivos conhecidos ficam de fora)', () => {
    for (const [extra, url] of [
      [{ marca: 'Lynx', titulo: 'Carteira digital com Pix em tempo real e sem mensalidade' }, 'https://lynxpix.cc'],
      [{ marca: 'UPdePix', titulo: 'Pague com Pix e receba DePix na hora' }, 'https://updepix.com'],
      [{ marca: 'Vulpix', titulo: 'Números virtuais para verificação' }, 'https://vulpix.com.br'],
      [{ marca: 'Pousada do Mar', titulo: 'Diárias na Praia do Cassino' }, 'https://pousada.exemplo.com.br'],
      [{ marca: 'Pousada do Mar', titulo: 'Fim de semana no sul' }, 'https://praiadocassino.com.br'],
      [{ marca: 'Alphabet Escola de Idiomas', titulo: 'Inglês para viagem' }, 'https://alphabet.exemplo.com.br'],
      [{ marca: 'Doces da Elizabet', titulo: 'Bolos sob encomenda' }, 'https://doces.exemplo.com.br'],
      [{ marca: 'Beta Construções', titulo: 'Betoneira para alugar' }, 'https://beta.exemplo.com.br'],
      [{ marca: 'Festas & Cia', titulo: 'Referência no mercado de eventos', texto: 'Contrato de eventos sem burocracia.' }, 'https://festas.exemplo.com.br'],
      [{ marca: 'Feira da Terra', titulo: 'Produtores locais' }, 'https://farmersmarkets.exemplo.org'],
      [{ marca: 'Clima Já', titulo: 'Previsão do tempo para o fim de semana' }, 'https://clima.exemplo.com.br'],
    ] as const)
      expect(cat(extra, url), JSON.stringify(extra)).toBeNull();
  });

  it('mensagem neutra e com o campo (ou o destino)', () => {
    const r = validaAnuncio({ ...base, titulo: 'Aposte no seu time' });
    expect(r).toEqual({ erro: 'Anúncio recusado: o Sintonia não aceita anúncios de apostas (termo "aposta" em "título").' });
    const d = validaAnuncio({ ...base, url: 'https://galera.bet.br' });
    expect(d).toEqual({ erro: 'Anúncio recusado: o Sintonia não aceita anúncios de apostas (link para site de apostas).' });
    expect(motivoCategoria(campos({ marca: 'Polymarket' }), base.url)).toBe(
      'Anúncio recusado: o Sintonia não aceita anúncios de mercados de previsão (termo "Polymarket" em "marca").',
    );
    expect(motivoCategoria(campos({}), base.url)).toBeNull();
    expect(mensagemCategoria({ categoria: 'cassino', termo: 'bingo', campo: 'texto' })).toContain('cassino ou jogos de azar');
  });

  it('vem logo depois da barreira político-eleitoral (a política fala primeiro)', () => {
    const r = validaAnuncio({ ...base, titulo: 'Vote e aposte' });
    expect('erro' in r && r.erro).toMatch(/político-eleitoral/);
  });

  it('vale também no estado restaurado e no servidor: a validação é a única (validaAnuncio)', () => {
    expect('erro' in validaAnuncio({ ...base, marca: 'Bet Brasil' })).toBe(true);
    expect('ok' in validaAnuncio(base)).toBe(true);
  });
});

describe('bebida alcoólica', () => {
  it('é detectada (aviso no painel), sem confundir cor com bebida', () => {
    expect(cat({ titulo: 'Cerveja gelada no happy hour' })).toBe('alcool');
    expect(cat({ marca: 'Vinícola Serra' })).toBe('alcool');
    expect(cat({ texto: 'Gin tônica em dobro' })).toBe('alcool');
    expect(cat({ marca: 'Heineken' })).toBe('alcool');
    expect(cat({}, 'https://www.wine.com.br')).toBe('alcool');
    expect(cat({ titulo: 'Camisa na cor vinho' })).toBeNull();
    expect(cat({ titulo: 'Vestido tom champanhe' })).toBeNull();
    expect(cat({ titulo: 'Camarão pitu fresco' })).toBeNull();
    // listas de cores e "sem álcool" (achado da revisão): não são bebida alcoólica
    expect(cat({ titulo: 'Camisetas em preto, branco e vinho' })).toBeNull();
    expect(cat({ titulo: 'Moletom vinho e marinho' })).toBeNull();
    expect(cat({ titulo: 'Cerveja sem álcool para o almoço' })).toBeNull();
    expect(cat({ titulo: 'Chope zero álcool' })).toBeNull();
    // mas o vinho e a cerveja de verdade continuam pegos
    expect(cat({ titulo: 'Vinhos chilenos com 20% off' })).toBe('alcool');
    expect(cat({ titulo: 'Vinho tinto e queijos' })).toBe('alcool');
    expect(cat({ titulo: 'Vinho branco gelado' })).toBe('alcool');
    expect(cat({ titulo: 'Vinho rosé e espumante' })).toBe('alcool');
    expect(cat({ titulo: 'Cerveja artesanal e cerveja sem álcool' })).toBe('alcool');
    expect(cat({ marca: 'Heineken', titulo: 'Heineken 0.0 sem álcool' })).toBe('alcool');
  });

  it('as categorias recusadas vencem a bebida (ex.: cerveja + aposta)', () => {
    expect(cat({ titulo: 'Cerveja e apostas' })).toBe('apostas');
    expect(cat({ titulo: 'Cerveja' }, 'https://galera.bet.br')).toBe('apostas');
  });

  it('aviso só para bebida alcoólica', () => {
    const aviso = avisoCategoria({ marca: 'Cervejaria Serra', titulo: 'Chope artesanal', texto: '', cta: 'Ver', url: base.url });
    expect(aviso).toMatch(/^Bebida alcoólica \(termo "cerveja" em "marca"\): o anúncio não pode ficar no ar em 25\/10 até as 19h \(Brasília\)/);
    expect(avisoCategoria({ marca: 'Loja', titulo: 'Ofertas', texto: '', cta: 'Ver', url: base.url })).toBeNull();
    expect(avisoCategoria({ marca: 'Bet', titulo: 'Ofertas', texto: '', cta: 'Ver', url: base.url })).toBeNull(); // recusada: sai como erro
  });

  it('janela sem álcool: 25/10, 0h → 19h de Brasília', () => {
    expect(JANELA_SEM_ALCOOL.inicio).toBe(Date.parse('2026-10-25T03:00:00Z'));
    expect(JANELA_SEM_ALCOOL.fim).toBe(Date.parse('2026-10-25T22:00:00Z'));
  });

  it('recusada se a janela cobrir 25/10 até as 19h; encostada passa', () => {
    const a = { categoria: 'alcool' as const, termo: 'cerveja', campo: 'título' };
    expect(recusaAlcoolNaJanela(a, { inicio: null, fim: null })).toMatch(/25\/10 até as 19h/);
    expect(recusaAlcoolNaJanela(a, { inicio: brt(20, 9), fim: null })).not.toBeNull();
    expect(recusaAlcoolNaJanela(a, { inicio: null, fim: brt(25, 0, 1) })).not.toBeNull();
    expect(recusaAlcoolNaJanela(a, { inicio: brt(25, 16, 59), fim: brt(26, 2) })).not.toBeNull();
    expect(recusaAlcoolNaJanela(a, { inicio: brt(25, 17), fim: brt(26, 2) })).not.toBeNull(); // prorrogação: 17h–19h ainda é votação
    expect(recusaAlcoolNaJanela(a, { inicio: brt(20, 9), fim: brt(25, 0) })).toBeNull(); // termina 25/10, 0h
    expect(recusaAlcoolNaJanela(a, { inicio: brt(25, 19), fim: null })).toBeNull(); // começa 25/10, 19h
    expect(recusaAlcoolNaJanela(a, { inicio: brt(1, 9), fim: brt(10, 9) })).toBeNull();
  });

  it('na validação: aceita fora da janela, recusa dentro (texto neutro)', () => {
    const cerveja = { ...base, marca: 'Cervejaria Serra', titulo: 'Chope artesanal' };
    const r = validaAnuncio(cerveja);
    expect(r).toEqual({
      erro: 'Anúncio de bebida alcoólica (termo "cerveja" em "marca"): não pode ficar no ar em 25/10 até as 19h (Brasília), durante a votação. Termine até 25/10, 0h, ou comece a partir de 25/10, 19h.',
    });
    expect('ok' in validaAnuncio({ ...cerveja, inicio: brt(25, 19) })).toBe(true);
    expect('erro' in validaAnuncio({ ...cerveja, inicio: brt(25, 17) })).toBe(true); // prorrogação até 19h
    expect('ok' in validaAnuncio({ ...cerveja, inicio: brt(18, 9), fim: brt(25, 0) })).toBe(true);
    expect('erro' in validaAnuncio({ ...cerveja, inicio: brt(18, 9), fim: brt(25, 18) })).toBe(true);
  });
});
