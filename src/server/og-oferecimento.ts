/**
 * "Oferecimento: <marca>" nas imagens de compartilhamento (formato de anúncio 'compartilhamento', src/shared/anuncios.ts).
 *
 * Um rodapé discreto, só texto e sempre rotulado, numa faixa própria no pé da imagem (1200 × 32 px, com linha de
 * separação): nunca dentro do placar nem colado a foto, nome ou número de candidato. O conteúdo do cartão sobe 32 px
 * (os layouts têm o espaço sobrando no pé; o que passasse ficaria atrás da faixa, nunca por cima dela).
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

/** Encolhe para `alt` os nós de altura OG_H (raiz e os dois níveis abaixo: as colunas dos layouts). */
function encolher(no: No, alt: number, nivel = 0): No {
  if (!no || typeof no !== 'object' || nivel > 2) return no;
  const style = no.props?.style;
  const novoEstilo = style && ehAltura(style.height) ? { ...style, height: alt } : style;
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
        justifyContent: 'flex-end',
        padding: '0 64px',
        background: C.surface,
        borderTop: `1px solid ${C.line}`,
        fontFamily: 'Inter',
        fontSize: 16,
        color: C.subtle,
        gap: 6,
      },
      h('div', { letterSpacing: 0.4 }, 'Oferecimento:'),
      h('div', { color: C.muted, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 520 }, marca.slice(0, 40)),
    ),
  );
}
