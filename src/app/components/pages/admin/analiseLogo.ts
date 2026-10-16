/**
 * Análise, recorte e gravação das imagens do anunciante NO PAINEL (anunciantes v2, E3 e E5). O site só obedece ao que
 * fica gravado no anúncio (`AjusteImagem`, src/shared/anuncios.ts): nada é medido no site nem no servidor.
 *
 *  - `analisarPixels` (pura, testável no Node com um buffer RGBA): acha as margens vazias (transparentes ou, na logo, de
 *    cor sólida uniforme), mede o contraste da SILHUETA contra a superfície clara e a escura dos temas e decide a placa
 *    de cada tema.
 *  - `prepararLogoV2` / `prepararPecaV2` (navegador): desenham a imagem num canvas — imagem animada vira parada, SVG vira
 *    PNG —, recortam na resolução ORIGINAL e gravam. Logo: PNG (mantém a transparência; também serve às imagens de
 *    compartilhamento, que não leem WebP com transparência); opaca e pesada pode ir em JPEG. Peça: com transparência,
 *    WebP (se o navegador gerar) ou PNG; sem transparência, WebP ou JPEG. NUNCA JPEG com transparência (o JPEG pinta o
 *    transparente de preto — o "fundo preto" do iPhone).
 *
 * Nunca edita a imagem: só recorta margens vazias e redimensiona (o fundo próprio de uma imagem opaca é mantido).
 * Os números RGB abaixo são constantes de CÁLCULO (as superfícies `--surface` dos dois temas), não estilo.
 */
import { ANUNCIO_LIMITES, imagemAnimada, type AjusteImagem, type PlacaLogo } from '@/shared/anuncios';
import { fmtInt } from '@/shared/format';

/** Superfícies dos temas (token `--surface`): claro 255 255 255, escuro 17 17 26 — as mesmas das placas. */
export const SUPERFICIE_CLARA = [255, 255, 255] as const;
export const SUPERFICIE_ESCURA = [17, 17, 26] as const;

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
/** Luminância relativa (WCAG). */
export const luminancia = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** Razão de contraste (WCAG) entre duas luminâncias. */
export const contraste = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

const L_CLARA = luminancia(...SUPERFICIE_CLARA);
const L_ESCURA = luminancia(...SUPERFICIE_ESCURA);

/**
 * Limiares da análise:
 *  - some: contraste abaixo do qual um pixel "some" no fundo; fracaoSome: fração da silhueta que, sumindo, pede placa;
 *  - mediana: contraste mediano da silhueta abaixo do qual o tema pede placa;
 *  - alfa: pixel com alfa acima disto é conteúdo; ruidoFundo: distância (máx. por canal) da cor do fundo sólido para
 *    contar como conteúdo;
 *  - bordaUniforme / fracaoBorda: fundo sólido = ≥ 95% da borda a ≤ 18 da cor mediana;
 *  - recorteMin: só recorta se tirar pelo menos 3% (largura ou altura);
 *  - respiroTransp: folga em volta do conteúdo transparente (2% do maior lado); respiroFundo: folga do fundo sólido
 *    (30% da altura do conteúdo — o fundo próprio continua em volta, como uma placa).
 */
export const LIMIAR = {
  some: 1.5,
  fracaoSome: 0.02,
  mediana: 2.5,
  alfa: 10,
  ruidoFundo: 28,
  bordaUniforme: 18,
  fracaoBorda: 0.95,
  recorteMin: 0.03,
  respiroTransp: 0.02,
  respiroFundo: 0.3,
} as const;

export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnalisePixels {
  /** tem transparência (mais de 2% da borda ou mais de 1% da área com alfa < 250) */
  transparente: boolean;
  /** cor do fundo sólido (imagem opaca com borda uniforme) */
  fundoSolido: [number, number, number] | null;
  /** imagem opaca com fundo claro (fundo sólido, ou a borda, com luminância alta): vira um "cartão branco" no escuro */
  fundoClaro: boolean;
  /** caixa do conteúdo com o respiro; null = nada a recortar */
  recorte: Caixa | null;
  /** fração (0–1) da silhueta que SOME sobre a superfície clara / escura (contraste < 1,5) */
  someNoClaro: number;
  someNoEscuro: number;
  /** contraste mediano da silhueta contra a superfície clara / escura */
  contrasteClaro: number;
  contrasteEscuro: number;
  tom: 'clara' | 'escura' | 'colorida' | 'mista';
  /** placa automática de cada tema */
  placaClaro: PlacaLogo;
  placaEscuro: PlacaLogo;
  /** largura ÷ altura da área analisada (recortada, se houver recorte) */
  proporcao: number;
}

export interface OpcoesAnalise {
  /** logo: recorta também a margem de cor sólida de uma imagem opaca (respiro de 30%). Peça: false (só a transparente). */
  recortarFundoSolido?: boolean;
  /** alfa acima do qual o pixel conta como conteúdo no recorte (padrão `LIMIAR.alfa`; a peça usa 0 = só margem 100% transparente) */
  alfaConteudo?: number;
}

/** Mediana ponderada de pares (valor, peso). */
function mediana(pares: [number, number][]): number {
  if (!pares.length) return 0;
  pares.sort((a, b) => a[0] - b[0]);
  const total = pares.reduce((s, p) => s + p[1], 0);
  let acc = 0;
  for (const [v, w] of pares) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return pares[pares.length - 1][0];
}

/**
 * Analisa um buffer RGBA (largura × altura × 4). Pura: não toca no DOM.
 *  1. transparência: mais de 2% da borda ou mais de 1% da área com alfa < 250;
 *  2. fundo sólido (só imagem opaca): mediana da borda, com ≥ 95% da borda a ≤ 18 dessa cor;
 *  3. caixa do conteúdo: transparente → alfa > 10 com respiro de 2% do maior lado; fundo sólido (com
 *     `recortarFundoSolido`) → pixels a mais de 28 da cor do fundo, com respiro de 30% da altura do conteúdo. Só recorta
 *     se tirar pelo menos 3% da largura ou da altura;
 *  4. contraste medido só na SILHUETA (pixel visível com vizinho transparente a até 2 px: o miolo de uma forma opaca —
 *     a letra branca dentro do ícone laranja — fica sobre a própria logo, não sobre a página), contra 255,255,255 e
 *     17,17,26;
 *  5. placa num tema quando ≥ 2% da silhueta tem contraste < 1,5 ou a mediana é < 2,5; se some nos dois temas, a placa
 *     que esconde menos, nos dois. Imagem opaca: sem placa (traz o próprio fundo).
 */
export function analisarPixels(d: Uint8ClampedArray | Uint8Array, w: number, h: number, opcoes: OpcoesAnalise = {}): AnalisePixels {
  const recortarFundoSolido = opcoes.recortarFundoSolido ?? true;
  const alfaConteudo = opcoes.alfaConteudo ?? LIMIAR.alfa;
  const n = w * h;
  const naBorda = (x: number, y: number) => x === 0 || y === 0 || x === w - 1 || y === h - 1;

  // 1) transparência
  let semiTransp = 0;
  let bordaTransp = 0;
  let borda = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = d[(y * w + x) * 4 + 3];
      if (a < 250) semiTransp++;
      if (naBorda(x, y)) {
        borda++;
        if (a < 250) bordaTransp++;
      }
    }
  const transparente = bordaTransp > borda * 0.02 || semiTransp > n * 0.01;

  // 2) fundo sólido (imagem opaca): mediana das cores da borda; ≥ 95% da borda perto dela
  let fundoSolido: [number, number, number] | null = null;
  let corBorda: [number, number, number] | null = null;
  if (!transparente) {
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!naBorda(x, y)) continue;
        const i = (y * w + x) * 4;
        rs.push(d[i]);
        gs.push(d[i + 1]);
        bs.push(d[i + 2]);
      }
    const med = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];
    corBorda = [med(rs), med(gs), med(bs)];
    let perto = 0;
    for (let k = 0; k < rs.length; k++)
      if (Math.max(Math.abs(rs[k] - corBorda[0]), Math.abs(gs[k] - corBorda[1]), Math.abs(bs[k] - corBorda[2])) <= LIMIAR.bordaUniforme) perto++;
    if (perto >= rs.length * LIMIAR.fracaoBorda) fundoSolido = corBorda;
  }
  const fundoClaro = !transparente && !!corBorda && luminancia(...corBorda) >= 0.7;

  // 3) caixa do conteúdo
  const usaFundo = !transparente && !!fundoSolido && recortarFundoSolido;
  const ehConteudo = (i: number) => {
    if (transparente) return d[i + 3] > alfaConteudo;
    if (!fundoSolido) return true;
    return Math.max(Math.abs(d[i] - fundoSolido[0]), Math.abs(d[i + 1] - fundoSolido[1]), Math.abs(d[i + 2] - fundoSolido[2])) > LIMIAR.ruidoFundo;
  };
  let recorte: Caixa | null = null;
  if (transparente || usaFundo) {
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (ehConteudo((y * w + x) * 4)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 >= x0 && y1 >= y0) {
      const cw = x1 - x0 + 1;
      const ch = y1 - y0 + 1;
      const m = transparente ? Math.max(1, Math.round(Math.max(cw, ch) * LIMIAR.respiroTransp)) : Math.round(ch * LIMIAR.respiroFundo);
      const bx = Math.max(0, x0 - m);
      const by = Math.max(0, y0 - m);
      const bw = Math.min(w, x1 + 1 + m) - bx;
      const bh = Math.min(h, y1 + 1 + m) - by;
      if (bw < w * (1 - LIMIAR.recorteMin) || bh < h * (1 - LIMIAR.recorteMin)) recorte = { x: bx, y: by, w: bw, h: bh };
    }
  }
  const area = recorte ?? { x: 0, y: 0, w, h };

  // 4) contraste da silhueta contra as superfícies dos temas
  const transparenteEm = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || d[(y * w + x) * 4 + 3] <= LIMIAR.alfa;
  const naSilhueta = (x: number, y: number) => {
    if (!transparente) return true;
    for (let r = 1; r <= 2; r++)
      if (transparenteEm(x - r, y) || transparenteEm(x + r, y) || transparenteEm(x, y - r) || transparenteEm(x, y + r)) return true;
    return transparenteEm(x - 1, y - 1) || transparenteEm(x + 1, y - 1) || transparenteEm(x - 1, y + 1) || transparenteEm(x + 1, y + 1);
  };
  let peso = 0;
  let someC = 0;
  let someE = 0;
  const cC: [number, number][] = [];
  const cE: [number, number][] = [];
  for (let y = area.y; y < area.y + area.h; y++)
    for (let x = area.x; x < area.x + area.w; x++) {
      const i = (y * w + x) * 4;
      if (transparente ? d[i + 3] <= LIMIAR.alfa : !ehConteudo(i)) continue;
      if (!naSilhueta(x, y)) continue;
      const a = transparente ? d[i + 3] / 255 : 1;
      if (a < 0.12) continue;
      const l = luminancia(d[i], d[i + 1], d[i + 2]);
      const kc = contraste(l, L_CLARA);
      const ke = contraste(l, L_ESCURA);
      peso += a;
      if (kc < LIMIAR.some) someC += a;
      if (ke < LIMIAR.some) someE += a;
      cC.push([kc, a]);
      cE.push([ke, a]);
    }
  const someNoClaro = peso ? someC / peso : 0;
  const someNoEscuro = peso ? someE / peso : 0;
  const contrasteClaro = mediana(cC);
  const contrasteEscuro = mediana(cE);

  // 5) placa por tema (imagem opaca: traz o próprio fundo, sem placa)
  let placaClaro: PlacaLogo = 'nenhuma';
  let placaEscuro: PlacaLogo = 'nenhuma';
  if (transparente && peso > 0) {
    const precisaNoClaro = someNoClaro >= LIMIAR.fracaoSome || contrasteClaro < LIMIAR.mediana;
    const precisaNoEscuro = someNoEscuro >= LIMIAR.fracaoSome || contrasteEscuro < LIMIAR.mediana;
    if (precisaNoClaro) placaClaro = 'escura';
    if (precisaNoEscuro) placaEscuro = 'clara';
    // some nos dois (preto + branco, sem cor): a placa que esconde menos, nos dois temas — na clara somem as partes
    // claras (someNoClaro), na escura as escuras (someNoEscuro)
    if (precisaNoClaro && precisaNoEscuro) {
      const melhor: PlacaLogo = someNoClaro <= someNoEscuro ? 'clara' : 'escura';
      placaClaro = melhor;
      placaEscuro = melhor;
    }
  }
  const tom: AnalisePixels['tom'] =
    someNoClaro > 0.5 ? 'clara' : someNoEscuro > 0.5 ? 'escura' : someNoClaro >= LIMIAR.fracaoSome && someNoEscuro >= LIMIAR.fracaoSome ? 'mista' : 'colorida';

  return { transparente, fundoSolido, fundoClaro, recorte, someNoClaro, someNoEscuro, contrasteClaro, contrasteEscuro, tom, placaClaro, placaEscuro, proporcao: area.w / area.h };
}

/** Escolha do "Fundo da logo" no painel: 'auto' = a medida; as outras valem nos dois temas (origem 'manual'). */
export type FundoEscolhido = 'auto' | PlacaLogo;

/** Proporção dentro do contrato (0,2–12), com 3 casas. */
export const proporcaoValida = (p: number) => Math.round(Math.min(12, Math.max(0.2, Number.isFinite(p) && p > 0 ? p : 1)) * 1000) / 1000;

/**
 * Ajuste gravado no anúncio a partir da análise. `proporcao`: a da imagem GRAVADA (largura ÷ altura do arquivo final;
 * ausente = a da análise). Imagem opaca grava `comFundo`.
 */
export function ajusteDe(a: Pick<AnalisePixels, 'transparente' | 'placaClaro' | 'placaEscuro' | 'proporcao'>, fundo: FundoEscolhido = 'auto', proporcao?: number): AjusteImagem {
  const base: AjusteImagem = {
    proporcao: proporcaoValida(proporcao ?? a.proporcao),
    placaClaro: fundo === 'auto' ? a.placaClaro : fundo,
    placaEscuro: fundo === 'auto' ? a.placaEscuro : fundo,
    origem: fundo === 'auto' ? 'auto' : 'manual',
  };
  if (!a.transparente) base.comFundo = true;
  return base;
}

/** O mesmo ajuste com outra escolha de fundo (o painel troca o Segmented sem medir de novo). */
export function comFundoEscolhido(ajuste: AjusteImagem, auto: Pick<AjusteImagem, 'placaClaro' | 'placaEscuro'>, fundo: FundoEscolhido): AjusteImagem {
  const out: AjusteImagem = {
    proporcao: ajuste.proporcao,
    placaClaro: fundo === 'auto' ? auto.placaClaro : fundo,
    placaEscuro: fundo === 'auto' ? auto.placaEscuro : fundo,
    origem: fundo === 'auto' ? 'auto' : 'manual',
  };
  if (ajuste.comFundo) out.comFundo = true;
  return out;
}

/** Tentativas de codificação (tipo, qualidade) de uma PEÇA: com transparência nunca JPEG; sem WebP no canvas (Safari),
 *  sem as tentativas em WebP. */
export function escolhaCodificacao(temAlfa: boolean, suportaWebp: boolean): readonly (readonly [string, number | undefined])[] {
  const lista: (readonly [string, number | undefined])[] = temAlfa
    ? [
        ['image/webp', 0.9],
        ['image/png', undefined],
      ]
    : [
        ['image/webp', 0.85],
        ['image/jpeg', 0.85],
        ['image/webp', 0.7],
        ['image/jpeg', 0.72],
      ];
  return lista.filter(([t]) => suportaWebp || t !== 'image/webp');
}

/** Lados maiores tentados na gravação. */
export const LADOS_LOGO = [800, 640, 512, 384] as const;
/** peça com transparência: 560, 512, 448 e 384 px por último — o PNG (o Safari não gera WebP no canvas) de uma foto
 *  recortada com ruído só cabe em 400 KB perto de 450 px (P04: 512 px = 425 KB; 448 px ≈ 330 KB) */
export const LADOS_PECA_ALFA = [1600, 1280, 1024, 800, 640, 560, 512, 448, 384] as const;
/** abaixo deste lado maior, a peça gravada ganha o aviso de pouca nitidez */
export const LADO_PECA_NITIDA = 640;
export const LADOS_PECA = [1600, 1280, 1024, 800] as const;

/** Tamanho aproximado do arquivo de um data URI (KB). */
export const kbDeUri = (uri: string) => Math.max(1, Math.round(((uri.length - uri.indexOf(',') - 1) * 0.75) / 1024));

/** "512 × 512 px → 431 × 134 px (margens vazias cortadas) · 29 KB" (números formatados; quem exibe usa `.num`). */
export function linhaDimensoes(p: { original: { largura: number; altura: number }; largura: number; altura: number; recortada: boolean; uri: string }): string {
  const dim = (w: number, h: number) => `${fmtInt(w)} × ${fmtInt(h)} px`;
  const kb = `${fmtInt(kbDeUri(p.uri))} KB`;
  return p.recortada ? `${dim(p.original.largura, p.original.altura)} → ${dim(p.largura, p.altura)} (margens vazias cortadas) · ${kb}` : `${dim(p.largura, p.altura)} · ${kb}`;
}

// ---- navegador ---------------------------------------------------------------------------------------------

/** Imagem de origem já lida (o painel guarda o data URI ORIGINAL para desfazer e reprocessar sem ler de novo). */
export interface FonteImagem {
  uri: string;
  /** tipo MIME do arquivo (`File.type` / `Blob.type`) — nunca deduzido do prefixo do src */
  tipo: string;
}

/** Lê um arquivo (ou o Blob de um `fetch`) como data URI, guardando o tipo. */
export function lerFonte(f: Blob): Promise<FonteImagem> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok({ uri: String(r.result), tipo: f.type });
    r.onerror = () => erro(r.error ?? new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(f);
  });
}

function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('Imagem inválida ou corrompida.'));
    img.src = src;
  });
}

const ehSvg = (f: FonteImagem) => /svg/i.test(f.tipo);

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Este navegador não conseguiu desenhar a imagem.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return [c, ctx];
}

/** Gera WebP no canvas? (Safari não gera: devolve PNG.) */
export function navegadorGeraWebp(): boolean {
  try {
    const [c] = canvas(2, 2);
    return c.toDataURL('image/webp', 0.9).startsWith('data:image/webp');
  } catch {
    return false;
  }
}

interface Desenho {
  img: HTMLImageElement;
  /** tamanho natural do arquivo */
  nw: number;
  nh: number;
  /** canvas de análise (lado maior ≤ 1024; SVG ampliado até 1024) */
  c: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** escala análise ÷ arquivo */
  k: number;
  svg: boolean;
}

async function desenhar(f: FonteImagem): Promise<Desenho> {
  const img = await carregar(f.uri);
  const svg = ehSvg(f);
  // SVG sem tamanho próprio (só viewBox) pode vir 0 × 0
  const nw = img.naturalWidth || 512;
  const nh = img.naturalHeight || 512;
  const k = svg ? 1024 / Math.max(nw, nh) : Math.min(1, 1024 / Math.max(nw, nh));
  const W = Math.max(1, Math.round(nw * k));
  const H = Math.max(1, Math.round(nh * k));
  const [c, ctx] = canvas(W, H);
  // imagem animada: o canvas desenha um quadro só (a gravação sai parada)
  ctx.drawImage(img, 0, 0, W, H);
  return { img, nw, nh, c, ctx, k, svg };
}

/** Desenha o recorte (coordenadas da análise) na resolução do arquivo, com o lado maior ≤ `lado`. */
function recortarEm(dz: Desenho, r: Caixa, lado: number): HTMLCanvasElement {
  // SVG: a fonte é o próprio canvas de análise (o vetor já desenhado em 1024); raster: o arquivo, na resolução original
  const fonte: CanvasImageSource = dz.svg ? dz.c : dz.img;
  const s = dz.svg ? 1 : 1 / dz.k;
  const sx = r.x * s;
  const sy = r.y * s;
  const sw = r.w * s;
  const sh = r.h * s;
  const esc = Math.min(1, lado / Math.max(sw, sh));
  const ow = Math.max(1, Math.round(sw * esc));
  const oh = Math.max(1, Math.round(sh * esc));
  const [o, octx] = canvas(ow, oh);
  octx.drawImage(fonte, sx, sy, sw, sh, 0, 0, ow, oh);
  return o;
}

/** Erro com texto para o painel. */
export class ErroImagem extends Error {}

export interface ImagemPreparadaV2 {
  /** data URI gravado */
  uri: string;
  ajuste: AjusteImagem | null;
  /** null = medição falhou (canvas bloqueado): o arquivo foi mantido como veio */
  analise: AnalisePixels | null;
  largura: number;
  altura: number;
  original: { largura: number; altura: number };
  /** margens vazias cortadas */
  recortada: boolean;
  /** a imagem era animada (gravada parada) */
  animada: boolean;
  /** avisos para o painel (animação removida, medição que falhou…) */
  avisos: string[];
}

export interface LogoPreparada extends ImagemPreparadaV2 {
  ajuste: AjusteImagem;
}

export const AVISO_ANIMACAO = 'Animação removida: o Sintonia só exibe imagens paradas.';
export const AVISO_SEM_MEDIDA = 'Não foi possível medir as cores desta imagem: confira a prévia e escolha o fundo.';

const TIPOS_LOGO = /^image\/(png|jpeg|webp|svg\+xml)$/;
const TIPOS_PECA = /^image\/(png|jpeg|webp)$/;

/**
 * Logo (E3): PNG, JPEG, WebP ou SVG. Analisa num canvas de até 1024 px (SVG ampliado até 1024), recorta as margens
 * vazias na resolução ORIGINAL e grava PNG com lado maior de 800, 640, 512 ou 384 px até caber em 150 KB; opaca que não
 * couber vai em JPEG 0,92 ou 0,85; nunca JPEG com transparência. SVG também vira PNG (não anima e o servidor de imagens
 * lê). `recortar: false` = sem cortar margens (o desfazer do painel). `fundo`: a escolha do painel ('auto' = a medida).
 * Canvas bloqueado (Safari): mantém o arquivo se for parado e couber, com placa clara nos dois temas e um aviso.
 */
export async function prepararLogoV2(fonte: Blob | FonteImagem, { recortar = true, fundo = 'auto' as FundoEscolhido } = {}): Promise<LogoPreparada> {
  const f = fonte instanceof Blob ? await lerFonte(fonte) : fonte;
  if (!TIPOS_LOGO.test(f.tipo)) throw new ErroImagem('Use PNG, JPEG, WebP ou SVG.');
  const limite = ANUNCIO_LIMITES.logoDataUri;
  const animada = imagemAnimada(f.uri);
  const avisos = animada ? [AVISO_ANIMACAO] : [];
  const dz = await desenhar(f);
  const W = dz.c.width;
  const H = dz.c.height;
  let analise: AnalisePixels;
  try {
    analise = analisarPixels(dz.ctx.getImageData(0, 0, W, H).data, W, H, { recortarFundoSolido: true });
  } catch {
    // canvas contaminado (Safari com alguns SVG): sem medida, mantém o arquivo como veio se for parado e couber
    if (animada || f.uri.length > limite) throw new ErroImagem('Não foi possível ler esta imagem neste aparelho. Envie um PNG parado de até 150 KB.');
    const proporcao = proporcaoValida(dz.nw / dz.nh);
    const auto = { placaClaro: 'clara' as const, placaEscuro: 'clara' as const };
    const ajuste: AjusteImagem = fundo === 'auto' ? { proporcao, ...auto, origem: 'auto' } : { proporcao, placaClaro: fundo, placaEscuro: fundo, origem: 'manual' };
    return { uri: f.uri, ajuste, analise: null, largura: dz.nw, altura: dz.nh, original: { largura: dz.nw, altura: dz.nh }, recortada: false, animada, avisos: [AVISO_SEM_MEDIDA] };
  }
  const recortada = recortar && !!analise.recorte;
  const r = recortada && analise.recorte ? analise.recorte : { x: 0, y: 0, w: W, h: H };
  if (!recortada) analise = { ...analise, proporcao: W / H };
  // cada tentativa num tamanho diferente (imagem pequena: 800, 640 e 512 dariam o mesmo arquivo)
  const tentar = (tipos: readonly (readonly [string, number | undefined])[]) => {
    const vistos = new Set<string>();
    for (const lado of LADOS_LOGO) {
      const o = recortarEm(dz, r, lado);
      const chave = `${o.width}x${o.height}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      for (const [tipo, q] of tipos) {
        const uri = o.toDataURL(tipo, q);
        if (uri.startsWith(`data:${tipo};base64,`) && uri.length <= limite) return { uri, o };
      }
    }
    return null;
  };
  const gravada =
    tentar([['image/png', undefined]]) ??
    (analise.transparente
      ? null
      : tentar([
          ['image/jpeg', 0.92],
          ['image/jpeg', 0.85],
        ]));
  if (!gravada) throw new ErroImagem('Não foi possível deixar a logo com até 150 KB. Envie uma versão mais simples (PNG com fundo transparente).');
  const { uri, o } = gravada;
  if (o.width / o.height > 12 || o.width / o.height < 0.2) avisos.push('A logo é muito comprida para o espaço: prefira uma versão mais compacta da marca.');
  return {
    uri,
    ajuste: ajusteDe(analise, fundo, o.width / o.height),
    analise,
    largura: o.width,
    altura: o.height,
    original: { largura: dz.nw, altura: dz.nh },
    recortada,
    animada,
    avisos,
  };
}

/** Algum pixel com alfa < 250 numa amostra de até 256 × 256 (a imagem inteira, reduzida). */
function temTransparencia(dz: Desenho): boolean | null {
  const k = Math.min(1, 256 / Math.max(dz.c.width, dz.c.height));
  const w = Math.max(1, Math.round(dz.c.width * k));
  const h = Math.max(1, Math.round(dz.c.height * k));
  try {
    const [c, ctx] = canvas(w, h);
    ctx.drawImage(dz.c, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  } catch {
    return null;
  }
}

/**
 * Peça (E5): PNG, JPEG ou WebP, exibida inteira. Sempre redesenha no canvas (peça animada vira parada).
 *  - com transparência: recorta só margens 100% transparentes (respiro de 2%), nunca fundo de cor; WebP 0,9 (se o
 *    navegador gerar) ou PNG; lado de 1600, 1280, 1024, 800 ou 640 px até caber em 400 KB; nunca JPEG;
 *  - sem transparência: WebP 0,85, JPEG 0,85, WebP 0,7, JPEG 0,72; lado de 1600, 1280, 1024 ou 800 px.
 * Grava `imagemAjuste` pela mesma análise (sem recortar fundo sólido); peça opaca grava `comFundo`.
 */
export async function prepararPecaV2(fonte: Blob | FonteImagem): Promise<ImagemPreparadaV2> {
  const f = fonte instanceof Blob ? await lerFonte(fonte) : fonte;
  if (!TIPOS_PECA.test(f.tipo)) throw new ErroImagem('Use PNG, JPEG ou WebP (a peça não aceita SVG).');
  const limite = ANUNCIO_LIMITES.imagemDataUri;
  const animada = imagemAnimada(f.uri);
  const avisos = animada ? [AVISO_ANIMACAO] : [];
  const dz = await desenhar(f);
  const W = dz.c.width;
  const H = dz.c.height;
  const alfa = temTransparencia(dz);
  let analise: AnalisePixels | null = null;
  try {
    analise = analisarPixels(dz.ctx.getImageData(0, 0, W, H).data, W, H, { recortarFundoSolido: false, alfaConteudo: 0 });
  } catch {
    analise = null;
  }
  if (alfa === null || !analise) {
    // canvas contaminado: mantém o arquivo se for parado e couber (sem ajuste: o site desenha como antes)
    if (animada || f.uri.length > limite) throw new ErroImagem('Não foi possível ler esta imagem neste aparelho. Envie um JPEG ou PNG parado de até 400 KB.');
    return { uri: f.uri, ajuste: null, analise: null, largura: dz.nw, altura: dz.nh, original: { largura: dz.nw, altura: dz.nh }, recortada: false, animada, avisos: [AVISO_SEM_MEDIDA] };
  }
  const recortada = alfa && analise.transparente && !!analise.recorte;
  const r = recortada && analise.recorte ? analise.recorte : { x: 0, y: 0, w: W, h: H };
  if (!recortada) analise = { ...analise, proporcao: W / H };
  const tentativas = escolhaCodificacao(alfa, navegadorGeraWebp());
  for (const lado of alfa ? LADOS_PECA_ALFA : LADOS_PECA) {
    const o = recortarEm(dz, r, lado);
    for (const [tipo, q] of tentativas) {
      const uri = o.toDataURL(tipo, q);
      if (!uri.startsWith(`data:${tipo};base64,`) || uri.length > limite) continue;
      // peça com transparência que o canvas "achatou" (alfa perdido): o ajuste segue o arquivo gravado
      const ajuste = ajusteDe(alfa ? analise : { ...analise, transparente: false }, 'auto', o.width / o.height);
      if (Math.max(o.width, o.height) < LADO_PECA_NITIDA && Math.max(dz.nw, dz.nh) > Math.max(o.width, o.height))
        avisos.push(
          `A peça ficou com ${fmtInt(o.width)} × ${fmtInt(o.height)} px para caber em 400 KB (a transparência pesa no arquivo): para mais nitidez, envie uma versão sem transparência (JPEG) ou mais leve.`,
        );
      return { uri, ajuste, analise, largura: o.width, altura: o.height, original: { largura: dz.nw, altura: dz.nh }, recortada, animada, avisos };
    }
  }
  throw new ErroImagem(
    alfa
      ? 'A peça tem transparência e ficou grande: reduza para até 1200 px ou envie uma versão sem transparência (JPEG).'
      : 'Não foi possível deixar a peça com até 400 KB. Use uma imagem menor.',
  );
}
