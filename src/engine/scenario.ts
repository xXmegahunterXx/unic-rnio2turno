/**
 * Cenário da simulação: padrão neutro derivado do 1º turno, validação/normalização e mesclagem de
 * alterações parciais (comando `cenario` do admin).
 */
import type { OrdemRegional, RaceId, Ritmo, ScenarioConfig, UF } from '../shared/types';
import { CommandError } from './api';
import { clamp, round } from './mathx';
import type { RaceInfo, Structure } from './structure';

export const SEED_PADRAO = 20261025;
export const PRESET_PADRAO = 'padrao';
export const PRESET_PERSONALIZADO = 'personalizado';

const RITMOS: Ritmo[] = ['rapido', 'normal', 'lento'];
const ORDENS: OrdemRegional[] = ['realista', 'aleatoria', 'norte-primeiro', 'sul-primeiro'];

/** Totais do 1º turno de uma corrida de 2º turno (finalistas e demais) no seu escopo. */
export function totaisPrimeiroTurno(st: Structure, r: RaceInfo): { v0: number; v1: number; validos: number } {
  let v0 = 0;
  let v1 = 0;
  let validos = 0;
  const [m0, m1] = r.kind === 'pres' ? [0, st.nMun] : [st.ufMunStart[r.ufIdx], st.ufMunEnd[r.ufIdx]];
  for (let m = m0; m < m1; m++) {
    const t = r.kind === 'pres' ? st.mun[m].t1 : st.mun[m].t1gov;
    if (!t) continue;
    for (const k in t.votos) {
      const v = t.votos[k];
      validos += v;
      if (k === r.num0) v0 += v;
      else if (k === r.num1) v1 += v;
    }
  }
  return { v0, v1, validos };
}

/**
 * Alvo neutro (% de válidos do candidato 0): resultado do 1º turno com transferência 50/50 dos votos
 * dos demais candidatos, (v0 + 0,5·outros) / válidos. Arredondado a 2 casas.
 */
export function alvoNeutro(st: Structure, r: RaceInfo): number {
  const { v0, v1, validos } = totaisPrimeiroTurno(st, r);
  if (validos <= 0) return 50;
  const outros = validos - v0 - v1;
  return round(((v0 + 0.5 * outros) / validos) * 100, 2);
}

export function alvosNeutros(st: Structure): { pres: number; gov: Record<RaceId, number> } {
  const pres = st.races.find((r) => r.kind === 'pres' && r.turno === 2);
  const gov: Record<RaceId, number> = {};
  for (const g of st.govRaces) gov[g.id] = alvoNeutro(st, g);
  return { pres: pres ? alvoNeutro(st, pres) : 50, gov };
}

/** Cenário padrão neutro (preset 'padrao'). */
export function cenarioPadrao(st: Structure, seed = SEED_PADRAO): ScenarioConfig {
  const a = alvosNeutros(st);
  return {
    preset: PRESET_PADRAO,
    seed,
    alvoPres: a.pres,
    alvoGov: a.gov,
    transferenciaOutros: 0.5,
    intensidadeRegional: 1,
    // ruído EXTRA sobre o 1º turno real da seção (o real já varia); nas UFs sem seção real o motor soma um
    // ruído estrutural (MODELO.ruidoSemSecaoReal) — equivalente ao 0,25 da fase 1
    ruidoSecao: 0.08,
    comparecimentoDelta: 0,
    brancosFator: 1,
    nulosFator: 1,
    ritmo: 'normal',
    ordemRegional: 'realista',
    ufVies: {},
    ufAtraso: {},
  };
}

function num(v: unknown, campo: string, lo: number, hi: number): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new CommandError(`Cenário: "${campo}" precisa ser um número.`);
  return clamp(n, lo, hi);
}

function recordUf(
  v: unknown,
  campo: string,
  st: Structure,
  lo: number,
  hi: number,
): Partial<Record<UF, number>> {
  if (v == null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new CommandError(`Cenário: "${campo}" precisa ser um objeto { UF: valor }.`);
  const out: Partial<Record<UF, number>> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const uf = k.toUpperCase();
    if (!st.ufIndex.has(uf)) throw new CommandError(`Cenário: UF desconhecida em "${campo}": ${k}`);
    if (raw == null) continue;
    const n = num(raw, `${campo}.${uf}`, lo, hi);
    if (n !== 0) out[uf as UF] = n;
  }
  return out;
}

/** Valida e normaliza um cenário completo (lança CommandError com mensagem clara). */
export function normalizaCenario(c: ScenarioConfig, st: Structure): ScenarioConfig {
  const neutros = alvosNeutros(st);
  const alvoGov: Record<RaceId, number> = {};
  for (const g of st.govRaces) {
    const v = c.alvoGov?.[g.id];
    alvoGov[g.id] = v == null ? neutros.gov[g.id] : num(v, `alvoGov.${g.id}`, 1, 99);
  }
  if (c.alvoGov) {
    for (const k of Object.keys(c.alvoGov)) {
      if (!(k in alvoGov)) throw new CommandError(`Cenário: corrida de governador desconhecida em alvoGov: ${k}`);
    }
  }
  if (!RITMOS.includes(c.ritmo)) throw new CommandError(`Cenário: ritmo inválido "${String(c.ritmo)}" (${RITMOS.join(', ')}).`);
  if (!ORDENS.includes(c.ordemRegional))
    throw new CommandError(`Cenário: ordemRegional inválida "${String(c.ordemRegional)}" (${ORDENS.join(', ')}).`);
  const seed = Math.floor(num(c.seed, 'seed', 0, Number.MAX_SAFE_INTEGER));
  return {
    preset: typeof c.preset === 'string' && c.preset ? c.preset.slice(0, 60) : PRESET_PERSONALIZADO,
    seed,
    alvoPres: num(c.alvoPres, 'alvoPres', 1, 99),
    alvoGov,
    transferenciaOutros: num(c.transferenciaOutros, 'transferenciaOutros', 0, 1),
    intensidadeRegional: num(c.intensidadeRegional, 'intensidadeRegional', 0, 1.5),
    ruidoSecao: num(c.ruidoSecao, 'ruidoSecao', 0, 1),
    comparecimentoDelta: num(c.comparecimentoDelta, 'comparecimentoDelta', -30, 30),
    brancosFator: num(c.brancosFator, 'brancosFator', 0, 5),
    nulosFator: num(c.nulosFator, 'nulosFator', 0, 5),
    ritmo: c.ritmo,
    ordemRegional: c.ordemRegional,
    ufVies: recordUf(c.ufVies, 'ufVies', st, -40, 40),
    ufAtraso: recordUf(c.ufAtraso, 'ufAtraso', st, 0, 600),
  };
}

/**
 * Aplica uma alteração parcial ao cenário atual.
 *  - `alvoGov`, `ufVies` e `ufAtraso` são MESCLADOS chave a chave; em `ufVies`/`ufAtraso`, valor 0 ou null
 *    remove a UF, e `ufVies: null` (ou `ufAtraso: null`) limpa o registro inteiro.
 *  - Sem `preset` explícito, o cenário passa a ser 'personalizado'.
 */
export function mesclaCenario(atual: ScenarioConfig, parcial: Partial<ScenarioConfig>, st: Structure): ScenarioConfig {
  if (!parcial || typeof parcial !== 'object') throw new CommandError('Cenário: alteração inválida.');
  const merged: ScenarioConfig = {
    ...atual,
    ...parcial,
    alvoGov: { ...atual.alvoGov, ...(parcial.alvoGov ?? {}) },
    ufVies: mergeRecord(atual.ufVies, parcial.ufVies),
    ufAtraso: mergeRecord(atual.ufAtraso, parcial.ufAtraso),
    preset: parcial.preset ?? PRESET_PERSONALIZADO,
  };
  return normalizaCenario(merged, st);
}

function mergeRecord(
  a: Partial<Record<UF, number>>,
  b: Partial<Record<UF, number>> | undefined,
): Partial<Record<UF, number>> {
  if (b === undefined) return { ...a };
  if (b === null) return {};
  const out: Record<string, number | null | undefined> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k.toUpperCase()] = v as number | null | undefined;
  return out as Partial<Record<UF, number>>;
}

/** Chave canônica (para cache de modelos): JSON com chaves ordenadas. */
export function cenarioKey(c: ScenarioConfig): string {
  const sortObj = (o: Record<string, unknown>) =>
    Object.keys(o)
      .sort()
      .map((k) => [k, o[k]]);
  return JSON.stringify([
    c.seed,
    c.alvoPres,
    sortObj(c.alvoGov),
    c.transferenciaOutros,
    c.intensidadeRegional,
    c.ruidoSecao,
    c.comparecimentoDelta,
    c.brancosFator,
    c.nulosFator,
    c.ritmo,
    c.ordemRegional,
    sortObj(c.ufVies as Record<string, unknown>),
    sortObj(c.ufAtraso as Record<string, unknown>),
  ]);
}
