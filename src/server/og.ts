/**
 * Imagens de link preview (Open Graph, 1200×630) com satori (layout → SVG) + resvg (SVG → PNG).
 *
 *  - /api/og/apuracao.png?race=pres[&uf=sp]: placar atual (nomes, % válidos, % de seções, horário),
 *    faixa "SIMULAÇÃO · dados fictícios" quando simulado; antes das 17h, o 1º turno como referência.
 *  - /api/og/teste.png: cartão do Teste Cego (sem nenhum dado de preferência — LGPD/sem enquetes).
 *  - Fotos oficiais do TSE (opcionais, `fotos`): mesmo tamanho e tratamento para os dois (retrato 3:4, sem
 *    recorte nem filtro, com o contorno da cor do slot). Quem chama só passa fotos quando NÃO anonimizado e
 *    quando há foto dos dois finalistas; senão, o monograma (iniciais) de sempre.
 *
 * Fontes (satori não lê woff2): TTF estáticos de Inter e Bricolage Grotesque em src/server/assets/fonts
 * (Google Fonts, SIL Open Font License 1.1 — ver OFL-*.txt). Reserva: JetBrains Mono .woff do @fontsource.
 * Cores: as mesmas dos tokens do app (src/app/styles.css, tema escuro), por slot neutro — nunca de partido.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import { pngDeRgba } from './png';
import { pctTotalizadas, pctValidos } from '../shared/calc';
import { UF_NOMES } from '../shared/constants';
import { fmtHora, fmtInt, fmtPct } from '../shared/format';
import type { Candidate, Race, Summary, UF } from '../shared/types';

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
  outros: 'rgb(139,139,163)',
  pending: 'rgb(58,58,80)',
};

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
// Placar
// ---------------------------------------------------------------------------------------------

export interface OgPlacarInput {
  race: Race;
  uf?: UF;
  resumo: Summary;
  simulacao: boolean;
  /** Relógio exibido ("Atualizado às …"): simNow na simulação, hora oficial/atual no TSE. */
  horario: number;
  /** true antes do início (nenhuma seção totalizada numa corrida de 2º turno). */
  pre: boolean;
  /**
   * Fotos oficiais (data URI JPEG/PNG) na ordem de `race.candidatos`. Só usadas se TODOS os finalistas
   * tiverem foto (tratamento igual); ausente/incompleto → monograma.
   */
  fotos?: (string | null | undefined)[];
  /** Título no lugar do da corrida (ex.: o nome do município). */
  titulo?: string;
  /** Linha acima do título no lugar de "APURAÇÃO · Nº TURNO 2026". */
  kicker?: string;
  /** Recorte local (município): nunca mostra "ELEITO" (o resumo local só diz quem venceu ali). */
  local?: boolean;
}

/** Índices dos finalistas (candidatos não agregados) na ordem da urna. */
export const finalistas = (race: Race) => race.candidatos.map((c, i) => (c.agregado ? -1 : i)).filter((i) => i >= 0);

/** Fotos utilizáveis para o placar (todas as dos finalistas) ou null. */
export function fotosDoPlacar(inp: Pick<OgPlacarInput, 'race' | 'fotos'>): Map<number, string> | null {
  if (!inp.fotos) return null;
  const idx = finalistas(inp.race).slice(0, 2);
  if (idx.length < 2) return null;
  const m = new Map<number, string>();
  for (const i of idx) {
    const f = inp.fotos[i];
    if (typeof f !== 'string' || !/^data:image\/(jpeg|png);base64,/.test(f)) return null;
    m.set(i, f);
  }
  return m;
}

const FOTO_W = 60;
const FOTO_H = 80;

function colunaCandidato(c: Candidate, idx: number, inp: OgPlacarInput, alinhar: 'left' | 'right', foto: string | null): No {
  const cor = c.cor === 'b' ? C.b : C.a;
  const ink = c.cor === 'b' ? C.bInk : C.aInk;
  const lado = alinhar === 'right' ? 'flex-end' : 'flex-start';
  const r = inp.resumo;
  const temVotos = r.votos.reduce((a, b) => a + b, 0) > 0;
  const pct = temVotos ? pctValidos(r, idx) : null;
  // "eleito" só no 2º turno e na abrangência da própria disputa (no recorte de uma UF, `eleito` do resumo
  // significa apenas "vencedor ali"; no 1º turno ninguém foi eleito para estes cargos)
  const escopoDaDisputa = !inp.local && (!inp.uf || inp.race.abrangencia === inp.uf);
  const eleito = r.eleito === idx && inp.race.turno === 2 && escopoDaDisputa;
  const retrato: No = foto
    ? h(
        'div',
        { width: FOTO_W + 6, height: FOTO_H + 6, borderRadius: 14, background: cor, alignItems: 'center', justifyContent: 'center' },
        { type: 'img', props: { src: foto, width: FOTO_W, height: FOTO_H, style: { width: FOTO_W, height: FOTO_H, borderRadius: 11, objectFit: 'cover' } } },
      )
    : h(
        'div',
        { width: 64, height: 64, borderRadius: 32, background: cor, color: ink, alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 26 },
        iniciais(c.nomeUrna),
      );
  const cabecalho = [
    retrato,
    h(
      'div',
      { flexDirection: 'column', alignItems: lado, maxWidth: 420 },
      h(
        'div',
        { fontFamily: 'Bricolage', fontWeight: 700, fontSize: tamNome(c.nomeUrna), color: C.fg, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 420 },
        c.nomeUrna,
      ),
      // 1º turno é resultado OFICIAL: com os nomes ocultos (simulação anônima) não mostra "Simulação · 1" (partido e
      // número fictícios da anonimização) num cartão de dado real
      h('div', { fontSize: 22, color: C.muted, marginTop: 4 }, inp.race.turno === 1 && c.partido === 'Simulação' ? 'nome oculto' : `${c.partido} · ${c.numero}`),
    ),
  ];
  if (alinhar === 'right') cabecalho.reverse();

  let corpo: No;
  if (inp.pre) {
    const t1 = c.primeiroTurno;
    corpo = h(
      'div',
      { flexDirection: 'column', alignItems: lado, marginTop: 20 },
      h('div', { fontSize: 20, color: C.muted, fontWeight: 600, letterSpacing: 2 }, 'NO 1º TURNO'),
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 72, color: cor, lineHeight: 1, marginTop: 6 }, t1 ? fmtPct(t1.pct) : '—'),
      h('div', { fontSize: 22, color: C.muted, marginTop: 8 }, t1 ? `${fmtInt(t1.votos)} votos` : ''),
    );
  } else {
    corpo = h(
      'div',
      { flexDirection: 'column', alignItems: lado, marginTop: 14 },
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 104, color: cor, lineHeight: 1, letterSpacing: -3 }, pct === null ? '—' : fmtPct(pct)),
      h(
        'div',
        { alignItems: 'center', gap: 12, marginTop: 6, height: 44 },
        h('div', { fontSize: 24, color: C.muted }, `${fmtInt(r.votos[idx] ?? 0)} votos`),
        eleito ? pill(r.status === 'encerrada' ? 'ELEITO' : 'MATEMATICAMENTE ELEITO', cor, ink) : null,
      ),
    );
  }
  return h(
    'div',
    { flexDirection: 'column', alignItems: lado, width: 520 },
    h('div', { alignItems: 'center', gap: 18, height: foto ? FOTO_H + 6 : 76 }, ...cabecalho),
    corpo,
  );
}

function barra(inp: OgPlacarInput, ia: number, ib: number): No {
  const r = inp.resumo;
  const va = r.votos[ia] ?? 0;
  const vb = r.votos[ib] ?? 0;
  const tot = va + vb;
  const W = OG_W - 128;
  if (inp.pre || tot === 0) {
    return h(
      'div',
      { width: W, height: 16, borderRadius: 8, background: C.pending, marginTop: 26 },
    );
  }
  const wa = Math.round(((W - 6) * va) / tot);
  return h(
    'div',
    { width: W, height: 16, marginTop: 26, position: 'relative' },
    h('div', { width: wa, height: 16, background: C.a, borderRadius: '8px 0 0 8px' }),
    h('div', { width: 6, height: 16 }),
    h('div', { width: W - 6 - wa, height: 16, background: C.b, borderRadius: '0 8px 8px 0' }),
    h('div', { position: 'absolute', left: W / 2 - 1, top: -7, width: 2, height: 30, background: 'rgba(244,244,250,0.85)' }),
  );
}

export function layoutPlacar(inp: OgPlacarInput): No {
  const { race, resumo: r } = inp;
  // finalistas: candidatos não agregados ("Outros" fica fora do placar), na ordem da urna
  const idx = finalistas(race);
  const [ia, ib] = [idx[0] ?? 0, idx[1] ?? 1];
  const fotos = fotosDoPlacar(inp);
  const titulo =
    inp.titulo ??
    (race.cargo === 'Presidente'
      ? inp.uf
        ? `Presidente · ${UF_NOMES[inp.uf]}`
        : 'Presidente'
      : race.titulo);
  const kicker = inp.kicker ?? `APURAÇÃO · ${race.turno}º TURNO 2026`;
  const pctSec = pctTotalizadas(r);

  let selo: No;
  if (inp.simulacao) selo = pill('SIMULAÇÃO · DADOS FICTÍCIOS', C.brand, '#ffffff');
  else if (inp.pre) selo = pill('25/10 · A PARTIR DAS 17H', 'rgba(255,255,255,0.06)', C.fg, C.line);
  else if (race.turno === 1) selo = pill('RESULTADO OFICIAL · TSE', 'rgba(255,255,255,0.06)', C.fg, C.line);
  else if (r.status === 'encerrada') selo = pill('APURAÇÃO ENCERRADA', 'rgba(255,255,255,0.06)', C.fg, C.line);
  else selo = pill('AO VIVO', 'rgba(255,255,255,0.06)', C.fg, C.line);

  const outrosIdx = race.candidatos.findIndex((c) => c.agregado);
  const temOutros = outrosIdx >= 0 && r.votos.reduce((a, b) => a + b, 0) > 0;

  const rodapeEsq: No = inp.pre
    ? h(
        'div',
        { flexDirection: 'column' },
        h('div', { fontSize: 28, fontWeight: 700, color: C.fg }, 'Resultados a partir das 17h de 25/10'),
        h('div', { fontSize: 20, color: C.muted, marginTop: 6 }, 'Horário de Brasília · fonte: TSE'),
      )
    : h(
        'div',
        { flexDirection: 'column' },
        h(
          'div',
          { alignItems: 'center', gap: 16 },
          h('div', { fontSize: 28, fontWeight: 700, color: C.fg }, `${fmtPct(pctSec)} das seções totalizadas`),
        ),
        h(
          'div',
          { width: 420, height: 8, borderRadius: 4, background: C.pending, marginTop: 12 },
          h('div', { width: Math.max(4, Math.round((420 * pctSec) / 100)), height: 8, borderRadius: 4, background: C.brand2 }),
        ),
      );

  const rodapeDir: No = h(
    'div',
    { flexDirection: 'column', alignItems: 'flex-end' },
    inp.pre
      ? h('div', { fontSize: 22, color: C.muted }, inp.uf || race.abrangencia !== 'BR' ? 'Placar ao vivo, cidade por cidade' : 'Placar ao vivo, estado por estado')
      : race.turno === 1
        ? h('div', { fontSize: 22, color: C.muted }, 'Resultado oficial · fonte: TSE')
        : h('div', { fontSize: 22, color: C.muted }, `${inp.simulacao ? 'Horário simulado' : 'Atualizado às'} ${fmtHora(inp.horario)} (Brasília)`),
    temOutros
      ? h('div', { fontSize: 20, color: C.subtle, marginTop: 6 }, `Outros candidatos: ${fmtPct(pctValidos(r, outrosIdx))}`)
      : h('div', { fontSize: 20, color: C.subtle, marginTop: 6 }, '% dos votos válidos'),
  );

  return fundo(
    inp.simulacao
      ? h('div', { position: 'absolute', left: 0, top: 0, width: OG_W, height: 10, background: C.brand })
      : null,
    h(
      'div',
      { flexDirection: 'column', padding: '44px 64px 40px', width: OG_W, height: OG_H },
      h('div', { justifyContent: 'space-between', alignItems: 'center' }, marca(), selo),
      h('div', { fontSize: 20, fontWeight: 600, color: C.brand2, letterSpacing: 3, marginTop: 24 }, kicker),
      h(
        'div',
        { fontFamily: 'Bricolage', fontWeight: 700, fontSize: 46, color: C.fg, marginTop: 2, letterSpacing: -1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: OG_W - 128 },
        titulo,
      ),
      h(
        'div',
        { justifyContent: 'space-between', marginTop: fotos ? 14 : 22 },
        colunaCandidato(race.candidatos[ia], ia, inp, 'left', fotos?.get(ia) ?? null),
        colunaCandidato(race.candidatos[ib], ib, inp, 'right', fotos?.get(ib) ?? null),
      ),
      barra(inp, ia, ib),
      h('div', { flexGrow: 1 }),
      h('div', { justifyContent: 'space-between', alignItems: 'flex-end' }, rodapeEsq, rodapeDir),
    ),
  );
}

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

export async function renderPng(no: No): Promise<Buffer> {
  const svg = await satori(no as unknown as Parameters<typeof satori>[0], { width: OG_W, height: OG_H, fonts: carregarFontes() });
  const img = await renderAsync(svg, { fitTo: { mode: 'width', value: OG_W }, font: { loadSystemFonts: false } });
  // PNG RGB próprio (sem alfa, filtro Sub, deflate 9 fora da thread principal): ~30% menor que o do resvg
  if (img.width === OG_W && img.height === OG_H && img.pixels.length === OG_W * OG_H * 4) return pngDeRgba(img.pixels, OG_W, OG_H);
  return Buffer.from(img.asPng());
}
