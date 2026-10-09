/**
 * Conversão de um arquivo de resultado do TSE (`-u.json`) em `ResultadoPrimeiroTurno`, com as conferências
 * de consistência interna do próprio arquivo (se algo não fechar, o build para — nunca "ajustamos" números).
 *
 * Votos "Anulado sub judice" (candidato com registro indeferido, mas com recurso pendente):
 *   o TSE os soma em `v.vvc` ("votos válidos computados" = `vv` + `vansj`) e é sobre `vvc` que ele calcula o
 *   percentual oficial de cada candidato (`pvap`). Ex.: Governador RJ 2026 — Garotinho (10) teve 274.411 votos
 *   sub judice; Douglas Ruas aparece com 49,27% (sobre `vvc`) e não 50,88% (sobre `vv`), por isso há 2º turno.
 *   Por isso esses votos entram em `votos` como os de qualquer candidato: assim os percentuais derivados no app
 *   (votos ÷ Σ votos) reproduzem exatamente os do TSE e comparecimento = Σ votos + brancos + nulos.
 *   Votos anulados em definitivo (`v.van`, destinação "Anulado") não ocorrem em 2026; se aparecerem, o build
 *   para (o contrato não tem onde guardá-los sem quebrar a igualdade acima).
 */
import type { ResultadoPrimeiroTurno } from '../../../src/shared/dataset';
import { candidatosDe, int, type TseResultado } from './tse-types';

/** Destinações de voto computadas como válidas no percentual oficial. */
const DESTINO_COMPUTADO = new Set(['Válido', 'Anulado sub judice']);

export interface ResultadoLido extends ResultadoPrimeiroTurno {
  secoes: number;
  /** Válidos computados (`v.vvc`) = Σ votos. Denominador do percentual oficial. */
  validos: number;
  /** Parte de `validos` que é "Anulado sub judice" (`v.vansj`). */
  subJudice: number;
}

/**
 * Lê um resultado de 1º turno.
 *
 *  - `votos`: todos os candidatos (inclusive com 0 voto). Nos arquivos sem nenhuma seção instalada
 *    (41 cidades do exterior), o TSE omite `dvt`; aí todos os candidatos têm 0 voto.
 *  - `nulos` = `v.tvn` (nulos + nulos técnicos), como o TSE divulga.
 */
export function lerResultado(r: TseResultado, ctx: string): ResultadoLido {
  const erro = (msg: string) => new Error(`[${ctx}] ${msg}`);
  if (r.tf !== 's') throw erro(`totalização não encerrada (tf=${r.tf})`);
  const { s, e, v } = r;
  const secoes = int(s.ts, 's.ts');
  if (int(s.st, 's.st') !== secoes) throw erro(`seções totalizadas ${s.st} ≠ total ${s.ts}`);

  const votos: Record<string, number> = {};
  let subJudice = 0;
  for (const { cand } of candidatosDe(r)) {
    const n = String(int(cand.n, 'cand.n'));
    const vap = int(cand.vap, `vap ${n}`);
    if (n in votos) throw erro(`candidato ${n} repetido`);
    if (cand.dvt === undefined) {
      if (vap !== 0) throw erro(`candidato ${n} sem destinação de voto com ${vap} votos`);
    } else if (!DESTINO_COMPUTADO.has(cand.dvt)) {
      throw erro(`destinação de voto não tratada: "${cand.dvt}" (candidato ${n}, ${vap} votos)`);
    } else if (cand.dvt === 'Anulado sub judice') {
      subJudice += vap;
    }
    votos[n] = vap;
  }

  const res: ResultadoLido = {
    eleitorado: int(e.te, 'e.te'),
    comparecimento: int(e.c, 'e.c'),
    brancos: int(v.vb, 'v.vb'),
    nulos: int(v.tvn, 'v.tvn'),
    votos,
    secoes,
    validos: int(v.vvc, 'v.vvc'),
    subJudice,
  };

  const somaVotos = Object.values(votos).reduce((a, b) => a + b, 0);
  const vv = int(v.vv, 'v.vv');
  if (somaVotos !== res.validos) throw erro(`Σ votos ${somaVotos} ≠ válidos computados (vvc) ${res.validos}`);
  if (vv + subJudice !== res.validos) throw erro(`vv ${vv} + sub judice ${subJudice} ≠ vvc ${res.validos}`);
  if (int(v.vansj, 'v.vansj') !== subJudice) throw erro(`sub judice ${subJudice} ≠ v.vansj ${v.vansj}`);
  if (int(v.van, 'v.van') !== 0) throw erro(`votos anulados em definitivo (v.van = ${v.van}) não tratados`);
  if (int(v.vnom, 'v.vnom') !== vv) throw erro(`nominais ${v.vnom} ≠ válidos ${v.vv} (há voto de legenda?)`);
  if (int(v.vn, 'v.vn') + int(v.vnt, 'v.vnt') !== res.nulos) throw erro('vn + vnt ≠ tvn');
  if (int(v.tv, 'v.tv') !== res.comparecimento) throw erro(`total de votos ${v.tv} ≠ comparecimento ${e.c}`);
  if (somaVotos + res.brancos + res.nulos !== res.comparecimento) {
    throw erro(`Σ votos + brancos + nulos ≠ comparecimento ${res.comparecimento}`);
  }
  if (res.comparecimento > res.eleitorado) throw erro('comparecimento > eleitorado');
  return res;
}

/** Só os campos do contrato, para gravar no dataset. */
export function paraDataset(r: ResultadoLido): ResultadoPrimeiroTurno {
  return {
    eleitorado: r.eleitorado,
    comparecimento: r.comparecimento,
    brancos: r.brancos,
    nulos: r.nulos,
    votos: r.votos,
  };
}

/** Acumulador de totais (para conferir soma dos municípios = arquivo da UF / Brasil). */
export class Totais {
  secoes = 0;
  eleitorado = 0;
  comparecimento = 0;
  brancos = 0;
  nulos = 0;
  validos = 0;
  subJudice = 0;
  votos: Record<string, number> = {};

  add(r: ResultadoLido | Totais) {
    this.secoes += r.secoes;
    this.eleitorado += r.eleitorado;
    this.comparecimento += r.comparecimento;
    this.brancos += r.brancos;
    this.nulos += r.nulos;
    this.validos += r.validos;
    this.subJudice += r.subJudice;
    for (const [n, x] of Object.entries(r.votos)) this.votos[n] = (this.votos[n] ?? 0) + x;
    return this;
  }

  /** Lista de divergências contra outro total (vazia = igual). */
  diff(o: ResultadoLido | Totais): string[] {
    const out: string[] = [];
    const campos = ['secoes', 'eleitorado', 'comparecimento', 'brancos', 'nulos', 'validos', 'subJudice'] as const;
    for (const c of campos) if (this[c] !== o[c]) out.push(`${c}: ${this[c]} ≠ ${o[c]}`);
    const nums = new Set([...Object.keys(this.votos), ...Object.keys(o.votos)]);
    for (const n of nums) if ((this.votos[n] ?? 0) !== (o.votos[n] ?? 0)) out.push(`votos ${n}: ${this.votos[n]} ≠ ${o.votos[n]}`);
    return out;
  }
}

/**
 * Percentual com 2 casas, meio para cima, em aritmética inteira (sem erro de ponto flutuante):
 * o mesmo arredondamento do `pvap` do TSE.
 */
export function pct2(parte: number, todo: number): number {
  if (todo <= 0) return 0;
  const centesimos = Math.floor((parte * 10000 * 2 + todo) / (2 * todo)); // round(parte/todo × 10000)
  return centesimos / 100;
}
