/**
 * Arquivos estáticos do dataset (DATA_DIR) usados pelas imagens de compartilhamento (OG) e pelas meta tags:
 * fichas de candidatos, cargos do 1º turno, curiosidades e o resultado do 1º turno para Presidente (cenários).
 *
 *  - Leitura síncrona, preguiçosa e com cache (arquivos pequenos: o maior, candidatos/assembleia-sp.json, tem
 *    ~0,2 MB); o arquivo é reconferido (mtime) no máximo a cada 60 s, então um dataset republicado passa a valer
 *    sem reiniciar. Arquivo ausente, corrompido ou maior que o limite conta como ausente (nunca lança).
 *  - `versao` (mtime + tamanho) entra na chave do cache das imagens: dado novo → imagem nova.
 *  - Só caminhos relativos simples dentro de DATA_DIR (sem `..`), validados antes de tocar no disco.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CandidatoFicha, CargoDataset } from '../shared/dataset';
import type { CuriosidadesDataset } from '../shared/curiosidades';
import type { PresidenteT1Dataset } from '../shared/cenarios';
import { hashCurto } from './http-cache';

const RECHECAR_MS = 60_000;
const MAX_BYTES = 8 * 1024 * 1024;
const RE_CAMINHO = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\.json$/;
const RE_GRUPO = /^[a-z0-9][a-z0-9-]{0,47}$/;
const RE_SQ = /^\d{6,15}$/;

interface Entrada {
  verificadoEm: number;
  mtimeMs: number;
  tamanho: number;
  valor: unknown;
  versao: string;
}

export interface Lido<T> {
  valor: T;
  /** Identifica o conteúdo (muda quando o arquivo muda). */
  versao: string;
}

/** Leitor de JSON de DATA_DIR com cache e reconferência por mtime. */
export class ArquivosJson {
  private cache = new Map<string, Entrada>();

  constructor(
    readonly dir: string,
    private readonly now: () => number = Date.now,
    private readonly maxEntradas = 96,
  ) {}

  /** JSON de `DATA_DIR/<rel>` ou null (ausente, inválido, grande demais ou reprovado por `validar`). */
  ler<T>(rel: string, validar: (v: unknown) => boolean = () => true): Lido<T> | null {
    if (!RE_CAMINHO.test(rel) || rel.includes('..')) return null;
    const agora = this.now();
    const e = this.cache.get(rel);
    if (e && agora - e.verificadoEm < RECHECAR_MS) {
      this.cache.delete(rel); // LRU: reinsere no fim
      this.cache.set(rel, e);
      return e.valor === null ? null : { valor: e.valor as T, versao: e.versao };
    }
    const arq = join(this.dir, rel);
    let mtimeMs = -1;
    let tamanho = -1;
    try {
      const st = statSync(arq);
      if (st.isFile()) [mtimeMs, tamanho] = [st.mtimeMs, st.size];
    } catch {
      /* ausente */
    }
    if (e && e.mtimeMs === mtimeMs && e.tamanho === tamanho) {
      e.verificadoEm = agora;
      return e.valor === null ? null : { valor: e.valor as T, versao: e.versao };
    }
    let valor: unknown = null;
    if (mtimeMs >= 0 && tamanho <= MAX_BYTES) {
      try {
        const v = JSON.parse(readFileSync(arq, 'utf8')) as unknown;
        valor = v !== null && typeof v === 'object' && validar(v) ? v : null;
      } catch {
        valor = null; // corrompido ou sendo escrito: tenta de novo no próximo intervalo
      }
    }
    const versao = `${Math.floor(mtimeMs).toString(36)}${tamanho.toString(36)}`;
    // inválido: guarda com mtime -2 para reler no próximo intervalo mesmo sem mudança de mtime
    this.cache.delete(rel);
    this.cache.set(rel, { verificadoEm: agora, mtimeMs: valor === null ? -2 : mtimeMs, tamanho, valor, versao });
    while (this.cache.size > this.maxEntradas) this.cache.delete(this.cache.keys().next().value as string);
    return valor === null ? null : { valor: valor as T, versao };
  }
}

/** Linha do índice de candidatos (public/data/candidatos/index.json). */
export interface IndiceCandidato {
  sqcand: string;
  nomeUrna: string;
  numero: number;
  partido: string;
  cargo: string;
  uf: string;
  grupo: string;
}

export type CargoArquivo = 'senado' | 'camara' | 'assembleia' | 'governador-t1';

/** Fachada dos arquivos estáticos usados pelas imagens e meta tags. */
export class DadosEstaticos {
  readonly arquivos: ArquivosJson;
  private indice: { versao: string; mapa: Map<string, IndiceCandidato> } | null = null;

  constructor(dir: string, now: () => number = Date.now) {
    this.arquivos = new ArquivosJson(dir, now);
  }

  /** Índice sqcand → candidato (null se o arquivo não existe). */
  indiceCandidatos(): { versao: string; mapa: Map<string, IndiceCandidato> } | null {
    const lido = this.arquivos.ler<{ colunas: string[]; linhas: unknown[][] }>(
      'candidatos/index.json',
      (v) => Array.isArray((v as { colunas?: unknown }).colunas) && Array.isArray((v as { linhas?: unknown }).linhas),
    );
    if (!lido) return null;
    if (this.indice?.versao === lido.versao) return this.indice;
    const col = lido.valor.colunas;
    const i = (nome: string) => col.indexOf(nome);
    const [iSq, iNome, iNum, iPart, iCargo, iUf, iGrupo] = ['sqcand', 'nomeUrna', 'numero', 'partido', 'cargo', 'uf', 'grupo'].map(i);
    const mapa = new Map<string, IndiceCandidato>();
    if (iSq >= 0 && iGrupo >= 0) {
      for (const l of lido.valor.linhas) {
        if (!Array.isArray(l)) continue;
        const sq = String(l[iSq] ?? '');
        const grupo = String(l[iGrupo] ?? '');
        if (!RE_SQ.test(sq) || !RE_GRUPO.test(grupo)) continue;
        mapa.set(sq, {
          sqcand: sq,
          nomeUrna: String(l[iNome] ?? ''),
          numero: Number(l[iNum]) || 0,
          partido: String(l[iPart] ?? ''),
          cargo: String(l[iCargo] ?? ''),
          uf: String(l[iUf] ?? ''),
          grupo,
        });
      }
    }
    this.indice = { versao: lido.versao, mapa };
    return this.indice;
  }

  /**
   * Situação do candidato no índice: 'existe' | 'nao-existe' | 'sem-indice' (arquivo ausente: não dá para dizer).
   */
  existeCandidato(sq: string): 'existe' | 'nao-existe' | 'sem-indice' {
    if (!RE_SQ.test(sq)) return 'nao-existe';
    const ind = this.indiceCandidatos();
    if (!ind) return 'sem-indice';
    return ind.mapa.has(sq) ? 'existe' : 'nao-existe';
  }

  /** Ficha completa do candidato (índice → arquivo do grupo) ou null. */
  ficha(sq: string): Lido<CandidatoFicha> | null {
    if (!RE_SQ.test(sq)) return null;
    const ind = this.indiceCandidatos()?.mapa.get(sq);
    if (!ind) return null;
    const lido = this.arquivos.ler<{ candidatos: CandidatoFicha[] }>(`candidatos/${ind.grupo}.json`, (v) =>
      Array.isArray((v as { candidatos?: unknown }).candidatos),
    );
    const f = lido?.valor.candidatos.find((c) => c && c.sqcand === sq);
    if (!lido || !f || typeof f.nomeUrna !== 'string') return null;
    return { valor: f, versao: lido.versao };
  }

  cargo(nome: CargoArquivo): Lido<CargoDataset> | null {
    return this.arquivos.ler<CargoDataset>(`cargos/${nome}.json`, (v) => Array.isArray((v as { ufs?: unknown }).ufs));
  }

  curiosidades(): Lido<CuriosidadesDataset> | null {
    return this.arquivos.ler<CuriosidadesDataset>('curiosidades.json', (v) => {
      const x = v as Partial<CuriosidadesDataset>;
      return Array.isArray(x.fatos) && !!x.finalistas?.a && !!x.finalistas?.b;
    });
  }

  presidenteT1(): Lido<PresidenteT1Dataset> | null {
    return this.arquivos.ler<PresidenteT1Dataset>('presidente-t1.json', (v) => {
      const x = v as Partial<PresidenteT1Dataset>;
      return Array.isArray(x.candidatos) && Array.isArray(x.ufs) && Array.isArray(x.finalistas) && x.finalistas.length === 2;
    });
  }

  /** Versão conjunta de vários arquivos (para chaves de cache). */
  static versao(...lidos: (Lido<unknown> | null | undefined)[]): string {
    return hashCurto(lidos.map((l) => l?.versao ?? '-').join('|'));
  }
}

// ---------------------------------------------------------------------------------------------
// Textos da ficha (espelho de src/app/components/pages/cargos/dados.ts, que vive no app)
// ---------------------------------------------------------------------------------------------

const feminino = (genero?: string) => !!genero && /^fem/i.test(genero.trim());

/** Cargo no feminino quando a ficha diz (Senadora, Deputada Federal…). */
export function cargoExibicao(cargo: string, genero?: string): string {
  if (!feminino(genero)) return cargo;
  return cargo
    .replace(/^Senador$/, 'Senadora')
    .replace(/^Deputado/, 'Deputada')
    .replace(/^Governador$/, 'Governadora')
    .replace(/^Vice-Governador$/, 'Vice-Governadora');
}

export const ehEleito = (s: string | undefined) => s === 'eleito' || s === 'eleito-qp' || s === 'eleito-media';

/** Selo curto da situação ("ELEITA", "2º TURNO"…) ou null. */
export function situacaoCurta(s: string | undefined, genero?: string): string | null {
  const a = feminino(genero) ? 'A' : 'O';
  if (ehEleito(s)) return `ELEIT${a}`;
  if (s === 'segundo-turno') return '2º TURNO';
  if (s === 'suplente') return 'SUPLENTE';
  if (s === 'nao-eleito') return `NÃO ELEIT${a}`;
  return null;
}

/** Situação por extenso para textos ("eleita", "no 2º turno"…) ou null. */
export function situacaoTexto(s: string | undefined, genero?: string): string | null {
  const a = feminino(genero) ? 'a' : 'o';
  if (ehEleito(s)) return `eleit${a}`;
  if (s === 'segundo-turno') return 'no 2º turno';
  if (s === 'suplente') return 'suplente';
  if (s === 'nao-eleito') return `não eleit${a}`;
  return null;
}
