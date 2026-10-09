/** Utilitários dos testes do motor (Node): dataset real de public/data e verificação de invariantes. */
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type { LoadedDataset } from '../api';
import { loadDataset } from '../controller';
import { fsJsonLoader } from '../node';
import type { Summary } from '../../shared/types';
import { pctValidos } from '../../shared/calc';

export const PUBLIC_DIR = fileURLToPath(new URL('../../../public', import.meta.url));

let ds: Promise<LoadedDataset> | null = null;
/** Dataset real (cacheado por arquivo de teste). */
export function dataset(): Promise<LoadedDataset> {
  ds ??= loadDataset(fsJsonLoader(PUBLIC_DIR));
  return ds;
}

const CAMPOS = [
  'secoes',
  'secoesTotalizadas',
  'eleitorado',
  'eleitoradoTotalizado',
  'comparecimento',
  'abstencao',
  'brancos',
  'nulos',
] as const;

/** Invariantes de uma contagem: votos+brancos+nulos = comparecimento; comparecimento+abstenção = eleitorado
 * totalizado; seções totalizadas ≤ seções; % válidos dos 2 = 100. */
export function checaTally(s: Summary, ctx = ''): void {
  const validos = s.votos.reduce((a, b) => a + b, 0);
  expect(validos + s.brancos + s.nulos, `${ctx} votos+brancos+nulos`).toBe(s.comparecimento);
  expect(s.comparecimento + s.abstencao, `${ctx} comp+abst`).toBe(s.eleitoradoTotalizado);
  expect(s.secoesTotalizadas, `${ctx} secoesTot ≤ secoes`).toBeLessThanOrEqual(s.secoes);
  expect(s.eleitoradoTotalizado, `${ctx} eleitTot ≤ eleit`).toBeLessThanOrEqual(s.eleitorado);
  expect(s.comparecimento, `${ctx} comp ≥ 0`).toBeGreaterThanOrEqual(0);
  for (const v of s.votos) expect(Number.isInteger(v) && v >= 0, `${ctx} votos inteiros ≥ 0`).toBe(true);
  if (s.votos.length === 2 && validos > 0) {
    expect(Math.abs(pctValidos(s, 0) + pctValidos(s, 1) - 100), `${ctx} %válidos somam 100`).toBeLessThan(1e-9);
  }
  if (s.secoesTotalizadas === 0) expect(s.status).toBe('aguardando');
  else if (s.secoesTotalizadas === s.secoes) expect(s.status).toBe('encerrada');
  else expect(s.status).toBe('apurando');
}

/** Soma de uma lista de contagens deve bater campo a campo com o total. */
export function checaSoma(partes: Summary[], total: Summary, ctx = ''): void {
  for (const c of CAMPOS) {
    const s = partes.reduce((a, p) => a + p[c], 0);
    expect(s, `${ctx} soma de ${c}`).toBe(total[c]);
  }
  for (let i = 0; i < total.votos.length; i++) {
    const s = partes.reduce((a, p) => a + p.votos[i], 0);
    expect(s, `${ctx} soma de votos[${i}]`).toBe(total.votos[i]);
  }
  const ult = partes.reduce<number | null>(
    (a, p) => (p.ultimaAtualizacao !== null && (a === null || p.ultimaAtualizacao > a) ? p.ultimaAtualizacao : a),
    null,
  );
  expect(ult, `${ctx} ultimaAtualizacao = máx. das partes`).toBe(total.ultimaAtualizacao);
}

/** Relógio de parede controlável. */
export function relogio(inicio: number) {
  let t = inicio;
  return {
    now: () => t,
    set: (v: number) => {
      t = v;
    },
    add: (ms: number) => {
      t += ms;
    },
  };
}

export const semGeradoEm = <T extends { geradoEm: number }>(v: T) => ({ ...v, geradoEm: 0 });
