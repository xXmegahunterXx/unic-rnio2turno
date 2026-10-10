/**
 * Compartilhamento: Web Share API → fallback WhatsApp; X (Twitter); copiar link; gerar PNG de um nó do DOM.
 * Nenhuma função aqui envia dados a servidores (LGPD): tudo acontece no navegador.
 *
 * Navegadores embutidos (app do X, Instagram, Facebook, TikTok, LinkedIn, WebViews em geral) costumam não ter
 * `navigator.share` e bloquear o download de arquivos: `navegadorEmbutido()` permite trocar o download por um
 * modal com a imagem ("toque e segure para salvar"). O mesmo vale dentro de um iframe de outra origem (`emIframe`).
 */

export interface ShareInput {
  titulo?: string;
  texto: string;
  /** URL absoluta. Padrão: a página atual. */
  url?: string;
}

export type ShareResultado = 'compartilhado' | 'whatsapp' | 'cancelado' | 'copiado' | 'erro';

/** URL absoluta de uma rota do app (funciona com BrowserRouter e com o HashRouter do build demo). */
export function urlAbsoluta(caminho = ''): string {
  if (typeof window === 'undefined') return caminho;
  if (!caminho) return window.location.href;
  if (/^https?:\/\//.test(caminho)) return caminho;
  const path = caminho.startsWith('/') ? caminho : `/${caminho}`;
  if (__DEMO__) {
    const base = window.location.href.split('#')[0];
    return `${base}#${path}`;
  }
  return `${window.location.origin}${path}`;
}

/** Host curto para exibir em imagens ("sintonia.app"). */
export function hostExibicao(): string {
  if (typeof window === 'undefined') return '';
  return window.location.host.replace(/^www\./, '');
}

/**
 * true se o host é apresentável numa imagem: domínio "de verdade", curto, sem porta e sem cara de sandbox
 * (localhost, IP, domínios de conteúdo de terceiros como os iframes de prévia). Puro (testado).
 */
export function hostBonito(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^www\./, '');
  if (!h || h.length > 28) return false;
  if (h.includes(':')) return false; // porta (ou IPv6)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false; // IPv4
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return false;
  if (/usercontent|sandbox|preview|artifact|claude|ngrok|vercel\.app$|netlify\.app$|pages\.dev$/.test(h)) return false;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h);
}

/** Host para o rodapé das imagens, ou '' quando o endereço atual não é apresentável (prévia, localhost…). */
export function siteExibicao(): string {
  const h = hostExibicao();
  return hostBonito(h) ? h.replace(/^www\./, '') : '';
}

/** Link do WhatsApp com o texto (e a URL) pré-preenchidos. */
export function whatsappUrl(texto: string, url?: string): string {
  const msg = url ? `${texto}\n${url}` : texto;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export function abrirWhatsapp(texto: string, url?: string) {
  abrirExterno(whatsappUrl(texto, url));
}

export const podeCompartilharNativo = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * Web Share API quando disponível (celular); senão abre o WhatsApp.
 * Cancelamento do usuário não é erro.
 */
export async function compartilhar(input: ShareInput): Promise<ShareResultado> {
  const url = input.url ?? urlAbsoluta();
  if (podeCompartilharNativo()) {
    try {
      await navigator.share({ title: input.titulo, text: input.texto, url });
      return 'compartilhado';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
    }
  }
  abrirWhatsapp(input.texto, url);
  return 'whatsapp';
}

/** Copia texto para a área de transferência (com fallback para navegadores antigos). */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* cai no fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export const copiarLink = (url?: string) => copiarTexto(url ?? urlAbsoluta());

// =============================================================================================
// X (Twitter)
// =============================================================================================

/** Limite de um post no X (peso ponderado) e peso fixo de qualquer link (t.co). */
export const LIMITE_X = 280;
export const PESO_LINK_X = 23;

/** Faixas de peso 1 do X (twitter-text v3); o resto pesa 2 (CJK, emoji, "…", "−"). */
const FAIXAS_PESO_1: [number, number][] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];
const RE_URL = /https?:\/\/[^\s]+/g;

/** Peso de um texto para o limite do X: links valem 23; cada caractere vale 1 ou 2. Puro (testado). */
export function pesoTextoX(texto: string): number {
  let peso = 0;
  const semLinks = texto.replace(RE_URL, () => {
    peso += PESO_LINK_X;
    return '';
  });
  for (const ch of semLinks) {
    const cp = ch.codePointAt(0)!;
    peso += FAIXAS_PESO_1.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
  }
  return peso;
}

/** Hashtags normalizadas (sem '#', sem espaços, sem repetição). */
export function normalizarHashtags(hashtags?: readonly string[]): string[] {
  const out: string[] = [];
  for (const h of hashtags ?? []) {
    const t = h.replace(/^#+/, '').replace(/\s+/g, '').trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** Peso final do post que a intenção do X monta: texto + " #tag"… + " " + link. */
export function pesoPostX(texto: string, hashtags?: readonly string[], comLink = true): number {
  const tags = normalizarHashtags(hashtags);
  return pesoTextoX(texto) + tags.reduce((s, t) => s + 1 + pesoTextoX(`#${t}`), 0) + (comLink ? 1 + PESO_LINK_X : 0);
}

/**
 * Garante que o post caiba no X: tira o link do texto (ele vai no parâmetro `url`, nunca duplicado) e corta o texto
 * na última palavra inteira com "…" se, somado às hashtags e ao link, passar de 280. Puro (testado).
 */
export function textoParaX(texto: string, url?: string, hashtags?: readonly string[]): string {
  let t = texto;
  if (url) t = t.split(url).join('');
  t = t.replace(/\s+/g, ' ').trim();
  if (pesoPostX(t, hashtags, !!url) <= LIMITE_X) return t;
  const chars = Array.from(t);
  while (chars.length > 0) {
    chars.pop();
    let base = chars.join('').trimEnd();
    const espaco = base.lastIndexOf(' ');
    if (espaco > base.length * 0.6) base = base.slice(0, espaco);
    const candidato = `${base.replace(/[\s,;:·—–-]+$/, '')}…`;
    if (pesoPostX(candidato, hashtags, !!url) <= LIMITE_X) return candidato;
  }
  return '';
}

/**
 * Intenção de post do X: `https://x.com/intent/post?text=…&url=…&hashtags=a,b`. O texto vai SEM o link (o X mostra o
 * link e o cartão a partir do parâmetro `url`); tudo com encodeURIComponent. Puro (testado).
 */
export function xIntentUrl(texto: string, url?: string, hashtags?: readonly string[]): string {
  const tags = normalizarHashtags(hashtags);
  const partes = [`text=${encodeURIComponent(textoParaX(texto, url, tags))}`];
  if (url) partes.push(`url=${encodeURIComponent(url)}`);
  if (tags.length) partes.push(`hashtags=${tags.map(encodeURIComponent).join(',')}`);
  return `https://x.com/intent/post?${partes.join('&')}`;
}

/** Abre a intenção do X numa nova aba (no app do X, o próprio app costuma abrir o editor). */
export function abrirX(texto: string, url?: string, hashtags?: readonly string[]) {
  abrirExterno(xIntentUrl(texto, url, hashtags));
}

/**
 * Abre um link externo como um <a target=_blank> de verdade (mais confiável que window.open em WebViews e iframes
 * com sandbox, onde pop-ups costumam ser bloqueados).
 */
export function abrirExterno(href: string) {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Texto completo para colar (copiar texto / Web Share com arquivo): texto, hashtags e link. */
export function textoComLink(texto: string, url?: string, hashtags?: readonly string[]): string {
  const tags = normalizarHashtags(hashtags).map((t) => `#${t}`).join(' ');
  return [texto.trim(), tags].filter(Boolean).join(' ') + (url ? `\n${url}` : '');
}

// =============================================================================================
// Navegadores embutidos e iframes
// =============================================================================================

export type NavegadorEmbutido = 'x' | 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'outro';

/** Navegador embutido de um app a partir do userAgent (null = navegador comum). Puro (testado). */
export function detectarNavegadorEmbutido(ua: string): NavegadorEmbutido | null {
  if (!ua) return null;
  if (/Twitter for (iPhone|iPad|Android)|TwitterAndroid|\bTwitter\/\d/i.test(ua)) return 'x';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|FBSV|\bMessenger/i.test(ua)) return 'facebook';
  if (/musical_ly|BytedanceWebview|TikTok|\btrill_|ByteLocale/i.test(ua)) return 'tiktok';
  if (/LinkedInApp/i.test(ua)) return 'linkedin';
  // WebView genérica: Android com "; wv)" e iOS sem o token "Safari" (WKWebView de apps, inclusive o do Claude).
  if (/Android/i.test(ua) && /;\s?wv\)/i.test(ua)) return 'outro';
  if (/iPhone|iPad|iPod/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua)) return 'outro';
  return null;
}

/** Navegador embutido atual (null fora de apps ou no servidor). */
export function navegadorEmbutido(): NavegadorEmbutido | null {
  if (typeof navigator === 'undefined') return null;
  return detectarNavegadorEmbutido(navigator.userAgent || '');
}

/** Nome do app para mensagens ("no navegador do X"). */
export const NOME_APP_EMBUTIDO: Record<NavegadorEmbutido, string> = {
  x: 'X',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  outro: 'aplicativo',
};

/** true quando a página roda dentro de um iframe (ex.: prévia publicada), onde download e Web Share podem ser bloqueados. */
export function emIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Aparelho de toque (para escolher "toque e segure" × "clique com o botão direito"). */
export function telaDeToque(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/** true se o navegador aceita compartilhar ESTE arquivo pelo Web Share (nível 2). */
export function podeCompartilharArquivo(file: File): boolean {
  if (!podeCompartilharNativo() || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ResultadoWebShare = 'compartilhado' | 'cancelado' | 'bloqueado' | 'indisponivel';

/**
 * Web Share com um arquivo (o link vai no texto: com arquivo, vários apps ignoram o campo `url`).
 * 'bloqueado' = o navegador recusou (gesto expirado, iframe sem permissão): mostre a imagem para salvar.
 */
export async function compartilharArquivo(file: File, input: { titulo?: string; texto: string }): Promise<ResultadoWebShare> {
  if (!podeCompartilharArquivo(file)) return 'indisponivel';
  try {
    await navigator.share({ files: [file], title: input.titulo, text: input.texto });
    return 'compartilhado';
  } catch (e) {
    const nome = (e as { name?: string })?.name;
    if (nome === 'AbortError') return 'cancelado';
    if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'bloqueado';
    return 'indisponivel';
  }
}

/** Web Share só com texto e link (sem arquivo). */
export async function compartilharLink(input: { titulo?: string; texto: string; url: string }): Promise<ResultadoWebShare> {
  if (!podeCompartilharNativo()) return 'indisponivel';
  try {
    await navigator.share({ title: input.titulo, text: input.texto, url: input.url });
    return 'compartilhado';
  } catch (e) {
    const nome = (e as { name?: string })?.name;
    if (nome === 'AbortError') return 'cancelado';
    if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'bloqueado';
    return 'indisponivel';
  }
}

// =============================================================================================
// PNG
// =============================================================================================

export interface PngOpcoes {
  /** Largura/altura finais em px CSS (o nó é renderizado nesse tamanho). */
  width?: number;
  height?: number;
  /** Multiplicador de resolução. Padrão 1 (o cartão já tem 1080 px). */
  pixelRatio?: number;
  /** Cor de fundo (CSS). Padrão: token --bg. */
  backgroundColor?: string;
  /** CSS das fontes já embutidas (data URLs), para não refazer o trabalho a cada imagem. */
  fontEmbedCSS?: string;
}

function corFundoPadrao(): string {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return bg ? `rgb(${bg.split(/\s+/).join(', ')})` : 'black';
}

/** WebKit (Safari/iOS, inclusive WebViews): o 1º desenho de um SVG com fontes/imagens embutidas às vezes sai sem elas. */
function ehWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|Android/i.test(ua);
}

/** Gera um Blob PNG a partir de um nó do DOM (html-to-image, carregado sob demanda). */
export async function nodeToPngBlob(node: HTMLElement, opts: PngOpcoes = {}): Promise<Blob> {
  const { toBlob } = await import('html-to-image');
  if (document.fonts?.ready) await document.fonts.ready;
  const config = {
    width: opts.width,
    height: opts.height,
    pixelRatio: opts.pixelRatio ?? 1,
    backgroundColor: opts.backgroundColor ?? corFundoPadrao(),
    // Sem cacheBust: ele anexa ?t= às URLs e derruba o cache HTTP das fontes a cada imagem.
    cacheBust: false,
    fontEmbedCSS: opts.fontEmbedCSS,
    style: { transform: 'none', margin: '0' },
  };
  if (ehWebKit()) await toBlob(node, config).catch(() => null);
  const blob = await toBlob(node, config);
  if (!blob || blob.size === 0) throw new Error('Não foi possível gerar a imagem.');
  return blob;
}

/** Baixa um Blob como arquivo (no navegador embutido/iframe pode ser bloqueado em silêncio). */
export function baixarArquivo(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo.endsWith('.png') ? nomeArquivo : `${nomeArquivo}.png`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Blob → data URL (para a imagem do modal "toque e segure para salvar": WebViews salvam data: melhor que blob:). */
export function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Falha ao ler a imagem.'));
    r.readAsDataURL(blob);
  });
}

/** Baixa um nó do DOM como PNG. */
export async function downloadNodeAsPng(node: HTMLElement, nomeArquivo: string, opts: PngOpcoes = {}): Promise<void> {
  const blob = await nodeToPngBlob(node, opts);
  baixarArquivo(blob, nomeArquivo);
}

/**
 * Compartilha a imagem de um nó como arquivo (Web Share Level 2, celular). Sem suporte: baixa o PNG.
 * Retorna o que aconteceu.
 */
export async function compartilharNodeComoImagem(
  node: HTMLElement,
  nomeArquivo: string,
  input: ShareInput,
  opts: PngOpcoes = {},
): Promise<ShareResultado | 'baixado'> {
  const blob = await nodeToPngBlob(node, opts);
  const nome = nomeArquivo.endsWith('.png') ? nomeArquivo : `${nomeArquivo}.png`;
  const file = new File([blob], nome, { type: 'image/png' });
  if (podeCompartilharArquivo(file)) {
    try {
      await navigator.share({ files: [file], title: input.titulo, text: `${input.texto}\n${input.url ?? urlAbsoluta()}` });
      return 'compartilhado';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
    }
  }
  baixarArquivo(blob, nome);
  return 'baixado';
}
