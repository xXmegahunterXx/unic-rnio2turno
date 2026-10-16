/**
 * "Oferecimento: <marca>" nas imagens de compartilhamento (formato de anúncio 'compartilhamento', src/shared/anuncios.ts).
 *
 * Nos cartões genéricos, sem candidato e sem resultado (`CARTOES_COM_OFERECIMENTO`): Teste Cego, calculadora de
 * cenários (sem código), capa das curiosidades e convite do Palpite (og-palpite.ts). Nos cartões do PLACAR (Brasil/UF e
 * município, og-placar.ts) só com `OFERECIMENTO_NO_PLACAR` — hoje DESLIGADO (src/shared/oferecimento.ts: a regra do
 * projeto é anúncio nunca colado a placar, foto, nome ou número de candidato; ligar exige decisão escrita do dono e
 * aditivo nos contratos). Ligado, seria como o "Oferecimento" de transmissão: faixa própria no pé, só texto, ABAIXO do
 * rodapé com a marca e o endereço do Sintonia. NUNCA na seção, na ficha do candidato, nos eleitos/bancadas, nos
 * governadores, num fato isolado ou num cenário montado (imagens centradas numa pessoa ou numa hipótese, que não dá
 * para recolher depois — §1.5).
 *
 * Um rodapé discreto e sempre rotulado, numa faixa própria no pé da imagem, com linha de separação, centralizado (não
 * fica embaixo de um lado do cartão):
 *  - com a logo do anunciante (anunciantes v2, E7; interruptor `OG_LOGO_OFERECIMENTO`): faixa de 44 px com
 *    "Oferecimento" e a logo de 26 px de altura (até 300 px de largura) — a versão para fundo escuro, se houver, e a
 *    placa do TEMA ESCURO medida no painel (os cartões são escuros); ícone (proporção < 2) leva também o nome;
 *  - sem logo utilizável (sem ajuste, WebP ou SVG — o satori/resvg só desenha PNG e JPEG aqui): a faixa de 32 px de
 *    sempre, só texto, "Oferecimento: <marca>".
 * O cartão fica mais baixo pela altura da faixa, com menos respiro em cima e embaixo (o que passasse ficaria atrás da
 * faixa, nunca por cima).
 *
 * O anunciante de cada cartão sai de `escolherAnuncio` (o master vence; a reserva só sem pago; entre os demais, rotação
 * pelo peso, fixa por cartão). A chave de cache das imagens leva `tagOferecimento` (com uma assinatura barata da logo
 * usada): trocar/tirar o anunciante ou a logo gera imagens novas (e a versão `&v=` das meta tags muda, para a CDN e os
 * apps buscarem a imagem nova). As imagens não são medidas e não contam para a meta de impressões.
 */
import { escolherAnuncio, type AjusteImagem, type AnuncioPublico, type PlacaLogo } from '../shared/anuncios';
import { OFERECIMENTO_COM_CANDIDATOS } from '../shared/oferecimento';
import { hashCurto } from './http-cache';
import { C, h, OG_H, OG_W, type No } from './og';

/** Altura da faixa do rodapé só com texto (px). */
export const FAIXA_OFERECIMENTO = 32;
/** Altura da faixa com a logo do anunciante (px). */
export const FAIXA_OFERECIMENTO_LOGO = 44;
/** Interruptor da logo nas imagens de compartilhamento: false = só o texto "Oferecimento: <marca>" (como antes). */
export const OG_LOGO_OFERECIMENTO: boolean = true;
/** Logo na faixa: altura (px), largura máxima e, dentro da placa, a altura da imagem. */
const LOGO_H = 26;
const LOGO_MAX_W = 300;
const LOGO_H_NA_PLACA = 20;
const PLACA_PAD_X = 10;

type AnuncioOg = Pick<AnuncioPublico, 'id' | 'marca' | 'formatos' | 'peso' | 'cota'> &
  Partial<Pick<AnuncioPublico, 'reserva' | 'logo' | 'logoAjuste' | 'logoEscuro' | 'logoEscuroAjuste'>>;
type Anuncios = readonly AnuncioOg[] | null | undefined;

/** Logo que a faixa desenha: data URI PNG/JPEG, proporção, placa do tema escuro e se a imagem tem fundo próprio. */
export interface LogoOferecimento {
  src: string;
  proporcao: number;
  placa: PlacaLogo;
  comFundo: boolean;
}

/** Só PNG e JPEG em data URI (o satori/resvg não desenha WebP; SVG pode animar e ter fonte externa). */
const RE_RASTER = /^data:image\/(png|jpeg);base64,/;

/**
 * Logo do anunciante para as imagens (fundo escuro): a versão para fundo escuro com o ajuste dela; senão a logo com o
 * ajuste dela — sempre a placa do tema ESCURO. Sem ajuste ou fora de PNG/JPEG → null (cai no texto).
 */
export function logoOferecimento(a: AnuncioOg, ligado: boolean = OG_LOGO_OFERECIMENTO): LogoOferecimento | null {
  if (!ligado) return null;
  const opcoes: [string | undefined, AjusteImagem | undefined][] = [
    [a.logoEscuro, a.logoEscuroAjuste],
    [a.logo, a.logoAjuste],
  ];
  for (const [src, ajuste] of opcoes) {
    if (!src || !ajuste || !RE_RASTER.test(src)) continue;
    return { src, proporcao: ajuste.proporcao, placa: ajuste.comFundo ? 'nenhuma' : ajuste.placaEscuro, comFundo: !!ajuste.comFundo };
  }
  return null;
}

/**
 * Cartões (chave do cache em og-rotas.ts) que podem levar a faixa: só os genéricos, sem candidato nem resultado.
 * A capa das curiosidades só entra quando nenhum dos três destaques é de cargo (percentual de candidato).
 */
export const CARTOES_COM_OFERECIMENTO = ['teste', 'cen|generico', 'cur|capa', 'palpite'] as const;
export type CartaoComOferecimento = (typeof CARTOES_COM_OFERECIMENTO)[number];

/**
 * Cartões do placar (Brasil/UF e município) com a faixa "Oferecimento: <marca>" quando há anúncio de compartilhamento no
 * ar. Fonte única em src/shared/oferecimento.ts (vale também para o ShareCard e os cartões do Palpite no app).
 */
export const OFERECIMENTO_NO_PLACAR = OFERECIMENTO_COM_CANDIDATOS;

/** Rotas dos cartões do placar (og-placar.ts). */
const IMAGENS_PLACAR = ['/api/og/apuracao.png', '/api/og/municipio.png'];

/**
 * Imagem das meta tags (caminho com query) que pode levar a faixa → o `&v=` leva o anunciante. As demais nunca têm
 * anúncio, então trocar o anunciante não muda a URL delas.
 */
export function imagemComOferecimento(caminho: string): boolean {
  if (OFERECIMENTO_NO_PLACAR && IMAGENS_PLACAR.includes(caminho.split('?')[0])) return true;
  return caminho === '/api/og/teste.png' || caminho === '/api/og/cenario.png' || caminho === '/api/og/curiosidade.png' || caminho === '/api/og/palpite.png';
}

const comFormato = (anuncios: Anuncios) => (anuncios ?? []).filter((a) => a.formatos.includes('compartilhamento'));

/**
 * Anunciante do cartão `chave` (null = nenhum anúncio com o formato 'compartilhamento' no ar), com a logo quando ela é
 * utilizável (`logoOferecimento`).
 */
export function oferecimentoDe(
  anuncios: Anuncios,
  chave: string,
  comLogo: boolean = OG_LOGO_OFERECIMENTO,
): { id: string; marca: string; logo?: LogoOferecimento } | null {
  const a = escolherAnuncio(comFormato(anuncios), 'compartilhamento', `og|${chave}`);
  if (!a) return null;
  const logo = logoOferecimento(a, comLogo);
  return logo ? { id: a.id, marca: a.marca, logo } : { id: a.id, marca: a.marca };
}

/**
 * Assinatura barata da logo que a faixa usaria (sem hash do data URI a cada pedido de HTML): tamanho, final do base64,
 * placa, fundo próprio e proporção. Trocar a logo (ou o ajuste) troca a assinatura. O final são os últimos 40
 * caracteres: num PNG os últimos 16 são sempre o chunk IEND (iguais em todo arquivo), e logo antes vem o CRC do último
 * IDAT — que muda com a imagem.
 */
const assinaturaLogo = (a: AnuncioOg) => {
  const l = logoOferecimento(a);
  return l ? `:${l.src.length}:${l.src.slice(-40)}:${l.placa}:${l.comFundo ? 1 : 0}:${l.proporcao}` : '';
};

/**
 * Identificador do conjunto de anunciantes das imagens ('' sem nenhum): entra na chave de cache das imagens e no `&v=`
 * das meta tags. Muda quando um anúncio com o formato entra/sai do ar ou troca de marca, cota, peso, reserva ou logo.
 */
export function tagOferecimento(anuncios: Anuncios): string {
  const lista = comFormato(anuncios);
  if (!lista.length) return '';
  return `of${hashCurto(lista.map((a) => `${a.id}:${a.marca}:${a.cota}:${a.peso}${a.reserva ? ':r' : ''}${assinaturaLogo(a)}`).join('|'))}`;
}

const ehAltura = (v: unknown) => v === OG_H || v === `${OG_H}px`;

/**
 * Padding "T R B [L]" (px) de uma coluna de altura cheia com menos respiro em cima e embaixo (¼ e ½ da faixa: −8/−16
 * com a faixa de 32 px, −11/−22 com a de 44): a faixa já separa o pé, e o conteúdo perde pouca altura útil.
 */
function paddingCompacto(p: unknown, faixa: number): string | undefined {
  if (typeof p !== 'string') return undefined;
  const v = p.trim().split(/\s+/).map((x) => (/^-?\d+(\.\d+)?(px)?$/.test(x) ? parseFloat(x) : NaN));
  if (v.length < 3 || v.length > 4 || v.some((x) => Number.isNaN(x))) return undefined;
  const [t, r, b, l = r] = v;
  return `${Math.max(24, t - Math.round(faixa / 4))}px ${r}px ${Math.max(16, b - Math.round(faixa / 2))}px ${l}px`;
}

/** Encolhe para `alt` os nós de altura OG_H (raiz e os dois níveis abaixo: as colunas dos layouts). */
function encolher(no: No, alt: number, nivel = 0): No {
  if (!no || typeof no !== 'object' || nivel > 2) return no;
  const style = no.props?.style;
  let novoEstilo = style;
  if (style && ehAltura(style.height)) {
    const pad = paddingCompacto(style.padding, OG_H - alt);
    novoEstilo = { ...style, height: alt, ...(pad ? { padding: pad } : {}) };
  }
  const filhos = no.props?.children;
  const novosFilhos = Array.isArray(filhos)
    ? filhos.map((f) => (f && typeof f === 'object' ? encolher(f as No, alt, nivel + 1) : f))
    : filhos && typeof filhos === 'object'
      ? encolher(filhos as No, alt, nivel + 1)
      : filhos;
  return { ...no, props: { ...no.props, style: novoEstilo, children: novosFilhos } };
}

/**
 * A logo na faixa: 26 px de altura e até 300 px de largura, na proporção gravada. Com placa (clara ou escura, do tema
 * escuro): a placa tem os 26 px, com a imagem de 20 px dentro (respiro 3/10 px, cantos de 8). Placa da cor do fundo da
 * faixa ganha um filete. Imagem com fundo próprio: cantos de 6, sem placa.
 */
function logoNaFaixa(l: LogoOferecimento): No {
  const comPlaca = l.placa !== 'nenhuma' && !l.comFundo;
  const alturaImg = comPlaca ? LOGO_H_NA_PLACA : LOGO_H;
  const maxW = comPlaca ? LOGO_MAX_W - 2 * PLACA_PAD_X : LOGO_MAX_W;
  let w = Math.round(alturaImg * l.proporcao);
  let alt = alturaImg;
  if (w > maxW) {
    w = maxW;
    alt = Math.max(1, Math.round(maxW / l.proporcao));
  }
  const img: No = { type: 'img', props: { src: l.src, width: w, height: alt, style: { width: w, height: alt, ...(l.comFundo ? { borderRadius: 6 } : {}) } } };
  if (!comPlaca) return img;
  const fundo = l.placa === 'clara' ? C.placaClara : C.placaEscura;
  return h(
    'div',
    {
      height: LOGO_H,
      padding: `${(LOGO_H - alt) / 2}px ${PLACA_PAD_X}px`,
      borderRadius: 8,
      background: fundo,
      alignItems: 'center',
      justifyContent: 'center',
      // placa escura = a cor da faixa: um filete marca o contorno
      ...(fundo === C.surface ? { border: `1px solid ${C.line}` } : {}),
    },
    img,
  );
}

/**
 * O cartão com a faixa de oferecimento no pé: com `logo`, "Oferecimento" + a logo (44 px; ícone leva também o nome);
 * sem, "Oferecimento: <marca>" só em texto (32 px). Marca cortada em 40 caracteres, como no cadastro.
 */
export function comOferecimento(no: No, marca: string, logo?: LogoOferecimento | null): No {
  const faixa = logo ? FAIXA_OFERECIMENTO_LOGO : FAIXA_OFERECIMENTO;
  const alt = OG_H - faixa;
  const nome = h('div', { color: C.fg, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 520 }, marca.slice(0, 40));
  return h(
    'div',
    { width: OG_W, height: OG_H, flexDirection: 'column', background: C.bg },
    h('div', { width: OG_W, height: alt, overflow: 'hidden', position: 'relative', flexDirection: 'column' }, encolher(no, alt)),
    h(
      'div',
      {
        width: OG_W,
        height: faixa,
        alignItems: 'center',
        // centralizada: nunca embaixo de um dos lados do cartão
        justifyContent: 'center',
        padding: '0 64px',
        background: C.surface,
        borderTop: `1px solid ${C.line}`,
        fontFamily: 'Inter',
        fontSize: 17,
        color: C.subtle,
        gap: logo ? 12 : 7,
      },
      h('div', { letterSpacing: 0.4 }, logo ? 'Oferecimento' : 'Oferecimento:'),
      logo ? logoNaFaixa(logo) : nome,
      // ícone (quadrado ou quase): o nome segue em texto, como no site; logotipo já traz o nome
      logo && logo.proporcao < 2 ? nome : null,
    ),
  );
}
