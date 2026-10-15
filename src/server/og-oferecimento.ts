/**
 * "Oferecimento: <marca>" nas imagens de compartilhamento (formato de anúncio 'compartilhamento', src/shared/anuncios.ts).
 *
 * SÓ nos cartões genéricos, sem candidato e sem resultado (`CARTOES_COM_OFERECIMENTO`): Teste Cego, calculadora de
 * cenários (sem código) e capa das curiosidades. NUNCA no placar, no município, na seção, na ficha do candidato, nos
 * eleitos/bancadas, nos governadores, num fato isolado ou num cenário montado: são imagens com foto, nome, número ou
 * resultado de candidato, feitas para circular e que não dá para recolher depois (a marca ficaria associada a um
 * candidato — ARCHITECTURE §1.5).
 *
 * Um rodapé discreto, só texto e sempre rotulado, numa faixa própria no pé da imagem (1200 × 32 px, com linha de
 * separação), centralizado (não fica embaixo de um lado do cartão). O cartão fica 32 px mais baixo, com menos respiro
 * em cima e embaixo (o conteúdo perde ~8 px; o que passasse ficaria atrás da faixa, nunca por cima).
 *
 * O anunciante de cada cartão sai de `escolherAnuncio` (o master vence; entre os demais, rotação pelo peso, fixa por
 * cartão). A chave de cache das imagens leva `tagOferecimento`: trocar/tirar o anunciante gera imagens novas (e a
 * versão `&v=` das meta tags muda, para a CDN e os apps buscarem a imagem nova).
 */
import { escolherAnuncio, type AnuncioPublico } from '../shared/anuncios';
import { hashCurto } from './http-cache';
import { C, h, OG_H, OG_W, type No } from './og';

/** Altura da faixa do rodapé (px). */
export const FAIXA_OFERECIMENTO = 32;

type Anuncios = readonly Pick<AnuncioPublico, 'id' | 'marca' | 'formatos' | 'peso' | 'cota'>[] | null | undefined;

/**
 * Cartões (chave do cache em og-rotas.ts) que podem levar a faixa: só os genéricos, sem candidato nem resultado.
 * A capa das curiosidades só entra quando nenhum dos três destaques é de cargo (percentual de candidato).
 */
export const CARTOES_COM_OFERECIMENTO = ['teste', 'cen|generico', 'cur|capa'] as const;
export type CartaoComOferecimento = (typeof CARTOES_COM_OFERECIMENTO)[number];

/**
 * Imagem das meta tags (caminho com query) que pode levar a faixa → o `&v=` leva o anunciante. As demais nunca têm
 * anúncio, então trocar o anunciante não muda a URL delas.
 */
export function imagemComOferecimento(caminho: string): boolean {
  return caminho === '/api/og/teste.png' || caminho === '/api/og/cenario.png' || caminho === '/api/og/curiosidade.png';
}

const comFormato = (anuncios: Anuncios) => (anuncios ?? []).filter((a) => a.formatos.includes('compartilhamento'));

/** Anunciante do cartão `chave` (null = nenhum anúncio com o formato 'compartilhamento' no ar). */
export function oferecimentoDe(anuncios: Anuncios, chave: string): { id: string; marca: string } | null {
  const a = escolherAnuncio(comFormato(anuncios), 'compartilhamento', `og|${chave}`);
  return a ? { id: a.id, marca: a.marca } : null;
}

/**
 * Identificador do conjunto de anunciantes das imagens ('' sem nenhum): entra na chave de cache das imagens e no `&v=`
 * das meta tags. Muda quando um anúncio com o formato entra/sai do ar ou troca de marca, cota ou peso.
 */
export function tagOferecimento(anuncios: Anuncios): string {
  const lista = comFormato(anuncios);
  if (!lista.length) return '';
  return `of${hashCurto(lista.map((a) => `${a.id}:${a.marca}:${a.cota}:${a.peso}`).join('|'))}`;
}

const ehAltura = (v: unknown) => v === OG_H || v === `${OG_H}px`;

/**
 * Padding "T R B [L]" (px) de uma coluna de altura cheia com menos respiro em cima (−8) e embaixo (−16): a faixa já
 * separa o pé, e o conteúdo perde só ~8 px de altura útil.
 */
function paddingCompacto(p: unknown): string | undefined {
  if (typeof p !== 'string') return undefined;
  const v = p.trim().split(/\s+/).map((x) => (/^-?\d+(\.\d+)?(px)?$/.test(x) ? parseFloat(x) : NaN));
  if (v.length < 3 || v.length > 4 || v.some((x) => Number.isNaN(x))) return undefined;
  const [t, r, b, l = r] = v;
  return `${Math.max(24, t - 8)}px ${r}px ${Math.max(16, b - 16)}px ${l}px`;
}

/** Encolhe para `alt` os nós de altura OG_H (raiz e os dois níveis abaixo: as colunas dos layouts). */
function encolher(no: No, alt: number, nivel = 0): No {
  if (!no || typeof no !== 'object' || nivel > 2) return no;
  const style = no.props?.style;
  let novoEstilo = style;
  if (style && ehAltura(style.height)) {
    const pad = paddingCompacto(style.padding);
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

/** O cartão com a faixa "Oferecimento: <marca>" no pé (marca cortada em 40 caracteres, como no cadastro). */
export function comOferecimento(no: No, marca: string): No {
  const alt = OG_H - FAIXA_OFERECIMENTO;
  return h(
    'div',
    { width: OG_W, height: OG_H, flexDirection: 'column', background: C.bg },
    h('div', { width: OG_W, height: alt, overflow: 'hidden', position: 'relative', flexDirection: 'column' }, encolher(no, alt)),
    h(
      'div',
      {
        width: OG_W,
        height: FAIXA_OFERECIMENTO,
        alignItems: 'center',
        // centralizada: nunca embaixo de um dos lados do cartão
        justifyContent: 'center',
        padding: '0 64px',
        background: C.surface,
        borderTop: `1px solid ${C.line}`,
        fontFamily: 'Inter',
        fontSize: 17,
        color: C.subtle,
        gap: 7,
      },
      h('div', { letterSpacing: 0.4 }, 'Oferecimento:'),
      h('div', { color: C.fg, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 520 }, marca.slice(0, 40)),
    ),
  );
}
