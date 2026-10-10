/**
 * Dados dos cargos do 1º turno (estáticos, public/data/**): índice de candidatos, fichas e utilidades de texto.
 * Tudo via `useDadoEstatico` (cache infinito do React Query): cada arquivo é baixado uma vez por sessão.
 */
import { useMemo } from 'react';
import type { CandidatoFicha, SituacaoCandidato } from '@/shared/dataset';
import type { UF } from '@/shared/types';
import { fmtInt } from '@/shared/format';
import { fichasDe, useCandidatos, useDadoEstatico } from '@/app/data/estatico';

// ---------------------------------------------------------------------------------------------
// Índice (public/data/candidatos/index.json): sqcand → grupo do arquivo de fichas
// ---------------------------------------------------------------------------------------------

export interface IndiceLinha {
  sqcand: string;
  nomeUrna: string;
  numero: number;
  partido: string;
  cargo: string;
  uf: 'BR' | UF;
  grupo: string;
}

interface IndiceArquivo {
  colunas: string[];
  linhas: (string | number)[][];
}

export function linhasDoIndice(d: IndiceArquivo | undefined): IndiceLinha[] {
  if (!d) return [];
  const c = (nome: string) => d.colunas.indexOf(nome);
  const [iSq, iNome, iNum, iPart, iCargo, iUf, iGrupo] = ['sqcand', 'nomeUrna', 'numero', 'partido', 'cargo', 'uf', 'grupo'].map(c);
  return d.linhas.map((l) => ({
    sqcand: String(l[iSq]),
    nomeUrna: String(l[iNome]),
    numero: Number(l[iNum]),
    partido: String(l[iPart]),
    cargo: String(l[iCargo]),
    uf: String(l[iUf]) as 'BR' | UF,
    grupo: String(l[iGrupo]),
  }));
}

/** Índice de candidatos com ficha (eleitos, finalistas, senadores…). `enabled=false` não baixa. */
export function useIndiceCandidatos(enabled = true) {
  const q = useDadoEstatico<IndiceArquivo>(enabled ? 'data/candidatos/index.json' : null);
  const linhas = useMemo(() => linhasDoIndice(q.data), [q.data]);
  const porSq = useMemo(() => new Map(linhas.map((l) => [l.sqcand, l])), [linhas]);
  return { ...q, linhas, porSq };
}

/** Fichas de um grupo indexadas por sqcand (+ aviso do arquivo, ex.: deputados do AM em reprocessamento). */
export function useFichasGrupo(grupo: string | null) {
  const q = useCandidatos(grupo);
  const fichas = useMemo(() => fichasDe(q.data), [q.data]);
  const porSq = useMemo(() => new Map(fichas.map((f) => [f.sqcand, f])), [fichas]);
  const aviso = q.data && !Array.isArray(q.data) ? ((q.data as { aviso?: string }).aviso ?? null) : null;
  return { ...q, fichas, porSq, aviso };
}

/** Ficha pública de um candidato (procura o grupo no índice). */
export function useFicha(sqcand: string | undefined) {
  const indice = useIndiceCandidatos(!!sqcand);
  const linha = sqcand ? indice.porSq.get(sqcand) : undefined;
  const grupo = linha?.grupo ?? null;
  const fichasQ = useFichasGrupo(grupo);
  const ficha = sqcand ? fichasQ.porSq.get(sqcand) : undefined;
  const carregando = indice.isLoading || (!!grupo && fichasQ.isLoading);
  const naoEncontrada = !!sqcand && indice.isSuccess && (!linha || (fichasQ.isSuccess && !ficha));
  const erro = indice.isError || fichasQ.isError;
  return { ficha, linha, grupo, carregando, naoEncontrada, erro, refetch: () => (indice.isError ? indice.refetch() : fichasQ.refetch()) };
}

/** Grupo dos arquivos de fichas/fotos de um cargo numa UF. */
export function grupoDoCargo(cargo: 'senado' | 'camara' | 'assembleia' | 'governador-t1', uf: UF | 'BR'): string {
  if (cargo === 'senado') return 'senado';
  if (cargo === 'governador-t1') return 'governadores';
  return `${cargo}-${uf.toLowerCase()}`;
}

// ---------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------

const feminino = (genero?: string) => !!genero && /^fem/i.test(genero);

/** Situação no 1º turno, em texto neutro (concorda com o gênero quando conhecido). */
export function rotuloSituacao(s: SituacaoCandidato, genero?: string): string {
  const a = feminino(genero) ? 'a' : 'o';
  switch (s) {
    case 'eleito':
      return `Eleit${a}`;
    case 'eleito-qp':
      return `Eleit${a} por quociente partidário`;
    case 'eleito-media':
      return `Eleit${a} por média`;
    case 'segundo-turno':
      return '2º turno';
    case 'suplente':
      return 'Suplente';
    case 'nao-eleito':
      return `Não eleit${a}`;
    default:
      return 'Situação em apuração';
  }
}

/** Versão curta para selos. */
export function rotuloSituacaoCurto(s: SituacaoCandidato, genero?: string): string {
  const a = feminino(genero) ? 'a' : 'o';
  if (s === 'eleito' || s === 'eleito-qp' || s === 'eleito-media') return `Eleit${a}`;
  if (s === 'segundo-turno') return '2º turno';
  if (s === 'suplente') return 'Suplente';
  if (s === 'nao-eleito') return `Não eleit${a}`;
  return 'Em apuração';
}

export const ehEleito = (s: SituacaoCandidato) => s === 'eleito' || s === 'eleito-qp' || s === 'eleito-media';

/** R$ 9.514.015,35 (inteiro com fmtInt + centavos). */
export function fmtReais(v: number): string {
  const neg = v < 0;
  const abs = Math.abs(v);
  let inteiro = Math.trunc(abs);
  let cent = Math.round((abs - inteiro) * 100);
  if (cent === 100) {
    inteiro += 1;
    cent = 0;
  }
  return `${neg ? '−' : ''}R$ ${fmtInt(inteiro)},${String(cent).padStart(2, '0')}`;
}

/** "1 bem" · "17 bens". */
export const fmtBens = (n: number) => `${fmtInt(n)} ${n === 1 ? 'bem declarado' : 'bens declarados'}`;

/** Cargo no feminino quando a ficha diz (Senadora, Deputada Federal…). */
export function cargoExibicao(cargo: string, genero?: string): string {
  if (!feminino(genero)) return cargo;
  return cargo
    .replace(/^Senador$/, 'Senadora')
    .replace(/^Deputado/, 'Deputada')
    .replace(/^Governador$/, 'Governadora')
    .replace(/^Vice-Governador$/, 'Vice-Governadora')
    .replace(/^Presidente$/, 'Presidente')
    .replace(/^Vice-Presidente$/, 'Vice-Presidente');
}

/** Ficha → texto de busca normalizável (nome de urna + nome completo). */
export const textoBuscaFicha = (f: Pick<CandidatoFicha, 'nomeUrna' | 'nome'>) => `${f.nomeUrna} ${f.nome}`;
