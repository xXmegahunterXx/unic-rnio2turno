/**
 * Curiosidades do 1º turno — utilitários puros (sem React/DOM), testados em formato.test.ts.
 * Os fatos vêm prontos de public/data/curiosidades.json (scripts/data/curiosidades.ts); aqui só formatamos.
 */
import type { Curiosidade, CuriosidadesDataset, TemaCuriosidade, ValorCuriosidade } from '@/shared/curiosidades';
import { TEMAS_CURIOSIDADES } from '@/shared/curiosidades';
import { fmtInt, fmtPP, fmtPct } from '@/shared/format';
import type { IconName } from '@/app/ui/Icon';

export const CAMINHO_DADOS = 'data/curiosidades.json';

/** Hashtags neutras dos posts de curiosidades (sem '#'). */
export const HASHTAGS_CURIOSIDADES = ['Eleições2026', 'PrimeiroTurno'];

/** Três fatos para chamadas compactas (home, hero): fortes em 3 segundos e neutros. */
export const DESTAQUES_PADRAO = ['finalistas-empate-municipio', 'finalistas-menor-diferenca', 'brasil-cidade-maior-que-estados'];

export const ICONE_TEMA: Record<TemaCuriosidade, IconName> = {
  finalistas: 'troca',
  brasil: 'bandeira',
  comparecimento: 'urna',
  secoes: 'grade',
  exterior: 'globo',
  eleitorado: 'usuarios',
  cargos: 'selo',
};

export const rotuloTema = (t: TemaCuriosidade) => TEMAS_CURIOSIDADES.find((x) => x.id === t)?.rotulo ?? t;

/** Valor formatado em pt-BR: 158.745.502 · 52,84% · 0,78 p.p. (magnitude, sem sinal). */
export function fmtValor(v: ValorCuriosidade): string {
  if (v.formato === 'pct') return fmtPct(v.valor, v.casas ?? 2);
  if (v.formato === 'pp') return fmtPP(Math.abs(v.valor), v.casas === 1 ? 1 : 2).replace(/^[+−-]/, '');
  return fmtInt(v.valor);
}

/** Tamanho do número grande conforme o comprimento (evita estourar a largura no celular). 0 = maior. */
export function nivelTamanho(texto: string): 0 | 1 | 2 | 3 {
  const n = texto.replace(/\s/g, '').length;
  if (n <= 5) return 0;
  if (n <= 7) return 1;
  if (n <= 9) return 2;
  return 3;
}

export interface TrechoTexto {
  t: string;
  num: boolean;
}

/**
 * Separa números de um texto para envolvê-los em `.num` (tabular): "12.345", "51,93%", "0,78 p.p.".
 * Ordinais ("1º turno") ficam como texto.
 */
export function trechosComNumeros(texto: string): TrechoTexto[] {
  const re = /\d+(?:[.,]\d+)*(?:%| p\.p\.)?(?![ºª\d])/g;
  const out: TrechoTexto[] = [];
  let i = 0;
  for (const m of texto.matchAll(re)) {
    const ini = m.index ?? 0;
    if (ini > i) out.push({ t: texto.slice(i, ini), num: false });
    out.push({ t: m[0], num: true });
    i = ini + m[0].length;
  }
  if (i < texto.length) out.push({ t: texto.slice(i), num: false });
  return out;
}

/** Rota da página com o fato em foco (deep link: rola até o cartão e o realça). */
export const caminhoFato = (id: string) => `/curiosidades?fato=${encodeURIComponent(id)}`;

export const nomeArquivoFato = (id: string) => `sintonia-curiosidade-${id}`;

/** Texto final para postar: o texto do fato + a fonte. Nunca leva URL (o kit acrescenta o link). */
export const textoParaCompartilhar = (f: Pick<Curiosidade, 'texto'>) => `${f.texto.trim()} Fonte: TSE.`;

/** Texto para compartilhar a página inteira. */
export function textoPagina(ds: Pick<CuriosidadesDataset, 'fatos'>): string {
  return `${ds.fatos.length} curiosidades do 1º turno de 2026, calculadas com os dados oficiais do TSE: empates voto a voto, recordes de comparecimento, seções, exterior e mais.`;
}

/** Fatos de um tema (ou todos), na ordem dos temas e, dentro do tema, na ordem do arquivo. */
export function fatosDoTema(fatos: Curiosidade[], tema: TemaCuriosidade | 'todos'): Curiosidade[] {
  if (tema !== 'todos') return fatos.filter((f) => f.tema === tema);
  const ordem = new Map(TEMAS_CURIOSIDADES.map((t, i) => [t.id, i]));
  return [...fatos].sort((x, y) => (ordem.get(x.tema) ?? 99) - (ordem.get(y.tema) ?? 99));
}

/** Temas que têm fatos, com a contagem, na ordem de exibição. */
export function temasComContagem(fatos: Curiosidade[]): { id: TemaCuriosidade; rotulo: string; n: number }[] {
  return TEMAS_CURIOSIDADES.map((t) => ({ id: t.id, rotulo: t.rotulo, n: fatos.filter((f) => f.tema === t.id).length })).filter((t) => t.n > 0);
}

/** Até `n` fatos com número em destaque: os `ids` pedidos (na ordem) e, faltando algum, os primeiros com destaque. */
export function escolherDestaques(fatos: Curiosidade[], ids: string[], n = 3): Curiosidade[] {
  const comDestaque = fatos.filter((f) => f.destaque);
  const escolhidos = ids.map((id) => comDestaque.find((f) => f.id === id)).filter((f): f is Curiosidade => !!f);
  for (const f of comDestaque) {
    if (escolhidos.length >= n) break;
    if (!escolhidos.includes(f)) escolhidos.push(f);
  }
  return escolhidos.slice(0, n);
}

/** Lê o tema de `?tema=` (inválido → 'todos'). */
export function temaDoParam(v: string | null): TemaCuriosidade | 'todos' {
  return v && TEMAS_CURIOSIDADES.some((t) => t.id === v) ? (v as TemaCuriosidade) : 'todos';
}
