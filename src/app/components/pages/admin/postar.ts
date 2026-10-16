/**
 * Aba "Postar" do painel (I26 mínimo) — núcleo puro, testado em postar.test.ts. Monta os cartões prontos para o dono
 * postar a cada momento da noite: texto (≤ 220 de peso, sempre de share/textos.ts), link rastreável
 * (`urlCompartilhada`, I08) e a imagem gerada pelo SERVIDOR (OG). Nada sai daqui sozinho: o dono toca em "Abrir no X",
 * "WhatsApp", "Copiar" ou "Baixar imagem".
 *
 *  - Convite (sempre): sem nome e sem número; imagem genérica (`/api/og/audiencia.png?m=0`).
 *  - Audiência: um por marco atingido (10, 50 e 100 mil pessoas agora; todos acima do piso público de 500). O texto diz
 *    só o marco, arredondado para baixo; a imagem lê o número do SERVIDOR (o `?m=` da URL só pode baixar o marco) e sai
 *    sem número com a chave "Pessoas agora no site" desligada.
 *  - Momentos: um por evento NACIONAL de Presidente do feed (começo, marcos de % apurado, liderança, virada e
 *    resultado), do mais recente para o mais antigo; a imagem é o placar de agora (`/api/og/apuracao.png`).
 *    TRAVA: cartão com nome de candidato só a partir das 17h de 25/10, pelo relógio do SERVIDOR (`wallNow`). Antes
 *    disso, só na simulação com os nomes ocultos ("Candidato A/B", com "[SIMULAÇÃO]" no texto).
 */
import type { Fase, FeedEvent, TipoEvento } from '@/shared/types';
import { INICIO_APURACAO } from '@/shared/constants';
import { textoComLink, urlCompartilhada, whatsappUrl, xIntentUrl } from '@/app/lib/share';
import { HASHTAGS, SUFIXO_LINK, comSufixoLink, textoPostarAudiencia, textoPostarConvite, textoPostarEvento } from '@/app/components/share/textos';

/** Marcos de audiência (pessoas ao mesmo tempo). O mesmo de `MARCOS_AUDIENCIA` em src/server/og-audiencia.ts (testado). */
export const MARCOS_AUDIENCIA = [10_000, 50_000, 100_000] as const;
export type MarcoAudiencia = (typeof MARCOS_AUDIENCIA)[number];

/** Quantos momentos a aba mostra (os mais recentes). */
export const MAX_MOMENTOS = 12;

/** Tipos de evento do feed que viram cartão (fica de fora: estado encerrado e avisos). */
export const TIPOS_MOMENTO: readonly TipoEvento[] = ['inicio', 'marco', 'lideranca', 'virada', 'eleito'];

export const ROTULO_MOMENTO: Record<TipoEvento, string> = {
  inicio: 'Começo',
  marco: 'Marco',
  lideranca: 'Liderança',
  virada: 'Virada',
  'uf-encerrada': 'Estado',
  eleito: 'Resultado',
  aviso: 'Aviso',
};

export type TipoCartaoPostar = 'convite' | 'audiencia' | 'momento';
export type FormatoImagemPostar = 'x' | 'story';

export interface CartaoPostar {
  id: string;
  tipo: TipoCartaoPostar;
  /** Rótulo curto do cartão ("Convite", "Audiência", "Virada"…). */
  rotulo: string;
  /** Instante do evento (epoch ms), nos momentos. */
  t?: number;
  /** Texto do post (≤ 220 de peso no X, sem o link e sem as hashtags). */
  texto: string;
  /** Rota da página que o link abre. */
  caminho: string;
  /** Imagem do servidor por formato (rota relativa, sem host). */
  imagem: Record<FormatoImagemPostar, string>;
  /** Marco de audiência (só nos cartões de audiência). */
  marco?: MarcoAudiencia;
}

export interface EntradaPostar {
  /** Relógio do SERVIDOR (`LiveStatus.wallNow`). */
  wallNow: number;
  fase: Fase;
  /** Números simulados (`LiveStatus.simulacao`). */
  simulado: boolean;
  /** Nomes ocultos na simulação (`LiveStatus.anonimizado`). */
  anonimizado: boolean;
  /** Eventos do feed nacional de Presidente (já anonimizados quando a simulação oculta os nomes). */
  eventos: readonly FeedEvent[];
  /** Pessoas agora (o maior entre a origem e o sinal das páginas), ou null sem medida. */
  pessoas: number | null;
}

export interface ResultadoPostar {
  convite: CartaoPostar;
  audiencia: CartaoPostar[];
  momentos: CartaoPostar[];
  /** Momentos escondidos pela trava das 17h (têm nome de candidato). */
  travados: number;
  /** Próximo marco de audiência ainda não atingido (null depois do último). */
  proximoMarco: MarcoAudiencia | null;
  /** Cartões com nome liberados agora. */
  nomesLiberados: boolean;
}

/**
 * Cartões com nome de candidato liberados? A partir das 17h de 25/10 pelo relógio do servidor; antes, só na simulação
 * com os nomes ocultos. Puro.
 */
export function nomesLiberados(e: Pick<EntradaPostar, 'wallNow' | 'simulado' | 'anonimizado'>): boolean {
  if (Number.isFinite(e.wallNow) && e.wallNow >= INICIO_APURACAO) return true;
  return e.simulado && e.anonimizado;
}

/** Marcos já atingidos por `n` pessoas (em ordem crescente). Puro. */
export function marcosAtingidos(n: number | null | undefined): MarcoAudiencia[] {
  if (typeof n !== 'number' || !Number.isFinite(n)) return [];
  return MARCOS_AUDIENCIA.filter((m) => n >= m);
}

/** Imagem do placar nacional de agora (OG do servidor). */
export function imagemPlacar(formato: FormatoImagemPostar): string {
  return `/api/og/apuracao.png?race=pres&formato=${formato}`;
}

/** Imagem de audiência (OG genérico do servidor): `marco` 0 = convite sem número. */
export function imagemAudiencia(marco: MarcoAudiencia | 0, formato: FormatoImagemPostar): string {
  return `/api/og/audiencia.png?m=${marco}&formato=${formato}`;
}

/** Monta os cartões da aba "Postar". Puro (testado: texto ≤ 220, trava das 17h, só eventos nacionais). */
export function cartoesPostar(e: EntradaPostar): ResultadoPostar {
  const liberados = nomesLiberados(e);
  const convite: CartaoPostar = {
    id: `convite-${e.fase}`,
    tipo: 'convite',
    rotulo: 'Convite',
    texto: textoPostarConvite(e.fase, e.simulado),
    caminho: '/apuracao',
    imagem: { x: imagemAudiencia(0, 'x'), story: imagemAudiencia(0, 'story') },
  };

  const atingidos = marcosAtingidos(e.pessoas);
  const audiencia: CartaoPostar[] = atingidos
    .slice()
    .reverse()
    .map((m) => ({
      id: `audiencia-${m}`,
      tipo: 'audiencia',
      rotulo: 'Audiência',
      texto: textoPostarAudiencia(m),
      caminho: '/apuracao',
      imagem: { x: imagemAudiencia(m, 'x'), story: imagemAudiencia(m, 'story') },
      marco: m,
    }));
  const proximoMarco = MARCOS_AUDIENCIA.find((m) => !atingidos.includes(m)) ?? null;

  const nacionais = e.eventos
    .filter((ev) => ev.abrangencia === 'BR' && TIPOS_MOMENTO.includes(ev.tipo) && Number.isFinite(ev.t) && !!ev.titulo?.trim())
    .slice()
    .sort((a, b) => b.t - a.t || a.id.localeCompare(b.id));
  const momentos: CartaoPostar[] = liberados
    ? nacionais.slice(0, MAX_MOMENTOS).map((ev) => ({
        id: `momento-${ev.id}`,
        tipo: 'momento',
        rotulo: ROTULO_MOMENTO[ev.tipo],
        t: ev.t,
        texto: textoPostarEvento(ev, e.simulado),
        caminho: '/apuracao',
        imagem: { x: imagemPlacar('x'), story: imagemPlacar('story') },
      }))
    : [];

  return { convite, audiencia, momentos, travados: liberados ? 0 : nacionais.length, proximoMarco, nomesLiberados: liberados };
}

export interface LinksPostar {
  /** Link do post no X (com `h=` durante a apuração). */
  linkX: string;
  /** Intenção do X (`x.com/intent/post`: texto + link + hashtags). */
  intencaoX: string;
  /** wa.me com o texto, "Acompanhe seção por seção:" e o link. */
  intencaoWhatsapp: string;
  /** Texto + hashtags + link para colar (Instagram, Telegram, Threads…), sem hora no link. */
  textoCopiar: string;
}

/**
 * Links do cartão para a URL absoluta da página (`urlPagina`). `agora` (relógio do servidor) só durante a apuração:
 * o link do X leva `h=HHMM` para a prévia não sair velha. Puro.
 */
export function linksPostar(c: Pick<CartaoPostar, 'texto'>, urlPagina: string, agora?: number): LinksPostar {
  const tags = HASHTAGS.apuracao;
  const linkX = urlCompartilhada(urlPagina, 'x', agora);
  return {
    linkX,
    intencaoX: xIntentUrl(c.texto, linkX, tags),
    intencaoWhatsapp: whatsappUrl(comSufixoLink(c.texto, SUFIXO_LINK), urlCompartilhada(urlPagina, 'whatsapp')),
    textoCopiar: textoComLink(c.texto, urlCompartilhada(urlPagina, 'copiar'), tags),
  };
}
