/**
 * Compartilhamento: Web Share API → fallback WhatsApp; copiar link; gerar PNG de um nó do DOM.
 * Nenhuma função aqui envia dados a servidores (LGPD): tudo acontece no navegador.
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

/** Link do WhatsApp com o texto (e a URL) pré-preenchidos. */
export function whatsappUrl(texto: string, url?: string): string {
  const msg = url ? `${texto}\n${url}` : texto;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export function abrirWhatsapp(texto: string, url?: string) {
  window.open(whatsappUrl(texto, url), '_blank', 'noopener,noreferrer');
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

export interface PngOpcoes {
  /** Largura/altura finais em px CSS (o nó é renderizado nesse tamanho). */
  width?: number;
  height?: number;
  /** Multiplicador de resolução. Padrão 1 (o cartão já tem 1080 px). */
  pixelRatio?: number;
  /** Cor de fundo (CSS). Padrão: token --bg. */
  backgroundColor?: string;
}

function corFundoPadrao(): string {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return bg ? `rgb(${bg.split(/\s+/).join(', ')})` : 'black';
}

/** Gera um Blob PNG a partir de um nó do DOM (html-to-image, carregado sob demanda). */
export async function nodeToPngBlob(node: HTMLElement, opts: PngOpcoes = {}): Promise<Blob> {
  const { toBlob } = await import('html-to-image');
  if (document.fonts?.ready) await document.fonts.ready;
  const blob = await toBlob(node, {
    width: opts.width,
    height: opts.height,
    pixelRatio: opts.pixelRatio ?? 1,
    backgroundColor: opts.backgroundColor ?? corFundoPadrao(),
    cacheBust: true,
    style: { transform: 'none', margin: '0' },
  });
  if (!blob) throw new Error('Não foi possível gerar a imagem.');
  return blob;
}

function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo.endsWith('.png') ? nomeArquivo : `${nomeArquivo}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Baixa um nó do DOM como PNG. */
export async function downloadNodeAsPng(node: HTMLElement, nomeArquivo: string, opts: PngOpcoes = {}): Promise<void> {
  const blob = await nodeToPngBlob(node, opts);
  baixarBlob(blob, nomeArquivo);
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
  if (podeCompartilharNativo() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: input.titulo, text: `${input.texto}\n${input.url ?? urlAbsoluta()}` });
      return 'compartilhado';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
    }
  }
  baixarBlob(blob, nome);
  return 'baixado';
}
