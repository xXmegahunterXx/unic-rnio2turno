/**
 * Geração do PNG de um cartão (html-to-image), pensada para o celular:
 *  - fontes: embute SÓ os subconjuntos (unicode-range) que cobrem os caracteres do cartão, das famílias que ele usa
 *    (Inter, Bricolage, JetBrains Mono), convertidos para data URL uma única vez por sessão — o padrão do
 *    html-to-image baixaria todos os subconjuntos (cirílico, grego, vietnamita…) a cada imagem;
 *  - espera as imagens (fotos oficiais em data URI) e as fontes ficarem prontas antes de desenhar;
 *  - resolução 1× (o cartão já é desenhado em px reais: 1200×675, 1080×1350 ou 1080×1920).
 */
import { nodeToPngBlob } from '@/app/lib/share';

const normFamilia = (f: string) => f.trim().replace(/["']/g, '').toLowerCase();

/** Famílias realmente usadas pelo nó (a primeira de cada `font-family`). */
function familiasUsadas(node: HTMLElement): Set<string> {
  const out = new Set<string>();
  const visitar = (el: Element) => {
    const ff = getComputedStyle(el).fontFamily;
    if (ff) out.add(normFamilia(ff.split(',')[0]));
    for (const filho of Array.from(el.children)) visitar(filho);
  };
  visitar(node);
  return out;
}

/**
 * Faixas de um `unicode-range` ("U+0-FF, U+131, U+4??" — o Chrome normaliza sem zeros à esquerda). Pura (testada).
 */
export function faixasUnicode(unicodeRange: string): [number, number][] {
  const out: [number, number][] = [];
  for (const parte of unicodeRange.split(',')) {
    const t = parte.trim().toUpperCase().replace(/^U\+/, '');
    if (!t) continue;
    if (t.includes('?')) {
      out.push([parseInt(t.replace(/\?/g, '0'), 16), parseInt(t.replace(/\?/g, 'F'), 16)]);
      continue;
    }
    const [a, b] = t.split('-');
    const ini = parseInt(a, 16);
    const fim = b ? parseInt(b, 16) : ini;
    if (Number.isFinite(ini) && Number.isFinite(fim)) out.push([ini, fim]);
  }
  return out;
}

/** true se o subconjunto (`unicode-range`) cobre algum caractere usado (sem faixa = cobre tudo). Pura (testada). */
export function subconjuntoNecessario(unicodeRange: string, usados: Iterable<number>): boolean {
  const faixas = faixasUnicode(unicodeRange);
  if (!faixas.length) return true;
  for (const cp of usados) if (faixas.some(([a, b]) => cp >= a && cp <= b)) return true;
  return false;
}

/** Caracteres do texto do cartão (+ dígitos e "%", sempre presentes nos números). */
function caracteresUsados(node: HTMLElement): Set<number> {
  const out = new Set<number>();
  for (const ch of `${node.textContent ?? ''}0123456789%`) out.add(ch.codePointAt(0)!);
  return out;
}

const dataUrls = new Map<string, Promise<string>>();

function paraDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return Promise.resolve(url);
  let p = dataUrls.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`fonte ${r.status}`);
        return r.blob();
      })
      .then(
        (b) =>
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(b);
          }),
      );
    p.catch(() => dataUrls.delete(url));
    dataUrls.set(url, p);
  }
  return p;
}

interface RegraFonte {
  familia: string;
  css: (dataUrl: string) => string;
  url: string;
}

function regrasDeFonte(familias: Set<string>, usados: Set<number>): RegraFonte[] {
  const out: RegraFonte[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let regras: CSSRuleList;
    try {
      regras = sheet.cssRules;
    } catch {
      continue; // folha de outra origem (Google Fonts etc.)
    }
    const base = sheet.href ?? document.baseURI;
    for (const regra of Array.from(regras)) {
      if (!(regra instanceof CSSFontFaceRule)) continue;
      const s = regra.style;
      const familia = normFamilia(s.getPropertyValue('font-family'));
      if (!familias.has(familia)) continue;
      const faixa = s.getPropertyValue('unicode-range');
      if (!subconjuntoNecessario(faixa, usados)) continue;
      const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(s.getPropertyValue('src'));
      if (!m) continue;
      let url: string;
      try {
        url = m[1].startsWith('data:') ? m[1] : new URL(m[1], base).href;
      } catch {
        continue;
      }
      const decl = [
        `font-family:${s.getPropertyValue('font-family')}`,
        s.getPropertyValue('font-style') ? `font-style:${s.getPropertyValue('font-style')}` : '',
        s.getPropertyValue('font-weight') ? `font-weight:${s.getPropertyValue('font-weight')}` : '',
        s.getPropertyValue('font-stretch') ? `font-stretch:${s.getPropertyValue('font-stretch')}` : '',
        faixa ? `unicode-range:${faixa}` : '',
        'font-display:block',
      ].filter(Boolean);
      out.push({ familia, url, css: (d) => `@font-face{${decl.join(';')};src:url(${d}) format('woff2')}` });
    }
  }
  return out;
}

const cssPorFamilias = new Map<string, Promise<string>>();

/** CSS com as fontes do cartão embutidas (cache por conjunto de famílias). */
export function cssFontesEmbutidas(node: HTMLElement): Promise<string> {
  const familias = familiasUsadas(node);
  const usados = caracteresUsados(node);
  const regras = regrasDeFonte(familias, usados);
  // Cache pelo conjunto de arquivos (o mesmo cartão com outros números reaproveita tudo).
  const chave = regras.map((r) => r.url).sort().join('|');
  let p = cssPorFamilias.get(chave);
  if (!p) {
    p = Promise.all(regras.map((r) => paraDataUrl(r.url).then((d) => r.css(d)))).then((css) => css.join('\n'));
    p.catch(() => cssPorFamilias.delete(chave));
    cssPorFamilias.set(chave, p);
  }
  return p;
}

/** Espera as imagens do nó carregarem e decodificarem (com teto de tempo). */
async function esperarImagens(node: HTMLElement, tetoMs = 4000): Promise<void> {
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          const fim = () => {
            if (typeof img.decode === 'function') img.decode().catch(() => undefined).finally(resolve);
            else resolve();
          };
          if (img.complete) return fim();
          const t = window.setTimeout(resolve, tetoMs);
          img.addEventListener('load', () => (window.clearTimeout(t), fim()), { once: true });
          img.addEventListener('error', () => (window.clearTimeout(t), resolve()), { once: true });
        }),
    ),
  );
}

/** Pede ao navegador as fontes usadas pelo nó (as do cartão podem ainda não ter sido baixadas). */
async function carregarFontes(node: HTMLElement): Promise<void> {
  if (!document.fonts) return;
  const pesos = new Set<string>();
  const visitar = (el: Element) => {
    const cs = getComputedStyle(el);
    pesos.add(`${cs.fontStyle} ${cs.fontWeight} 32px ${cs.fontFamily.split(',')[0]}`);
    for (const f of Array.from(el.children)) visitar(f);
  };
  visitar(node);
  await Promise.all([...pesos].map((f) => document.fonts.load(f, 'Aá0%').catch(() => undefined)));
  await document.fonts.ready;
}

/** Gera o PNG do cartão (nó com w×h px reais). Lança erro se não conseguir. */
export async function gerarPngCartao(node: HTMLElement, w: number, h: number): Promise<Blob> {
  await Promise.all([esperarImagens(node), carregarFontes(node)]);
  let fontEmbedCSS: string | undefined;
  try {
    fontEmbedCSS = await cssFontesEmbutidas(node);
  } catch {
    fontEmbedCSS = undefined; // cai no embutidor padrão do html-to-image
  }
  return nodeToPngBlob(node, { width: w, height: h, pixelRatio: 1, fontEmbedCSS: fontEmbedCSS || undefined });
}
