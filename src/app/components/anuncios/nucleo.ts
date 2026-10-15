/**
 * Anúncios no site: regras puras (sem React), testáveis — quem aparece em cada posição da página, o link de clique,
 * as imagens aceitas e os links de contato da página /anuncie. Contrato em src/shared/anuncios.ts.
 *
 * Escolha por página (semente = visita + caminho): a mesma posição não troca a cada renderização, muda entre visitas
 * e entre páginas. A cadeia é sempre a mesma, então cada posição é calculada sozinha (sem registro de blocos):
 *   topo → rodapé (evita o do topo) → nativo-1, nativo-2… (evitam topo, rodapé e os nativos anteriores) → teste → tv.
 * Um nativo nunca repete um anunciante já mostrado em OUTRO nativo da mesma página: sem anúncio novo para a posição,
 * entra o anúncio da casa ("Anuncie no Sintonia", no máximo 1 por página) e, depois dele, nada.
 */
// só a escolha (módulo pequeno): a validação e os limites do painel ficam fora do JS inicial do site
import { escolherAnuncio } from '@/shared/anuncios-escolha';
import type { AnuncioPublico, ContatoAnuncie, FormatoAnuncio } from '@/shared/anuncios';

/** Anúncio da casa (bloco nativo sem anunciante): leva a /anuncie. Nunca no topo nem no rodapé. */
export const CASA = 'casa' as const;
export type EscolhaNativo = AnuncioPublico | typeof CASA | null;

export interface EscolhaPagina {
  topo: AnuncioPublico | null;
  rodape: AnuncioPublico | null;
  teste: AnuncioPublico | null;
  tv: AnuncioPublico | null;
  /** posição 1, 2, 3… (índice começando em 1) */
  nativo: (posicao: number) => EscolhaNativo;
}

/** Posições nativas calculadas por página (curiosidades chega a ~5; acima disso, nada). */
const MAX_NATIVOS = 12;

export function escolhaDaPagina(
  anuncios: readonly AnuncioPublico[] | null | undefined,
  semente: string,
  /** a barra do rodapé está na tela (celular)? Fora dela, os demais blocos não precisam evitar o anunciante dela. */
  { rodapeNaTela = true }: { rodapeNaTela?: boolean } = {},
): EscolhaPagina {
  const lista = anuncios ?? [];
  const topo = escolherAnuncio(lista, 'topo', `${semente}|topo`);
  const rodape = escolherAnuncio(lista, 'rodape', `${semente}|rodape`, topo ? [topo.id] : []);
  const fixos = [topo?.id, rodapeNaTela ? rodape?.id : undefined].filter((x): x is string => !!x);
  const teste = escolherAnuncio(lista, 'teste', `${semente}|teste`, fixos);
  const tv = escolherAnuncio(lista, 'tv', `${semente}|tv`);

  const nativos: EscolhaNativo[] = [];
  const vistos: string[] = [];
  let casaUsada = false;
  const calcular = (ate: number) => {
    for (let k = nativos.length + 1; k <= Math.min(ate, MAX_NATIVOS); k++) {
      const a = escolherAnuncio(lista, 'nativo', `${semente}|nativo-${k}`, [...fixos, ...vistos]);
      if (a && !vistos.includes(a.id)) {
        vistos.push(a.id);
        nativos.push(a);
      } else if (!casaUsada) {
        casaUsada = true;
        nativos.push(CASA);
      } else nativos.push(null);
    }
  };
  return {
    topo,
    rodape,
    teste,
    tv,
    nativo: (posicao) => {
      const k = Math.floor(posicao);
      if (!(k >= 1) || k > MAX_NATIVOS) return null;
      calcular(k);
      return nativos[k - 1] ?? null;
    },
  };
}

/**
 * Rotas com a barra do rodapé (celular). Fora do Teste Cego e do Duelo: nas perguntas as respostas ficam na metade de
 * baixo da tela, e no resultado o botão "Revelar" também — a barra atrapalharia e geraria toques sem querer (o
 * resultado já tem o próprio espaço, "Teste Cego oferecido por").
 */
export const rodapePermitido = (pathname: string): boolean => !pathname.startsWith('/teste') && !pathname.startsWith('/duelo');

/** Link de clique contado pelo servidor: termina em /api/anuncio/ir/<id> (o app acrescenta ?f=<formato>). */
const RE_IR = /\/api\/anuncio\/ir\/[a-z0-9-]{2,40}$/;

/**
 * Link do anúncio para um formato. No servidor, `href` = `…/api/anuncio/ir/<id>` e ganha `?f=<formato>` (o servidor
 * conta o clique e redireciona com UTM). No demo, `href` já é o destino com UTM e segue como está. Só http(s).
 */
export function hrefDoAnuncio(href: string | undefined, formato: FormatoAnuncio, demo: boolean): string | null {
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href, 'https://base.invalid');
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.hostname === 'base.invalid') {
    // relativo: só o caminho de clique do próprio servidor
    if (demo || !RE_IR.test(u.pathname)) return null;
    return `${u.pathname}?f=${formato}`;
  }
  if (!demo && RE_IR.test(u.pathname) && !u.search) return `${href}?f=${formato}`;
  return href;
}

/**
 * Imagem aceita em <img>: data URI de imagem (png, jpeg, webp, svg) ou a imagem servida pelo próprio servidor
 * (`/api/anuncio/img?h=…` — o /api/status manda como URL absoluta; `/api/patrocinio/logo`, legado). Nada de terceiros.
 */
export function imagemDoAnuncio(src: string | undefined): string | null {
  if (!src) return null;
  if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) return src;
  try {
    const u = new URL(src, 'https://base.invalid');
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (/^\/api\/anuncio\/img$/.test(u.pathname) && /^\?h=[a-f0-9]{8,64}$/.test(u.search)) return src;
    if (u.pathname === '/api/patrocinio/logo') return src;
  } catch {
    /* inválida */
  }
  return null;
}

/** Iniciais da marca (sem logo): "Marca Exemplo" → "ME". */
export function iniciaisDaMarca(marca: string): string {
  const partes = marca
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[\s-]+/)
    .map((p) => p.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  return (
    partes
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?'
  );
}

/** Título curto (faixa do topo no celular): corta na palavra, com reticências. */
export function tituloCurto(titulo: string, max = 34): string {
  const t = titulo.trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const i = corte.lastIndexOf(' ');
  return `${(i > max * 0.55 ? corte.slice(0, i) : corte).replace(/[\s,.;:–-]+$/, '')}…`;
}

/** Texto pronto da mensagem de contato (/anuncie). */
export const TEXTO_CONTATO = 'Olá! Vi a página Anuncie no Sintonia e quero saber mais sobre os formatos e as cotas de anúncio.';

/** https://wa.me/<dígitos>?text=… (null sem número válido). */
export function linkWhatsApp(numero: string | undefined, texto = TEXTO_CONTATO): string | null {
  const d = (numero ?? '').replace(/\D/g, '');
  if (d.length < 10 || d.length > 15) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

/** mailto: com assunto e corpo prontos (null sem e-mail válido). */
export function linkEmail(email: string | undefined, texto = TEXTO_CONTATO): string | null {
  const e = (email ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  return `mailto:${e}?subject=${encodeURIComponent('Anunciar no Sintonia')}&body=${encodeURIComponent(texto)}`;
}

/** "+55 11 99999-9999" a partir dos dígitos (exibição). */
export function fmtWhatsApp(numero: string): string {
  const d = numero.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    return `+55 ${ddd} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
  }
  return `+${d}`;
}

/** Contato utilizável da página /anuncie (algum canal válido). */
export function temContato(c: ContatoAnuncie | null | undefined): boolean {
  return !!(linkWhatsApp(c?.whatsapp) || linkEmail(c?.email));
}
