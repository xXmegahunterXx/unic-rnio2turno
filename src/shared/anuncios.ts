/**
 * Anúncios (anunciantes NÃO políticos — ARCHITECTURE §1.5): contrato compartilhado por motor, servidor, admin e app.
 *
 * Vários anunciantes ao mesmo tempo, cada um com os formatos em que aparece e um peso na rotação:
 *  - 'topo'             faixa logo abaixo do cabeçalho, em todas as páginas (a cota MASTER tem prioridade aqui);
 *  - 'rodape'           barra fixa no rodapé do celular (pode ser fechada pelo visitante; volta na próxima visita);
 *  - 'nativo'           cartão "Patrocinado" no meio do conteúdo (home, apuração, curiosidades, governadores…);
 *  - 'teste'            "Resultado oferecido por" na tela de resultado do Teste Cego (o momento mais compartilhado);
 *  - 'tv'               logo grande no Modo TV (transmissões);
 *  - 'compartilhamento' "Oferecimento: <marca>" no rodapé das imagens de compartilhamento (cartões do X/WhatsApp).
 *
 * Regras que valem em todo lugar: sempre rotulado ("Publicidade"/"Patrocinado"/"Oferecido por"); link com
 * rel="sponsored noopener"; nunca colado a número, foto ou nome de candidato (separação visual clara); sem pop-up,
 * sem som, sem animação piscante. Métricas só agregadas (impressões visíveis e cliques por anúncio/formato/hora),
 * sem cookie, sem IP e sem dado pessoal (LGPD).
 */

export const FORMATOS_ANUNCIO = ['topo', 'rodape', 'nativo', 'teste', 'tv', 'compartilhamento'] as const;
export type FormatoAnuncio = (typeof FORMATOS_ANUNCIO)[number];

export const ROTULO_FORMATO: Record<FormatoAnuncio, string> = {
  topo: 'Faixa no topo (todas as páginas)',
  rodape: 'Barra fixa no rodapé do celular',
  nativo: 'Cartão patrocinado no conteúdo',
  teste: 'Resultado do Teste Cego',
  tv: 'Modo TV',
  compartilhamento: 'Imagens de compartilhamento',
};

/** Cota: 'master' (patrocinador principal: prioridade no topo, na TV e nas imagens) ou 'apoio'. */
export type CotaAnuncio = 'master' | 'apoio';

/** Anúncio como o admin cadastra (fica no estado do servidor, `AdminState.anuncios`). */
export interface AnuncioConfig {
  /** identificador estável: a–z, 0–9 e hífen (2–40) */
  id: string;
  /** nome do anunciante (1–40) */
  marca: string;
  /** chamada curta (1–60), ex.: "Pix na hora, sem taxa" */
  titulo: string;
  /** texto de apoio (0–140) */
  texto: string;
  /** texto do botão (1–24), ex.: "Abrir conta" */
  cta: string;
  /** destino https (sem usuário/senha) */
  url: string;
  /** logo: data URI (png, jpeg, webp ou svg; até ~150 KB) — no /api/status vira URL do próprio servidor */
  logo?: string;
  /** peça/criativo opcional (data URI png/jpeg/webp até ~400 KB; proporção livre, exibido inteiro, sem corte) */
  imagem?: string;
  formatos: FormatoAnuncio[];
  /** peso na rotação (1–10) */
  peso: number;
  cota: CotaAnuncio;
  ativo: boolean;
  /** janela de exibição (epoch ms, opcional) */
  inicio?: number | null;
  fim?: number | null;
  /** declaração obrigatória do admin: anunciante e peça sem conteúdo político-eleitoral */
  naoPolitico: true;
}

/** O que o site recebe (em `LiveStatus.anuncios`): só anúncios ATIVOS e dentro da janela, sem métricas. */
export interface AnuncioPublico {
  id: string;
  marca: string;
  titulo: string;
  texto: string;
  cta: string;
  /** link de clique: no servidor, `/api/anuncio/ir/<id>` (conta o clique e redireciona com UTM); no demo, a URL com UTM */
  href: string;
  /** domínio de destino para exibir ("lynx.com.br") */
  destino: string;
  logo?: string;
  imagem?: string;
  formatos: FormatoAnuncio[];
  peso: number;
  cota: CotaAnuncio;
}

/** Contato da página /anuncie (configurado no admin). */
export interface ContatoAnuncie {
  email?: string;
  /** só dígitos com DDI, ex.: 5511999999999 */
  whatsapp?: string;
  /** frase opcional no topo da página /anuncie */
  chamada?: string;
}

/** Métricas agregadas de um anúncio num formato (admin). */
export interface MetricaAnuncio {
  id: string;
  formato: FormatoAnuncio;
  impressoes: number;
  cliques: number;
  /** últimas 48 h, por hora (epoch ms do início da hora → contagens) */
  porHora: { hora: number; impressoes: number; cliques: number }[];
}

export const ANUNCIO_LIMITES = {
  id: 40,
  marca: 40,
  titulo: 60,
  texto: 140,
  cta: 24,
  url: 500,
  peso: { min: 1, max: 10 },
  /** base64 ≈ 4/3 do binário + cabeçalho */
  logoDataUri: Math.ceil((150 * 1024 * 4) / 3) + 64,
  imagemDataUri: Math.ceil((400 * 1024 * 4) / 3) + 64,
  /** anúncios cadastrados (ativos ou não) */
  maxAnuncios: 24,
  chamada: 160,
  email: 120,
} as const;

const RE_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RE_LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const RE_IMAGEM = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
/** URL de imagem já servida pelo próprio servidor (estado restaurado/ida e volta do admin) */
const RE_IMG_SERVIDOR = /^(https?:\/\/[^\s/]+)?\/api\/anuncio\/img\?h=[a-f0-9]{8,64}$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** https válida, sem usuário/senha, com domínio. */
export function urlAnuncioValida(v: string): boolean {
  if (!v || v.length > ANUNCIO_LIMITES.url || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** "lynx.com.br" a partir da URL. */
export function dominioAnuncio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Gera um id a partir da marca ("Lynx Pay" → "lynx-pay"); o admin pode trocar. */
export function idDaMarca(marca: string): string {
  const base = marca
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ANUNCIO_LIMITES.id)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : `anuncio-${base || 'novo'}`;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
}

function epochOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : NaN;
}

/**
 * Valida e normaliza um anúncio vindo do admin (ou do estado salvo). Devolve só os campos do contrato.
 * Imagens: data URI (limites acima) ou a URL que o próprio servidor serve (ida e volta pelo admin — o servidor
 * reconhece e mantém a imagem que já tem).
 */
export function validaAnuncio(v: unknown): { ok: AnuncioConfig } | { erro: string } {
  if (!isObj(v)) return { erro: 'Anúncio inválido.' };
  const L = ANUNCIO_LIMITES;
  const id = texto(v.id).toLowerCase();
  if (!RE_ID.test(id) || id.length < 2) return { erro: 'Anúncio: "id" com 2 a 40 caracteres (letras minúsculas, números e hífen).' };
  const marca = texto(v.marca);
  if (!marca || marca.length > L.marca) return { erro: `Anúncio: "marca" é obrigatória (até ${L.marca} caracteres).` };
  const titulo = texto(v.titulo);
  if (!titulo || titulo.length > L.titulo) return { erro: `Anúncio: "título" é obrigatório (até ${L.titulo} caracteres).` };
  const t = texto(v.texto);
  if (t.length > L.texto) return { erro: `Anúncio: "texto" com até ${L.texto} caracteres.` };
  const cta = texto(v.cta);
  if (!cta || cta.length > L.cta) return { erro: `Anúncio: "botão" é obrigatório (até ${L.cta} caracteres).` };
  const url = typeof v.url === 'string' ? v.url.trim() : '';
  if (!urlAnuncioValida(url)) return { erro: 'Anúncio: o link precisa ser um endereço https:// válido.' };
  if (v.naoPolitico !== true) return { erro: 'Anúncio: confirme que o anunciante e a peça não têm conteúdo político-eleitoral.' };

  const formatos = Array.isArray(v.formatos) ? [...new Set(v.formatos)].filter((f): f is FormatoAnuncio => (FORMATOS_ANUNCIO as readonly unknown[]).includes(f)) : [];
  if (formatos.length === 0) return { erro: 'Anúncio: escolha pelo menos um formato.' };
  const peso = typeof v.peso === 'number' && Number.isFinite(v.peso) ? Math.round(v.peso) : 5;
  if (peso < L.peso.min || peso > L.peso.max) return { erro: `Anúncio: peso de ${L.peso.min} a ${L.peso.max}.` };
  const cota: CotaAnuncio = v.cota === 'master' ? 'master' : 'apoio';
  const inicio = epochOuNull(v.inicio);
  const fim = epochOuNull(v.fim);
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return { erro: 'Anúncio: datas de início/fim inválidas.' };
  if (inicio !== null && fim !== null && fim <= inicio) return { erro: 'Anúncio: o fim precisa ser depois do início.' };

  const out: AnuncioConfig = {
    id,
    marca,
    titulo,
    texto: t,
    cta,
    url,
    formatos: FORMATOS_ANUNCIO.filter((f) => formatos.includes(f)),
    peso,
    cota,
    ativo: v.ativo !== false,
    inicio,
    fim,
    naoPolitico: true,
  };
  const logo = typeof v.logo === 'string' ? v.logo.trim() : '';
  if (logo) {
    if (RE_IMG_SERVIDOR.test(logo)) out.logo = logo;
    else if (logo.length > L.logoDataUri || !RE_LOGO.test(logo)) return { erro: 'Anúncio: logo em PNG, JPEG, WebP ou SVG de até 150 KB.' };
    else out.logo = logo;
  }
  const imagem = typeof v.imagem === 'string' ? v.imagem.trim() : '';
  if (imagem) {
    if (RE_IMG_SERVIDOR.test(imagem)) out.imagem = imagem;
    else if (imagem.length > L.imagemDataUri || !RE_IMAGEM.test(imagem)) return { erro: 'Anúncio: peça em PNG, JPEG ou WebP de até 400 KB.' };
    else out.imagem = imagem;
  }
  return { ok: out };
}

/** Valida o contato da página /anuncie. */
export function validaContatoAnuncie(v: unknown): { ok: ContatoAnuncie } | { erro: string } {
  if (v === null || v === undefined) return { ok: {} };
  if (!isObj(v)) return { erro: 'Contato inválido.' };
  const out: ContatoAnuncie = {};
  const email = texto(v.email);
  if (email) {
    if (email.length > ANUNCIO_LIMITES.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: 'Contato: e-mail inválido.' };
    out.email = email;
  }
  const whatsapp = texto(v.whatsapp).replace(/\D/g, '');
  if (whatsapp) {
    if (whatsapp.length < 10 || whatsapp.length > 15) return { erro: 'Contato: WhatsApp com DDI e DDD, só números (ex.: 5511999999999).' };
    out.whatsapp = whatsapp;
  }
  const chamada = texto(v.chamada);
  if (chamada) {
    if (chamada.length > ANUNCIO_LIMITES.chamada) return { erro: `Contato: chamada com até ${ANUNCIO_LIMITES.chamada} caracteres.` };
    out.chamada = chamada;
  }
  return { ok: out };
}

/** Ativo e dentro da janela no instante `agora` (relógio real, epoch ms). */
export function anuncioNoAr(a: Pick<AnuncioConfig, 'ativo' | 'inicio' | 'fim'>, agora: number): boolean {
  if (!a.ativo) return false;
  if (a.inicio && agora < a.inicio) return false;
  if (a.fim && agora >= a.fim) return false;
  return true;
}

/** URL de destino com UTM (utm_source=sintonia, utm_medium=<formato>, utm_campaign=<id>), sem apagar parâmetros do anunciante. */
export function urlComUtm(url: string, id: string, formato: FormatoAnuncio | 'link'): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'sintonia');
    if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', formato);
    if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', id);
    return u.toString();
  } catch {
    return url;
  }
}

/** Hash FNV-1a 32 bits (escolha determinística por semente; não é criptografia). */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Escolhe o anúncio de um formato. Rotação ponderada pelo `peso`, determinística pela `semente` (ex.: id da visita
 * + posição na página: a mesma posição não troca a cada renderização, mas muda entre visitas). No 'topo', na 'tv' e
 * em 'compartilhamento', a cota MASTER vence quando existe. `evitar` tira ids já mostrados em outra posição da mesma
 * página (se sobrar algum).
 */
export function escolherAnuncio<T extends Pick<AnuncioPublico, 'id' | 'formatos' | 'peso' | 'cota'>>(
  anuncios: readonly T[] | null | undefined,
  formato: FormatoAnuncio,
  semente: string,
  evitar: readonly string[] = [],
): T | null {
  let pool = (anuncios ?? []).filter((a) => a.formatos.includes(formato));
  if (pool.length === 0) return null;
  if (formato === 'topo' || formato === 'tv' || formato === 'compartilhamento') {
    const master = pool.filter((a) => a.cota === 'master');
    if (master.length) pool = master;
  }
  const sem = pool.filter((a) => !evitar.includes(a.id));
  if (sem.length) pool = sem;
  const total = pool.reduce((s, a) => s + Math.max(1, a.peso), 0);
  let r = fnv(`${semente}|${formato}`) % total;
  for (const a of pool) {
    r -= Math.max(1, a.peso);
    if (r < 0) return a;
  }
  return pool[pool.length - 1];
}
