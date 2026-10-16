/**
 * Categorias sensíveis de anúncio (ARCHITECTURE §1.5): checagem objetiva do texto e do destino, chamada por
 * `validaAnuncio` (src/shared/anuncios.ts) logo depois de `motivoPolitico` — vale no painel, no zod do servidor, no
 * motor e no estado restaurado.
 *
 *  - RECUSADAS: apostas (bets, casas de apostas, loterias, bolões), cassino e jogos de azar (caça-níquel, roleta,
 *    pôquer, bingo, "tigrinho"…) e mercados de previsão (Polymarket, Kalshi, PredictIt e afins). Pelo texto (marca,
 *    título, texto, botão e caminho do link) e pelo destino (domínios .bet/.bet.br/.casino…, nomes de operadoras).
 *  - BEBIDA ALCOÓLICA: aceita, com aviso no painel (`avisoCategoria`), e recusada se a janela de exibição cobrir o dia
 *    da votação até o fim dela (25/10, 0h → 17h de Brasília; `JANELA_SEM_ALCOOL`).
 *
 * Como em anuncios-politica.ts, conservador de propósito: um falso positivo no texto só pede outra redação. Os textos
 * são descritivos e neutros (dizem a categoria, o termo e o campo).
 */
import { normalizarTexto, type CampoAnuncioPolitica } from './anuncios-politica';

export type CategoriaRecusada = 'apostas' | 'cassino' | 'previsao';
export type CategoriaSensivel = CategoriaRecusada | 'alcool';

/** O que foi achado: a categoria, o termo (como a mensagem mostra) e o campo ('marca', 'título', 'texto', 'botão',
 *  'link' — o caminho do link — ou 'destino' — o domínio). */
export interface AchadoCategoria {
  categoria: CategoriaSensivel;
  termo: string;
  campo: string;
}

/** Nome da categoria nas mensagens. */
export const NOME_CATEGORIA: Record<CategoriaSensivel, string> = {
  apostas: 'apostas',
  cassino: 'cassino ou jogos de azar',
  previsao: 'mercados de previsão',
  alcool: 'bebida alcoólica',
};

/**
 * Dia da votação até o fim dela (25/10/2026, 0h → 17h de Brasília, [inicio, fim)): anúncio de bebida alcoólica cuja
 * janela de exibição cruze este intervalo é recusado.
 */
export const JANELA_SEM_ALCOOL = {
  inicio: Date.parse('2026-10-25T00:00:00-03:00'),
  fim: Date.parse('2026-10-25T17:00:00-03:00'),
} as const;

// ---- termos (sobre o texto normalizado: minúsculas, sem acento, palavras separadas por um espaço) --------------------

type Termo = readonly [RegExp, string];

const TERMOS: Readonly<Record<CategoriaSensivel, readonly Termo[]>> = {
  previsao: [
    // "mercado de eventos" e "contrato de eventos" ficam de fora: em português são o setor de festas e feiras
    [/\bmercados? de (previsao|previsoes|predicao|predicoes)\b|\bprediction markets?\b/, 'mercado de previsão'],
    [/\bevent contracts?\b/, 'contrato de evento'],
    [/\bpolymarket\b/, 'Polymarket'],
    [/\bkalshi\b/, 'Kalshi'],
    [/\bpredictit\b/, 'PredictIt'],
    [/\bmanifold markets?\b|\bpolkamarkets?\b|\bmyriad markets?\b|\bhedgehog markets?\b|\bforecastex\b|\bsmarkets\b|\baugur\b/, 'mercado de previsão'],
  ],
  apostas: [
    [/\bapost(a|as|ar|e|em|ando|ador|adores|adora|adoras)\b/, 'aposta'],
    [/\bodds\b/, 'odds'],
    [/\b(sportsbook|bookmaker|bookie)s?\b/, 'casa de apostas'],
    [/\bloterias?\b|\bmega ?sena\b|\blotofacil\b|\blotomania\b|\braspadinhas?\b|\bjogo do bicho\b/, 'loteria'],
    [/\bbol(ao|oes)\b/, 'bolão'],
    [
      /\b(betano|betfair|betway|betsson|betmgm|betnacional|betboo|betsul|betpix\d*|betvip|betwarrior|betmotion|betcris|sportingbet|parimatch|rivalo|brazino\d*|esportes da sorte|rei do pitaco|mc ?games|kto)\b/,
      'casa de apostas',
    ],
  ],
  cassino: [
    // "Praia do Cassino"/"Balneário Cassino" (Rio Grande, RS) é lugar, não jogo
    [/(?<!praia do |balneario )\bcass?inos?\b(?! (rs|rio grande)\b)/, 'cassino'],
    [/\bjogos? de azar\b/, 'jogo de azar'],
    [/\bcaca ?niquel\b|\bcaca ?niqueis\b|\bslot machines?\b|\bjogos? de slots?\b|\bslots? online\b/, 'caça-níquel'],
    [/\broletas? (online|ao vivo|europeia|americana|francesa)\b/, 'roleta'],
    [/\bpoker\b|\bpoquer\b|\bblackjack\b|\bbaccarat\b|\bbacara\b/, 'jogo de cassino'],
    [/\bbingos?\b/, 'bingo'],
    [/\btigrinho\b|\bfortune (tiger|ox|rabbit|mouse|dragon)\b/, 'jogo de cassino'],
  ],
  alcool: [
    [/\bbebidas? alcoolicas?\b|\bdestilados?\b/, 'bebida alcoólica'],
    // "cerveja sem álcool" / "chope zero álcool" não é bebida alcoólica (a marca de cerveja continua pega pelo nome)
    [/\b(cervejas?|chopes?|chopps?)\b(?! (sem|zero) alcool\b)|\bcervejarias?\b|\bchoperias?\b/, 'cerveja'],
    // "cor vinho", "tom champanhe" e listas de cores ("preto, branco e vinho", "vinho e marinho"): cor, não bebida.
    // Depois de "vinho" não valem branco/rosa ("vinho branco", "vinho rosé" são bebida)
    [
      /(?<!\b(cor|tom|cor de|cores|preto|preta|branco|branca|azul|verde|cinza|rosa|bege|marrom|amarelo|amarela|vermelho|vermelha|roxo|roxa|lilas|laranja|dourado|dourada|prata|marinho|grafite|creme|mostarda|bordo|nude)( e)? )(\bvinhos?\b(?! e (preto|preta|azul|verde|cinza|bege|marrom|amarelo|amarela|vermelho|vermelha|roxo|roxa|lilas|laranja|dourado|dourada|prata|marinho|grafite|creme|mostarda|bordo|nude)\b)|\bchampanh?es?\b|\bchampagnes?\b)|\bvinicolas?\b|\bespumantes?\b|\bproseccos?\b|\bsidras?\b/,
      'vinho',
    ],
    [/\bcachacas?\b|\bcachacarias?\b|\bcaipirinhas?\b|\bcaipiroskas?\b|\bcatuaba\b/, 'cachaça'],
    [/\bwhiske?ys?\b|\buisques?\b|\bvodkas?\b|\bgin\b|\bgins\b|\brum\b|\btequilas?\b|\blicor(es)?\b|\bconhaques?\b|\babsinto\b|\bvermutes?\b/, 'destilado'],
    [
      // "pitu" (camarão) e "devassa" (palavra comum) só contam no domínio (ROTULOS)
      /\b(heineken|brahma|skol|budweiser|stella artois|itaipava|amstel|eisenbahn|spaten|michelob|bohemia|smirnoff|absolut|johnnie walker|jack daniel ?s|ypioca|campari|aperol|jagermeister|bacardi|chandon|tanqueray|beefeater|jose cuervo|velho barreiro|chivas|jameson|ciroc|grey goose|cinzano)\b/,
      'marca de bebida alcoólica',
    ],
  ],
};

/** Ordem da busca: as recusadas antes da bebida alcoólica (que só gera aviso e a regra do dia da votação). */
const ORDEM: readonly CategoriaSensivel[] = ['previsao', 'apostas', 'cassino', 'alcool'];

/** Palavras (e nomes próprios) terminadas em "bet" que não são apostas. */
const NAO_E_BET = new Set([
  'alphabet', 'alphabets', 'tibet', 'thibet', 'sorbet', 'sorbets', 'sherbet', 'sherbets', 'abet', 'gibbet', 'barbet', 'quodlibet',
  'elizabet', 'elisabet', 'lisbet', 'isabet', 'babet',
]);

/** Palavra (ou rótulo de domínio) com cara de casa de apostas: "bet", "bets", "bet365", "pixbet", "1xbet", "f12bet"… */
function palavraBet(p: string): boolean {
  return /^[a-z0-9]*bets?\d*$/.test(p) && !NAO_E_BET.has(p);
}

// ---- destino (domínio) ---------------------------------------------------------------------------------------------

/** Domínios de 1º nível de jogo: x.bet.br (operadoras autorizadas no Brasil), .bet, .casino, .poker, .bingo, .lotto. */
const TLD_JOGO: readonly [RegExp, CategoriaRecusada][] = [
  [/(^|\.)(bet|lotto)(\.br)?$/, 'apostas'],
  [/(^|\.)(casino|poker|bingo)(\.br)?$/, 'cassino'],
];

/** Rótulos exatos de domínio (marcas curtas ou ambíguas demais para buscar dentro do nome). */
const ROTULOS: Readonly<Partial<Record<CategoriaSensivel, ReadonlySet<string>>>> = {
  apostas: new Set(['kto', 'blaze', 'stake', 'apostas', 'aposta', 'loteria', 'loterias']),
  cassino: new Set(['casino', 'cassino', 'casinos', 'cassinos', 'bingo', 'poker']),
  previsao: new Set(['augur', 'manifold', 'smarkets']),
  alcool: new Set(['skol', 'pitu', 'devassa', 'wine', 'wines', 'evino', 'beer', 'beers', 'cerveja', 'cervejas', 'vinho', 'vinhos', 'vodka', 'whisky', 'cachaca', 'gin']),
};

/** Nomes compactos (≥ 6 letras) procurados dentro do domínio inteiro, sem pontos e hifens. */
const COMPACTOS: Readonly<Partial<Record<CategoriaSensivel, readonly string[]>>> = {
  // "smarkets" só como rótulo exato (dentro do nome pegaria "farmersmarkets")
  previsao: ['polymarket', 'kalshi', 'predictit', 'polkamarkets', 'forecastex'],
  apostas: ['betano', 'betfair', 'betway', 'betsson', 'betmgm', 'betnacional', 'sportingbet', 'parimatch', 'esportesdasorte', 'reidopitaco', 'brazino', 'casadeapostas', 'loterica'],
  cassino: ['cassino', 'casino', 'cacaniquel'],
  alcool: ['heineken', 'brahma', 'budweiser', 'stellaartois', 'itaipava', 'eisenbahn', 'smirnoff', 'johnniewalker', 'jackdaniels', 'jagermeister', 'bacardi', 'cervejaria', 'vinicola', 'cachacaria'],
};

/** Domínio do destino → categoria (ou null). */
function destinoDaCategoria(url: string): AchadoCategoria | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
  const achado = (categoria: CategoriaSensivel): AchadoCategoria => ({ categoria, termo: `site de ${NOME_CATEGORIA[categoria]}`, campo: 'destino' });
  for (const [re, categoria] of TLD_JOGO) if (re.test(host)) return achado(categoria);
  const rotulos = host.split(/[.-]/);
  // "Praia do Cassino" / "Balneário Cassino" (Rio Grande, RS) é lugar, não jogo
  const compacto = host.replace(/[.-]/g, '').replace(/(praiado|balneario)cass?ino/g, '');
  for (const categoria of ORDEM) {
    if (categoria === 'apostas' && rotulos.some(palavraBet)) return achado(categoria);
    if (rotulos.some((r) => ROTULOS[categoria]?.has(r))) return achado(categoria);
    if (COMPACTOS[categoria]?.some((n) => compacto.includes(n))) return achado(categoria);
  }
  return null;
}

// ---- busca ---------------------------------------------------------------------------------------------------------

/**
 * Categoria sensível do anúncio: a 1ª recusada que aparecer (mercados de previsão, apostas, cassino) ou, sem nenhuma,
 * bebida alcoólica; null se nada. `campos`: os textos exibidos (marca, título, texto, botão); `url`: o destino (o
 * domínio e o caminho contam).
 */
export function categoriaDoAnuncio(campos: readonly CampoAnuncioPolitica[], url: string): AchadoCategoria | null {
  let caminho = '';
  try {
    const u = new URL(url);
    caminho = decodeURIComponent(`${u.pathname} ${u.search}`);
  } catch {
    /* url inválida: só o texto conta (a validação já recusa o link) */
  }
  const textos = [...campos, { campo: 'link', valor: caminho }].map(({ campo, valor }) => ({ campo, t: ` ${normalizarTexto(valor)} ` }));
  const destino = destinoDaCategoria(url);
  let alcool: AchadoCategoria | null = destino?.categoria === 'alcool' ? destino : null;
  if (destino && destino.categoria !== 'alcool') return destino;
  for (const categoria of ORDEM) {
    for (const { campo, t } of textos) {
      if (t.trim() === '') continue;
      let termo: string | null = null;
      for (const [re, rotulo] of TERMOS[categoria]) {
        if (re.test(t)) {
          termo = rotulo;
          break;
        }
      }
      if (!termo && categoria === 'apostas') {
        const p = t.trim().split(' ').find(palavraBet);
        if (p) termo = p;
      }
      if (!termo) continue;
      if (categoria !== 'alcool') return { categoria, termo, campo };
      alcool ??= { categoria, termo, campo };
    }
  }
  return alcool;
}

const onde = (a: AchadoCategoria) => (a.campo === 'destino' ? `link para ${a.termo}` : `termo "${a.termo}" em "${a.campo}"`);

/** Mensagem de recusa de uma categoria recusada (apostas, cassino, mercados de previsão). */
export function mensagemCategoria(a: AchadoCategoria): string {
  return `Anúncio recusado: o Sintonia não aceita anúncios de ${NOME_CATEGORIA[a.categoria]} (${onde(a)}).`;
}

/** Atalho: mensagem de recusa (apostas, cassino, mercados de previsão) ou null. Bebida alcoólica não é recusada aqui. */
export function motivoCategoria(campos: readonly CampoAnuncioPolitica[], url: string): string | null {
  const a = categoriaDoAnuncio(campos, url);
  return a && a.categoria !== 'alcool' ? mensagemCategoria(a) : null;
}

/**
 * Bebida alcoólica: recusa se a janela de exibição [inicio, fim) — null/0 = aberta — cruzar `JANELA_SEM_ALCOOL`.
 * Janelas encostadas não se cruzam: fim em 25/10, 0h, ou início em 25/10, 17h, passam.
 */
export function recusaAlcoolNaJanela(a: AchadoCategoria, janela: { inicio?: number | null; fim?: number | null }): string | null {
  const ini = janela.inicio ? janela.inicio : -Infinity;
  const fim = janela.fim ? janela.fim : Infinity;
  if (!(ini < JANELA_SEM_ALCOOL.fim && JANELA_SEM_ALCOOL.inicio < fim)) return null;
  return `Anúncio de bebida alcoólica (${onde(a)}): não pode ficar no ar em 25/10 até as 17h (Brasília), durante a votação. Termine até 25/10, 0h, ou comece a partir de 25/10, 17h.`;
}

/**
 * Aviso do painel para bebida alcoólica (o anúncio é aceito; a regra do dia da votação vale no salvar). null para os
 * demais anúncios — as categorias recusadas já saem como erro da validação.
 */
export function avisoCategoria(a: { marca: string; titulo: string; texto: string; cta: string; url: string }): string | null {
  const achado = categoriaDoAnuncio(
    [
      { campo: 'marca', valor: a.marca },
      { campo: 'título', valor: a.titulo },
      { campo: 'texto', valor: a.texto },
      { campo: 'botão', valor: a.cta },
    ],
    a.url,
  );
  if (achado?.categoria !== 'alcool') return null;
  return `Bebida alcoólica (${onde(achado)}): o anúncio não pode ficar no ar em 25/10 até as 17h (Brasília). Inclua uma frase de advertência, como “Beba com moderação”.`;
}
