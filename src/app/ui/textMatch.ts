/** Busca insensível a acentos e caixa, com realce do trecho encontrado. */
import { normalize } from '@/shared/format';

const MARCAS = /[̀-ͯ]/g;

/** Normaliza preservando o mapeamento de índices para o texto original. */
function normComMapa(s: string): { n: string; mapa: number[] } {
  let n = '';
  const mapa: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i].normalize('NFD').replace(MARCAS, '').toLowerCase();
    for (let k = 0; k < c.length; k++) {
      n += c[k];
      mapa.push(i);
    }
  }
  return { n, mapa };
}

/** true se todas as palavras da consulta aparecem no texto (sem acento/caixa). */
export function casa(texto: string, consulta: string): boolean {
  const q = normalize(consulta);
  if (!q) return true;
  const t = normalize(texto);
  return q.split(/\s+/).every((p) => t.includes(p));
}

/** Pontuação para ordenar resultados: começa com > início de palavra > contém. -1 = não casa. */
export function pontuar(texto: string, consulta: string): number {
  const q = normalize(consulta);
  if (!q) return 0;
  const t = normalize(texto);
  if (!q.split(/\s+/).every((p) => t.includes(p))) return -1;
  if (t.startsWith(q)) return 3;
  if (t.includes(` ${q}`) || t.includes(`-${q}`)) return 2;
  return 1;
}

/** Divide o texto em partes [{t, hit}] marcando o primeiro trecho que casa com a consulta inteira. */
export function realcar(texto: string, consulta: string): { t: string; hit: boolean }[] {
  const q = normalize(consulta);
  if (!q) return [{ t: texto, hit: false }];
  const { n, mapa } = normComMapa(texto);
  const idx = n.indexOf(q);
  if (idx < 0) return [{ t: texto, hit: false }];
  const ini = mapa[idx];
  const fim = mapa[idx + q.length - 1] + 1;
  return [
    { t: texto.slice(0, ini), hit: false },
    { t: texto.slice(ini, fim), hit: true },
    { t: texto.slice(fim), hit: false },
  ].filter((p) => p.t);
}
