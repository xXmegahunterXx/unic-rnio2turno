/**
 * Cartão de compartilhar de uma PESQUISA REGISTRADA (satori → PNG), nos formatos dos cartões do placar (og-placar.ts):
 * 'og' 1200×630 (prévia de link das meta tags), 'x' 1200×675, 'feed' 1080×1350 e 'story' 1080×1920 (faixas de 150 px
 * livres em cima e embaixo). Sem a id, a capa genérica da área (sem número nem candidato).
 *
 * Regras (Lei 9.504/97, art. 33; Res. TSE 23.600/2019, art. 10): TODAS as informações obrigatórias no rodapé — instituto,
 * contratante, registro no TSE, período da coleta, entrevistas, margem de erro e nível de confiança —, mais o aviso
 * "Pesquisa não é resultado". Sem anúncio (nenhuma faixa "Oferecimento"), sem foto, sem média nem projeção. Candidatos
 * na ordem da urna, com as cores que vêm dos dados (Presidente: identidade; governador: turquesa/âmbar). Números como o
 * instituto divulgou (`fmtPctPesquisa`). No dia da votação (0h–17h de 25/10) a rota responde o convite genérico
 * (OG_COM_CANDIDATO, og-rotas.ts).
 */
import {
  AVISO_PESQUISAS,
  CHAVE_BRANCOS_NULOS,
  CHAVE_INDECISOS,
  fmtDataPesquisa,
  fmtPctPesquisa,
  informacoesObrigatorias,
  numerosDaPesquisa,
  rotuloCargo,
  type Pesquisa,
} from '../shared/pesquisas';
import type { CorCandidato } from '../shared/types';
import { C, LOGO_URI, corOg, h, type No } from './og';
import { DIM_OG, DOMINIO_PADRAO_OG, type FormatoOg } from './og-placar';

export interface CandidatoCartao {
  numero: number;
  nome: string;
  partido: string;
  cor: CorCandidato;
}

interface Medidas {
  w: number;
  h: number;
  retrato: boolean;
  padX: number;
  padTop: number;
  padBottom: number;
  logo: number;
  marca: number;
  selo: number;
  kicker: number;
  titulo: number;
  sub: number;
  nome: number;
  partido: number;
  pct: number;
  extra: number;
  rodape: number;
  gap: number;
}

const MEDIDAS: Record<FormatoOg, Medidas> = {
  og: { w: 1200, h: 630, retrato: false, padX: 56, padTop: 40, padBottom: 30, logo: 44, marca: 30, selo: 16, kicker: 18, titulo: 44, sub: 19, nome: 30, partido: 18, pct: 104, extra: 19, rodape: 16.5, gap: 16 },
  x: { w: 1200, h: 675, retrato: false, padX: 56, padTop: 44, padBottom: 34, logo: 46, marca: 31, selo: 16, kicker: 19, titulo: 46, sub: 20, nome: 31, partido: 19, pct: 112, extra: 20, rodape: 17, gap: 18 },
  feed: { w: 1080, h: 1350, retrato: true, padX: 72, padTop: 64, padBottom: 56, logo: 56, marca: 38, selo: 19, kicker: 23, titulo: 64, sub: 25, nome: 38, partido: 23, pct: 168, extra: 25, rodape: 24, gap: 30 },
  story: { w: 1080, h: 1920, retrato: true, padX: 80, padTop: 150, padBottom: 150, logo: 60, marca: 40, selo: 20, kicker: 25, titulo: 70, sub: 27, nome: 42, partido: 25, pct: 190, extra: 27, rodape: 26, gap: 40 },
};

export const medidasPesquisa = (f: FormatoOg) => MEDIDAS[f];

/** Corpo do nome por comprimento (nomes de urna longos, ex.: "Professora Maria do Carmo"). */
const tamNomeK = (nome: string, base: number) => Math.round(base * (nome.length <= 16 ? 1 : nome.length <= 21 ? 0.88 : 0.78));

/** Largura aproximada (em "em") de um percentual em Bricolage ExtraBold: dígitos ~0,6, vírgula ~0,26, "%" ~0,86. */
function largEm(t: string): number {
  let u = 0;
  for (const ch of t) u += ch === '%' ? 0.86 : ch === ',' ? 0.26 : ch === '–' ? 0.55 : 0.6;
  return u - 0.04 * Math.max(0, t.length - 1);
}

/**
 * Corpo dos DOIS percentuais (o mesmo para os dois — simetria): o maior que cabe na coluna de cada um, até `m.pct`.
 */
function tamPct(m: Medidas, textos: string[]): number {
  const coluna = (m.w - 2 * m.padX - m.pct * 0.34 - 2 * m.gap * 1.2) / 2;
  const maior = Math.max(...textos.map(largEm));
  return Math.floor(Math.min(m.pct, (coluna * 0.96) / maior));
}

function fundoPesquisa(m: Medidas, ...filhos: (No | null)[]): No {
  return h(
    'div',
    {
      width: m.w,
      height: m.h,
      flexDirection: 'column',
      background: C.bg,
      backgroundImage: 'radial-gradient(circle at 12% 0%, rgba(124,92,255,0.26) 0%, rgba(124,92,255,0.06) 40%, rgba(9,9,15,0) 72%)',
      color: C.fg,
      fontFamily: 'Inter',
      position: 'relative',
      padding: `${m.padTop}px ${m.padX}px ${m.padBottom}px`,
    },
    ...filhos,
  );
}

function marcaK(m: Medidas): No {
  return h(
    'div',
    { alignItems: 'center' },
    { type: 'img', props: { src: LOGO_URI, width: m.logo, height: m.logo, style: { width: m.logo, height: m.logo } } },
    h('div', { fontFamily: 'Bricolage', fontWeight: 700, fontSize: m.marca, color: C.fg, letterSpacing: -1, marginLeft: Math.round(m.logo * 0.3) }, 'Sintonia'),
  );
}

function selo(m: Medidas, texto: string): No {
  return h(
    'div',
    {
      alignItems: 'center',
      padding: `${Math.round(m.selo * 0.55)}px ${Math.round(m.selo * 1.05)}px`,
      borderRadius: 999,
      border: `2px solid ${C.line}`,
      background: 'rgba(255,255,255,0.04)',
      color: C.muted,
      fontSize: m.selo,
      fontWeight: 700,
      letterSpacing: 1.6,
    },
    texto,
  );
}

function cabecalho(m: Medidas): No {
  return h('div', { alignItems: 'center', justifyContent: 'space-between' }, marcaK(m), selo(m, 'PESQUISA REGISTRADA NO TSE'));
}

/** Uma coluna de candidato: filete na cor, nome, partido · número e o percentual grande. */
function colunaCandidato(m: Medidas, c: CandidatoCartao, pct: number | undefined, alinhar: 'flex-start' | 'flex-end', fsPct: number): No {
  const cor = corOg(c.cor);
  const direita = alinhar === 'flex-end';
  return h(
    'div',
    { flexDirection: 'column', alignItems: alinhar, flexGrow: 1, flexBasis: 0, minWidth: 0 },
    h('div', { width: Math.round(m.nome * 1.8), height: Math.max(5, Math.round(m.nome * 0.18)), borderRadius: 99, background: cor }),
    // nomes de tamanhos diferentes: o espaço sobra aqui (filetes alinhados em cima, percentuais embaixo)
    h('div', { flexGrow: 1 }),
    h(
      'div',
      {
        fontFamily: 'Bricolage',
        fontWeight: 700,
        fontSize: tamNomeK(c.nome, m.nome),
        color: C.fg,
        marginTop: Math.round(m.nome * 0.4),
        lineHeight: 1.1,
        textAlign: direita ? 'right' : 'left',
        letterSpacing: -0.5,
      },
      c.nome,
    ),
    h('div', { fontSize: m.partido, color: C.muted, marginTop: Math.round(m.partido * 0.3), fontWeight: 600, letterSpacing: 0.5 }, `${c.partido} · ${c.numero}`),
    h(
      'div',
      { fontFamily: 'Bricolage', fontWeight: 800, fontSize: fsPct, color: cor, lineHeight: 1, letterSpacing: -fsPct * 0.04, marginTop: Math.round(m.pct * 0.08) },
      pct === undefined ? '–' : fmtPctPesquisa(pct),
    ),
  );
}

/** Linha "Votos válidos: …" e "Brancos e nulos … · Não sabem …" (só o que o instituto divulgou). */
function linhasExtras(m: Medidas, p: Pesquisa, cands: CandidatoCartao[]): No | null {
  const partes: string[] = [];
  if (p.validos) partes.push(`Votos válidos: ${cands.map((c) => `${c.nome} ${fmtPctPesquisa(p.validos![String(c.numero)])}`).join(' · ')}`);
  const bn = p.totais[CHAVE_BRANCOS_NULOS];
  const ind = p.totais[CHAVE_INDECISOS];
  const outros = [bn !== undefined ? `Branco, nulo ou nenhum: ${fmtPctPesquisa(bn)}` : '', ind !== undefined ? `Não sabem ou não responderam: ${fmtPctPesquisa(ind)}` : ''].filter(Boolean);
  if (outros.length) partes.push(outros.join(' · '));
  if (!partes.length && !p.aviso) return null;
  return h(
    'div',
    { flexDirection: 'column', marginTop: m.gap, fontSize: m.extra, color: C.muted, lineHeight: 1.35 },
    ...partes.map((t) => h('div', {}, t)),
    // informação que a Justiça Eleitoral mandou constar em toda divulgação desta pesquisa
    p.aviso ? h('div', { color: C.fg, fontWeight: 600 }, p.aviso) : null,
  );
}

/** Rodapé com TODAS as informações obrigatórias + aviso + endereço. */
function rodape(m: Medidas, p: Pesquisa, dominio: string): No {
  const itens = informacoesObrigatorias(p);
  const corpo = m.retrato
    ? h(
        'div',
        { flexDirection: 'column' },
        ...itens.map((it) =>
          h(
            'div',
            { fontSize: m.rodape, lineHeight: 1.3, marginTop: Math.round(m.rodape * 0.28) },
            h('div', { color: C.subtle, fontWeight: 600, width: Math.round(m.rodape * 10.4), flexShrink: 0 }, it.rotulo),
            h('div', { color: C.fg, flexGrow: 1, flexBasis: 0, minWidth: 0 }, it.valor),
          ),
        ),
      )
    : (() => {
        const txt = itens.map((it) => `${it.rotulo}: ${it.valor}`).join(' · ');
        const fs = txt.length <= 250 ? m.rodape : txt.length <= 330 ? m.rodape * 0.9 : m.rodape * 0.8;
        return h('div', { fontSize: fs, color: C.fg, lineHeight: 1.38 }, txt);
      })();
  return h(
    'div',
    { flexDirection: 'column', borderTop: `2px solid ${C.line}`, paddingTop: Math.round(m.gap * 0.8) },
    corpo,
    h(
      'div',
      { marginTop: Math.round(m.rodape * 0.55), justifyContent: 'space-between', alignItems: 'flex-end', fontSize: m.rodape * 0.92, color: C.muted, lineHeight: 1.3 },
      h('div', { flexGrow: 1, flexBasis: 0, minWidth: 0, paddingRight: 24 }, AVISO_PESQUISAS),
      h('div', { color: C.brand2, fontWeight: 700, flexShrink: 0 }, `${dominio}/pesquisas`),
    ),
  );
}

export interface OgPesquisaInput {
  pesquisa: Pesquisa;
  /** Os dois candidatos da disputa (da corrida no meta.json), em qualquer ordem: o cartão segue a ordem da urna. */
  candidatos: CandidatoCartao[];
  formato?: FormatoOg;
  dominio?: string | null;
}

/** Cartão de uma pesquisa. */
export function layoutPesquisa(inp: OgPesquisaInput): No {
  const formato = inp.formato ?? 'og';
  const m = MEDIDAS[formato];
  const p = inp.pesquisa;
  const dominio = inp.dominio || DOMINIO_PADRAO_OG;
  const nums = numerosDaPesquisa(p);
  const cands = nums.map(
    (n, i) => inp.candidatos.find((c) => c.numero === n) ?? { numero: n, nome: `Candidato ${n}`, partido: '', cor: (i === 0 ? 'a' : 'b') as CorCandidato },
  );
  const v0 = p.totais[String(cands[0].numero)];
  const v1 = p.totais[String(cands[1].numero)];
  const fsPct = tamPct(m, [v0, v1].map((v) => (v === undefined ? '–' : fmtPctPesquisa(v))));
  const titulo = `Pesquisa ${p.instituto}`;
  const tamTitulo = titulo.length <= 24 ? m.titulo : titulo.length <= 34 ? m.titulo * 0.84 : m.titulo * 0.7;
  return fundoPesquisa(
    m,
    cabecalho(m),
    h(
      'div',
      { fontSize: m.kicker, fontWeight: 700, color: C.brand2, letterSpacing: 2.6, marginTop: Math.round(m.gap * 1.3) },
      `${rotuloCargo(p.cargo).toUpperCase()} · 2º TURNO 2026`,
    ),
    h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: tamTitulo, color: C.fg, letterSpacing: -1.5, lineHeight: 1.05, marginTop: Math.round(m.gap * 0.35) }, titulo),
    h('div', { fontSize: m.sub, color: C.muted, marginTop: Math.round(m.gap * 0.4) }, `Divulgada em ${fmtDataPesquisa(p.divulgadaEm, true)} · votos totais (estimulada)`),
    m.retrato ? h('div', { flexGrow: 1 }) : null,
    h(
      'div',
      { marginTop: Math.round(m.gap * 1.1), alignItems: 'stretch' },
      colunaCandidato(m, cands[0], v0, 'flex-start', fsPct),
      h('div', { alignSelf: 'flex-end', fontFamily: 'Bricolage', fontWeight: 700, fontSize: Math.round(m.pct * 0.34), color: C.subtle, padding: `0 ${Math.round(m.gap * 1.2)}px`, marginBottom: Math.round(fsPct * 0.18) }, '×'),
      colunaCandidato(m, cands[1], v1, 'flex-end', fsPct),
    ),
    linhasExtras(m, p, cands),
    h('div', { flexGrow: m.retrato ? 1.4 : 1 }),
    rodape(m, p, dominio),
  );
}

/** Capa genérica da área (sem número, nome nem foto): o que toda pesquisa publicada aqui traz. */
export function layoutCapaPesquisas(formato: FormatoOg = 'og', dominioIn?: string | null): No {
  const m = MEDIDAS[formato];
  const dominio = dominioIn || DOMINIO_PADRAO_OG;
  const itens = ['Instituto e contratante', 'Número de registro no TSE', 'Período da coleta', 'Número de entrevistas', 'Margem de erro', 'Nível de confiança', 'Link da fonte'];
  const CHECK = `data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#c4a8ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ).toString('base64')}`;
  const lista = h(
    'div',
    {
      flexDirection: 'column',
      borderRadius: 28,
      background: C.surface,
      border: `2px solid ${C.line}`,
      padding: `${Math.round(m.gap * 1.3)}px ${Math.round(m.gap * 1.6)}px`,
      ...(m.retrato ? { marginTop: m.gap * 2 } : { width: 470, marginLeft: 40 }),
    },
    h('div', { fontSize: m.selo, fontWeight: 700, color: C.subtle, letterSpacing: 2.4, marginBottom: Math.round(m.gap * 0.3) }, 'EM CADA PESQUISA'),
    ...itens.map((t) =>
      h(
        'div',
        { alignItems: 'center', fontSize: m.extra * 1.05, color: C.fg, marginTop: Math.round(m.gap * 0.55) },
        { type: 'img', props: { src: CHECK, width: m.extra * 1.15, height: m.extra * 1.15, style: { width: m.extra * 1.15, height: m.extra * 1.15, marginRight: 12 } } },
        t,
      ),
    ),
  );
  const texto = h(
    'div',
    { flexDirection: 'column', flexGrow: 1, flexBasis: 0, minWidth: 0 },
    h('div', { fontSize: m.kicker, fontWeight: 700, color: C.brand2, letterSpacing: 2.6 }, 'ELEIÇÕES 2026 · 2º TURNO'),
    h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: m.titulo * 1.35, color: C.fg, letterSpacing: -2, lineHeight: 1, marginTop: Math.round(m.gap * 0.5) }, 'Pesquisas do 2º turno'),
    h('div', { fontSize: m.sub * 1.15, color: C.muted, marginTop: m.gap, lineHeight: 1.4 }, AVISO_PESQUISAS),
  );
  return fundoPesquisa(
    m,
    cabecalho(m),
    h('div', { flexGrow: 1 }),
    m.retrato ? h('div', { flexDirection: 'column' }, texto, lista) : h('div', { alignItems: 'center' }, texto, lista),
    h('div', { flexGrow: 1 }),
    h('div', { justifyContent: 'flex-end', fontSize: m.rodape, color: C.brand2, fontWeight: 700 }, `${dominio}/pesquisas`),
  );
}

export { DIM_OG };
