/**
 * Aleatoriedade determinística por hash (sem estado): cada número sorteado é função pura de
 * (semente, canal, índice). Assim a ordem de cálculo não importa, mudar um parâmetro do cenário não
 * "embaralha" o ruído de outros aspectos, e o resultado é idêntico em qualquer máquina.
 */
import { invNorm } from './mathx';

/** Mistura de 32 bits (triple32, C. Wellons): bijeção com ótima avalanche. Retorna uint32. */
export function triple32(x: number): number {
  x = x >>> 0;
  x ^= x >>> 17;
  x = Math.imul(x, 0xed5ad4bb);
  x ^= x >>> 11;
  x = Math.imul(x, 0xac4c1b51);
  x ^= x >>> 15;
  x = Math.imul(x, 0x31848bab);
  x ^= x >>> 14;
  return x >>> 0;
}

/** Hash de string (FNV-1a + triple32). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return triple32(h);
}

/** Normaliza a semente do cenário (qualquer número) para uint32. */
export function seedKey(seed: number): number {
  const s = Number.isFinite(seed) ? Math.floor(Math.abs(seed)) : 0;
  // combina as partes alta e baixa (sementes > 2^32 não colidem trivialmente)
  const lo = s % 4294967296;
  const hi = Math.floor(s / 4294967296) % 4294967296;
  return triple32((triple32(lo) ^ triple32(hi + 0x5bd1e995)) >>> 0);
}

/** Canais de ruído independentes. Nunca reordene: mudar o número de um canal muda os resultados. */
export const Canal = {
  Aptos: 1,
  Comparecimento: 2,
  Brancos: 3,
  Nulos: 4,
  Preferencia: 5,
  Binomial: 6,
  GovBrancos: 7,
  GovNulos: 8,
  GovPreferencia: 9,
  GovBinomial: 10,
  Chegada: 11,
  Retardataria: 12,
  RetardatariaT: 13,
  Zona: 14,
  UfAleatoria: 15,
  Codigo: 16,
  /** Desempate neutro de corridas com alvo a menos de 1 voto do empate (ex.: 50,00%). */
  Desempate: 17,
} as const;

/** Chave de um canal para uma semente. */
export function canalKey(seedK: number, canal: number): number {
  return triple32((seedK ^ triple32(canal * 0x9e3779b1 + 0x7f4a7c15)) >>> 0);
}

const INV_2_32 = 1 / 4294967296;

/**
 * Uniforme em (0, 1) para o elemento cujo hash-base é `baseHash` (ex.: triple32(índice da seção)).
 * Nunca retorna 0 nem 1.
 */
export function uni(ck: number, baseHash: number): number {
  return (triple32((baseHash ^ ck) >>> 0) + 0.5) * INV_2_32;
}

/** Normal padrão N(0, 1) determinística. */
export function nrm(ck: number, baseHash: number): number {
  return invNorm(uni(ck, baseHash));
}
