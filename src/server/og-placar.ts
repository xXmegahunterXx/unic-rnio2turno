/**
 * Cartão do PLACAR (Brasil, UF ou município) como imagem do servidor, no espírito do topo da Home
 * (src/app/components/pages/home/DueloPresidencia.tsx): os dois retratos oficiais GRANDES lado a lado, do mesmo tamanho
 * e tratamento (quadro 4:5, moldura e brilho na cor de identidade que vem dos dados), o "×" do confronto, os números
 * gigantes, a barra dividida (os demais candidatos no meio, a marca dos 50%), o % apurado e o horário, a marca
 * sintonia2026.com.br e — com anúncio de compartilhamento no ar — o rodapé "Oferecimento: <marca>".
 *
 * Formatos (`FormatoOg`): 'og' 1200×630 (prévia de link: meta tags), 'x' 1200×675 (16:9), 'feed' 1080×1350 (4:5) e
 * 'story' 1080×1920 (9:16; faixas de 150 px livres em cima e embaixo para a interface dos apps).
 *
 * Regras (ARCHITECTURE §1 e §11):
 *  - Foto só com número REAL e nome real: quem chama nunca passa foto na simulação nem com os nomes ocultos; sem foto
 *    (ou faltando a de um dos dois), o monograma no MESMO quadro — nunca um rosto contra um monograma. Fotos sem
 *    edição (só redimensionadas/recortadas pelo próprio quadro).
 *  - Cores sempre de `Candidate.cor` (Presidente vermelho/azul; governador e nomes ocultos turquesa/âmbar), nunca da
 *    posição. Ordem da urna: o primeiro candidato da corrida à esquerda.
 *  - Simulação: selo "SIMULAÇÃO · DADOS FICTÍCIOS", faixa no topo e marca-d'água diagonal (sobrevive a recortes), e o
 *    rodapé nunca diz "Fonte: TSE".
 *  - Textos descritivos e simétricos; números de format.ts e percentuais de calc.ts.
 *  - Anúncio: só texto, rotulado, numa faixa PRÓPRIA no pé da imagem, abaixo da linha da marca/endereço do Sintonia —
 *    a marca do site fica sempre entre o anúncio e os candidatos (nunca encostado em foto, nome ou número). Liga e
 *    desliga em `OFERECIMENTO_NO_PLACAR` (og-oferecimento.ts).
 */
import { pctTotalizadas, pctValidos, validos, margem } from '../shared/calc';
import { UF_NOMES } from '../shared/constants';
import { fmtHoraSeg, fmtInt, fmtPP, fmtPct } from '../shared/format';
import { partidoENumero } from '../shared/anon';
import type { Candidate, Race, Summary, UF } from '../shared/types';
import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import { C, LOGO_URI, carregarFontes, corOg, h, iniciais, renderPng, tintaOg, type Estilo, type No } from './og';
import { pngDeRgba } from './png';

export type FormatoOg = 'og' | 'x' | 'feed' | 'story';
export const FORMATOS_OG: readonly FormatoOg[] = ['og', 'x', 'feed', 'story'];

/** Dimensões de cada formato (px). 'og' = prévia de link (summary_large_image); os demais = kit de compartilhar. */
export const DIM_OG: Record<FormatoOg, { w: number; h: number }> = {
  og: { w: 1200, h: 630 },
  x: { w: 1200, h: 675 },
  feed: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

/** Endereço exibido quando o servidor não tem PUBLIC_URL (o endereço público do produto, o mesmo da /live). */
export const DOMINIO_PADRAO_OG = 'sintonia2026.com.br';

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
   * Fotos oficiais (data URI JPEG/PNG) na ordem de `race.candidatos`. Só usadas se TODOS os finalistas tiverem foto
   * (tratamento igual); ausente/incompleto → monograma.
   */
  fotos?: (string | null | undefined)[];
  /** Título no lugar do da corrida (ex.: o nome do município). */
  titulo?: string;
  /** Linha acima do título no lugar de "APURAÇÃO · Nº TURNO 2026". */
  kicker?: string;
  /** Recorte local (município): nunca mostra "ELEITO" (o resumo local só diz quem venceu ali). */
  local?: boolean;
  /** Formato da imagem (padrão 'og', 1200×630). */
  formato?: FormatoOg;
  /** Endereço exibido no rodapé (padrão: DOMINIO_PADRAO_OG). */
  dominio?: string | null;
  /** Marca do anunciante do rodapé "Oferecimento" (null/ausente = sem faixa). */
  oferecimento?: string | null;
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

// ---------------------------------------------------------------------------------------------
// Medidas por formato
// ---------------------------------------------------------------------------------------------

interface Medidas {
  w: number;
  h: number;
  retrato: boolean;
  padX: number;
  padTop: number;
  padBottom: number;
  logo: number;
  marca: number;
  kicker: number;
  titulo: number;
  /** Quadro do retrato (4:5). */
  fotoW: number;
  fotoH: number;
  /** Vão entre os dois retratos (o "×" fica sobre ele). */
  vao: number;
  xis: number;
  nome: number;
  partido: number;
  pct: number;
  votos: number;
  barra: number;
  status: number;
  sub: number;
  faixaOf: number;
  selo: number;
  /** escala geral (1 = 16:9) */
  k: number;
}

function medidas(f: FormatoOg): Medidas {
  const { w, h: alt } = DIM_OG[f];
  switch (f) {
    case 'x':
      return { w, h: alt, retrato: false, padX: 52, padTop: 34, padBottom: 26, logo: 46, marca: 32, kicker: 18, titulo: 38, fotoW: 252, fotoH: 315, vao: 26, xis: 56, nome: 34, partido: 21, pct: 86, votos: 22, barra: 18, status: 24, sub: 19, faixaOf: 36, selo: 17, k: 1 };
    case 'feed':
      return { w, h: alt, retrato: true, padX: 64, padTop: 56, padBottom: 40, logo: 56, marca: 40, kicker: 21, titulo: 50, fotoW: 332, fotoH: 415, vao: 40, xis: 72, nome: 42, partido: 25, pct: 108, votos: 28, barra: 26, status: 30, sub: 23, faixaOf: 50, selo: 20, k: 1.3 };
    case 'story':
      return { w, h: alt, retrato: true, padX: 72, padTop: 150, padBottom: 150, logo: 66, marca: 46, kicker: 24, titulo: 60, fotoW: 412, fotoH: 515, vao: 44, xis: 84, nome: 50, partido: 28, pct: 128, votos: 30, barra: 30, status: 32, sub: 24, faixaOf: 56, selo: 22, k: 1.42 };
    case 'og':
    default:
      return { w, h: alt, retrato: false, padX: 52, padTop: 30, padBottom: 22, logo: 44, marca: 31, kicker: 18, titulo: 36, fotoW: 216, fotoH: 270, vao: 24, xis: 54, nome: 34, partido: 21, pct: 84, votos: 22, barra: 18, status: 23, sub: 18, faixaOf: 34, selo: 16, k: 1 };
  }
}

// ---------------------------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------------------------

/** 'rgb(r,g,b)' → 'rgba(r,g,b,a)'. */
export const alfa = (cor: string, a: number) => (cor.startsWith('rgb(') ? `rgba(${cor.slice(4, -1)},${a})` : cor);

/** Opacidade do brilho a uma distância relativa `d` (0 = centro, 1 = borda): pico no centro, 1/3 em 42%, zero na borda. */
export function quedaBrilho(d: number, pico: number): number {
  if (d >= 1) return 0;
  return d < 0.42 ? pico * (1 - (d / 0.42) * (2 / 3)) : (pico / 3) * Math.pow(1 - (d - 0.42) / 0.58, 1.6);
}

const rgbDe = (cor: string): [number, number, number] => {
  const v = (/\d+\s*,\s*\d+\s*,\s*\d+/.exec(cor)?.[0] ?? '128,128,128').split(',').map((x) => Number(x.trim()));
  return [v[0], v[1], v[2]];
};

/**
 * Fundo do cartão (cor de fundo + o brilho das duas cores nos cantos de cima), calculado direto nos pixels e composto
 * por baixo do que o resvg desenhou com fundo transparente. Um `radial-gradient` do tamanho do cartão custava ~200 ms
 * no resvg (e ~2× isso no story); aqui são poucos milissegundos.
 */
export function comporSobreFundo(rgba: Uint8Array, w: number, alt: number, corA: string, corB: string, pico = 0.24): void {
  const [br, bg, bb] = rgbDe(C.bg);
  const a = rgbDe(corA);
  const b = rgbDe(corB);
  const raio = Math.hypot(w, alt) * 0.55;
  const r2 = raio * raio;
  // tabela da queda pelo quadrado da distância relativa (evita raiz e potência por pixel)
  const N = 2048;
  const lut = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) lut[i] = quedaBrilho(Math.sqrt(i / N), pico);
  for (let y = 0; y < alt; y++) {
    const yy = y * y;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const al = rgba[o + 3];
      if (al === 255) continue; // coberto pelo desenho: o fundo não aparece
      let r = br;
      let g = bg;
      let bl = bb;
      const da = (x * x + yy) / r2;
      if (da < 1) {
        const ga = lut[(da * N) | 0];
        r += (a[0] - r) * ga;
        g += (a[1] - g) * ga;
        bl += (a[2] - bl) * ga;
      }
      const dx = w - x;
      const db = (dx * dx + yy) / r2;
      if (db < 1) {
        const gb = lut[(db * N) | 0];
        r += (b[0] - r) * gb;
        g += (b[1] - g) * gb;
        bl += (b[2] - bl) * gb;
      }
      // resvg entrega RGBA pré-multiplicado: cor final = frente + fundo × (1 − alfa)
      const inv = (255 - al) / 255;
      rgba[o] = Math.min(255, (rgba[o] + r * inv + 0.5) | 0);
      rgba[o + 1] = Math.min(255, (rgba[o + 1] + g * inv + 0.5) | 0);
      rgba[o + 2] = Math.min(255, (rgba[o + 2] + bl * inv + 0.5) | 0);
      rgba[o + 3] = 255;
    }
  }
}

const umaLinha: Estilo = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

const CHECK_SVG = (tinta: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${tinta}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ).toString('base64')}`;

function pilula(texto: string, m: Medidas, bg: string, fg: string, borda?: string): No {
  return h(
    'div',
    {
      alignItems: 'center',
      padding: `${Math.round(m.selo * 0.55)}px ${Math.round(m.selo * 1.15)}px`,
      borderRadius: 999,
      background: bg,
      color: fg,
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: m.selo,
      letterSpacing: 1.6,
      flexShrink: 0,
      ...(borda ? { border: `2px solid ${borda}` } : {}),
    },
    texto,
  );
}

function marcaSintonia(m: Medidas): No {
  return h(
    'div',
    { alignItems: 'center', gap: Math.round(m.logo * 0.32) },
    { type: 'img', props: { src: LOGO_URI, width: m.logo, height: m.logo, style: { width: m.logo, height: m.logo } } },
    h('div', { fontFamily: 'Bricolage', fontWeight: 700, fontSize: m.marca, color: C.fg, letterSpacing: -0.5 }, 'Sintonia'),
  );
}

/**
 * Retrato 4:5 com moldura em degradê da cor do candidato e brilho suave atrás (como o `CandidateRetrato` do app).
 * Sem foto: monograma no mesmo quadro. `eleito`: selo de confirmação no canto.
 */
function retrato(c: Candidate, foto: string | null, m: Medidas, eleito: boolean): No {
  const cor = corOg(c.cor);
  const borda = Math.max(4, Math.round(m.fotoW * 0.016));
  const raio = Math.round(m.fotoW * 0.1);
  const brilhoW = Math.round(m.fotoW * 1.7);
  const brilhoH = Math.round(m.fotoH * 1.45);
  const interno = foto
    ? {
        type: 'img',
        props: {
          src: foto,
          width: m.fotoW - 2 * borda,
          height: m.fotoH - 2 * borda,
          style: { width: m.fotoW - 2 * borda, height: m.fotoH - 2 * borda, borderRadius: raio - borda, objectFit: 'cover', objectPosition: '50% 18%' },
        },
      }
    : h(
        'div',
        {
          width: m.fotoW - 2 * borda,
          height: m.fotoH - 2 * borda,
          borderRadius: raio - borda,
          background: C.surface3,
          backgroundImage: `linear-gradient(160deg, ${alfa(cor, 0.3)} 0%, ${alfa(cor, 0.12)} 100%)`,
          color: cor,
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Bricolage',
          fontWeight: 800,
          fontSize: Math.round(m.fotoW * 0.34),
          letterSpacing: -2,
        },
        iniciais(c.nomeUrna),
      );
  const selo = Math.round(m.fotoW * 0.2);
  return h(
    'div',
    { width: m.fotoW, height: m.fotoH, position: 'relative', flexShrink: 0 },
    // brilho atrás do quadro (decoração na cor de identidade que vem dos dados)
    h('div', {
      position: 'absolute',
      left: Math.round((m.fotoW - brilhoW) / 2),
      top: Math.round((m.fotoH - brilhoH) / 2),
      width: brilhoW,
      height: brilhoH,
      backgroundImage: `radial-gradient(circle at 50% 50%, ${alfa(cor, 0.36)} 0%, ${alfa(cor, 0.12)} 40%, ${alfa(cor, 0)} 70%)`,
    }),
    h(
      'div',
      {
        position: 'absolute',
        left: 0,
        top: 0,
        width: m.fotoW,
        height: m.fotoH,
        borderRadius: raio,
        padding: borda,
        backgroundImage: `linear-gradient(165deg, ${cor} 0%, ${alfa(cor, 0.5)} 48%, ${alfa(cor, 0.92)} 100%)`,
      },
      interno as No,
    ),
    eleito
      ? h(
          'div',
          {
            position: 'absolute',
            right: -Math.round(selo * 0.22),
            bottom: -Math.round(selo * 0.22),
            width: selo,
            height: selo,
            borderRadius: selo,
            background: cor,
            border: `${Math.max(3, Math.round(4 * m.k))}px solid ${C.bg}`,
            alignItems: 'center',
            justifyContent: 'center',
          },
          { type: 'img', props: { src: CHECK_SVG(tintaOg(c.cor)), width: Math.round(selo * 0.6), height: Math.round(selo * 0.6), style: { width: Math.round(selo * 0.6), height: Math.round(selo * 0.6) } } },
        )
      : null,
  );
}

/** Os dois retratos lado a lado com o "×" sobre o vão. */
function duelo(race: Race, ia: number, ib: number, fotos: Map<number, string> | null, m: Medidas, eleito: number | null): No {
  const largura = 2 * m.fotoW + m.vao;
  return h(
    'div',
    { width: largura, height: m.fotoH, position: 'relative', flexShrink: 0 },
    h(
      'div',
      { position: 'absolute', left: 0, top: 0, width: largura, height: m.fotoH, gap: m.vao },
      retrato(race.candidatos[ia], fotos?.get(ia) ?? null, m, eleito === ia),
      retrato(race.candidatos[ib], fotos?.get(ib) ?? null, m, eleito === ib),
    ),
    h(
      'div',
      {
        position: 'absolute',
        left: Math.round(largura / 2 - m.xis / 2),
        top: Math.round(m.fotoH / 2 - m.xis / 2),
        width: m.xis,
        height: m.xis,
        borderRadius: m.xis,
        background: C.surface,
        border: `${Math.max(2, Math.round(3 * m.k))}px solid ${C.bg}`,
        alignItems: 'center',
        justifyContent: 'center',
        color: C.fg,
        fontFamily: 'Bricolage',
        fontWeight: 700,
        fontSize: Math.round(m.xis * 0.5),
        lineHeight: 1,
        paddingBottom: Math.round(m.xis * 0.06),
      },
      '×',
    ),
  );
}

/** Corpo do nome por comprimento (nomes de urna longos quebram em duas linhas; nunca são cortados). */
function tamNomeOg(nome: string, base: number): number {
  if (nome.length <= 12) return base;
  if (nome.length <= 17) return Math.round(base * 0.92);
  return Math.round(base * 0.82);
}

/** "45,16%" com o "%" menor. Corpo reduzido quando o número é longo ("100,00%"). */
function pctGigante(valor: number | null, m: Medidas, cor: string, alinhar: 'flex-start' | 'flex-end' | 'center'): No {
  const txt = valor === null ? '—' : fmtPct(valor);
  const corpo = txt.length > 6 ? Math.round(m.pct * 0.86) : m.pct;
  const num = valor === null ? txt : txt.slice(0, -1);
  return h(
    'div',
    { alignItems: 'flex-end', justifyContent: alinhar, color: cor, fontFamily: 'Bricolage', fontWeight: 800, lineHeight: 0.9, letterSpacing: -Math.round(corpo * 0.02) },
    h('div', { fontSize: corpo }, num),
    valor === null ? null : h('div', { fontSize: Math.round(corpo * 0.46), marginLeft: Math.round(corpo * 0.03), marginBottom: Math.round(corpo * 0.05), letterSpacing: 0 }, '%'),
  );
}

/** Barra dividida dos votos válidos: 1º candidato à esquerda, os demais (1º turno) no meio, o 2º à direita; marca 50%. */
function barraDividida(race: Race, r: Summary, ia: number, ib: number, largura: number, m: Medidas, vazia: boolean): No {
  const alto = m.barra;
  const raio = Math.round(alto / 2);
  const total = validos(r);
  const outros = race.candidatos.findIndex((c) => c.agregado);
  if (vazia || total <= 0) {
    return h('div', { width: largura, height: alto, borderRadius: raio, background: C.pending, flexShrink: 0 });
  }
  const gap = Math.max(4, Math.round(alto * 0.28));
  const ordem = [ia, ...(outros >= 0 ? [outros] : []), ib];
  const util = largura - gap * (ordem.length - 1);
  const ws = ordem.map((i) => Math.max(2, Math.round((util * (r.votos[i] ?? 0)) / total)));
  ws[ws.length - 1] = Math.max(2, util - ws.slice(0, -1).reduce((a, b) => a + b, 0));
  const marcaAlt = Math.round(alto * 2.1);
  return h(
    'div',
    { width: largura, height: marcaAlt, position: 'relative', alignItems: 'center', flexShrink: 0 },
    h(
      'div',
      { width: largura, height: alto, gap },
      ...ordem.map((i, k) =>
        h('div', {
          width: ws[k],
          height: alto,
          background: corOg(race.candidatos[i]?.agregado ? 'outros' : race.candidatos[i]?.cor),
          borderRadius: k === 0 ? `${raio}px 0 0 ${raio}px` : k === ordem.length - 1 ? `0 ${raio}px ${raio}px 0` : 0,
        }),
      ),
    ),
    h('div', { position: 'absolute', left: Math.round(largura / 2 - 1.5), top: 0, width: 3, height: marcaAlt, borderRadius: 2, background: 'rgba(244,244,250,0.92)' }),
  );
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

/**
 * Árvore do cartão. `semFundo`: raiz transparente (o fundo com o brilho dos cantos entra depois, em
 * `renderPlacarPng`); sem ele, fundo liso (para quem só inspeciona o layout ou usa o `renderPng` genérico).
 */
export function layoutPlacar(inp: OgPlacarInput, opts: { semFundo?: boolean } = {}): No {
  const formato = inp.formato ?? 'og';
  const m = medidas(formato);
  const { race, resumo: r } = inp;
  const idx = finalistas(race);
  const [ia, ib] = [idx[0] ?? 0, idx[1] ?? 1];
  const fotos = fotosDoPlacar(inp);
  const t1 = race.turno === 1;
  const temVotos = validos(r) > 0;
  const pctSec = pctTotalizadas(r);
  const encerrada = r.status === 'encerrada';
  // "eleito" só no 2º turno e na abrangência da própria disputa (no recorte de uma UF, `eleito` do resumo
  // significa apenas "vencedor ali"; no 1º turno ninguém foi eleito para estes cargos)
  const escopoDaDisputa = !inp.local && (!inp.uf || race.abrangencia === inp.uf);
  const eleito = !inp.pre && race.turno === 2 && escopoDaDisputa && r.eleito !== null && r.eleito !== undefined ? r.eleito : null;
  const dominio = (inp.dominio || DOMINIO_PADRAO_OG).replace(/^www\./, '');

  const local = inp.uf ? UF_NOMES[inp.uf] : race.abrangencia === 'BR' ? 'Brasil' : (UF_NOMES[race.abrangencia as UF] ?? '');
  const titulo = inp.titulo ?? (race.cargo === 'Presidente' ? `Presidente · ${local}` : `Governador · ${local}`);
  const kicker = inp.kicker ?? (t1 ? 'RESULTADO OFICIAL · 1º TURNO 2026' : `APURAÇÃO · ${race.turno}º TURNO 2026`);

  let selo: No;
  if (inp.simulacao) selo = pilula('SIMULAÇÃO · DADOS FICTÍCIOS', m, C.brand, '#ffffff');
  else if (inp.pre) selo = pilula('25/10 · A PARTIR DAS 17H', m, 'rgba(255,255,255,0.06)', C.fg, C.line);
  else if (t1) selo = pilula('RESULTADO OFICIAL · TSE', m, 'rgba(255,255,255,0.06)', C.fg, C.line);
  else if (encerrada) selo = pilula('APURAÇÃO ENCERRADA', m, 'rgba(255,255,255,0.06)', C.fg, C.line);
  else selo = pilula('AO VIVO', m, 'rgba(255,255,255,0.06)', C.fg, C.line);

  // % e votos de cada finalista (antes da apuração: o 1º turno, rotulado)
  const valorDe = (i: number): { pct: number | null; votos: number | null } => {
    if (inp.pre) {
      const p1 = race.candidatos[i]?.primeiroTurno;
      return p1 ? { pct: p1.pct, votos: p1.votos } : { pct: null, votos: null };
    }
    return { pct: temVotos ? pctValidos(r, i) : null, votos: r.votos[i] ?? 0 };
  };

  const rotuloEleito = (i: number) =>
    eleito === i
      ? pilula(encerrada ? 'ELEITO' : 'MATEMATICAMENTE ELEITO', { ...m, selo: Math.round(m.selo * 0.92) }, corOg(race.candidatos[i].cor), tintaOg(race.candidatos[i].cor))
      : null;

  /** Nome e partido · número de um finalista. */
  const cabecaDe = (i: number, alinhar: 'flex-start' | 'flex-end' | 'center', largura: number): No => {
    const c = race.candidatos[i];
    const textAlign = alinhar === 'center' ? 'center' : alinhar === 'flex-end' ? 'right' : 'left';
    return h(
      'div',
      { flexDirection: 'column', alignItems: alinhar, width: largura },
      h(
        'div',
        { fontFamily: 'Bricolage', fontWeight: 700, fontSize: tamNomeOg(c.nomeUrna, m.nome), color: C.fg, lineHeight: 1.06, letterSpacing: -0.3, textAlign, maxWidth: largura },
        c.nomeUrna,
      ),
      // 1º turno é resultado OFICIAL: com os nomes ocultos, `anonimizarRace` põe "nome oculto" no partido e
      // `partidoENumero` não mostra o número fictício da anonimização num cartão de dado real
      h('div', { fontSize: m.partido, fontWeight: 700, color: corOg(c.cor), marginTop: Math.round(6 * m.k), letterSpacing: 0.5, ...umaLinha, maxWidth: largura }, partidoENumero(c)),
      rotuloEleito(i) ? h('div', { marginTop: Math.round(12 * m.k) }, rotuloEleito(i)) : null,
    );
  };

  /** % gigante, votos e o selo de eleito de um finalista. */
  const numerosDe = (i: number, alinhar: 'flex-start' | 'flex-end' | 'center', largura: number): No => {
    const c = race.candidatos[i];
    const v = valorDe(i);
    return h(
      'div',
      { flexDirection: 'column', alignItems: alinhar, width: largura },
      inp.pre ? h('div', { fontSize: Math.round(m.sub * 0.95), fontWeight: 700, color: C.muted, letterSpacing: 2, marginBottom: Math.round(6 * m.k) }, 'NO 1º TURNO') : null,
      pctGigante(v.pct, m, v.pct === null ? C.subtle : corOg(c.cor), alinhar),
      h(
        'div',
        { fontSize: m.votos, color: C.muted, marginTop: Math.round(8 * m.k), alignItems: 'center', gap: 6 },
        v.votos === null ? null : h('div', { color: C.fg, fontWeight: 700 }, fmtInt(v.votos)),
        v.votos === null ? null : h('div', {}, 'votos'),
      ),
    );
  };

  // ---- linha de status (% apurado e horário) e rodapé ----
  const outrosIdx = race.candidatos.findIndex((c) => c.agregado);
  const demais = outrosIdx >= 0 && temVotos ? `Demais candidatos: ${fmtPct(pctValidos(r, outrosIdx))}` : null;
  let statusPrincipal: string;
  let statusSecundario: string;
  if (inp.pre) {
    statusPrincipal = 'Apuração a partir das 17h de 25/10';
    statusSecundario = 'Percentuais do 1º turno · Fonte: TSE';
  } else if (t1) {
    statusPrincipal = `${fmtPct(pctSec)} das seções totalizadas`;
    statusSecundario = ['Resultado oficial de 4/10 · Fonte: TSE', demais].filter(Boolean).join(' · ');
  } else if (inp.simulacao) {
    statusPrincipal = `${fmtPct(pctSec)} das seções totalizadas`;
    statusSecundario = `Horário simulado ${fmtHoraSeg(inp.horario)} · dados fictícios`;
  } else {
    statusPrincipal = `${fmtPct(pctSec)} das seções totalizadas`;
    statusSecundario = `${encerrada ? 'Concluída' : 'Atualizado'} às ${fmtHoraSeg(inp.horario)} (Brasília) · Fonte: TSE`;
  }
  const progresso = (largura: number): No | null =>
    inp.pre
      ? null
      : h(
      'div',
      { width: largura, height: Math.max(6, Math.round(7 * m.k)), borderRadius: 6, background: C.pending, flexShrink: 0 },
          h('div', { width: Math.max(6, Math.round((largura * pctSec) / 100)), height: Math.max(6, Math.round(7 * m.k)), borderRadius: 6, background: C.brand2 }),
        );

  const larguraUtil = m.w - 2 * m.padX;
  const blocoStatus = (alinhar: 'flex-start' | 'center', largura: number): No =>
    h(
      'div',
      { flexDirection: 'column', alignItems: alinhar, maxWidth: largura },
      h('div', { fontSize: m.status, fontWeight: 700, color: C.fg, ...umaLinha, maxWidth: largura }, statusPrincipal),
      h('div', { fontSize: m.sub, color: C.muted, marginTop: Math.round(5 * m.k), ...umaLinha, maxWidth: largura }, statusSecundario),
    );
  const blocoMarca = (alinhar: 'flex-end' | 'center'): No =>
    h(
      'div',
      { flexDirection: 'column', alignItems: alinhar, flexShrink: 0 },
      h('div', { fontSize: m.status, fontWeight: 700, color: C.fg, letterSpacing: -0.3 }, dominio),
      h('div', { fontSize: m.sub, color: inp.simulacao ? C.brand2 : C.subtle, marginTop: Math.round(5 * m.k) }, inp.simulacao ? 'Simulação · não é resultado' : encerrada ? 'Resultado e 1º turno' : 'Apuração ao vivo e 1º turno'),
    );

  // ---- diferença (2º turno com votos): neutra, sem dizer quem; a cor e os números já dizem ----
  const dif = !inp.pre && race.turno === 2 && temVotos ? margem(r) : null;
  const pilulaDif = dif
    ? h(
        'div',
        {
          alignItems: 'center',
          gap: Math.round(12 * m.k),
          padding: `${Math.round(9 * m.k)}px ${Math.round(20 * m.k)}px`,
          borderRadius: 999,
          border: `2px solid ${C.line}`,
          background: 'rgba(255,255,255,0.04)',
          fontSize: m.sub,
          color: C.muted,
        },
        'Diferença',
        h('div', { color: C.fg, fontWeight: 700, fontFamily: 'Bricolage', fontSize: Math.round(m.sub * 1.3) }, dif.lider === null ? '0,00 p.p.' : fmtPP(dif.pp, 2).replace('+', '')),
        h('div', {}, `${fmtInt(dif.votos)} votos`),
      )
    : null;

  // ---- faixa do anunciante (abaixo do rodapé com a marca do Sintonia) ----
  const story = formato === 'story';
  // story: etiqueta centralizada acima da faixa livre de baixo (150 px, coberta pela interface dos apps)
  const etiquetaOf = inp.oferecimento && story
    ? h(
        'div',
        {
          alignItems: 'center',
          gap: 10,
          padding: `${Math.round(12 * m.k)}px ${Math.round(26 * m.k)}px`,
          borderRadius: 999,
          background: C.surface,
          border: `1px solid ${C.line}`,
          fontSize: Math.round(m.faixaOf * 0.46),
          color: C.subtle,
          flexShrink: 0,
        },
        h('div', { letterSpacing: 0.4 }, 'Oferecimento:'),
        h('div', { color: C.fg, fontWeight: 600, ...umaLinha, maxWidth: Math.round(m.w * 0.5) }, inp.oferecimento.slice(0, 40)),
      )
    : null;
  const faixaOf = inp.oferecimento && !story
    ? h(
        'div',
        {
          width: m.w,
          height: m.faixaOf,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background: C.surface,
          borderTop: `1px solid ${C.line}`,
          fontSize: Math.round(m.faixaOf * 0.5),
          color: C.subtle,
          padding: `0 ${m.padX}px`,
        },
        h('div', { letterSpacing: 0.4 }, 'Oferecimento:'),
        h('div', { color: C.fg, fontWeight: 600, ...umaLinha, maxWidth: Math.round(m.w * 0.5) }, inp.oferecimento.slice(0, 40)),
      )
    : null;

  // ---- fundo: brilho das duas cores nos cantos de cima + marca-d'água da simulação ----
  const corA = corOg(race.candidatos[ia]?.cor);
  const corB = corOg(race.candidatos[ib]?.cor);
  const camadas: (No | null)[] = [
    inp.simulacao
      ? h(
          'div',
          { position: 'absolute', left: 0, top: 0, width: m.w, height: m.h, alignItems: 'center', justifyContent: 'center' },
          h(
            'div',
            {
              fontFamily: 'Bricolage',
              fontWeight: 800,
              fontSize: Math.round((m.retrato ? 210 : 170) * (m.retrato ? 1 : 1)),
              color: alfa(C.brand, 0.1),
              letterSpacing: 6,
              transform: `rotate(${m.retrato ? -24 : -12}deg)`,
            },
            'SIMULAÇÃO',
          ),
        )
      : null,
    inp.simulacao ? h('div', { position: 'absolute', left: 0, top: 0, width: m.w, height: Math.round(10 * m.k), background: C.brand }) : null,
  ];

  const cabecalho = h(
    'div',
    { flexDirection: 'column', flexShrink: 0 },
    h('div', { justifyContent: 'space-between', alignItems: 'center' }, marcaSintonia(m), selo),
    h('div', { fontSize: m.kicker, fontWeight: 700, color: C.brand2, letterSpacing: 3, marginTop: Math.round((m.retrato ? 30 : 16) * m.k), ...umaLinha, maxWidth: larguraUtil }, kicker),
    h(
      'div',
      { fontFamily: 'Bricolage', fontWeight: 700, fontSize: m.titulo, color: C.fg, letterSpacing: -0.4, lineHeight: 1.1, marginTop: 2, ...umaLinha, maxWidth: larguraUtil },
      titulo,
    ),
  );

  let miolo: No;
  if (!m.retrato) {
    // 16:9 / prévia: retratos no centro, cada candidato no seu lado (nome em cima, número embaixo)
    const larguraDuelo = 2 * m.fotoW + m.vao;
    const lateral = Math.floor((larguraUtil - larguraDuelo) / 2) - 22;
    const coluna = (i: number, alinhar: 'flex-start' | 'flex-end') =>
      h(
        'div',
        { flexDirection: 'column', justifyContent: 'space-between', alignItems: alinhar, width: lateral, height: m.fotoH, paddingTop: 6, paddingBottom: 2 },
        cabecaDe(i, alinhar, lateral),
        numerosDe(i, alinhar, lateral),
      );
    miolo = h(
      'div',
      { flexDirection: 'column', flexShrink: 0 },
      h('div', { justifyContent: 'space-between', alignItems: 'center', width: larguraUtil }, coluna(ia, 'flex-start'), duelo(race, ia, ib, fotos, m, eleito), coluna(ib, 'flex-end')),
      h('div', { marginTop: Math.round(16 * m.k) }, barraDividida(race, r, ia, ib, larguraUtil, m, inp.pre)),
    );
  } else {
    // feed / story: como o topo da Home — retratos lado a lado e, embaixo de cada um, nome, partido e número
    const meia = Math.floor((larguraUtil - m.vao) / 2);
    miolo = h(
      'div',
      { flexDirection: 'column', alignItems: 'center', flexShrink: 0 },
      duelo(race, ia, ib, fotos, m, eleito),
      h('div', { width: larguraUtil, justifyContent: 'space-between', alignItems: 'flex-start', marginTop: Math.round(22 * m.k) }, cabecaDe(ia, 'center', meia), cabecaDe(ib, 'center', meia)),
      h('div', { width: larguraUtil, justifyContent: 'space-between', alignItems: 'flex-start', marginTop: Math.round(20 * m.k) }, numerosDe(ia, 'center', meia), numerosDe(ib, 'center', meia)),
      h('div', { marginTop: Math.round(26 * m.k) }, barraDividida(race, r, ia, ib, larguraUtil, m, inp.pre)),
      // a pílula da diferença só no story (no feed não cabe junto com o selo de eleito)
      pilulaDif && formato === 'story' ? h('div', { marginTop: Math.round(20 * m.k) }, pilulaDif) : null,
    );
  }

  const rodape = m.retrato
    ? h(
        'div',
        { flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: larguraUtil },
        blocoStatus('center', larguraUtil),
        inp.pre ? null : h('div', { marginTop: Math.round(14 * m.k) }, progresso(Math.round(larguraUtil * 0.55))),
        h('div', { width: larguraUtil, height: 2, background: C.line, marginTop: Math.round(26 * m.k), marginBottom: Math.round(20 * m.k) }),
        blocoMarca('center'),
      )
    : h(
        'div',
        { justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0, width: larguraUtil },
        h('div', { flexDirection: 'column' }, blocoStatus('flex-start', larguraUtil - 330), inp.pre ? null : h('div', { marginTop: 10 }, progresso(380))),
        blocoMarca('flex-end'),
      );

  // A faixa do anunciante fica no pé da imagem; no story, uma etiqueta logo acima da faixa livre de baixo (150 px), onde
  // a interface dos apps não a cobre. Nos dois casos, abaixo do rodapé com a marca do Sintonia.
  const alturaConteudo = m.h - (faixaOf ? m.faixaOf : 0);
  const padBaixo = faixaOf ? Math.round(m.padBottom * 0.8) : m.padBottom;
  return h(
    'div',
    { width: m.w, height: m.h, flexDirection: 'column', ...(opts.semFundo ? {} : { background: C.bg }), color: C.fg, fontFamily: 'Inter', position: 'relative' },
    ...camadas,
    h(
      'div',
      { flexDirection: 'column', width: m.w, height: alturaConteudo, padding: `${m.padTop}px ${m.padX}px ${padBaixo}px`, position: 'relative' },
      cabecalho,
      h('div', { flexGrow: 1, minHeight: Math.round(10 * m.k) }),
      miolo,
      h('div', { flexGrow: 1, minHeight: Math.round(12 * m.k) }),
      rodape,
      etiquetaOf ? h('div', { marginTop: Math.round(26 * m.k), justifyContent: 'center', flexShrink: 0 }, etiquetaOf) : null,
    ),
    faixaOf,
  );
}

/**
 * PNG do cartão do placar: satori + resvg com fundo transparente, composto sobre o fundo com o brilho das duas cores
 * (`comporSobreFundo`) e codificado em RGB com o filtro Paeth (o que melhor comprime retrato + degradê) e deflate
 * nível 6 (o 9 levava ~250 ms a mais para ganhar ~4%). Prévia de link ('og') ≈ 250–270 KB com as duas fotos, abaixo
 * dos ~300 KB a partir dos quais o WhatsApp deixa de mostrar a prévia; sem foto (simulação) ≈ 130 KB.
 */
export async function renderPlacarPng(inp: OgPlacarInput): Promise<Buffer> {
  const formato = inp.formato ?? 'og';
  const { w, h: alt } = DIM_OG[formato];
  const svg = await satori(layoutPlacar(inp, { semFundo: true }) as unknown as Parameters<typeof satori>[0], { width: w, height: alt, fonts: carregarFontes() });
  const img = await renderAsync(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: false } });
  const px = img.pixels;
  if (img.width !== w || img.height !== alt || px.length !== w * alt * 4) return renderPng(layoutPlacar(inp), w, alt);
  const idx = finalistas(inp.race);
  comporSobreFundo(px, w, alt, corOg(inp.race.candidatos[idx[0] ?? 0]?.cor), corOg(inp.race.candidatos[idx[1] ?? 1]?.cor));
  return pngDeRgba(px, w, alt, 6, 'paeth');
}
