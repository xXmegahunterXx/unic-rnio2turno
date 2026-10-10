/**
 * Curiosidades do 1º turno (fatos neutros e verificáveis calculados dos dados oficiais do TSE).
 * Arquivo: public/data/curiosidades.json → CuriosidadesDataset. Gerado por scripts/data/curiosidades.ts
 * (npx tsx scripts/data/curiosidades.ts) a partir de public/data/** — nunca editado à mão.
 *
 * Regras editoriais (ARCHITECTURE §1):
 *  - Linguagem de almanaque, descritiva, sem adjetivos nem insinuações.
 *  - Todo fato sobre os finalistas é SIMÉTRICO: `par.a` e `par.b` (a = menor número na urna) com o mesmo critério.
 *  - Os números são reais (1º turno); nada aqui vem da simulação.
 *  - `dados` guarda os números brutos usados no cálculo, para conferência (scripts/data/curiosidades.test.ts).
 */
import type { UF } from './types';

export type TemaCuriosidade = 'brasil' | 'finalistas' | 'comparecimento' | 'secoes' | 'exterior' | 'eleitorado' | 'cargos';

/** Temas na ordem de exibição. */
export const TEMAS_CURIOSIDADES: readonly { id: TemaCuriosidade; rotulo: string; descricao: string }[] = [
  { id: 'finalistas', rotulo: 'Os dois finalistas', descricao: 'Como os dois candidatos do 2º turno se saíram no 1º turno, sempre lado a lado.' },
  { id: 'brasil', rotulo: 'Brasil em números', descricao: 'O tamanho da eleição: eleitores, seções e municípios.' },
  { id: 'comparecimento', rotulo: 'Comparecimento', descricao: 'Onde mais e menos se votou, e onde houve mais brancos e nulos.' },
  { id: 'secoes', rotulo: 'Seções e locais', descricao: 'Recordes das seções eleitorais e dos locais de votação.' },
  { id: 'exterior', rotulo: 'No exterior', descricao: 'Brasileiros que votaram fora do país.' },
  { id: 'eleitorado', rotulo: 'Quem vota', descricao: 'Perfil do eleitorado: gênero, idade e escolaridade.' },
  { id: 'cargos', rotulo: 'Outros cargos', descricao: 'Recordes do 1º turno para deputado, senador e governador.' },
];

/** int → 12.345 · pct → 51,93% · pp → 1,2 p.p. */
export type FormatoValorCuriosidade = 'int' | 'pct' | 'pp';

export interface ValorCuriosidade {
  valor: number;
  formato: FormatoValorCuriosidade;
  /** Texto depois do número: "eleitores", "seções", "dos votos válidos". */
  unidade?: string;
  /** Casas decimais (pct/pp). Padrão: 2 para pct, 2 para pp. */
  casas?: 0 | 1 | 2;
}

export interface LugarCuriosidade {
  /** Nome de exibição: "Trabiju (SP)", "Lisboa (Portugal)", "Belo Horizonte (MG) · zona 35, seção 109". */
  nome: string;
  uf?: UF;
  /** Código TSE do município (5 dígitos). */
  cod?: string;
  zona?: number;
  secao?: number;
  /** Rota do app para "ver no mapa", ex.: '/apuracao/sp/62910?race=pres-t1'. */
  rota?: string;
}

/** Um lado de um fato simétrico (um por finalista). */
export interface LadoCuriosidade {
  valor: ValorCuriosidade;
  /** Linha curta sob o número: "Bonfim do Piauí (PI)", "38 seções". */
  rotulo: string;
  lugar?: LugarCuriosidade;
}

export interface FinalistaCuriosidade {
  slot: 'a' | 'b';
  numero: number;
  nomeUrna: string;
  partido: string;
}

export interface Curiosidade {
  /** Estável entre gerações (usado em links /curiosidades#id e no nome do arquivo de imagem). */
  id: string;
  tema: TemaCuriosidade;
  /** Título curto (≤ 48 caracteres). */
  titulo: string;
  /** Número em destaque. Opcional quando o fato é um `par`. */
  destaque?: ValorCuriosidade;
  /** Fato simétrico dos dois finalistas (a = menor número na urna). A UI dá o mesmo peso aos dois lados. */
  par?: { a: LadoCuriosidade; b: LadoCuriosidade };
  /** Frase de contexto (1–2 frases, números já formatados em pt-BR). */
  contexto: string;
  /** Texto pronto para postar (≤ 200 caracteres, sem URL nem hashtags). */
  texto: string;
  /** Lugares citados (o primeiro é o principal). */
  lugares: LugarCuriosidade[];
  /** Rota principal do app ("ver no mapa" / "ver ficha"). */
  rota: string;
  /** Rótulo do link principal. */
  rotuloRota: string;
  /** Fonte oficial do dado. */
  fonte: string;
  /** Critério do cálculo (pisos, desempates), quando houver. */
  criterio?: string;
  /** Números brutos usados no cálculo, para conferência. */
  dados: Record<string, string | number | boolean | null | (string | number)[] | Record<string, string | number | null>>;
}

export interface CuriosidadesDataset {
  versao: 1;
  geradoEm: string; // ISO
  fonte: string;
  /** Os dois finalistas do 2º turno para Presidente, por slot (a = menor número). */
  finalistas: { a: FinalistaCuriosidade; b: FinalistaCuriosidade };
  /** Pisos dos recordes (documentados também em `criterio`): eleitores aptos por município e votos válidos por seção. */
  pisos: { eleitoradoMunicipio: number; secaoValidos: number };
  fatos: Curiosidade[];
}

/** Rotas do app para os fatos (mesmo formato das páginas de apuração; 1º turno = race pres-t1). */
export const rotaCuriosidade = {
  brasil: () => '/apuracao?race=pres-t1',
  uf: (uf: UF) => `/apuracao/${uf.toLowerCase()}?race=pres-t1`,
  municipio: (uf: UF, cod: string) => `/apuracao/${uf.toLowerCase()}/${cod}?race=pres-t1`,
  secao: (uf: UF, cod: string, zona: number, secao: number) => `/apuracao/${uf.toLowerCase()}/${cod}/${zona}/${secao}?race=pres-t1`,
  candidato: (sqcand: string) => `/candidato/${sqcand}`,
  camara: (uf?: UF) => (uf ? `/camara?uf=${uf.toLowerCase()}` : '/camara'),
  senado: (uf?: UF) => (uf ? `/senado?uf=${uf.toLowerCase()}` : '/senado'),
};
