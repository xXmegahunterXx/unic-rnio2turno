/**
 * Imagens de link preview (Open Graph, 1200×630) com satori (layout → SVG) + resvg (SVG → PNG).
 *
 *  - /api/og/apuracao.png?race=pres[&uf=sp][&formato=x|feed|story]: placar atual — layout em og-placar.ts (retratos
 *    grandes, números gigantes, faixa "SIMULAÇÃO · dados fictícios" quando simulado; antes das 17h, o 1º turno).
 *  - /api/og/teste.png: cartão do Teste Cego (sem nenhum dado de preferência — LGPD/sem enquetes).
 *  - Fotos oficiais do TSE: ver og-placar.ts (placar) e og-cartoes.ts (demais cartões). Quem chama só passa fotos
 *    quando NÃO anonimizado, com número real e com a foto de todos os finalistas; senão, o monograma (iniciais).
 *
 * Fontes (satori não lê woff2): TTF estáticos de Inter e Bricolage Grotesque em src/server/assets/fonts
 * (Google Fonts, SIL Open Font License 1.1 — ver OFL-*.txt). Reserva: JetBrains Mono .woff do @fontsource.
 * Cores: as mesmas dos tokens do app (src/app/styles.css, tema escuro), sempre a que vem dos dados (`Candidate.cor`):
 * Presidente com as cores de identificação (Lula vermelho, Flávio Bolsonaro azul — CORES_IDENTIDADE); governador e
 * simulação com nomes ocultos com os slots neutros (A turquesa = menor número; B âmbar).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import { pngDeRgba } from './png';
import type { CorCandidato } from '../shared/types';

export const OG_W = 1200;
export const OG_H = 630;

/** Paleta do tema escuro (espelho dos tokens de src/app/styles.css). */
export const C = {
  bg: 'rgb(9,9,15)',
  surface: 'rgb(17,17,26)',
  surface3: 'rgb(34,34,50)',
  fg: 'rgb(244,244,250)',
  muted: 'rgb(168,168,190)',
  subtle: 'rgb(112,112,136)',
  line: 'rgba(255,255,255,0.10)',
  brand: 'rgb(124,92,255)',
  brand2: 'rgb(196,168,255)',
  a: 'rgb(25,194,176)',
  aInk: 'rgb(4,40,36)',
  b: 'rgb(245,165,36)',
  bInk: 'rgb(48,28,0)',
  vermelho: 'rgb(239,68,68)',
  vermelhoInk: 'rgb(40,6,6)',
  azul: 'rgb(44,140,238)',
  azulInk: 'rgb(4,18,48)',
  outros: 'rgb(139,139,163)',
  pending: 'rgb(58,58,80)',
  /** placas atrás da logo do anunciante (tokens `--placa-clara`/`--placa-escura` do app, iguais nos dois temas) */
  placaClara: 'rgb(255,255,255)',
  placaEscura: 'rgb(17,17,26)',
};

/** Cor (rgb) do candidato a partir de `Candidate.cor` — a que vem dos dados, nunca deduzida da posição. */
export function corOg(cor: CorCandidato | string | undefined): string {
  switch (cor) {
    case 'a':
      return C.a;
    case 'b':
      return C.b;
    case 'vermelho':
      return C.vermelho;
    case 'azul':
      return C.azul;
    default:
      return C.outros;
  }
}

/** Tinta sobre o preenchimento da cor do candidato (monogramas, rótulos de UF). */
export function tintaOg(cor: CorCandidato | string | undefined): string {
  switch (cor) {
    case 'a':
      return C.aInk;
    case 'b':
      return C.bInk;
    case 'vermelho':
      return C.vermelhoInk;
    case 'azul':
      return C.azulInk;
    default:
      return C.bg;
  }
}

// ---------------------------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------------------------

type FontOpt = { name: string; data: Buffer; weight: 400 | 500 | 600 | 700 | 800; style: 'normal' };

let fontesCache: FontOpt[] | null = null;

function dirsFontes(): string[] {
  const aqui = dirname(fileURLToPath(import.meta.url));
  return [
    process.env.FONTS_DIR ?? '',
    join(aqui, 'assets/fonts'), // dev (src/server) e produção (dist-server/assets, copiado no build)
    join(aqui, '../src/server/assets/fonts'),
    join(process.cwd(), 'src/server/assets/fonts'),
  ].filter(Boolean);
}

export function carregarFontes(): FontOpt[] {
  if (fontesCache) return fontesCache;
  const dir = dirsFontes().find((d) => existsSync(join(d, 'Inter-Regular.ttf')));
  const out: FontOpt[] = [];
  if (dir) {
    const add = (name: string, arq: string, weight: FontOpt['weight']) => {
      const p = join(dir, arq);
      if (existsSync(p)) out.push({ name, data: readFileSync(p), weight, style: 'normal' });
    };
    add('Inter', 'Inter-Regular.ttf', 400);
    add('Inter', 'Inter-SemiBold.ttf', 600);
    add('Inter', 'Inter-Bold.ttf', 700);
    add('Bricolage', 'BricolageGrotesque-Bold.ttf', 700);
    add('Bricolage', 'BricolageGrotesque-ExtraBold.ttf', 800);
  }
  // JetBrains Mono (woff do @fontsource, dependência de execução): fonte 'Mono' do boletim de urna e reserva das
  // demais quando os TTF não estão disponíveis
  const mono: { w: 400 | 700; data: Buffer }[] = [];
  try {
    const req = createRequire(import.meta.url);
    const base = dirname(req.resolve('@fontsource/jetbrains-mono/package.json'));
    for (const [w, arq] of [
      [400, 'jetbrains-mono-latin-400-normal.woff'],
      [700, 'jetbrains-mono-latin-700-normal.woff'],
    ] as const) {
      mono.push({ w, data: readFileSync(join(base, 'files', arq)) });
    }
  } catch {
    /* sem a Mono: o boletim cai na Inter */
  }
  if (!out.length) {
    for (const { w, data } of mono) {
      out.push({ name: 'Inter', data, weight: w, style: 'normal' }, { name: 'Bricolage', data, weight: w, style: 'normal' });
    }
  }
  for (const { w, data } of mono) out.push({ name: 'Mono', data, weight: w, style: 'normal' });
  fontesCache = out;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Mini "JSX" para o satori
// ---------------------------------------------------------------------------------------------

export type Estilo = Record<string, string | number>;
export interface No {
  type: string;
  props: { style?: Estilo; children?: unknown; [k: string]: unknown };
}

export function h(type: string, style: Estilo, ...children: (No | string | null | false | undefined)[]): No {
  const filhos = children.filter((c) => c !== null && c !== false && c !== undefined) as (No | string)[];
  const s = type === 'div' ? { display: 'flex', ...style } : style;
  return { type, props: { style: s, children: filhos.length === 1 ? filhos[0] : filhos } };
}

const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#c4a8ff"/></linearGradient></defs>' +
  '<rect width="64" height="64" rx="16" fill="#222232"/><path d="M14 38c6-14 12-14 18 0s12 14 18 0" fill="none" ' +
  'stroke="url(#g)" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="22" r="4" fill="#fff"/></svg>';
export const LOGO_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString('base64')}`;

export function marca(): No {
  return h(
    'div',
    { alignItems: 'center', gap: 16 },
    { type: 'img', props: { src: LOGO_URI, width: 52, height: 52, style: { width: 52, height: 52 } } },
    h('div', { fontFamily: 'Bricolage', fontWeight: 700, fontSize: 36, color: C.fg, letterSpacing: -1 }, 'Sintonia'),
  );
}

export function pill(texto: string, bg: string, fg: string, borda?: string): No {
  return h(
    'div',
    {
      alignItems: 'center',
      padding: '10px 20px',
      borderRadius: 999,
      background: bg,
      color: fg,
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: 20,
      letterSpacing: 1.5,
      ...(borda ? { border: `2px solid ${borda}` } : {}),
    },
    texto,
  );
}

export function fundo(...filhos: (No | null)[]): No {
  return h(
    'div',
    {
      width: OG_W,
      height: OG_H,
      flexDirection: 'column',
      background: C.bg,
      backgroundImage: 'radial-gradient(circle at 18% 0%, rgba(124,92,255,0.34) 0%, rgba(124,92,255,0.08) 38%, rgba(9,9,15,0) 70%)',
      color: C.fg,
      fontFamily: 'Inter',
      position: 'relative',
    },
    ...filhos,
  );
}

/** Corpo do nome por comprimento (nomes de urna longos, ex.: "Professora Maria do Carmo"). */
export const tamNome = (nome: string) => (nome.length <= 16 ? 38 : nome.length <= 21 ? 34 : 30);

export const iniciais = (nome: string) => {
  const p = nome
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w))
    .filter((w) => !/^(de|da|do|das|dos)$/i.test(w));
  if (!p.length) return '?';
  return (p.length === 1 ? p[0][0] : p[0][0] + p[p.length - 1][0]).toUpperCase();
};

// ---------------------------------------------------------------------------------------------
// Placar: og-placar.ts (retratos grandes; formatos og/x/feed/story)
// ---------------------------------------------------------------------------------------------

export function layoutTeste(): No {
  const cartao = (rot: number, x: number, y: number, cor: string, rotulo: string) =>
    h(
      'div',
      {
        position: 'absolute',
        left: x,
        top: y,
        width: 250,
        height: 300,
        borderRadius: 28,
        background: C.surface3,
        border: `2px solid ${C.line}`,
        transform: `rotate(${rot}deg)`,
        flexDirection: 'column',
        padding: 28,
      },
      h('div', { width: 56, height: 56, borderRadius: 28, background: cor, alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 30, color: C.bg }, '?'),
      h('div', { marginTop: 28, width: 180, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.16)' }),
      h('div', { marginTop: 14, width: 150, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.10)' }),
      h('div', { marginTop: 14, width: 165, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.10)' }),
      h('div', { flexGrow: 1 }),
      h('div', { fontSize: 20, fontWeight: 700, color: C.muted, letterSpacing: 2 }, rotulo),
    );
  return fundo(
    h(
      'div',
      { flexDirection: 'column', padding: '56px 64px', width: 640, height: OG_H },
      marca(),
      h('div', { fontSize: 22, fontWeight: 600, color: C.brand2, letterSpacing: 3, marginTop: 64 }, 'ELEIÇÕES 2026 · 2º TURNO'),
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 88, color: C.fg, letterSpacing: -3, lineHeight: 1, marginTop: 10 }, 'Teste Cego'),
      h(
        'div',
        { fontSize: 30, color: C.muted, marginTop: 24, lineHeight: 1.35, maxWidth: 540 },
        'Concorde ou discorde de ideias sem saber de quem são. Suas respostas ficam só no seu aparelho.',
      ),
    ),
    cartao(-8, 690, 150, C.brand, 'IDEIA 1'),
    cartao(7, 900, 170, C.brand2, 'IDEIA 2'),
  );
}

// ---------------------------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------------------------

/** PNG do layout. Padrão 1200×630 (prévia de link); os cartões do placar também saem em 1200×675, 1080×1350 e 1080×1920. */
export async function renderPng(no: No, w: number = OG_W, alt: number = OG_H): Promise<Buffer> {
  const svg = await satori(no as unknown as Parameters<typeof satori>[0], { width: w, height: alt, fonts: carregarFontes() });
  const img = await renderAsync(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: false } });
  // PNG RGB próprio (sem alfa, filtro Sub, deflate 9 fora da thread principal): ~30% menor que o do resvg
  if (img.width === w && img.height === alt && img.pixels.length === w * alt * 4) return pngDeRgba(img.pixels, w, alt);
  return Buffer.from(img.asPng());
}
