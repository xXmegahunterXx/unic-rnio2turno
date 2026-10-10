/**
 * Layouts das imagens de compartilhamento (OG, 1200×630) das páginas além do placar (og.ts): município, boletim de
 * urna da seção, ficha do candidato, Senado/Câmara/Assembleias (hemiciclo), as 7 disputas de governador,
 * curiosidades e cenários. Mesma linguagem visual do placar (tema escuro, marca, selo, kicker, título, rodapé).
 *
 * Regras (ARCHITECTURE §1): cores por slot (A turquesa = menor número; B âmbar) e paleta neutra de partidos;
 * textos descritivos; selo e faixa "SIMULAÇÃO · dados fictícios" em toda imagem com número simulado; nunca foto
 * real com número simulado (quem chama só passa foto em dado real); com nomes ocultos, quem chama já entrega as
 * corridas anonimizadas. Cenário: marca d'água forte "CENÁRIO HIPOTÉTICO · não é pesquisa nem previsão".
 * Números com src/shared/format.ts; percentuais de src/shared/calc.ts (ou já calculados no dado oficial).
 */
import type { CandidatoFicha } from '../shared/dataset';
import type { Curiosidade, CuriosidadesDataset, ValorCuriosidade } from '../shared/curiosidades';
import { TEMAS_CURIOSIDADES } from '../shared/curiosidades';
import type { Cenario, PresidenteT1Dataset, Premissa, ResultadoCenario } from '../shared/cenarios';
import { MARCA_CENARIO, estadosTexto, finalistasDe, pctFinalista, vencedorArea } from '../shared/cenarios';
import type { LocalResumo, Race, SecaoResumo, Summary, UF } from '../shared/types';
import { pctTotalizadas, pctValidos, validos } from '../shared/calc';
import { UF_NOMES } from '../shared/constants';
import { fmtInt, fmtPP, fmtPct } from '../shared/format';
import { C, OG_H, OG_W, fundo, h, iniciais, marca, pill, type Estilo, type No } from './og';
import { COR_PENDENTE, corPartido, porTamanho, svgHemiciclo, type Bancada } from './og-hemiciclo';

// ---------------------------------------------------------------------------------------------
// Peças comuns
// ---------------------------------------------------------------------------------------------

const BRANCO = 'rgb(255,255,255)';
/** Papel do boletim (claro, como o recibo térmico do app no tema escuro) e tintas. */
const PAPEL = 'rgb(244,244,250)';
const TINTA = 'rgb(17,17,26)';
const TINTA_SUAVE = 'rgb(96,96,118)';

const corSlot = (cor: string | undefined) => (cor === 'b' ? C.b : cor === 'a' ? C.a : C.outros);
const tintaSlot = (cor: string | undefined) => (cor === 'b' ? C.bInk : C.aInk);

export function img(src: string, w: number, alt: number, style: Estilo = {}): No {
  return { type: 'img', props: { src, width: w, height: alt, style: { width: w, height: alt, ...style } } };
}

/** Corta o texto em `max` caracteres (com reticências), sem quebrar no meio de espaço. */
export const cortar = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`);

const umaLinha: Estilo = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

export const seloSimulacao = () => pill('SIMULAÇÃO · DADOS FICTÍCIOS', C.brand, BRANCO);
export const seloContorno = (t: string) => pill(t, 'rgba(255,255,255,0.06)', C.fg, C.line);

/** Faixa de 10 px no topo das imagens simuladas (mesma do placar). */
const barraSimulacao = () => h('div', { position: 'absolute', left: 0, top: 0, width: OG_W, height: 10, background: C.brand });

function textoRodape(v: string | No | null | undefined, alinhar: 'flex-start' | 'flex-end', max: number): No | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') return v;
  return h('div', { fontSize: 20, color: C.muted, maxWidth: max, justifyContent: alinhar, ...umaLinha }, v);
}

interface Moldura {
  selo: No;
  kicker: string;
  titulo: string;
  tamTitulo?: number;
  simulacao?: boolean;
  corpo: No;
  rodapeEsq?: string | No | null;
  rodapeDir?: string | No | null;
  /** Camadas absolutas sob o conteúdo (marca d'água). */
  sobre?: (No | null)[];
  /** Faixa no topo (no lugar da barra de simulação). */
  faixa?: No | null;
  padTopo?: number;
}

function moldura(m: Moldura): No {
  const tam = m.tamTitulo ?? 46;
  return fundo(
    m.simulacao ? barraSimulacao() : null,
    ...(m.sobre ?? []),
    m.faixa ?? null,
    h(
      'div',
      { flexDirection: 'column', padding: `${m.padTopo ?? 44}px 64px 38px`, width: OG_W, height: OG_H },
      h('div', { justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }, marca(), m.selo),
      h('div', { fontSize: 20, fontWeight: 600, color: C.brand2, letterSpacing: 3, marginTop: 22, flexShrink: 0, ...umaLinha, maxWidth: OG_W - 128 }, m.kicker),
      h(
        'div',
        { fontFamily: 'Bricolage', fontWeight: 700, fontSize: tam, color: C.fg, marginTop: 2, letterSpacing: -1, lineHeight: 1.12, flexShrink: 0, ...umaLinha, maxWidth: OG_W - 128 },
        m.titulo,
      ),
      h('div', { flexGrow: 1, flexShrink: 1, flexDirection: 'column', marginTop: 18 }, m.corpo),
      h(
        'div',
        { justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12, flexShrink: 0 },
        textoRodape(m.rodapeEsq, 'flex-start', m.rodapeDir ? 860 : OG_W - 128) ?? h('div', {}),
        textoRodape(m.rodapeDir, 'flex-end', 300),
      ),
    ),
  );
}

/** Monograma neutro (iniciais) para quando não há foto oficial utilizável. */
function monograma(nome: string, w: number, alt: number, cor: string, tinta: string, raio: number): No {
  return h(
    'div',
    { width: w, height: alt, borderRadius: raio, background: cor, color: tinta, alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage', fontWeight: 800, fontSize: Math.round(Math.min(w, alt) * 0.38) },
    iniciais(nome),
  );
}

/** Retrato oficial (3:4), mesmo recorte e moldura para todos. */
function retrato(foto: string, w: number, alt: number, raio: number, borda: string): No {
  return h(
    'div',
    { width: w + 8, height: alt + 8, borderRadius: raio + 4, background: borda, alignItems: 'center', justifyContent: 'center' },
    img(foto, w, alt, { borderRadius: raio, objectFit: 'cover' }),
  );
}

const fmtUf = (uf: UF | 'BR' | string) => (uf === 'BR' ? 'Brasil' : uf === 'ZZ' ? 'Exterior' : (UF_NOMES as Record<string, string>)[uf] ?? uf);

// ---------------------------------------------------------------------------------------------
// Boletim de urna da seção
// ---------------------------------------------------------------------------------------------

export interface TurnoSecao {
  /** Corrida para exibição (anônima quando a simulação oculta os nomes). */
  race: Race;
  /** null = seção sem dado nesta disputa. */
  detalhe: SecaoResumo | null;
}

export interface OgSecaoInput {
  uf: UF;
  nomeMunicipio: string;
  zona: number;
  secao: number;
  local?: LocalResumo | null;
  /** 2º turno (ausente antes da apuração). */
  t2?: TurnoSecao | null;
  /** 1º turno oficial da seção. */
  t1?: TurnoSecao | null;
  /** Números do 2º turno simulados. */
  simulacao: boolean;
  dominio?: string;
}

const f4 = (n: number) => String(n).padStart(4, '0');

function linhaBu(nome: string, votos: string, pct: string | null, cor: string | null, fs: number, forte = false): No {
  return h(
    'div',
    { justifyContent: 'space-between', alignItems: 'center', width: '100%', fontSize: fs, lineHeight: 1.42, fontWeight: forte ? 700 : 400 },
    h(
      'div',
      { alignItems: 'center', gap: 10, flexGrow: 1, flexShrink: 1, minWidth: 0 },
      cor ? h('div', { width: 13, height: 13, borderRadius: 3, background: cor, flexShrink: 0 }) : h('div', { width: 13, height: 13, flexShrink: 0 }),
      h('div', { ...umaLinha, maxWidth: 260 }, nome.toUpperCase()),
    ),
    h('div', { width: 78, justifyContent: 'flex-end', flexShrink: 0 }, votos),
    pct === null ? null : h('div', { width: 104, justifyContent: 'flex-end', flexShrink: 0, fontWeight: 700 }, pct),
  );
}

const regua = () => h('div', { width: '100%', height: 0, borderTop: `2px dashed rgba(17,17,26,0.28)`, marginTop: 8, marginBottom: 8 });

function blocoTurno(rotulo: string, t: TurnoSecao, fs: number, carimbo: string | null): No {
  const d = t.detalhe;
  const linhas: (No | null)[] = [];
  if (!d || !d.totalizada) {
    linhas.push(h('div', { fontSize: fs, color: TINTA_SUAVE, lineHeight: 1.42 }, d ? 'AGUARDANDO TOTALIZAÇÃO' : 'SEM DADOS DESTA SEÇÃO'));
  } else {
    t.race.candidatos.forEach((c, i) => {
      const v = d.votos[i] ?? 0;
      const nome = c.agregado ? 'Demais candidatos' : c.nomeUrna;
      linhas.push(linhaBu(nome, fmtInt(v), validos(d) > 0 ? fmtPct(pctValidos(d, i)) : '—', corSlot(c.agregado ? 'outros' : c.cor), fs, !c.agregado));
    });
    linhas.push(linhaBu('Brancos', fmtInt(d.brancos), null, null, fs));
    linhas.push(linhaBu('Nulos', fmtInt(d.nulos), null, null, fs));
  }
  return h(
    'div',
    { flexDirection: 'column', width: '100%', position: 'relative' },
    h('div', { fontSize: fs - 2, letterSpacing: 2, color: TINTA_SUAVE, marginBottom: 4 }, rotulo),
    ...linhas,
    carimbo
      ? h(
          'div',
          {
            position: 'absolute',
            right: 4,
            top: -17,
            border: `3px solid ${C.brand}`,
            color: C.brand,
            borderRadius: 8,
            padding: '1px 10px',
            fontSize: fs,
            fontWeight: 700,
            letterSpacing: 3,
            transform: 'rotate(-6deg)',
            background: 'rgba(244,244,250,0.92)',
          },
          carimbo,
        )
      : null,
  );
}

function recibo(inp: OgSecaoInput, w: number, alt: number): No {
  const tem2 = !!inp.t2;
  const fs = tem2 ? 17 : 20;
  const ref = inp.t2?.detalhe ?? inp.t1?.detalhe;
  const cargo = (inp.t2?.race ?? inp.t1?.race)?.cargo === 'Governador' ? 'GOVERNADOR' : 'PRESIDENTE';
  const dentes: No[] = [];
  const n = Math.floor(w / 18);
  for (let i = 0; i < n; i++) {
    const x = Math.round((w - n * 18) / 2 + i * 18 + 2);
    dentes.push(h('div', { position: 'absolute', left: x, top: -7, width: 14, height: 14, borderRadius: 7, background: C.bg }));
    dentes.push(h('div', { position: 'absolute', left: x, top: alt - 7, width: 14, height: 14, borderRadius: 7, background: C.bg }));
  }
  return h(
    'div',
    { position: 'relative', width: w, height: alt, background: PAPEL, color: TINTA, fontFamily: 'Mono', flexDirection: 'column', padding: '30px 28px 26px' },
    ...dentes,
    h('div', { fontSize: fs + 3, fontWeight: 700, letterSpacing: 3 }, 'BOLETIM DE URNA'),
    h('div', { fontSize: fs - 1, color: TINTA_SUAVE, marginTop: 2, letterSpacing: 1 }, `ELEIÇÕES 2026 · ${cargo}`),
    h('div', { fontSize: fs, marginTop: 6, letterSpacing: 1, fontWeight: 700 }, `ZONA ${f4(inp.zona)} · SEÇÃO ${f4(inp.secao)}`),
    regua(),
    inp.t2 ? blocoTurno('2º TURNO · 25/10/2026', inp.t2, fs, inp.simulacao ? 'SIMULAÇÃO' : null) : null,
    inp.t2 ? regua() : null,
    inp.t1 ? blocoTurno('1º TURNO · 04/10/2026 · OFICIAL', inp.t1, fs, null) : null,
    regua(),
    ref ? linhaBu('Eleitores aptos', fmtInt(ref.aptos), null, null, fs - 1) : null,
    ref && ref.totalizada ? linhaBu('Comparecimento', fmtInt(ref.comparecimento), null, null, fs - 1) : null,
  );
}

/** Bloco de destaque à esquerda: os dois finalistas, % dos válidos na seção. */
function destaqueSecao(rotulo: string, t: TurnoSecao): No | null {
  const d = t.detalhe;
  if (!d || !d.totalizada || validos(d) <= 0) return null;
  const idx = t.race.candidatos.map((c, i) => (c.agregado ? -1 : i)).filter((i) => i >= 0).slice(0, 2);
  return h(
    'div',
    { flexDirection: 'column' },
    h('div', { fontSize: 18, fontWeight: 600, color: C.muted, letterSpacing: 2 }, rotulo),
    h(
      'div',
      { gap: 28, marginTop: 8 },
      ...idx.map((i) => {
        const c = t.race.candidatos[i];
        return h(
          'div',
          { flexDirection: 'column', width: 250 },
          h('div', { fontSize: 22, color: C.fg, fontWeight: 600, ...umaLinha, maxWidth: 250 }, c.nomeUrna),
          h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 62, color: corSlot(c.cor), lineHeight: 1, letterSpacing: -2, marginTop: 4 }, fmtPct(pctValidos(d, i))),
          h('div', { fontSize: 18, color: C.muted, marginTop: 4 }, `${fmtInt(d.votos[i] ?? 0)} votos`),
        );
      }),
    ),
  );
}

export function layoutSecao(inp: OgSecaoInput): No {
  const onde = `${inp.nomeMunicipio} (${inp.uf === 'ZZ' ? 'Exterior' : inp.uf})`;
  const t2ok = inp.t2?.detalhe?.totalizada;
  const destaque = t2ok
    ? destaqueSecao(inp.simulacao ? '2º TURNO NESTA SEÇÃO · SIMULAÇÃO' : '2º TURNO NESTA SEÇÃO', inp.t2!)
    : inp.t1
      ? destaqueSecao('1º TURNO NESTA SEÇÃO · OFICIAL', inp.t1)
      : null;
  const selo = inp.simulacao && inp.t2 ? seloSimulacao() : seloContorno(inp.t2 ? 'BOLETIM DE URNA' : 'RESULTADO OFICIAL · TSE');
  const aviso2 = inp.t2 && !t2ok ? 'Esta seção ainda não foi totalizada no 2º turno.' : null;
  const local = inp.local?.nome ? cortar(inp.local.nome, 64) : null;
  const esquerda = h(
    'div',
    { flexDirection: 'column', width: 560, height: OG_H, padding: '44px 0 38px 64px' },
    marca(),
    h('div', { marginTop: 26 }, selo),
    h('div', { fontSize: 20, fontWeight: 600, color: C.brand2, letterSpacing: 3, marginTop: 22 }, `ZONA ${inp.zona} · SEÇÃO ${inp.secao}`),
    h(
      'div',
      { fontFamily: 'Bricolage', fontWeight: 700, fontSize: onde.length > 26 ? 36 : 44, color: C.fg, marginTop: 4, letterSpacing: -1, lineHeight: 1.1, maxWidth: 480 },
      onde,
    ),
    local ? h('div', { fontSize: 20, color: C.muted, marginTop: 8, maxWidth: 470, lineHeight: 1.3 }, local) : null,
    h('div', { flexGrow: 1 }),
    aviso2 ? h('div', { fontSize: 20, color: C.fg, marginBottom: 16 }, aviso2) : null,
    destaque,
    h('div', { flexGrow: 1 }),
    h(
      'div',
      { flexDirection: 'column' },
      h('div', { fontSize: 18, color: C.subtle }, inp.simulacao && inp.t2 ? '2º turno: SIMULAÇÃO · dados fictícios' : 'Fonte: TSE · resultado por seção'),
      inp.dominio ? h('div', { fontSize: 18, color: C.muted, marginTop: 4 }, inp.dominio) : null,
    ),
  );
  return fundo(
    inp.simulacao && inp.t2 ? barraSimulacao() : null,
    h('div', { width: OG_W, height: OG_H, alignItems: 'center' }, esquerda, h('div', { flexGrow: 1, justifyContent: 'center', alignItems: 'center', height: OG_H }, recibo(inp, 520, inp.t2 ? 566 : 416))),
  );
}

// ---------------------------------------------------------------------------------------------
// Ficha do candidato (dado real do TSE)
// ---------------------------------------------------------------------------------------------

export interface OgCandidatoInput {
  ficha: CandidatoFicha;
  /** Cargo de exibição, com gênero ("Senadora"). */
  cargo: string;
  /** Situação por extenso, curta ("ELEITA", "2º TURNO"…), ou null. */
  situacao: string | null;
  /** Foto oficial (data URI JPEG/PNG) ou null → monograma. */
  foto: string | null;
  dominio?: string;
}

const tamNomeFicha = (n: string) => (n.length <= 12 ? 80 : n.length <= 17 ? 68 : n.length <= 23 ? 56 : 46);

export function layoutCandidato(inp: OgCandidatoInput): No {
  const f = inp.ficha;
  const corP = corPartido(f.partido);
  const FW = 222;
  const FH = 296;
  const visual = inp.foto ? retrato(inp.foto, FW, FH, 20, 'rgba(255,255,255,0.14)') : monograma(f.nomeUrna, FW + 8, FH + 8, C.surface3, C.fg, 24);
  const onde = f.uf === 'BR' ? 'Brasil' : fmtUf(f.uf);
  const r = f.resultado;
  const resultado = r
    ? h(
        'div',
        { flexDirection: 'column', marginTop: 24 },
        h('div', { fontSize: 18, fontWeight: 600, color: C.muted, letterSpacing: 2 }, '1º TURNO · 04/10/2026'),
        h(
          'div',
          { alignItems: 'flex-end', gap: 16, marginTop: 4 },
          h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 72, color: C.fg, lineHeight: 1, letterSpacing: -2 }, fmtInt(r.votos)),
          h('div', { fontSize: 28, color: C.muted, marginBottom: 8 }, r.votos === 1 ? 'voto' : 'votos'),
        ),
        h(
          'div',
          { alignItems: 'center', gap: 14, marginTop: 12, height: 46 },
          h('div', { fontSize: 26, color: C.fg, fontWeight: 600 }, `${fmtPct(r.pct)} dos válidos`),
          inp.situacao ? pill(inp.situacao, C.brand, BRANCO) : null,
        ),
      )
    : inp.situacao
      ? h('div', { marginTop: 28 }, pill(inp.situacao, C.brand, BRANCO))
      : null;
  return fundo(
    h(
      'div',
      { flexDirection: 'column', padding: '44px 64px 38px', width: OG_W, height: OG_H },
      h('div', { justifyContent: 'space-between', alignItems: 'center' }, marca(), seloContorno('DADOS PÚBLICOS · TSE')),
      h(
        'div',
        { marginTop: 30, alignItems: 'center', gap: 48, flexGrow: 1 },
        visual,
        h(
          'div',
          { flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0 },
          h('div', { fontSize: 20, fontWeight: 600, color: C.brand2, letterSpacing: 3 }, 'FICHA DO CANDIDATO · 2026'),
          h(
            'div',
            { fontFamily: 'Bricolage', fontWeight: 800, fontSize: tamNomeFicha(f.nomeUrna), color: C.fg, letterSpacing: -2, lineHeight: 1.04, marginTop: 6, ...umaLinha, maxWidth: 720 },
            f.nomeUrna,
          ),
          h(
            'div',
            { alignItems: 'center', gap: 12, marginTop: 12 },
            h('div', { width: 18, height: 18, borderRadius: 5, background: corP }),
            h('div', { fontSize: 28, fontWeight: 700, color: C.fg }, f.partido),
            h('div', { fontSize: 28, color: C.muted }, `· ${f.numero}`),
          ),
          h('div', { fontSize: 26, color: C.muted, marginTop: 8, ...umaLinha, maxWidth: 720 }, `${inp.cargo} · ${onde}`),
          resultado,
        ),
      ),
      h(
        'div',
        { justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 },
        h('div', { fontSize: 20, color: C.muted }, 'Fonte: TSE · dados públicos de candidatura e resultado oficial'),
        inp.dominio ? h('div', { fontSize: 20, color: C.muted }, inp.dominio) : h('div', {}),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Composição (Senado, Câmara, Assembleias): mini hemiciclo + maiores bancadas
// ---------------------------------------------------------------------------------------------

export interface OgComposicaoInput {
  kicker: string;
  titulo: string;
  bancadas: Bancada[];
  /** Cadeiras sem resultado divulgado (ex.: AM em reprocessamento). */
  pendentes: number;
  /** "cadeiras" | "vagas em 2026" */
  rotuloTotal: string;
  /** Nota sob a lista (ex.: "8 cadeiras do AM aguardam o TSE"). */
  nota?: string | null;
  /** Quantas bancadas listar. */
  listar?: number;
  dominio?: string;
}

export function layoutComposicao(inp: OgComposicaoInput): No {
  const W = 560;
  const hem = svgHemiciclo(inp.bancadas, inp.pendentes, W);
  const lista = porTamanho(inp.bancadas);
  const n = Math.min(lista.length, inp.listar ?? (inp.pendentes > 0 ? 6 : 7));
  const top = lista.slice(0, n);
  const resto = lista.slice(n).reduce((s, b) => s + b.eleitos, 0);
  const maior = Math.max(1, ...top.map((b) => b.eleitos));
  const linhas = top.map((b) =>
    h(
      'div',
      { alignItems: 'center', height: 38, gap: 14 },
      h('div', { width: 20, height: 20, borderRadius: 5, background: corPartido(b.sigla), flexShrink: 0 }),
      h('div', { width: 206, fontSize: 24, fontWeight: 700, color: C.fg, ...umaLinha }, b.sigla),
      h('div', { width: 140, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.06)' }, h('div', { width: Math.max(6, Math.round((140 * b.eleitos) / maior)), height: 10, borderRadius: 5, background: corPartido(b.sigla) })),
      h('div', { width: 60, justifyContent: 'flex-end', fontSize: 24, fontWeight: 700, color: C.fg }, fmtInt(b.eleitos)),
    ),
  );
  const corpo = h(
    'div',
    { justifyContent: 'space-between', alignItems: 'flex-end', flexGrow: 1 },
    h(
      'div',
      { position: 'relative', width: W, height: hem.h, marginBottom: 4 },
      img(hem.uri, W, hem.h),
      h(
        'div',
        { position: 'absolute', left: 0, top: hem.h - 96, width: W, flexDirection: 'column', alignItems: 'center' },
        h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 64, color: C.fg, lineHeight: 1, letterSpacing: -2 }, fmtInt(hem.total)),
        h('div', { fontSize: 20, color: C.muted, marginTop: 2 }, inp.rotuloTotal),
      ),
    ),
    h(
      'div',
      { flexDirection: 'column', width: 470 },
      top.length
        ? h('div', { fontSize: 18, fontWeight: 600, color: C.muted, letterSpacing: 2, marginBottom: 6 }, 'MAIORES BANCADAS')
        : h('div', { fontFamily: 'Bricolage', fontWeight: 700, fontSize: 34, color: C.fg, lineHeight: 1.15, marginBottom: 10 }, 'Resultado ainda não divulgado pelo TSE'),
      ...linhas,
      resto > 0 ? h('div', { fontSize: 20, color: C.muted, marginTop: 8 }, `Demais partidos: ${fmtInt(resto)} ${resto === 1 ? 'cadeira' : 'cadeiras'}`) : null,
      inp.pendentes > 0 ? h('div', { alignItems: 'center', gap: 10, marginTop: 6 }, h('div', { width: 16, height: 16, borderRadius: 8, background: COR_PENDENTE, border: '1px solid rgba(244,244,250,0.3)' }), h('div', { fontSize: 20, color: C.muted }, inp.nota ?? `${fmtInt(inp.pendentes)} aguardando o TSE`)) : null,
    ),
  );
  return moldura({
    selo: seloContorno('RESULTADO OFICIAL · TSE'),
    kicker: inp.kicker,
    titulo: inp.titulo,
    corpo,
    rodapeEsq: 'Cores neutras por partido (por tamanho de bancada, nunca por espectro) · fonte: TSE',
    rodapeDir: inp.dominio ?? null,
  });
}

// ---------------------------------------------------------------------------------------------
// Senado numa UF: os eleitos (foto oficial quando todos têm)
// ---------------------------------------------------------------------------------------------

export interface OgEleitoInput {
  nomeUrna: string;
  partido: string;
  numero: number;
  votos: number;
  pct: number;
  rotulo: string;
}

export function layoutEleitosUf(inp: { uf: UF; titulo: string; kicker: string; eleitos: OgEleitoInput[]; fotos: string[] | null; dominio?: string }): No {
  const FW = 132;
  const FH = 176;
  const cards = inp.eleitos.slice(0, 3).map((e, i) =>
    h(
      'div',
      { flexDirection: 'column', width: inp.eleitos.length > 2 ? 340 : 500, background: 'rgba(255,255,255,0.04)', border: `2px solid ${C.line}`, borderRadius: 24, padding: 24, gap: 20 },
      h(
        'div',
        { alignItems: 'center', gap: 22 },
        inp.fotos ? retrato(inp.fotos[i], FW, FH, 16, 'rgba(255,255,255,0.14)') : monograma(e.nomeUrna, FW + 8, FH + 8, C.surface3, C.fg, 18),
        h(
          'div',
          { flexDirection: 'column', flexShrink: 1, minWidth: 0 },
          h('div', { fontSize: 16, fontWeight: 600, color: C.muted, letterSpacing: 2 }, e.rotulo),
          h('div', { fontFamily: 'Bricolage', fontWeight: 700, fontSize: e.nomeUrna.length > 16 ? 30 : 36, color: C.fg, lineHeight: 1.1, marginTop: 4, ...umaLinha, maxWidth: inp.eleitos.length > 2 ? 150 : 300 }, e.nomeUrna),
          h('div', { alignItems: 'center', gap: 8, marginTop: 8 }, h('div', { width: 14, height: 14, borderRadius: 4, background: corPartido(e.partido) }), h('div', { fontSize: 22, color: C.fg, fontWeight: 600 }, e.partido), h('div', { fontSize: 22, color: C.muted }, `· ${e.numero}`)),
          h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 40, color: C.fg, marginTop: 10, lineHeight: 1 }, fmtInt(e.votos)),
          h('div', { fontSize: 20, color: C.muted, marginTop: 4 }, `votos · ${fmtPct(e.pct)} dos válidos`),
        ),
      ),
    ),
  );
  return moldura({
    selo: seloContorno('RESULTADO OFICIAL · TSE'),
    kicker: inp.kicker,
    titulo: inp.titulo,
    corpo: h('div', { justifyContent: 'space-between', alignItems: 'center', flexGrow: 1 }, ...cards),
    rodapeEsq: 'Fonte: TSE · resultado oficial do 1º turno (04/10/2026)',
    rodapeDir: inp.dominio ?? null,
  });
}

// ---------------------------------------------------------------------------------------------
// As 7 disputas de governador
// ---------------------------------------------------------------------------------------------

export interface DisputaGov {
  uf: UF;
  /** Corrida exibida (2º turno ou o 1º turno antes da apuração), já anonimizada se for o caso. */
  race: Race;
  resumo: Summary;
}

export interface OgGovernadoresInput {
  disputas: DisputaGov[];
  /** true antes da apuração (mostra o 1º turno). */
  primeiroTurno: boolean;
  simulacao: boolean;
  aoVivo: boolean;
  /** Nomes ocultos na simulação: sem a linha "partido · número" (fictícia). */
  anonimizado?: boolean;
  dominio?: string;
}

function linhaGov(d: DisputaGov, anonimizado: boolean): No {
  const idx = d.race.candidatos.map((c, i) => (c.agregado ? -1 : i)).filter((i) => i >= 0);
  const [ia, ib] = [idx[0] ?? 0, idx[1] ?? 1];
  const r = d.resumo;
  const tem = validos(r) > 0;
  const va = r.votos[ia] ?? 0;
  const vb = r.votos[ib] ?? 0;
  const BW = 196;
  const wa = va + vb > 0 ? Math.round(((BW - 4) * va) / (va + vb)) : 0;
  const eleito = (i: number) => d.race.turno === 2 && r.eleito === i;
  const lado = (i: number, alinhar: 'flex-start' | 'flex-end') => {
    const c = d.race.candidatos[i];
    return h(
      'div',
      { flexDirection: 'column', alignItems: alinhar, width: 240 },
      h('div', { fontSize: 21, fontWeight: 600, color: C.fg, lineHeight: 1.15, ...umaLinha, maxWidth: 240 }, c.nomeUrna),
      eleito(i) || !anonimizado
        ? h('div', { fontSize: 14, color: eleito(i) ? C.brand2 : C.subtle, fontWeight: eleito(i) ? 700 : 400, letterSpacing: eleito(i) ? 1 : 0 }, eleito(i) ? (r.status === 'encerrada' ? 'ELEITO' : 'MATEMATICAMENTE ELEITO') : `${c.partido} · ${c.numero}`)
        : null,
    );
  };
  const pct = (i: number, cor: string, alinhar: 'flex-start' | 'flex-end') =>
    h('div', { width: 128, justifyContent: alinhar, fontFamily: 'Bricolage', fontWeight: 800, fontSize: 32, color: cor, letterSpacing: -1 }, tem ? fmtPct(pctValidos(r, i)) : '—');
  return h(
    'div',
    { alignItems: 'center', height: 48, gap: 12 },
    h('div', { width: 50, height: 38, borderRadius: 9, background: C.surface3, alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage', fontWeight: 700, fontSize: 20, color: C.fg, flexShrink: 0 }, d.uf),
    lado(ia, 'flex-end'),
    pct(ia, C.a, 'flex-end'),
    h(
      'div',
      { flexDirection: 'column', alignItems: 'center', width: BW },
      tem
        ? h('div', { width: BW, height: 12, position: 'relative' }, h('div', { width: wa, height: 12, background: C.a, borderRadius: '6px 0 0 6px' }), h('div', { width: 4, height: 12 }), h('div', { width: BW - 4 - wa, height: 12, background: C.b, borderRadius: '0 6px 6px 0' }), h('div', { position: 'absolute', left: BW / 2 - 1, top: -4, width: 2, height: 20, background: 'rgba(244,244,250,0.8)' }))
        : h('div', { width: BW, height: 12, borderRadius: 6, background: C.pending }),
      d.race.turno === 1 ? null : h('div', { fontSize: 13, color: C.subtle, marginTop: 3 }, `${fmtPct(pctTotalizadas(r), 0)} das seções`),
    ),
    pct(ib, C.b, 'flex-start'),
    lado(ib, 'flex-start'),
  );
}

export function layoutGovernadores(inp: OgGovernadoresInput): No {
  const selo = inp.simulacao ? seloSimulacao() : inp.primeiroTurno ? seloContorno('1º TURNO · RESULTADO OFICIAL') : seloContorno(inp.aoVivo ? 'AO VIVO' : 'APURAÇÃO ENCERRADA');
  return moldura({
    simulacao: inp.simulacao,
    selo,
    kicker: inp.primeiroTurno ? 'GOVERNADORES · 1º TURNO 2026 · % DOS VÁLIDOS' : 'GOVERNADORES · 2º TURNO 2026 · % DOS VÁLIDOS',
    titulo: inp.primeiroTurno ? 'As 7 disputas de governador no 2º turno' : 'As 7 disputas de governador',
    tamTitulo: 38,
    padTopo: 34,
    corpo: h('div', { flexDirection: 'column', gap: 3, marginTop: -8 }, ...inp.disputas.slice(0, 7).map((d) => linhaGov(d, !!inp.anonimizado))),
    rodapeEsq: inp.simulacao ? 'SIMULAÇÃO · dados fictícios' : inp.primeiroTurno ? 'Resultado do 1º turno · 2º turno em 25/10, a partir das 17h' : 'Fonte: TSE',
    rodapeDir: inp.dominio ?? null,
  });
}

// ---------------------------------------------------------------------------------------------
// Curiosidades (dado real do 1º turno)
// ---------------------------------------------------------------------------------------------

/** 158.745.502 · 52,84% · 0,78 p.p. (magnitude, sem sinal) — igual ao fmtValor do app. */
export function fmtValorCuriosidade(v: ValorCuriosidade): string {
  if (v.formato === 'pct') return fmtPct(v.valor, v.casas ?? 2);
  if (v.formato === 'pp') return fmtPP(Math.abs(v.valor), v.casas === 1 ? 1 : 2).replace(/^[+−-]/, '');
  return fmtInt(v.valor);
}

const tamNumero = (t: string, base: number) => {
  const n = t.replace(/\s/g, '').length;
  return n <= 5 ? base : n <= 8 ? Math.round(base * 0.86) : n <= 11 ? Math.round(base * 0.74) : Math.round(base * 0.6);
};

export const rotuloTemaCuriosidade = (t: string) => TEMAS_CURIOSIDADES.find((x) => x.id === t)?.rotulo ?? t;

export function layoutCuriosidade(inp: { fato: Curiosidade; finalistas: CuriosidadesDataset['finalistas']; dominio?: string }): No {
  const f = inp.fato;
  let miolo: No;
  if (f.par) {
    const lado = (slot: 'a' | 'b') => {
      const l = f.par![slot];
      const fin = inp.finalistas[slot];
      const valor = fmtValorCuriosidade(l.valor);
      return h(
        'div',
        { flexDirection: 'column', width: 510 },
        h('div', { alignItems: 'center', gap: 10 }, h('div', { width: 16, height: 16, borderRadius: 8, background: corSlot(slot) }), h('div', { fontSize: 24, fontWeight: 600, color: C.fg, ...umaLinha, maxWidth: 470 }, `${fin.nomeUrna} (${fin.partido})`)),
        h(
          'div',
          { alignItems: 'flex-end', gap: 12, marginTop: 6 },
          h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: tamNumero(valor, 96), color: corSlot(slot), lineHeight: 1, letterSpacing: -3 }, valor),
          l.valor.unidade ? h('div', { fontSize: 24, color: C.muted, marginBottom: 8, ...umaLinha, maxWidth: 220 }, l.valor.unidade) : null,
        ),
        h('div', { fontSize: 22, color: C.fg, marginTop: 8, ...umaLinha, maxWidth: 500 }, cortar(l.rotulo, 44)),
        l.lugar?.nome && l.lugar.nome !== l.rotulo && !l.rotulo.includes(l.lugar.nome)
          ? h('div', { fontSize: 20, color: C.muted, marginTop: 2, ...umaLinha, maxWidth: 500 }, cortar(l.lugar.nome, 46))
          : null,
      );
    };
    miolo = h(
      'div',
      { flexDirection: 'column' },
      f.destaque ? h('div', { fontSize: 28, fontWeight: 700, color: C.brand2, marginBottom: 12 }, `${fmtValorCuriosidade(f.destaque)}${f.destaque.unidade ? ` ${f.destaque.unidade}` : ''}`) : null,
      h('div', { justifyContent: 'space-between' }, lado('a'), lado('b')),
    );
  } else if (f.destaque) {
    const valor = fmtValorCuriosidade(f.destaque);
    miolo = h(
      'div',
      { flexDirection: 'column' },
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: tamNumero(valor, 150), color: C.fg, lineHeight: 0.95, letterSpacing: -4 }, valor),
      f.destaque.unidade ? h('div', { fontSize: 32, color: C.brand2, fontWeight: 600, marginTop: 8, ...umaLinha, maxWidth: OG_W - 128 }, f.destaque.unidade) : null,
    );
  } else {
    miolo = h('div', {});
  }
  return moldura({
    selo: seloContorno('DADOS OFICIAIS · TSE'),
    kicker: `CURIOSIDADES DO 1º TURNO · ${rotuloTemaCuriosidade(f.tema).toUpperCase()}`,
    titulo: f.titulo,
    tamTitulo: 50,
    corpo: h(
      'div',
      { flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1 },
      miolo,
      h('div', { fontSize: 24, color: C.muted, lineHeight: 1.34, maxWidth: OG_W - 128, marginTop: 14 }, cortar(f.contexto, f.par && f.destaque ? 200 : 250)),
    ),
    rodapeEsq: cortar(`Fonte: ${f.fonte}`, 84),
    rodapeDir: inp.dominio ?? null,
  });
}

/** Capa de /curiosidades: três fatos com número em destaque. */
export function layoutCuriosidadesCapa(inp: { fatos: Curiosidade[]; total: number; dominio?: string }): No {
  const tiles = inp.fatos.slice(0, 3).map((f) => {
    const v = f.destaque ? fmtValorCuriosidade(f.destaque) : '';
    return h(
      'div',
      { flexDirection: 'column', width: 336, height: 252, background: 'rgba(255,255,255,0.04)', border: `2px solid ${C.line}`, borderRadius: 24, padding: '22px 24px' },
      h('div', { fontSize: 16, fontWeight: 600, color: C.brand2, letterSpacing: 2 }, rotuloTemaCuriosidade(f.tema).toUpperCase()),
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: tamNumero(v, 72), color: C.fg, lineHeight: 1, letterSpacing: -2, marginTop: 16 }, v),
      h('div', { fontSize: 20, color: C.muted, marginTop: 8, lineHeight: 1.25 }, cortar(f.destaque?.unidade ?? '', 40)),
      h('div', { flexGrow: 1 }),
      h('div', { fontSize: 21, fontWeight: 600, color: C.fg, lineHeight: 1.25 }, cortar(f.titulo, 44)),
    );
  });
  return moldura({
    selo: seloContorno('DADOS OFICIAIS · TSE'),
    kicker: `${fmtInt(inp.total)} FATOS DO 1º TURNO DE 2026`,
    titulo: 'Curiosidades da eleição',
    tamTitulo: 52,
    corpo: h('div', { justifyContent: 'space-between', alignItems: 'flex-end', flexGrow: 1 }, ...tiles),
    rodapeEsq: 'Recordes, empates e números calculados com os dados oficiais do TSE',
    rodapeDir: inp.dominio ?? null,
  });
}

// ---------------------------------------------------------------------------------------------
// Cenários ("E se…?"): hipotético, com marca d'água forte
// ---------------------------------------------------------------------------------------------

/** Faixa do topo e marca d'água diagonal "CENÁRIO HIPOTÉTICO" (sobre o fundo, sob o conteúdo). */
function marcaDaguaCenario(): No[] {
  const diag = (top: number, left: number) =>
    h(
      'div',
      { position: 'absolute', top, left, transform: 'rotate(-16deg)', fontFamily: 'Bricolage', fontWeight: 800, fontSize: 112, color: 'rgba(255,255,255,0.055)', letterSpacing: -2, whiteSpace: 'nowrap' },
      'CENÁRIO HIPOTÉTICO',
    );
  return [diag(150, -60), diag(400, 240)];
}

function faixaCenario(): No {
  return h(
    'div',
    { position: 'absolute', left: 0, top: 0, width: OG_W, height: 46, background: C.brand, alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: BRANCO, letterSpacing: 2.5 },
    MARCA_CENARIO.toUpperCase(),
  );
}

/** Os 27 estados em fila, na cor de quem fica à frente no cenário (empate em cinza). */
function faixaEstados(r: ResultadoCenario, W: number): No {
  const ufs = r.ufs.filter((u) => u.uf !== 'ZZ');
  const gap = 4;
  const tw = Math.floor((W - gap * (ufs.length - 1)) / Math.max(1, ufs.length));
  return h(
    'div',
    { gap, marginTop: 12 },
    ...ufs.map((u) => {
      const v = vencedorArea(u);
      const bg = v === 0 ? C.a : v === 1 ? C.b : C.outros;
      const tinta = v === 0 ? C.aInk : v === 1 ? C.bInk : C.bg;
      return h('div', { width: tw, height: 34, borderRadius: 7, background: bg, color: tinta, alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }, u.uf);
    }),
  );
}

export interface OgCenarioInput {
  ds: PresidenteT1Dataset;
  cenario: Cenario;
  resultado: ResultadoCenario;
  premissas: Premissa[];
  dominio?: string;
}

export function layoutCenario(inp: OgCenarioInput): No {
  const { a, b } = finalistasDe(inp.ds);
  const r = inp.resultado;
  const va = r.brasil.votos[0];
  const vb = r.brasil.votos[1];
  const W = OG_W - 128;
  const wa = va + vb > 0 ? Math.round(((W - 6) * va) / (va + vb)) : Math.round((W - 6) / 2);
  const col = (cand: typeof a, i: 0 | 1, alinhar: 'flex-start' | 'flex-end') =>
    h(
      'div',
      { flexDirection: 'column', alignItems: alinhar, width: 520 },
      h('div', { alignItems: 'center', gap: 10 }, h('div', { fontFamily: 'Bricolage', fontWeight: 700, fontSize: 34, color: C.fg, ...umaLinha, maxWidth: 440 }, cand.nomeUrna), h('div', { fontSize: 22, color: C.muted }, `${cand.partido} · ${cand.numero}`)),
      h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 92, color: i === 0 ? C.a : C.b, lineHeight: 1, letterSpacing: -3, marginTop: 4 }, fmtPct(pctFinalista(r.brasil, i))),
      h('div', { fontSize: 20, color: C.muted, marginTop: 2 }, `${fmtInt(r.brasil.votos[i])} votos (hipotéticos)`),
    );
  const premissas = inp.premissas
    .filter((p) => p.id === 'eliminados' || p.id === 'brancos' || p.id === 'comparecimento')
    .map((p) =>
      h(
        'div',
        { alignItems: 'flex-start', gap: 10, marginTop: 6, width: W },
        h('div', { fontSize: 18, fontWeight: 700, color: C.brand2, flexShrink: 0, lineHeight: 1.35, ...umaLinha, maxWidth: 420 }, cortar(p.rotulo, 46)),
        h('div', { fontSize: 18, color: C.muted, lineHeight: 1.35, flexShrink: 1, minWidth: 0 }, cortar(p.texto, 200)),
      ),
    );
  return fundo(
    ...marcaDaguaCenario(),
    faixaCenario(),
    h(
      'div',
      { flexDirection: 'column', padding: '62px 64px 32px', width: OG_W, height: OG_H },
      h('div', { justifyContent: 'space-between', alignItems: 'center' }, marca(), seloContorno('E SE…? MONTE SEU CENÁRIO')),
      h('div', { justifyContent: 'space-between', marginTop: 16 }, col(a, 0, 'flex-start'), col(b, 1, 'flex-end')),
      h(
        'div',
        { width: W, height: 14, marginTop: 14, position: 'relative' },
        h('div', { width: wa, height: 14, background: C.a, borderRadius: '7px 0 0 7px' }),
        h('div', { width: 6, height: 14 }),
        h('div', { width: W - 6 - wa, height: 14, background: C.b, borderRadius: '0 7px 7px 0' }),
        h('div', { position: 'absolute', left: W / 2 - 1, top: -6, width: 2, height: 26, background: 'rgba(244,244,250,0.85)' }),
      ),
      h('div', { fontSize: 22, color: C.fg, marginTop: 12, ...umaLinha, maxWidth: W }, `Neste cenário: ${estadosTexto(inp.ds, r)}.`),
      faixaEstados(r, W),
      h('div', { flexDirection: 'column', marginTop: 12 }, ...premissas),
      h('div', { flexGrow: 1 }),
      h(
        'div',
        { justifyContent: 'space-between', alignItems: 'flex-end' },
        h('div', { fontSize: 18, color: C.subtle, maxWidth: 820 }, 'Hipóteses de quem montou o cenário aplicadas ao resultado oficial do 1º turno (TSE).'),
        inp.dominio ? h('div', { fontSize: 18, color: C.muted }, inp.dominio) : h('div', {}),
      ),
    ),
  );
}

/** Cartão genérico da calculadora (/cenarios sem código válido): sem números. */
export function layoutCalculadora(inp: { dominio?: string }): No {
  const W = 500;
  const controle = (rotulo: string, pa: number) =>
    h(
      'div',
      { flexDirection: 'column', width: W, marginTop: 22 },
      h('div', { fontSize: 18, color: C.muted, fontWeight: 600, letterSpacing: 1.5 }, rotulo),
      h(
        'div',
        { width: W, height: 14, marginTop: 10, position: 'relative', alignItems: 'center' },
        h('div', { width: Math.round(W * pa), height: 14, background: C.a, borderRadius: '7px 0 0 7px' }),
        h('div', { width: W - Math.round(W * pa), height: 14, background: C.b, borderRadius: '0 7px 7px 0' }),
        h('div', { position: 'absolute', left: Math.round(W * pa) - 15, top: -8, width: 30, height: 30, borderRadius: 15, background: C.fg, border: `4px solid ${C.bg}` }),
      ),
    );
  return fundo(
    faixaCenario(),
    h(
      'div',
      { flexDirection: 'column', padding: '62px 64px 32px', width: OG_W, height: OG_H },
      h('div', { justifyContent: 'space-between', alignItems: 'center' }, marca(), seloContorno('A PARTIR DO 1º TURNO OFICIAL')),
      h(
        'div',
        { justifyContent: 'space-between', alignItems: 'center', flexGrow: 1 },
        h(
          'div',
          { flexDirection: 'column', width: 470 },
          h('div', { fontSize: 22, fontWeight: 600, color: C.brand2, letterSpacing: 3 }, 'CALCULADORA DO 2º TURNO'),
          h('div', { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 84, color: C.fg, letterSpacing: -3, lineHeight: 1, marginTop: 10 }, 'E se…?'),
          h('div', { fontSize: 28, color: C.muted, marginTop: 18, lineHeight: 1.35 }, 'Decida para onde vão os eleitores de cada candidato do 1º turno e veja o 2º turno resultante, estado por estado.'),
        ),
        h(
          'div',
          { flexDirection: 'column', width: W + 64, background: 'rgba(255,255,255,0.04)', border: `2px solid ${C.line}`, borderRadius: 28, padding: '12px 30px 34px', alignItems: 'center' },
          controle('ELEITORES DOS DEMAIS CANDIDATOS', 0.56),
          controle('BRANCOS E NULOS DO 1º TURNO', 0.3),
          controle('COMPARECIMENTO', 0.7),
        ),
      ),
      h(
        'div',
        { justifyContent: 'space-between', alignItems: 'flex-end' },
        h('div', { fontSize: 18, color: C.subtle }, 'Nada é coletado: o cenário fica no seu aparelho e no link que você decidir compartilhar.'),
        inp.dominio ? h('div', { fontSize: 18, color: C.muted }, inp.dominio) : h('div', {}),
      ),
    ),
  );
}
